// Exercise unchanged paths through the adoption patch alone (without the shared overlays).
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from '../../src/core/gen/generate';
import { makeSpec } from '../../src/core/spec/mapspec';
const hard=makeSpec({theme:'islands',designedFor:'hard',seed:4,size:{x:96,y:96}});
const other=makeSpec({theme:'canyon',seed:4,size:{x:96,y:96}});
const custom=makeSpec({theme:'islands',seed:4,size:{x:96,y:96}});
custom.settings.terrain.verticality=39;
const results=[];
for(const [name,spec] of [['hard',hard],['other theme',other],['custom controls',custom]] as const) {
  const r=generate(spec);
  results.push({name,sha256:createHash('sha256').update(r.bytes).digest('hex')});
  console.log(`${name}: ${results.at(-1)!.sha256}`);
}
const dest=join(__dirname,'local/fallback-before.json');
if(process.env.ISLANDS_FALLBACK_PHASE==='before')writeFileSync(dest,JSON.stringify(results));
else {
  assert.deepEqual(results,JSON.parse(readFileSync(dest,'utf8')),'adoption changed an unsupported path');
  writeFileSync(join(__dirname,'fallback-verification.json'),JSON.stringify(results,null,2)+'\n');
  console.log('Unsupported paths retain baseline bytes');
}
