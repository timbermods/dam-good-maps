import assert from 'node:assert/strict';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {LOCAL,deps,json,hash} from './common.mjs';
import {unpack,pack,exact,untimed} from './codec.mjs';
if(!isMainThread){
 globalThis.__raNative=deps(resolve(LOCAL,'analysis.node'));
 const bridge=deps(resolve(LOCAL,'native-bridge.cjs'));bridge.installNativeAnalysis(globalThis.__raNative);
 const m9b=deps(resolve(LOCAL,'m9b-native.cjs'));globalThis.__ra={replace:(n,a)=>bridge.replace(n,a)};
 let result;globalThis.__raGenerated=r=>result=r;
 parentPort.on('message',c=>{try{
  const payload=unpack(JSON.parse(gunzipSync(readFileSync(resolve(LOCAL,'cases',c.id+'.json.gz')))));
  const measure=m9b.measureOne(c.theme,c.seed,c.size,'',false);
  const expected=payload.fileBytes??new Uint8Array();assert.ok(Buffer.from(result.bytes).equals(Buffer.from(expected)),c.id+' complete native export bytes');
  const r=result,state={report:r.report,analysis:r.analysis,outcomes:r.outcomes,features:r.features,intentions:r.intentions,heights:r.built.heights,water:r.built.water,contamination:r.built.contamination,attempts:r.attempts,failures:r.failures.map(f=>f.failed),info:r.info};
  assert.equal(hash(exact({measure:untimed(measure),state})),c.highLevel,c.id+' native deterministic state/measures');
  const built={W:r.built.W,H:r.built.H,heights:r.built.heights,water:r.built.water,soilContamination:r.built.soilContamination,contamination:r.built.contamination,entities:r.built.entities,waterModel:{emitters:r.built.waterModel.emitters},settle:{out:r.built.settle.out,ticks:r.built.settle.ticks}};
  const captured={theme:c.theme,seed:c.seed,size:c.size,result:{built,info:r.info,report:r.report,analysis:r.analysis,outcomes:r.outcomes,attempts:r.attempts,failures:r.failures,timings:r.timings},generation:{shown:measure.shown,changed:measure.changed},measure:untimed(measure)};
  const snapshotPath=resolve(LOCAL,'cases',c.id+'.m9b.json.gz');
  const snapshot=process.argv.includes('--keep-snapshots')?readFileSync(snapshotPath):gzipSync(JSON.stringify(pack(captured)),{level:1});
  if(!process.argv.includes('--keep-snapshots'))writeFileSync(snapshotPath,snapshot);
  parentPort.postMessage({id:c.id,bytes:result.bytes.length,sha256:hash(result.bytes),snapshot:hash(snapshot),identity:true});
 }catch(e){parentPort.postMessage({id:c.id,error:e.stack});}});
}else{
 const cases=JSON.parse(readFileSync(resolve(LOCAL,'corpus.json'))).cases.filter(c=>c.id.startsWith('m9b-')).map(c=>{const [,theme,size,seed]=c.id.split('-');return{...c,theme,size:Number(size),seed:Number(seed)};});
 let at=0;const records=[];
 await Promise.all(Array.from({length:16},()=>new Promise((res,rej)=>{const worker=new Worker(new URL(import.meta.url));const next=()=>at<cases.length?worker.postMessage(cases[at++]):worker.terminate().then(res);worker.on('error',rej);worker.on('message',r=>{if(r.error){worker.terminate();rej(Error(r.error));return;}records.push(r);if(records.length%25===0)console.log('native exports',records.length+'/840');json('native-exports-progress.json',{done:records.length,total:840});next();});next();})));
 assert.equal(records.length,840);json('native-exports.json',{status:'pass',threads:16,binary:hash(readFileSync(resolve(LOCAL,'analysis.node'))),snapshotsRetained:process.argv.includes('--keep-snapshots'),records:records.sort((a,b)=>a.id.localeCompare(b.id))});console.log('Every complete native export passes');
}
