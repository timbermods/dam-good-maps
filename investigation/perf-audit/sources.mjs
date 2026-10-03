// Snapshot provenance only. Reads prior investigations; never runs or edits their harnesses.
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const workspace=process.env.DGM_INVESTIGATIONS;
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const sources=[];
for(const name of ['water-speed','parallel-water','startup','scaling','performance','determinism']){
 const ref='investigation/'+name,sha=git('rev-parse',ref);
 const files=['REPORT.md',...(name==='performance'?['ROUND2.md','brush-findings.md']:[]),...(name==='determinism'?['AUDIT.md']:[])];
 for(const file of files){const path=`investigation/${name}/${file}`,body=git('show',`${sha}:${path}`);sources.push({name,sha,path,sha256:hash(body),url:`https://github.com/timbermods/dam-good-maps/blob/${sha}/${path}`});}
}
for(const name of ['rust-water','gen-speed']){
 const base=resolve(workspace,`investigation/${name}/local/checkout/investigation/${name}`);
 const files=name==='rust-water'?['INTEGRATION.md','PROTOCOL.md','water.ts','local/browser-smoke.json','local/curve.json','local/shared-provenance.json','local/shared-runtime.ts','local/shared-kernel.rs']:['INTEGRATION.md','PROPOSALS.md','SHARED-COST.json','BASE.json'];
 sources.push({name,checkout:git('rev-parse',`investigation/${name}`),reportAvailable:existsSync(resolve(base,'REPORT.md')),status:'Local in-progress material; not a published final speed/identity matrix.'});
 for(const file of files)if(existsSync(resolve(base,file)))sources.push({name,path:`investigation/${name}/${file}`,sha256:hash(readFileSync(resolve(base,file))),uncommittedLocal:true});
 if(name==='gen-speed')for(const theme of ['riverValley','canyon','islands']){
  const file=resolve(base,'local',theme+'.cpuprofile');if(!existsSync(file))continue;
  const bytes=readFileSync(file),p=JSON.parse(bytes),frames=new Map(p.nodes.map(n=>[n.id,n.callFrame]));
  const flow=p.samples.filter(id=>frames.get(id).functionName==='substep').length;
  sources.push({name,path:`investigation/gen-speed/local/${theme}.cpuprofile`,sha256:hash(bytes),theme,method:'Existing seed-1 V8 leaf sample count / all samples; diagnostic, not repeated latency.',substepPercent:100*flow/p.samples.length});
 }
}
writeFileSync(resolve(here,'SOURCES.json'),JSON.stringify({captured:new Date().toISOString(),dev:git('rev-parse','HEAD'),m9b:git('rev-parse','origin/feature/m9b'),sources},null,2)+'\n');
console.log(JSON.stringify(sources.filter(s=>s.substepPercent!==undefined)));
