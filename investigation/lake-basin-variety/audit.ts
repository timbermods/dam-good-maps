// The round's audit (audit.cjs) for today's dev, under tsx: the CommonJS hook can no longer load the
// Rust analysis' ES module. It measures this checkout's own Lake Basin (no prototype substitution),
// so run it once on dev's src/core/land/lakeBasin.ts and once with the adoption applied.
//
//   npx tsx investigation/lake-basin-variety/audit.ts <label>   (writes local/<label>/)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { straightness, tooStraight } from '../../src/core/analysis/straight';
import { shadeTiles } from '../../src/core/render/shade';
import { encodePng } from '../../tools/png';

const HERE = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2];
if (!/^[a-z0-9-]+$/.test(label ?? '')) throw Error('Expected an output label');
const out = join(HERE, 'local', label);
mkdirSync(out, { recursive: true });

// m9b/measures.ts without its batch and its clocks, its result kept for the image and channel reading.
let src = readFileSync(resolve(HERE, '../m9b/measures.ts'), 'utf8')
  .split('// ------------------------------------------------------------------------------------ the batch')[0];
src = src.replace(/performance\.now\(\)/g, '0').replace(/process\.cpuUsage\([^)]*\)/g, '({ user: 0, system: 0 })')
  .replace('const b = r.built;', '(globalThis as any).__lakeResult = r; const b = r.built;')
  .replace(/from '\.\.\/\.\.\//g, "from '../../../../");
src = src.split('\n').filter((line) => !/^    (ms|cpu|spent):/.test(line)).join('\n') + '\nexport { measureOne };\n';
const lib = join(out, 'measures-lib.ts');
writeFileSync(lib, src);
const { measureOne } = await import(pathToFileURL(lib).href);

const rows: unknown[] = [];
const r0 = (v: number) => Math.round(v * 1000) / 1000;
let promise = 0, water = 0, both = 0, straight = 0;
const shares: number[] = [];
for (let seed = 1; seed <= 30; seed++) {
  const m = measureOne('lakeBasin', seed, 128, '', false);
  const b = (globalThis as any).__lakeResult.built;
  const st = straightness(b.W, b.H, b.water);
  const row = { seed, ok: m.ok, promise: m.outcomes?.promise ?? false, water: m.outcomes?.water ?? false,
    bigLake: m.outcomes?.signature?.bigLake, lakeShare: m.outcomes?.signature?.lakeShare,
    straight: { pass: !tooStraight(st), run: st.longest?.length ?? 0, canal: st.canal?.length ?? 0 } };
  rows.push(row);
  promise += +row.promise; water += +row.water; both += +(row.promise && row.water); straight += +row.straight.pass;
  if (typeof row.bigLake === 'number') shares.push(row.bigLake);
  const rgb = shadeTiles(b.heights, 128, 128, b.water), img = new Uint8Array(256 * 256 * 3);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = y * 128 + x;
    let c = Array.from(rgb.subarray(i * 3, i * 3 + 3));
    if (b.water[i] > 0.05 && b.contamination[i] >= 0.05) c = [150, 60, 170];
    if (b.start && Math.abs(x - b.start.x) <= 1 && Math.abs(y - b.start.y) <= 1) c = [230, 20, 20];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) img.set(c, (((127 - y) * 2 + dy) * 256 + x * 2 + dx) * 3);
  }
  writeFileSync(join(out, `${seed}.png`), encodePng(img, 256, 256));
  console.log(JSON.stringify(row));
}
writeFileSync(join(out, 'outcomes.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify({ maps: rows.length, promise, water, both, straight,
  bigLake: shares.length ? [r0(Math.min(...shares)), r0(Math.max(...shares))] : null }));
