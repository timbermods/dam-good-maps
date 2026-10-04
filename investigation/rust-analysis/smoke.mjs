import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {LOCAL,deps,json,hash} from './common.mjs';
import {exact,pack} from './codec.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),wasm=deps(resolve(LOCAL,'bridge.cjs')),native=deps(resolve(LOCAL,'native-bridge.cjs'));
await wasm.installRustAnalysis(readFileSync(resolve(LOCAL,'analysis.wasm')));native.installNativeAnalysis(deps(resolve(LOCAL,'analysis.node')));
let seed=0x710afa13;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};const allInputs=[],allExpected=[];let checks=0;
const frame=v=>{const b=Buffer.from(v.buffer,v.byteOffset,v.byteLength),head=Buffer.alloc(4);head.writeUInt32LE(b.length);return Buffer.concat([head,b]);};
function check(name,args){globalThis.__ra=null;const input=wasm.encode(name,args),before=Buffer.from(input.buffer).slice(),reference=api[name](...args),expected=wasm.flatten(name,reference);
 for(const b of [wasm,native]){const result=b.run(input);assert.ok(Buffer.from(result.buffer).equals(Buffer.from(expected.buffer)),name+' result bytes');assert.equal(exact(b.decode(name,result,input[1]*input[2])),exact(reference),name+' interfaces');}
 assert.ok(Buffer.from(input.buffer).equals(before),'input ownership');allInputs.push(frame(input));allExpected.push(frame(expected));checks++;
}
for(let k=0;k<160;k++){const W=k%8===0?1:4+Math.floor(rand()*31),H=k%9===0?1:4+Math.floor(rand()*31),N=W*H;
 const h=Uint8Array.from({length:N},()=>Math.floor(rand()*7)),mask=Uint8Array.from({length:N},()=>rand()<.3?1:0),blocked=Uint8Array.from({length:N},()=>rand()<.1?1:0),depth=Float64Array.from({length:N},()=>[0,.05,.05+Number.EPSILON,.3,1.5][Math.floor(rand()*5)]),links=Array.from({length:Math.floor(rand()*12)},()=>[Math.floor(rand()*N),Math.floor(rand()*N)]);
 check('distanceFrom',[mask,W,H]);check('levelRegions',[h,W,H]);for(const eight of [false,true])check('components',[mask,W,H,eight]);check('landRegions',[h,W,H,mask]);check('walkRegions',[h,W,H,k%2?blocked:null,links]);check('walkDistance',[h,W,H,k%2?blocked:null,links,{x:Math.floor(W/2),y:Math.floor(H/2)},[0,1,Math.SQRT2,64][k%4]]);
 const model={W,H,floor:Float64Array.from(h, v=>v+k%3*.25),dam:k%2?Float64Array.from(h,()=>rand()<.1?.65:-1):null,emitters:k%5?[{cells:[0,N-1,Math.floor(N/2)],strength:1,contamination:0}]:[]};check('spillLevels',[model]);check('damSites',[h,mask,Float64Array.from(h,v=>v+.3),W,H,k%2?new Float64Array(N).fill(Infinity):null,60,[1,2,3,4],k%3+1,k%2?30:0,k%2?3:0]);
 if(W>10&&H>10)for(const want of [0,1,2,3])check('roomMap',[h,W,H,{wet:depth,keep:blocked,want,lo:2+k%5,firm:k%3}]);
}
// Memory growth and retained output ownership after many subsequent allocations.
const saved=wasm.invoke('distanceFrom',[Uint8Array.from([1,0,0,0]),2,2]),savedBytes=Buffer.from(saved.buffer).slice();
for(const size of [256,1,128,2,256,96]){const mask=new Uint8Array(size*size);mask[0]=1;check('distanceFrom',[mask,size,size]);}assert.ok(Buffer.from(saved.buffer).equals(savedBytes),'output survives growth');
const dir=resolve(LOCAL,'cases');mkdirSync(dir,{recursive:true});const id='edge-contract';const inputs=Buffer.concat(allInputs),expected=Buffer.concat(allExpected);writeFileSync(resolve(dir,id+'.in.gz'),gzipSync(inputs,{level:1}));writeFileSync(resolve(dir,id+'.expected.gz'),gzipSync(expected,{level:1}));writeFileSync(resolve(dir,id+'.json.gz'),gzipSync(JSON.stringify(pack({golden:true}))));writeFileSync(resolve(dir,id+'.high.json'),JSON.stringify({expected:hash('{}')}));writeFileSync(resolve(dir,id+'.meta.json'),JSON.stringify({id,calls:checks,input:hash(inputs),expected:hash(expected),identity:true,fingerprint:hash(readFileSync(resolve(LOCAL,'analysis.wasm')))}));json('smoke.json',{checks,status:'pass'});console.log('Native and Wasm edge/lifecycle contracts PASS',checks);
