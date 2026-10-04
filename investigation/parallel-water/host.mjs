import http from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import os from 'node:os';
import {HERE,LOCAL} from './common.mjs';
export async function staticHost(worker='coordinator.js',persistent=false) {
  const allowed=new Set(['coordinator.js','weather-coordinator.js','batch-coordinator.js','helper.js','fallback-coordinator.js','failure-coordinator.js','fault-helper.js','generation-coordinator.js','runtime-smoke.js','runtime-helper.js','reference-api.js','isolation-sw.js','isolation-register.js']);
  const server=http.createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/dam-good-maps/') {
      res.setHeader('Content-Type','text/html');res.end(`<script type="module">import {registerIsolation} from './isolation-register.js';window.loads=Number(sessionStorage.loads||0)+1;sessionStorage.loads=window.loads;await registerIsolation();window.ready=true;const workers=new Map();window.job=data=>new Promise((resolve,reject)=>{const key=data.threads;let w=workers.get(key);if(!w){w=new Worker('./${worker}',{type:'module'});if(${persistent})workers.set(key,w);}w.onmessage=e=>{if(!${persistent})w.terminate();resolve(e.data)};w.onerror=e=>{w.terminate();reject(Error(e.message))};w.postMessage({...data,persistent:${persistent}})});window.closeWorkers=async()=>{for(const w of workers.values()){await new Promise(resolve=>{w.onmessage=resolve;w.postMessage({close:true})});w.terminate()}workers.clear()};</script>`);return;
    }
    const name=path.split('/').pop();if(!allowed.has(name)){res.statusCode=404;res.end();return;}
    res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-cache');res.end(readFileSync(resolve(name.startsWith('isolation')?HERE:LOCAL,name)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {url:`http://127.0.0.1:${server.address().port}/dam-good-maps/`,close:()=>server.close()};
}
export async function openIsolated(browser,url) {
  const page=await browser.newPage();page.setDefaultTimeout(900000);
  await page.goto(url);await page.waitForFunction(()=>window.ready&&(crossOriginIsolated||Number(sessionStorage.loads)>1));await page.waitForFunction(()=>window.job);
  const hardware=await page.evaluate(()=>navigator.hardwareConcurrency);
  return {page,counts:process.env.DGM_COUNTS?process.env.DGM_COUNTS.split(',').map(Number):[...new Set([1,2,4,8,os.cpus().length,hardware])]};
}
export async function job(page,c,threads,parallelOnly=false) {
  const data={...c,threads,parallelOnly,model:{...c.model,floor:Array.from(c.model.floor),dam:c.model.dam?Array.from(c.model.dam):null},initial:c.initial?{depth:Array.from(c.initial.depth),contamination:Array.from(c.initial.contamination)}:undefined};
  return page.evaluate(async data=>{data.model.floor=Float64Array.from(data.model.floor);if(data.model.dam)data.model.dam=Float64Array.from(data.model.dam);if(data.initial){data.initial.depth=Float64Array.from(data.initial.depth);data.initial.contamination=Float64Array.from(data.initial.contamination);}return window.job(data);},data);
}
