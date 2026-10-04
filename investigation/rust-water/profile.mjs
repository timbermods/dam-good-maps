import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve,sep,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {HERE,LOCAL,deps,arg,hash} from './common.mjs';
import {loadSampler} from './load.mjs';
const profile=resolve(LOCAL,'profiles');mkdirSync(profile,{recursive:true});
if(!existsSync(resolve(LOCAL,'before-water.wasm'))||!existsSync(resolve(LOCAL,'before-water.ts')))throw Error('Run node prepare-profile-baseline.mjs first');
await deps('esbuild').build({entryPoints:[resolve(HERE,'profile-worker.ts')],outfile:resolve(LOCAL,'profile-worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const wasmPath=resolve(arg('wasm',resolve(LOCAL,'water.wasm')));
const server=createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),path=name==='water.wasm'?wasmPath:resolve(LOCAL,name);if(!path.startsWith(LOCAL+sep)||!existsSync(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(path));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
const pw=(process.env.DGM_BROWSER_DEPS?createRequire(resolve(process.env.DGM_BROWSER_DEPS,'package.json')):deps)('playwright');
const sampler=loadSampler(),tier=arg('tier','default'),tag=arg('tag',tier),rows=[];
const loadDeadline=Date.now()+15000;
while(!sampler.summary().samples&&Date.now()<loadDeadline)await new Promise(r=>setTimeout(r,100));
if(!sampler.summary().samples){sampler.stop();server.close();throw Error('CPU load sampler unavailable');}
try{for(const engine of arg('engines','firefox,webkit,chromium').split(',')){
 const env={...process.env};let firefoxUserPrefs={};
 if(engine==='firefox'&&tier!=='default')firefoxUserPrefs={'javascript.options.wasm_baselinejit':tier==='baseline','javascript.options.wasm_optimizingjit':tier!=='baseline','javascript.options.wasm_lazy_tiering':false};
 if(engine==='firefox'&&process.argv.includes('--gecko'))Object.assign(env,{MOZ_PROFILER_STARTUP:'1',MOZ_PROFILER_STARTUP_INTERVAL:'1',MOZ_PROFILER_STARTUP_ENTRIES:'10000000',MOZ_PROFILER_STARTUP_FEATURES:'js,stackwalk,cpu,leaf',MOZ_PROFILER_STARTUP_FILTERS:'GeckoMain,DOM Worker',MOZ_PROFILER_SHUTDOWN:resolve(profile,engine+'-'+tag+'.json')});
 if(engine==='webkit'&&tier!=='default')Object.assign(env,tier==='baseline'?{JSC_useOMGJIT:'false'}:{JSC_useOMGJIT:'true',JSC_thresholdForOMGOptimizeAfterWarmUp:'0',JSC_thresholdForOMGOptimizeSoon:'0'});
 if(engine==='webkit'&&process.argv.includes('--jsc-dump'))Object.assign(env,{JSC_dumpOptions:'3',JSC_dumpWasmDisassembly:'true'});
 const executable=engine==='firefox'?(process.env.DGM_FIREFOX_EXECUTABLE??pw.firefox.executablePath()):null;
 const browserRuntime=executable?{executableSha256:hash(readFileSync(executable)),archiveSha256:hash(readFileSync(resolve(dirname(executable),'omni.ja')))}:undefined;
 const browser=await pw[engine].launch({headless:true,env,firefoxUserPrefs,executablePath:engine==='firefox'?process.env.DGM_FIREFOX_EXECUTABLE:undefined});try{const page=await browser.newPage();await page.goto(base+'profile-worker.js');await page.evaluate(url=>{window.taskWorker=new Worker(url,{type:'module'});},base+'profile-worker.js');
 const send=data=>page.evaluate(data=>new Promise((res,rej)=>{window.taskWorker.onmessage=e=>e.data.ok?res(e.data):rej(Error(e.data.error));window.taskWorker.onerror=e=>rej(Error(e.message));window.taskWorker.postMessage(data);}),data);
 for(const id of arg('ids','m9b-lakeBasin-128-1').split(',')){sampler.reset();const caseRows=[];for(let rep=-1;rep<Number(arg('reps','3'));rep++)for(const variant of arg('variants','fast,before,current').split(',').sort((a,b)=>rep%2?a.localeCompare(b):b.localeCompare(a))){const r=await send({id,variant,prefix:arg('prefix','checks'),fixed:Number(arg('fixed','0')),chunk:Number(arg('chunk','0'))||undefined});const row={engine,version:browser.version(),browserRuntime,tier,tag,rep,...r,load:sampler.summary(),before:hash(readFileSync(resolve(LOCAL,'before-water.wasm'))),current:hash(readFileSync(wasmPath))};rows.push(row);caseRows.push(row);appendFileSync(resolve(profile,'measurements.jsonl'),JSON.stringify(row)+'\n');console.log(engine,tier,id,variant,rep,JSON.stringify(r.metrics));}for(const row of caseRows)row.caseLoad=sampler.summary();}
 }finally{await browser.close();}}
}finally{sampler.stop();server.close();}
writeFileSync(resolve(profile,tag+'-measurements.json'),JSON.stringify(rows,null,2)+'\n');
