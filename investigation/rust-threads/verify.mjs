import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {HERE,LOCAL,deps,json} from './common.mjs';
const ts=deps('typescript'),options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,lib:['lib.es2022.d.ts','lib.dom.d.ts','lib.webworker.d.ts'],skipLibCheck:true,strict:true,noEmit:true,types:[]};
const sources=['coordinator.ts','fault-check.ts','shared-kernel-template.ts','local/shared-helper.ts','local/ts-helper.ts'];
if(existsSync(resolve(LOCAL,'confirm-worker.ts')))sources.push('local/confirm-worker.ts');
const program=ts.createProgram(sources.map(p=>resolve(HERE,p)),options);
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>HERE,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));throw Error('TypeScript errors');}
if(process.argv.includes('--typecheck')){console.log('TypeScript PASS');process.exit(0);}
for(const [backend,source]of [['rust','shared-helper'],['ts','ts-helper']]){
 let helper=readFileSync(resolve(LOCAL,source+'.ts'),'utf8');
 const needle='const count=Atomics.load(control,2), phase=Atomics.load(control,1);';
 if(!helper.includes(needle))throw Error('Helper shape');
 helper=helper.replace(needle,needle+"\n    if(phase===2){const parked=new Int32Array(new SharedArrayBuffer(4));Atomics.wait(parked,0,0);return;}");
 writeFileSync(resolve(LOCAL,'fault-'+backend+'-helper.ts'),helper);
 await deps('esbuild').build({entryPoints:[resolve(LOCAL,'fault-'+backend+'-helper.ts')],outfile:resolve(LOCAL,'fault-'+backend+'-helper.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
}
await deps('esbuild').build({entryPoints:[resolve(HERE,'fault-check.ts')],outfile:resolve(LOCAL,'fault-check.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const server=createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(!name){res.setHeader('Content-Type','text/html');res.end('<body>verification</body>');return;}try{res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(readFileSync(resolve(LOCAL,name)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/',rows=[];
const pw=deps('playwright');try{for(const engine of ['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true,executablePath:engine==='firefox'?process.env.DGM_FIREFOX_EXECUTABLE:undefined,firefoxUserPrefs:engine==='firefox'?{'javascript.options.wasm_baselinejit':false,'javascript.options.wasm_optimizingjit':true,'javascript.options.wasm_lazy_tiering':false}:undefined});
 try{const page=await browser.newPage();await page.goto(base);
 const send=async(backend,kind)=>{
  const r=await page.evaluate(({backend,kind,base})=>new Promise((res,rej)=>{const w=new Worker(base+'fault-check.js',{type:'module'});w.onmessage=e=>{w.terminate();e.data.ok?res(e.data):rej(Error(e.data.error));};w.onerror=e=>{w.terminate();rej(Error(e.message));};w.postMessage({backend,kind});}),{backend,kind,base});rows.push({engine,...r});console.log(engine,backend,kind,r);json('faults.json',{typecheck:'pass',rows});
 };
 for(const backend of ['rust','typescript'])await send(backend,'unisolated');
 await page.evaluate(async()=>{await navigator.serviceWorker.register('./isolation-sw.js');await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.reload();
 if(!await page.evaluate(()=>crossOriginIsolated))throw Error('Isolation failed');
 for(const backend of ['rust','typescript'])for(const kind of ['startup','failure','reuse'])await send(backend,kind);
 }finally{await browser.close();}
}}finally{server.close();json('faults.json',{typecheck:'pass',rows});}
