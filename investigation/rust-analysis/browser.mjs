import {createServer} from 'node:http';
import {readFileSync,existsSync,readdirSync,appendFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import {cpus} from 'node:os';
import {LOCAL,deps,arg,json,hash} from './common.mjs';
import {loadSampler} from './load.mjs';
const playwright=process.env.DGM_PLAYWRIGHT?deps(process.env.DGM_PLAYWRIGHT):(process.env.DGM_BROWSER_DEPS?createRequire(resolve(process.env.DGM_BROWSER_DEPS,'package.json')):deps)('playwright');
const fingerprint=hash(Buffer.concat(['worker.js','analysis.wasm'].map(n=>readFileSync(resolve(LOCAL,n)))));
const recordsDirectory=resolve(LOCAL,'browser-records');mkdirSync(recordsDirectory,{recursive:true});
const server=createServer((req,res)=>{let path=resolve(LOCAL,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1));if(!path.startsWith(LOCAL+sep)){res.writeHead(403).end();return;}if(path.endsWith('.in')||path.endsWith('.expected')){if(existsSync(path+'.gz'))path+='.gz';}if(!existsSync(path)){res.writeHead(404).end();return;}const gz=path.endsWith('.gz');if(gz)res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.wasm')?'application/wasm':path.endsWith('.json.gz')?'application/json':'application/octet-stream');res.end(readFileSync(path));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';const sampler=loadSampler();
try{for(const engine of arg('engines','chromium,firefox,webkit').split(',')){
 console.log(engine,'launch');
 const browser=await playwright[engine].launch({headless:true});console.log(engine,'launched');try{const page=await browser.newPage();page.on('pageerror',e=>console.error(engine,e.message));await page.goto(base+'worker.js');console.log(engine,'page ready');await page.evaluate(url=>new Promise((res,rej)=>{window.raWorker=new Worker(url,{type:'module'});window.raWorker.onmessage=e=>e.data.ready&&res(true);window.raWorker.onerror=e=>rej(Error(e.message));}),base+'worker.js');console.log(engine,'worker ready');
 const send=c=>page.evaluate(c=>new Promise((res,rej)=>{window.raWorker.onmessage=e=>e.data.ok?res(e.data):rej(Error(e.data.error));window.raWorker.onerror=e=>rej(Error(e.message));window.raWorker.postMessage(c);}),c);
 if(process.argv.includes('--generation')){const rows=[];for(const theme of ['any','riverValley','canyon','highlands','lakeBasin','delta','islands']){sampler.reset();const r=await send({generate:true,theme,reps:Number(arg('reps','3'))});rows.push({theme,...r,load:sampler.summary()});json('generation-'+engine+'.json',{engine,version:browser.version(),fingerprint,machine:cpus()[0].model,rows});console.log(engine,'generation',theme);}continue;}
 const selection=arg('ids',''),shard=arg('shard','0/1').split('/').map(Number);if(shard.length!==2||shard[0]<0||shard[0]>=shard[1])throw Error('Invalid shard');const cases=readdirSync(resolve(LOCAL,'cases')).filter(n=>n.endsWith('.meta.json')).map(n=>JSON.parse(readFileSync(resolve(LOCAL,'cases',n)))).filter(c=>!selection||new RegExp(selection).test(c.id)).filter(c=>parseInt(hash(c.id).slice(0,8),16)%shard[1]===shard[0]).sort((a,b)=>a.id.localeCompare(b.id));
 const log=resolve(LOCAL,'browser-'+engine+'.jsonl');const cached=existsSync(log)?readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];let done=0;
 for(const c of cases){const high=resolve(LOCAL,'cases',c.id+'.high.json');if(!existsSync(high)&&!process.argv.includes('--room-only'))continue;
 const hasRoom=existsSync(resolve(LOCAL,'cases',c.id+'.room.in.gz'));if(process.argv.includes('--room-only')&&!hasRoom)continue;
 const recordPath=resolve(recordsDirectory,engine+'-'+c.id+'-'+fingerprint+(process.argv.includes('--room-only')?'-room':'')+'.json');const previous=existsSync(recordPath)?JSON.parse(readFileSync(recordPath)):cached.find(r=>r.id===c.id&&r.fingerprint===fingerprint&&r.input===c.input&&r.hasRoom===hasRoom&&r.roomOnly===process.argv.includes('--room-only'));const needsTiming=process.argv.includes('--bench')&&/^m9b-.*-(96|128|256)-1$/.test(c.id)&&!previous?.analyses.length;if(previous&&previous.input===c.input&&previous.hasRoom===hasRoom&&!needsTiming){done++;continue;}
 const bench=process.argv.includes('--bench')&&/^m9b-.*-(96|128|256)-1$/.test(c.id);sampler.reset();const t=performance.now();const row=await send({id:c.id,hasRoom,roomOnly:process.argv.includes('--room-only'),bench,reps:Number(arg('reps','3'))});if(row.high&&row.high!==JSON.parse(readFileSync(high)).expected)throw Error(engine+'/'+c.id+' cross-engine high-level identity');
 const record={engine,version:browser.version(),fingerprint,input:c.input,...row,roomOnly:process.argv.includes('--room-only'),ms:performance.now()-t,load:sampler.summary()};writeFileSync(recordPath,JSON.stringify(record));appendFileSync(log,JSON.stringify(record)+'\n');done++;if(done%25===0)console.log(engine,done+'/'+cases.length,c.id);json('browser-'+engine+'-progress-'+shard[0]+'.json',{done,total:cases.length,id:c.id});
 }
 json('browser-'+engine+'-'+shard[0]+'.json',{engine,version:browser.version(),machine:cpus()[0].model,fingerprint,rows:readdirSync(recordsDirectory).filter(n=>n.startsWith(engine+'-')&&n.includes(fingerprint)&&!n.endsWith('-room.json')).map(n=>JSON.parse(readFileSync(resolve(recordsDirectory,n))))});
 }finally{await browser.close();}}
}finally{sampler.stop();server.close();}
