import { clamp,type Point,type Intent } from './engine';

/** Continuous, sub-tile pen input. Rendering consumes this at display rate;
 * the worker consumes replaceable copies at its own pace. */
export class FaultBrush {
  readonly points:Point[]=[];
  private smooth:Point;
  private target:Point;
  constructor(p:Point,readonly W:number,readonly H:number,public side:1|-1=1){
    this.smooth={...p};this.target={...p};this.points.push({...p});
  }
  aim(p:Point){this.target={x:clamp(p.x,0,this.W-1),y:clamp(p.y,0,this.H-1)};}
  advance(dt:number,finish=false){
    const a=finish?1:1-Math.exp(-Math.max(0,dt)/.018);
    this.smooth={x:this.smooth.x+(this.target.x-this.smooth.x)*a,y:this.smooth.y+(this.target.y-this.smooth.y)*a};
    const last=this.points.at(-1)!;
    if(Math.hypot(this.smooth.x-last.x,this.smooth.y-last.y)>.45)this.points.push({...this.smooth});
    // Bound both the worker and line buffers, retaining the beginning and end.
    if(this.points.length>480)this.points.splice(1,this.points.length-2,...this.points.slice(1,-1).filter((_,i)=>i%2===0));
  }
  intent():Intent{return {side:this.side,path:[...this.points.map(p=>({...p})),{...this.smooth}]};}
}
