import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {HERE,LOCAL,hash,json} from './common.mjs';
const original=JSON.parse(readFileSync(resolve(LOCAL,'measurements.json')));
const missing=original.rows.filter(r=>r.stage==='bench'&&r.load.mean===null);
if(!missing.length){console.log('All timing cells have load samples');process.exit(0);}
// Identical experiment, separate result file. Rerun the entire warm-up + three samples;
// never attach a later load reading to an earlier timing.
const code=readFileSync(resolve(HERE,'measure.mjs'),'utf8').replaceAll("'./common.mjs'","'../common.mjs'").replaceAll("'./load.mjs'","'../load.mjs'").replaceAll('measurements.json','load-repair-measurements.json');
writeFileSync(resolve(LOCAL,'repair-measure.mjs'),code);
for(const r of missing){await new Promise((res,rej)=>{const child=spawn(process.execPath,[resolve(LOCAL,'repair-measure.mjs'),'--engines',r.engine,'--backend',r.backend,'--counts',String(r.threads),'--filter','^'+r.id+'$','--resume'],{cwd:HERE,env:process.env,stdio:'inherit',windowsHide:true});child.on('error',rej);child.on('exit',c=>c?rej(Error('Load repair failed')):res());});}
const repair=JSON.parse(readFileSync(resolve(LOCAL,'load-repair-measurements.json'))),changes=[];
for(const r of missing){const replacement=repair.rows.find(c=>c.engine===r.engine&&c.id===r.id&&c.backend===r.backend&&c.threads===r.threads);if(!replacement||replacement.load.mean===null)throw Error('Repair still has no load');const i=original.rows.indexOf(r);original.rows[i]={...replacement,loadRepair:true};changes.push({engine:r.engine,id:r.id,backend:r.backend,threads:r.threads,originalSamples:r.samples.map(s=>s.ms),originalLoad:r.load,replacementSamples:replacement.samples.map(s=>s.ms),replacementLoad:replacement.load});}
json('load-repairs.json',{fingerprint:repair.fingerprint,rawSha256:hash(readFileSync(resolve(LOCAL,'load-repair-measurements.json'))),changes});
json('before-load-repair.json',JSON.parse(readFileSync(resolve(LOCAL,'measurements.json'))));
json('measurements.json',original);
