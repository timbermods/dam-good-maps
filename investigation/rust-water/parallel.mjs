import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {HERE,ROOT,LOCAL,deps,arg,json,hash} from './common.mjs';
import {loadSampler} from './load.mjs';
// Use the prior investigation's isolation worker/bootstrap unchanged, rather than a second design.
const assets=Object.fromEntries(['isolation-sw.js','isolation-register.js'].map(n=>[n,execFileSync('git',['show',`68d68313:investigation/parallel-water/${n}`])]));
const server=createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);if(!name){res.setHeader('Content-Type','text/html');res.end(`<script type="module">import {registerIsolation} from './isolation-register.js';await registerIsolation();window.ready=true;</script>`);return;}if(assets[name]){res.setHeader('Content-Type','text/javascript');res.end(assets[name]);return;}const path=resolve(LOCAL,name);if(!path.startsWith(LOCAL+sep)||!existsSync(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(path));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/',fixtures=JSON.parse(gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz')))).fixtures;
const fingerprint=hash(Buffer.concat(['shared-water.wasm','parallel-coordinator.js','shared-helper.js'].map(n=>readFileSync(resolve(LOCAL,n)))));
const resume=process.argv.includes('--resume')?JSON.parse(readFileSync(resolve(LOCAL,'parallel.json'),'utf8')):null;
if(resume&&resume.fingerprint!==fingerprint)throw Error('Threaded fingerprint changed; refuse resume');
const pw=(process.env.DGM_BROWSER_DEPS?createRequire(resolve(process.env.DGM_BROWSER_DEPS,'package.json')):deps)('playwright'),rows=resume?.rows??[],failures=resume?.failures??[],sampler=loadSampler();
try{for(const engine of arg('engines','chromium,firefox,webkit').split(',')){const browser=await pw[engine].launch({headless:true}),page=await browser.newPage();page.setDefaultTimeout(120000);await page.goto(base);await page.waitForFunction(()=>window.ready);if(!await page.evaluate(()=>crossOriginIsolated))throw Error('Isolation unavailable');
 const send=data=>page.evaluate(({base,data})=>new Promise((res,rej)=>{const w=new Worker(base+'parallel-coordinator.js',{type:'module'});w.onmessage=e=>{w.terminate();e.data.ok?res(e.data):rej(Error(e.data.error));};w.onerror=e=>{w.terminate();rej(Error(e.message));};w.postMessage(data);}),{base,data});
 for(const threads of [1,2,4]){if(rows.some(r=>r.engine===engine&&r.stage==='smoke'&&r.threads===threads))continue;const r=await send({smoke:true,threads,fixtures});rows.push({engine,stage:'smoke',...r});console.log(engine,threads,'smoke',r);}
 if(!process.argv.includes('--smoke')){const cases=JSON.parse(readFileSync(resolve(LOCAL,'checks.json'))).cases.filter(c=>/^m9b-(riverValley|lakeBasin|islands)-(96|128|256)-1$/.test(c.id)||/^stress-.*-512$/.test(c.id));for(const c of cases)for(const threads of [1,2,4]){if(rows.some(r=>r.engine===engine&&r.stage==='bench'&&r.id===c.id&&r.threads===threads))continue;sampler.reset();const r=await send({id:c.id,threads,reps:Number(arg('reps','3'))});rows.push({engine,stage:'bench',...r,load:sampler.summary()});json('parallel.json',{fingerprint,rows,failures});console.log(engine,c.id,threads,r.times);}}
 await browser.close();json('parallel.json',{fingerprint,rows,failures});}}
finally{sampler.stop();server.close();}
