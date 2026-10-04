import assert from 'node:assert/strict';
import {violations} from './guard.mjs';
for(const s of ['Math.exp(1)','Math["hypot"](1,2)','const f=Math.sin; f(1)','const {cos}=Math','const M=Math; M.exp(1)','globalThis.Math.log(1)','globalThis["Math"].pow(2,3)','2 ** .5','x **= .5','Math.random()','Math.sqrt(1)'])assert.ok(violations(s,'src/core/probe.ts').length,s);
for(const s of ['Math.floor(1)','Math.imul(1,2)','Math.PI','// Math.exp(1)'])assert.equal(violations(s,'src/core/probe.ts').length,0,s);
assert.ok(violations('const s="Math.sin(1)"','tools/probe.ts').length);
for(const s of ['import {zipSync} from "fflate"','import {gzipSync as compress} from "fflate"','import * as f from "fflate"'])assert.ok(violations(s,'src/core/probe.ts').length,s);
for(const s of ['Reflect.get(globalThis,"Math").exp(1)','import {sqrt} from "mathjs"','eval("2 ** .5")','new Function("return Math.exp(1)")'])assert.ok(violations(s,'src/core/probe.ts').length,s);
console.log('Guard alias/computed access/destructuring/power/random regression checks pass');
