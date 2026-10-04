import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import {readFileSync,writeFileSync} from 'node:fs';import {strict as assert} from 'node:assert';import {dir} from '../build.mjs';
const variants=Object.fromEntries(await Promise.all(['before','cache'].map(async v=>[v,await import(pathToFileURL(resolve(dir,`local/noise-${v}.mjs`)))])));
let checked=0;
for(let seed=1;seed<=140;seed++)for(const cell of[2,3,6,8,10,16,32,50])for(let y=-17;y<=270;y+=7)for(let x=-17;x<=270;x+=11){const a=variants.before.fbm(seed,x+0.391,y-0.739,cell,4),b=variants.cache.fbm(seed,x+0.391,y-0.739,cell,4);assert(Object.is(a,b));checked++;}
const rows=[];let sum=0;
for(let rep=0;rep<5;rep++)for(const v of rep%2?['cache','before']:['before','cache']){const m=variants[v],c=process.threadCpuUsage(),t=performance.now();for(let k=0;k<8;k++)for(let y=0;y<256;y++)for(let x=0;x<256;x++)sum+=m.fbm(13+k,x+2.17,y-1.42,16,4);const cpu=process.threadCpuUsage(c);rows.push({variant:v,rep,wall:performance.now()-t,cpu:(cpu.user+cpu.system)/1000});console.log(v,rep,rows.at(-1));}
writeFileSync(resolve(dir,'local/noise-bench.json'),JSON.stringify({checked,sum,rows},null,2));
