import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir,root,require} from '../build.mjs';
const original=readFileSync(resolve(root,'src/core/math/noise.ts'),'utf8');
const cache=`// Lattice values depend only on three integers. Cache a bounded central window;
// coordinates outside it keep the original hash, and the interpolation order is unchanged.
const latticeTables = new Map<number, Float64Array>();
function cachedLattice(table: Float64Array, seed: number, x: number, y: number): number {
  if (x < -16 || x >= 48 || y < -16 || y >= 48) return lattice(seed, x, y);
  const i = (y + 16) * 64 + x + 16, value = table[i];
  if (value === value) return value;
  return table[i] = lattice(seed, x, y);
}
function latticeTable(seed: number): Float64Array {
  const key = seed >>> 0;
  let table = latticeTables.get(key);
  if (!table) {
    // Maximum retained lattice storage: 64 * 64 * 64 * 8 = 2 MiB.
    if (latticeTables.size >= 64) latticeTables.clear();
    table = new Float64Array(64 * 64).fill(NaN);
    latticeTables.set(key, table);
  }
  return table;
}
`;
let candidate=original.replace('/** Value noise in [-1, 1]',cache+'\n/** Value noise in [-1, 1]');
candidate=candidate.replace('  const a = lattice(seed, ix, iy)', '  const table = latticeTable(seed);\n  const a = cachedLattice(table, seed, ix, iy)').replaceAll('lattice(seed, ix + 1, iy)', 'cachedLattice(table, seed, ix + 1, iy)').replaceAll('lattice(seed, ix, iy + 1)', 'cachedLattice(table, seed, ix, iy + 1)').replaceAll('lattice(seed, ix + 1, iy + 1)', 'cachedLattice(table, seed, ix + 1, iy + 1)');
writeFileSync(resolve(dir,'local/noise-candidate.ts'),candidate);
for(const[label,text]of[['before',original],['cache',candidate]])await require('esbuild').build({stdin:{contents:text,loader:'ts',resolveDir:resolve(root,'src/core/math')},bundle:true,format:'esm',platform:'node',outfile:resolve(dir,`local/noise-${label}.mjs`)});
console.log('Noise modules ready; candidate retained under ignored local/.');
