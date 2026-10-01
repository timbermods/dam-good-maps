import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as genome from '../../src/core/land/genome';
import { generate } from '../../src/core/gen/generate';
import { AVAILABLE_THEMES, makeSpec } from '../../src/core/spec/mapspec';
import { shapeCanyon } from './prototype';

let genomes = 0;
for (const theme of AVAILABLE_THEMES) for (const size of [96, 128, 256]) for (let seed = 1; seed <= 20; seed++) for (const rivers of [0, 1, 2, 3]) {
  const s = makeSpec({ theme, seed, size: { x: size, y: size } });
  s.settings.water.rivers = rivers;
  const g = genome.drawGenome(theme, seed, size, size, 0, { vt: s.settings.terrain.verticality, variety: s.settings.terrain.variety });
  genome.leanGenome(g, s.settings, size, size, seed, 0);
  const shaped = structuredClone(g);
  shapeCanyon(shaped, s.settings);
  if (theme !== 'canyon' || rivers === 0) assert.deepEqual(shaped, g);
  else {
    assert.equal(shaped.hydro.inflows, Math.max(1, g.hydro.inflows));
    shaped.hydro.inflows = g.hydro.inflows;
    assert.deepEqual(shaped, g); // Every other seeded shaping parameter stays identical.
  }
  genomes++;
}
const lean = genome.leanGenome;
// The same in-memory adoption hook as the audit, without changing any source files.
(genome as any).leanGenome = (...args: Parameters<typeof lean>) => { lean(...args); shapeCanyon(args[0], args[1]); };
const expected = JSON.parse(readFileSync(join(__dirname, 'local/after/128-9.json'), 'utf8')).bytesHash;
const hashes: string[] = [];
for (let n = 0; n < 2; n++) {
  const r = generate(makeSpec({ theme: 'canyon', seed: 9, size: { x: 128, y: 128 } }));
  assert(r.report.passed && r.outcomes?.met);
  const hash = createHash('sha256').update(r.bytes).digest('hex');
  assert.equal(hash, expected);
  hashes.push(hash);
}
const result = { genomes, unchangedOtherThemesAndRiversZero: true, repeatedSeed: '128:9', hashes, expected };
writeFileSync(join(__dirname, 'local/verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
