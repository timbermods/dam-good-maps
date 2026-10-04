// Offline compact index; large traces and per-hitch task stacks remain ignored.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const dir=import.meta.dirname,base=resolve(dir,'local/round3/runs');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const profiles=[];
for(const folder of readdirSync(base).filter(n=>n.endsWith('-profile'))){
 const path=resolve(base,folder),file=resolve(path,'attribution.json');if(!existsSync(file))continue;
 const d=JSON.parse(readFileSync(file)),m=JSON.parse(readFileSync(resolve(path,'manifest.json'))),prefix=m.results[0].prefix??'1';
 const threads=[...new Set(d.tasks.map(t=>t.thread))].map(thread=>({thread,tasks:d.tasks.filter(t=>t.thread===thread).length,longest:d.tasks.filter(t=>t.thread===thread).slice(0,4).map(t=>({pid:t.pid,tid:t.tid,start:t.start,wallMs:t.wallMs,cpuMs:t.cpuMs,nonCpuMs:t.nonCpuMs,sampleCount:t.sampleCount,leaf:t.leaf.slice(0,4),ancestry:t.ancestry.filter(f=>f.source).slice(0,7),gc:t.gc}))}));
 profiles.push({folder,alignment:d.alignment,limits:d.limits,sources:Object.fromEntries(['manifest.json',prefix+'-raw.json',prefix+'-cpu.json',prefix+'-trace.json','attribution.json'].map(n=>[n,hash(resolve(path,n))])),threads,hitchColumns:['atMs','dtMs','sampledMainTaskStartsUs'],hitches:d.hitchAttributions.map(h=>[h.at,h.dt,h.mainTasks.filter(t=>t.sampleCount>5).map(t=>t.start)])});
}
writeFileSync(resolve(dir,'brush-attribution.json'),JSON.stringify({scope:'Diagnostic profiles only. No 3–4 second released native freeze reproduced. Every residual gap remains unattributed; CPU ancestry is not elapsed-time overlap.',profiles})+'\n');
console.log('Indexed '+profiles.length+' profiles');
