import http from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {deps,HERE,json} from './common.mjs';
const pw=deps('playwright'), evidence={engines:{},serverHeaders:'No COOP/COEP/CORP on app origin'};
let version='v1',blockCachedNetwork=false;
const external=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/javascript');
  if(req.url==='/corp')res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
  if(req.url==='/cors')res.setHeader('Access-Control-Allow-Origin','*');
  res.end('window.externalLoaded=(window.externalLoaded||0)+1');
});
await new Promise(r=>external.listen(0,'127.0.0.1',r));
const externalURL=`http://localhost:${external.address().port}`;
const host=http.createServer((req,res)=>{
  if(blockCachedNetwork && req.url.startsWith('/cached/')){res.statusCode=503;res.end('network disabled');return;}
  const name=new URL(req.url,'http://localhost').pathname.split('/').pop();
  if(name==='existing-cache.js'){res.setHeader('Content-Type','text/javascript');res.end("self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");return;}
  if(name==='cached-isolation-sw.js'){
    res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-cache');
    res.end(readFileSync(resolve(HERE,'isolation-sw.js'),'utf8').replace('fetch(request).then(isolate)',`caches.open('proof').then(async cache=>{const hit=await cache.match(request);if(hit)return hit;const r=await fetch(request);await cache.put(request,r.clone());return r;}).then(isolate)`));return;
  }
  if(name==='cached-plain-sw.js'){res.setHeader('Content-Type','text/javascript');res.end("self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.open('plain').then(async c=>{const hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);await c.put(e.request,r.clone());return r}))); ");return;}
  if(name==='isolation-sw.js'||name==='isolation-register.js') {
    res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-cache');
    res.end(readFileSync(resolve(HERE,name),'utf8').replace('parallel-water-v1','parallel-water-'+version));return;
  }
  res.setHeader('Content-Type','text/html');
  res.end(`<script type="module">${req.url.startsWith('/dam-good-maps/')||req.url.startsWith('/cached/')||req.url.startsWith('/plain-cache/')?`import {registerIsolation} from './isolation-register.js';window.loads=Number(sessionStorage.loads||0)+1;sessionStorage.loads=window.loads;await registerIsolation(${req.url.startsWith('/cached/')?"'./cached-isolation-sw.js'":req.url.startsWith('/plain-cache/')?"'./cached-plain-sw.js'":""});`:""}window.ready=true;</script>`);
});
await new Promise(r=>host.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${host.address().port}`;
try {
  for(const name of ['chromium','firefox','webkit']) {
    const browser=await pw[name].launch({headless:true});
    try {
      const page=await browser.newPage();await page.goto(url+'/dam-good-maps/');
      await page.waitForFunction(()=>window.ready && (crossOriginIsolated || Number(sessionStorage.loads)>1));
      const row=evidence.engines[name]={version:browser.version(),...await page.evaluate(()=>({isolated:crossOriginIsolated,sab:typeof SharedArrayBuffer!=='undefined',loads:window.loads,controller:!!navigator.serviceWorker.controller}))};
      row.resources=await page.evaluate(async external=>{
        const script=(path,cors)=>new Promise(resolve=>{const s=document.createElement('script');s.src=external+path;if(cors)s.crossOrigin='anonymous';s.onload=()=>resolve(true);s.onerror=()=>resolve(false);document.head.append(s)});
        return {denied:await script('/denied',false),corp:await script('/corp',false),cors:await script('/cors',true)};
      },externalURL);
      await page.reload();await page.waitForFunction(()=>window.ready);row.warm=await page.evaluate(()=>({isolated:crossOriginIsolated,loads:window.loads}));
      version='v2-'+name;
      row.update=await page.evaluate(async()=>{
        const r=await navigator.serviceWorker.getRegistration();await r.update();
        await new Promise(resolve=>{if(r.waiting)return resolve();if(!r.installing)return resolve();r.installing.addEventListener('statechange',()=>{if(r.waiting)resolve()})});
        const before={waiting:!!r.waiting,loads:window.loads};
        const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
        r.waiting?.postMessage({type:'ACTIVATE_WHEN_SAFE'});await changed;
        return {...before,loadsAfter:window.loads,isolated:crossOriginIsolated};
      });
      await page.goto(url+'/dam-good-maps/preview/');
      await page.waitForFunction(()=>window.ready&&navigator.serviceWorker.controller?.scriptURL.endsWith('/preview/isolation-sw.js'));
      row.preview=await page.evaluate(async()=>({isolated:crossOriginIsolated,script:navigator.serviceWorker.controller.scriptURL,parent:(await navigator.serviceWorker.getRegistration('/dam-good-maps/')).active.scriptURL}));
      await page.goto(url+'/sibling/');await page.waitForFunction(()=>window.ready);row.sibling=await page.evaluate(()=>({isolated:crossOriginIsolated,controlled:!!navigator.serviceWorker.controller}));
      const fallback=await browser.newContext({serviceWorkers:'block'}),no=await fallback.newPage();
      await no.goto(url+'/dam-good-maps/');await no.waitForFunction(()=>window.ready);row.blocked=await no.evaluate(()=>({isolated:crossOriginIsolated,loads:window.loads}));await fallback.close();
      const conflict=await browser.newContext(),cp=await conflict.newPage();await cp.goto(url+'/sibling/');
      await cp.evaluate(async()=>{const r=await navigator.serviceWorker.register('/dam-good-maps/existing-cache.js');await new Promise(resolve=>{if(r.active)return resolve();r.installing.addEventListener('statechange',()=>{if(r.active)resolve()});});});
      await cp.goto(url+'/dam-good-maps/');await cp.waitForFunction(()=>window.ready);row.existingWorker=await cp.evaluate(async()=>({isolated:crossOriginIsolated,loads:window.loads,script:(await navigator.serviceWorker.getRegistration()).active.scriptURL}));
      await cp.goto(url+'/dam-good-maps/preview/');await cp.waitForFunction(()=>window.ready&&crossOriginIsolated&&navigator.serviceWorker.controller?.scriptURL.endsWith('/preview/isolation-sw.js'));
      row.previewOverCache=await cp.evaluate(async()=>({isolated:crossOriginIsolated,script:navigator.serviceWorker.controller.scriptURL,parent:(await navigator.serviceWorker.getRegistration('/dam-good-maps/')).active.scriptURL}));await conflict.close();
      const cached=await browser.newContext(),cachePage=await cached.newPage();row.cacheAttempt='first visit';await cachePage.goto(url+'/cached/');await cachePage.waitForFunction(()=>window.ready&&crossOriginIsolated);
      row.cacheAttempt='cached online navigation';await cachePage.reload();await cachePage.waitForFunction(()=>window.ready);
      row.cacheAttempt='cached offline navigation';await cached.setOffline(true);
      try{await cachePage.reload();await cachePage.waitForFunction(()=>window.ready);row.cacheOffline=await cachePage.evaluate(()=>({isolated:crossOriginIsolated,loads:window.loads}));}catch(e){row.offlineEmulationError=String(e);}
      await cached.setOffline(false);blockCachedNetwork=true;
      try{await cachePage.goto(url+'/cached/');await cachePage.waitForFunction(()=>window.ready);row.networkFailureCached=await cachePage.evaluate(()=>({isolated:crossOriginIsolated,loads:window.loads}));}finally{blockCachedNetwork=false;await cached.close();}
      if(row.offlineEmulationError){
        const plain=await browser.newContext(),plainPage=await plain.newPage();await plainPage.goto(url+'/plain-cache/');await plainPage.waitForFunction(()=>window.ready&&Number(sessionStorage.loads)>1);await plainPage.reload();await plainPage.waitForFunction(()=>window.ready);await plain.setOffline(true);
        try{await plainPage.reload();await plainPage.waitForFunction(()=>window.ready);row.plainOfflineControl='passed';}catch(e){row.plainOfflineControl=String(e);}finally{await plain.close();}
      }
      row.cacheAttempt='passed online and network-failure navigation';
      assert.equal(row.isolated,true);assert.equal(row.sab,true);assert.equal(row.loads,2);
      assert.deepEqual(row.resources,{denied:false,corp:true,cors:true});assert.equal(row.warm.isolated,true);
      assert.equal(row.update.waiting,true);assert.equal(row.update.loads,row.update.loadsAfter);
      assert.equal(row.preview.isolated,true);assert.ok(row.preview.script.endsWith('/preview/isolation-sw.js'));assert.ok(row.preview.parent.endsWith('/dam-good-maps/isolation-sw.js'));
      assert.equal(row.sibling.controlled,false);assert.equal(row.sibling.isolated,false);
      assert.equal(row.blocked.isolated,false);assert.equal(row.blocked.loads,1);
      assert.equal(row.existingWorker.isolated,false);assert.equal(row.existingWorker.loads,1);assert.ok(row.existingWorker.script.endsWith('/existing-cache.js'));
      assert.equal(row.previewOverCache.isolated,true);assert.ok(row.previewOverCache.script.endsWith('/preview/isolation-sw.js'));assert.ok(row.previewOverCache.parent.endsWith('/dam-good-maps/existing-cache.js'));
      assert.equal(row.networkFailureCached.isolated,true);if(!row.offlineEmulationError)assert.equal(row.cacheOffline.isolated,true);else assert.notEqual(row.plainOfflineControl,'passed');
      console.log(name,JSON.stringify(row));json('isolation.json',evidence);
    }catch(e){evidence.engines[name]={...evidence.engines[name],error:String(e)};console.error(name,String(e));process.exitCode=1;}
    finally{await browser.close();}
  }
}finally{host.close();external.close();json('isolation.json',evidence);}
