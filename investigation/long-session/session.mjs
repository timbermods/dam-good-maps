import {chromium, expect} from '@playwright/test';
import {mkdirSync, appendFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {installProbe} from './probe.mjs';
const runName=process.env.DGM_RUN_NAME||'hour';
if(!/^[a-z0-9-]+$/.test(runName))throw new Error('Invalid run name');
const local=resolve('investigation/long-session/local',runName);
mkdirSync(local+'/temp',{recursive:true});
const duration=Number(process.env.DGM_SESSION_MS||3600000);
const rounds=Number(process.env.DGM_SESSION_ROUNDS||50);
const context=await chromium.launchPersistentContext(local+'/chrome-profile',{
 channel:'chrome',headless:false,viewport:{width:1600,height:1000},
 env:{...process.env,TEMP:local+'/temp',TMP:local+'/temp'},
 args:['--remote-debugging-port=4191','--renderer-process-limit=1','--num-raster-threads=2','--disable-background-timer-throttling','--disable-renderer-backgrounding','--enable-precise-memory-info']
});
await context.addInitScript(`(${installProbe.toString()})()`);
const page=context.pages()[0];
page.setDefaultTimeout(90000);
const workers=new Map();let born=0,dead=0,phase='opening',started=Date.now(),sampleBusy=false;
const counts={switches:0,generates:0,brushes:{},forces:{},undo:0,redo:0,weatherSteps:0};
const log=(kind,value)=>appendFileSync(local+'/session.jsonl',JSON.stringify({kind,at:new Date().toISOString(),elapsedMs:Date.now()-started,phase,...value})+'\n');
writeFileSync(local+'/session.jsonl','');
page.on('worker',w=>{const id=++born;workers.set(w,id);log('worker-start',{id,url:w.url()});w.on('close',()=>{dead++;workers.delete(w);log('worker-end',{id,url:w.url()});});});
page.on('pageerror',e=>log('pageerror',{error:String(e)}));
page.on('console',m=>{if(['error','warning'].includes(m.type()))log('console',{type:m.type(),text:m.text().slice(0,1200)});});
const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
async function sample(label=phase){
 if(sampleBusy)return;sampleBusy=true;
 try{
  const metrics=await cdp.send('Performance.getMetrics');
  const p=await page.evaluate(()=>{const r=window.dgm3d?.renderer,c=r?.gl.getContext();return {probe:globalThis.__longSession?.snapshot(),gpu:c?__longSession.gpu(c):null,three:r?{...r.gl.info.memory,programs:r.gl.info.programs.length}:null,
   renderer:r?{look:r.look,waterChunks:r.water.size,terrainChunks:r.terrain.size,mesherAsked:r.mesherOwn?.asked.size||0}:null,
   map:window.dgmEditor?{W:window.dgmEditor.info().W,H:window.dgmEditor.info().H,version:window.dgmEditor.info().version,history:window.dgmEditor.info().history.length,pending:window.dgmEditor.pendingTerrain(),force:window.dgmEditor.force()?.verb||null}:null};});
  const ws=await Promise.all([...workers].map(async([w,id])=>{
   try{return {id,url:w.url(),...await w.evaluate(()=>globalThis.__longSession?.snapshot()||{missingProbe:true})};}catch(e){return {id,url:w.url(),error:String(e).slice(0,200)};}
  }));
  log('sample',{label,...p,metrics:Object.fromEntries(metrics.metrics.filter(x=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','JSEventListeners'].includes(x.name)).map(x=>[x.name,x.value])),liveWorkers:workers.size,born,dead,workers:ws,counts:structuredClone(counts)});
  console.log(JSON.stringify({sample:label,seconds:Math.round((Date.now()-started)/1000),workers:workers.size,heap:p.probe?.heap?.used,three:p.three,counts}));
 }catch(e){log('sample-error',{error:String(e)});}finally{sampleBusy=false;}
}
async function ready(){await page.waitForFunction(()=>window.dgmEditor&&window.dgm3d,null,{timeout:180000});await page.evaluate(()=>window.dgmEditor.idle());}
async function idle(){await page.evaluate(()=>window.dgmEditor.idle());await page.waitForFunction(()=>window.dgmEditor.pendingTerrain()===0,null,{timeout:90000});}
async function settled(){await page.waitForFunction(()=>window.dgmEditor.force()===null,null,{timeout:180000});await idle();}
async function undoRedo(){await page.keyboard.press('Escape');const u=page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true});if(await u.isEnabled()){await u.click();counts.undo++;await idle();const r=page.getByRole('button',{name:'Redo (Ctrl+Y)',exact:true});await expect(r).toBeEnabled();await r.click();counts.redo++;await idle();}}
async function closePanels(){for(const name of ['Map Generator','Your maps']){const b=page.locator('header.editor-bar').getByRole('button',{name,exact:true});if(await b.getAttribute('aria-pressed')==='true')await b.click();}}
async function draw(tool,force=false){
 await closePanels();await page.keyboard.press('Escape');
 const dismiss=page.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.count())await dismiss.click();
 await page.getByRole('button',{name:'Top-down',exact:true}).evaluate(b=>{if(b.getAttribute('aria-pressed')!=='true')b.click();});
 const re=new RegExp('^'+tool+(force?'(?: \\(|$)':' brush'));
 await page.getByRole('button',{name:re}).click();
 await page.waitForFunction(()=>window.dgm3d.renderer.tool!==null);
 if(force){const power=page.getByRole('group',{name:tool+' options',exact:true}).getByRole('slider',{name:'Power',exact:true});if(await power.count())await power.fill('25');}
 else {const size=page.getByRole('slider',{name:'Size',exact:true});if(await size.count())await size.fill('8');const strength=page.getByRole('slider',{name:'Strength',exact:true});if(await strength.count())await strength.fill(await strength.getAttribute('max'));}
 const pts=await page.evaluate(()=>{
   const r=window.dgm3d.renderer,m=r.mapState(),x=Math.round(m.W*.35),y=Math.round(m.H*.48);
   r.setView({target:[x+.5,r.getView().target[1],-(y+.5)]});return [x,y,x+12,y+6];
 });
 await page.waitForTimeout(350);
  const [a,b]=await page.evaluate(([cx,cy])=>{
  const m=window.dgm3d.renderer.mapState();let best=null,score=-Infinity;
  for(let y=Math.max(12,cy-20);y<Math.min(m.H-20,cy+20);y+=2)for(let x=Math.max(12,cx-20);x<Math.min(m.W-24,cx+20);x+=2){
   const a=window.dgmEditor.tileToClient(x,y),b=window.dgmEditor.tileToClient(x+12,y+6);
   if(m.surface.depth[y*m.W+x]>.1||m.surface.depth[(y+6)*m.W+x+12]>.1)continue;
   let clear=true;for(let k=0;k<=12;k++){if(document.elementFromPoint(a.x+(b.x-a.x)*k/12,a.y+(b.y-a.y)*k/12)?.tagName!=='CANVAS'){clear=false;break;}}
   if(!clear)continue;const heights=[];for(let yy=y-3;yy<=y+9;yy+=2)for(let xx=x-3;xx<=x+15;xx+=2)heights.push(m.heights[yy*m.W+xx]);
   const s=Math.max(...heights)-Math.min(...heights)-Math.hypot(x-cx,y-cy)*.02;
   if(s>score){score=s;best=[a,b];}
  }
  if(!best)throw new Error('No unobstructed dry gesture path');return best;
 },pts);
 for(const p of [a,b]){const ok=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS',p);if(!ok)throw new Error('Gesture endpoint is covered: '+JSON.stringify({tool,p}));}
 const before=await page.evaluate(()=>window.dgmEditor.info().version);
 if(force&&['Craterize','Erupt','Deposit'].includes(tool)){await page.mouse.click(a.x,a.y);}
 else {await page.mouse.move(a.x,a.y);await page.mouse.down();for(let k=1;k<=12;k++){await page.mouse.move(a.x+(b.x-a.x)*k/12,a.y+(b.y-a.y)*k/12);await page.waitForTimeout(25);}await page.mouse.up();}
 if(force){await page.waitForFunction(v=>window.dgmEditor.force()!==null||window.dgmEditor.info().version!==v,before,{timeout:30000});await settled();counts.forces[tool]=(counts.forces[tool]||0)+1;}
 else {if(tool==='Naturalize')await page.waitForFunction(v=>window.dgmEditor.info().version>v,before,{timeout:10000}).catch(()=>log('unchanged-naturalize',{before}));await idle();counts.brushes[tool]=(counts.brushes[tool]||0)+1;}
 log('gesture',{tool,force,before,after:await page.evaluate(()=>window.dgmEditor.info().version)});
 await undoRedo();
}
async function weather(h){
 await page.keyboard.press('Escape');const b=page.getByRole('button',{name:h,exact:true});await b.click();
 // Request actual days through the player's stepper, and wait for each fill to disappear.
 for(const key of ['Day back','Day on']){await page.getByRole('button',{name:key,exact:true}).click();counts.weatherSteps++;await page.waitForFunction(()=>!document.querySelector('.day-label.working'),null,{timeout:180000});}
 await b.click();await idle();
}
async function generate(size,seed){
 await closePanels();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Map Generator',exact:true}).click();
 const d=page.locator('aside[aria-label="Map Generator"]');
 await d.getByRole('group',{name:'Size',exact:true}).getByRole('button',{name:String(size),exact:true}).click();
 await d.locator('#seed').fill(String(seed));
 const prior=await page.evaluate(()=>window.dgmEditor.info().version);
 const before=await page.evaluate(()=>window.dgm.current()?.made||0);
 await d.locator('button[type="submit"]').click();
 await page.waitForFunction(n=>(window.dgm.current()?.made||0)>n,before,{timeout:240000});await page.waitForFunction(([v,z,s])=>window.dgmEditor?.info().version>v&&window.dgmEditor.info().W===z&&window.dgmEditor.info().spec?.seed===s,[prior,size,seed],{timeout:120000});await ready();counts.generates++;
 await closePanels();log('generate',{size,seed});
}
async function saveId(){
 await page.waitForFunction(()=>window.dgm.kept(window.dgmEditor.info().version),null,{timeout:120000});
 await page.getByRole('button',{name:'Your maps',exact:true}).click();
 const id=await page.locator('.ym-tile[aria-current="true"]').evaluate(e=>e.closest('li').dataset.id);
 await closePanels();return id;
}
async function switchMap(id){
 const prior=await page.evaluate(()=>window.dgmEditor.info().version);
 await closePanels();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Your maps',exact:true}).click();
 const row=page.locator(`li[data-id="${id}"] .ym-tile`);await row.click();await page.waitForFunction(v=>window.dgmEditor?.info().version>v,prior,{timeout:120000});await ready();await closePanels();counts.switches++;log('switch',{id});
}
let interval;
try{
 await page.goto('http://localhost:4189/dam-good-maps/#s=4262&z=96&d=n&t=riverValley');await ready();
 const gpu=await page.evaluate(()=>{const c=window.dgm3d.renderer.gl.getContext(),e=c.getExtension('WEBGL_debug_renderer_info');return c.getParameter(e.UNMASKED_RENDERER_WEBGL);});
 if(/SwiftShader|llvmpipe|Software/i.test(gpu))throw new Error('Hardware GPU required: '+gpu);
 log('environment',{gpu,browser:context.browser()?.version(),hardwareConcurrency:4,duration,rounds});
 interval=setInterval(()=>void sample(),30000);
 phase='fixtures';await draw('Raise');const ids=[await saveId()];
 for(const [size,seed]of [[128,4263],[256,4264]]){await generate(size,seed);await draw('Lower');ids.push(await saveId());}
 writeFileSync(local+'/saved-ids.json',JSON.stringify(ids));
 Object.assign(counts,{switches:0,generates:0,brushes:{},forces:{},undo:0,redo:0,weatherSteps:0});
 started=Date.now();phase='baseline';await sample();await page.screenshot({path:local+'/baseline.png'});
 const brushes=['Raise','Lower','Flatten','Smooth','Naturalize'];const forces=['Carve','Craterize','Erupt','Rift','Quake','Glaciate','Deposit'];
 for(let i=0;i<rounds;i++){
  phase=`round-${i+1}`;
  // Fifty saved-map transitions and twenty measured UI Generates; fixture setup is excluded.
  await switchMap(ids[(i+1)%ids.length]);
  await draw(brushes[i%brushes.length]);
  if(i<forces.length||i%7===0)await draw(forces[i%forces.length],true);
  if(i%3===0)await weather(i%2?'Badtide':'Drought');
  if(counts.generates<20){await generate([96,128,256][i%3],4300+i);await draw(brushes[(i+1)%brushes.length]);}
  await sample('round-complete-'+(i+1));
  const target=started+duration*(i+1)/rounds;
  while(Date.now()<target){await page.waitForTimeout(Math.min(1000,target-Date.now()));}
 }
 phase='end';await sample('end');await page.screenshot({path:local+'/end.png'});
 writeFileSync(local+'/completion.json',JSON.stringify({completed:true,elapsedMs:Date.now()-started,counts,ids,gpu},null,2));
 console.log('SESSION COMPLETE',JSON.stringify(counts));
 // Keep the instrumented page available for retainer diagnostics; the file is a reviewable completion marker.
 clearInterval(interval);if(process.env.DGM_KEEP_OPEN==='1')interval=setInterval(()=>void sample('post-session'),30000);else await context.close();
}catch(e){clearInterval(interval);log('fatal',{error:String(e),stack:e.stack,counts});await page.screenshot({path:local+'/failure.png'}).catch(()=>{});writeFileSync(local+'/completion.json',JSON.stringify({completed:false,error:String(e),counts},null,2));console.error(e);process.exitCode=1;}
