import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';import {gunzipSync,strFromU8} from 'fflate';
const root=path.resolve('investigation/map-switch-speed/local/after');
const server=http.createServer((req,res)=>{let p=path.join(root,req.url.split('?')[0]);if(p.endsWith(path.sep))p+='index.html';res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');if(fs.existsSync(p)&&fs.statSync(p).isFile())fs.createReadStream(p).pipe(res);else{res.statusCode=404;res.end();}}).listen(5193,'127.0.0.1');
const ctx=await chromium.launchPersistentContext(path.resolve('investigation/map-switch-speed/local/chrome-after'),{channel:'chrome',headless:true,viewport:{width:1440,height:900},args:['--renderer-process-limit=2','--num-raster-threads=2']});const page=ctx.pages()[0];page.setDefaultTimeout(180000);await ctx.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4}));page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')console.log('BROWSER',m.text());});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const decode=raw=>JSON.parse(strFromU8(gunzipSync(Uint8Array.from(raw))));
const saved=async id=>await page.evaluate(async id=>{const db=await new Promise(r=>{const q=indexedDB.open('dgm-your-maps',1);q.onsuccess=()=>r(q.result);});return await new Promise(r=>{const q=db.transaction('projects').objectStore('projects').get(id);q.onsuccess=()=>{db.close();r(q.result?Array.from(q.result):null);};});},id);
try{
 await page.goto('http://127.0.0.1:5193/');await page.waitForFunction(()=>window.dgmEditor&&window.dgm3d&&window.dgmEditor.info().waterPending===false);console.log('current',await page.evaluate(()=>window.dgmEditor.info().name));
 // A canonical completion, without another edit, must refresh the pending-water save.
 let target=decode(await saved('profile-target'));
 const deadline=Date.now()+180000;
 while(!target.stored){if(Date.now()>deadline)throw new Error('Canonical save did not arrive');await page.waitForTimeout(100);target=decode(await saved('profile-target'));}
 assert.equal(target.edits.length,7);console.log('canonical resave passed');
 await page.getByRole('button',{name:'Your maps',exact:true}).click();
 // Queue edits and switch immediately: the snapshot must drain the queue, retaining both edits.
 await page.evaluate(()=>{window.__pending=[215,216].map(x=>window.dgmEditor.edit({op:'sculpt',params:{mode:'raise',cells:[[210,x,x]],amount:1}},'Queued outgoing edit'));});
 await page.locator('.ym-tile').filter({hasText:'Sentinel Valley'}).click();
 await page.waitForFunction(()=>window.dgmEditor?.info().name==='Sentinel Valley'&&!document.querySelector('.editor').inert);
 const leaving=decode(await saved('profile-target'));assert.equal(leaving.edits.length,9);assert.equal(leaving.meta.name,'Profile target');assert.equal((await page.evaluate(()=>window.dgmEditor.info().history.length)),8);console.log('queued outgoing edits passed');
 await page.evaluate(()=>window.__renderer=window.dgm3d.renderer);
 await page.getByRole('button',{name:'Map Generator',exact:true}).click();await page.getByRole('group',{name:'Size',exact:true}).getByRole('button',{name:'96',exact:true}).click();
 await page.getByRole('form',{name:'Settings'}).locator('button[type="submit"]').click();
 await page.waitForFunction(()=>window.dgmEditor?.info().W===96&&window.dgm3d?.renderer.mapState().W===96&&!document.querySelector('.editor').inert);assert.equal(await page.evaluate(()=>window.__renderer===window.dgm3d.renderer),true);console.log('Generate switch passed');
 const seed=await page.evaluate(()=>window.dgmEditor.info().spec.seed);await page.getByRole('button',{name:'Surprise me',exact:true}).click();await page.waitForFunction(seed=>window.dgmEditor?.info().spec.seed!==seed&&window.dgm3d?.renderer.mapState().W===96&&!document.querySelector('.editor').inert,seed);assert.equal(await page.evaluate(()=>window.__renderer===window.dgm3d.renderer),true);console.log('Surprise switch passed');
 assert.deepEqual(errors,[]);fs.writeFileSync('investigation/map-switch-speed/browser-checks.json',JSON.stringify({canonicalResave:true,queuedOutgoingEdits:true,generate:true,surprise:true,rendererRetained:true,pageErrors:errors},null,2));
}finally{await ctx.close();server.close();}
