// Adapted from rust-water/browser.mjs: one worker/retained Wasm arena per engine.
import {createServer} from 'node:http';
import {readFileSync,existsSync,appendFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import {cpus,freemem} from 'node:os';
import {loadSampler} from './load.mjs';
import {HERE,LOCAL,deps,arg,json,hash} from './common.mjs';
const pw=createRequire(resolve(process.env.DGM_BROWSER_DEPS??resolve(LOCAL,'browser-deps'),'package.json'))('playwright');
const server=createServer((req,res)=>{const path=resolve(LOCAL,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1));if(!path.startsWith(LOCAL+sep)||!existsSync(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(path));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
const fingerprint=hash(Buffer.concat(['forces.wasm','worker.js'].map(n=>readFileSync(resolve(LOCAL,n))))),sampler=loadSampler(),rows=[];
try{for(const engine of arg('engines','chromium,firefox,webkit').split(',')){const browser=await pw[engine].launch({headless:true});try{const page=await browser.newPage();page.setDefaultTimeout(1800000);await page.goto(base+'worker.js');await page.evaluate(url=>{window.taskWorker=new Worker(url,{type:'module'});},base+'worker.js');
const send=d=>page.evaluate(d=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Force worker timed out '+JSON.stringify(d))),300000);window.taskWorker.onmessage=e=>{clearTimeout(timer);e.data.ok?resolve(e.data):reject(Error(JSON.stringify(e.data)));};window.taskWorker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};window.taskWorker.postMessage(d);}),d);
for(const verb of arg('verbs','footprint,craterize,erupt,quake').split(','))for(const size of arg('sizes','128,256,512').split(',').map(Number))for(let k=Number(arg('start','0'));k<Number(arg('start','0'))+Number(arg('count','6'));k++){
 const d={verb,size,k,random:process.argv.includes('--random'),bench:process.argv.includes('--bench'),reps:Number(arg('reps','3'))};sampler.reset();if(d.bench)await sampler.observe();const result=await send(d);if(d.bench)await sampler.observe();const row={engine,version:browser.version(),...result,fingerprint,load:{...sampler.summary(),freeMemory:freemem()}};rows.push(row);appendFileSync(resolve(LOCAL,'browser-'+arg('name','smoke')+'.jsonl'),JSON.stringify(row)+'\n');if(k%10===0)console.log(engine,verb,size,k,'PASS');}
}finally{await browser.close();}}json('browser-'+arg('name','smoke')+'.json',{rows,machine:cpus()[0].model,logicalCores:cpus().length});}finally{sampler.stop();server.close();}
