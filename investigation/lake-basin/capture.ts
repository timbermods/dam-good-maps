import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { GenerateResult } from '../../src/core/gen/generate';
import { shadeTiles } from '../../src/core/render/shade';
import { encodePng } from '../../tools/png';
export function capture(r: GenerateResult, out: string, phaseCpu?: {landCpuMs?:number;waterCpuMs?:number}): void {
  const b = r.built, W = b.W, H = b.H;
  const id = `${W}-${r.spec.seed}`;
  const rgb = shadeTiles(b.heights, W, H, b.water), img = new Uint8Array(rgb.length);
  for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
  for (const em of b.waterModel.emitters) for (const i of em.cells) {
    const k = ((H - 1 - Math.floor(i / W)) * W + i % W) * 3;
    img[k] = em.contamination ? 255 : 250; img[k + 1] = em.contamination ? 80 : 250; img[k + 2] = 0;
  }
  if (b.start) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x: number = b.start.x + dx, y: number = b.start.y + dy;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const k = ((H - 1 - y) * W + x) * 3; img[k] = 245; img[k + 1] = 30; img[k + 2] = 50;
  }
  writeFileSync(join(out, id + '.png'), encodePng(img, W, H));
  writeFileSync(join(out, id + '.json'), JSON.stringify({ seed: r.spec.seed, size: W, sha256:createHash('sha256').update(r.bytes).digest('hex'), phaseCpu, outcomes: r.outcomes, info: r.info, checks: r.report.checks, features: r.features, intentions: r.intentions, emitters:b.waterModel.emitters, start: b.start, heights: Array.from(b.heights), water: Array.from(b.water), contamination: Array.from(b.contamination), settled: b.settle.settled, ticks: b.settle.ticks }));
}
