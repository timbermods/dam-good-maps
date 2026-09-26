// Tries the natural-narrows builder (narrows.ts) on the design batch's maps: two places on the main
// river of each of the first maps of every theme. It reports how often the spurs fit, how often the
// first draw read as a wall and was drawn again, that the written result never reads as a wall
// (lib/ridge.ts), how uneven the spurs are (the refinement note's naturalness: thickness and
// height vary along them), and how much shorter a dam holding a Normal drought's water (380
// blocks) is within 6 tiles of the place, before and after (the validators' dam sampling).
//
//   npx tsx investigation/generative/v2/narrows-check.ts [--maps 10]

/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { damSites } from "../../../src/core/analysis/damsites";
import { readTimber } from "../../../src/core/format/timber";
import { surfaceOf } from "../../../src/core/format/world";
import { THEMES } from "../../../src/core/spec/mapspec";
import { damWalls } from "../lib/ridge";
import { arg, MAPS } from "../lib/paths";
import { planNarrows } from "./narrows";

const perTheme = Number(arg("maps", "10"));
const dir = join(MAPS, "v2-128");
const r3 = (v: number) => Math.round(v * 1000) / 1000;
let tried = 0, ok = 0, redrawn = 0, walls = 0, better = 0, raised = 0;
const cvs: number[] = [];
const stds: number[] = [];
const gains: number[] = [];
for (const theme of THEMES)
  for (let seed = 1; seed <= perTheme; seed++) {
    const key = `${theme}-${seed}`;
    if (!existsSync(join(dir, `${key}.timber`))) continue;
    const file = readTimber(new Uint8Array(readFileSync(join(dir, `${key}.timber`))));
    const W = file.world.sizeX;
    const H = file.world.sizeY;
    const N = W * H;
    const h = surfaceOf(file.world);
    const b = readFileSync(join(dir, `${key}.f32`));
    const depth = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).subarray(0, N);
    const { features } = JSON.parse(readFileSync(join(dir, `${key}.features.json`), "utf8"));
    const river = features.find((f: any) => f.kind === "river" && f.params.path.length > 10);
    if (!river) continue;
    for (const at of [0.35, 0.6]) {
      tried++;
      const plan = planNarrows(h, W, H, depth, { path: river.params.path, width: river.params.width, at, seed: seed * 7 + Math.round(at * 100) });
      if (!plan.ok) continue;
      ok++;
      if (plan.errors.length || plan.report.length === 0) redrawn++;
      if (!plan.raise.size) continue;
      raised++;
      const out = h.slice();
      for (const [i, lv] of plan.raise) out[i] = lv;
      if (damWalls(out, W, H, depth).length) walls++;
      // unevenness: the raised tiles' levels and their spread per spur side
      const lv = [...plan.raise.values()];
      const mean = lv.reduce((a, v) => a + v, 0) / lv.length;
      stds.push(Math.sqrt(lv.reduce((a, v) => a + (v - mean) ** 2, 0) / lv.length));
      // thickness along the spurs: tiles raised per row across the river direction (a proxy)
      const counts = new Map<number, number>();
      for (const i of plan.raise.keys()) counts.set(i % W, (counts.get(i % W) ?? 0) + 1);
      const c = [...counts.values()];
      const cm = c.reduce((a, v) => a + v, 0) / c.length;
      cvs.push(Math.sqrt(c.reduce((a, v) => a + (v - cm) ** 2, 0) / c.length) / cm);
      // a dam across the gap: the best site within 6 tiles of the place, before and after
      const clean = new Uint8Array(N);
      const surf = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        clean[i] = depth[i] > 0.05 ? 1 : 0;
        surf[i] = h[i] + depth[i];
      }
      const [px, py] = river.params.path[Math.round(at * (river.params.path.length - 1))];
      const near = (s: any) => Math.max(Math.abs(s.x - px), Math.abs(s.y - py)) <= 6;
      const shortest = (hh: Uint8Array) => damSites(hh, clean, surf, W, H, null, 60, [1, 2, 3], 1).filter((s) => near(s) && s.volume >= 380).reduce((m, s) => Math.min(m, s.length), 99);
      const before = shortest(h);
      const after = shortest(out);
      if (after < before) better++;
      gains.push(after - before);
      if (process.env.DGM_DEBUG === "1") console.log(key, at, "shortest dam holding 380 near the place:", before, "->", after);
    }
  }
const med = (v: number[]) => v.slice().sort((a, b) => a - b)[v.length >> 1];
const res = { tried, fitted: ok, raised, redrawn, wallsOnResult: walls, shorterDam: better, medianDamLengthChange: r3(med(gains)), spurLevelStdMedian: r3(med(stds)), thicknessCVMedian: r3(med(cvs)) };
writeFileSync(join(process.cwd(), "investigation", "generative", "narrows-v2.json"), JSON.stringify(res, null, 1) + "\n");
console.log(res);
