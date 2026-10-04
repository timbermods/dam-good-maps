import {createServer} from 'node:http';
import {readFileSync,existsSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve,sep,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {HERE,ROOT,LOCAL,deps,arg,hash,json} from './common.mjs';
import {loadSampler} from './load.mjs';
const checks=resolve(process.env.DGM_CHECKS??'');if(!process.env.DGM_CHECKS)throw Error('Set DGM_CHECKS to the prior Rust archive local directory');
const manifest=JSON.parse(readFileSync(resolve(checks,'checks.json'))).cases;
const selected=manifest.filter(c=>/^m9b-(riverValley|lakeBasin|islands)-(128|256)-1$|^stress-(riverValley|lakeBasin|islands)-512$/.test(c.id));
if(selected.length!==9)throw Error('Missing canonical timing cases');
const pw=(process.env.DGM_BROWSER_DEPS?createRequire(resolve(process.env.DGM_BROWSER_DEPS,'package.json')):deps)('playwright');
const firefox=process.env.DGM_FIREFOX_EXECUTABLE;if(!firefox)throw Error('Corrected Firefox executable required, never time old debugger runtime');
// Fail closed unless the diagnostic runtime permits optimizing Wasm observation.
execFileSync('python',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); s=z.read('chrome/juggler/content/content/Runtime.js'); assert b'allowUnobservedWasm = true' in s and b'allowUnobservedAsmJS = true' in s",resolve(dirname(firefox),'omni.ja')]);
const firefoxUserPrefs={'javascript.options.wasm_baselinejit':false,'javascript.options.wasm_optimizingjit':true,'javascript.options.wasm_lazy_tiering':false};
const versions=Object.fromEntries(['chromium','firefox','webkit'].map(e=>[e,hash(readFileSync(e==='firefox'?firefox:pw[e].executablePath()))]));
const fingerprint=hash(Buffer.concat(['build.json','coordinator.js','shared-helper.js','ts-helper.js','water.wasm','shared-water.wasm'].map(n=>readFileSync(resolve(LOCAL,n))).concat([readFileSync(new URL(import.meta.url)),Buffer.from(JSON.stringify({selected,versions,firefoxUserPrefs,firefoxArchive:hash(readFileSync(resolve(dirname(firefox),'omni.ja')))}))])));
const resume=process.argv.includes('--resume')&&existsSync(resolve(LOCAL,'measurements.json'))?JSON.parse(readFileSync(resolve(LOCAL,'measurements.json'))):null;
if(resume&&resume.fingerprint!==fingerprint)throw Error('Fingerprint changed; refuse mixed measurements');
const rows=resume?.rows??[],failures=resume?.failures??[];
const save=()=>json('measurements.json',{fingerprint,metric:'simulation-only-v2',identitySource:existsSync(resolve(LOCAL,'identity-evidence.json'))?hash(readFileSync(resolve(LOCAL,'identity-evidence.json'))):null,build:JSON.parse(readFileSync(resolve(LOCAL,'build.json'))),runtime:{playwright:deps('playwright/package.json').version,versions,firefoxArchive:hash(readFileSync(resolve(dirname(firefox),'omni.ja'))),firefoxUserPrefs},selected,rows,failures});
const server=createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
 if(!name){res.setHeader('Content-Type','text/html');res.end(`<script type="module">import {registerIsolation} from './isolation-register.js';await registerIsolation();window.ready=true;</script>`);return;}
 const root=name.startsWith('checks/')?resolve(checks,'checks'):LOCAL,path=resolve(root,name.startsWith('checks/')?name.slice(7):name);
 if(!path.startsWith(root+sep)||!existsSync(path)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(path));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
const sampler=loadSampler();const deadline=Date.now()+15000;
while(!sampler.summary().samples&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
if(!sampler.summary().samples){sampler.stop();server.close();throw Error('CPU sampler unavailable');}
const counts=arg('counts','1,2,4,8,16').split(',').map(Number),fixtures=JSON.parse(gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz')))).fixtures;
const variants=[{backend:'rust-scalar',threads:1},...counts.flatMap(threads=>[{backend:'rust',threads},{backend:'typescript',threads}])].filter(v=>arg('backend','all')==='all'||v.backend===arg('backend'));
try{for(const engine of arg('engines','chromium,firefox,webkit').split(',')){
 const browser=await pw[engine].launch({headless:true,executablePath:engine==='firefox'?firefox:undefined,firefoxUserPrefs:engine==='firefox'?firefoxUserPrefs:undefined});
 try{const page=await browser.newPage();page.setDefaultTimeout(120000);await page.goto(base);await page.waitForFunction(()=>window.ready);
 if(!await page.evaluate(()=>crossOriginIsolated))throw Error('Isolation unavailable');
 const start=async(variant,forced=false)=>{
  await page.evaluate(url=>{window.task=new Worker(url,{type:'module'});},base+'coordinator.js');
  return send({init:true,...variant,forced});
 };
 const send=data=>page.evaluate(data=>new Promise((res,rej)=>{window.task.onmessage=e=>e.data.ok?res(e.data):rej(Error(e.data.error));window.task.onerror=e=>rej(Error(e.message));window.task.postMessage(data);}),data);
 const stop=async()=>{await send({close:true});await page.evaluate(()=>{window.task.terminate();window.task=null;});};
 if(process.argv.includes('--smoke')){
  for(const variant of variants){if(rows.some(r=>r.engine===engine&&r.stage==='smoke'&&r.backend===variant.backend&&r.threads===variant.threads))continue;
   const startup=await start(variant,true);try{const r=await send({smoke:true,fixtures,ticks:200});rows.push({stage:'smoke',engine,version:browser.version(),...variant,...r,startup});console.log(engine,variant.backend,variant.threads,'smoke',r.checks,r.stats);save();}finally{await stop();}}
 }else{
  const candidates=selected.filter(c=>new RegExp(arg('filter','.*')).test(c.id));
  for(let ci=0;ci<candidates.length;ci++){const c=candidates[ci],ordered=ci%2?[...variants].reverse():variants;
   for(const variant of ordered){if(rows.some(r=>r.engine===engine&&r.stage==='bench'&&r.id===c.id&&r.backend===variant.backend&&r.threads===variant.threads))continue;
    sampler.reset();const startup=await start(variant);try{
     await send({id:c.id,oracle:variant.backend==='typescript'&&variant.threads===1}); // warm-up; fresh same-engine TS once per case
     const samples=[];for(let rep=0;rep<Number(arg('reps','3'));rep++){sampler.reset();const r=await send({id:c.id});if(r.sha256!==c.expected||r.input!==c.input||r.ticks!==c.ticks)throw Error('Archive identity mismatch');const load=sampler.summary();if(load.mean===null)throw Error('Missing CPU reading');samples.push({...r,load,provisional:load.mean>20});}
     const sorted=samples.map(s=>s.ms).sort((a,b)=>a-b),row={stage:'bench',engine,version:browser.version(),id:c.id,size:c.W,...variant,startup,samples,median:sorted[Math.floor(sorted.length/2)],worst:Math.max(...sorted),load:{mean:samples.reduce((v,s)=>v+s.load.mean,0)/samples.length,max:Math.max(...samples.map(s=>s.load.max)),samples:samples.reduce((v,s)=>v+s.load.samples,0),source:[...new Set(samples.map(s=>s.load.source))].join('; ')},provisional:samples.some(s=>s.provisional)};
     rows.push(row);save();appendFileSync(resolve(LOCAL,'progress.jsonl'),JSON.stringify(row)+'\n');console.log(engine,c.id,variant.backend,variant.threads,Math.round(row.median),Math.round(row.worst),'load',Math.round(row.load.mean));
    }finally{await stop();}
   }
  }
 }
 }catch(error){failures.push({engine,at:new Date().toISOString(),error:String(error.stack)});save();throw error;}finally{await browser.close();}
}}finally{sampler.stop();server.close();save();}
