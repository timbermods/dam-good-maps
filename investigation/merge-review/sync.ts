import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { RustStrip } from '../../src/core/sim/rustWater';
const W=9,H=11,N=W*H,rows=[];
const bytes=(v:Float64Array)=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);
for(const game of [true,false])for(const fullStrip of [true,false])for(const occupancy of [false,true]){
 const model={W,H,floor:Float64Array.from({length:N},(_,i)=>i%4),dam:Float64Array.from({length:N},(_,i)=>i%13===0?.65:-1),emitters:[{cells:[0,39],strength:1.5,contamination:.3}]};
 const d=Float64Array.from({length:N},(_,i)=>i%3===0?-0:.1+i%7),c=Float64Array.from({length:N},(_,i)=>(i%5)/5);
 const lo=fullStrip?0:4,total=fullStrip?H:20,rules={game,edgeSpill:game};
 const a=new RustStrip(model,d,c,rules,lo,total,[2]);let b:RustStrip|null=null;
 try{a.run(5,1);for(let i=2*W;i<6*W;i++){
   const depth=a.view('d',N);depth[i]=occupancy?(i%2===0?-0:.75):depth[i]>0?depth[i]*.75:depth[i];
   a.view('c',N)[i]=.625;a.view('dold',N)[i]=depth[i]+.25;a.view('out',4*N).set([.125,.25,.375,.5],4*i);
  }
  a.sync(2,6);b=new RustStrip(model,a.view('d',N).slice(),a.view('c',N).slice(),rules,lo,total,[2]);
  for(const key of ['dold','out']as const)b.view(key,key==='out'?4*N:N).set(a.view(key,key==='out'?4*N:N));
  for(let tick=0;tick<8;tick++){a.run(1,.35);b.run(1,.35);for(const key of ['d','c','dold','out']as const)assert(bytes(a.view(key,key==='out'?4*N:N)).equals(bytes(b.view(key,key==='out'?4*N:N))),`${game}/${fullStrip}/${occupancy}/${key}`);}
  rows.push({game,fullStrip,occupancy,equal:true});
 }finally{a.free();b?.free();}
}
writeFileSync(new URL('./local/sync.json',import.meta.url),JSON.stringify(rows,null,2));console.log(rows.length+' occupancy/value strip sync cases identical to rebuilt bookkeeping.');
