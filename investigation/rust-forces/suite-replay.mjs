// Replay every captured existing-suite planning input, full result and typed
// reconstruction in each engine. Assertions and editor flows also run unchanged
// in existing-tests.mjs / existing-browser.mjs. Fixture maps stay ignored.
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {LOCAL,deps,json,hash} from './common.mjs';
const wasmSha256=hash(readFileSync(resolve(LOCAL,'forces.wasm'))),corpusBytes=readFileSync(resolve(LOCAL,'suite-corpus-'+wasmSha256+'.jsonl'));
const cases=[...new Map(corpusBytes.toString().trim().split(/\r?\n/).map(line=>{const r=JSON.parse(line);return [r.key,r];})).values()].sort((a,b)=>a.key.localeCompare(b.key));
if(!cases.length)throw Error('Capture the full existing suite with DGM_SUITE_CAPTURE=1');
for(const r of cases){const dir=resolve(LOCAL,'suite-corpus',wasmSha256);if(hash(readFileSync(resolve(dir,r.key+'.input.bin')))!==r.key||hash(readFileSync(resolve(dir,r.key+'.expected.bin')))!==r.sha256)throw Error('Captured fixture changed: '+r.key);}
const server=createServer((req,res)=>{const path=resolve(LOCAL,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1));if(!path.startsWith(LOCAL+sep)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const pw=createRequire(resolve(process.env.DGM_BROWSER_DEPS??resolve(LOCAL,'browser-deps'),'package.json'))('playwright'),rows=[];
try{for(const engine of ['chromium','firefox','webkit']){const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{executablePath:process.env.DGM_FIREFOX}:{})});try{
 const page=await browser.newPage();page.setDefaultTimeout(300000);await page.goto(base+'/api.js');
 await page.evaluate(({base,wasmSha256})=>{const source=`import * as api from ${JSON.stringify(base+'/api.js')};const ready=fetch(${JSON.stringify(base+'/forces.wasm')}).then(r=>r.arrayBuffer()).then(api.bridge);const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);self.onmessage=async event=>{const r=event.data;try{const root=${JSON.stringify(base+'/suite-corpus/'+wasmSha256+'/')};const [input,expected]=await Promise.all([fetch(root+r.key+'.input.bin'),fetch(root+r.key+'.expected.bin')].map(async p=>new Uint8Array(await(await p).arrayBuffer())));const j=api.decode(input),oracle=api.decode(expected),task=(await ready).create(j);try{try{task.plan();}catch(error){if(!oracle.error)throw error;}const actual=task.pack();if(!same(expected,actual))throw Error('Pack bytes');if(!oracle.error&&!same(expected,api.encode(api.typedResult(task,j,api.F))))throw Error('Typed bytes');}finally{task.dispose();}self.postMessage({ok:true,key:r.key});}catch(error){self.postMessage({ok:false,key:r.key,error:String(error)});}};`;window.replayWorker=new Worker(URL.createObjectURL(new Blob([source],{type:'text/javascript'})),{type:'module'});},{base,wasmSha256});
 for(let i=0;i<cases.length;i++){const r=cases[i];await page.evaluate(r=>new Promise((resolve,reject)=>{window.replayWorker.onmessage=e=>e.data.ok?resolve(e.data):reject(Error(JSON.stringify(e.data)));window.replayWorker.onerror=e=>reject(Error(e.message));window.replayWorker.postMessage(r);}),r);rows.push({engine,...r});if(i%25===0)console.log(engine,i+'/'+cases.length,'existing-suite fixtures PASS');}
}finally{await browser.close();}}}finally{server.close();}
const counts={};for(const r of cases)counts[r.verb+'/'+r.size+'/'+(r.finish?'production':'historical')]=(counts[r.verb+'/'+r.size+'/'+(r.finish?'production':'historical')]??0)+1;
json('suite-replay.json',{status:'pass',wasmSha256,corpusSha256:hash(corpusBytes),cases:cases.length,comparisons:rows.length,counts,rows});console.log(cases.length,'existing-suite inputs × three engines PASS');
