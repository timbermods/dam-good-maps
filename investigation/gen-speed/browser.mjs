import {createServer} from 'node:http';
import {readFileSync,existsSync,appendFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {strict as assert} from 'node:assert';
import {require,dir} from './build.mjs';
const {chromium}=require('playwright');
const chrome=process.env.DGM_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe';
const arg=(n,d)=>process.argv.includes('--'+n)?process.argv[process.argv.indexOf('--'+n)+1]:d;
const themes=arg('themes','any,riverValley,canyon,highlands,lakeBasin,delta,islands').split(','),reps=Number(arg('reps','3'));
const out=resolve(dir,'local/browser.jsonl');
const rows=existsSync(out)?readFileSync(out,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const servers=[],urls={};
for(const v of ['before','after']){
  const base=resolve(dir,`local/web-${v}`);
  const server=createServer((req,res)=>{const file=resolve(base,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html')));if(!file.startsWith(base+sep)||!existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]??'application/octet-stream');res.end(readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);urls[v]=`http://127.0.0.1:${server.address().port}`;
}
const load=[];let pending='';
const sampler=spawn(process.env.DGM_PWSH??'pwsh',['-NoProfile','-File',resolve(dir,'load.ps1')],{windowsHide:true,stdio:['ignore','pipe','pipe']});sampler.stdout.on('data',b=>{pending+=b;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const l of lines)if(l&&Number.isFinite(Number(l)))load.push(Number(l));});
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 for(let rep=0;rep<reps;rep++)for(const theme of themes)for(const variant of rep%2?['after','before']:['before','after']){
  if(rows.some(r=>r.theme===theme&&r.rep===rep&&r.variant===variant))continue;
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  let phase='warmup',loadStart=load.length;const startedUTC=new Date().toISOString();
  try{
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{
    window.__gsEvents=[];window.__gsId=0;
    const hex=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');
    window.__gsMark=(name,data)=>{
      if(name==='generate'){window.__gsEvents=[];window.__gsId++;window.__gsStart=performance.now();window.__gsProof={};}
      const id=window.__gsId;
      window.__gsEvents.push({name,at:performance.now()-window.__gsStart});
      if(name==='response')window.__gsProof.response=data;
      if(name==='landPaint'&&!window.__gsProof.land){window.__gsProof.land={};const p=window.__gsProof.land;Promise.all([hex(data.heights.slice()),hex(data.water.slice())]).then(([heights,water])=>Object.assign(p,{heights,water}));}
      if(name.endsWith('Paint'))requestAnimationFrame(()=>requestAnimationFrame(()=>{if(window.__gsId===id)window.__gsEvents.push({name:name+'Frame',at:performance.now()-window.__gsStart});}));
    };
  });
  // Warm the actual worker/UI on a small map; startup is a separate investigation.
  await page.goto(urls[variant]+`/#s=1&t=${theme}&z=96&d=n`);
  await page.waitForFunction(()=>window.dgm?.current?.()?.passed,null,{timeout:300000});
  loadStart=load.length;
  phase='generate';
  await page.evaluate(fragment=>window.__gsGenerate(fragment),`s=1&t=${theme}&z=256&d=n`);
  await page.waitForFunction(()=>window.__gsEvents.some(e=>e.name==='settledPaintFrame'),null,{timeout:300000});
  const generated=await page.evaluate(()=>({events:window.__gsEvents.slice(),proof:window.__gsProof}));
  assert(generated.proof.response.passed,theme+' browser generation refused');
  // M9b's first-land canvas has no edit handlers; actual editing starts after Refine.
  const refine=page.getByRole('button',{name:'Refine this map',exact:true});
  phase='refine-click';
  await refine.click();
  phase='editor-ready';
  await page.waitForFunction(()=>!!window.dgmEditor&&!!window.dgm3d&&window.dgm3d.renderer.mapState()?.W===256,null,{timeout:300000});
  const editable=await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));window.dgm3d.renderer.gl.getContext().finish();return performance.now()-window.__gsStart;});
  const before=await page.evaluate(()=>Array.from(window.dgm3d.renderer.mapState().heights));
  phase='edit-undo';
  await page.getByRole('button',{name:'Top-down',exact:true}).click();
  await page.keyboard.press('1');
  const p=await page.evaluate(()=>{
    const renderer=window.dgm3d.renderer,h=renderer.mapState().heights;
    for(let r=0;r<100;r+=4)for(let dy=-r;dy<=r;dy+=4)for(let dx=-r;dx<=r;dx+=4){
      const x=128+dx,y=128+dy;if(h[y*256+x]>=16)continue;
      const p=window.dgmEditor.tileToClient(x,y);
      if(document.elementFromPoint(p.x,p.y)===renderer.canvas)return p;
    }
    throw Error('no visible tile below Raise cap');
  });
  await page.mouse.click(p.x,p.y);
  await page.waitForFunction(()=>window.dgmEditor.info().edits>0,null,{timeout:60000});
  await page.evaluate(()=>window.dgmEditor.idle());
  await page.keyboard.press('Control+z');
  await page.evaluate(()=>window.dgmEditor.idle());
  await page.waitForFunction(h=>{const a=window.dgm3d.renderer.mapState().heights;return h.every((v,i)=>a[i]===v);},before,{timeout:60000});
  assert.deepEqual(errors,[],'page errors');
  const ss=load.slice(loadStart),row={theme,variant,rep,browser:browser.version(),events:generated.events,proof:generated.proof,editable,editUndo:true,load:{mean:ss.length?ss.reduce((a,b)=>a+b,0)/ss.length:null,max:ss.length?Math.max(...ss):null,samples:ss.length}};
  const other=rows.find(r=>r.theme===theme&&r.rep===rep&&r.variant!==variant);if(other)assert.deepEqual(row.proof,other.proof,theme+' browser bytes');
  rows.push(row);appendFileSync(out,JSON.stringify(row)+'\n');console.log(theme,variant,rep,generated.events,'editable',editable,'load',row.load);
  }catch(error){const ss=load.slice(loadStart);appendFileSync(resolve(dir,'local/browser-failures.jsonl'),JSON.stringify({theme,variant,rep,phase,startedUTC,error:String(error),pageErrors:errors,load:{mean:ss.length?ss.reduce((a,b)=>a+b,0)/ss.length:null,max:ss.length?Math.max(...ss):null,samples:ss.length}})+'\n');throw error;}
  finally{await context.close();}
 }
}finally{await browser.close();sampler.kill();for(const s of servers)await new Promise(r=>s.close(r));}
