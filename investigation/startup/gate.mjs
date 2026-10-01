import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { summary } from './metrics.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const arg=(key,def)=>{const i=process.argv.indexOf(`--${key}`);return i<0?def:process.argv[i+1];};
const dist=resolve(arg('dist',join(here,'local/dist-after')));
const failures=[];
const requireBudget=(ok,text)=>{if(!ok)failures.push(text);};
const manifest=JSON.parse(readFileSync(join(dist,'.vite/manifest.json')));
const entry=manifest['index.html'];
if(!entry)throw Error('Build with manifest:true');
const seen=new Set();let entryBytes=0;
function visit(c) {if(seen.has(c.file))return;seen.add(c.file);entryBytes+=gzipSync(readFileSync(join(dist,c.file))).length;for(const i of c.imports??[])visit(manifest[i]);}
visit(entry);
requireBudget(entryBytes<=20*1024,`Initial JS ${entryBytes} > 20 KiB gzip`);
const startup=new Set(seen);
function include(c){if(!c||startup.has(c.file))return;startup.add(c.file);for(const i of c.imports??[])include(manifest[i]);}
include(manifest['src/editor/Editor.tsx']);
for(const name of readdirSync(join(dist,'assets')).filter(x=>/^(generator|checks|startCheck)\.worker-.*\.js$/.test(x)))startup.add(`assets/${name}`);
const js=[...startup].reduce((n,name)=>n+gzipSync(readFileSync(join(dist,name))).length,0);
requireBudget(js<=600*1024,`Startup JS including workers ${js} > 600 KiB gzip`);
const index=JSON.parse(readFileSync(join(dist,'first-visit/index.json')));
for(const map of index.maps)requireBudget(readFileSync(join(dist,'first-visit',map.file)).length<=240*1024,`${map.file} > 240 KiB`);
const input=arg('results',null);
if(input) {
  const results=JSON.parse(readFileSync(input)).results.filter(r=>['after','site'].includes(r.variant));
  requireBudget(results.length>0,'No adopted startup runs');
  for(const r of results) {
    requireBudget(r.errors.length===0,`Page error: ${r.errors}`);
    requireBudget(Object.values(r.correctness??{}).every(Boolean) && r.correctness?.landChanged, 'Real edit/undo failed');
    if(r.visit==='cold')requireBudget(r.transferred<=820*1024,`Cold transfer ${r.transferred} > 820 KiB`);
  }
  for(const connection of ['fast','typical'])for(const cpu of [1,4])for(const visit of ['cold','warm']){
    const rows=results.filter(r=>r.connection===connection&&r.cpu===cpu&&r.visit===visit);
    requireBudget(rows.length>=3,`Need >=3 repeats: ${connection}/${cpu}/${visit}`);
    if(rows.length){const s=summary(rows.map(r=>r.editable));const limit=visit==='warm'?(cpu===1?1500:2500):(cpu===1?3000:4000);
      requireBudget(s.median<=limit,`${connection}/${cpu}/${visit}: median ${s.median} > ${limit} ms`);
      requireBudget(s.worst<=limit*1.5,`${connection}/${cpu}/${visit}: worst ${s.worst} > ${limit*1.5} ms`);
    }
  }
}
console.log({entryGzip:entryBytes,allJsGzip:js,failures});
if(failures.length)process.exitCode=1;
