// Functional release-only regression check. This is not a pacing measurement.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {setup,idle} from './scenarios.mjs';
const dir=import.meta.dirname,build=resolve(dir,'local/round3/build/standard/before'),out=resolve(dir,'local/round3/status');mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg'};
const server=createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;const special=['probe.js','audio-worklet.js'].find(n=>p==='/investigation/performance/'+n);const f=special?resolve(dir,special):resolve(build,'.'+(p==='/'?'/index.html':p));if(!special&&!f.startsWith(build+'\\')&&!f.startsWith(build+'/')){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',mime[extname(f)]??'application/octet-stream');res.end(readFileSync(f));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});const spots=await setup(page,`http://127.0.0.1:${server.address().port}`,256,'standard');
 const slow=page.getByRole('button',{name:'Slow forces',exact:true});if(await slow.getAttribute('aria-pressed')==='true')await slow.click();
 await page.keyboard.press('8');await page.getByRole('group',{name:'Craterize options',exact:true}).getByRole('slider',{name:'Power',exact:true}).evaluate(e=>{e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}));});
 const point=await page.evaluate(([x,y])=>window.dgmEditor.tileToClient(x,y),spots.mid);await page.mouse.move(point.x+3,point.y);await page.mouse.click(point.x,point.y);await idle(page);
 await page.keyboard.press('Control+z');await idle(page,{afterHistory:true});
 const observed=await page.evaluate(()=>({water:document.querySelector('.water-bar')?.textContent,checks:[...document.querySelectorAll('.checks-dot')].map(e=>e.title),pending:window.dgmEditor.pendingTerrain(),waterQueue:window.dgm3d.renderer.waterQueue?.size}));
 const record={at:new Date().toISOString(),provenance:JSON.parse(readFileSync(resolve(build,'provenance.json'))),steps:'Highlands seed4242,256² → Refine → Top-down → Craterize Power100 Fast → wait worker and checks → Ctrl+Z → wait worker and checks',workerSettled:true,observed,zeroPercent:observed.water?.includes('0%')??null};
 writeFileSync(resolve(out,'result.json'),JSON.stringify(record,null,2));await page.screenshot({path:resolve(out,'undo.png')});console.log(JSON.stringify({zeroPercent:record.zeroPercent,observed}));
}finally{await browser?.close();server.close();}
