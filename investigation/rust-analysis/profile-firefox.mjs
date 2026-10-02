// Paired controls: identical corrected Firefox, TS and both Rust revisions.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {cpus} from 'node:os';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,deps,arg,hash} from './common.mjs';
import {firefoxRuntime} from './firefox-runtime.mjs';
import {loadSampler} from './load.mjs';
const playwright=process.env.DGM_PLAYWRIGHT?deps(process.env.DGM_PLAYWRIGHT):deps('playwright');
execFileSync(deps.resolve('@esbuild/win32-x64/esbuild.exe'),[resolve(HERE,'profile-worker.mjs'),'--bundle','--platform=browser','--format=esm','--target=es2022','--outfile='+resolve(LOCAL,'profile-worker.js')],{stdio:'inherit',windowsHide:true});
const corrected=firefoxRuntime(),fingerprint=hash(Buffer.concat(['profile-worker.js','analysis.wasm','followup/before-analysis.wasm'].map(n=>readFileSync(resolve(LOCAL,n)))));
const output=resolve(LOCAL,'followup',arg('tag',process.argv.includes('--generation')?'firefox-generation':'firefox-analyses')+'.json');
const server=createServer((req,res)=>{let p=resolve(LOCAL,new URL(req.url,'http://localhost').pathname.slice(1));if(!p.startsWith(LOCAL+sep)){res.writeHead(403).end();return;}if(!existsSync(p)&&existsSync(p+'.gz'))p+='.gz';if(!existsSync(p)){res.writeHead(404).end();return;}if(p.endsWith('.gz'))res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(p));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';const sampler=loadSampler();let browser;
try{
 browser=await playwright.firefox.launch({headless:true,...corrected.options});const page=await browser.newPage();await page.goto(base+'profile-worker.js');
 await page.evaluate(url=>new Promise((res,rej)=>{window.worker=new Worker(url,{type:'module'});window.worker.onmessage=e=>e.data.ready&&res();window.worker.onerror=e=>rej(Error(e.message));}),base+'profile-worker.js');
 const send=c=>page.evaluate(c=>new Promise((res,rej)=>{window.worker.onmessage=e=>e.data.ok?res(e.data):rej(Error(e.data.error));window.worker.postMessage(c);}),c);
 const evidence={version:browser.version(),date:new Date().toISOString(),runtime:corrected.evidence,runtimeFingerprint:corrected.fingerprint,fingerprint,machine:cpus()[0].model,threads:cpus().length,reps:Number(arg('reps','3')),method:'Rotating three-way order; untimed initialization/warmup/identity; each analysis sample averages a calibrated loop of at least about 30 ms (cap 200 calls); complete generation uses one run per sample.',records:[]};
 const themes=['any','riverValley','canyon','highlands','lakeBasin','delta','islands'];
 const selection=arg('ids','');
 const cases=(process.argv.includes('--generation')?themes.map(theme=>({theme,generate:true})):themes.flatMap(theme=>[96,128,256].map(size=>({id:'m9b-'+theme+'-'+size+'-1',theme,size})))).filter(c=>!selection||new RegExp(selection).test(c.id??c.theme));
 for(const c of cases){sampler.reset();const record=await send({...c,reps:evidence.reps});evidence.records.push({...c,...record,load:sampler.summary()});writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log('Firefox profile',record.id,'PASS');}
}finally{await browser?.close();sampler.stop();server.close();}
