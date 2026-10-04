import {createServer} from 'node:http';import {readFileSync,writeFileSync,existsSync,appendFileSync} from 'node:fs';import {resolve} from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {build,dir,root} from '../build.mjs';
// Reuse the determinism investigation's engine-matched Playwright install read-only.
const pwRoot=process.env.DGM_BROWSER_DEPS??resolve(root,'../../../determinism/local/checkout/investigation/determinism/local/runtime');
const {chromium,firefox,webkit}=createRequire(resolve(pwRoot,'package.json'))('playwright');
const bundle=await build('round2',false,'browser');
const sha=x=>createHash('sha256').update(x).digest('hex');
const prefix=process.argv.includes('--smoke')?'round2-smoke-'+sha(readFileSync(bundle)).slice(0,10):'round2-browsers',out=resolve(dir,`local/${prefix}.jsonl`);
const previous=existsSync(out)?readFileSync(out,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const engines={},servers=[],browsers=[];
const server=createServer((req,res)=>{if(req.url==='/core.mjs'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(bundle));}else{res.setHeader('Content-Type','text/html');res.end(`<script type="module">import * as core from '/core.mjs';window.core=core;</script>`);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);const url=`http://127.0.0.1:${server.address().port}`;
try{
 for(const [name,type]of Object.entries({chromium,firefox,webkit})){
  const browser=await type.launch({headless:true});browsers.push(browser);const page=await browser.newPage();await page.goto(url);await page.waitForFunction(()=>!!window.core);engines[name]={page,version:browser.version()};console.log('Engine ready',name,browser.version());
 }
 const metadata={bundleSha256:sha(readFileSync(bundle)),engines:Object.fromEntries(Object.entries(engines).map(([n,e])=>[n,e.version])),node:process.version};
 const mf=resolve(dir,`local/${prefix}-manifest.json`);if(existsSync(mf)){if(JSON.stringify(JSON.parse(readFileSync(mf)))!==JSON.stringify(metadata))throw Error('stale browser resume');}else writeFileSync(mf,JSON.stringify(metadata,null,2));
 if(!process.argv.includes('--smoke')&&process.argv.includes('--reuse-smoke')){
  const smoke='round2-smoke-'+metadata.bundleSha256.slice(0,10),sm=resolve(dir,`local/${smoke}-manifest.json`),sr=resolve(dir,`local/${smoke}.jsonl`);
  if(existsSync(sm)&&existsSync(sr)){
   if(JSON.stringify(JSON.parse(readFileSync(sm)))!==JSON.stringify(metadata))throw Error('smoke has different bundle or engines');
   for(const row of readFileSync(sr,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse))if(!previous.some(r=>r.key===row.key&&r.engine===row.engine)){appendFileSync(out,JSON.stringify(row)+'\n');previous.push(row);}
  }
 }
 const sizes=[96,128,256],themes=['any','riverValley','canyon','highlands','lakeBasin','delta','islands'],seeds=process.argv.includes('--smoke')?[1,4,31]:Array.from({length:40},(_,i)=>i+1);
 let done=0;
 for(const size of sizes)for(const seed of seeds)for(const theme of themes){
  const key=`${theme}/${size}/${seed}`;const rows=await Promise.all(Object.entries(engines).map(async([engine,e])=>{
   const cached=previous.find(r=>r.key===key&&r.engine===engine);if(cached)return cached;
   const row=await e.page.evaluate(async({theme,size,seed})=>{
    const sha=async v=>{const chunks=[],encode=new TextEncoder();let length=0;const push=x=>{const a=typeof x==='string'?encode.encode(x):x;chunks.push(a);length+=a.byteLength;};
     const seen=new Set();function visit(x){if(x===null||typeof x!=='object'){push(typeof x+':'+String(x)+';');return;}if(seen.has(x))throw Error('cycle');seen.add(x);
      if(ArrayBuffer.isView(x)){push(x.constructor.name+':'+x.byteLength+':');push(new Uint8Array(x.buffer,x.byteOffset,x.byteLength));}
      else if(x instanceof Map){push('Map:'+x.size+':');for(const [k,v]of x){visit(k);visit(v);}}
      else if(x instanceof Set){push('Set:'+x.size+':');for(const v of x)visit(v);}
      else if(Array.isArray(x)){push('Array:'+x.length+':');for(const v of x)visit(v);}
      else {push('Object:');for(const k of Object.keys(x).sort()){if(typeof x[k]==='function')continue;push(k+':');visit(x[k]);}}
      seen.delete(x);push('|');}
     visit(v);const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');};
    const lands=[],started=performance.now(),r=window.core.generate(window.core.decodeSpecFragment(`s=${seed}&t=${theme}&z=${size}&d=n`).spec,{onLand:l=>lands.push(structuredClone(l))}),wall=performance.now()-started;
    const {timings,failures,...rest}=r;let changed=0;if(lands.length)for(let i=0;i<size*size;i++)if(lands[0].heights[i]!==r.built.heights[i])changed++;
    const components={};for(const [key,value]of Object.entries({timber:r.bytes,land:lands,terrain:r.built.heights,water:[r.built.water,r.built.contamination,r.built.settle,r.built.moisture,r.built.soilContamination],objects:r.built.entities,features:r.features,field:r.field,decisions:[r.spec,r.info,r.outcomes,r.report]}))components[key]=await sha(value);
    const analysis=await sha(r.analysis);
    return {wall,timings,passed:r.report.passed,changed,shown:lands.length,met:r.outcomes?.met??false,hash:await sha({...rest,failures:failures.map(({ms,...f})=>f),lands}),components,analysis};
   },{theme,size,seed});
   const result={key,engine,theme,size,seed,...row};appendFileSync(out,JSON.stringify(result)+'\n');return result;
  }));
  if(rows.some(r=>JSON.stringify(r.components)!==JSON.stringify(rows[0].components)))throw Error('cross-engine map mismatch '+key+JSON.stringify(rows.map(r=>[r.engine,r.hash,r.components])));
  if(rows.some(r=>r.hash!==rows[0].hash))throw Error('cross-engine complete-state mismatch '+key);
  if(rows.some(r=>!r.passed||r.changed||r.shown!==1))throw Error('cross-engine quality/first-land failure '+key);
  if(++done%7===0)console.log(done,'cases match',key);
 }
 console.log('Cross-engine cases match',done);
}finally{await Promise.all(browsers.map(b=>b.close()));await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));}
