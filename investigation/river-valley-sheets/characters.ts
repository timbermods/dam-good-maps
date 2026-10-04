import { readFileSync } from 'node:fs';
import { checkIntention } from '../../src/core/land/intentions';
for(const mode of ['dev','after'])for(const seed of [5,27]){
 const r=JSON.parse(readFileSync(`investigation/river-valley-sheets/local/${mode}/${seed}.json`,'utf8'));
 console.log(mode,seed,checkIntention('upper-lower',{W:r.W,H:r.H,h:r.heights,D:r.water,C:r.contamination,start:r.start} as any));
}
