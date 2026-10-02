import {readFileSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createServer} from 'node:http';
import {HERE,LOCAL,deps,json} from './common.mjs';
const fixture=JSON.parse(readFileSync(resolve(LOCAL,'weather-input.json'))),rows=[],server=createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1);
 if(!name){res.setHeader('Content-Type','text/html');res.end(`<script type="module">import {registerIsolation} from './isolation-register.js';await registerIsolation();window.ready=true;</script>`);return;}
 const folder=name.startsWith('checks/')?resolve(LOCAL,'weather-checks'):LOCAL,path=resolve(folder,name.startsWith('checks/')?name.slice(7):name);
 if(!path.startsWith(folder+sep)||!existsSync(path)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(path));
});
if(!fixture.forcingDistinct?.some(n=>n>1))throw Error('Weather forcing must vary');
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/',pw=deps('playwright');
try{for(const engine of ['chromium','firefox','webkit'])for(const {threads,backend} of [{backend:'rust-scalar',threads:1},...[1,2,4,8,16].flatMap(threads=>[{backend:'rust',threads},{backend:'typescript',threads}])]){
 // Untimed identity check, separate from the timing matrix. Fresh process avoids WebKit teardown closures.
 const browser=await pw[engine].launch({headless:true,executablePath:engine==='firefox'?process.env.DGM_FIREFOX_EXECUTABLE:undefined,firefoxUserPrefs:engine==='firefox'?{'javascript.options.wasm_baselinejit':false,'javascript.options.wasm_optimizingjit':true,'javascript.options.wasm_lazy_tiering':false}:undefined});
 try{const page=await browser.newPage();await page.goto(base);await page.waitForFunction(()=>window.ready);
  await page.evaluate(url=>{window.task=new Worker(url,{type:'module'});},base+'coordinator.js');
  const send=data=>page.evaluate(data=>new Promise((res,rej)=>{window.task.onmessage=e=>e.data.ok?res(e.data):rej(Error(e.data.error));window.task.onerror=e=>rej(Error(e.message));window.task.postMessage(data);}),data);
  await send({init:true,backend,threads,forced:true});const r=await send({id:fixture.id,oracle:true});
  if(r.input!==fixture.input||r.sha256!==fixture.expected||r.ticks!==fixture.ticks)throw Error('Weather identity');
  rows.push({engine,backend,threads,input:r.input,expected:r.sha256,ticks:r.ticks,phases:r.stats??null});json('weather.json',{fixture,rows});
  console.log('weather',engine,backend,threads,'pass');await send({close:true});
 }finally{await browser.close();}
}}finally{server.close();json('weather.json',{fixture,rows});}
