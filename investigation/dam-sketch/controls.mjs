import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {HERE,LOCAL,deps,hash,json,stats,loadSampler} from './round2-common.mjs';
const runtime=JSON.parse(readFileSync(resolve(HERE,'browser-timings.json'))).firefox;
const playwright=createRequire(resolve(process.env.DGM_BROWSER_DEPS??process.env.DGM_DEPS??LOCAL,'package.json'))(process.env.DGM_PLAYWRIGHT??'playwright');
await deps('esbuild').build({entryPoints:[resolve(HERE,'control-client.ts')],outfile:resolve(LOCAL,'control.js'),bundle:true,platform:'browser',format:'iife',target:'es2022'});
const server=createServer((req,res)=>{if(req.url==='/control.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(LOCAL,'control.js')));}else{res.setHeader('Content-Type','text/html');res.end(readFileSync(resolve(HERE,'browser.html')).toString().replace('browser-client.js','control.js'));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const sampler=loadSampler(),rows=[];
try{
 await sampler.ready();
 for(const engine of ['chromium','firefox','webkit']){
  const options=engine==='firefox'?{executablePath:process.env.DGM_FIREFOX_EXECUTABLE,firefoxUserPrefs:runtime.firefoxUserPrefs}:{};
  if(engine==='firefox'&&hash(readFileSync(options.executablePath))!==runtime.executableSha256)throw Error('Firefox binary changed');
  if(engine==='firefox'&&hash(readFileSync(resolve(options.executablePath,'../omni.ja')))!==runtime.archiveSha256)throw Error('Firefox debugger archive changed');
  const browser=await playwright[engine].launch({headless:true,...options});
  try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
   for(const c of JSON.parse(readFileSync(resolve(HERE,'benchmarks.json'))).cases.filter(c=>c.map.startsWith('riverValley'))){
    const start=Date.now(),raw=await page.evaluate(c=>window.runControl(c),c),row={engine,size:c.size,case:c.case,load:sampler.summary(start),frameWorkMs:stats(raw.frames.map(f=>f.workMs)),rafIntervalMs:stats(raw.frames.slice(1).map(f=>f.intervalMs)),rafIntervalsOver16_7:raw.frames.filter(f=>f.intervalMs>16.7).length};
    rows.push(row);json('browser-controls.json',{method:'Two-second reference drag with twelve tile changes at least 100 ms apart, same authored raster/status layer, no sketch worker, no water uploads; one pass per engine/size/wall. Separately scheduled shared-host reference, not causal attribution for individual missed frames.',rows});console.log(engine,c.size,c.case,'control max interval',row.rafIntervalMs.max);
   }
  }finally{await browser.close();}
 }
}finally{sampler.stop();server.close();}
