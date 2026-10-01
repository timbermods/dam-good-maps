// Headless cost of the exact worker open path for every randomized first map.
import { readFileSync,writeFileSync } from 'node:fs';
import { openProject,closeSession } from './local/after/src/worker/session.ts';
import { summary } from './metrics.mjs';
const base=new URL('local/after/public/first-visit/',import.meta.url);
const index=JSON.parse(readFileSync(new URL('index.json',base)));
const rows=[];
for(const map of index.maps){
  const bytes=new Uint8Array(readFileSync(new URL(map.file,base))),runs=[];
  for(let i=0;i<5;i++){const t=performance.now();const opened=openProject(bytes);runs.push(performance.now()-t);if(opened.info.W!==128||opened.info.H!==128)throw Error('Wrong first map size');closeSession();}
  rows.push({map:map.id,bytes:bytes.length,openMs:summary(runs)});
}
writeFileSync(new URL('MAPS.json',import.meta.url),JSON.stringify(rows,null,2));console.log(rows);
