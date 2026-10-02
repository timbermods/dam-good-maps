import {createServer} from 'node:http';
import {readFileSync,existsSync,appendFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {cpus,freemem} from 'node:os';
import {loadSampler} from './load.mjs';
import {HERE,ROOT,LOCAL,deps,arg,json,hash} from './common.mjs';
const server=createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),path=resolve(LOCAL,name);if(!path.startsWith(LOCAL+sep)||!existsSync(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(path));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
const fixtures=JSON.parse(gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz')))).fixtures;
const sampler=loadSampler();
const results=[];const playwright=(process.env.DGM_BROWSER_DEPS?createRequire(resolve(process.env.DGM_BROWSER_DEPS,'package.json')):deps)('playwright');
const fingerprint=hash(Buffer.concat(['water.wasm','coordinator.js'].map(n=>readFileSync(resolve(LOCAL,n)))));
try{for(const engine of arg('engines','chromium,firefox,webkit').split(',')){const browser=await playwright[engine].launch({headless:true}),page=await browser.newPage();await page.goto(base+'coordinator.js');
 await page.evaluate(url=>{window.taskWorker=new Worker(url,{type:'module'});},base+'coordinator.js');
 const send=data=>page.evaluate(data=>new Promise((res,rej)=>{window.taskWorker.onmessage=e=>e.data.ok?res(e.data):rej(Error(e.data.id+' '+e.data.error));window.taskWorker.onerror=e=>rej(Error(e.message));window.taskWorker.postMessage(data);}),data);
 if(!process.argv.includes('--skip-smoke')){const smoke=await send({smoke:true,fixtures});results.push({engine,version:browser.version(),stage:'smoke',...smoke});console.log(engine,'smoke',smoke.checks);}
 if(!process.argv.includes('--smoke')){const selection=arg('ids',''),shard=arg('shard','0/1').split('/').map(Number);if(shard.length!==2||!Number.isInteger(shard[0])||!Number.isInteger(shard[1])||shard[0]<0||shard[0]>=shard[1])throw Error('Expected --shard INDEX/COUNT');const cases=JSON.parse(readFileSync(resolve(LOCAL,'checks.json'))).cases.filter(c=>!selection||new RegExp(selection).test(c.id)).filter(c=>parseInt(hash(c.id).slice(0,8),16)%shard[1]===shard[0]);
 const log=resolve(LOCAL,'browser-'+engine+'.jsonl'),cached=existsSync(log)?readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 for(const c of cases){const previous=cached.find(r=>r.id===c.id&&r.fingerprint===fingerprint&&r.sha256===c.expected);if(previous){results.push(previous);continue;}sampler.reset();const row=await send({id:c.id});if(row.sha256!==c.expected)throw Error(engine+'/'+c.id+' Node hash mismatch');const record={engine,...row,fingerprint};appendFileSync(log,JSON.stringify(record)+'\n');results.push(record);if(results.length%25===0)console.log(engine,results.length,c.id);json('browser-progress.json',{engine,id:c.id,rows:results.length});}
 if(process.argv.includes('--bench'))for(const c of cases.filter(c=>/^m9b-(riverValley|lakeBasin|islands)-(96|128|256)-1$/.test(c.id)||c.id.startsWith('stress-')&&!/live|drought|badtide/.test(c.id))){sampler.reset();const row=await send({id:c.id,bench:true,reps:Number(arg('reps','3'))});const record={engine,version:browser.version(),stage:'bench',...row,fingerprint,load:{...sampler.summary(),freeMemory:freemem()}};results.push(record);appendFileSync(resolve(LOCAL,'browser-bench.jsonl'),JSON.stringify(record)+'\n');console.log(engine,c.id,'bench',row.times);}}
 await browser.close();json('browser-'+engine+'.json',{engine,results:results.filter(r=>r.engine===engine),machine:cpus()[0].model,logicalCores:cpus().length});}
 json(process.argv.includes('--smoke')?'browser-smoke.json':'browser.json',{results});
}finally{sampler.stop();server.close();}
