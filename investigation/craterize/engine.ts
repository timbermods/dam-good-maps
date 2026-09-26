import { JsonFloat } from '../../src/core/format/json';
import type { EntitySpec } from '../../src/core/format/entities';
import { FOOTPRINTS } from '../../src/core/format/footprints';
import { waterModel, objectTile, EMITTERS } from '../../src/core/sim/model';
import { WaterSim, SettleRun, type WaterState } from '../../src/core/sim/water';

export interface Fallen { id:string; x:number; y:number; z:number; dx:number; dy:number; length:number }
export interface CraterMap {
  name:string; W:number; H:number; heights:Uint8Array; entities:EntitySpec[];
  water:WaterState; maxHeight:number; rockLayers:number[]; fallen:Fallen[];
}
export interface Settings {
  mode:'strike'|'aim'; power:number; size:number|null; walls:'steep'|'terraced';
  centre:'auto'|'bowl'|'peak'|'ring'|'flat'; debris:'light'|'heavy'; rays:boolean; seed:number;
}
export interface Intent { origin:number; end?:number }
export const DEFAULTS:Settings={mode:'strike',power:55,size:null,walls:'terraced',centre:'auto',debris:'heavy',rays:false,seed:0};
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const smooth=(v:number)=>{v=clamp(v,0,1);return v*v*(3-2*v);};
export const plainEntities=(e:EntitySpec[]):EntitySpec[]=>JSON.parse(JSON.stringify(e,(_k,v)=>v instanceof JsonFloat?v.value:v));
export const modelFor=(m:CraterMap)=>waterModel(m.W,m.H,m.heights,m.entities.map(e=>({...e,components:{...e.before,...e.components}})));
export const naturalSize=(power:number)=>Math.round(6+112*(power/100)**1.4);
export const autoCentre=(diameter:number):Settings['centre']=>diameter<28?'bowl':diameter<68?'peak':'ring';
// Carve's horizontal hard bed, frozen when the map is loaded (never per personality).
export function geology(h:Uint8Array):number[] {
  let seed=2166136261;for(const v of h)seed=Math.imul(seed^v,16777619);
  return Array.from({length:23},(_,z)=>(z+(seed>>>0)%4)%4===0?1:0);
}
export function hash(seed:number,k:number):number {
  let x=Math.imul((seed^Math.imul(k+1,0x9e3779b9))>>>0,0x85ebca6b);x^=x>>>13;
  return (Math.imul(x,0xc2b2ae35)>>>0)/4294967296;
}
export function snapshot(m:CraterMap):CraterMap {
  return {...m,heights:m.heights.slice(),entities:structuredClone(m.entities),rockLayers:m.rockLayers.slice(),fallen:structuredClone(m.fallen),
    water:{depth:m.water.depth.slice(),contamination:m.water.contamination.slice()}};
}
export function entityTiles(m:CraterMap,e:EntitySpec):number[] {
  const size=FOOTPRINTS[e.template]?.size??[1,1,1],out:number[]=[];
  for(let y=0;y<size[1];y++)for(let x=0;x<size[0];x++){
    const [xx,yy]=objectTile(e,x,y);if(xx>=0&&yy>=0&&xx<m.W&&yy<m.H)out.push(yy*m.W+xx);
  }return out;
}
export function protectedGround(m:CraterMap):Uint8Array {
  const mask=new Uint8Array(m.heights.length);
  for(const e of m.entities)if(e.template==='StartingLocation')for(const i of entityTiles(m,e)){
    for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
      const xx=i%m.W+x,yy=Math.floor(i/m.W)+y;if(xx>=0&&yy>=0&&xx<m.W&&yy<m.H)mask[yy*m.W+xx]=1;
    }
  }return mask;
}
export function validateSettings(s:Settings,m:CraterMap,i:Intent) {
  if(!['strike','aim'].includes(s.mode)||!['steep','terraced'].includes(s.walls)||!['auto','bowl','peak','ring','flat'].includes(s.centre)||
     !['light','heavy'].includes(s.debris)||typeof s.rays!=='boolean'||!Number.isFinite(s.power)||s.power<0||s.power>100||
     !Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff||(s.size!==null&&(!Number.isFinite(s.size)||s.size<4||s.size>180)))throw Error('Invalid impact settings');
  if(!Number.isInteger(i.origin)||i.origin<0||i.origin>=m.W*m.H)throw Error('Strike on the map');
  if(s.mode==='aim'&&(!Number.isInteger(i.end)||i.end!<0||i.end!>=m.W*m.H))throw Error('Drag across the map to aim');
}
export interface Ray {
  dx:number;dy:number;start:number;length:number;width:number;bend:number;phase:number;seed:number;
  pits:{x:number;y:number;r:number}[];
}
// Low-frequency bends keep the streak radial overall without drawing a straight fence.
function rayBend(ray:Ray,t:number):number {
  return ray.bend*(Math.sin(t*Math.PI*1.6+ray.phase)-Math.sin(ray.phase))+
    ray.width*.3*Math.sin(t*Math.PI*4+ray.phase)*Math.sin(t*Math.PI);
}
function rayWidth(ray:Ray,t:number):number {
  return ray.width*(.65+.45*Math.sin(Math.PI*Math.min(1,t*1.6)))*(1-t)**.65*
    (.8+.2*Math.sin(t*19+ray.phase));
}
export interface Anatomy {
  x:number;y:number;W:number;H:number;edgeInset:number;radius:number;a:number;b:number;angle:number;glance:number;diameter:number;
  depth:number;rim:number;datum:number;floor:number;centre:Settings['centre'];rays:Ray[];
}
export function anatomy(m:CraterMap,s:Settings,intent:Intent):Anatomy {
  validateSettings(s,m,intent);
  const x=intent.origin%m.W,y=Math.floor(intent.origin/m.W),diameter=s.size??naturalSize(s.power),radius=diameter/2;
  const ex=s.mode==='aim'?intent.end!%m.W:x,ey=s.mode==='aim'?Math.floor(intent.end!/m.W):y;
  const angle=Math.atan2(ey-y,ex-x),glance=clamp(Math.hypot(ex-x,ey-y)/Math.max(12,diameter),0,1);
  const a=radius*(1+.65*glance),b=radius/(1+.18*glance);
  const depth=clamp((1+12*s.power/100)*Math.sqrt(naturalSize(s.power)/diameter)*(1-.28*glance),1,20);
  const rim=clamp(1+depth*.23,1,5),samples:number[]=[];
  for(let k=0;k<48;k++){
    const t=k*Math.PI/24,u=Math.cos(t)*a,v=Math.sin(t)*b;
    const xx=Math.round(x+u*Math.cos(angle)-v*Math.sin(angle)),yy=Math.round(y+u*Math.sin(angle)+v*Math.cos(angle));
    if(xx>=0&&yy>=0&&xx<m.W&&yy<m.H)samples.push(m.heights[yy*m.W+xx]);
  }
  samples.sort((a,b)=>a-b);
  const datum=samples.length?samples[Math.floor(samples.length/2)]:m.heights[intent.origin],floor=Math.max(0,datum-depth);
  const rays:Ray[]=[],heavy=s.debris==='heavy',edgeInset=diameter<Math.min(m.W,m.H)*.65?Math.max(8,Math.min(m.W,m.H)*.0625):0;
  if(s.rays)for(let k=0;k<10;k++){
    const t=angle+(k/10*Math.PI*2)+(hash(s.seed,k)-.5)*.18;
    const down=(1+Math.cos(t-angle))*.5;
    const dx=Math.cos(t),dy=Math.sin(t),baseWidth=1.7+radius*.11,width=baseWidth*(heavy?1.65:1);
    const start=1.12/Math.hypot(Math.cos(t-angle)/a,Math.sin(t-angle)/b);
    let length=start+radius*(1.15+hash(s.seed,k+30)*1.3)*(1+glance*down*.5);
    // Leave breathing room at the map boundary, except for map-scale impacts.
    if(edgeInset){
      const margin=heavy?edgeInset:Math.max(8,Math.min(m.W,m.H)*.08)+width*2;
      const edge=Math.min(dx>0?(m.W-1-margin-x)/dx:dx<0?(margin-x)/dx:Infinity,
        dy>0?(m.H-1-margin-y)/dy:dy<0?(margin-y)/dy:Infinity);
      length=Math.min(length,edge);
    }
    if(length<start+4)continue;
    const ray:Ray={dx,dy,start,length,width,bend:baseWidth*(.5+hash(s.seed,k+60))*(heavy?.8:1),phase:hash(s.seed,k+90)*Math.PI*2,seed:s.seed+k*101,pits:[]};
    for(let d=start+3,j=0;d<length*.94;j++){
      const f=(d-start)/(length-start),offset=rayBend(ray,f)+(hash(ray.seed,j+200)-.5)*rayWidth(ray,f)*1.6;
      ray.pits.push({x:x+dx*d-dy*offset,y:y+dy*d+dx*offset,r:(.8+hash(ray.seed,j+300)*1.1)*(heavy?1.55:1)*(1-f*.45)});
      d+=Math.max(4,radius*(heavy?.12:.15))*(1+hash(ray.seed,j+400));
    }rays.push(ray);
  }
  return {x,y,W:m.W,H:m.H,edgeInset,radius,a,b,angle,glance,diameter,depth,rim,datum,floor,centre:s.centre==='auto'?autoCentre(diameter):s.centre,rays};
}
export interface Field {r:number;theta:number;down:number;ray:boolean;rayHeight:number;secondary:number}
export function field(a:Anatomy,s:Settings,x:number,y:number):Field {
  const dx=x-a.x,dy=y-a.y,c=Math.cos(a.angle),sn=Math.sin(a.angle),u=(dx*c+dy*sn)/a.a,v=(-dx*sn+dy*c)/a.b;
  const theta=Math.atan2(v,u),phase=hash(s.seed,71)*Math.PI*2;
  const edge=1+.035*Math.sin(theta*3+phase)+.022*Math.sin(theta*5-phase*.6);
  const r=Math.hypot(u,v)/edge,down=(1+Math.cos(theta))*.5;
  const heavy=s.debris==='heavy',edgeFade=heavy&&a.edgeInset?smooth((Math.min(x,y,a.W-1-x,a.H-1-y)-a.edgeInset)/12):1;
  let rayHeight=0,secondary=0;
  if(s.rays&&r>1.15)for(const rayInfo of a.rays){
    const along=dx*rayInfo.dx+dy*rayInfo.dy,cross=-dx*rayInfo.dy+dy*rayInfo.dx;
    if(along<rayInfo.start||along>=rayInfo.length||Math.abs(cross)>rayInfo.width*4)continue;
    const t=(along-rayInfo.start)/(rayInfo.length-rayInfo.start),offset=cross-rayBend(rayInfo,t),width=rayWidth(rayInfo,t);
    if(Math.abs(offset)<width){
      // Uneven lobes, soft ragged edges and dwindling coverage survive integer-height quantization.
      const feather=smooth(1-Math.abs(offset)/width),grain=hash(rayInfo.seed,x+Math.imul(y,65537));
      if(heavy){
        // A coherent raised body remains readable at map scale; gaps and feathered margins stay irregular.
        const wave=Math.sin(t*13+rayInfo.phase),lobes=smooth((wave+.8)/1.25),gaps=smooth((wave+.96)/.28);
        const fade=1-smooth((t-.45)/.55);
        const height=(1.2+1.25*s.power/100)*feather*(.7+.3*lobes)*gaps*fade*edgeFade;
        rayHeight=Math.max(rayHeight,Math.floor(height+.3+grain*.4));
      }else{
        const lobes=smooth((Math.sin(t*25+rayInfo.phase)+.65)/1.25);
        const density=feather*(.12+.88*lobes)*(1-smooth((t-.2)/.8));
        if(density>.18+grain*.66)rayHeight=1;
      }
    }
    for(const pit of rayInfo.pits){
      const dist=(x-pit.x)**2+(y-pit.y)**2;
      if(edgeFade>.5&&dist<pit.r**2)secondary=Math.max(secondary,dist<pit.r**2*.35?2:1);
    }
  }
  return {r,theta,down,ray:rayHeight>0,rayHeight,secondary};
}
/** A coherent crater field, quantized once to Timberborn levels. Not a shock-physics solver. */
export class ImpactPlan {
  readonly map:CraterMap;readonly anatomy:Anatomy;readonly keep:Uint8Array;readonly settings:Settings;readonly intent:Intent;
  readonly stats={cut:0,raised:0,changed:0,erased:0,flattened:0};private row=0;private done=false;
  constructor(readonly before:CraterMap,settings:Settings,intent:Intent){
    this.settings={...settings};this.intent={...intent};this.anatomy=anatomy(before,settings,intent);
    this.keep=protectedGround(before);if(this.keep[intent.origin])throw Error('Start here');
    // Existing emitter footprints retain their ground and exact source settings.
    for(const e of before.entities)if(EMITTERS[e.template])for(const i of entityTiles(before,e))this.keep[i]=1;
    this.map=snapshot(before);
  }
  advance(rows=8):boolean {
    if(this.done)return true;
    const {W,H}=this.map,s=this.settings,a=this.anatomy,phase=hash(s.seed,80)*Math.PI*2;
    const end=Math.min(H,this.row+Math.max(1,Math.floor(rows)));
    for(let y=this.row;y<end;y++)for(let x=0;x<W;x++){
      const i=y*W+x;if(this.keep[i])continue;
      const f=field(a,s,x,y),{r,theta,down}=f,h=this.before.heights[i];let target=h;
      if(r<1){
        let wall=0;
        if(s.walls==='steep')wall=smooth((r-.89)/.055);
        else {
          // Four short scarps separate three broad, level benches, even on mid-size craters.
          const shift=(hash(s.seed,7)-.5)*.025;
          for(let step=0;step<4;step++)wall+=smooth((r-(.48+step*.16+shift))/.025)/4;
        }
        const curve=s.walls==='steep'?.23:.16;
        const t=a.centre==='bowl'?curve*clamp(r/(s.walls==='steep'?.89:.48),0,1)**2+(1-curve)*wall:wall;
        let inside=a.floor+(a.datum-a.floor+a.rim)*t;
        if(a.centre==='peak')inside+=a.depth*.69*Math.max(0,1-r/.31)**1.25;
        if(a.centre==='ring')inside+=a.depth*.55*Math.exp(-(((r-.38)/.10)**2))*(1+.18*Math.sin(theta*7+phase));
        // The newest bowl replaces prior relief; only the outermost lip rejoins its local ground.
        target=inside+(h-a.datum)*smooth((r-.84)/.16);
        if(s.walls==='terraced'&&r>.54&&r<.93&&this.before.rockLayers[clamp(Math.round(target),0,22)]>.5)target=Math.ceil(target);
      }else{
        const rim=a.rim*Math.max(0,1-(r-1)/.23);
        const heavy=s.debris==='heavy',reach=heavy?2.65:1.48;
        const directional=1+a.glance*(down*1.65-.65);
        const hummock=.8+.18*Math.sin(theta*5+phase+(r-1)*3)+.13*Math.sin(theta*3-phase);
        const skirt=(heavy?(2.1+a.depth*.36):.9)*Math.exp(-(r-1)*(heavy?2.15:7))*smooth((reach-r)/.4)*directional*hummock;
        target=h+Math.max(rim,skirt);
        if(f.ray)target=Math.max(h+f.rayHeight,Math.round(target)+f.rayHeight);
        if(f.secondary)target=h-f.secondary;
      }
      // Fixed-point boundary keeps rounding independent of harmless floating-point tails.
      target=clamp(Math.round(Math.round(target*4096)/4096),0,Math.min(22,this.map.maxHeight));
      this.map.heights[i]=target;
      if(target!==h){this.stats.changed++;this.stats.cut+=Math.max(0,h-target);this.stats.raised+=Math.max(0,target-h);}
    }
    this.row=end;if(end<H)return false;
    this.finishObjects();this.done=true;return true;
  }
  private finishObjects(){
    const a=this.anatomy,s=this.settings;
    this.map.fallen=this.before.fallen.filter(e=>field(a,s,e.x,e.y).r>1).map(e=>({...e,z:this.map.heights[Math.floor(e.y)*this.map.W+Math.floor(e.x)]}));
    this.map.entities=this.map.entities.filter(e=>{
      const tile=e.y*this.map.W+e.x;if(this.keep[tile])return true;
      const f=field(a,s,e.x,e.y),plant=/^(Pine|Oak|Birch|Succulent|BlueberryBush)$/.test(e.template);
      if(plant&&f.r<.93){this.stats.erased++;return false;}
      if(plant&&(f.r<(s.debris==='heavy'?1.85:1.4)||f.ray)){
        if(e.template!=='BlueberryBush'){
          const d=Math.hypot(e.x-a.x,e.y-a.y)||1;
          this.map.fallen=this.map.fallen.filter(f=>f.id!==e.id);
          this.map.fallen.push({id:e.id,x:e.x+.5,y:e.y+.5,z:this.map.heights[tile],dx:(e.x-a.x)/d,dy:(e.y-a.y)/d,length:e.template==='Oak'?2.6:2});
          e.components={...e.components,LivingNaturalResource:{IsDead:true}};delete e.raw;e.z=this.map.heights[tile];this.stats.flattened++;return true;
        }return false;
      }
      if(entityTiles(this.map,e).some(i=>this.map.heights[i]!==this.before.heights[i]))return false;
      return true;
    });
    const keptIds=new Set(this.map.entities.map(e=>e.id));
    this.map.fallen=this.map.fallen.filter(f=>keptIds.has(f.id));
  }
}
export function impact(m:CraterMap,s:Settings,intent:Intent):ImpactPlan {
  const p=new ImpactPlan(m,s,intent);while(!p.advance(16)){}return p;
}
export function waterRun(m:CraterMap):SettleRun {
  return new SettleRun(new WaterSim(modelFor(m),m.water));
}
export function settleImpact(m:CraterMap){const r=waterRun(m);let result=r.advance(Infinity);while(!result)result=r.advance(Infinity);
  m.water={depth:r.sim.D.slice(),contamination:r.sim.C.slice()};return result;}
