// Run after the timing batch: these full checks intentionally consume CPU.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as before from './local/round2-before/src/worker/session';
import * as after from './local/round2-after/src/worker/session';
import {MapSession} from './local/round2-after/src/core/doc/session';
import {decodeProject} from './local/round2-after/src/core/doc/document';
const here=new URL('./',import.meta.url),base=new URL('local/round2-after/public/first-visit/',here);
const index=JSON.parse(readFileSync(new URL('index.json',base),'utf8')),rows:any[]=[];
const clean=({version,ms,...check}:any)=>check;
// Hold the process while the worker's unreferenced MessageChannel yields between check slices.
const hold=setInterval(()=>{},1000);
try {
for(const map of index.maps){
 const bytes=new Uint8Array(readFileSync(new URL(map.file,base)));
 before.openProject(bytes);after.openProject(bytes);
 const a=await before.exportTimber(false),b=await after.exportTimber(false);
 assert.deepEqual(b,a,`${map.id}: immediate Save/export before a background check`);
 assert.deepEqual(clean(before.exportCheck()),clean(after.exportCheck()));
 // Remove the required start; a snapshot must never turn this into a permissible export.
 const s=MapSession.open(decodeProject(bytes)),start=s.features.find(f=>f.kind==='start')!;
 assert.ok(start);assert.equal(s.apply({op:'deleteFeature',params:{id:start.id}}).ok,true);
 const damaged=s.project();before.openProject(damaged);after.openProject(damaged);
 const ca=before.exportCheck(),cb=after.exportCheck();assert.deepEqual(clean(cb),clean(ca));
 assert.ok(cb.blocking.length,'Missing start must block');
 const deniedBefore=await before.exportTimber(true),deniedAfter=await after.exportTimber(true);
 assert.deepEqual(deniedAfter,deniedBefore);assert.equal(deniedAfter.ok,false);assert.equal(deniedAfter.bytes.length,0);
 // The checks replica follows the same hydrated state, preserving every report and gate.
 const doc=decodeProject(bytes);const instant=after.follow({version:42,doc,keep:0,add:[]});assert.ok(instant);
 const replica=await after.replicaCheck(42);assert.ok(replica);before.openProject(bytes);
 assert.deepEqual(clean(replica.check),clean(before.exportCheck()));
 rows.push({map:map.id,immediateExportIdentical:true,missingStartBlocked:true,replicaChecksIdentical:true});
 before.closeSession();after.closeSession();console.log(map.id,'immediate export, negative gate and replica passed');
}
}finally{clearInterval(hold);before.closeSession();after.closeSession();}
writeFileSync(new URL('ROUND2-GATES.json',here),JSON.stringify(rows,null,2));
