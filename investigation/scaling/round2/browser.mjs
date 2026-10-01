import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir,root,plugin} from './overlay.mjs';
const output=resolve(dir,'../local/round2',process.env.SCALING_R2_BROWSER_OUT??'browser');mkdirSync(output,{recursive:true});
const alias=Object.fromEntries(Object.entries({history:'doc/gestureHistory',session:'doc/session',document:'doc/document',stream:'doc/projectStream',cache:'doc/resultStore',defaults:'forces/nature',crater:'forces/craterize',erupt:'forces/erupt',quake:'forces/quake',glaciate:'forces/glaciate/model',carve:'forces/carve/run'}).map(([k,v])=>['product-'+k,resolve(root,'src/core',v+'.ts')]));
await build({entryPoints:[resolve(dir,'browser-worker.ts')],outfile:resolve(output,'worker.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',alias,plugins:[await plugin()]});
const cases=process.argv.slice(2).length?process.argv.slice(2):['contracts-browser'];
const results=[],server=createServer((req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Scaling worker verification</title><p>Worker replay and streaming OPFS verification</p>');}
 else if(p==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(output,'worker.js')));}
 else {const record=cases.find(n=>p==='/'+n);if(!record)throw Error('unknown fixture');res.end(readFileSync(resolve(dir,'../local/round2',process.env.SCALING_R2_OUT??'runs',record+'.damgoodmaps.json')));}
 }catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const run=async([engine,launcher])=>{const browser=await launcher.launch({headless:true});try{for(const name of cases)for(let repeat=1;repeat<=3;repeat++){
 const expected=JSON.parse(readFileSync(resolve(dir,'../local/round2',process.env.SCALING_R2_OUT??'runs',name+'.json'),'utf8')),page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const at=Date.now(),value=await page.evaluate(async({name,hash})=>{let last=performance.now(),maxGap=0;const interval=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;},16);
 try{return await new Promise((resolve,reject)=>{const w=new Worker('/worker.js',{type:'module'});w.onmessage=e=>{if(e.data.result){w.terminate();resolve({...e.data.result,pageTimerMaxGap:maxGap});}else if(e.data.error){w.terminate();reject(Error(e.data.error));}};w.onerror=e=>reject(Error(e.message));w.postMessage({path:'/'+name,hash,oracleOnly:!navigator.storage?.getDirectory});});}finally{clearInterval(interval);}}, {name,hash:expected.final?.exportHash??expected.rows.find(r=>r.name==='canonical-and-export').hash});
 results.push({engine,version:browser.version(),name,repeat,at,...value});writeFileSync(resolve(output,'results.json'),JSON.stringify(results,null,2));console.log(engine,name,repeat,value);
 if(process.platform==='win32'&&repeat===3&&name===cases.at(-1)){const capture=spawnSync('powershell.exe',['-NoProfile','-File',resolve(dir,'capture-browser.ps1'),'-Owner',String(process.pid),'-Engine',engine,'-Output',resolve(output,engine+'-owned-processes.json')],{windowsHide:true,encoding:'utf8'});if(capture.status!==0)console.warn('Browser process attribution unavailable:',capture.stderr);}
 await page.close();
 }}finally{await browser.close();}};
try{const engines=Object.entries({chromium,firefox,webkit}).filter(([e])=>(process.env.SCALING_R2_ENGINES??'chromium,firefox,webkit').split(',').includes(e));if(process.env.SCALING_R2_BROWSER_PARALLEL==='1')await Promise.all(engines.map(run));else for(const entry of engines)await run(entry);}finally{server.close();}
