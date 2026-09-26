import {FaultBrush} from '../verbs/quake/brush';
import type {ForceRequest,Verb} from '../verbs';
import type {Point} from '../verbs/quake/engine';
export {FaultBrush};
/** One gesture vocabulary, independent of DOM and frame scheduling. */
export class ForceInput {
 anchor:Point|null=null;side:1|-1=1;brush:FaultBrush|null=null;origin:Point|null=null;
 constructor(public W:number,public H:number){}
 begin(p:Point,straight=false){this.origin=straight&&this.anchor?{...this.anchor}:{...p};this.brush=new FaultBrush(this.origin,this.W,this.H,this.side);this.brush.aim(p);if(straight)this.brush.advance(0,true);}
 move(p:Point,dt=.016){this.brush?.aim(p);this.brush?.advance(dt);}
 flip(){this.side=this.side===1?-1:1;if(this.brush)this.brush.side=this.side;}
 cancel(){this.brush=null;this.origin=null;this.anchor=null;}
 request(verb:Verb,settings:any,end?:Point):ForceRequest {
  if(!this.brush||!this.origin)throw Error('Choose land');
  if(end){this.brush.aim(end);this.brush.advance(0,true);}
  const path=this.brush.intent().path,origin=Math.round(this.origin.y)*this.W+Math.round(this.origin.x),last=path.at(-1)!;
  return verb==='quake'?{verb,settings:{...settings},intent:{path,side:this.side}}:
   verb==='erupt'?{verb,settings:{...settings},intent:{origin,...(settings.mode==='fissure'?{path}:{})}}:
   {verb,settings:{...settings},intent:{origin,...(settings.mode==='aim'?{end:Math.round(last.y)*this.W+Math.round(last.x)}:{})}} as ForceRequest;
 }
 end(p:Point){this.anchor={...p};this.brush=null;this.origin=null;}
}
