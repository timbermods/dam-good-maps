import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {HERE,LOCAL,WORKSPACE,deps,json,hash} from './common.mjs';
import {frames} from './replay.mjs';
if(!isMainThread){
 const bridge=deps(resolve(LOCAL,'native-bridge.cjs'));bridge.installNativeAnalysis(deps(resolve(LOCAL,'followup/checked-analysis.node')));
 parentPort.on('message',id=>{try{let calls=0;for(const suffix of ['', '.room']){const path=resolve(LOCAL,'cases',id+suffix+'.in.gz');if(suffix&&!existsSync(path))continue;
  const inputs=frames(gunzipSync(readFileSync(path))),expected=frames(gunzipSync(readFileSync(resolve(LOCAL,'cases',id+suffix+'.expected.gz'))));assert.equal(inputs.length,expected.length);
  for(let i=0;i<inputs.length;i++){const actual=bridge.run(inputs[i]);assert.ok(Buffer.from(actual.buffer,actual.byteOffset,actual.byteLength).equals(Buffer.from(expected[i].buffer,expected[i].byteOffset,expected[i].byteLength)),id+'/'+suffix+'/'+i);calls++;}
 }parentPort.postMessage({id,calls});}catch(e){parentPort.postMessage({error:e.stack});}});
}else{
 const toolchain=resolve(WORKSPACE,'rust-water/local/toolchain'),env={...process.env,CARGO_HOME:resolve(toolchain,'cargo'),RUSTUP_HOME:resolve(toolchain,'rustup')};
 const rustc=resolve(env.CARGO_HOME,'bin/rustc.exe'),linker=resolve(toolchain,'llvm-mingw-20250910-msvcrt-x86_64/bin/x86_64-w64-mingw32-clang.exe');
 const native=['-O','-C','target-feature=-fma','-C','link-self-contained=yes','-C','linker='+linker];
 const tests=resolve(LOCAL,'followup/guard-tests.exe');
 execFileSync(rustc,[resolve(HERE,'analysis.rs'),'--edition=2021','--test',...native,'-o',tests],{env,windowsHide:true});
 const testOutput=execFileSync(tests,[],{encoding:'utf8',windowsHide:true});console.log(testOutput);
 execFileSync(rustc,[resolve(HERE,'analysis.rs'),'--edition=2021','--crate-type','cdylib','--cfg','addon','--cfg','checked_grid','-C','panic=abort',...native,'-C','link-arg='+resolve(LOCAL,'node.lib'),'-o',resolve(LOCAL,'followup/checked-analysis.node')],{env,windowsHide:true});
 const ids=readdirSync(resolve(LOCAL,'cases')).filter(n=>n.endsWith('.meta.json')).map(n=>n.slice(0,-10)),records=[];let at=0;
 await Promise.all(Array.from({length:4},()=>new Promise((res,rej)=>{const worker=new Worker(new URL(import.meta.url));function next(){if(at<ids.length)worker.postMessage(ids[at++]);else worker.terminate().then(res);}worker.on('error',rej);worker.on('message',r=>{if(r.error){worker.terminate();rej(Error(r.error));return;}records.push(r);if(records.length%100===0)console.log('Checked grids',records.length+'/'+ids.length);next();});next();})));
 assert.equal(records.length,872);json('followup/guards.json',{status:'pass',source:hash(readFileSync(resolve(HERE,'analysis.rs'))),tests:testOutput,checkedBinary:hash(readFileSync(resolve(LOCAL,'followup/checked-analysis.node'))),cases:records.length,calls:records.reduce((s,r)=>s+r.calls,0),recordsSha256:hash(JSON.stringify(records.sort((a,b)=>a.id.localeCompare(b.id))))});console.log('All checked-grid corpus accesses and bytes pass');
}
