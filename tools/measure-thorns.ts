// Measures the official maps' thorn patches (docs/FINDINGS.md "Thorns", PLAN §20 D338): tiles a patch, its stretch and
// how much of its box it fills. Thorns within a tile of each other (8-neighbours with a gap of one) are one patch (GAP=1 by default: touching, corners included; GAP=2 leaves a tile between).
//   npx tsx tools/measure-thorns.ts [dir with the official .timber files]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readTimber } from "../src/core/format/timber";

const GAP = Number(process.env.GAP ?? 1);
const dir = process.argv[2] ?? "investigation/raw/builtin";
const nbs: number[] = [];
const sizes: number[] = [], aspects: number[] = [], fills: number[] = [];
let maps = 0;
for (const n of readdirSync(dir).filter((f) => f.endsWith(".timber") && !f.startsWith("_")).sort()) {
  const w = readTimber(new Uint8Array(readFileSync(join(dir, n)))).world;
  const pts: [number, number][] = [];
  for (const e of w.entities as any[]) {
    if (e.Template !== "Thorns") continue;
    const c = e.Components?.BlockObject?.Coordinates;
    if (c) pts.push([c.X, c.Y]);
  }
  if (!pts.length) continue;
  maps++;
  const seen = new Array(pts.length).fill(false);
  let patches = 0;
  for (let i = 0; i < pts.length; i++) {
    if (seen[i]) continue;
    const q = [i];
    seen[i] = true;
    const g: [number, number][] = [];
    while (q.length) {
      const a = q.pop()!;
      g.push(pts[a]);
      for (let b = 0; b < pts.length; b++)
        if (!seen[b] && Math.abs(pts[a][0] - pts[b][0]) <= GAP && Math.abs(pts[a][1] - pts[b][1]) <= GAP) (seen[b] = true, q.push(b));
    }
    patches++;
    sizes.push(g.length);
    if (g.length >= 8) {
      const set = new Set(g.map(([x, y]) => `${x},${y}`));
      let n = 0;
      for (const [x, y] of g) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && set.has(`${x + dx},${y + dy}`)) n++;
      nbs.push(n / g.length);
    }
    if (g.length >= 3) {
      const mx = g.reduce((s, p) => s + p[0], 0) / g.length, my = g.reduce((s, p) => s + p[1], 0) / g.length;
      let sxx = 0, syy = 0, sxy = 0;
      for (const [x, y] of g) (sxx += (x - mx) ** 2, syy += (y - my) ** 2, sxy += (x - mx) * (y - my));
      const t = (sxx + syy) / 2, d = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2);
      aspects.push(Math.sqrt((t + d) / Math.max(1e-9, t - d)));
      // fill: tiles over the area of the ellipse the second moments describe (area = pi * a * b, radii sqrt(4 * lambda / n))
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ct = Math.cos(th), st = Math.sin(th);
      const us = g.map(([x, y]) => (x - mx) * ct + (y - my) * st), vs = g.map(([x, y]) => -(x - mx) * st + (y - my) * ct);
      const box = (Math.max(...us) - Math.min(...us) + 1) * (Math.max(...vs) - Math.min(...vs) + 1);
      fills.push(g.length / box);
    }
  }
  console.log(`${n}: ${pts.length} thorns in ${patches} patches`);
}
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
const stat = (name: string, a: number[]) => console.log(`${name}: n ${a.length}, min ${q(a, 0).toFixed(2)}, p10 ${q(a, 0.1).toFixed(2)}, median ${q(a, 0.5).toFixed(2)}, p90 ${q(a, 0.9).toFixed(2)}, max ${q(a, 1).toFixed(2)}`);
console.log(`${maps} maps with thorns`);
stat("tiles per patch", sizes);
const logs = sizes.map(Math.log);
const mu = logs.reduce((s, v) => s + v, 0) / logs.length;
console.log(`log-normal fit: median ${Math.exp(mu).toFixed(1)}, sigma ${Math.sqrt(logs.reduce((s, v) => s + (v - mu) ** 2, 0) / logs.length).toFixed(2)}`);
stat("stretch (major over minor, patches of 3 or more)", aspects);
stat("share of its box (along its long axis) a patch fills", fills);
stat("neighbours of a thorn that hold a thorn (of 8; patches of 8 or more)", nbs);
