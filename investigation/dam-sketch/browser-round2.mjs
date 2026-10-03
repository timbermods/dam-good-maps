import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import {cpus} from 'node:os';
import {HERE,LOCAL,deps,hash,json,localJson,stats,loadSampler} from './round2-common.mjs';
const browserRequire=createRequire(resolve(process.env.DGM_BROWSER_DEPS??process.env.DGM_DEPS??LOCAL,'package.json'));
const playwright=browserRequire(process.env.DGM_PLAYWRIGHT??'playwright');
function firefoxRuntime(){
 const executablePath=process.env.DGM_FIREFOX_EXECUTABLE;if(!executablePath)throw Error('DGM_FIREFOX_EXECUTABLE must name the corrected private Firefox executable');
 const archive=readFileSync(resolve(executablePath,'../omni.ja')),runtime=deps('fflate').unzipSync(archive)['chrome/juggler/content/content/Runtime.js'];
 const text=new TextDecoder().decode(runtime);
 if(!text.includes('this._debugger.allowUnobservedWasm = true')||!text.includes('this._debugger.allowUnobservedAsmJS = true'))throw Error('Firefox debugger pins Wasm to baseline');
 const firefoxUserPrefs={'javascript.options.wasm_baselinejit':false,'javascript.options.wasm_optimizingjit':true,'javascript.options.wasm_lazy_tiering':false};
 return {options:{executablePath,firefoxUserPrefs},evidence:{executableSha256:hash(readFileSync(executablePath)),archiveSha256:hash(archive),runtimeSha256:hash(runtime),firefoxUserPrefs}};
}
const server=createServer((req,res)=>{
 const path=resolve(LOCAL,new URL(req.url,'http://localhost').pathname.slice(1));
 if(!path.startsWith(LOCAL+sep)||!existsSync(path)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.html')?'text/html':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(path));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/',sampler=loadSampler(),records=[];let firefoxEvidence=null;
mkdirSync(resolve(HERE,'captures'),{recursive:true});
try{
 await sampler.ready();
 const selection=process.env.DGM_ENGINES??'chromium,firefox,webkit';
 for(const engine of selection.split(',')){
  const runtime=engine==='firefox'?firefoxRuntime():null;
  if(runtime)firefoxEvidence=runtime.evidence;
  const browser=await playwright[engine].launch({headless:true,...runtime?.options});
  try{
   const page=await browser.newPage({viewport:{width:820,height:720}});page.setDefaultTimeout(300000);
   page.on('pageerror',e=>{throw e;});await page.goto(url+'browser.html');
   const cases=JSON.parse(readFileSync(resolve(HERE,'benchmarks.json'))).cases.filter(c=>c.map.startsWith('riverValley'));
   for(const c of cases)for(let rep=0;rep<3;rep++){
    const start=Date.now();
    const raw=await page.evaluate(c=>window.runSketch(c),{mapUrl:'maps/'+c.map+'.timber',size:c.size,strokes:c.strokes});
    const load=sampler.summary(start),record={engine,version:browser.version(),map:c.map,case:c.case,size:c.size,rep,load,
     mainFrameWorkMs:stats(raw.frames.map(f=>f.workMs)),mainFramesOver16_7:raw.frames.filter(f=>f.workMs>16.7).length,
     rafIntervalMs:stats(raw.frames.slice(1).map(f=>f.intervalMs)),rafIntervalsOver16_7:raw.frames.filter(f=>f.intervalMs>16.7).length,
     firstVisibleMs:stats(raw.changes.map(c=>c.firstVisibleMs).filter(v=>v!==null)),wallChanges:raw.changes.map(c=>({id:c.id,firstVisibleMs:c.firstVisibleMs,lastTicks:c.lastTicks})),changes:raw.changes.length,changesWithoutPreview:raw.changes.filter(c=>c.firstVisibleMs===null).length,
     cadenceMs:stats(raw.changes.flatMap(c=>c.paintGaps)),workerSliceMs:stats(raw.messages.map(m=>m.sliceMs)),cancelAckMs:stats(raw.cancellations.map(c=>c.ackMs).filter(v=>v!==null)),
     staleDisplayed:raw.staleDisplayed,staleDropped:raw.staleDropped,cancellations:raw.cancellations.length,cancelEvents:raw.cancellations,
     fillMs:raw.fillMs,droughtMs:raw.droughtMs,totalMs:raw.totalMs,final:raw.final,longTasks:raw.longTasks};
    if(record.staleDisplayed)throw Error('Stale water rendered');
    records.push(record);localJson('browser-raw-'+engine+'-'+c.size+'-'+cases.indexOf(c)+'-'+rep+'.json',raw);
    json('browser-timings.json',{machine:cpus()[0].model,logicalThreads:cpus().length,date:new Date().toISOString(),method:'Headless browsers; 12 tile changes scheduled at least 100 ms apart in rAF (matched wall-change cadence across refresh rates); 8-tick fill/128-tick drought worker slices; one 128-tick warmup per fresh worker; three repetitions per size/wall. Authored wall raster draws immediately on a separate main-thread layer. Paint timing is canvas upload in rAF, an earliest paint opportunity, not compositor presentation. Frame work sums message handlers and rAF drawing/drag callbacks; rAF intervals and supported long tasks separately expose host/browser stalls. Map parsing/Wasm init excluded. Every wall/control simulation and report included. CPU spans the entire repetition including startup/warmup.',firefox:firefoxEvidence,records});
    console.log(engine,c.size,c.case,rep,'preview',record.firstVisibleMs.median?.toFixed(1),'frame max',record.mainFrameWorkMs.max?.toFixed(1),'load',load.mean?.toFixed(1));
    if(rep===0&&c.size===256&&cases.indexOf(c)===3)await page.screenshot({path:resolve(HERE,'captures',engine+'-256.png')});
   }
  }finally{await browser.close();}
 }
}finally{sampler.stop();server.close();}
