import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {strict as assert} from 'node:assert';
import {build,dir} from './build.mjs';
import {compareRaw,digest} from './identity.mjs';
const a=await import(pathToFileURL(await build('before',false,'node',true)));
const b=await import(pathToFileURL(await build('after',false,'node',true)));
const rng=a.stream(124098,'focused');
const proofs={rooms:0,walls:0,positiveWalls:0,picks:0,rngTail:0};
for(let k=0;k<180;k++){
  const W=24+(k%3)*16,H=20+(k%4)*12,N=W*H;
  const h=Uint8Array.from({length:N},(_,i)=>k%3?3+Math.floor((i%W)/(8+k%7))+Math.floor(Math.floor(i/W)/(9+k%6)):5);
  const wet=Float64Array.from({length:N},()=>rng.float()<0.035?rng.float():0),keep=Uint8Array.from({length:N},()=>rng.float()<0.02?1:0);
  const opts={wet,keep,want:k%6,lo:[0,5,12,24][k%4],firm:k%5};
  compareRaw(a.roomMap(h,W,H,opts),b.roomMap(h,W,H,opts),'room '+k);proofs.rooms++;
  compareRaw(a.damWalls(h,W,H,wet),b.damWalls(h,W,H,wet),'wall '+k);proofs.walls++;
}
// Positive stamped walls, oriented either way, wet/dry faces and missing sides.
for(let k=0;k<32;k++){
  const W=64,H=64,h=new Uint8Array(W*H).fill(5),wet=new Float64Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const across=k%2?y:x,along=k%2?x:y;
    if(across>=29&&across<=33&&!(along>=30&&along<=33)&&(!(k&4)||along<30))h[y*W+x]=9;
    if(along>=30&&along<=33){wet[y*W+x]=1;if(k&2)h[y*W+x]=4;}
    if(k&8&&across<25)wet[y*W+x]=0.1;
  }
  const walls=a.damWalls(h,W,H,wet);compareRaw(walls,b.damWalls(h,W,H,wet),'positive wall '+k);proofs.walls++;if(walls.length)proofs.positiveWalls++;
}
assert(proofs.positiveWalls>0,'wall test must exercise actual detections');
for(let k=0;k<80;k++){
  const W=48,H=48,N=W*H,h=new Uint8Array(N).fill(k%2?6:255),D=new Float64Array(N),C=new Float64Array(N),M=new Float64Array(N).fill(1),waterMask=new Uint8Array(N);
  for(let y=0;y<H;y++)for(let x=0;x<8+(k%10);x++){D[y*W+x]=k%3?1:0.35;h[y*W+x]=k%2?5:254;waterMask[y*W+x]=2;}
  if(k%4===0)for(let i=0;i<N;i++)if(rng.float()<0.2)h[i]-=1;
  const water={depth:D,contamination:C,moisture:M},hydro={water:waterMask,lakes:[{tiles:Array.from({length:N},(_,i)=>i).filter(i=>waterMask[i])}],rivers:[],falls:[]};
  const opts={kept:D,drought:['off','prefer','require'][k%3],storage:{kept:D,want:k%2?0:15},level:k%5!==0,room:400,bench:79,minFoot:0};
  const prepared=b.prepareStart(h,W,H,water,hydro,16,opts),before=digest([h,water,hydro]);
  for(let p=0;p<4;p++){
    const avoid=Uint8Array.from({length:N},()=>rng.float()<0.03?1:0),prefs=[1,1,1,1,1,1];
    const ra=a.stream(k,'pick',p),rb=b.stream(k,'pick',p);
    const aa=a.pickStart(h,W,H,water,hydro,prefs,ra,16,{...opts,avoid});
    const bb=b.pickStart(h,W,H,water,hydro,prefs,rb,16,{...opts,avoid,prepared});
    compareRaw(aa,bb,'pick '+k+'/'+p);proofs.picks++;
    for(let t=0;t<16;t++){assert.equal(ra.nextU32(),rb.nextU32());proofs.rngTail++;}
  }
  assert.equal(digest([h,water,hydro]),before,'preparation/picks must not mutate inputs');
}
writeFileSync(resolve(dir,'local/focused.json'),JSON.stringify(proofs,null,2));console.log(proofs);
