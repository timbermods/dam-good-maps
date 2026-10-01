// Existing analysis functions on recorded tiles; no generation and no changes to product code.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { signatureOf } from '../../src/core/analysis/signature';
import { wetSystems } from '../../src/core/analysis/story';
import { polygonMask } from '../../src/core/features/geometry';
const folder = join(__dirname, 'local', 'before');
const output: unknown[] = [];
function cliffRun(r: any, radius: number, h: Uint8Array, water: number[], size: number): number {
  let best = 0, run = 0;
  const p = r.params.path;
  for (let k = 0; k + 1 < p.length; k++) {
    const [ax, ay] = p[k], [bx, by] = p[k + 1], L = Math.hypot(bx - ax, by - ay);
    if (!L) continue;
    const n = Math.max(1, Math.ceil(L)), dx = (bx - ax) / L, dy = (by - ay) / L;
    for (let q = 0; q < n; q++) {
      const x = ax + (bx - ax) * q / n, y = ay + (by - ay) * q / n;
      if (x < 1 || y < 1 || x > size - 2 || y > size - 2) continue;
      let surface = Infinity;
      for (let yy = Math.round(y) - 2; yy <= Math.round(y) + 2; yy++) for (let xx = Math.round(x) - 2; xx <= Math.round(x) + 2; xx++) {
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const i = yy * size + xx;
        if (water[i] >= .05) surface = Math.min(surface, h[i] + water[i]);
      }
      if (!Number.isFinite(surface)) surface = h[Math.round(y) * size + Math.round(x)];
      let sides = 0;
      for (const sign of [-1, 1]) {
        let top = -Infinity;
        for (let t = 2; t <= radius; t++) {
          const xx = Math.round(x - sign * dy * t), yy = Math.round(y + sign * dx * t);
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) break;
          top = Math.max(top, h[yy * size + xx]);
        }
        if (top >= surface + 3) sides++;
      }
      run = sides === 2 ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return best;
}
const sizes = process.argv.includes('--sizes') ? process.argv[process.argv.indexOf('--sizes') + 1].split(',').map(Number) : [96, 128, 256];
for (const size of sizes) for (let seed = 1; seed <= 20; seed++) {
  const d = JSON.parse(readFileSync(join(folder, `${size}-${seed}.json`), 'utf8'));
  const t = JSON.parse(readFileSync(join(folder, `${size}-${seed}-tiles.json`), 'utf8'));
  const h = Uint8Array.from(t.heights), first = Uint8Array.from(t.first);
  const N = size * size;
  const changed: number[] = [];
  for (let i = 0; i < N; i++) if (h[i] !== first[i]) changed.push(i);
  const badNear = (i: number) => {
    const x = i % size, y = Math.floor(i / size);
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < size && yy < size && t.water[yy * size + xx] > .05 && t.contamination[yy * size + xx] >= .1) return true;
    }
    return false;
  };
  const sys = wetSystems(size, size, t.water);
  const lakeMasks = d.lakes.map((l: any) => ({ id: l.id, mask: polygonMask(l.params.outline, size, size), params: l.params }));
  const systems = sys.tiles.map((tiles, id) => {
    let bad = 0;
    for (let i = 0; i < N; i++) if (sys.labels[i] === id && t.contamination[i] >= .5) bad++;
    return { id, tiles, volume: sys.volume[id], bad: bad * 2 >= tiles };
  }).filter(s => !s.bad).sort((a, b) => b.volume - a.volume);
  const rivers = d.rivers.filter((r: any) => !r.params.badwater && r.role !== 'river/startSpring' && r.role !== 'river/lakeSpring').map((r: any) => {
    const path = r.params.path;
    let length = 0, dry = 0, longestDry = 0, run = 0, dryInLake = 0;
    const counts: Record<number, number> = {};
    const gaps: { x: number; y: number; h: number; depth: number }[] = [];
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, ay] = path[k], [bx, by] = path[k + 1];
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
      for (let q = 0; q < n; q++) {
        const x = Math.round(ax + (bx - ax) * q / n), y = Math.round(ay + (by - ay) * q / n);
        if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
        length++;
        const i = y * size + x, lab = sys.labels[i];
        if (lab >= 0) counts[lab] = (counts[lab] || 0) + 1;
        const wet = [i, i - 1, i + 1, i - size, i + size].some(j => t.water[j] >= .05);
        if (wet) run = 0;
        else { dry++; run++; if (lakeMasks.some((l: any) => l.mask[i])) dryInLake++; longestDry = Math.max(longestDry, run); if (gaps.length < 4) gaps.push({x, y, h: h[i], depth: t.water[i]}); }
      }
    }
    return { role: r.role, id: r.id, flow: r.params.flow, width: r.params.width, cliffRun6: cliffRun(r, 6, h, t.water, size), cliffRun12: cliffRun(r, 12, h, t.water, size), exit: r.params.exit, entry: r.params.entry, length, dry, dryInLake, longestDry, counts, gaps };
  });
  const line = { size, seed, changes: changed.length, nearBadwater: changed.filter(badNear).length, changedBounds: changed.length ? [Math.min(...changed.map(i => i % size)), Math.min(...changed.map(i => Math.floor(i / size))), Math.max(...changed.map(i => i % size)), Math.max(...changed.map(i => Math.floor(i / size)))] : null, final: d.outcomes.signature, firstWithFinalWater: signatureOf(size, size, first, t.water, d.rivers.concat(d.lakes)), systems, rivers };
  output.push(line);
  if (!d.outcomes.met) console.log(JSON.stringify(line));
}
writeFileSync(join(folder, 'diagnostics.json'), JSON.stringify(output));
