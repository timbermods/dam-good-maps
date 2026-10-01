import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {MapSession as Before} from './local/round2-before/src/core/doc/session';
import {MapSession as After} from './local/round2-after/src/core/doc/session';
import {decodeProject} from './local/round2-after/src/core/doc/document';
const base=new URL('local/round2-after/public/first-visit/',import.meta.url),rows=[];
for(const name of ['river-valley-1','islands-1']){
 const doc=decodeProject(new Uint8Array(readFileSync(new URL(name+'.json.gz',base)))),a=Before.open(doc),b=After.open(doc);
 a.setWaterMode('defer');b.setWaterMode('defer');
 const state=b.terrainState(),i=b.built.heights.findIndex((h,i)=>!state.protect[i]&&h<state.top-1),W=b.built.W;
 const op:any={op:'brush',params:{tool:'raise',size:1,strength:1,dabs:[(i%W+.5)*4,(Math.floor(i/W)+.5)*4],precise:true}};
 assert.ok(i>=0);assert.equal(a.apply(op).ok,true);assert.equal(b.apply(op).ok,true);assert.ok(b.waterPending);
 b.fullBuild=()=>{throw Error('autosave must not start a full build');};
 const bytes=b.project(1);assert.deepEqual(bytes,a.project(1),'pending-water save retains exact original project bytes');
 assert.equal(decodeProject(bytes).checkpoint,undefined);
 const direct=After.open(decodeProject(bytes)),reference=Before.open(decodeProject(bytes));
 for(const key of ['heights','water','contamination','moisture','soilContamination'] as const) {
  const x=direct.built[key],y=reference.built[key];assert.deepEqual(Buffer.from(x.buffer,x.byteOffset,x.byteLength),Buffer.from(y.buffer,y.byteOffset,y.byteLength));
 }
 assert.deepEqual(direct.exportTimber().bytes,reference.exportTimber().bytes);
 rows.push({map:name,noAutosaveBuild:true,originalProjectBytes:true,canonicalReopenIdentical:true});
}
writeFileSync(new URL('ROUND2-PENDING.json',import.meta.url),JSON.stringify(rows,null,2));console.log(rows);
