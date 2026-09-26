import { drainage } from '../generative/proto/erode';
import type { CarveMap,Intent,Settings } from './engine';
import type { RiverCharacter } from './character';
export const HEADING_LIMIT=110*Math.PI/180;
export const PROGRESS_WINDOW=16;
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export interface CoursePoint {x:number;y:number;cost:number;bearing:number;heading:number;straightening:boolean}
/** The guiding direction is independent of the previous turn. Flats use M9's
 * deterministic drainage distance; a bend cannot rotate the guide itself. */
export class Course {
 readonly trace:CoursePoint[]=[];
 readonly potential:Float64Array|null;private receivers:Int32Array|null=null;
 private forward=0;
 constructor(private m:CarveMap,private settings:Settings,private intent:Intent,private character:RiverCharacter){
  this.potential=null;
  if(settings.mode==='unleash'){
   const d=drainage(m.heights,m.W,m.H,{epsilon:.0001}),distance=new Float64Array(m.W*m.H);
   for(const i of d.order){const r=d.rcv[i];if(r>=0)distance[i]=distance[r]+Math.hypot(i%m.W-r%m.W,Math.floor(i/m.W)-Math.floor(r/m.W));}
   this.potential=Float64Array.from(d.filled,(v,i)=>v*16+distance[i]);this.receivers=d.rcv;
  }
  const x=intent.origin%m.W,y=Math.floor(intent.origin/m.W),bearing=this.guide(x,y);
  this.trace.push({x,y,cost:this.cost(x,y),bearing,heading:bearing,straightening:false});
 }
 cost(x:number,y:number):number {
  if(this.settings.mode==='aim')return Math.hypot(this.intent.end!%this.m.W-x,Math.floor(this.intent.end!/this.m.W)-y);
  const {W,H}=this.m,xx=Math.max(0,Math.min(W-1,x)),yy=Math.max(0,Math.min(H-1,y)),x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(W-1,x0+1),y1=Math.min(H-1,y0+1),u=xx-x0,v=yy-y0,p=this.potential!;
  return (p[y0*W+x0]*(1-u)+p[y0*W+x1]*u)*(1-v)+(p[y1*W+x0]*(1-u)+p[y1*W+x1]*u)*v;
 }
 guide(x:number,y:number):number{
  if(this.settings.mode==='aim')return Math.atan2(Math.floor(this.intent.end!/this.m.W)-y,this.intent.end!%this.m.W-x);
  const {W,H}=this.m;let i=Math.max(0,Math.min(H-1,Math.round(y)))*W+Math.max(0,Math.min(W-1,Math.round(x)));
  for(let k=0;k<10&&this.receivers![i]>=0;k++)i=this.receivers![i];
  return Math.atan2(Math.floor(i/W)-y,i%W-x);
 }
 plan(x:number,y:number){
  const bearing=this.guide(x,y),cost=this.cost(x,y),n=this.trace.length;
  const straightening=n>=8&&cost>=this.trace[n-8].cost-.25;
  const deadline=n>=PROGRESS_WINDOW?this.trace[n-PROGRESS_WINDOW].cost-.05:Infinity;
  const available=this.settings.mode==='aim'?cost:Infinity;
  return {bearing,cost,straightening,deadline,preferred:bearing+(straightening?0:this.character.swing(this.forward,available))};
 }
 accept(x:number,y:number,heading:number,bearing:number,straightening:boolean){
  this.forward+=1.35*Math.max(.05,Math.cos(angleDelta(heading,bearing)));
  this.trace.push({x,y,cost:this.cost(x,y),bearing,heading,straightening});
 }
}
export interface Point {x:number;y:number}
export function segmentsCross(a:Point,b:Point,c:Point,d:Point):boolean{
 const cross=(p:Point,q:Point,r:Point)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
 const v=cross(a,b,c),w=cross(a,b,d),x=cross(c,d,a),y=cross(c,d,b);
 return v*w<=0&&x*y<=0&&Math.max(a.x,b.x)>=Math.min(c.x,d.x)&&Math.min(a.x,b.x)<=Math.max(c.x,d.x)&&Math.max(a.y,b.y)>=Math.min(c.y,d.y)&&Math.min(a.y,b.y)<=Math.max(c.y,d.y);
}
