// Diagnostic control: restore per-access checks in the pointer-cached frame.
// Its arithmetic bodies and compiler settings stay unchanged. Never ship this
// generated crate or binary; use it to separate checks from pointer caching.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,hash,json} from './common.mjs';
const folder=resolve(LOCAL,'experiments/checked-frame');mkdirSync(resolve(folder,'src'),{recursive:true});
let source=readFileSync(resolve(HERE,'src/lib.rs'),'utf8');const before=hash(source);
source=source.replace('struct NumericBuffer<T>(*mut T);','struct NumericBuffer<T>(*mut T, usize);');
for(const needle of ['fn index(&self, i: usize) -> &T {','fn index_mut(&mut self, i: usize) -> &mut T {']){if(!source.includes(needle))throw Error('Index shape');source=source.replace(needle,needle+'\n        assert!(i < self.1);');}
for(const needle of ['fn index(&self, r: std::ops::Range<usize>) -> &[T] {','fn index_mut(&mut self, r: std::ops::Range<usize>) -> &mut [T] {']){if(!source.includes(needle))throw Error('Range shape');source=source.replace(needle,needle+'\n        assert!(r.start <= r.end && r.end <= self.1);');}
source=source.replace(/NumericBuffer\((s\.\w+|d)\.as_mut_ptr\(\)\)/g,'NumericBuffer($1.as_mut_ptr(), $1.len())');
writeFileSync(resolve(folder,'src/lib.rs'),source);
let cargo=readFileSync(resolve(HERE,'Cargo.toml'),'utf8').replace(/\[\[bin\]\][\s\S]*?(?=\[profile.release\])/,'');writeFileSync(resolve(folder,'Cargo.toml'),cargo);
execFileSync(resolve(process.env.CARGO_HOME,'bin/cargo.exe'),['build','--release','--lib','--target','wasm32-unknown-unknown','--manifest-path',resolve(folder,'Cargo.toml'),'--target-dir',resolve(folder,'target')],{stdio:'inherit'});
const wasm=resolve(folder,'target/wasm32-unknown-unknown/release/rust_water.wasm');
json('profiles/checked-frame.json',{originalSource:before,checkedSource:hash(source),wasm,sha256:hash(readFileSync(wasm))});console.log(wasm);
