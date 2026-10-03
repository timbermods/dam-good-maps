import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir} from './overlay.mjs';
import {FileResults} from './node-store.mjs';
const lib=await import(pathToFileURL(resolve(dir,'../local/round2/after.mjs')).href);
const {ProjectJsonParser,projectJsonChunks,readProject,writeProject,GestureHistory,MapSession,ResultStore}=lib;
for(const value of [null,[],{},[true,false,1,-0,null],{'__proto__':null,a:'é\uD800\uDfff😀\n\t"\\'},Array.from({length:1500},(_,i)=>({i,s:'x'.repeat(i%41)}))]){
 const expected=JSON.stringify(value),bytes=[...projectJsonChunks(value)];assert.equal(Buffer.concat(bytes).toString(),expected);
 for(const step of [1,3,17,1024]){const parser=new ProjectJsonParser();for(let n=0;n<expected.length;n+=step)parser.push(expected.slice(n,n+step));assert.deepEqual(parser.finish(),JSON.parse(expected));}
 const compressed=[];await writeProject(value,async b=>compressed.push(b));const all=Buffer.concat(compressed);
 for(const step of [1,7,32768])assert.deepEqual(await readProject((function*(){for(let at=0;at<all.length;at+=step)yield all.subarray(at,at+step)})()),JSON.parse(expected));
 await assert.rejects(readProject([all.subarray(0,all.length-1)]));const damaged=Buffer.from(all);damaged[damaged.length-8]^=1;await assert.rejects(readProject([damaged]),/checksum/);
}
for(const s of ['','[1,]','{"a":1,}','[01]','[1 2]','true false','{"a" 1}','"bad\nstring"','[1e400]','[','"\\u00xz"','\u000bnull']){const p=new ProjectJsonParser();assert.throws(()=>{p.push(s);p.finish();},undefined,s);}
const proto=new ProjectJsonParser();proto.push('{"__proto__":{"polluted":true}}');assert.equal(Object.getPrototypeOf(proto.finish()),Object.prototype);assert.equal({}.polluted,undefined);
const root=resolve(dir,'../local');
let fixtures=0;
for(const name of readdirSync(resolve(dir,'../../../tests/fixtures/projects')).filter(x=>x.endsWith('.json')||x.endsWith('.gz'))){const b=readFileSync(resolve(dir,'../../../tests/fixtures/projects',name)),cold=new FileResults(resolve(root,'round2/legacy.cache'));
 try{const legacy=lib.decodeProject(b),history=await GestureHistory.open([b],cold),opened=history.session,expected=MapSession.open(legacy);assert.deepEqual(opened.exportTimber().bytes,expected.exportTimber().bytes);
 const streamed=[];await opened.projectStreaming(async x=>streamed.push(x));assert.deepEqual(await readProject(streamed),await readProject([expected.project()]));fixtures++;}finally{cold.close();}}
assert.equal(fixtures,2);
const asyncBytes=async function*(){yield new TextEncoder().encode('{"a":');await Promise.resolve();yield new TextEncoder().encode('1}');};assert.deepEqual(await readProject(asyncBytes()),{a:1});
await assert.rejects(readProject([new Uint8Array([0xff])]));
await assert.rejects(writeProject({a:1},async()=>{throw Error('disk full');}),/disk full/);
const data={tiles:[0,1,2],heights:[10,11,12],removed:[],verb:'craterize',settings:{seed:1},where:{origin:[0,0]},cut:null};
const backing=new Map(),store=new ResultStore({put:(k,b)=>backing.set(k,b),get:k=>backing.get(k)},1),proxy=store.keep(1,data);store.clearHot();assert.deepEqual(proxy.tiles,data.tiles);assert.equal(store.stats.misses,1);assert.deepEqual(proxy.heights,data.heights);assert.equal(store.stats.misses,1);assert(store.stats.workingBytes>1);
const failed=new ResultStore({put:()=>{throw Error('quota');},get:()=>{throw Error('absent');}});assert.throws(()=>failed.keep(1,data),/quota/);assert.equal(failed.stats.bytes,0);
const fields=new lib.BoundedFields(4096);for(let i=0;i<1000;i++)fields.set(String(i),new Float64Array(256).fill(i));assert(fields.stats.bytes<=4096);assert(fields.size<3);assert.equal(fields.get('999')[0],999);assert.equal(fields.get('0'),undefined);fields.clear();assert.equal(fields.stats.bytes,0);
const frames=new lib.HistorySnapshots(),shared=new Uint8Array(1024);frames.set(1,{shared,own:new Uint8Array(20)});const one=frames.bytes;frames.set(2,{shared,own:new Uint8Array(20)});assert(frames.bytes<one*2);frames.set(1,{shared,own:new Uint8Array(20)});assert.deepEqual([...frames.keys()],[1,2]);frames.delete(2);assert.equal(frames.bytes,one);frames.clear();assert.equal(frames.bytes,0);
const mutable=new lib.BoundedFields(2048),frame={cache:{fields:mutable}};frames.set(1,frame);const empty=frames.bytes;mutable.set('changed',new Float64Array(128));frames.set(1,frame);assert(frames.bytes>empty);const populated=frames.bytes;frames.set(1,frame);assert.equal(frames.bytes,populated);mutable.clear();frames.set(1,frame);assert.equal(frames.bytes,empty);frames.clear();
writeFileSync(resolve(root,'round2/codec-checks.json'),JSON.stringify({passed:true,legacyFixtures:fixtures,geometryEntries:1000,mutableSnapshotAccounting:true,streamingGrammar:true,gzipIntegrity:true,asyncSources:true,sinkFailures:true,oversizedResults:true}));
console.log('Streaming grammar, UTF-8 boundaries, gzip chunk boundaries, and legacy project checks passed.');
