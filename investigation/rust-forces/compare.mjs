import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,arg,json} from './common.mjs';
const checks=JSON.parse(readFileSync(resolve(LOCAL,arg('checks','checks-final.json'))));
const browsers=JSON.parse(readFileSync(resolve(LOCAL,arg('browser','browser-final.json')))).rows;
const expected=new Map(checks.map(r=>[`${r.verb}/${r.size}/${r.k}/${r.random?'random':'fixture'}`,r.sha256]));
const seen=new Set();
for(const r of browsers){assert.equal(r.sha256,expected.get(r.id),`${r.engine}/${r.id}: Node/engine mismatch or missing native oracle`);seen.add(r.engine+'/'+r.id);}
for(const engine of arg('engines','chromium,firefox,webkit').split(','))for(const id of expected.keys())assert.ok(seen.has(engine+'/'+id),`Missing ${engine}/${id}`);
json('cross-engine.json',{status:'pass',cases:checks.length,comparisons:browsers.length,engines:[...new Set(browsers.map(r=>r.engine))],fingerprints:[...new Set(browsers.map(r=>r.fingerprint))]});
console.log(checks.length,'Node/native/Wasm cases;',browsers.length,'cross-engine comparisons PASS');
