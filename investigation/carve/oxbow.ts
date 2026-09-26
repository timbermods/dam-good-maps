import type { Station } from './engine';
import type { Point } from './course';
export interface MouthBar extends Point {dx:number;dy:number;width:number;level:number}
export interface Oxbow {start:number;end:number;step:number;floor:number;neck:Point[];pool:Point[];bars:[MouthBar,MouthBar]}
/** Detect an actual long bend with a short neck, not a decorative pond added
 * beside an arbitrary channel. Only one cutoff is allowed per prototype run. */
export function findNeck(path:Station[],step:number):Oxbow|null {
 const end=path.length-1,B=path[end];if(!B||B.bed<2||end<25)return null;
 for(let start=Math.max(5,end-100);start<end-20;start++){
  const A=path[start],dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy),radius=Math.min(A.width,B.width),arc=(end-start)*1.35;
  if(d<radius*2+3||d>radius*4+10||arc<d*2.2)continue;
  const bow=path.slice(start,end+1),sides=bow.map(p=>((p.x-A.x)*dy-(p.y-A.y)*dx)/d),swing=Math.max(...sides.map(Math.abs));
  if(Math.min(...sides)<-.25&&Math.max(...sides)>.25)continue;
  if(swing<radius*2+3)continue;
  const neck=Array.from({length:Math.ceil(d/1.1)+1},(_,k)=>{const t=k/Math.ceil(d/1.1);return {x:A.x+dx*t,y:A.y+dy*t};});
  // Two transverse sediment bars, set back from the shortcut. Keep a genuine
  // crescent between them and a sill reachable by canonical source prefill.
  const far=sides.map((s,k)=>Math.abs(s)>radius*1.8+3?k:-1).filter(k=>k>=0);
  if(far.length<12)continue;
  const first=far[0],last=far.at(-1)!,level=Math.min(A.bed,B.bed+2);
  const bar=(p:Station):MouthBar=>({x:p.x,y:p.y,dx:p.dx,dy:p.dy,width:p.width+2,level});
  return {start,end,step,floor:B.bed-1,neck,pool:bow.slice(first+2,last-1),bars:[bar(bow[first]),bar(bow[last])]};
 }
 return null;
}
/** Reserved net surface for concurrent scour and mouth-bar deposition. */
export function mouthFloors(cut:Oxbow,W:number,H:number,original:Uint8Array):Uint8Array {
 const floor=new Uint8Array(W*H);
 for(const b of cut.bars){
  const radius=b.width+5;
  for(let y=Math.max(0,Math.floor(b.y-radius));y<=Math.min(H-1,Math.ceil(b.y+radius));y++)
   for(let x=Math.max(0,Math.floor(b.x-radius));x<=Math.min(W-1,Math.ceil(b.x+radius));x++){
    const along=(x-b.x)*b.dx+(y-b.y)*b.dy,side=-(x-b.x)*b.dy+(y-b.y)*b.dx;
    if(Math.abs(along)>2||Math.abs(side)>b.width+3)continue;
    const level=b.level+Math.max(0,Math.ceil((Math.abs(side)-b.width)*4)),i=y*W+x;
    floor[i]=Math.max(floor[i],Math.min(original[i],level));
   }
 }
 return floor;
}
