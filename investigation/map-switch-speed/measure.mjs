import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from '@playwright/test';
const side=process.argv[2]??'before'; const root=path.resolve('investigation/map-switch-speed/local',side);
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURI(req.url.split('?')[0]));if(p.endsWith(path.sep))p+='index.html';res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':'application/octet-stream'); if(fs.existsSync(p)&&fs.statSync(p).isFile())fs.createReadStream(p).pipe(res);else{res.statusCode=404;res.end();}}).listen(5193,'127.0.0.1');
const context=await chromium.launchPersistentContext(path.resolve(`investigation/map-switch-speed/local/chrome-${side}`),{channel:'chrome',headless:true,viewport:{width:1440,height:900},args:['--renderer-process-limit=2','--num-raster-threads=2','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
await context.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});localStorage.setItem('dgm.look','high');});
const page=context.pages()[0];page.setDefaultTimeout(180000); page.on('pageerror',e=>console.log('PAGEERROR',String(e)));
try{
 console.log('launch',side);
 {
   await page.route('**/seed',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture setup</title>'}));
   await page.goto('http://127.0.0.1:5193/seed');
   await page.evaluate(async raw=>{const bytes=Uint8Array.from(raw);const db=await new Promise(r=>{const q=indexedDB.open('dgm-your-maps',1);q.onupgradeneeded=()=>{q.result.createObjectStore('entries',{keyPath:'id'});q.result.createObjectStore('projects');};q.onsuccess=()=>r(q.result);});const tx=db.transaction(['entries','projects'],'readwrite');const now=new Date().toISOString();tx.objectStore('entries').clear();tx.objectStore('projects').clear();for(const id of ['profile-outgoing','profile-target']){tx.objectStore('entries').put({id,name:id==='profile-target'?'Profile target':'Sentinel Valley',kind:'generated',createdAt:now,editedAt:now,starred:true,thumbnail:null,revision:1,savedToTimberborn:null,bytes:bytes.length,size:{w:256,h:256}});tx.objectStore('projects').put(bytes,id);}await new Promise(r=>tx.oncomplete=r);db.close();localStorage.setItem('dgm.current',JSON.stringify({id:'profile-outgoing',link:''}));},Array.from(fs.readFileSync('investigation/map-switch-speed/samples/edited-256.damgoodmaps.json.gz')));
   await page.goto('http://127.0.0.1:5193/');
 }
 await page.waitForFunction(()=>window.dgmEditor&&window.dgm3d);console.log('opened',await page.evaluate(()=>({name:window.dgmEditor.info().name,W:window.dgmEditor.info().W,history:window.dgmEditor.info().history.length})));
 const gpu=await page.evaluate(()=>{const c=document.createElement('canvas').getContext('webgl2');const x=c.getExtension('WEBGL_debug_renderer_info');return c.getParameter(x.UNMASKED_RENDERER_WEBGL);});console.log('GPU',gpu);
 if(side==='after')await page.waitForFunction(()=>window.dgmEditor.info().waterPending===false);
 // Refresh the list through its existing drawer action (the page's normal refresh on edits).
 await page.getByRole('button',{name:'Your maps',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.ym-tile')?.textContent?.includes('Profile target')||Array.from(document.querySelectorAll('.ym-tile')).some(e=>e.textContent.includes('Profile target')),{timeout:10000}).catch(()=>{});
 console.log('tiles',await page.locator('.ym-tile').allTextContents());
 if(!(await page.locator('.ym-tile').filter({hasText:'Profile target'}).count())){await page.reload();await page.waitForFunction(()=>window.dgmEditor&&window.dgm3d);await page.getByRole('button',{name:'Your maps',exact:true}).click();}
 // Leave one outgoing edit pending so this reading includes the flush.
 await page.evaluate(()=>window.dgmEditor.edit({op:'sculpt',params:{mode:'raise',cells:[[210,214,214]],amount:1}},'Outgoing edit'));
 await page.locator('.ym-tile').filter({hasText:'Profile target'}).click();
 await page.waitForFunction(()=>window.__switch?.ready&&window.dgmEditor&&window.dgmEditor.waterSettled());
 if(side==='after')await page.waitForFunction(()=>window.dgmEditor.info().waterPending===false);
 const result=await page.evaluate(()=>({...window.__switch,finish:performance.now(),info:{name:window.dgmEditor.info().name,history:window.dgmEditor.info().history.length},build:window.dgm3d.build}));result.gpu=gpu;result.browser=context.browser().version();
 fs.writeFileSync(`investigation/map-switch-speed/${side}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 await page.screenshot({path:`investigation/map-switch-speed/local/${side}.png`});
}catch(e){console.log(String(e));console.log(await page.locator('body').innerText());throw e;}finally{await context.close();server.close();}
