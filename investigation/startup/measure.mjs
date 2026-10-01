import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { cpus, totalmem } from 'node:os';
import { summary, traceCost } from './metrics.mjs';

const here = dirname(fileURLToPath(import.meta.url)), local = join(here,'local');
const arg = (key, fallback) => { const i = process.argv.indexOf(`--${key}`); return i < 0 ? fallback : process.argv[i+1]; };
const repeats = Number(arg('runs','5')), variants = arg('variants','before,after').split(','), rates = arg('cpus','1,4').split(',').map(Number);
const speeds = arg('connections','fast,typical').split(',');
const out = resolve(arg('out',join(local,'results.json')));
const traces=join(local,`${out.split(/[\\/]/).at(-1).replace(/\.json$/,'')}-traces`);mkdirSync(traces,{recursive:true});
const profiles = { fast: { mbps:100, latency:10 }, typical: { mbps:25, latency:80 } };
let profile, dist, nextByte = 0, requests = [];
const types = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json', '.gz':'application/gzip', '.jpg':'image/jpeg', '.png':'image/png' };
const server = createServer((req,res) => {
  const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dam-good-maps\//,'');
  const file = resolve(dist,path || 'index.html');
  if (!file.startsWith(dist + '/') && !file.startsWith(dist + '\\')) { res.writeHead(403).end(); return; }
  let raw; try { raw=readFileSync(file); } catch { res.writeHead(404).end(); return; }
  const gzip = /\b(?:gzip)\b/.test(req.headers['accept-encoding']??'') && /\.(js|css|html|json)$/.test(file);
  const bytes=gzip?gzipSync(raw):raw;
  const row = { file:relative(dist,file).replaceAll('\\','/'), raw:raw.length, body:bytes.length, requested:Date.now(), encoding:gzip?'gzip':'identity' }; requests.push(row);
  res.writeHead(200, { 'Content-Type':types[extname(file)]??'application/octet-stream', 'Content-Length':bytes.length, 'Cache-Control':'public,max-age=600', ...(gzip ? { 'Content-Encoding':'gzip','Vary':'Accept-Encoding' } : {}) });
  let offset=0;
  // Shared link: all requests, including worker scripts, share one byte clock.
  const send = () => {
    if (res.destroyed) return;
    const end = Math.min(offset+16384,bytes.length), chunk = bytes.subarray(offset,end); offset=end;
    const now=performance.now(); nextByte=Math.max(now,nextByte)+chunk.length*8/(profile.mbps*1000);
    setTimeout(() => { if(res.destroyed)return; res.write(chunk); if(offset===bytes.length){row.finished=Date.now();res.end();}else send(); },Math.max(0,nextByte-now));
  };
  setTimeout(send,profile.latency);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}/dam-good-maps/`;
let browser;
const results=process.argv.includes('--resume') && existsSync(out) ? JSON.parse(readFileSync(out)).results : [];
const fixtureIndex=JSON.parse(readFileSync(join(local,'before/public/first-visit/index.json')));
const mapPicks=arg('maps','one')==='all' ? fixtureIndex.maps.map((map,i)=>({mapId:map.id,pick:(i+.01)/fixtureIndex.maps.length})) : [{mapId:'river-valley-1',pick:Number(arg('pick','0.001'))}];
try {
  for(const {mapId,pick} of mapPicks) for(const connection of speeds) for(const cpu of rates) for(let run=0;run<repeats;run++) for(const variant of (run%2? [...variants].reverse():variants)) {
    if(results.some(r=>r.mapId===mapId&&r.variant===variant&&r.connection===connection&&r.cpu===cpu&&r.run===run&&r.visit==='warm'&&r.correctness))continue;
    // A partial pair must restart cold; never relabel a reused cache as a new cold visit.
    for(let i=results.length-1;i>=0;i--)if(results[i].mapId===mapId&&results[i].variant===variant&&results[i].connection===connection&&results[i].cpu===cpu&&results[i].run===run)results.splice(i,1);
    dist=resolve(arg('dist',join(local,`dist-${variant}`))); profile=profiles[connection]; nextByte=0;
    browser=await chromium.launch({ channel:'chrome', headless:true });
    const context=await browser.newContext({ viewport:{width:1280,height:720},deviceScaleFactor:1 });
    for(const visit of ['cold','warm']) {
      const page=await context.newPage(), cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
      await cdp.send('Network.enable');
      const resources=new Map();
      cdp.on('Network.responseReceived',e=>resources.set(e.requestId,{url:e.response.url,status:e.response.status,diskCache:!!e.response.fromDiskCache,serviceWorker:!!e.response.fromServiceWorker}));
      cdp.on('Network.loadingFinished',e=>{const r=resources.get(e.requestId);if(r)r.encoded=e.encodedDataLength;});
      await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.compile',transferMode:'ReturnAsStream'});
      requests=[];
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      // Fixed random selection per repeat, rotating through all of the release-checked maps.
      const index=JSON.parse(readFileSync(join(local,'before/public/first-visit/index.json')));
      await page.goto(origin+(variant==='dev'?'':`?pick=${pick}`),{waitUntil:'domcontentloaded',timeout:120000});
      if(variant!=='dev') {
        await page.locator('.pg-panel-toggle').click();
        await page.locator('.pg-panel-toggle').click();
      }
      if(variant==='dev') {
        await page.getByRole('button',{name:'Refine this map',exact:true}).waitFor({timeout:180000});
        await page.getByRole('button',{name:'Refine this map',exact:true}).click();
      }
      await page.waitForFunction(()=>window.dgm3d?.build,null,{timeout:120000});
      const data=await page.evaluate(()=>{
        const marks=Object.fromEntries(performance.getEntriesByType('mark').map(m=>[m.name,m.startTime]));
        return {marks,paint:Object.fromEntries(performance.getEntriesByType('paint').map(p=>[p.name,p.startTime])),build:window.dgm3d.build,gpu:window.dgm3d.renderer.gpu(),selectedMapId:window.startup?.map.id??performance.getEntriesByType('mark').find(m=>m.name.startsWith('startup-map:'))?.name.slice(12),userAgent:navigator.userAgent};
      });
      // Integrated warm visits may restore the same autosave rather than fetching the library.
      if(variant==='site'&&!data.selectedMapId){
        const spec=await page.evaluate(()=>window.dgmEditor?.info().spec??null);
        data.selectedMapId=fixtureIndex.maps.find(m=>m.theme===spec?.theme&&m.seed===spec?.seed&&spec?.size.x===128&&spec?.size.y===128)?.id;
      }
      // Real input round trip: a keyboard event reaches the editor and the next painted frame.
      await page.keyboard.press('1');
      await page.waitForFunction(()=>window.dgm3d.renderer.tool,null,{timeout:10000});
      const editable=await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>{performance.mark('editable');r(performance.now());})));
      data.marks=await page.evaluate(()=>Object.fromEntries(performance.getEntriesByType('mark').map(m=>[m.name,m.startTime])));
      if(variant!=='dev' && data.selectedMapId!==mapId)throw Error(`Wrong selected map: ${data.selectedMapId} != ${mapId}`);
      // Trace ends at readiness; correctness checks cannot inflate startup costs.
      const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r)); await cdp.send('Tracing.end');
      const {stream}=await done;let trace='';while(true){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});
      const tracePath=join(traces,`${mapId}-${variant}-${connection}-${cpu}-${run}-${visit}.trace.json`);writeFileSync(tracePath,trace);
      const events=JSON.parse(trace).traceEvents;
      const parse=traceCost(events,/Parse|parse/),compile=traceCost(events,/Compile|compile/),evaluate=traceCost(events,/EvaluateScript|FunctionCall/);
      const transferred=requests.reduce((n,r)=>n+r.body,0);
      const row={mapId,variant,connection,cpu,run,visit,pick,editable,firstFrame:data.marks['map-frame'],fcp:data.paint['first-contentful-paint'],response:data.marks.response??null,workerReady:data.marks['worker-ready']??null,projectOpen:data.marks['project-open-end']-data.marks['project-open-start'],mapDownload:data.marks['map-downloaded']??null,rendererPrepare:data.marks['renderer-prepared']-data.marks['renderer-prepare-start'],render:data.build.ms,mesh:data.build.meshMs,checksStart:data.marks['checks-start']??null,parse,compile,evaluate,transferred,requests:[...requests],resources:[...resources.values()],...data,errors,trace:relative(here,tracePath).replaceAll('\\','/')};
      results.push(row);console.log(`${mapId} ${variant} ${connection} ${cpu}x ${visit} #${run+1}: editable ${Math.round(editable)} ms; ${Math.round(transferred/1024)} KiB`);
      if(visit==='cold' && run===0 && connection===speeds[0] && cpu===rates[0])await page.screenshot({path:join(local,`${variant}.png`)});
      if(variant!=='dev') {
        const check=await page.evaluate(async()=>{
          const api=window.startup?.api??window.dgmEditor.worker;
          const info=window.startup?.opened.info??window.dgmEditor.info();
          const before=await api.terrainNow();
          const i=before.heights.findIndex((h,i)=>!before.terrain.protect[i] && h<before.terrain.top-1);
          if(i<0)throw Error('No editable ground for the semantic check');
          const changed=await api.apply({op:'brush',params:{tool:'raise',size:1,strength:1,dabs:[(i%info.W+.5)*4,(Math.floor(i/info.W)+.5)*4],precise:true}},'user','startup check');
          if(!changed.ok)throw Error(`Edit rejected: ${changed.errors}`);
          const now=await api.terrainNow();
          const undo=await api.undo(); const back=await api.terrainNow();
          return {editAccepted:changed.ok,undoAccepted:undo.ok,landChanged:before.heights.some((h,i)=>h!==now.heights[i]),undoIdentical:before.heights.every((h,i)=>h===back.heights[i]),width:info.W,height:info.H};
        }); row.correctness=check;
      }
      await page.close();
      writeFileSync(out,JSON.stringify({environment:{browser:browser.version(),cpu:cpus()[0].model,ram:totalmem(),node:process.version,profiles,repeats,cpuThrottling:'DevTools 1x/4x page CPU; dedicated workers remain native (cpu-probe.mjs)',server:'gzip, max-age=600, shared bandwidth, fixed per-request latency; no TLS/DNS'},results},null,2));
    }
    await context.close(); await browser.close();
  }
} finally { await browser?.close();await new Promise(r=>server.close(r)); }
const compact=[];
for(const {mapId} of mapPicks)for(const variant of variants)for(const connection of speeds)for(const cpu of rates)for(const visit of ['cold','warm']) {
  const rows=results.filter(r=>r.mapId===mapId&&r.variant===variant&&r.connection===connection&&r.cpu===cpu&&r.visit===visit);
  compact.push({mapId,variant,connection,cpu,visit,runs:rows.length,...Object.fromEntries(['editable','firstFrame','fcp','response','workerReady','projectOpen','parse','compile','evaluate','transferred'].map(k=>[k,rows.every(r=>Number.isFinite(r[k]))?summary(rows.map(r=>r[k])):null]))});
}
writeFileSync(resolve(arg('summary',join(here,'summary.json'))),JSON.stringify(compact,null,2));
console.log('Wrote',out);
