// Adapted from Craterize's ImpactPlan; worker slices, data model and object policy stay shared in shape.
import { JsonFloat } from '../../src/core/format/json';
import type { EntitySpec } from '../../src/core/format/entities';
import { FOOTPRINTS } from '../../src/core/format/footprints';
import { waterModel, objectTile, EMITTERS } from '../../src/core/sim/model';
import { WaterSim, type WaterState } from '../../src/core/sim/water';
import { canonicalRun } from '../../src/core/sim/prefill';
import { lavaLobes, lobeField, type LavaLobe } from './flows';
export interface Fallen {id:string;x:number;y:number;z:number;dx:number;dy:number;length:number}
export interface EruptMap {name:string;W:number;H:number;heights:Uint8Array;entities:EntitySpec[];water:WaterState;maxHeight:number;rockLayers:number[];fallen:Fallen[];lava:Uint32Array}
export interface Point {x:number;y:number}
export interface Intent {origin:number;path?:Point[]}
export interface Settings {mode:'vent'|'fissure';power:number;shape:'steep'|'broad';summit:'auto'|'peak'|'crater'|'caldera';flows:'light'|'heavy';ridges:boolean;seed:number}
export const DEFAULTS:Settings={mode:'vent',power:62,shape:'steep',summit:'auto',flows:'heavy',ridges:true,seed:1};
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const smooth=(v:number)=>{v=clamp(v,0,1);return v*v*(3-2*v);};
export const plainEntities=(e:EntitySpec[]):EntitySpec[]=>JSON.parse(JSON.stringify(e,(_k,v)=>v instanceof JsonFloat?v.value:v));
export const modelFor=(m:EruptMap)=>waterModel(m.W,m.H,m.heights,m.entities.map(e=>({...e,components:{...e.before,...e.components}})));
export function geology(h:Uint8Array):number[]{let s=2166136261;for(const v of h)s=Math.imul(s^v,16777619);return Array.from({length:23},(_,z)=>(z+(s>>>0)%4)%4===0?1:0);}
export function hash(seed:number,k:number):number{let x=Math.imul((seed^Math.imul(k+1,0x9e3779b9))>>>0,0x85ebca6b);x^=x>>>13;return(Math.imul(x,0xc2b2ae35)>>>0)/4294967296;}
export function snapshot(m:EruptMap):EruptMap{return {...m,heights:m.heights.slice(),entities:structuredClone(m.entities),rockLayers:m.rockLayers.slice(),fallen:structuredClone(m.fallen),lava:m.lava.slice(),water:{depth:m.water.depth.slice(),contamination:m.water.contamination.slice()}};}
export function entityTiles(m:Pick<EruptMap,'W'|'H'>,e:EntitySpec):number[]{const size=FOOTPRINTS[e.template]?.size??[1,1,1],out:number[]=[];for(let y=0;y<size[1];y++)for(let x=0;x<size[0];x++){const[xx,yy]=objectTile(e,x,y);if(xx>=0&&yy>=0&&xx<m.W&&yy<m.H)out.push(yy*m.W+xx);}return out;}
export function protectedGround(m:EruptMap):Uint8Array{const mask=new Uint8Array(m.W*m.H);for(const e of m.entities)if(e.template==='StartingLocation')for(const i of entityTiles(m,e))for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){const xx=i%m.W+x,yy=Math.floor(i/m.W)+y;if(xx>=0&&yy>=0&&xx<m.W&&yy<m.H)mask[yy*m.W+xx]=1;}return mask;}
export function validateSettings(s:Settings,m:Pick<EruptMap,'W'|'H'>,i:Intent){
  if(!['vent','fissure'].includes(s.mode)||!['steep','broad'].includes(s.shape)||!['auto','peak','crater','caldera'].includes(s.summit)||!['light','heavy'].includes(s.flows)||typeof s.ridges!=='boolean'||!Number.isFinite(s.power)||s.power<0||s.power>100||!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff)throw Error('Invalid eruption settings');
  if(!Number.isInteger(i.origin)||i.origin<0||i.origin>=m.W*m.H)throw Error('Choose land on the map');
  if(s.mode==='fissure'&&(!Array.isArray(i.path)||i.path.length<2||i.path.length>512||i.path.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>m.W-1||p.y>m.H-1)))throw Error('Draw a fissure on the land');
}
export const naturalSize=(p:number)=>2*(7+36*(p/100)**1.15);
export const autoSummit=(p:number):Settings['summit']=>p<32?'peak':p<80?'crater':'caldera';
export interface Segment {a:Point;b:Point;length:number;along:number}
export interface Anatomy {x:number;y:number;datum:number;radius:number;height:number;summit:Settings['summit'];phase:number;segments:Segment[];vents:Point[];length:number;lobes:LavaLobe[]}
export function ventRadius(s:Settings){const summit=s.summit==='auto'?autoSummit(s.power):s.summit;return naturalSize(s.power)*.5*(s.shape==='broad'?1.6:s.mode==='vent'&&summit!=='caldera'?.74:1)*(s.mode==='fissure'?.47:1);}
export function anatomy(m:Pick<EruptMap,'W'|'H'|'heights'>,s:Settings,intent:Intent):Anatomy{
  validateSettings(s,m,intent);const x=intent.origin%m.W,y=Math.floor(intent.origin/m.W),p=s.power/100;
  const summit=s.summit==='auto'?autoSummit(s.power):s.summit,radius=ventRadius(s),legacy=s.mode==='fissure'||summit==='caldera';
  const height=(2+18*p)*(legacy?(s.shape==='broad'?.7:1)*(s.mode==='fissure'?.75:1):s.shape==='broad'?.55:1.42);
  const segments:Segment[]=[],vents:Point[]=[];let length=0;
  if(s.mode==='fissure'){
    for(let k=1;k<intent.path!.length;k++){const a=intent.path![k-1],b=intent.path![k],l=Math.hypot(b.x-a.x,b.y-a.y);if(l>.01){segments.push({a,b,length:l,along:length});length+=l;}}
    if(length<3)throw Error('Draw a longer fissure');
    const spacing=Math.max(7,radius*.72),count=Math.max(2,Math.ceil(length/spacing));
    for(let k=0;k<=count;k++){const d=length*k/count,seg=segments.find(v=>d<=v.along+v.length)??segments.at(-1)!,t=(d-seg.along)/seg.length;vents.push({x:seg.a.x+(seg.b.x-seg.a.x)*t,y:seg.a.y+(seg.b.y-seg.a.y)*t});}
  }else vents.push({x,y});
  const a:Anatomy={x,y,radius,height,datum:m.heights[intent.origin],summit,phase:hash(s.seed,71)*Math.PI*2,segments,vents,length,lobes:[]};
  if(s.mode==='vent')a.lobes=lavaLobes(m.W,m.H,m.heights,a,s.seed,s.flows==='heavy');return a;
}
export function field(a:Anatomy,s:Settings,x:number,y:number){
  let cx=a.x,cy=a.y,along=0,distance=Infinity;
  for(const seg of a.segments){const dx=seg.b.x-seg.a.x,dy=seg.b.y-seg.a.y,t=clamp(((x-seg.a.x)*dx+(y-seg.a.y)*dy)/(seg.length*seg.length),0,1),xx=seg.a.x+dx*t,yy=seg.a.y+dy*t,d=Math.hypot(x-xx,y-yy);if(d<distance){distance=d;cx=xx;cy=yy;along=seg.along+t*seg.length;}}
  const theta=Math.atan2(y-cy,x-cx),edge=1+.07*Math.sin(theta*3+a.phase)+.045*Math.sin(theta*5-a.phase),r=Math.hypot(x-cx,y-cy)/(a.radius*edge);
  const wave=s.mode==='vent'?theta*(6+Math.floor(hash(s.seed,20)*4))+a.phase+r*.9:along/(3+hash(s.seed,20)*2)+a.phase+r*.8;
  const ridge=Math.max(0,Math.cos(wave))**8;
  let nearest=Infinity,vent=a.vents[0];for(const v of a.vents){const d=Math.hypot(x-v.x,y-v.y);if(d<nearest){nearest=d;vent=v;}}
  return {r,theta,ridge,cx,cy,along,vent,ventDistance:nearest};
}
export function eruptionReason(m:EruptMap,s:Settings,i:Intent):string|null{
  const keep=protectedGround(m);if(keep[i.origin])return 'Start here';
  if(s.mode==='fissure'){const a=anatomy(m,s,i);for(let k=0;k<keep.length;k++)if(keep[k]&&field(a,s,k%m.W,Math.floor(k/m.W)).r*a.radius<2)return 'Start here';}return null;
}
/** Low frequency lobes, terraces, collapse and long flows; no per-tile noise. */
export class EruptPlan{
  readonly map:EruptMap;readonly anatomy:Anatomy;readonly keep:Uint8Array;readonly flows:Float32Array;readonly stats={raised:0,changed:0,flattened:0,erased:0,hard:0};private row=0;private done=false;
  constructor(readonly before:EruptMap,readonly settings:Settings,readonly intent:Intent){this.anatomy=anatomy(before,settings,intent);const reason=eruptionReason(before,settings,intent);if(reason)throw Error(reason);this.keep=protectedGround(before);this.map=snapshot(before);this.flows=lobeField(before.W,before.H,this.anatomy.lobes);}
  advance(rows=4):boolean{
    if(this.done)return true;const {W,H}=this.map,a=this.anatomy,s=this.settings,end=Math.min(H,this.row+Math.max(1,Math.floor(rows)));
    for(let y=this.row;y<end;y++)for(let x=0;x<W;x++){
      const i=y*W+x,h=this.before.heights[i];if(this.keep[i])continue;
      const f=field(a,s,x,y),r=f.r;if(r>2.6)continue;
      const local=this.before.heights[Math.round(f.cy)*W+Math.round(f.cx)],datum=s.mode==='vent'?a.datum:local;
      let profile=Math.max(0,1-r)**(s.shape==='steep'?(s.mode==='fissure'?.83:1.7):1.65);
      if(s.mode==='vent'&&a.summit==='crater'&&r<.16)profile=.64+(Math.pow(.84,s.shape==='steep'?1.7:1.65)-.64)*smooth(r/.16);
      if(s.mode==='vent'&&a.summit==='caldera')profile=r<.43?.34:r<.6?.34+.48*smooth((r-.43)/.17):.82*Math.max(0,1-(r-.6)/.65);
      if(s.mode==='fissure'){
        const bowl=1-smooth(f.ventDistance/Math.max(2.4,a.radius*.19));
        profile=Math.max(0,profile-bowl*(a.summit==='caldera'?.4:a.summit==='peak'?.12:.27));
      }
      const shoulder=smooth((r-.48)/.7),cone=datum+a.height*profile+(h-datum)*shoulder;
      const reach=s.flows==='heavy'?2.55:1.25;
      const apron=(s.flows==='heavy'?2.6+s.power*.018:.8)*Math.max(0,1-r/reach)**1.4*(.86+.14*Math.sin(f.theta*4+a.phase+r));
      const ridge=s.ridges?(s.mode==='fissure'?f.ridge*(1-smooth((r-1.05)/.85))*smooth((r-.34)/.32)*(.8+s.power*.022):this.flows[i]*(.7+s.power*.013)*smooth((r-(a.summit==='caldera'?.6:.16))/.2)):0;
      let target=Math.max(h,cone,h+apron)+ridge;
      // Keep broad summit basins open; flow ridges begin below the rim.
      if(s.mode==='vent'&&r<(a.summit==='caldera'?.6:a.summit==='crater'?.16:0))target=Math.max(h,cone);
      target=clamp(Math.round(Math.round(target*4096)/4096),0,Math.min(22,this.map.maxHeight));this.map.heights[i]=target;
      if(target!==h){this.stats.changed++;this.stats.raised+=target-h;for(let z=h;z<target;z++)this.map.lava[i]|=1<<z;this.stats.hard++;}
    }
    this.row=end;if(end<H)return false;this.finishObjects();this.done=true;return true;
  }
  private finishObjects(){
    const a=this.anatomy,s=this.settings,m=this.map;
    m.fallen=m.fallen.map(f=>({...f,z:m.heights[clamp(Math.floor(f.y),0,m.H-1)*m.W+clamp(Math.floor(f.x),0,m.W-1)]}));
    m.entities=m.entities.filter(e=>{
      const tile=e.y*m.W+e.x;if(this.keep[tile])return true;
      const f=field(a,s,e.x,e.y),plant=/^(Pine|Oak|Birch|Succulent|BlueberryBush)$/.test(e.template);
      if(!EMITTERS[e.template]&&f.ventDistance<Math.max(1.5,a.radius*.065)){this.stats.erased++;m.fallen=m.fallen.filter(v=>v.id!==e.id);return false;}
      if(plant&&f.ventDistance<a.radius*.72){
        if(e.template==='BlueberryBush'||e.template==='Succulent'){this.stats.erased++;return false;}
        const d=Math.hypot(e.x-f.vent.x,e.y-f.vent.y)||1;m.fallen=m.fallen.filter(v=>v.id!==e.id);
        m.fallen.push({id:e.id,x:e.x+.5,y:e.y+.5,z:m.heights[tile],dx:(e.x-f.vent.x)/d,dy:(e.y-f.vent.y)/d,length:e.template==='Oak'?2.6:2});
        e.components={...e.components,LivingNaturalResource:{IsDead:true}};delete e.raw;this.stats.flattened++;
      }
      // Rigid footprints ride a supporting terrace, instead of leaving one corner hanging.
      const tiles=entityTiles(m,e),height=Math.max(...tiles.map(i=>m.heights[i]));
      if(tiles.some(i=>this.keep[i]&&m.heights[i]!==height))return true;
      if(!plant)for(const i of tiles){const prior=m.heights[i];m.heights[i]=height;for(let z=prior;z<height;z++)m.lava[i]|=1<<z;}
      const z=plant?m.heights[tile]:height;if(e.z!==z)delete e.raw;e.z=z;return true;
    });
  }
}
export function erupt(m:EruptMap,s:Settings,intent:Intent){const p=new EruptPlan(m,s,intent);while(!p.advance(8)){}return p;}
export function waterRun(m:EruptMap){return canonicalRun(modelFor(m));}
/** Retain volume on rising cells. The existing simulator pushes it downhill; no source is added. */
export function liveWater(previous:EruptMap,next:EruptMap,ticks=6){const sim=new WaterSim(modelFor(next),previous.water);sim.run(ticks);next.water={depth:sim.D.slice(),contamination:sim.C.slice()};}
export function stageMap(before:EruptMap,after:EruptMap,t:number):EruptMap{
  const m=snapshot(after);for(let i=0;i<m.heights.length;i++)m.heights[i]=Math.round(before.heights[i]+(after.heights[i]-before.heights[i])*smooth(t));
  m.entities=m.entities.map(e=>({...e,z:m.heights[e.y*m.W+e.x]}));m.fallen=m.fallen.map(f=>({...f,z:m.heights[Math.floor(f.y)*m.W+Math.floor(f.x)]}));return m;
}
