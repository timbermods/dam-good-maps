// Round 3 scope proof: the same 128-square preset seeds for every other theme.
import { drawGenome, leanGenome } from '../../src/core/land/genome';
import { AVAILABLE_THEMES, makeSpec } from '../../src/core/spec/mapspec';
import { shapeLakeBasin } from './prototype';
let count = 0;
for (const theme of AVAILABLE_THEMES) {
  if (theme === 'lakeBasin') continue;
  for (let seed = 1; seed <= 30; seed++) {
    const spec = makeSpec({ theme, seed, size: { x: 128, y: 128 } });
    const g = drawGenome(theme, seed, 128, 128, 0);
    leanGenome(g, spec.settings, 128, 128, seed, 0, spec.designedFor);
    const before = JSON.stringify(g);
    shapeLakeBasin(g, spec.settings, 128, 128, seed, 0, spec.designedFor);
    if (JSON.stringify(g) !== before) throw Error(`${theme}/${seed}: genome changed`);
    count++;
  }
}
console.log(`${count} other-theme genomes unchanged`);
