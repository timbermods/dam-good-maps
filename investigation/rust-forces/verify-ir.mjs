import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {HERE,LOCAL,json,hash} from './common.mjs';
const dirs=['target/wasm32-unknown-unknown/release/deps','target/release/deps'];
const files=dirs.flatMap(d=>existsSync(resolve(LOCAL,d))?readdirSync(resolve(LOCAL,d)).filter(n=>n.endsWith('.ll')&&n.startsWith('rust_forces')).map(n=>d+'/'+n):[]);
if(existsSync(resolve(LOCAL,'shared-water.ll')))files.push('shared-water.ll');
assert.ok(files.length,'Emit Wasm LLVM IR with cargo rustc --release --target wasm32-unknown-unknown --lib -- --emit=llvm-ir');
const rows=[];for(const name of files){const ir=readFileSync(resolve(LOCAL,name),'utf8');assert.ok(!/llvm\.(fma|fmuladd)|\bf(add|sub|mul|div|rem)\s+(?:fast|nnan|ninf|nsz|arcp|contract|afn|reassoc)\b/.test(ir),name+' fused/relaxed arithmetic');assert.ok(!/llvm\.(sin|cos|exp|log|pow)\./.test(ir),name+' transcendental');rows.push({name,sha256:hash(ir)});}
json('ir.json',{status:'pass',rows});console.log('Unfused, strict, non-transcendental LLVM IR PASS');
