import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {readTimber} from '../../src/core/format/timber';
import {storedWater} from '../../src/core/format/world';
import {before,after} from './test.mjs';
const dir=resolve('investigation/scaling'),rows:any[]=[];
for(const size of ['128x128','256x256','512x512','128x512','512x256','64x512']){
  const [W,H]=size.split('x').map(Number),file=readTimber(readFileSync(resolve(dir,'local/probe',`sizes-${size}.timber`)));
  const stored=storedWater(file.world.singletons,W,H);
  for(const scenario of ['probe','fully-wet']){
  const a=scenario==='probe'?{...stored,count:stored.tile.length}:{count:W*H,tile:Int32Array.from({length:W*H},(_,i)=>i),floor:new Float32Array(W*H),depth:new Float32Array(W*H).fill(1),contamination:new Float32Array(W*H)};
  const b={...a,depth:Float32Array.from(a.depth,d=>d*1.001)};
  for(const [phase,mod] of [['before',before],['after',after]] as const)for(let repeat=1;repeat<=3;repeat++){
    (globalThis as any).gc?.();
    const player=new mod.WaterPlayer({show:()=>{},changed:()=>{}});player.begin({water:a,done:0});
    const at=Date.now(),t=performance.now();player.push({water:b,done:1,final:()=>{}});const pushMs=performance.now()-t;
    const u=performance.now();player.skip();const skipMs=performance.now()-u;
    // Count actual materialized buffers without invoking lazy water getters.
    let extraBytes=0;for(const frame of player.frames.slice(1,-1)){
      const descriptor=Object.getOwnPropertyDescriptor(frame,'water');if(descriptor?.value)for(const k of ['tile','floor','depth','contamination'])extraBytes+=descriptor.value[k].byteLength;
    }
    const w=performance.now();for(let n=1;n<player.frames.length-1;n++)void player.frames[n].water;const materializeMs=performance.now()-w;
    rows.push({size,scenario,phase,repeat,at,count:a.count,pushMs,skipMs,materializeMs,extraBytes,memory:process.memoryUsage()});
  }
  }
}
writeFileSync(resolve(dir,'local/water-blends.json'),JSON.stringify(rows,null,2));console.log(rows.map(r=>`${r.size} ${r.phase} push=${r.pushMs.toFixed(2)}ms allocated=${r.extraBytes}`).join('\n'));
