import * as THREE from 'three';
import { smooth, type Anatomy, type Settings } from './engine';
import { lobeField } from './flows';
/** A fixed pool of soft, rolling puffs. Every puff has one birth and a continuous fade. */
export class EruptEffects {
  readonly group=new THREE.Group();
  private material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{clock:{value:0}},
    vertexShader:`attribute float puffAlpha; attribute float puffSeed; varying vec2 uvP; varying float alphaP; varying float seedP;
      void main(){uvP=uv;alphaP=puffAlpha;seedP=puffSeed;vec4 p=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);p.xy+=position.xy*length(instanceMatrix[0].xyz);gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec2 uvP;varying float alphaP;varying float seedP;uniform float clock;
      void main(){vec2 p=uvP*2.-1.;float r=length(p);float roll=sin(p.x*8.+clock*.8+seedP)*sin(p.y*7.-clock*.9+seedP*3.);float edge=1.-smoothstep(.30,.98,r+roll*.075);float light=.54+p.y*.11+roll*.035;gl_FragColor=vec4(vec3(light,light*.97,light*.94),edge*alphaP);}`});
  private geometry=new THREE.PlaneGeometry(2,2);
  private smoke=new THREE.InstancedMesh(this.geometry,this.material,128);
  private opacity=new Float32Array(128);private seeds=Float32Array.from({length:128},(_,k)=>k*1.618);
  private dummy=new THREE.Object3D();private a:Anatomy|null=null;
  private emitters:{x:number;y:number;along:number}[]=[];
  constructor(){this.geometry.setAttribute('puffAlpha',new THREE.InstancedBufferAttribute(this.opacity,1));this.geometry.setAttribute('puffSeed',new THREE.InstancedBufferAttribute(this.seeds,1));this.smoke.frustumCulled=false;this.smoke.renderOrder=5;this.group.add(this.smoke);this.group.visible=false;}
  set(a:Anatomy,heights:Uint8Array,W:number,s:Settings):Uint8Array{
    this.a=a;const H=heights.length/W,mask=new Uint8Array(W*H*4),flows=lobeField(W,H,a.lobes);this.emitters=[];
    if(a.segments.length){for(const seg of a.segments)for(let d=0;d<seg.length;d+=1.4)this.emitters.push({x:seg.a.x+(seg.b.x-seg.a.x)*d/seg.length,y:seg.a.y+(seg.b.y-seg.a.y)*d/seg.length,along:(seg.along+d)/a.length});}
    else this.emitters.push({x:a.x,y:a.y,along:0});
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x;let dist=Math.hypot(x-a.x,y-a.y),along=0;
      if(a.segments.length){dist=Infinity;for(const seg of a.segments){const dx=seg.b.x-seg.a.x,dy=seg.b.y-seg.a.y,t=Math.max(0,Math.min(1,((x-seg.a.x)*dx+(y-seg.a.y)*dy)/(seg.length*seg.length))),d=Math.hypot(x-seg.a.x-dx*t,y-seg.a.y-dy*t);if(d<dist){dist=d;along=(seg.along+t*seg.length)/a.length;}}}
      const r=dist/a.radius;
      const vent=a.segments.length?1-smooth(dist/2.1):1-smooth(r/.22);
      const hot=Math.max(vent,s.ridges?Math.min(1,flows[i]/1.7):Math.max(0,1-r)*.14);
      mask.set([Math.round(255*hot),Math.round(110*(1-smooth(r/1.1))),Math.round(255*(1-smooth(r/2.1))),Math.round(255*(a.segments.length?along:Math.min(1,r/1.8)))],i*4);
    }
    return mask;
  }
  update(t:number,on:boolean,cooling=0,surface?:(x:number,y:number)=>number){
    const a=this.a;this.group.visible=on&&!!a&&t>=0&&cooling<6.5;if(!this.group.visible||!a)return;
    this.material.uniforms.clock.value=t;const d=this.dummy;
    for(let k=0;k<128;k++){
      const e=this.emitters[k%this.emitters.length],birth=(k/128)*2.7+e.along*.75,age=t-birth,life=4.2+(k%11)*.15;
      const live=age>0&&age<life,fade=live?smooth(age/.48)*(1-smooth((age-life*.48)/(life*.52))):0;
      const u=Math.max(0,age),theta=k*2.399,spread=(.35+u*.62)*(1+a.radius*.017),wind=u*u*.23;
      const base=surface?.(e.x,e.y)??a.datum;
      d.position.set(e.x+.5+Math.cos(theta+u*.65)*spread+wind,base+.6+u*5.4+Math.sin(u*2+k)*.65,-e.y-.5+Math.sin(theta+u*.5)*spread+wind*.35);
      d.scale.setScalar((.65+u*1.05)*(1+a.radius*.018));d.updateMatrix();this.smoke.setMatrixAt(k,d.matrix);this.opacity[k]=fade*(a.segments.length?.45:.28)*(1-smooth(cooling/6.5));
    }
    this.geometry.attributes.puffAlpha.needsUpdate=true;this.smoke.instanceMatrix.needsUpdate=true;
  }
}
