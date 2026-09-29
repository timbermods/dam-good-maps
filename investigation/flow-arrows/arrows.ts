import { BufferGeometry, Float32BufferAttribute, Mesh, ShaderMaterial, Matrix4, Vector2, Vector3, type Camera, type Scene } from 'three';
import { surfaceWater, type SurfaceWater } from '../../src/render3d/model';
import { settledVelocity, type FlowMap } from './flow';
import { pickHeightfield } from '../../src/render3d/pick';

export const MIN_SPEED = .04;
export const sizeFor = (speed: number) => 22 + 5 * Math.min(1, speed / 3);
export const gapFor = (speed: number) => 70 - 16 * Math.min(1, speed / 3);
export const driftFor = (speed: number) => 3 + 8 * (1 - Math.exp(-speed)); // CSS pixels/s, illustrative slow motion
const hash = (i: number) => (Math.imul(i + 1, 1597334677) ^ Math.imul(i + 19, 3812015801)) >>> 0;
type Particle = { x: number; y: number; id: number; age: number; ttl: number };

/** One draw call, with whole-glyph terrain occlusion in fits(). Glyph dimensions are CSS pixels, independent of camera zoom/DPR.
 * Open arrow = three strokes; pale 2.8 px core + 1.2 px dark edge on each side.
 * Projection rotates the glyph along the current; its anchor remains on the water surface.
 */
export class FlowArrows {
  readonly material = new ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { viewport: { value: new Vector2(1,1) }, ink: { value: new Vector3(.98,.96,.86) }, inverseProjection: { value: new Matrix4() }, cameraWorld: { value: new Matrix4() } },
    vertexShader: `
      attribute vec2 corner;
      attribute vec2 heading;
      attribute float lengthPx;
      attribute float fade;
      uniform vec2 viewport;
      uniform mat4 inverseProjection;
      uniform mat4 cameraWorld;
      varying vec2 glyph;
      varying float arrowLength;
      varying float opacity;
      void main() {
        glyph = corner * vec2(lengthPx * .5 + 3., 8.);
        arrowLength = lengthPx;
        opacity = fade;
        vec2 offset = heading * glyph.x + vec2(-heading.y, heading.x) * glyph.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
                vec2 ndc = gl_Position.xy / gl_Position.w + offset / viewport * 2.;
        vec4 near = inverseProjection * vec4(ndc,-1.,1.);
        vec4 far = inverseProjection * vec4(ndc,1.,1.);
        near = cameraWorld * (near / near.w);
        far = cameraWorld * (far / far.w);
        vec3 ray = far.xyz - near.xyz;
        vec3 onWater = near.xyz + ray * ((position.y - near.y) / ray.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(onWater,1.);
      }`,
    fragmentShader: `
      uniform vec3 ink;
      varying vec2 glyph;
      varying float arrowLength;
      varying float opacity;
      float segment(vec2 p, vec2 a, vec2 b) {
        vec2 d=b-a; return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));
      }
      void main() {
        float tip=arrowLength*.5, tail=-tip;
        float d=min(segment(glyph,vec2(tail,0.),vec2(tip,0.)),
          min(segment(glyph,vec2(tip-7.,4.5),vec2(tip,0.)),segment(glyph,vec2(tip-7.,-4.5),vec2(tip,0.))));
        float aa=max(fwidth(d),.35);
        float alpha=(1.-smoothstep(2.6-aa*.5,2.6+aa*.5,d))*opacity;
        if(alpha<.01) discard;
        float core=1.-smoothstep(1.4-aa*.5,1.4+aa*.5,d);
        gl_FragColor=vec4(mix(vec3(.06,.09,.085),ink,core),alpha);
      }`,
  });
  readonly mesh = new Mesh(new BufferGeometry(), this.material);
  private map?: FlowMap;
  private sw?: SurfaceWater;
  private velocity: Float32Array | null = null;
  private blocked = new Uint8Array(0);
  private candidates: number[] = [];
  private particles: Particle[] = [];
  private cursor = 0;
  private cameraKey = '';
  private serial = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private frame = 0;
  private last = 0;
  private dirty = true;
  private moving = false;
  private clock: number | null = null;
  stats = { count: 0, available: false, reducedMotion: false, minPixels: 0, maxPixels: 0, minGap: 0 };
  constructor(private scene: Scene, private camera: () => Camera, private canvas: HTMLCanvasElement, private render: () => void) {
    this.mesh.renderOrder = 20; this.mesh.visible = false; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.reduced.addEventListener('change', this.motionChange);
    this.frame = requestAnimationFrame(this.tick);
  }
  private motionChange = () => { this.dirty = true; };
  set enabled(value: boolean) { this.mesh.visible = value; this.dirty = true; }
  get enabled() { return this.mesh.visible; }
  setMap(map: FlowMap) {
    this.map = map; this.sw = surfaceWater(map.W,map.H,map.water);
    this.velocity = settledVelocity(map.W,map.H,map.flow);
        this.candidates = [];
    this.blocked = new Uint8Array(map.W*map.H);
    for(let k=0;k<map.entities.count;k++) {
      const x=map.entities.x[k], y=map.entities.y[k];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
        const xx=x+dx,yy=y+dy;
        if(xx>=0&&yy>=0&&xx<map.W&&yy<map.H)this.blocked[yy*map.W+xx]=1;
      }
    }
    if (this.velocity) for(let i=0;i<map.W*map.H;i++) if(!this.blocked[i] && this.speed(i)>MIN_SPEED && this.sw.depth[i]>.001) this.candidates.push(i);
        // Prefer channel interiors to keep marker anchors clearly inside the current.
    const clearance = new Float32Array(map.W*map.H);
    for(const i of this.candidates) {
      const x=i%map.W,y=Math.floor(i/map.W);let d=4;
      for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
        const xx=x+dx,yy=y+dy,j=yy*map.W+xx;
        if(xx<0||yy<0||xx>=map.W||yy>=map.H||this.sw.depth[j]<=.001) d=Math.min(d,Math.hypot(dx,dy));
      }
      clearance[i]=d;
    }
    this.candidates.sort((a,b)=>clearance[b]-clearance[a]||hash(a)-hash(b));
    this.particles=[]; this.cursor=0; this.cameraKey=''; this.dirty=true;
    this.stats.available = !!this.velocity;
  }
  setLook(high: boolean) { this.material.uniforms.ink.value.set(...(high ? [.98,.96,.86] : [.95,.98,.92]) as [number,number,number]); this.dirty=true; }
  /** Capture hook: freeze drift and seed a reproducible layout, independent of rendering speed. */
  freeze(value: number | null) { this.clock=value; this.cameraKey=''; this.dirty=true; }
  private speed(i: number) { return Math.hypot(this.velocity![i*2],this.velocity![i*2+1]); }
  private sample(x:number,y:number) {
    const m=this.map!, i=Math.floor(y)*m.W+Math.floor(x);
    if(x<0||y<0||x>=m.W||y>=m.H||!this.velocity||this.blocked[i]||this.sw!.depth[i]<=.001) return null;
    const speed=this.speed(i);
    return speed>MIN_SPEED ? { i, speed, dx:this.velocity[i*2]/speed, dy:this.velocity[i*2+1]/speed, height:this.sw!.surface[i]+.04 } : null;
  }
  private project(x:number,y:number,h:number) {
    const p=new Vector3(x,h,-y).project(this.camera());
    return { x:(p.x+1)*this.canvas.clientWidth*.5,y:(1-p.y)*this.canvas.clientHeight*.5,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1 };
  }
  private screen(p:Particle) {
    const f=this.sample(p.x,p.y); if(!f) return null;
    const a=this.project(p.x,p.y,f.height), b=this.project(p.x+f.dx,p.y+f.dy,f.height);
    const pixels=Math.hypot(b.x-a.x,b.y-a.y);
    if(!a.visible||pixels<.05) return null;
    return { ...f, ...a, pixels, ux:(b.x-a.x)/pixels, uy:(b.y-a.y)/pixels };
  }
  private fits(s: NonNullable<ReturnType<FlowArrows['screen']>>) {
    // A readable screen-space marker may exceed a distant channel's pixel width.
    // Occlude the entire marker by its water anchor, never clip its head into a dash.
    // Entity footprints are excluded by sample(); terrain occlusion uses the product picker.
    const c=this.camera(),nx=s.x/this.canvas.clientWidth*2-1,ny=1-s.y/this.canvas.clientHeight*2;
    const a=new Vector3(nx,ny,-1).unproject(c),b=new Vector3(nx,ny,1).unproject(c);
    const direction=b.clone().sub(a).normalize(),m=this.map!;
    const hit=pickHeightfield({origin:[a.x,a.y,a.z],direction:[direction.x,direction.y,direction.z]},m.W,m.H,m.heights);
    const waterDistance=(s.height-a.y)/direction.y;
    return !hit||hit.t>=waterDistance-.02;
  }
  private seed() {
    // Greedy screen-space spacing, stable hash order; count naturally increases on zoom-in.
    const points=this.particles.map(p=>this.screen(p)).filter(p=>p!==null);
    for(let tried=0;tried<this.candidates.length;tried++) {
      const i=this.candidates[this.cursor++%this.candidates.length];
      const p={ x:i%this.map!.W+.5,y:Math.floor(i/this.map!.W)+.5,id:i,age:0,ttl:7+(hash(i)%40)/10 };
      const s=this.screen(p); if(!s) continue;
      if(s.x<18||s.y<18||s.x>this.canvas.clientWidth-18||s.y>this.canvas.clientHeight-18) continue;
      if(points.some(a=>Math.hypot(a.x-s.x,a.y-s.y)<Math.max(gapFor(a.speed),gapFor(s.speed)))) continue;
      if(!this.fits(s))continue;
      p.id=this.serial++;this.particles.push(p); points.push(s);
    }
  }
  private advance(dt:number) {
    const kept:Particle[]=[];
    const points:ReturnType<FlowArrows['screen']>[]=[];
    for(const p of this.particles) {
      const s=this.screen(p); if(!s) continue;
      p.age+=dt; if(p.age>p.ttl) continue;
      // Subdivide travel: a displayed particle cannot jump a bank or a dry/falling tile.
      const distance=Math.min(.35,driftFor(s.speed)/s.pixels*dt);
      let ok=true;
      for(let d=0;d<distance;d+=.08) {
        const f=this.sample(p.x,p.y); if(!f){ok=false;break;}
        const step=Math.min(.08,distance-d), x=p.x+f.dx*step,y=p.y+f.dy*step;
        const next=this.sample(x,y);
        if(!next||Math.abs(next.height-f.height)>.35){ok=false;break;}
        p.x=x; p.y=y;
      }
      const next=this.screen(p);
      if(!ok||!next||!this.fits(next)||points.some(a=>a && Math.hypot(a.x-next.x,a.y-next.y)<42)) continue;
      kept.push(p); points.push(next);
    }
    this.particles=kept;
    this.seed();
  }
  refresh() {
    if(!this.map) return;
    const c=this.camera(); c.updateMatrixWorld();
    const key=[...c.projectionMatrix.elements,...c.matrixWorld.elements,this.canvas.clientWidth,this.canvas.clientHeight].join(',');
    if(key!==this.cameraKey) { this.cameraKey=key; this.particles=[];this.cursor=0;this.seed();this.dirty=true; }
    const positions:number[]=[], corners:number[]=[],headings:number[]=[],lengths:number[]=[],fades:number[]=[];
    const screens: {x:number;y:number;length:number}[]=[];
    const animated=!this.reduced.matches && this.clock===null;
    for(const p of this.particles) {
      const s=this.screen(p);if(!s||!this.fits(s))continue;
      const length=sizeFor(s.speed);
      // At seed time the glyph is fully readable; only retirement fades, avoiding a pulsing overview.
      const fade=animated ? Math.min(1,(p.ttl-p.age)/.55) : 1;
      for(const [x,y] of [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]]) {
        positions.push(p.x,s.height,-p.y);corners.push(x,y);headings.push(s.ux,-s.uy);lengths.push(length);fades.push(fade);
      }
      screens.push({x:s.x,y:s.y,length});
    }
    const g=new BufferGeometry();
    for(const [key,values,size] of [['position',positions,3],['corner',corners,2],['heading',headings,2],['lengthPx',lengths,1],['fade',fades,1]] as [string,number[],number][]) g.setAttribute(key,new Float32BufferAttribute(values,size));
    this.mesh.geometry.dispose();this.mesh.geometry=g;
    this.material.uniforms.viewport.value.set(this.canvas.clientWidth,this.canvas.clientHeight);
    this.material.uniforms.inverseProjection.value.copy(c.projectionMatrixInverse);
    this.material.uniforms.cameraWorld.value.copy(c.matrixWorld);
    let minGap=Infinity;
    screens.forEach((a,i)=>screens.slice(i+1).forEach(b=>{minGap=Math.min(minGap,Math.hypot(a.x-b.x,a.y-b.y));}));
    this.stats={count:screens.length,available:!!this.velocity,reducedMotion:this.reduced.matches,minPixels:screens.length?Math.min(...screens.map(s=>s.length)):0,maxPixels:screens.length?Math.max(...screens.map(s=>s.length)):0,minGap:Number.isFinite(minGap)?minGap:0};
    this.dirty=false;
  }
  private tick = (now:number) => {
    const dt=Math.min(.05,Math.max(0,(now-this.last)/1000));this.last=now;
    const moving=this.enabled && !this.reduced.matches && this.clock===null && !document.hidden;
    if(this.enabled && this.map) {
      if(moving && this.cameraKey) this.advance(dt);
      if(this.dirty||moving||moving!==this.moving) {this.refresh();this.render();}
    }
    this.moving=moving;
    this.frame=requestAnimationFrame(this.tick);
  };
  snapshot() { return this.particles.map(p=>({x:p.x,y:p.y,id:p.id})); }
  dispose() { cancelAnimationFrame(this.frame);this.reduced.removeEventListener('change',this.motionChange);this.scene.remove(this.mesh);this.mesh.geometry.dispose();this.material.dispose(); }
}
