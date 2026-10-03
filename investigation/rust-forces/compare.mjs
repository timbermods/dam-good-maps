import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,arg,json,hash} from './common.mjs';
import {validateCounts} from './acceptance.mjs';
const checkBytes=readFileSync(resolve(LOCAL,arg('checks','checks-final.json'))),browserBytes=readFileSync(resolve(LOCAL,arg('browser','browser-final.json')));
const checks=JSON.parse(checkBytes),browserReport=JSON.parse(browserBytes),browsers=browserReport.rows;
if(Number(arg('browser-count','500'))===500)validateCounts(checks,browsers);
else validateCounts(checks,browsers,{native:20,'node-wasm':20,chromium:5,firefox:5,webkit:5});
const expected=new Map(checks.map(r=>[`${r.verb}/${r.size}/${r.k}/${r.random?'random':'fixture'}`,r.sha256]));
assert.equal(expected.size,checks.length,'Duplicate native/Node-Wasm cases');
const exportHashes=new Map(checks.map(r=>[`${r.verb}/${r.size}/${r.k}/${r.random?'random':'fixture'}`,r.exportSha256]));
const seen=new Set();
for(const r of browsers){assert.equal(r.sha256,expected.get(r.id),`${r.engine}/${r.id}: Node/engine mismatch or missing native oracle`);if(exportHashes.get(r.id))assert.equal(r.exportSha256,exportHashes.get(r.id),`${r.engine}/${r.id}: export bytes`);assert.ok(!seen.has(r.engine+'/'+r.id),'Duplicate browser case '+r.engine+'/'+r.id);seen.add(r.engine+'/'+r.id);}
for(const engine of arg('engines','chromium,firefox,webkit').split(','))for(const id of expected.keys())if(+id.split('/')[2]<Number(arg('browser-count','500')))assert.ok(seen.has(engine+'/'+id),`Missing ${engine}/${id}`);
json('cross-engine.json',{status:'pass',exportCases:checks.filter(r=>r.exportSha256).length,refusals:checks.filter(r=>r.error).length,cases:checks.length,comparisons:browsers.length,checksSha256:hash(checkBytes),browserSha256:hash(browserBytes),wasmSha256:browserReport.build.wasm.sha256,engines:[...new Set(browsers.map(r=>r.engine))],nativeFingerprints:[...new Set(checks.map(r=>r.fingerprint))],fingerprints:[...new Set(browsers.map(r=>r.fingerprint))]});
console.log(checks.length,'Node/native/Wasm cases;',browsers.length,'cross-engine comparisons PASS');
