import { surfaceWater } from '../../src/render3d/model';
import { settledVelocity, type FlowMap } from './flow';
export const STEPS=256, DT=.18;
export interface Sample {x:number;y:number;h:number;bad:number;vx:number;vy:number;speed:number;}
export interface Lane {points:Sample[]; length:number;}
/** Shared wet-only current sampler. Neither layer estimates direction from surface slope. */
export class CurrentPaths {
  buildMs=0;water;velocity;lanes:Lane[]=[];wakes:Sample[]=[];seams:Lane[]=[];
  constructor(public map:FlowMap){
    const start=performance.now();this.water=surfaceWater(map.W,map.H,map.water);this.velocity=settledVelocity(map.W,map.H,map.flow);
    this.build();this.buildMs=performance.now()-start;
  }
  sample(x:number,y:number):Sample|null {
    const {W,H}=this.map,s=this.water,v=this.velocity,xx=Math.floor(x),yy=Math.floor(y),i=yy*W+xx;
    if(!v||xx<0||yy<0||xx>=W||yy>=H||s.depth[i]<.06)return null;
    let vx=0,vy=0,w=0;const bx=Math.floor(x-.5),by=Math.floor(y-.5),fx=x-.5-bx,fy=y-.5-by;
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
      const ax=bx+dx,ay=by+dy,j=ay*W+ax;
      if(ax<0||ay<0||ax>=W||ay>=H||s.depth[j]<.06||Math.abs(s.surface[j]-s.surface[i])>.65)continue;
      const q=(dx?fx:1-fx)*(dy?fy:1-fy);vx+=v[j*2]*q;vy+=v[j*2+1]*q;w+=q;
    }
    vx/=Math.max(w,.0001);vy/=Math.max(w,.0001);
    return {x,y,h:s.surface[i]+.035,bad:s.contamination[i],vx,vy,speed:Math.hypot(vx,vy)};
  }
  private step(p:Sample,dt:number):Sample|null {
    const count=Math.max(1,Math.ceil(p.speed*Math.abs(dt)/.24));let at=p;
    for(let j=0;j<count;j++){
      const d=dt/count,mid=this.sample(at.x+at.vx*d/2,at.y+at.vy*d/2);
      if(!mid)return null;
      const next=this.sample(at.x+mid.vx*d,at.y+mid.vy*d);
      if(!next||Math.abs(next.h-at.h)>.45||next.speed<.045)return null;
      at=next;
    }
    return at;
  }
  trace(p:Sample,sign:number,count:number,blocked?:(p:Sample)=>boolean):Sample[]{
    const points:Sample[]=[];let at=p;
    for(let k=0;k<count;k++){
      const next=this.step(at,DT*sign);if(!next||blocked?.(next))break;
      points.push(next);at=next;
    }
    return points;
  }
  private build(){
    if(!this.velocity)return;
    const {W,H}=this.map,covered=new Uint8Array(W*H),candidates:Sample[]=[];
    const hash=(i:number)=>((Math.imul(i+417,1664525)^Math.imul(i+93,1013904223))>>>0)/4294967296;
    for(let i=0;i<W*H;i++){
      const p=this.sample(i%W+.5,Math.floor(i/W)+.5);
      if(p&&p.speed>.10)candidates.push(p);
    }
    // Deterministic, stratified seeds, then claim whole paths, not individual dots.
    candidates.sort((a,b)=>hash(Math.floor(a.y)*W+Math.floor(a.x))-hash(Math.floor(b.y)*W+Math.floor(b.x)));
    const occupied=(p:Sample)=>covered[Math.floor(p.y)*W+Math.floor(p.x)]!==0;
    const claim=(p:Sample,r:number)=>{
      for(let y=Math.max(0,Math.floor(p.y-r));y<Math.min(H,p.y+r+1);y++)for(let x=Math.max(0,Math.floor(p.x-r));x<Math.min(W,p.x+r+1);x++)
        if(Math.hypot(x+.5-p.x,y+.5-p.y)<r)covered[y*W+x]=1;
    };
    for(const p of candidates){
      if(occupied(p))continue;
      const back=this.trace(p,-1,100,occupied).reverse(),forward=this.trace(p,1,STEPS-1-back.length,occupied);
      const points=[...back,p,...forward];let length=0;
      for(let k=1;k<points.length;k++)length+=Math.hypot(points[k].x-points[k-1].x,points[k].y-points[k-1].y);
      if(points.length<18||length<5)continue;
      this.lanes.push({points,length});for(const q of points)claim(q,3.2);
      if(this.lanes.length>=180)break;
    }
    const spaced=(a:Sample[],p:Sample,r:number)=>a.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>r);
    for(const p of candidates){
      if(p.speed<.4)continue;
      const dx=p.vx/p.speed,dy=p.vy/p.speed,nx=-dy,ny=dx;
      const wet=(along:number,across:number)=>this.sample(p.x+dx*along+nx*across,p.y+dy*along+ny*across);
      // A bank shoulder/obstacle behind a wet opening, or an impending narrowing.
      // Never decorate a straight unbroken shore or an open lake with V patterns.
      const behindL=wet(-1.8,1.3),behindR=wet(-1.8,-1.3),aheadL=wet(1.8,1.3),aheadR=wet(1.8,-1.3);
      const opening=(!behindL!==!behindR)&&!!aheadL&&!!aheadR;
      const narrowing=!!behindL&&!!behindR&&(!aheadL!==!aheadR);
      if((opening||narrowing)&&wet(2,0)&&spaced(this.wakes,p,9))this.wakes.push(p);
      // Inward transverse currents on BOTH sides support a joining seam.
      const left=wet(0,2),right=wet(0,-2);
      if(left&&right&&left.vx*nx+left.vy*ny<-.16&&right.vx*nx+right.vy*ny>.16&&
        left.vx*dx+left.vy*dy>.2&&right.vx*dx+right.vy*dy>.2&&spaced(this.seams.map(l=>l.points[0]),p,10)){
        const points=[p,...this.trace(p,1,50)];if(points.length>14)this.seams.push({points,length:0});
      }
    }
  }
}
