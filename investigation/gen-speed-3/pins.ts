// Reuse CI's exact fixture producers and committed pins. Never update a pin here.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { forceFixtures, sha256 } from '../../tools/rust/forces-jobs';
import { analysisFixtures } from '../../tools/rust/analysis-jobs';
import { checksFixtures, packOutputs } from '../../tools/rust/checks-jobs';
import { executeInRust as force } from '../../src/core/forces/rust/bridge';
import { executeInRust as analysis } from '../../src/core/analysis/rust/bridge';
import { runChecks } from '../../src/core/validate/rust';
const root = resolve(import.meta.dirname,'../..');
const results: Record<string,number> = {};
for (const kind of ['forces','analysis','checks'] as const) {
  const pins = JSON.parse(readFileSync(resolve(root,`tools/rust/${kind}-pins.json`),'utf8')) as Record<string,string>;
  const jobs = kind === 'forces' ? forceFixtures() : kind === 'analysis' ? analysisFixtures() : checksFixtures();
  if (jobs.length !== Object.keys(pins).length) throw new Error(`${kind}: fixture count differs`);
  for (const j of jobs) {
    const data = kind === 'forces' ? force((j as ReturnType<typeof forceFixtures>[number]).job)
      : kind === 'analysis' ? analysis((j as ReturnType<typeof analysisFixtures>[number]).frame)
      : packOutputs(runChecks((j as ReturnType<typeof checksFixtures>[number]).inputs));
    if (sha256(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) !== pins[j.name]) throw new Error(`${kind}: pin mismatch ${j.name}`);
  }
  results[kind] = jobs.length;
  console.log(`${kind}: ${jobs.length} Node-Wasm byte fixtures match every committed pin`);
}
mkdirSync(resolve(import.meta.dirname,'local'),{recursive:true});
writeFileSync(resolve(import.meta.dirname,'local/pins.json'),JSON.stringify({ node:process.version, backend:'page embedded WebAssembly', results },null,2));
