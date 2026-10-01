import {api,LOCAL,json,sameWater,hash} from './common.mjs';
import {resolve} from 'node:path';
import {serialize,deserialize} from 'node:v8';
import {writeFileSync, mkdirSync,existsSync,readFileSync} from 'node:fs';
const a=api(),b=api('fast'),rows=[];
mkdirSync(resolve(LOCAL,'inputs'),{recursive:true});
for(const size of [128,256]) for(const theme of ['riverValley','lakeBasin','islands']) {
  const path=resolve(LOCAL,'inputs',`${theme}-${size}.bin`);
  const g=existsSync(path)?null:a.generate(a.makeSpec({seed:1,theme,size:{x:size,y:size}}));
  const m=g?g.built.waterModel:deserialize(readFileSync(path));
  if(g) writeFileSync(path,serialize(m));
  const times={baseline:[],fast:[]};
  for(let k=0;k<4;k++) {
    let aa,bb;
    for(const [name,impl] of (k%2?[['fast',b],['baseline',a]]:[['baseline',a],['fast',b]])) {
      const t=performance.now();const out=impl.canonicalSettle(structuredClone(m));
      times[name].push(performance.now()-t);if(name==='baseline') aa=out;else bb=out;
    }
    sameWater(aa,bb,`${theme}/${size}`);
  }
  const median=vs=>vs.slice(1).sort((x,y)=>x-y)[1];
  const row={theme,size,times,baselineMs:median(times.baseline),fastMs:median(times.fast),ratio:median(times.baseline)/median(times.fast),inputHash:hash(serialize(m))};
  rows.push(row);json(resolve(LOCAL,'quick-bench.json'),rows);console.log(JSON.stringify(row));
}
