// M9b's --cycle scenario and contamination criteria, replayed from exported first maps.
// Reading saved files avoids generating each map twice. This does not launch Timberborn.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { runModel } from '../probe/runner/model';
import { readMapBytes } from '../probe/runner/mapfile';
import { distanceFrom } from '../../src/core/math/grid';
const dir=join(__dirname,'local/after');
const out=join(dir,'cycles.jsonl');writeFileSync(out,'');
// The required generator sweep covers all sixty maps. This additional, slower weather replay
// covers all forty smaller maps and three large seas; opt in to all sixty weather replays.
for(const size of [96,128,256])for(const seed of (size===256&&!process.env.ISLANDS_FULL_CYCLES ? [1,2,3] : Array.from({length:20},(_,i)=>i+1))) {
  const bytes=new Uint8Array(readFileSync(join(dir,`${size}-${seed}.timber`)));
  const b=readMapBytes(bytes),{W,H}=b,N=W*H;
  if(!b.start)throw Error(`No exported start: ${size}/${seed}`);
  const sm=new Uint8Array(N);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sm[(b.start.y+dy)*W+b.start.x+dx]=1;
  const sd=distanceFrom(sm,W,H);
  const before=1+9-0.01;
  const run=runModel(bytes,`islands-${size}-${seed}`,[
    {temperateDays:3,hazard:'drought',hazardDays:3},
    {temperateDays:3,hazard:'badtide',hazardDays:3},
    {temperateDays:60,hazard:'drought',hazardDays:0},
  ],before+0.02,[],[],[before]);
  const s=run.maps[0];let land=0,startWater=false,farmland=false;
  for(let i=0;i<N;i++) {
    const badWater=s.depth[i]>0.05&&s.contamination[i]>=0.1;
    if(!(s.soilContamination[i]>0||badWater))continue;
    if(!(b.depth[i]>0.05))land++;
    if(sd[i]<=12&&badWater&&b.depth[i]>0.05&&b.contamination[i]<0.1)startWater=true;
    if(sd[i]<=20&&!(b.depth[i]>0.05)&&b.moisture[i]>0&&!(b.soilContamination[i]>0))farmland=true;
  }
  const m={size,seed,land,startWater,farmland};
  appendFileSync(out,JSON.stringify(m)+'\n');console.log(JSON.stringify(m));
  if(startWater||farmland)process.exitCode=1;
}
