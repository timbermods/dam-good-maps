import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,sep,dirname} from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,deps,hash,json} from './common.mjs';
import {loadSampler} from './load.mjs';
const screen=JSON.parse(readFileSync(resolve(HERE,'evidence.json'))),archive=resolve(process.env.DGM_CHECKS);
screen.policies=screen.screenPolicies??screen.policies;
let worker=readFileSync(resolve(HERE,'coordinator.ts'),'utf8').replaceAll("'./local/","'./").replaceAll("'./water'","'../water'").replaceAll("'./protocol'","'../protocol'");
worker=worker.replace('if(data.init){const t=performance.now();',"if(data.init){const t=performance.now();if(!await scalarRust.installRustWater('water.wasm'))throw Error('Scalar control unavailable');");
worker=worker.replace('output=execute(job,api);',"output=execute(job,data.control==='rust'?scalarRust:data.control==='typescript'?reference:api);");
if(!worker.includes("data.control==='rust'"))throw Error('Confirmation worker shape');
writeFileSync(resolve(LOCAL,'confirm-worker.ts'),worker);
await deps('esbuild').build({entryPoints:[resolve(LOCAL,'confirm-worker.ts')],outfile:resolve(LOCAL,'confirm-worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const firefox=process.env.DGM_FIREFOX_EXECUTABLE;if(!firefox)throw Error('Corrected Firefox required');
execFileSync('python',['-c',"import zipfile,sys; s=zipfile.ZipFile(sys.argv[1]).read('chrome/juggler/content/content/Runtime.js'); assert b'allowUnobservedWasm = true' in s and b'allowUnobservedAsmJS = true' in s",resolve(dirname(firefox),'omni.ja')]);
const prefs={'javascript.options.wasm_baselinejit':false,'javascript.options.wasm_optimizingjit':true,'javascript.options.wasm_lazy_tiering':false};
const fingerprint=hash(Buffer.concat(['confirm-worker.js','water.wasm','shared-water.wasm','shared-helper.js','ts-helper.js'].map(n=>readFileSync(resolve(LOCAL,n))).concat([Buffer.from(JSON.stringify(screen.policies)),readFileSync(new URL(import.meta.url))])));
const prior=existsSync(resolve(LOCAL,'confirmation.json'))?JSON.parse(readFileSync(resolve(LOCAL,'confirmation.json'))):null;
if(prior&&prior.fingerprint!==fingerprint)throw Error('Confirmation fingerprint changed');
const rows=prior?.rows??[],failures=prior?.failures??[];
const save=()=>json('confirmation.json',{fingerprint,screenFingerprint:screen.fingerprint,selected:screen.policies,rows,failures});
const server=createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
 if(!name){res.setHeader('Content-Type','text/html');res.end(`<script type="module">import {registerIsolation} from './isolation-register.js';await registerIsolation();window.ready=true;</script>`);return;}
 const root=name.startsWith('checks/')?resolve(archive,'checks'):LOCAL,path=resolve(root,name.startsWith('checks/')?name.slice(7):name);
 if(!path.startsWith(root+sep)||!existsSync(path)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(path));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/',pw=deps('playwright'),sampler=loadSampler();
const deadline=Date.now()+15000;while(!sampler.summary().samples&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
if(!sampler.summary().samples)throw Error('Load sampler unavailable');
try{for(const policy of screen.policies){
 const [backend,t]=policy.config.split('/'),threads=Number(t);
 for(const c of screen.inputs.filter(c=>c.W===policy.size)){
  if(rows.some(r=>r.engine===policy.engine&&r.id===c.id))continue;
  // One process per paired case also avoids Windows WebKit pool switching at teardown.
  const browser=await pw[policy.engine].launch({headless:true,executablePath:policy.engine==='firefox'?firefox:undefined,firefoxUserPrefs:policy.engine==='firefox'?prefs:undefined});
  try{const page=await browser.newPage();await page.goto(base);await page.waitForFunction(()=>window.ready);
   if(!await page.evaluate(()=>crossOriginIsolated))throw Error('Isolation unavailable');
   await page.evaluate(url=>{window.task=new Worker(url,{type:'module'});},base+'confirm-worker.js');
   const send=data=>page.evaluate(data=>new Promise((res,rej)=>{window.task.onmessage=e=>e.data.ok?res(e.data):rej(Error(e.data.error));window.task.onerror=e=>rej(Error(e.message));window.task.postMessage(data);}),data);
   const startup=await send({init:true,backend,threads});
   const arms=[{config:'rust-scalar/1',control:'rust'},{config:'typescript-scalar/1',control:'typescript'},...(backend==='rust-scalar'?[]:[{config:policy.config}])];
   sampler.reset();for(const arm of arms)await send({id:c.id,...arm});
   const samples=[];
   for(let rep=0;rep<3;rep++){
    const shift=rep%arms.length,order=[...arms.slice(shift),...arms.slice(0,shift)];
    for(const arm of order){sampler.reset();const r=await send({id:c.id,...arm});if(r.sha256!==c.expected||r.input!==c.input||r.ticks!==c.ticks)throw Error('Confirmation identity mismatch');const load=sampler.summary();if(load.mean===null)throw Error('Missing CPU reading: repeat the whole case');samples.push({rep,config:arm.config,ms:r.ms,ticks:r.ticks,sha256:r.sha256,load,provisional:load.mean>20});}
   }
   const row={engine:policy.engine,size:policy.size,id:c.id,selected:policy.config,startup,samples,load:{mean:samples.reduce((v,s)=>v+s.load.mean,0)/samples.length,max:Math.max(...samples.map(s=>s.load.max))},provisional:samples.some(s=>s.provisional)};rows.push(row);save();
   console.log('paired',policy.engine,c.id,policy.config,arms.map(a=>({config:a.config,ms:samples.filter(s=>s.config===a.config).map(s=>Math.round(s.ms))})),Math.round(row.load.mean));
   await send({close:true});await page.evaluate(()=>window.task.terminate());
  }catch(error){failures.push({engine:policy.engine,id:c.id,config:policy.config,error:String(error.stack)});save();throw error;}finally{await browser.close();}
 }
}}finally{sampler.stop();server.close();save();}
