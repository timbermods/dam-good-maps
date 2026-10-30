// Read-only current-ref anchors, not candidate comparisons or browser acceptance tests.
// DGM_DEPS: existing dependency checkout; DGM_M9B: read-only src/package.json snapshot.
// All generated bundles, raw samples and profiles stay in ignored local/.
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import {cpus, totalmem} from 'node:os';
import {createHash} from 'node:crypto';
import {Session} from 'node:inspector';
const here=dirname(fileURLToPath(import.meta.url)), root=resolve(here,'../..'), local=resolve(here,'local');
mkdirSync(local,{recursive:true});
const deps=createRequire(resolve(process.env.DGM_DEPS,'package.json'));
const {build}=deps('esbuild');
const median=a=>{a=[...a].sort((x,y)=>x-y);return (a[(a.length-1)>>1]+a[a.length>>1])/2;};
const hash=b=>createHash('sha256').update(b).digest('hex');
let load=[], partial='';
const sampler=spawn('pwsh',['-NoProfile','-File',resolve(here,'load.ps1')],{windowsHide:true});
sampler.stdout.on('data',b=>{partial+=b;const lines=partial.split(/\r?\n/);partial=lines.pop();for(const line of lines)if(line.trim()&&Number.isFinite(Number(line)))load.push(Number(line));});
sampler.stderr.on('data',b=>process.stderr.write(b));
sampler.on('error',e=>console.error('Load sampling unavailable:',e.message));
const rows=[], profiles=[];
try {
 await new Promise(r=>setTimeout(r,1500));
 for(const [ref,source] of [['dev',root],['m9b',process.env.DGM_M9B]]) {
  const entry=`export {generate} from ${JSON.stringify(resolve(source,'src/core/gen/generate.ts'))};
export {makeSpec} from ${JSON.stringify(resolve(source,'src/core/spec/mapspec.ts'))};
export {generatedDocument,encodeProject,decodeProject} from ${JSON.stringify(resolve(source,'src/core/doc/document.ts'))};
export {MapSession} from ${JSON.stringify(resolve(source,'src/core/doc/session.ts'))};`;
  const bundle=resolve(local,ref+'.cjs');
  await build({stdin:{contents:entry,resolveDir:source,loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'cjs',nodePaths:[resolve(process.env.DGM_DEPS,'node_modules')],logLevel:'warning'});
  const api=createRequire(import.meta.url)(bundle);
  for(const size of [128,256]) {
   const spec=api.makeSpec({seed:1,size:{x:size,y:size},theme:'riverValley'});
   api.generate(spec); // Same input warm-up; excluded.
   for(let rep=0;rep<3;rep++) {
    await new Promise(r=>setTimeout(r,50)); // Flush warm-up/previous-operation sampler output first.
    load=[];const cpu0=process.cpuUsage(), t0=performance.now();let firstLand=null;
    const result=api.generate(spec,{onLand(){firstLand??=performance.now()-t0;}});
    const final=performance.now()-t0, cpu=process.cpuUsage(cpu0);
    const doc=api.generatedDocument(result), save0=performance.now();
    const bytes=api.encodeProject(doc), save=performance.now()-save0;
    const open0=performance.now(), session=api.MapSession.open(api.decodeProject(bytes));
    const reopen=performance.now()-open0;
    await new Promise(r=>setTimeout(r,20)); // Deliver sampler output after synchronous work.
    const row={ref,size,rep,firstLand,firstWater:result.timings.firstWater,final,cpuMs:(cpu.user+cpu.system)/1000,save,reopen,loadMedian:load.length?median(load):null,loadWorst:load.length?Math.max(...load):null,loadSamples:load.length,passed:result.report.passed,attempts:result.attempts,settleTicks:result.built.settle.ticks,exportBytes:result.bytes.length,exportHash:hash(result.bytes),reopenedHeightsHash:hash(session.built.heights),projectBytes:bytes.length};
    rows.push(row);writeFileSync(resolve(local,'samples.json'),JSON.stringify(rows,null,2)+'\n');
    console.log(JSON.stringify(row));
   }
   if(size===256) {
    const inspector=new Session();inspector.connect();
    const post=(method,params={})=>new Promise((res,rej)=>inspector.post(method,params,(e,r)=>e?rej(e):res(r)));
    await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');
    api.generate(spec);
    const {profile}=await post('Profiler.stop');inspector.disconnect();
    writeFileSync(resolve(local,ref+'.cpuprofile'),JSON.stringify(profile));
    const nodes=new Map(profile.nodes.map(n=>[n.id,n.callFrame])), counts=new Map();
    for(const id of profile.samples){const f=nodes.get(id),key=f.functionName||'(anonymous)';counts.set(key,(counts.get(key)||0)+1);}
    profiles.push({ref,seed:1,size,sha256:hash(JSON.stringify(profile)),method:'1 ms V8 executing leaf samples, separate untimed generation',samples:profile.samples.length,top:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([name,n])=>({name,samples:n,percent:100*n/profile.samples.length}))});
   }
  }
 }
 const cells=[];
 for(const ref of ['dev','m9b'])for(const size of [128,256]){
  const rs=rows.filter(r=>r.ref===ref&&r.size===size),cell={ref,size,repeats:rs.length};
  for(const k of ['firstLand','firstWater','final','cpuMs','save','reopen','loadMedian','loadWorst']){const a=rs.map(r=>r[k]).filter(Number.isFinite);cell[k]=a.length?{median:median(a),worst:Math.max(...a)}:null;}
  cell.identicalRepeatExports=new Set(rs.map(r=>r.exportHash)).size===1;cell.passed=rs.every(r=>r.passed);cells.push(cell);
 }
 const evidence={dev:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),m9b:execFileSync('git',['rev-parse','origin/feature/m9b'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,cpu:cpus()[0].model,logicalCpus:cpus().length,memoryGiB:totalmem()/2**30,dependencies:process.env.DGM_DEPS,esbuild:deps('esbuild/package.json').version,fflate:JSON.parse(readFileSync(resolve(process.env.DGM_DEPS,'node_modules/fflate/package.json'))).version,loadMethod:'Windows PDH whole-machine Processor(_Total), 1 s, uncontrollable shared load; median of per-run sample medians / worst sample. Null when no sample.',method:'Sequential refs, one same-input warmup per cell, three repetitions, seed 1 River Valley/default. Headless Node operation times exclude bundling/network/UI/GPU. Ref outputs differ; never a causal speedup comparison. Save = encodeProject of a fresh zero-edit document; reopen = decodeProject + MapSession.open. Generation CPU = process.cpuUsage (not per-thread CPU).',cells,profiles};
 evidence.rawSamples=rows;
 writeFileSync(resolve(here,'MEASUREMENTS.json'),JSON.stringify(evidence,null,2)+'\n');
} finally {sampler.kill();}
