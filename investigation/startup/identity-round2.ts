import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {MapSession as Before} from './local/round2-before/src/core/doc/session';
import {MapSession as After} from './local/round2-after/src/core/doc/session';
import {decodeProject} from './local/round2-after/src/core/doc/document';
import {sha256,restoreCheckpoint} from './local/round2-after/src/core/doc/checkpoint';
import {summary} from './metrics.mjs';
const here=new URL('./',import.meta.url),base=new URL('local/round2-before/public/first-visit/',here);
for(const text of ['', 'abc','😀é',...Array.from({length:130},(_,i)=>'x'.repeat(i)), 'map'.repeat(100000)])assert.equal(sha256(text),createHash('sha256').update(text).digest('hex'));
const index=JSON.parse(readFileSync(new URL('index.json',base),'utf8')), rows:any[]=[];
function fingerprint(b:any):string {
 const h=createHash('sha256');
 // Compare all observable build output, including unrounded Float64 water/soil, exact entity
 // JSON, placement/settle diagnostics and dirty/orphan state. Caches are acceleration internals.
 const visit=(v:any)=>{if(ArrayBuffer.isView(v)){h.update(v.constructor.name);h.update(Buffer.from(v.buffer,v.byteOffset,v.byteLength));}
 else if(v instanceof Map){for(const [k,x] of v){visit(k);visit(x);}}
 else if(v instanceof Set){for(const x of v)visit(x);}
 else if(Array.isArray(v)){h.update('[');v.forEach(visit);h.update(']');}
 else if(v&&typeof v==='object'){for(const k of Object.keys(v).sort()){h.update(k);visit(v[k]);}}
 else h.update(String(v));};
 const {cache,...output}=b;visit(output);return h.digest('hex');
}
function proof(label:string,reference:any,active?:any) {
 const source=active??After.open(reference.document),bytes=source.project(),doc=decodeProject(bytes);
 assert.ok(restoreCheckpoint(doc),`${label}: checkpoint accepted`);
 const direct=After.open(doc),rebuilt=Before.open(doc),output=fingerprint(rebuilt.built);
 assert.equal(fingerprint(direct.built),output,`${label}: exact output bytes`);
 assert.deepEqual(direct.terrainState(),rebuilt.terrainState(),`${label}: brush pre/protect/channel`);
 assert.deepEqual(direct.exportTimber().bytes,rebuilt.exportTimber().bytes,`${label}: complete timber bytes including thumbnail`);
 assert.deepEqual(direct.validate('export').report,rebuilt.validate('export').report,`${label}: every export check`);
 // Prove the restored caches support a real next edit and undo, not merely a matching picture.
 const op:any={op:'brush',params:{tool:'raise',size:1,strength:1,dabs:[258,258],precise:true}};
 assert.equal(direct.apply(op).ok,true);assert.equal(rebuilt.apply(op).ok,true);
 assert.equal(fingerprint(direct.built),fingerprint(rebuilt.built),`${label}: first edit`);
 direct.undo();rebuilt.undo();assert.equal(fingerprint(direct.built),fingerprint(rebuilt.built),`${label}: undo`);
 const feature=direct.features.find((f:any)=>(f.kind==='landform'||f.kind==='river'||f.kind==='lake') && direct.check({op:'deleteFeature',params:{id:f.id}}).length===0);
 if(feature){const op:any={op:'deleteFeature',params:{id:feature.id}};
   assert.equal(direct.apply(op).ok,true);assert.equal(rebuilt.apply(op).ok,true);
   assert.equal(fingerprint(direct.built),fingerprint(rebuilt.built),`${label}: feature rerasterization`);
   direct.undo();rebuilt.undo();assert.equal(fingerprint(direct.built),fingerprint(rebuilt.built),`${label}: feature undo`);
 }
 const stale={...doc,nextSeq:doc.nextSeq+1};assert.equal(restoreCheckpoint(stale),null);
 const corrupt=structuredClone(doc);corrupt.checkpoint!.digest='0'.repeat(64);assert.equal(restoreCheckpoint(corrupt),null);
 const incompatible=structuredClone(doc);incompatible.checkpoint!.abi+='x';assert.equal(restoreCheckpoint(incompatible),null);
 assert.equal(fingerprint(After.open(corrupt).built),output,`${label}: damaged-cache fallback`);
 const legacy={...doc};delete legacy.checkpoint;assert.equal(fingerprint(After.open(legacy).built),output,`${label}: legacy fallback`);
 return {bytes,output,checks:true,exportBytes:true,editUndo:true};
}
for(const map of index.maps){
 const legacy=readFileSync(new URL(map.file,base)),reference=Before.open(decodeProject(legacy));
 const p=proof(map.id,reference),times=[];
 for(let i=0;i<5;i++){const t=performance.now();After.open(decodeProject(p.bytes));times.push(performance.now()-t);}
 writeFileSync(new URL(`local/round2-after/public/first-visit/${map.file}`,here),p.bytes);
 rows.push({map:map.id,kind:'first-visit',originalBytes:legacy.length,checkpointBytes:p.bytes.length,outputSha256:p.output,directOpenMs:summary(times),checks:p.checks,exportBytes:p.exportBytes,editUndo:p.editUndo});
 // One saved, edited generated project per theme; operations are accepted by the existing API.
 assert.equal(reference.apply({op:'brush',params:{tool:'raise',size:1,strength:1,dabs:[258,258],precise:true}} as any).ok,true);
 const savedActive=After.open(decodeProject(legacy));assert.equal(savedActive.apply({op:'brush',params:{tool:'raise',size:1,strength:1,dabs:[258,258],precise:true}} as any).ok,true);
 const saved=proof(`${map.id}/saved-brush`,reference,savedActive);
 rows.push({map:map.id,kind:'saved-generated',outputSha256:saved.output,checks:saved.checks,exportBytes:saved.exportBytes,editUndo:saved.editUndo});
 // Saved imported project exercises raw entities, stored world, file-water and frozen layers.
 const imported=Before.importMap(reference.exportTimber().bytes,`${map.id}.timber`);
 assert.equal(imported.apply({op:'brush',params:{tool:'raise',size:1,strength:1,dabs:[258,258],precise:true}} as any).ok,true);
 const importedActive=After.importMap(reference.exportTimber().bytes,`${map.id}.timber`);assert.equal(importedActive.apply({op:'brush',params:{tool:'raise',size:1,strength:1,dabs:[258,258],precise:true}} as any).ok,true);
 const savedImport=proof(`${map.id}/saved-import`,imported,importedActive);
 rows.push({map:map.id,kind:'saved-import',outputSha256:savedImport.output,checks:savedImport.checks,exportBytes:savedImport.exportBytes,editUndo:savedImport.editUndo});
 map.bytes=p.bytes.length;map.sha256=createHash('sha256').update(p.bytes).digest('hex');
 console.log(map.id,'identity/export/checks/edit/undo passed;',legacy.length,'->',p.bytes.length,'bytes');
}
writeFileSync(new URL('local/round2-after/public/first-visit/index.json',here),JSON.stringify(index,null,2));
writeFileSync(new URL('ROUND2-IDENTITY.json',here),JSON.stringify({sample:'Six original ready maps; six saved generated and six saved imported projects made from the same terrain. These are reproducible synthetic saves, not personal user files.',rows},null,2));
