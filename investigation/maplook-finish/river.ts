import {surfaceWater,type MapView} from '../../src/render3d/model';
const ramp=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
/** Rough-water locations, not speed decoration. Each connected river supplies its
 * own median moving speed, so multiplying a whole river's speed cannot foam it. */
export function riverAnalysis(map:MapView,velocity:Float32Array){
 const {W,H}=map,N=W*H,sw=surfaceWater(W,H,map.water),speed=Float32Array.from({length:N},(_,i)=>Math.hypot(velocity[i*2],velocity[i*2+1]));
 const wet=(i:number)=>i>=0&&i<N&&sw.depth[i]>.015;
 const neighbours=(i:number)=>{const x=i%W,y=Math.floor(i/W);return [x?i-1:-1,x<W-1?i+1:-1,y?i-W:-1,y<H-1?i+W:-1];};
 const component=new Int32Array(N).fill(-1),normal:number[]=[];
 for(let start=0;start<N;start++)if(wet(start)&&component[start]<0){
  const id=normal.length,queue=[start],moving:number[]=[];component[start]=id;
  for(let k=0;k<queue.length;k++){const i=queue[k];if(speed[i]>.05)moving.push(speed[i]);for(const j of neighbours(i))if(wet(j)&&component[j]<0){component[j]=id;queue.push(j);}}
  moving.sort((a,b)=>a-b);normal.push(moving.length?moving[Math.floor(moving.length*.5)]:Infinity);
 }
 const falls=new Float32Array(N),rapids=new Float32Array(N),obstacles=new Float32Array(N);
 const deposit=(field:Float32Array,x:number,y:number,value:number,level:number)=>{
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const xx=Math.floor(x)+dx,yy=Math.floor(y)+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;
   const i=yy*W+xx;if(!wet(i)||Math.abs(sw.surface[i]-level)>.35)continue;
   const weight=Math.max(0,1-Math.hypot(xx+.5-x,yy+.5-y)/1.1);field[i]=Math.max(field[i],value*weight);
  }
 };
 const trail=(field:Float32Array,i:number,value:number,length:number)=>{
  let x=i%W+.5,y=Math.floor(i/W)+.5;const level=sw.surface[i];
  for(let d=0;d<=length;d+=.45){
   const j=Math.floor(y)*W+Math.floor(x);if(x<0||x>=W||y<0||y>=H||!wet(j)||Math.abs(sw.surface[j]-level)>.35)break;
   deposit(field,x,y,value*Math.pow(1-d/(length+.15),1.45),level);
   if(speed[j]<.05)break;x+=velocity[j*2]/speed[j]*.45;y+=velocity[j*2+1]/speed[j]*.45;
  }
 };
 for(let i=0;i<N;i++)if(wet(i)&&speed[i]>.05){
  const ratio=speed[i]/normal[component[i]],near=neighbours(i);
  // Only a substantial head drop feeding this pool, never tile-sized ripples.
  let drop=0;
  for(const j of near)if(wet(j)){
   const dx=i%W-j%W,dy=Math.floor(i/W)-Math.floor(j/W);
   if(velocity[j*2]*dx+velocity[j*2+1]*dy>.05)drop=Math.max(drop,sw.surface[j]-sw.surface[i]);
  }
  if(drop>=.6)trail(falls,i,Math.min(.85,.38+drop*.09),2.8);
  // Fast relative to this river's usual flow: narrow throats/rapids only.
  const rapid=ramp(1.45,2.10,ratio);
  if(rapid>0)deposit(rapids,i%W+.5,Math.floor(i/W)+.5,rapid*.62,sw.surface[i]);
 }
 // Water on opposite sides of a small solid obstacle (including 2–3 tile rocks),
 // in the same river, distinguishes it from an ordinary continuous bank.
 const across=(i:number,dx:number,dy:number)=>{for(let d=1;d<=4;d++){const x=i%W+dx*d,y=Math.floor(i/W)+dy*d;if(x<0||x>=W||y<0||y>=H)return -1;const j=y*W+x;if(wet(j))return j;}return -1;};
 const surrounds=(a:number,b:number)=>a>=0&&b>=0&&component[a]===component[b]&&Math.abs(sw.surface[a]-sw.surface[b])<.35;
 for(let i=0;i<N;i++)if(!wet(i)){
  const ns=neighbours(i);if(!ns.some(wet))continue;
  if(!surrounds(across(i,-1,0),across(i,1,0))&&!surrounds(across(i,0,-1),across(i,0,1)))continue;
  for(const j of ns)if(wet(j)&&map.heights[i]>=sw.surface[j]-.15){
   const ratio=speed[j]/normal[component[j]];
   if(speed[j]>.5&&ratio>1.12)trail(obstacles,j,.60*ramp(1.12,1.85,ratio),1.4);
  }
 }
 const field=Float32Array.from({length:N},(_,i)=>Math.max(falls[i],rapids[i],obstacles[i]));
 const counts={falls:0,rapids:0,obstacles:0,wet:0};
 for(let i=0;i<N;i++){if(wet(i))counts.wet++;if(falls[i]>.05)counts.falls++;if(rapids[i]>.05)counts.rapids++;if(obstacles[i]>.05)counts.obstacles++;}
 return {field,falls,rapids,obstacles,normal,counts};
}
export function riverField(map:MapView,velocity:Float32Array){return riverAnalysis(map,velocity).field;}
