import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname, relative, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { cpus, totalmem } from 'node:os';
import { traceCost } from '../startup/metrics.mjs';
const scenario=process.argv[4]||'generate'; const label=process.argv[2], repeats=Number(process.argv[3]||2), local=resolve('investigation/first-load/local');
const resultLabel=label+(process.env.FL_CLEAR_HTTP?'-http-cleared':'')+(scenario==='generate'?'':'-'+scenario); const dist=join(local,'dist-'+label); mkdirSync(local,{recursive:true});
const requests=[];
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.wasm':'application/wasm','.gz':'application/gzip','.mp3':'audio/mpeg','.jpg':'image/jpeg','.png':'image/png'};
const server=createServer((req,res)=>{
 if(new URL(req.url,'http://localhost').pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dam-good-maps(?:\/|$)/,'');
 if(path==='__seed__'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end('<!doctype html><title>Local fixture setup</title>');return;} const file=resolve(dist,path||'index.html'); if(!file.startsWith(dist+'\\')&&!file.startsWith(dist+'/')){console.log('SERVER 403 '+req.url);return res.writeHead(403).end();}
 let raw;try{raw=readFileSync(file);}catch{return res.writeHead(404).end();}
 const gz=/gzip/.test(req.headers['accept-encoding']||'')&&/\.(js|css|html|json|wasm)$/.test(file), bytes=gz?gzipSync(raw):raw;
 requests.push({url:req.url,raw:raw.length,body:bytes.length,epoch:Date.now()});
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':/\/assets\//.test(req.url)?'public,max-age=600':'no-cache','Content-Length':bytes.length,...(gz?{'Content-Encoding':'gzip','Vary':'Accept-Encoding'}:{}),...(process.env.FL_HEADERS?{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}:{})});res.end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/dam-good-maps/`;
const results=[];let context;
try {for(let run=0;run<repeats;run++) {
 const profile=join(local,`chrome-${label}-${Date.now()}-${run}`);
 context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:{width:1280,height:800},downloadsPath:join(local,'downloads'),args:['--no-first-run']});
 const page=context.pages()[0];
 await page.addInitScript(()=>{window.__fl={events:[],workers:[]}; const Original=Worker; window.Worker=class extends Original {constructor(url,options){super(url,options);window.__fl.workers.push({url:String(url),at:performance.now()});this.addEventListener('message',e=>{if(e.data?.__firstLoad)window.__fl.events.push({...e.data,at:e.data.epoch-performance.timeOrigin});});}};});
 for(const visit of ['cold','warm']) {
 await page.goto('about:blank');
 if(scenario==='reopen') {
   await page.goto(url+'__seed__');
   await page.evaluate(async ({b64,dev})=>{
     const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
     const name=dev?'dam-good-maps':'dgm-your-maps';
     const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>{if(dev)q.result.createObjectStore('autosave');else{q.result.createObjectStore('entries',{keyPath:'id'});q.result.createObjectStore('projects');}};q.onsuccess=()=>resolve(q.result);q.onerror=reject;});
     await new Promise((resolve,reject)=>{const tx=db.transaction(dev?['autosave']:['entries','projects'],'readwrite');
     if(dev)tx.objectStore('autosave').put({bytes,name:'Reopen fixture',savedAt:new Date().toISOString(),kind:'generated',screen:'editor'},'current');
     else {tx.objectStore('entries').put({id:'first-load-fixture',name:'Reopen fixture',kind:'generated',createdAt:new Date().toISOString(),editedAt:new Date().toISOString(),thumbnail:null,revision:0,savedToTimberborn:null,bytes:bytes.length,size:{w:128,h:128}});tx.objectStore('projects').put(bytes,'first-load-fixture');localStorage.setItem('dgm.current',JSON.stringify({id:'first-load-fixture',link:''}));}
     tx.oncomplete=resolve;tx.onerror=reject;});db.close();
   },{b64:readFileSync(join(local,'reopen.json.gz')).toString('base64'),dev:label.startsWith('dev')});
 }
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');if(process.env.FL_CLEAR_HTTP&&visit==='warm')await cdp.send('Network.clearBrowserCache');let firstEpoch=null;const network=[];
 cdp.on('Network.requestWillBeSent',e=>{if(firstEpoch===null&&e.type==='Document')firstEpoch=e.wallTime*1000;});
 cdp.on('Network.responseReceived',e=>network.push({url:e.response.url,status:e.response.status,cache:e.response.fromDiskCache,sw:e.response.fromServiceWorker,encoded:e.response.encodedDataLength}));
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR '+e.message);}); page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE '+m.text());});requests.length=0;
 await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.compile,disabled-by-default-v8.wasm,blink.user_timing',transferMode:'ReturnAsStream'});
 await page.goto(url+(scenario==='reopen'?(label.startsWith('dev')?'#edit':''):'#s=4263&z=128&d=n&t=riverValley'),{waitUntil:'domcontentloaded',timeout:60000});
 if(label.startsWith('dev')&&scenario==='generate'){await page.getByRole('button',{name:'Refine this map',exact:true}).click({timeout:60000});}
 await page.waitForFunction(()=>performance.getEntriesByName('fl:editable-frame').length&&window.dgmEditor&&window.dgm3d,null,{timeout:60000});
 // The real key reaches the editor; timing endpoint itself is the frame mark, not this polling delay.
 await page.keyboard.press('1');await page.waitForFunction(()=>!!window.dgm3d?.renderer.tool && !('wantsAlt' in window.dgm3d.renderer.tool),null,{timeout:30000});
 const data=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,measures:performance.getEntriesByType('measure').map(m=>({name:m.name,start:m.startTime,duration:m.duration})),marks:Object.fromEntries(performance.getEntriesByType('mark').map(m=>[m.name,m.startTime])),paint:Object.fromEntries(performance.getEntriesByType('paint').map(m=>[m.name,m.startTime])),worker:window.__fl,build:window.dgm3d.build,gpu:window.dgm3d.renderer.gpu(),generated:window.dgm?.current?.(),spec:window.dgmEditor.info().spec,version:window.dgmEditor.info().version,ua:navigator.userAgent,isolated:crossOriginIsolated}));
 const editable=data.timeOrigin+data.marks['fl:editable-frame']-firstEpoch;
 const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');const {stream}=await done;let trace='';while(true){const v=await cdp.send('IO.read',{handle:stream});trace+=v.data;if(v.eof)break;}await cdp.send('IO.close',{handle:stream});
 const traceFile=join(local,`${resultLabel}-${run}-${visit}.trace.json`);writeFileSync(traceFile,trace);const events=JSON.parse(trace).traceEvents;
 const row={label,scenario,run,visit,editable,firstEpoch,transferredToEditable:requests.filter(r=>r.epoch<=firstEpoch+editable).reduce((n,r)=>n+r.body,0),transferred:requests.reduce((n,r)=>n+r.body,0),requests:[...requests],network,parse:traceCost(events,/Parse|parse/),compile:traceCost(events,/Compile|compile/),wasm:traceCost(events,/wasm|Wasm|WebAssembly/),...data,errors};results.push(row);
 writeFileSync(join(local,`${resultLabel}-results.json`),JSON.stringify({hardware:{cpu:cpus()[0].model,memory:totalmem()},results},null,2));console.log(`${resultLabel} ${run} ${visit}: ${editable.toFixed(1)} ms, ${(row.transferred/1024).toFixed(1)} KiB`);
 if(process.argv.includes('--verify')&&run===0&&visit==='cold'){const {verify}=await import('./verify-browser.mjs');row.correctness=await verify(page,label);writeFileSync(join(local,`${resultLabel}-results.json`),JSON.stringify({hardware:{cpu:cpus()[0].model,memory:totalmem()},results},null,2));}
 if(run===0)await page.screenshot({path:join(local,`${resultLabel}-${visit}.png`)});
 // Keep HTTP/SW caches for warm; keep the startup input identical by dropping only local map state.
 await page.evaluate(async()=>{localStorage.clear();sessionStorage.clear();for(const db of await indexedDB.databases())await new Promise((r,j)=>{const q=indexedDB.deleteDatabase(db.name);q.onsuccess=r;q.onerror=j;q.onblocked=r;});});
 await cdp.detach();
 }
 await context.close();context=null;
}} finally {await context?.close();server.close();}
