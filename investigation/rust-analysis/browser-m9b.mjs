import {createServer} from 'node:http';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {LOCAL,deps,arg,hash,json} from './common.mjs';
import {loadSampler} from './load.mjs';
const playwright=process.env.DGM_PLAYWRIGHT?deps(process.env.DGM_PLAYWRIGHT):deps('playwright');
const fingerprint=hash(Buffer.concat(['m9b-worker.js','analysis.wasm'].map(n=>readFileSync(resolve(LOCAL,n)))));
const dir=resolve(LOCAL,'m9b-browser-records');mkdirSync(dir,{recursive:true});
const server=createServer((req,res)=>{const p=resolve(LOCAL,new URL(req.url,'http://localhost').pathname.slice(1));if(!p.startsWith(LOCAL+sep)||!existsSync(p)){res.writeHead(404).end();return;}if(p.endsWith('.gz'))res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/json');res.end(readFileSync(p));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';const sampler=loadSampler();
try{for(const engine of arg('engines','chromium,firefox,webkit').split(',')){
const browser=await playwright[engine].launch({headless:true});try{const page=await browser.newPage();await page.goto(base+'m9b-worker.js');await page.evaluate(url=>new Promise((res,rej)=>{window.raWorker=new Worker(url,{type:'module'});window.raWorker.onmessage=e=>e.data.ready&&res(true);window.raWorker.onerror=e=>rej(Error(e.message));}),base+'m9b-worker.js');
const [shard,total]=arg('shard','0/1').split('/').map(Number);const cases=JSON.parse(readFileSync(resolve(LOCAL,'corpus.json'))).cases.filter(c=>c.id.startsWith('m9b-')&&parseInt(hash(c.id).slice(0,8),16)%total===shard);const completed=new Set();
do{for(const c of cases){if(completed.has(c.id))continue;const snapshot=resolve(LOCAL,'cases',c.id+'.m9b.json.gz');if(!existsSync(snapshot))continue;const compressed=readFileSync(snapshot);try{gunzipSync(compressed);}catch{continue;}const input=hash(compressed),path=resolve(dir,engine+'-'+c.id+'-'+fingerprint+'.json');if(existsSync(path)&&JSON.parse(readFileSync(path)).input===input){completed.add(c.id);continue;}sampler.reset();const row=await page.evaluate(c=>new Promise((res,rej)=>{window.raWorker.onmessage=e=>e.data.ok?res(e.data):rej(Error(e.data.error));window.raWorker.postMessage(c);}),{id:c.id,bench:/(96|128|256)-1$/.test(c.id)});writeFileSync(path,JSON.stringify({engine,version:browser.version(),fingerprint,input,...row,load:sampler.summary()}));completed.add(c.id);if(completed.size%50===0)console.log(engine,'M9b rows',completed.size+'/'+cases.length);json('m9b-'+engine+'-progress-'+shard+'.json',{done:completed.size,total:cases.length});}
if(process.argv.includes('--follow')&&completed.size<cases.length)await new Promise(r=>setTimeout(r,5000));
}while(process.argv.includes('--follow')&&completed.size<cases.length);
}finally{await browser.close();}}
}finally{sampler.stop();server.close();}
