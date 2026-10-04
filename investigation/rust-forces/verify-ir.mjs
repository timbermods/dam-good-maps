import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,json,hash} from './common.mjs';
import {assertClean,portableSha256,guardSha256} from './shared-math.mjs';
for(const name of ['src/lib.rs','rust/main.rs'])assertClean('source',readFileSync(resolve(HERE,name),'utf8'));
const rows=[];
for(const target of ['wasm32-unknown-unknown','native']) {
 const dir=resolve(LOCAL,'target',target==='native'?'release/deps':target+'/release/deps');
 const files=readdirSync(dir).filter(n=>n.startsWith('rust_forces')&&/\.(ll|s)$/.test(n));
 assert.ok(files.some(n=>n.endsWith('.ll'))&&files.some(n=>n.endsWith('.s')),'Emit IR and assembly for '+target);
 for(const name of files){const bytes=readFileSync(resolve(dir,name));// LLVM embeds binary bitcode in assembly data directives under LTO; audit instructions, not quoted data.
 const text=bytes.toString();assertClean(name.endsWith('.ll')?'ir':'assembly',name.endsWith('.s')?text.split('\n').filter(l=>!/^\s*\.(?:asciz|ascii|byte|ident|file)\b/.test(l)).join('\n'):text);rows.push({target,name,sha256:hash(bytes)});}
}
const wasm=readFileSync(resolve(LOCAL,'target/wasm32-unknown-unknown/release/rust_forces.wasm'));
assertClean('wasm',wasm);assert.equal(WebAssembly.Module.imports(new WebAssembly.Module(wasm)).length,0);
json('ir.json',{status:'pass',rustSourceSha256:hash(readFileSync(resolve(HERE,'src/lib.rs'))),configSha256:hash(readFileSync(resolve(HERE,'.cargo/config.toml'))),portableSha256,guardSha256,wasmSha256:hash(wasm),rows});
console.log('Shared portable source, strict native/Wasm IR, assembly and unstripped Wasm guard PASS');
