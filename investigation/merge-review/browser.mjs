import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer as viteServer } from 'vite';
import { chromium,firefox,webkit } from 'playwright';
const root=resolve(import.meta.dirname,'../..'),port=4317,origin=`http://localhost:${port}`,base='/dam-good-maps/';
const vite=await viteServer({configFile:false,root,base,publicDir:false,appType:'custom',cacheDir:resolve(import.meta.dirname,'local/vite-cache'),server:{middlewareMode:true,watch:null},worker:{format:'es'}});
let version=1,swVersion=1;
const hits=[];
const html=`<!doctype html><title>Isolation reproduction</title><script type="module">import '${base}src/platform/isolation.ts';window.version=await fetch('${base}version').then(r=>r.text());window.ready=true;</script>`;
const serve=httpServer((req,res)=>{
  const u=new URL(req.url,origin);hits.push(u.pathname);
  if(u.pathname===base+'sw.js'){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');res.end(readFileSync(resolve(root,'public/sw.js'),'utf8')+'\n// deployment '+swVersion);return;}
  if(u.pathname===base+'version'){res.setHeader('Cache-Control','no-store');res.end(String(version));return;}
  if(u.pathname===base+'harness.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(u.pathname.startsWith(base+'roadmap/')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Roadmap scope reproduction</title>');return;}
  if(u.pathname.startsWith(base+'real-places/')){res.setHeader('Content-Type',u.pathname.endsWith('.svg')?'image/svg+xml':'application/json');res.end(u.pathname.endsWith('.svg')?'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>':'{"sameOrigin":true}');return;}
  vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
});
const outside=httpServer((req,res)=>{if(req.url==='/cors'){res.setHeader('Access-Control-Allow-Origin','*');res.end('outside-data');}else{res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>');}});
await new Promise(r=>serve.listen(port,'localhost',r));await new Promise(r=>outside.listen(port+1,'localhost',r));
const rows=[];
async function ready(page){await page.waitForFunction(()=>window.ready===true);}
try{
 for(const [name,type,options] of [['chromium',chromium,{}],['firefox',firefox,{}],['webkit',webkit,{}],['firefox-no-service-worker',firefox,{firefoxUserPrefs:{'dom.serviceWorkers.enabled':false}}]]){
  console.log('Checking '+name);version=1;const browser=await type.launch({headless:true,...options});
  try{
   const context=await browser.newContext();const page=await context.newPage();let navigations=0;page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++;});
   await page.goto(origin+base+'harness.html');await ready(page);
   const first=await page.evaluate(()=>({isolated:crossOriginIsolated,controlled:!!navigator.serviceWorker?.controller,failed:localStorage.getItem('dgm.isolation-failed'),version:window.version}));
   assert(navigations<=2,'first visit reload loop');const firstVisitNavigations=navigations;
   if(name==='webkit'||name==='firefox-no-service-worker')assert(!first.isolated);else assert(first.isolated,`${name} isolation unavailable`);
   const imported=await page.evaluate(async ({base,port})=>{
    const data=await fetch(base+'real-places/index.json').then(r=>r.json());
    const cors=await fetch(`http://localhost:${port+1}/cors`).then(r=>r.text());
    const p=await import(base+'src/core/sim/parallelPolicy.ts');
    return {data,cors,supported:p.parallelWaterSupported(true)};
   },{base,port});assert(imported.data.sameOrigin);assert.equal(imported.cors,'outside-data');assert.equal(imported.supported,first.isolated);
   const normal=await page.evaluate(async base=>{
    const worker=new Worker(base+'investigation/merge-review/browser-water.ts',{type:'module'});
    try{return await new Promise((resolve,reject)=>{worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));worker.postMessage({});});}finally{worker.terminate();}
   },base);assert(normal.equal,JSON.stringify(normal));
   if(first.isolated)assert(normal.runs>0);else assert.equal(normal.runs,0);
   version=2;swVersion++;await page.evaluate(async()=>{const r=await navigator.serviceWorker?.getRegistration();await r?.update();});
   await page.reload();await ready(page);const fresh=await page.evaluate(()=>window.version);assert.equal(fresh,'2');
   await page.goto(origin+base+'roadmap/');const roadmap=await page.evaluate(async port=>({isolated:crossOriginIsolated,cors:await fetch(`http://localhost:${port+1}/cors`).then(r=>r.text())}),port);assert.equal(roadmap.isolated,false);assert.equal(roadmap.cors,'outside-data');
   rows.push({name,firstVisitNavigations,first,normal,updatedVersion:fresh,roadmap});await context.close();
   if(name==='chromium'){
    const blocked=await browser.newContext({serviceWorkers:'block'});const p=await blocked.newPage();await p.goto(origin+base+'harness.html');await ready(p);assert.equal(await p.evaluate(()=>crossOriginIsolated),false);
    const fallback=await p.evaluate(async base=>{const w=new Worker(base+'investigation/merge-review/browser-water.ts',{type:'module'});try{return await new Promise(r=>{w.onmessage=e=>r(e.data);w.postMessage({});});}finally{w.terminate();}},base);assert(fallback.equal);assert.equal(fallback.runs,0);rows.push({name:'blocked service worker',fallback});await blocked.close();
   }
  }finally{await browser.close();}
 }

 console.log('Checking Firefox private launch');const privateFirefox=await firefox.launchPersistentContext(resolve(import.meta.dirname,'local/firefox-private'),{headless:true,firefoxUserPrefs:{'browser.privatebrowsing.autostart':true},args:['-private-window']});
 try{const context=privateFirefox,page=await context.newPage();await page.goto(origin+base+'harness.html');await ready(page);
 const status=await page.evaluate(()=>({isolated:crossOriginIsolated,hasServiceWorker:'serviceWorker' in navigator}));
 const fallback=await page.evaluate(async base=>{const w=new Worker(base+'investigation/merge-review/browser-water.ts',{type:'module'});try{return await new Promise(r=>{w.onmessage=e=>r(e.data);w.postMessage({});});}finally{w.terminate();}},base);
 assert(fallback.equal);if(!status.isolated)assert.equal(fallback.runs,0);rows.push({name:'Firefox private launch (automation context)',status,fallback});await context.close();
 }finally{await privateFirefox.close();}
 writeFileSync(resolve(import.meta.dirname,'local/browser.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
}finally{await vite.close();await new Promise(r=>serve.close(r));await new Promise(r=>outside.close(r));}
