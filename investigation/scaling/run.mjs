import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,appendFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {connect} from './cdp.mjs';
import {memorySampler} from './memory-sampler.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),root=resolve(dir,'../..'),local=resolve(dir,'local');
const phase=process.argv[2]??'before',sizes=(process.env.SCALING_SIZES??'128x128,256x256,512x512,128x512,512x256,64x512').split(','),repeats=Number(process.env.SCALING_REPEATS??3),smoke=process.env.SCALING_SMOKE==='1',suite=process.env.SCALING_SUITE??'editing';
const output=resolve(local,`browser-${phase}-${Date.now()}`);mkdirSync(output,{recursive:true});
const stop=resolve(output,'stop'),load=spawn('powershell.exe',['-NoProfile','-File',resolve(dir,'load.ps1'),'-Output',resolve(output,'load.jsonl'),'-Stop',stop],{windowsHide:true});
load.on('error',e=>appendFileSync(resolve(output,'errors.log'),String(e)+'\n'));
const server=createServer((req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=path==='/investigation/scaling/probe.js'?resolve(dir,'probe.js'):path.startsWith('/fixture/')?resolve(local,'probe',path.slice(9)):resolve(local,'build',phase,path==='/'?'index.html':'.'+path);const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg'};res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
let browser,cdpRoot;
const results=[];
const save=()=>writeFileSync(resolve(output,'results.json'),JSON.stringify({phase,suite,smoke,browserVersion:browser?.version(),headless:true,repeats,results},null,2));
try {
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-precise-memory-info','--js-flags=--expose-gc','--remote-debugging-port=9472']});
  cdpRoot=await connect((await(await fetch('http://localhost:9472/json/version')).json()).webSocketDebuggerUrl);
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  async function idle(page){await page.waitForFunction(()=>window.dgmEditor&&!window.dgmEditor.force()&&!window.dgmEditor.pendingTerrain(),null,{timeout:180000});await page.evaluate(()=>window.dgmEditor.idle());}
  async function settle(page){await idle(page);await page.evaluate(()=>Promise.race([window.dgmEditor.worker.whenWaterSettles(),new Promise((_,j)=>setTimeout(()=>j(Error('water timeout')),180000))]));await page.waitForTimeout(300);}
  let profilingSample=null; async function memory(page){await profilingSample?.pause();try{const retainedWorker=await page.evaluate(()=>window.dgmEditor.worker.scalingMemory()),geometry=await page.evaluate(()=>window.scaling.geometry());const cdp=await ctx.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');await cdp.detach();const workers=[];for(const t of (await cdpRoot.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker')){const {sessionId}=await cdpRoot.send('Target.attachToTarget',{targetId:t.targetId,flatten:true});await cdpRoot.send('HeapProfiler.collectGarbage',{},sessionId);workers.push({url:t.url,heap:await cdpRoot.send('Runtime.getHeapUsage',{},sessionId)});await cdpRoot.send('Target.detachFromTarget',{sessionId});}return {heap,workers,processes:(await cdpRoot.send('SystemInfo.getProcessInfo')).processInfo,retainedWorker,geometry};}finally{profilingSample?.resume();}}
  async function action(page,name,fn){const editsBefore=await page.evaluate(()=>window.dgmEditor.info().edits);await page.evaluate(()=>window.scaling.start());const at=Date.now(),t=performance.now();let error;try{await fn();await idle(page);}catch(e){error=String(e);}await page.waitForTimeout(100);const probe=await page.evaluate(()=>window.scaling.stop());const ms=performance.now()-t;const verification=await page.evaluate(()=>window.scalingVerify?.(window.dgm3d.renderer));const result=await page.evaluate(()=>({edits:window.dgmEditor.info().edits,forceTiming:window.dgmEditor.forceTiming(),notes:[...document.querySelectorAll('.map-note,.error,.notice,.editor-message')].map(x=>x.textContent)}));console.log(name,Math.round(ms),error??'',`edits ${editsBefore}->${result.edits}`);return {name,at,ms,error,probe,verification,editsBefore,result};}
  async function undo(page){const button=page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true});if(await button.isEnabled())await button.click();await settle(page);}
  async function clickTile(page,point){const p=await page.evaluate(([x,y])=>window.dgmEditor.tileToClient(x,y),point);const ok=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS',p);if(!ok)throw Error('gesture obscured: '+JSON.stringify(p));await page.mouse.move(p.x+2,p.y);await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);}
  async function drag(page,a,b){const pts=await page.evaluate(([a,b])=>[window.dgmEditor.tileToClient(...a),window.dgmEditor.tileToClient(...b)],[a,b]);await page.mouse.move(pts[0].x,pts[0].y);await page.mouse.down();for(let i=1;i<=20;i++){await page.mouse.move(pts[0].x+(pts[1].x-pts[0].x)*i/20,pts[0].y+(pts[1].y-pts[0].y)*i/20);await page.waitForTimeout(16);}await page.mouse.up();}
  for(const size of sizes)for(let repeat=1;repeat<=repeats;repeat++){
    const record={size,repeat,rows:[]};results.push(record);const page=await ctx.newPage();page.on('pageerror',e=>record.rows.push({name:'page-error',error:String(e)}));
    try{
      await page.goto(url+'/#s=4242&z=128&d=n&t=highlands');
      await page.waitForFunction(()=>window.scalingOpen&&window.scaling,null,{timeout:180000});
      // Await initial generation before importing to prevent its late result replacing the import.
      await page.getByRole('button',{name:'Refine this map',exact:true}).waitFor({timeout:180000});
      const loadSamples=suite==='memory'?await memorySampler(cdpRoot):null;profilingSample=loadSamples;
      const t=performance.now(),at=Date.now();
      await page.evaluate(()=>window.scaling.start());
      await page.evaluate(async name=>{const bytes=new Uint8Array(await(await fetch('/fixture/'+name)).arrayBuffer());await window.scalingOpen(bytes,name);},`sizes-${size}.timber`);
      await page.waitForFunction(()=>window.dgmEditor&&window.dgm3d,null,{timeout:180000});await settle(page);
      record.rows.push({name:'open',at,ms:performance.now()-t,probe:await page.evaluate(()=>window.scaling.stop()),memory:await memory(page)});
      if(loadSamples)record.openMemorySamples=await loadSamples.stop();profilingSample=null;
      console.log(size,repeat,'open',Math.round(performance.now()-t));
      if(suite==='memory'){
        const sample=await memorySampler(cdpRoot);profilingSample=sample;const [W,H]=size.split('x').map(Number),checkpoints=[];
        try{for(let n=0;n<=128;n++){
          if([0,8,32,64,128].includes(n))checkpoints.push({step:n,at:Date.now(),memory:await memory(page)});
          if(n===128)break;await page.evaluate(async([x,y])=>window.dgmEditor.edit({op:'sculpt',params:{mode:'raise',cells:[[y,x,x+1]],amount:1,exact:true}},'Scaling session'),[Math.round(Math.min(W,256)*.55)+(n%8),Math.round(Math.min(H,256)*.4)+Math.floor(n/8)]);await idle(page);
        }await settle(page);record.session=checkpoints;record.memory=await memory(page);}finally{record.memorySamples=await sample.stop();profilingSample=null;}save();continue;
      }
      if(suite==='brush'){
        const [W,H]=size.split('x').map(Number);await page.getByRole('button',{name:'Top-down',exact:true}).click();
        record.rows.push(await action(page,'brush-supported',async()=>{await page.getByRole('button',{name:'Raise brush (1)',exact:true}).click();const row=page.getByRole('group',{name:'Raise options',exact:true});await row.getByRole('slider',{name:'Size',exact:true}).evaluate(e=>{e.value=String(Math.min(128,Number(e.max)));e.dispatchEvent(new Event('input',{bubbles:true}));});await row.getByRole('combobox',{name:'Target level',exact:true}).selectOption('free');await drag(page,[Math.min(W,256)*.35,Math.min(H,256)*.35],[Math.min(W,256)*.65,Math.min(H,256)*.65]);}));await settle(page);
        record.rows.push(await action(page,'undo-supported',()=>undo(page)));
        record.rows.push(await action(page,'redo-supported',async()=>{await page.getByRole('button',{name:'Redo (Ctrl+Y)',exact:true}).click();await settle(page);}));record.memory=await memory(page);save();continue;
      }
      if(suite==='forces'||suite==='objects'){
        const [W,H]=size.split('x').map(Number);await page.getByRole('button',{name:'Top-down',exact:true}).click();
        for(const [name,key,mode] of suite==='forces'?[['Carve','7','Aim'],['Craterize','8','Aim'],['Erupt','0','Fissure'],['Glaciate','-','Aim'],['Quake','9','Slide'],['Quake','9','Lift']]:[]){
          record.rows.push(await action(page,`force-${name.toLowerCase()}-${mode.toLowerCase()}-stroke`,async()=>{
            const button=page.getByRole('button',{name:`${name} (${key})`,exact:true});if(await button.getAttribute('aria-pressed')!=='true')await button.click();const row=page.getByRole('group',{name:name+' options',exact:true});
            await row.getByRole('slider',{name:'Power',exact:true}).evaluate(e=>{e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}));});if(name==='Quake')await row.getByRole('button',{name:mode,exact:true}).click();const count=await page.evaluate(()=>window.dgmEditor.info().edits);
            await drag(page,[W*.3,H*.3],[W*.8,H*.7]);await page.waitForFunction(count=>window.dgmEditor.force()||window.dgmEditor.info().edits>count,count,{timeout:20000});await idle(page);
          }));await settle(page);await undo(page);save();
        }
        record.rows.push(await action(page,'select-delete-everything',async()=>{const select=page.getByRole('button',{name:'Select (M)',exact:true});if(await select.getAttribute('aria-pressed')!=='true')await select.click();await page.getByRole('button',{name:'Whole map',exact:true}).click();await page.locator('.options-row').getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('menuitem',{name:/^Everything/}).click();}));await settle(page);
        record.rows.push(await action(page,'undo-delete-everything',()=>undo(page)));
        record.rows.push(await action(page,'redo-delete-everything',async()=>{await page.getByRole('button',{name:'Redo (Ctrl+Y)',exact:true}).click();await settle(page);}));
        record.memory=await memory(page);save();continue;
      }
      if(suite==='saves'){
        const sample=await memorySampler(cdpRoot);profilingSample=sample;
        try{
        record.rows.push(await action(page,'save-timber',()=>page.evaluate(async()=>{const r=await window.dgmEditor.worker.exportTimber(true);window.scalingSavedTimber=r;return {ok:r.ok,errors:r.errors,bytes:r.bytes?.length};})));record.rows.at(-1).result=await page.evaluate(()=>({ok:window.scalingSavedTimber.ok,errors:window.scalingSavedTimber.errors,bytes:window.scalingSavedTimber.bytes?.length}));
        record.rows.push(await action(page,'save-project',()=>page.evaluate(async()=>{window.scalingSavedProject=await window.dgmEditor.worker.project();})));record.rows.at(-1).bytes=await page.evaluate(()=>window.scalingSavedProject.bytes.length);
        record.rows.push(await action(page,'reopen-project',()=>page.evaluate(async()=>{const p=window.scalingSavedProject;await window.scalingOpen(p.bytes,p.fileName);})));await settle(page);
        const parity=await page.evaluate(async()=>{const before=window.scalingSavedTimber,after=await window.dgmEditor.worker.exportTimber(true);if(!before.ok||!after.ok)return {ok:false,before:before.errors,after:after.errors};const a=before.bytes,b=after.bytes;return {ok:a.length===b.length&&a.every((x,i)=>x===b[i]),bytes:b.length};});record.parity=parity;record.memory=await memory(page);
        }finally{record.memorySamples=await sample.stop();profilingSample=null;}save();continue;
      }
      await page.getByRole('button',{name:'Top-down',exact:true}).click();await page.waitForTimeout(100);
      const [W,H]=size.split('x').map(Number);const mid=[W*.6,H*.5],a=[W*.35,H*.35],b=[W*.65,H*.65];
      record.rows.push(await action(page,'orbit',()=>page.evaluate(()=>new Promise(done=>{const r=window.dgm3d.renderer,v=r.getView(),t=performance.now();r.setMode('orbit');function frame(now){r.setView({yaw:v.yaw+(now-t)/2000});if(now-t<3000)requestAnimationFrame(frame);else done();}requestAnimationFrame(frame);}))));
      await page.getByRole('button',{name:'Top-down',exact:true}).click();
      if(smoke){record.memory=await memory(page);save();continue;}
      record.rows.push(await action(page,'brush-large',async()=>{await page.getByRole('button',{name:'Raise brush (1)',exact:true}).click();const row=page.getByRole('group',{name:'Raise options',exact:true});await row.getByRole('slider',{name:'Size',exact:true}).evaluate(e=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}));});await drag(page,a,b);}));await settle(page);
      record.rows.push(await action(page,'undo-brush',async()=>{const b=page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true});if(await b.isEnabled())await b.click();}));await settle(page);
      record.rows.push(await action(page,'redo-brush',async()=>{const b=page.getByRole('button',{name:'Redo (Ctrl+Y)',exact:true});if(await b.isEnabled())await b.click();}));await settle(page);await undo(page);
      for(const [name,key,mode] of [['Carve','7'],['Craterize','8'],['Quake','9','Slide'],['Quake','9','Lift'],['Erupt','0'],['Glaciate','-']]){
        const r=await action(page,`force-${name.toLowerCase()}${mode?'-'+mode.toLowerCase():''}`,async()=>{
          const button=page.getByRole('button',{name:`${name} (${key})`,exact:true});if(await button.getAttribute('aria-pressed')!=='true')await button.click();const row=page.getByRole('group',{name:name+' options',exact:true});
          await row.getByRole('slider',{name:'Power',exact:true}).evaluate(e=>{e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}));});
          if(mode)await row.getByRole('button',{name:mode,exact:true}).click();
          const count=await page.evaluate(()=>window.dgmEditor.info().edits);
          await clickTile(page,mid);
          await page.waitForFunction(count=>window.dgmEditor.force()||window.dgmEditor.info().edits>count,count,{timeout:20000});
          await idle(page);
        });record.rows.push(r);await settle(page);await undo(page);save();
      }
      for(const name of ['raise','lower','flatten','cut','fill','depth','delete']){
        record.rows.push(await action(page,'select-'+name,async()=>{
          const select=page.getByRole('button',{name:'Select (M)',exact:true});if(await select.getAttribute('aria-pressed')!=='true')await select.click();await page.getByRole('button',{name:'Whole map',exact:true}).click();const row=page.locator('.options-row');
          if(name==='raise'||name==='lower')await row.getByRole('button',{name:name==='raise'?'Up 1':'Down 1',exact:true}).click();
          else if(name==='delete'){await row.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('menuitem',{name:/top level|ground/i}).first().click();}
          else if(name==='depth'){await row.getByRole('spinbutton',{name:'Max water depth',exact:true}).fill('1');await row.getByRole('button',{name:'Max water depth',exact:true}).click();}
          else {await row.getByRole('spinbutton',{name:'Level',exact:true}).fill(name==='fill'?'10':'2');await row.getByRole('button',{name:({flatten:'Flatten',cut:'Cut down',fill:'Fill up'})[name],exact:true}).click();}
        }));await settle(page);await undo(page);save();
      }
      const waterStart=performance.now();record.rows.push(await action(page,'live-water-after-edit',async()=>{await page.getByRole('button',{name:'Raise brush (1)',exact:true}).click();await clickTile(page,[W*.5,H*.15]);await settle(page);}));record.rows.at(-1).waterMs=performance.now()-waterStart;
      if(process.env.SCALING_TIMING_ONLY==='1'){record.memory=await memory(page);save();continue;}
      const checkpoints=[];for(let n=0;n<=128;n++){
        if([0,8,32,64,128].includes(n))checkpoints.push({step:n,at:Date.now(),memory:await memory(page)});
        if(n===128)break;await page.evaluate(async([x,y])=>{await window.dgmEditor.edit({op:'sculpt',params:{mode:'raise',cells:[[y,x,x+1]],amount:1,exact:true}},'Scaling session');},[Math.round(Math.min(W,256)*.55)+(n%8),Math.round(Math.min(H,256)*.4)+Math.floor(n/8)]);await idle(page);
      }record.session=checkpoints;record.memory=await memory(page);
    }catch(e){record.error=String(e);console.log(size,repeat,'ERROR',String(e));try{writeFileSync(resolve(output,`${size}-${repeat}-error.html`),await page.content());}catch{}}finally{save();await page.close().catch(()=>{});}
  }
}finally{cdpRoot?.close();await browser?.close();writeFileSync(stop,'done');await new Promise(r=>{if(load.exitCode!==null)r();else load.once('exit',r);});server.close();save();}
console.log('Saved',output);
