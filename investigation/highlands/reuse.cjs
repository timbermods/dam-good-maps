// Larger Highlands draws are unchanged. Reuse their exact baseline captures explicitly.
require('./runtime.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const genomePath = require.resolve('../../src/core/land/genome.ts');
const baseline = require(genomePath);
delete require.cache[genomePath];
process.argv.push('--prototype');
const proposed = require(genomePath);
const local = path.join(__dirname, 'local');
fs.mkdirSync(path.join(local, 'after'), {recursive:true});
let comparisons = 0;
for (const size of [128,256]) for (let seed=1; seed<=20; seed++) {
  const key = `${size}-${seed}`;
  const detail = JSON.parse(fs.readFileSync(path.join(local,'before',`${key}.json`),'utf8'));
  const measure = JSON.parse(fs.readFileSync(path.join(local,'before',`${key}.measure.json`),'utf8'));
  const spec = detail.spec;
  for (let attempt=0; attempt<=measure.attempts; attempt++) {
    const opts = {vt:spec.settings.terrain.verticality, variety:spec.settings.terrain.variety};
    const a = baseline.drawGenome('highlands',seed,size,size,attempt,opts);
    const b = proposed.drawGenome('highlands',seed,size,size,attempt,opts);
    baseline.leanGenome(a,spec.settings,size,size,seed,attempt,spec.designedFor);
    proposed.leanGenome(b,spec.settings,size,size,seed,attempt,spec.designedFor);
    assert.deepEqual(b,a,`${key}/${attempt}`);
    comparisons++;
  }
  const provenance = 'unchanged baseline reused; no second timing run';
  detail.provenance = provenance;
  measure.provenance = provenance;
  fs.writeFileSync(path.join(local,'after',`${key}.json`),JSON.stringify(detail));
  fs.writeFileSync(path.join(local,'after',`${key}.measure.json`),JSON.stringify(measure));
  fs.copyFileSync(path.join(local,'before',`${key}.png`),path.join(local,'after',`${key}.png`));
}
console.log(`${comparisons} larger-map genome+settings comparisons passed; 40 exact baseline maps reused`);
