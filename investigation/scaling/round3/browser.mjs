import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {dir as r2dir,root,plugin} from '../round2/overlay.mjs';
import {FileResults} from '../round2/node-store.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),out=resolve(dir,'../local/round3',process.env.SCALING_R3_BROWSER_OUT??'browser');mkdirSync(out,{recursive:true});
const alias=Object.fromEntries(Object.entries({history:'doc/gestureHistory',session:'doc/session',document:'doc/document',stream:'doc/projectStream',cache:'doc/resultStore',defaults:'forces/nature',crater:'forces/craterize',erupt:'forces/erupt',quake:'forces/quake',glaciate:'forces/glaciate/model',carve:'forces/carve/run'}).map(([k,v])=>['product-'+k,resolve(root,'src/core',v+'.ts')]));
await build({entryPoints:[resolve(dir,'browser-worker.ts')],outfile:resolve(out,'worker.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',alias,plugins:[await plugin()]});
const names=process.argv.slice(2).length?process.argv.slice(2):['256-32','512-32'],caches=new Map(),sessions=new Set(),results=[];
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Scaling checkpoint verification</title>');}
 else if(path==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(out,'worker.js')));}
 else if(path.startsWith('/project/')||path.startsWith('/oracle/')){const name=path.split('/').at(-1);if(!names.includes(name))throw Error('unknown case');res.end(readFileSync(resolve(dir,'../local/round3/runs',name+(path.startsWith('/project/')?'.dgm':'.json'))));}
 else if(path.startsWith('/cold/')){const [,_,session,id,keyString]=path.split('/'),key=Number(keyString);if(!sessions.has(session)||!/^[0-9a-f-]{36}$/.test(id)||!Number.isSafeInteger(key))throw Error('invalid cache request');const cacheID=session+'/'+id;let c=caches.get(cacheID);if(!c){c=new FileResults(resolve(out,session+'-'+id+'.cache'));caches.set(cacheID,c);}
  if(req.method==='PUT'){const parts=[];let size=0;for await(const p of req){size+=p.length;if(size>128*1024**2)throw Error('cache payload bound');parts.push(p);}c.put(key,Buffer.concat(parts));res.end('ok');}
  else if(req.method==='GET')res.end(c.get(key));else throw Error('unsupported method');
 }else throw Error('unknown route');
}catch(error){res.writeHead(400);res.end(String(error));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const [engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([engine])=>(process.env.SCALING_R3_ENGINES??'chromium,firefox,webkit').split(',').includes(engine))){const browser=await launcher.launch({headless:true});
 try{for(const name of names)for(let repeat=1;repeat<=Number(process.env.SCALING_R3_REPEATS??3);repeat++){
  const id=randomUUID();sessions.add(id);const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);page.on('console',msg=>console.log(engine,name,repeat,msg.text()));
  const value=await page.evaluate(async args=>{let last=performance.now(),maxGap=0;const gaps=[],tasks=[];let observer;
   if(args.timerTrace&&PerformanceObserver.supportedEntryTypes.includes('longtask')){observer=new PerformanceObserver(list=>{for(const e of list.getEntries())tasks.push({at:performance.timeOrigin+e.startTime,ms:e.duration,name:e.name});tasks.sort((a,b)=>b.ms-a.ms);tasks.length=Math.min(tasks.length,20);});observer.observe({entryTypes:['longtask']});}
   const interval=setInterval(()=>{const n=performance.now(),ms=n-last;maxGap=Math.max(maxGap,ms);if(args.timerTrace&&ms>100){gaps.push({at:Date.now()-ms,ms,visibility:document.visibilityState});gaps.sort((a,b)=>b.ms-a.ms);gaps.length=Math.min(gaps.length,20);}last=n;},16);
   try{return await new Promise((resolve,reject)=>{const w=new Worker('/worker.js',{type:'module'});w.onmessage=e=>{if(e.data.progress)console.log(JSON.stringify(e.data.progress));else if(e.data.result){w.terminate();resolve({...e.data.result,pageTimerMaxGap:maxGap,...(args.timerTrace?{pageTimerGaps:gaps,pageLongTasks:tasks,longTaskObserver:!!observer}:{})});}else if(e.data.error){w.terminate();reject(Error(JSON.stringify(e.data)));}};w.onerror=e=>reject(Error(e.message));w.postMessage(args);});}finally{clearInterval(interval);observer?.disconnect();}}, {name,id,prove:repeat===1&&process.env.SCALING_R3_PROVE!=='0',contracts:repeat===1&&process.env.SCALING_R3_CONTRACTS==='1',timerTrace:process.env.SCALING_R3_TIMER_TRACE==='1',saveRoundTrip:process.env.SCALING_R3_SAVE_ROUNDTRIP==='1'});
  results.push({engine,version:browser.version(),name,repeat,...value});writeFileSync(resolve(out,`${engine}-${name}.json`),JSON.stringify(results.filter(x=>x.engine===engine&&x.name===name),null,2));console.log('DONE',engine,name,repeat,{positions:value.allDepths?.positions,proofMs:value.allDepths?.ms,rows:value.rows.length,storage:value.storage});
  await page.close();sessions.delete(id);for(const [key,c]of caches)if(key.startsWith(id+'/')){c.close();caches.delete(key);}
 }}finally{await browser.close();}}
}finally{for(const c of caches.values())c.close();await new Promise(r=>server.close(r));}
