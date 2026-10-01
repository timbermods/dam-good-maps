import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { summary } from './metrics.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const arg=(key,def)=>{const i=process.argv.indexOf(`--${key}`);return i<0?def:process.argv[i+1];};
const dist=resolve(arg('dist',join(here,'local/dist-after')));
const round2=process.argv.includes('--round2');
const budgets=round2?JSON.parse(readFileSync(join(here,'ROUND2-BUDGETS.json'))):{initialJsKiB:20,startupJsKiB:600,mapKiB:240,coldTransferKiB:820,repeats:3,coldNativeMs:3000,coldPage4xMs:4000,warmNativeMs:1500,warmPage4xMs:2500,worstFactor:1.5};
const failures=[];
const requireBudget=(ok,text)=>{if(!ok)failures.push(text);};
const manifest=JSON.parse(readFileSync(join(dist,'.vite/manifest.json')));
const entry=manifest['index.html'];
if(!entry)throw Error('Build with manifest:true');
const seen=new Set();let entryBytes=0;
function visit(c) {if(seen.has(c.file))return;seen.add(c.file);entryBytes+=gzipSync(readFileSync(join(dist,c.file))).length;for(const i of c.imports??[])visit(manifest[i]);}
visit(entry);
requireBudget(entryBytes<=budgets.initialJsKiB*1024,`Initial JS ${entryBytes} > ${budgets.initialJsKiB} KiB gzip`);
const startup=new Set(seen);
function include(c){if(!c||startup.has(c.file))return;startup.add(c.file);for(const i of c.imports??[])include(manifest[i]);}
include(manifest['src/editor/Editor.tsx']);
if(round2)include(manifest['src/render3d/prepared.ts']);
for(const name of readdirSync(join(dist,'assets')).filter(x=>/^(generator|checks|startCheck)\.worker-.*\.js$/.test(x)))startup.add(`assets/${name}`);
const js=[...startup].reduce((n,name)=>n+gzipSync(readFileSync(join(dist,name))).length,0);
requireBudget(js<=budgets.startupJsKiB*1024,`Startup JS including workers ${js} > ${budgets.startupJsKiB} KiB gzip`);
const index=JSON.parse(readFileSync(join(dist,'first-visit/index.json')));
if(round2)requireBudget(index.maps.length===6,'The first-visit index must contain all six maps');
for(const map of index.maps)requireBudget(readFileSync(join(dist,'first-visit',map.file)).length<=budgets.mapKiB*1024,`${map.file} > ${budgets.mapKiB} KiB`);
const input=arg('results',null);
if(input) {
  const results=JSON.parse(readFileSync(input)).results.filter(r=>(round2?['round2-after','site']:['after','site']).includes(r.variant));
  requireBudget(results.length>0,'No adopted startup runs');
  for(const r of results) {
    requireBudget(r.errors.length===0,`Page error: ${r.errors}`);
    requireBudget(['editAccepted','undoAccepted','landChanged','undoIdentical'].every(k=>r.correctness?.[k]===true), 'Real edit/undo failed');
    if(r.visit==='cold')requireBudget(r.transferred<=budgets.coldTransferKiB*1024,`Cold transfer ${r.transferred} > ${budgets.coldTransferKiB} KiB`);
    if(round2){requireBudget(r.selectedMapId===r.mapId,`Wrong map selected: ${r.selectedMapId}/${r.mapId}`);
      requireBudget(r.correctness?.width===128&&r.correctness?.height===128,'Wrong map dimensions');
      requireBudget(Number.isFinite(r.checksStart)&&r.checksStart>=r.firstFrame && r.marks['first-editable-frame']<=r.checksStart,'Checks started before the editable frame');}
  }
  for(const map of round2?index.maps:[{id:null}])for(const connection of ['fast','typical'])for(const cpu of [1,4])for(const visit of ['cold','warm']){
    const rows=results.filter(r=>(!round2||r.mapId===map.id)&&r.connection===connection&&r.cpu===cpu&&r.visit===visit);
    const key=`${map.id??'representative'}/${connection}/${cpu}/${visit}`;
    requireBudget(rows.length>=budgets.repeats,`Need >=${budgets.repeats} repeats: ${key}`);
    if(round2)requireBudget(new Set(rows.map(r=>r.run)).size===rows.length,`Duplicate repeat: ${key}`);
    if(rows.length){const s=summary(rows.map(r=>r.editable));const limit=visit==='warm'?(cpu===1?budgets.warmNativeMs:budgets.warmPage4xMs):(cpu===1?budgets.coldNativeMs:budgets.coldPage4xMs);
      requireBudget(s.median<=limit,`${key}: median ${s.median} > ${limit} ms`);
      const explicitWorst=visit==='warm'?(cpu===1?budgets.warmNativeWorstMs:budgets.warmPage4xWorstMs):(cpu===1?budgets.coldNativeWorstMs:budgets.coldPage4xWorstMs);
      const worstLimit=explicitWorst??limit*budgets.worstFactor;
      requireBudget(s.worst<=worstLimit,`${key}: worst ${s.worst} > ${worstLimit} ms`);
    }
  }
}
console.log({entryGzip:entryBytes,allJsGzip:js,failures});
if(failures.length)process.exitCode=1;
