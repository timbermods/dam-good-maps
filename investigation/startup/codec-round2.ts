import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MapSession} from './local/round2-after/src/core/doc/session';
import {checkpoint,restoreCheckpoint} from './local/round2-after/src/core/doc/checkpoint';
import {decodeProject,encodeProject} from './local/round2-after/src/core/doc/document';
import {JsonFloat} from './local/round2-after/src/core/format/json';
const doc=decodeProject(new Uint8Array(readFileSync(new URL('local/round2-after/public/first-visit/river-valley-1.json.gz',import.meta.url)))),s=MapSession.open(doc);
for(const map of JSON.parse(readFileSync(new URL('local/round2-after/public/first-visit/index.json',import.meta.url),'utf8')).maps){
 const d=decodeProject(new Uint8Array(readFileSync(new URL('local/round2-after/public/first-visit/'+map.file,import.meta.url)))),c=d.checkpoint!;
 assert.equal(c.digest,createHash('sha256').update(JSON.stringify([c.graph,c.blobs])).digest('hex'));
}
const shared=new JsonFloat(-0),equalA=new Uint8Array([0,1,255]),equalB=equalA.slice();
const water=new Float64Array(s.built.water);water[0]=-0;water[1]=Number.NaN;water[2]=Infinity;
const built:any={...s.built,water,extra:new Map([['aliasA',equalA],['aliasB',equalA],['equal',equalB]]),entities:[{...s.built.entities[0],components:{a:shared,b:shared,c:new JsonFloat(-0),raw:new JsonFloat(6.80089e-5,'6.80089E-05')}}]};
const bytes=encodeProject({...doc,checkpoint:checkpoint(doc,built)}),opened:any=restoreCheckpoint(decodeProject(bytes));assert.ok(opened);
assert.deepEqual(Buffer.from(opened.water.buffer),Buffer.from(water.buffer),'Float64 payload bits, including -0/NaN/Infinity');
const c=opened.entities[0].components;assert.ok(Object.is(c.a.value,-0));assert.ok(Object.is(c.c.value,-0));assert.equal(c.a,c.b);assert.equal(c.raw.raw,'6.80089E-05');
assert.equal(opened.extra.get('aliasA'),opened.extra.get('aliasB'));assert.notEqual(opened.extra.get('aliasA'),opened.extra.get('equal'));assert.deepEqual(opened.extra.get('aliasA'),opened.extra.get('equal'));
console.log('Scalar float signs/spellings, typed-array bits and shared/distinct aliases pass');
