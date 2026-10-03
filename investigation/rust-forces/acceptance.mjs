// Exact required counts belong here, independently of STATUS.json's booleans.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,hash} from './common.mjs';
export const REQUIRED_COUNTS=Object.freeze({native:2000,'node-wasm':2000,chromium:500,firefox:500,webkit:500});
export const FORCES=['footprint','craterize','erupt','quake','carve','glaciate'];
export const SIZES=[256];
export function validateCounts(checks,browsers,required=REQUIRED_COUNTS){
 const cells=new Map(),add=(target,verb,size,k)=>{const key=[target,verb,size].join('/');if(!cells.has(key))cells.set(key,new Set());assert.ok(!cells.get(key).has(k),'Duplicate '+key+'/'+k);cells.get(key).add(k);};
 for(const r of checks){assert.equal(r.random,true);assert.equal(r.nativeChecked,true);assert.equal(r.nodeWasmChecked,true);add('native',r.verb,r.size,r.k);add('node-wasm',r.verb,r.size,r.k);}
 for(const r of browsers){assert.equal(r.ok,true);const [verb,size,k,kind]=r.id.split('/');assert.equal(kind,'random');add(r.engine,verb,+size,+k);}
 for(const [target,count]of Object.entries(required))for(const verb of FORCES)for(const size of SIZES){const key=[target,verb,size].join('/'),set=cells.get(key);assert.equal(set?.size,count,'Required '+key+': '+count);for(let k=0;k<count;k++)assert.ok(set.has(k),'Missing '+key+'/'+k);}
 assert.equal(cells.size,FORCES.length*SIZES.length*Object.keys(required).length);
 return Object.fromEntries([...cells].map(([key,set])=>[key,set.size]));
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(HERE,'acceptance.mjs')) {
 const status=JSON.parse(readFileSync(resolve(HERE,'STATUS.json'))),missing=Object.entries(status.gates).filter(([,pass])=>pass!==true).map(([name])=>name);
 assert.equal(missing.length,0,'NOT READY FOR ADOPTION: '+missing.join(', '));
 assert.equal(JSON.parse(readFileSync(resolve(HERE,'baseline-check.json'))).postM9bMerged,true,'Adoption oracle must be dev after M9b merges');
 const math=JSON.parse(readFileSync(resolve(LOCAL,'ir.json'))),build=JSON.parse(readFileSync(resolve(LOCAL,'build.json')));
 const {portableSha256,guardSha256}=await import('./shared-math.mjs');
 assert.equal(math.portableSha256,portableSha256);assert.equal(math.guardSha256,guardSha256);
 assert.equal(math.rustSourceSha256,hash(readFileSync(resolve(HERE,'src/lib.rs'))));assert.equal(math.configSha256,hash(readFileSync(resolve(HERE,'.cargo/config.toml'))));assert.equal(math.wasmSha256,hash(readFileSync(resolve(LOCAL,'forces.wasm'))));assert.equal(build.wasm.sha256,math.wasmSha256);
 const nativeFingerprint=hash(Buffer.concat(['forces.wasm','api.cjs','target/release/forces-batch.exe'].map(n=>readFileSync(resolve(LOCAL,n))))),browserFingerprint=hash(Buffer.concat(['forces.wasm','worker.js'].map(n=>readFileSync(resolve(LOCAL,n)))));
 const matrix=JSON.parse(readFileSync(resolve(LOCAL,'identity-matrix.json')));
 assert.equal(matrix.pilot,false,'A 1% shard cannot satisfy adoption');
 assert.equal(matrix.count,2000);assert.equal(matrix.browserCount,500);
 const checks=JSON.parse(readFileSync(resolve(LOCAL,'checks-random-final.json'))),browser=JSON.parse(readFileSync(resolve(LOCAL,'browser-random-final.json')));
 validateCounts(checks,browser.rows);
 assert.ok(checks.every(r=>r.fingerprint===nativeFingerprint&&r.typedRecordsChecked===true&&(r.verb==='footprint'||r.error||r.productWriterChecked===true)));assert.ok(browser.rows.every(r=>r.fingerprint===browserFingerprint&&r.typedRecordsChecked===true&&(r.id.startsWith('footprint/')||r.error||r.productWriterChecked===true)));
 const cross=JSON.parse(readFileSync(resolve(LOCAL,'cross-engine.json')));
 assert.equal(cross.status,'pass');assert.equal(cross.cases,12000);assert.equal(cross.comparisons,9000);assert.equal(cross.checksSha256,hash(readFileSync(resolve(LOCAL,'checks-random-final.json'))));assert.equal(cross.browserSha256,hash(readFileSync(resolve(LOCAL,'browser-random-final.json'))));
 assert.deepEqual(status.sizes,SIZES);assert.deepEqual(matrix.sizes,SIZES);assert.equal(status.baseline,build.base);assert.equal(build.base,JSON.parse(readFileSync(resolve(HERE,'baseline-check.json'))).oracle);
 console.log('READY FOR ADOPTION: all gates and exactly 30 required 256² force/target counts pass (33,000 target checks).');
}
