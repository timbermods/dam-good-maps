import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setup,act,idle,snapshot} from './scenarios.mjs';
import {ContinuousLoad} from './continuous-load.mjs';
import {summarize} from './metrics.mjs';
const dir=import.meta.dirname,flags=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const phase=flags.phase??'before',look=flags.look??'standard',profile=flags.profile??'native',profiling=flags.profileCPU==='true';
if(!['before','after'].includes(phase)||!['standard','high'].includes(look)||!['native','laptop'].includes(profile))throw Error('Invalid configuration');
const output=resolve(dir,'local/round3/runs',new Date().toISOString().replaceAll(':','-')+'-'+look+'-'+profile+'-'+phase+(profiling?'-profile':''));mkdirSync(output,{recursive:true});
const lock=resolve(dir,'local/runner.lock');if(existsSync(lock)){const l=JSON.parse(readFileSync(lock));try{process.kill(l.pid,0);throw Error('Live serial runner '+l.pid);}catch(e){if(e.code!=='ESRCH')throw e;}unlinkSync(lock);}writeFileSync(lock,JSON.stringify({pid:process.pid}));
const quiet=JSON.parse(readFileSync(resolve(dir,'budgets.json'))).quiet,ownsLoad=!flags.loadSession,load=ownsLoad?ContinuousLoad.start(dir,quiet):new ContinuousLoad(flags.loadSession,quiet);
const build=resolve(dir,'local/round3/build',look,phase),provenance=JSON.parse(readFileSync(resolve(build,'provenance.json')));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const special=['probe.js','audio-worklet.js'].find(n=>p==='/investigation/performance/'+n);const f=special?resolve(dir,special):resolve(build,'.'+(p==='/'?'/index.html':p));if(!special&&!f.startsWith(build+'/')&&!f.startsWith(build+'\\')){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',mime[extname(f)]??'application/octet-stream');res.end(readFileSync(f));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const protocolFiles=['brush-run.mjs','brush-build.mjs','brush-look.mjs','brush-adoption.mjs','brush-evidence.mjs','probe.js','scenarios.mjs','metrics.mjs','continuous-load.mjs','coverage.mjs','load.ps1','laptop-profile.ps1','budgets.json'];
const protocol=protocolFiles.map(file=>({file,sha256:createHash('sha256').update(readFileSync(resolve(dir,file))).digest('hex')}));
mkdirSync(resolve(output,'protocol'),{recursive:true});for(const {file} of protocol)writeFileSync(resolve(output,'protocol',file),readFileSync(resolve(dir,file)));
const manifest={phase,look,profile,profiling,flags,provenance,protocol,loadSession:load.path,results:[]};const save=()=>writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2));save();
let browser,helper,attempt=0;
try{
 if(profile==='laptop'){const lease=resolve(output,'cpu-profile.json');helper=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(dir,'laptop-profile.ps1'),'-RunnerPid',String(process.pid),'-Output',lease],{windowsHide:true,stdio:'ignore'});for(let n=0;n<150&&!existsSync(lease);n++)await new Promise(r=>setTimeout(r,200));manifest.proxy=JSON.parse(readFileSync(lease));if(!manifest.proxy.ready)throw Error(manifest.proxy.error);}
 for(let repeat=1;repeat<=Number(flags.repeats??1);repeat++){
  const prefix=repeat+'-attempt-'+(++attempt);
  console.log('SETUP '+repeat+' '+output);browser=await chromium.launch({channel:'msedge',headless:false});const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});await context.addInitScript(()=>{let seed=4242;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);});const page=await context.newPage();page.setDefaultTimeout(180000);
  const spots=await setup(page,`http://127.0.0.1:${server.address().port}`,256,look);
  console.log('QUALIFY');if(!await load.qualify(Date.now()+15*60000))throw Error('Other-process quiet gate timeout');
  const lease=load.lease(),cdp=await context.newCDPSession(page);let cpu;
  if(profiling){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:100});await cdp.send('Profiler.start');await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.cpu_profiler,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});}
  const item={repeat,prefix,spots,version:browser.version(),loadGeneration:lease.generation,qualifiedAt:lease.qualifiedAt,from:Date.now(),
   device:await page.evaluate(async()=>{const startedAtUnixMs=Date.now();const device=await window.performanceHarness.begin();performance.mark('brush-measure-begin');return {...device,startedAtUnixMs,actualLook:window.dgm3d.renderer.look??'standard'};})};
  manifest.results.push(item);save();console.log('MEASURE '+repeat);
  await page.evaluate(()=>window.performanceHarness.note({kind:'stage',stage:'stroke'}));
  await act(page,{kind:'brush'},spots);await idle(page);
  if(flags.history==='true'){
   await page.evaluate(()=>window.performanceHarness.note({kind:'stage',stage:'undo'}));await page.keyboard.press('Control+z');await idle(page,{afterHistory:true});
   await page.evaluate(()=>window.performanceHarness.note({kind:'stage',stage:'redo'}));await page.keyboard.press('Control+y');await idle(page,{afterHistory:true});
  }
  const raw=await page.evaluate(()=>{performance.mark('brush-measure-end');return {...window.performanceHarness.end(),endedAtUnixMs:Date.now()};});raw.startedAtUnixMs=item.device.startedAtUnixMs;item.to=raw.endedAtUnixMs;
  writeFileSync(resolve(output,prefix+'-raw.json'),JSON.stringify(raw));item.metrics=summarize(raw,JSON.parse(readFileSync(resolve(dir,'budgets.json'))));
  if(profiling){cpu=(await cdp.send('Profiler.stop')).profile;writeFileSync(resolve(output,prefix+'-cpu.json'),JSON.stringify(cpu));const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');const {stream}=await done;const chunks=[];for(;;){const p=await cdp.send('IO.read',{handle:stream});chunks.push(p.data);if(p.eof)break;}await cdp.send('IO.close',{handle:stream});writeFileSync(resolve(output,prefix+'-trace.json'),chunks.join(''));}
  item.load=await load.finish(item.from,item.to);item.qualified=item.load.valid;item.status=item.qualified?'complete':'discarded-load';
  writeFileSync(resolve(output,prefix+'-snapshot.json'),JSON.stringify(await snapshot(page)));
  const exported=await page.evaluate(async()=>{const e=await window.dgmEditor.worker.exportTimber(true);return {ok:e.ok,errors:e.errors,fileName:e.fileName,bytes:Array.from(e.bytes)};});
  const bytes=Buffer.from(exported.bytes);writeFileSync(resolve(output,prefix+'-export.timber'),bytes);
  item.export={ok:exported.ok,errors:exported.errors,fileName:exported.fileName,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  item.geometry=await page.evaluate(async()=>{
   const r=window.dgm3d.renderer,out={};for(const key of ['water','falls','chunks']){
    const meshes=r[key];if(!(meshes instanceof Map))continue;const records=[];
    for(const [name,m] of [...meshes].sort(([a],[b])=>String(a).localeCompare(String(b)))){
     const attrs={};for(const [a,v] of Object.entries(m.geometry.attributes)){
      const data=v.array??v.data?.array;if(!data)continue;const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
      attrs[a]={type:data.constructor.name,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')};
     }const i=m.geometry.index?.array;records.push({name,attrs,index:i?Array.from(i):null});
    }out[key]=records;
   }return out;
  });
  if(flags.undo==='true'){await page.keyboard.press('Control+z');await idle(page,{afterHistory:true});item.undoStatus=await page.evaluate(()=>({status:document.querySelector('.water-bar')?.textContent,checks:[...document.querySelectorAll('.checks-dot')].map(e=>e.title),pending:window.dgmEditor.pendingTerrain(),waterQueue:window.dgm3d.renderer.waterQueue?.size}));await page.screenshot({path:resolve(output,prefix+'-undo.png')});}
  save();console.log('RESULT '+JSON.stringify({repeat,qualified:item.qualified,p99:item.metrics.p99,max:item.metrics.max,hitches:item.metrics.hitches.length,tasks:item.metrics.longTasks.length,undo:item.undoStatus}));await browser.close();browser=null;if(!item.qualified){load.invalidate('Outside load/gap');repeat--;}
 }
}catch(error){manifest.error=String(error);save();throw error;}finally{await browser?.close().catch(()=>{});if(ownsLoad)load.close();if(helper){writeFileSync(resolve(output,'cpu-profile.json.stop'),'restore');await new Promise(r=>helper.exitCode!==null?r():helper.once('exit',r));}server.close();unlinkSync(lock);}
