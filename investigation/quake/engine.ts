import { JsonFloat } from '../../src/core/format/json';
import type { EntitySpec } from '../../src/core/format/entities';
import { FOOTPRINTS } from '../../src/core/format/footprints';
import { waterModel, objectTile } from '../../src/core/sim/model';
import type { WaterState } from '../../src/core/sim/water';

export interface Fallen {id:string;x:number;y:number;z:number;dx:number;dy:number;length:number}
export interface QuakeMap {name:string;W:number;H:number;heights:Uint8Array;entities:EntitySpec[];water:WaterState;maxHeight:number;rockLayers:number[];fallen:Fallen[]}
export interface Point {x:number;y:number}
export interface Intent {path:Point[];side:1|-1}
export interface Settings {mode:'lift'|'slide';power:number;scarp:'sheer'|'stepped';seed:number}
export const DEFAULTS:Settings={mode:'lift',power:60,scarp:'sheer',seed:1};
/** Whole-tile travel of the selected block; short strokes retain full Power. */
export const slideTiles=(power:number)=>3+Math.round(power*.17);
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const smooth=(v:number)=>{v=clamp(v,0,1);return v*v*(3-2*v);};
export const plainEntities=(e:EntitySpec[]):EntitySpec[]=>JSON.parse(JSON.stringify(e,(_k,v)=>v instanceof JsonFloat?v.value:v));
export const modelFor=(m:QuakeMap)=>waterModel(m.W,m.H,m.heights,m.entities.map(e=>({...e,components:{...e.before,...e.components}})));
export function geology(h:Uint8Array):number[]{let s=2166136261;for(const v of h)s=Math.imul(s^v,16777619);return Array.from({length:23},(_,z)=>(z+(s>>>0)%4)%4===0?1:0);}
export function hash(seed:number,k:number):number{let x=Math.imul((seed^Math.imul(k+1,0x9e3779b9))>>>0,0x85ebca6b);x^=x>>>13;return (Math.imul(x,0xc2b2ae35)>>>0)/4294967296;}
export function snapshot(m:QuakeMap):QuakeMap{return {...m,heights:m.heights.slice(),entities:structuredClone(m.entities),rockLayers:m.rockLayers.slice(),fallen:structuredClone(m.fallen),water:{depth:m.water.depth.slice(),contamination:m.water.contamination.slice()}};}
export function validateObjects(m:QuakeMap):void{
  const ids=new Set<string>();
  for(const e of m.entities){
    if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.template!=='string'||typeof e.owner!=='string'||
      !Number.isInteger(e.x)||!Number.isInteger(e.y)||!Number.isInteger(e.z)||e.x<0||e.y<0||e.x>=m.W||e.y>=m.H||e.z<0||e.z>22||
      !['Cw0','Cw90','Cw180','Cw270'].includes(e.orientation)||typeof e.flipped!=='boolean'||!e.components||typeof e.components!=='object'||Array.isArray(e.components))throw Error('Invalid saved object');
    ids.add(e.id);const fp=FOOTPRINTS[e.template]?.size??[1,1,1];if(entityTiles(m,e).length!==fp[0]*fp[1])throw Error('Object crosses the map edge');
  }
  for(const f of m.fallen)if(!f||!ids.has(f.id)||![f.x,f.y,f.z,f.dx,f.dy,f.length].every(Number.isFinite)||f.x<0||f.x>m.W||f.y<0||f.y>m.H||f.length<=0||f.length>10)throw Error('Invalid fallen object');
}
export function entityTiles(m:Pick<QuakeMap,'W'|'H'>,e:EntitySpec,margin=0):number[]{
  const fp=FOOTPRINTS[e.template]?.size??[1,1,1],out:number[]=[];
  for(let y=-margin;y<fp[1]+margin;y++)for(let x=-margin;x<fp[0]+margin;x++){const [xx,yy]=objectTile(e,x,y);if(xx>=0&&yy>=0&&xx<m.W&&yy<m.H)out.push(yy*m.W+xx);}return out;
}
export function protectedGround(m:QuakeMap):Uint8Array{const out=new Uint8Array(m.W*m.H);for(const e of m.entities)if(e.template==='StartingLocation')for(const i of entityTiles(m,e,1))out[i]=1;return out;}
export function startProblem(m:QuakeMap):string|null{
  for(const e of m.entities)if(e.template==='StartingLocation'){
    const tiles=entityTiles(m,e),fp=FOOTPRINTS[e.template]?.size??[3,3,1];
    if(tiles.length!==fp[0]*fp[1]||tiles.some(i=>m.heights[i]!==e.z))return 'Start needs flat ground';
    if(tiles.some(i=>m.water.depth[i]>.05))return 'Water would cover the start';
  }return null;
}
export function validateSettings(s:Settings,m:QuakeMap,i:Intent){
  if(!['lift','slide'].includes(s.mode)||!['sheer','stepped'].includes(s.scarp)||!Number.isFinite(s.power)||s.power<0||s.power>100||!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff)throw Error('Invalid quake settings');
  if(!i||![1,-1].includes(i.side)||!Array.isArray(i.path)||i.path.length<2||i.path.length>512||i.path.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>m.W-1||p.y>m.H-1))throw Error('Draw a fault on the land');
}
export interface Segment {a:Point;b:Point;dx:number;dy:number;length:number;along:number}
export class Fault {
  readonly points:Point[]=[];readonly segments:Segment[]=[];length=0;readonly reach:number;readonly lift:number;readonly slide:number;
  readonly heading:Point;
  constructor(readonly settings:Settings,readonly intent:Intent){
    this.reach=14+settings.power*.50;this.lift=1+Math.round(settings.power*.075);this.slide=slideTiles(settings.power);
    // Resample by arc length. Coherent seed noise has a wavelength, never per-tile static.
    const raw:Segment[]=[];let length=0;
    for(let k=1;k<intent.path.length;k++){const a=intent.path[k-1],b=intent.path[k],l=Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2);if(l<.01)continue;raw.push({a,b,dx:(b.x-a.x)/l,dy:(b.y-a.y)/l,length:l,along:length});length+=l;}
    // A tap or sub-tile stroke is a small tear too. The old three-tile guard
    // threw inside pointermove and silently stranded ordinary short drags.
    if(length<.001){const a=intent.path[0],b={x:a.x+(a.x>.25?-.25:.25),y:a.y};raw.push({a,b,dx:b.x>a.x?1:-1,dy:0,length:.25,along:0});length=.25;}
    // One block has one heading. Seeded crack roughness must not shear a ridge
    // into unrelated tile motions. A closed stroke uses its longest chord.
    const first=raw[0].a;let end=raw.at(-1)!.b;
    if(Math.hypot(end.x-first.x,end.y-first.y)<.1)end=raw.reduce((best,s)=>Math.hypot(s.b.x-first.x,s.b.y-first.y)>Math.hypot(best.x-first.x,best.y-first.y)?s.b:best,end);
    const span=Math.hypot(end.x-first.x,end.y-first.y)||1;this.heading={x:(end.x-first.x)/span,y:(end.y-first.y)/span};
    const wavelength=7+hash(settings.seed,9)*14,rough=.35+hash(settings.seed,11)*1.3;
    for(let d=0;d<length+4;d+=4){const t=Math.min(d,length),r=raw.find(s=>t<=s.along+s.length)??raw[raw.length-1],f=t-r.along;
      const n=t/wavelength,k=Math.floor(n),a=hash(settings.seed,k+100)*2-1,b=hash(settings.seed,k+101)*2-1;
      const offset=(a+(b-a)*smooth(n-k))*rough*smooth(t/5)*smooth((length-t)/5);
      this.points.push({x:r.a.x+r.dx*f-r.dy*offset,y:r.a.y+r.dy*f+r.dx*offset});if(t===length)break;
    }
    for(let k=1;k<this.points.length;k++){const a=this.points[k-1],b=this.points[k],l=Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2);this.segments.push({a,b,dx:(b.x-a.x)/l,dy:(b.y-a.y)/l,length:l,along:this.length});this.length+=l;}
  }
  at(x:number,y:number){
    let best=Infinity,result={d:0,along:0,dx:1,dy:0,end:0};
    for(const s of this.segments){const rx=x-s.a.x,ry=y-s.a.y,t=rx*s.dx+ry*s.dy,u=clamp(t,0,s.length),ex=rx-s.dx*u,ey=ry-s.dy*u,d2=ex*ex+ey*ey;
      if(d2<best){best=d2;result={d:(s.dx*ry-s.dy*rx)*this.intent.side,along:s.along+u,dx:s.dx,dy:s.dy,end:Math.abs(t-u)};}}
    return result;
  }
  movement(x:number,y:number){
    const f=this.at(x,y),s=this.settings,side=f.d>=0?1:-1,dist=Math.abs(f.d);
    if(s.mode==='slide'){
      // A short stroke still grabs a block, including room behind its ends for
      // the entire translation. Fade only the outside of that block, never its
      // advertised travel. The opposite bank stays on its original course.
      const reach=Math.max(this.reach,this.length*1.3,this.slide+12);
      const envelope=(1-smooth((dist-reach)/12))*(1-smooth((f.end-this.slide-8)/12));
      // Stepped splits the perimeter into benches; even a bank narrower than
      // three tiles gets the full offset at the fault itself.
      const weight=s.scarp==='stepped'?Math.ceil(envelope*3)/3:envelope;
      const amount=(f.d>=-.01?this.slide:0)*weight;
      const direction=this.heading;
      let dx=Math.round(direction.x*amount),dy=Math.round(direction.y*amount);
      // Rounding a diagonal must not silently subtract a tile from Power.
      if(amount===this.slide&&Math.hypot(dx,dy)<this.slide){
        if(Math.abs(direction.x)>=Math.abs(direction.y))dx+=Math.sign(direction.x);else dy+=Math.sign(direction.y);
      }
      return {...f,dz:0,dx,dy};
    }
    // The block continues to the map edge for a map-spanning stroke. Fading a long
    // lifted block back down nearby makes an artificial upstream dam, not a scarp.
    const blockReach=Math.max(this.reach,this.length*1.3);
    const envelope=(1-smooth((dist-blockReach*.8)/(blockReach*.2)))*(1-smooth(f.end/Math.max(8,this.reach*.6)));
    const step=s.scarp==='stepped'?Math.min(1,(Math.floor(dist/3)+1)/3):1;
    const tilt=(hash(s.seed,6)*2-1)*(f.along/this.length-.5)*2.4+(hash(s.seed,7)*2-1)*clamp(dist/this.reach,0,1)*1.4;
    let dz=Math.round((side>0?this.lift+tilt:-this.lift*.55)*envelope*step);
    // Short secondary faults and sag pockets share the main fault's smooth, seeded stations.
    const branch=Math.floor(f.along/22),u=f.along/22-branch;
    if(dist<2.2&&u>.30&&u<.62&&hash(s.seed,branch+200)>.48)dz-=1;
    if(side<0&&dist>3&&dist<8&&u>.38&&u<.58&&hash(s.seed,branch+230)>.65)dz-=1;
    return {...f,dz,dx:0,dy:0};
  }
}
/** Shared by the cursor and worker: the quiet refusal includes room for seeded bends. */
export function strokeReason(points:Point[],keep:Uint8Array,W:number):string|null{
  for(let i=0;i<keep.length;i++)if(keep[i]){
    const x=i%W,y=Math.floor(i/W);
    for(let k=0;k<Math.max(1,points.length-1);k++){
      const a=points[k],b=points[k+1]??a;if(!a)continue;
      const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
      if((x-a.x-t*dx)**2+(y-a.y-t*dy)**2<3.5**2)return 'Start here';
    }
  }return null;
}
export function faultReason(m:QuakeMap,intent:Intent):string|null{
  return strokeReason(intent.path,protectedGround(m),m.W);
}
export class QuakePlan {
  readonly map:QuakeMap;readonly fault:Fault;readonly arrival:Float32Array;readonly dx:Int16Array;readonly dy:Int16Array;
  /** Destination -> actual original ground tile, shared by transport and view. */
  readonly source:Uint32Array;
  readonly stats={changed:0,raised:0,dropped:0,moved:0,toppled:0,channel:0,transported:0,fullOffset:0};private row=0;private done=false;
  constructor(readonly before:QuakeMap,readonly settings:Settings,readonly intent:Intent){
    validateSettings(settings,before,intent);this.fault=new Fault(settings,intent);const reason=faultReason(before,intent);if(reason)throw Error(reason);
    this.map=snapshot(before);this.arrival=new Float32Array(before.W*before.H);this.dx=new Int16Array(this.arrival.length);this.dy=new Int16Array(this.arrival.length);
    this.source=Uint32Array.from(this.arrival,(_,i)=>i);
  }
  advance(rows=4):boolean{
    if(this.done)return true;const {W,H}=this.map,end=Math.min(H,this.row+rows);
    for(let y=this.row;y<end;y++)for(let x=0;x<W;x++){
      const i=y*W+x,f=this.fault.movement(x,y);this.arrival[i]=clamp(f.along/this.fault.length*.82+Math.abs(f.d)/this.fault.reach*.12,0,.94);
      this.dx[i]=f.dx;this.dy[i]=f.dy;
      // Continuation fills any opening. Exact forward transport below owns the
      // moving block; an iterative inverse can oscillate across its boundary.
      const src=clamp(y-f.dy,0,H-1)*W+clamp(x-f.dx,0,W-1);this.source[i]=src;
      this.map.heights[i]=clamp(this.before.heights[src]+f.dz,0,Math.min(22,this.map.maxHeight));
    }
    this.row=end;if(end<H)return false;
    if(this.settings.mode==='slide'){this.transport();this.connectRivers();}
    else this.ensureTear();
    this.moveObjects();
    if(this.settings.mode==='slide')for(let j=0;j<W*H;j++){
      const i=this.source[j],distance=Math.hypot(j%W-i%W,Math.floor(j/W)-Math.floor(i/W));
      if(distance>0&&this.map.heights[j]===this.before.heights[i])this.stats.transported++;
      if(distance>=this.fault.slide&&this.map.heights[j]===this.before.heights[i])this.stats.fullOffset++;
    }
    this.map.heights.forEach((h,i)=>{const d=h-this.before.heights[i];if(d)this.stats.changed++;this.stats.raised+=Math.max(0,d);this.stats.dropped+=Math.max(0,-d);});this.done=true;return true;
  }
  private transport(){
    const {W,H}=this.map,priority=new Float32Array(W*H).fill(-1);
    // Deterministic scatter: the most displaced ground owns overlaps at a
    // bend. Core cells beat stationary ground and the feathered perimeter.
    for(let i=0;i<W*H;i++){
      const x=i%W+this.dx[i],y=Math.floor(i/W)+this.dy[i];if(x<0||y<0||x>=W||y>=H)continue;
      const j=y*W+x,travel=Math.hypot(this.dx[i],this.dy[i]);
      if(travel<priority[j])continue;
      priority[j]=travel;this.source[j]=i;this.map.heights[j]=this.before.heights[i];this.arrival[j]=this.arrival[i];
    }
  }
  private connectRivers(){
    const {W,H}=this.map,band=this.settings.scarp==='stepped'?10:2.5;
    // Find wet crossings in the ORIGINAL river. Join its two transported mouths
    // with a dog-leg along the fault; merely advecting water leaves a bank dam.
    // Sweep the whole wet cross-section, preserving its bed and source strength.
    for(let i=0;i<W*H;i++)if(this.before.water.depth[i]>.04){
      const x=i%W,y=Math.floor(i/W),f=this.fault.at(x,y);
      if(Math.abs(f.d)>1.25||f.end>1)continue;
      const nx=-f.dy,ny=f.dx,d=f.d*this.intent.side,c={x:x-nx*d,y:y-ny*d};
      const a={x:c.x+nx*band,y:c.y+ny*band},b={x:c.x-nx*band,y:c.y-ny*band};
      const da=this.fault.movement(a.x,a.y),db=this.fault.movement(b.x,b.y);
      const path=[{x:a.x+da.dx,y:a.y+da.dy},{x:c.x+da.dx,y:c.y+da.dy},
        {x:c.x+db.dx,y:c.y+db.dy},{x:b.x+db.dx,y:b.y+db.dy}];
      const bed=this.before.heights[i];
      for(let k=1;k<path.length;k++){
        const a=path[k-1],b=path[k],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*2));
        for(let t=0;t<=n;t++){
          const px=a.x+(b.x-a.x)*t/n,py=a.y+(b.y-a.y)*t/n;
          for(let yy=Math.floor(py-1);yy<=Math.ceil(py+1);yy++)for(let xx=Math.floor(px-1);xx<=Math.ceil(px+1);xx++){
            if(xx<0||yy<0||xx>=W||yy>=H||(xx-px)**2+(yy-py)**2>1.4)continue;
            const j=yy*W+xx;if(this.map.heights[j]>bed){this.map.heights[j]=bed;this.stats.channel++;}
            // The connector opens with its crossing, not a later dry front.
            this.arrival[j]=Math.min(this.arrival[j],this.arrival[i]);
          }
        }
      }
    }
  }
  private ensureTear(){
    if(this.map.heights.some((h,i)=>h!==this.before.heights[i]))return;
    // Sliding a featureless plain (or lifting already capped ground) must still
    // leave a visible tear. This small whole-level scarp never changes a start.
    const keep=protectedGround(this.before),cap=Math.min(22,this.map.maxHeight);
    for(const p of this.fault.points)for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++){
      const x=clamp(Math.round(p.x)+xx,0,this.map.W-1),y=clamp(Math.round(p.y)+yy,0,this.map.H-1),i=y*this.map.W+x;
      if(keep[i])continue;const f=this.fault.at(x,y),h=this.before.heights[i];
      this.map.heights[i]=h===0?1:h===cap?h-1:clamp(h+(f.d>=0?1:-1),0,cap);
    }
  }
  private moveObjects(){
    const {W,H}=this.map,occupied=new Uint8Array(W*H);
    const staysInside=(e:typeof this.map.entities[number])=>{const f=this.fault.movement(e.x,e.y),moved={...e,x:e.x+f.dx,y:e.y+f.dy},fp=FOOTPRINTS[e.template]?.size??[1,1,1];return entityTiles(this.map,moved).length===fp[0]*fp[1];};
    const inside=this.settings.mode==='slide'?new Map(this.map.entities.map(e=>[e.id,Number(staysInside(e))])):new Map<string,number>();
    // Place intact interior blocks before the edge continuation. Clamped edge
    // trees must not dislodge a ruin that has room for its full translation.
    const all=[...this.map.entities].sort((a,b)=>Number(b.template==='StartingLocation')-Number(a.template==='StartingLocation')||
      ((inside.get(b.id)??0)-(inside.get(a.id)??0)));
    const fallen=new Map(this.map.fallen.map(f=>[f.id,f]));
    for(const e of all){
      const old={...e},f=this.fault.movement(e.x,e.y),fp=FOOTPRINTS[e.template]?.size??[1,1,1];
      const corners=[objectTile(e,0,0),objectTile(e,fp[0]-1,0),objectTile(e,0,fp[1]-1),objectTile(e,fp[0]-1,fp[1]-1)];
      const xs=corners.map(p=>p[0]-e.x),ys=corners.map(p=>p[1]-e.y);
      const margin=e.template==='StartingLocation'?1:0;
      const px=clamp(e.x+f.dx,margin-Math.min(...xs),W-1-margin-Math.max(...xs)),py=clamp(e.y+f.dy,margin-Math.min(...ys),H-1-margin-Math.max(...ys));
      e.x=px;e.y=py;
      if(f.dx||f.dy||this.settings.mode==='slide'&&entityTiles(this.map,e,margin).some(i=>occupied[i])){let found=false;
        for(let radius=0;radius<=Math.max(W,H)&&!found;radius++)for(let yy=-radius;yy<=radius&&!found;yy++)for(let xx=-radius;xx<=radius&&!found;xx++){
          if(radius&&Math.abs(xx)!==radius&&Math.abs(yy)!==radius)continue;
          e.x=px+xx;e.y=py+yy;const tiles=entityTiles(this.map,e,margin);
          if(tiles.length===(fp[0]+margin*2)*(fp[1]+margin*2)&&tiles.every(i=>!occupied[i]))found=true;
        }
        if(!found)throw Error('No room for objects to move');
      }
      const changed=e.x!==old.x||e.y!==old.y||this.map.heights[e.y*W+e.x]!==this.before.heights[old.y*W+old.x];
      if(changed){e.z=clamp(old.z+this.map.heights[e.y*W+e.x]-this.before.heights[old.y*W+old.x],0,22);delete e.raw;this.stats.moved++;}
      const support=entityTiles(this.map,e,margin);for(const i of support)occupied[i]=1;
      // Rigid footprints ride whole, including the start's entrance and a one-tile apron.
      if(fp[0]*fp[1]>1&&(changed||support.some(i=>this.map.heights[i]!==e.z))){
        const arrival=this.arrival[old.y*W+old.x];
        for(const i of entityTiles(this.map,old,margin))this.arrival[i]=arrival;
        for(const i of support){this.map.heights[i]=e.z;this.arrival[i]=arrival;}
      }
      if(/^(Pine|Birch|Oak|Succulent)$/.test(e.template)&&Math.abs(f.d)<1.9&&f.end<2){
        e.components={...e.components,LivingNaturalResource:{IsDead:true}};delete e.raw;
        fallen.set(e.id,{id:e.id,x:e.x+.5,y:e.y+.5,z:e.z,dx:-f.dy||.7,dy:f.dx||.7,length:e.template==='Oak'?2.6:2});this.stats.toppled++;
      }else if(fallen.has(e.id)){const t=fallen.get(e.id)!;fallen.set(e.id,{...t,x:e.x+.5,y:e.y+.5,z:e.z});}
    }
    this.map.fallen=[...fallen.values()];
  }
}
export function quake(m:QuakeMap,s:Settings,i:Intent){const p=new QuakePlan(m,s,i);while(!p.advance(8)){}return p;}
/** Move the warm water between successive brush plans without duplicating a
 * volume, including when X reverses the chosen side. Shared with captures. */
export function paintWater(old:QuakeMap,p:QuakePlan,offset:QuakePlan|null):WaterState{
 const {W,H}=old,D=new Float64Array(W*H),C=new Float64Array(D.length);
 for(let i=0;i<D.length;i++){
  const x=i%W,y=Math.floor(i/W),origin=offset&&p.settings.mode==='slide'?offset.source[i]:i;
  const bx=origin%W,by=Math.floor(origin/W);
  const b=clamp(Math.round(by),0,H-1)*W+clamp(Math.round(bx),0,W-1);
  const j=p.settings.mode==='slide'?clamp(Math.round(by)+p.dy[b],0,H-1)*W+clamp(Math.round(bx)+p.dx[b],0,W-1):i;
  D[j]+=old.water.depth[i];C[j]+=old.water.depth[i]*old.water.contamination[i];
 }
 return {depth:D,contamination:Float64Array.from(C,(v,i)=>D[i]?v/D[i]:0)};
}
/** Eight deterministic fronts. Timing and render frame rate never enter the output. */
export function reveal(plan:QuakePlan,previous:QuakeMap,step:number,steps=8):QuakeMap{
  const out=snapshot(previous),progress=step/steps,{W,H}=out;
  for(let i=0;i<out.heights.length;i++)if(plan.arrival[i]<=progress){out.heights[i]=plan.map.heights[i];}
  out.entities=plan.before.entities.map((e,k)=>{const t=e.y*W+e.x;return structuredClone(plan.arrival[t]<=progress?plan.map.entities[k]:e);});
  out.fallen=plan.map.fallen.filter(f=>out.entities.some(e=>e.id===f.id&&plan.arrival[(plan.before.entities.find(o=>o.id===e.id)!.y)*W+plan.before.entities.find(o=>o.id===e.id)!.x]<=progress));
  if(plan.settings.mode==='slide'){
    // Forward transport water on newly moving cells; sum collisions, conserve volume and mixture.
    const next=new Float64Array(W*H),bad=new Float64Array(W*H);
    for(let i=0;i<next.length;i++){
      const newly=plan.arrival[i]<=progress&&plan.arrival[i]>(step-1)/steps;
      const x=i%W,y=Math.floor(i/W),j=newly?clamp(y+plan.dy[i],0,H-1)*W+clamp(x+plan.dx[i],0,W-1):i;
      next[j]+=previous.water.depth[i];bad[j]+=previous.water.depth[i]*previous.water.contamination[i];
    }
    out.water={depth:next,contamination:Float64Array.from(bad,(v,i)=>next[i]?v/next[i]:0)};
  }
  return out;
}
