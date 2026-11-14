import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir} from './proposal.mjs';
const d=JSON.parse(readFileSync(resolve(dir,'local/measurements-full.json'),'utf8'));
const sizes=['128x128','256x256','512x512','128x512','512x256','64x512'];
assert.deepEqual(d.issues,[]);
for(const r of d.browser)if(r.suite!=='memory'){
  assert.equal(r.repeats,3,`${r.phase} ${r.suite} ${r.size} ${r.name}`);
  assert(r.cpu.n>0,'timing without load samples');
}
for(const phase of ['before','after'])for(const size of sizes){
  for(const suite of ['editing','brush','saves','forces'])assert(d.browser.some(r=>r.phase===phase&&r.size===size&&r.suite===suite));
  for(const scope of ['editing-0','editing-8','editing-32','editing-64','editing-128','sampled-load'])assert(d.memory.some(r=>r.phase===phase&&r.size===size&&r.scope===scope));
  assert.equal(d.contract[phase].rows.filter(r=>r.size===size&&r.name==='edited-goldens').length,1);
}
assert(d.parity.every(r=>r.identical&&r.runs===6));
assert(d.headless.filter(r=>r.exportIdentical.length).every(r=>r.exportIdentical.every(Boolean)));
for(const size of sizes){
  const a=d.contract.before.rows.find(r=>r.size===size&&r.name==='edited-goldens'),b=d.contract.after.rows.find(r=>r.size===size&&r.name==='edited-goldens');
  assert.equal(a.project,b.project);assert.equal(a.timber,b.timber);
}
assert.equal(d.contract.before.rows.filter(r=>r.ok).length,8);
assert.equal(d.contract.after.rows.filter(r=>r.ok).length,24);
const [denseBefore,denseAfter,dense512]=d.denseHistory;
for(const r of denseBefore.rows.filter(r=>r.project))assert.equal(r.project.sha256,denseAfter.rows.find(x=>x.step===r.step).project.sha256);
assert.equal(dense512.breakageAt,256);
assert.match(dense512.rows.at(-1).project.error,/Invalid string length/);
console.log(`${d.browser.length} browser groups; all timing groups repeated three times with load. All byte oracles pass; dense writer breakage reproduced.`);
