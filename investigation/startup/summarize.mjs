import { readFileSync,writeFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summary,traceCost } from './metrics.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const file=resolve(process.argv[2]??`${here}/local/results.json`);
const prefix=process.argv[3]?`${process.argv[3]}-`:'';
const raw=JSON.parse(readFileSync(file));
for(const r of raw.results){const events=JSON.parse(readFileSync(resolve(here,r.trace))).traceEvents;r.parse=traceCost(events,/Parse|parse/);r.compile=traceCost(events,/Compile|compile/);r.evaluate=traceCost(events,/EvaluateScript|FunctionCall/);}
raw.environment.cpuThrottling='DevTools page 1x/4x; worker CPU stays native, verified by cpu-probe.mjs';
raw.environment.traceClock='thread CPU (tts/tdur), union of nested slices per thread; parse/compile can overlap';
writeFileSync(file,JSON.stringify(raw,null,2));
const metrics=['editable','firstFrame','fcp','response','workerReady','projectOpen','parse','compile','evaluate','transferred'];
const rows=[];
const groups=new Map();
for(const r of raw.results){const key=[r.variant,r.connection,r.cpu,r.visit].join(',');const a=groups.get(key)??[];a.push(r);groups.set(key,a);}
for(const [key,runs] of groups)rows.push({group:key,runs:runs.length,...Object.fromEntries(metrics.map(k=>[k,runs.every(r=>Number.isFinite(r[k]))?summary(runs.map(r=>r[k])):null]))});
writeFileSync(resolve(here,`${prefix}MEASUREMENTS.csv`),'variant,connection,cpu,visit,runs,'+metrics.flatMap(k=>[`${k}_median`,`${k}_worst`]).join(',')+'\n'+rows.map(r=>[r.group,r.runs,...metrics.flatMap(k=>r[k]?[r[k].median,r[k].worst]:['',''])].join(',')).join('\n')+'\n');
writeFileSync(resolve(here,`${prefix}summary.json`),JSON.stringify(rows,null,2));
console.log(rows.map(r=>({group:r.group,editable:r.editable,parse:r.parse,compile:r.compile})));
