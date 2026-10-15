// Erode's before-and-after sheet (D281, D144): six erosions on generated maps, from the core's terrain.
// Each case: the land top-down before and after (the hollows under the rock tinted, deeper darker),
// and a side profile through the deepest part of the hollow before and after (rock, its hard beds,
// air). The 3D view draws undersides on maps with caves; this sheet is the core's own record.
//
//   npx tsx tools/erode-sheet.ts [--out .scratch/erode-sheet]
//   python tools/erode-sheet.py .scratch/erode-sheet docs/sheets/erode-1.jpg

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MapSession } from "../src/core/doc/session";
import { ERODE_DEFAULTS, ErodeRun, withMasks, type ErodeSettings } from "../src/core/forces/erode";
import type { FullForceMap } from "../src/core/forces/force";
import { geology } from "../src/core/forces/random";
import { fullForceMapOf } from "../src/core/forces/start";
import { generate } from "../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { unsupportedVoxels } from "../src/core/terrain/support";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = arg("out", ".scratch/erode-sheet");
mkdirSync(OUT, { recursive: true });

const maps = new Map<string, FullForceMap>();
function mapOf(theme: ThemeId, seed: number): FullForceMap {
  const key = `${theme}:${seed}`;
  let m = maps.get(key);
  if (!m) {
    const s = MapSession.fromGenerated(generate(makeSpec({ seed, theme, size: { x: 128, y: 128 } })));
    m = fullForceMapOf(s.built, { rockLayers: geology(s.openedHeights), lava: null, down: new Map(), usedIds: new Set() });
    maps.set(key, m);
  }
  return m;
}

/** The foot of a tall dry cliff near the map's middle (`skip`: the how-manyth such), `under` a hard bed
 *  for an overhang: one at least three levels over the foot and four under the top. */
function cliffFoot(m: FullForceMap, skip = 0, under = false): { x: number; y: number } {
  const { W, H } = m;
  const found: { i: number; drop: number }[] = [];
  for (let y = 8; y < H - 8; y++)
    for (let x = 8; x < W - 8; x++) {
      const i = y * W + x;
      if (m.water.depth[i] > 0.01) continue;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        const drop = m.heights[j] - m.heights[i];
        if (drop < (under ? 7 : 5) || m.water.depth[j] > 0.01) continue;
        if (under && !m.rockLayers.some((r, z) => r > 0.5 && z >= m.heights[i] + 3 && z <= m.heights[j] - 4)) continue;
        found.push({ i, drop });
        break;
      }
    }
  if (!found.length) throw new Error("no cliff on this map");
  found.sort((a, b) => b.drop - a.drop || a.i - b.i);
  const f = found[Math.min(found.length - 1, skip * 7)];
  return { x: f.i % W, y: Math.floor(f.i / W) };
}

/** A thin ridge's crossing: a dry fin two to four tiles thick, at least 5 over the ground on both
 *  sides, running on for five tiles; null when the map has none. */
export function ridge(m: FullForceMap): { x: number; y: number }[] | null {
  const { W, H, heights: h } = m;
  const fin = (x: number, y: number, dx: number, dy: number): number => {
    for (let t = 1; t <= 4; t++) {
      const at = (k: number) => (y + dy * k) * W + x + dx * k;
      let lo = 99;
      let wet = false;
      for (let k = -1; k <= t; k++) if (m.water.depth[at(k)] > 0.01) wet = true;
      for (let k = 0; k < t; k++) lo = Math.min(lo, h[at(k)]);
      if (!wet && lo >= 6 && h[at(-1)] <= lo - 5 && h[at(t)] <= lo - 5) return t;
    }
    return 0;
  };
  for (let y = 10; y < H - 10; y++)
    for (let x = 10; x < W - 10; x++)
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const t = fin(x, y, dx, dy);
        if (!t) continue;
        let along = 0;
        for (let s = -2; s <= 2; s++) if (fin(x + dy * s, y + dx * s, dx, dy)) along++;
        if (along < 5) continue;
        const c = { x: x + (dx * (t - 1)) / 2, y: y + (dy * (t - 1)) / 2 };
        return [{ x: c.x - dx * 5, y: c.y - dy * 5 }, { x: c.x + dx * 5, y: c.y + dy * 5 }];
      }
  return null;
}

/** A flat, dry spot away from the cliffs. */
function flat(m: FullForceMap): { x: number; y: number } {
  const { W, H } = m;
  for (let y = 20; y < H - 20; y++)
    for (let x = 20; x < W - 20; x++) {
      let ok = true;
      for (let dy = -6; dy <= 6 && ok; dy++) for (let dx = -6; dx <= 6 && ok; dx++) {
        const j = (y + dy) * W + x + dx;
        if (m.heights[j] !== m.heights[y * W + x] || m.water.depth[j] > 0) ok = false;
      }
      if (ok) return { x, y };
    }
  return { x: W >> 1, y: H >> 1 };
}

interface Case {
  theme: ThemeId;
  seed: number;
  what: string;
  settings: Partial<ErodeSettings>;
  path: (m: FullForceMap) => { x: number; y: number }[];
  /** A hand-made map instead of a generated one (the shape of an arch, which generated maps rarely
   *  give: a dry fin a few tiles thick). */
  made?: () => FullForceMap;
}

/** A fin two tiles thick and 14 high over dry ground at level 2, its beds every fourth level. */
function fin(): FullForceMap {
  const W = 128;
  const heights = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) heights[y * W + x] = x === 64 || x === 65 ? 14 : 2;
  return { W, H: W, heights, entities: [], water: { depth: new Float64Array(W * W), contamination: new Float64Array(W * W) }, maxHeight: 22, rockLayers: Array.from({ length: 23 }, (_, z) => (z % 4 === 3 ? 1 : 0)), lava: new Uint32Array(W * W), fallen: [] };
}
const CASES: Case[] = [
  { theme: "canyon", seed: 3, what: "a click at a cliff's foot", settings: { power: 30 }, path: (m) => [cliffFoot(m)] },
  { theme: "canyon", seed: 3, what: "the same foot, Power 100", settings: { power: 100 }, path: (m) => [cliffFoot(m)] },
  { theme: "highlands", seed: 3, what: "a sweep along a cliff", settings: { power: 70 }, path: (m) => {
    const p = cliffFoot(m, 1);
    return [{ x: p.x, y: p.y - 6 }, { x: p.x, y: p.y + 6 }];
  } },
  { theme: "canyon", seed: 7, what: "under a hard bed: an overhang", settings: { power: 60 }, path: (m) => [cliffFoot(m, 0, true)] },
  { theme: "canyon", seed: 3, what: "across a thin ridge: an arch", settings: { power: 85 }, path: (m) => ridge(m) ?? [cliffFoot(m, 3)] },
  { theme: "canyon", seed: 0, what: "a hand-made fin, swept across: the arch's shape", settings: { power: 85 }, made: fin, path: () => [{ x: 59, y: 64 }, { x: 70, y: 64 }] },
  { theme: "highlands", seed: 3, what: "flat ground: a scoured hollow", settings: { power: 60 }, path: (m) => [flat(m)] },
];

const CROP = 32;
const index: object[] = [];
CASES.forEach((c, k) => {
  const m = withMasks(c.made ? c.made() : mapOf(c.theme, c.seed));
  const path = c.path(m);
  const settings = { ...ERODE_DEFAULTS, ...c.settings };
  const run = new ErodeRun(m, settings, { path });
  run.finishAll();
  const after = run.final()!;
  const { W, H } = m;
  const before = m.masks!;
  const now = after.masks!;
  const falls = unsupportedVoxels({ W, H, mask: now }).reduce((a, v) => a + v, 0) - unsupportedVoxels({ W, H, mask: before }).reduce((a, v) => a + v, 0);
  const s = run.plan0.stats;
  const cx = Math.max(CROP / 2, Math.min(W - CROP / 2, Math.round(s.x)));
  const cy = Math.max(CROP / 2, Math.min(H - CROP / 2, Math.round(s.y)));
  const x0 = cx - CROP / 2;
  const y0 = cy - CROP / 2;
  // the profile: the row or column through the crop where the most voxels went
  let best = { axis: "row" as "row" | "col", at: cy, n: -1 };
  for (const axis of ["row", "col"] as const)
    for (let q = 0; q < CROP; q++) {
      let n = 0;
      for (let p = 0; p < CROP; p++) {
        const i = axis === "row" ? (y0 + q) * W + x0 + p : (y0 + p) * W + x0 + q;
        n += popcount(before[i] & ~now[i]);
      }
      if (n > best.n) best = { axis, at: (axis === "row" ? y0 : x0) + q, n };
    }
  const crop = (a: ArrayLike<number>) => Array.from({ length: CROP * CROP }, (_, q) => a[(y0 + Math.floor(q / CROP)) * W + x0 + (q % CROP)]);
  const slice = (a: Uint32Array) => Array.from({ length: CROP }, (_, p) => a[best.axis === "row" ? best.at * W + x0 + p : (y0 + p) * W + best.at]);
  index.push({
    theme: c.theme,
    seed: c.seed,
    what: c.what,
    power: settings.power,
    size: settings.size,
    worn: s.worn,
    held: s.held,
    scoured: s.scoured,
    falls,
    crop: { x0, y0, n: CROP },
    path: path.map((p) => ({ x: p.x - x0, y: p.y - y0 })),
    profile: { axis: best.axis, at: best.at - (best.axis === "row" ? y0 : x0) },
    rock: m.rockLayers,
    heightsBefore: crop(m.heights),
    heightsAfter: crop(after.heights),
    masksBefore: crop(before),
    masksAfter: crop(now),
    water: crop(m.water.depth),
    sliceBefore: slice(before),
    sliceAfter: slice(now),
  });
  console.log(`${k + 1}. ${c.theme} ${c.seed}: ${c.what}: worn ${s.worn}, held ${s.held}, scoured ${s.scoured}, falls ${falls}`);
});
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));

function popcount(v: number): number {
  let n = 0;
  for (v >>>= 0; v; v &= v - 1) n++;
  return n;
}
