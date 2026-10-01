// Every pinned gallery export, plus the determinism test's ten seeds and live seed 4242.
import {Worker,isMainThread,workerData,parentPort} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {api,deps,HERE,ROOT,LOCAL,hash,json,arg,require} from './common.mjs';
const buildId=hash(readFileSync(resolve(LOCAL,'baseline.cjs'))+readFileSync(resolve(LOCAL,'fast.cjs')));
const index=JSON.parse(readFileSync(resolve(ROOT,'public/real-places/index.json'),'utf8'));
const cases=index.places.map(entry=>({id:'pinned-'+entry.id,kind:'official',rules:'port',entry}));
for(let i=0;i<10;i++)cases.push({id:'pinned-determinism-'+i,kind:'generated',theme:'any',seed:1000+37*i,size:[96,128,256][i%3]});
cases.push({id:'pinned-live-4242',kind:'generated',theme:'riverValley',seed:4242,size:128});
if(!isMainThread) {
  const place=require(resolve(LOCAL,'place-baseline.cjs'));
  const {checkCase}=await import('./check-case.mjs');
  parentPort.on('message',c=>{try {
    if(c.entry) {
      const p=place.decodePlaceFile(readFileSync(resolve(ROOT,'public/real-places',c.entry.data)));
      const raw=place.placeTimber(p).bytes;
      assert.equal(hash(raw),c.entry.sha256,c.id+' baseline pin');
      const dir=resolve(LOCAL,'pinned-maps');mkdirSync(dir,{recursive:true});
      c.path=resolve(dir,c.id+'.timber');writeFileSync(c.path,raw);
    }
    parentPort.postMessage({row:checkCase(c,buildId)});
  }catch(e){parentPort.postMessage({error:e.stack,id:c.id});}});
} else {
  await deps('esbuild').build({stdin:{contents:'export * from "../../src/core/places/place";',resolveDir:HERE,loader:'ts'},outfile:resolve(LOCAL,'place-baseline.cjs'),bundle:true,platform:'node',format:'cjs',target:'es2022',nodePaths:[resolve(dirname(deps.resolve('typescript/package.json')),'..')]});
  const rows=[],pending=[];
  for(const c of cases){const p=resolve(LOCAL,'proof-pinned',c.id+'.json');if(existsSync(p)){const old=JSON.parse(readFileSync(p,'utf8'));if(old.buildId===buildId&&old.status==='pass'){rows.push(old);continue;}}pending.push(c);}
  console.log('Pinned proof',rows.length+'/'+cases.length,'cached');
  await Promise.all(Array.from({length:Math.min(Number(arg('workers','2')),pending.length)},()=>new Promise((done,fail)=>{
    const w=new Worker(new URL(import.meta.url));
    const next=()=>pending.length?w.postMessage(pending.shift()):w.terminate().then(done);
    w.on('error',fail);w.on('message',m=>{if(m.error){w.terminate();fail(Error(m.id+' '+m.error));return;}
      rows.push(m.row);json(resolve(LOCAL,'proof-pinned',m.row.id+'.json'),m.row);console.log('PIN PASS',rows.length+'/'+cases.length,m.row.id);next();});next();
  })));
  json(resolve(LOCAL,'proof-pinned.json'),{buildId,cases:rows,status:'pass'});
}
