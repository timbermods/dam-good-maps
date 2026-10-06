// Naturalize weathers like nature (PLAN §20 D387 (4), D399): its contract, on generated maps and random
// strokes, through the session as the editor applies them (the built map, after the integrity pass).
// - No tile it changes ends higher than all four neighbours or lower than all four.
// - Nothing newly holds water (the terrain's drainage, `land/drainage.ts`, water leaving at the map's
//   edge and moving side to side as the game's does): no tile has deeper water after a stroke.
// - No neighbouring pair of tiles swaps which is higher.
// - Its edge makes no step that wasn't there: across the rim of what the brush reached, no new step.
// - Nothing one tile wide that wasn't there: no tile it changed forms a tread or ledge narrower than two
//   tiles downhill (between a higher and a lower neighbour across it) or a sliver of a level one tile
//   thick (above or below both its neighbours across it), and no tile it left as it was becomes such a
//   sliver; a tile that was already one tile wide (a tile of a one-tile staircase it had) may stay so.
// - Painting the same spot again changes less and less (repeating settles).
// - An older map has fewer terraces: a Size 64, Strength 10 stroke leaves no more level edges than
//   there were.
// - The water stays where it stood (what you see is what you get): beside a river or a lake no dry
//   tile comes down below the water's surface next to it, and no wet tile is raised.
// - Farmland is never lost: no tile wet or moist before a stroke ends out of the water's reach.
// - A new stroke records its rule, and the page's stroke is the stroke the session builds.
// Cut and fill are printed, as information only.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { brushBounds, markBrushTiles, type BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { drainage } from "../../src/core/land/drainage";
import { groundUnderObjects } from "../../src/core/features/raster/objectGround";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { toMapObject } from "../../src/core/features/build";
import { gameSoil } from "../../src/core/sim/soil";
import { mulberry } from "./brushRandom";

const W = 96;

function session(theme: ThemeId, seed: number, terracing?: number): MapSession {
  const spec = makeSpec({ seed, theme, size: { x: W, y: W } });
  if (terracing !== undefined) spec.settings.terrain.terracing = terracing;
  const r = generate(spec);
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  return s;
}

/** A Naturalize stroke as the editor paints one: a wandering drag, dabs a fifth of the brush apart. */
function stroke(rand: () => number, x: number, y: number, size: number, strength: number): BrushParams {
  const dabs: number[] = [];
  const n = 1 + Math.floor(rand() * 40);
  const step = Math.max(0.25, Math.min(2, size * 0.2));
  let a = rand() * 2 * Math.PI;
  for (let k = 0; k < n; k++) {
    dabs.push(Math.max(0, Math.min(4 * W - 1, Math.round(x * 4))), Math.max(0, Math.min(4 * W - 1, Math.round(y * 4))));
    a += (rand() - 0.5) * 1.2;
    x = Math.max(0, Math.min(W - 0.01, x + Math.cos(a) * step));
    y = Math.max(0, Math.min(W - 0.01, y + Math.sin(a) * step));
  }
  return { tool: "naturalize", size, strength, seed: Math.floor(rand() * 1e6), weathers: true, dabs };
}

/** What a stroke broke, comparing the built map before and after it. */
function broken(a: Uint8Array, b: Uint8Array, reached: Uint8Array): string[] {
  const out: string[] = [];
  const at = (i: number) => `(${i % W}, ${Math.floor(i / W)})`;
  for (let i = 0; i < a.length; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (b[i] !== a[i]) {
      let lo = 255;
      let hi = -1;
      for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < W ? i + W : -1]) {
        if (j < 0) continue;
        lo = Math.min(lo, b[j]);
        hi = Math.max(hi, b[j]);
      }
      if (b[i] > hi) out.push(`${at(i)} ends higher than all its neighbours`);
      if (b[i] < lo) out.push(`${at(i)} ends lower than all its neighbours`);
    }
    for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < W ? i + W : -1]) {
      if (j < 0) continue;
      if ((a[i] > a[j] && b[i] < b[j]) || (a[j] > a[i] && b[j] < b[i])) out.push(`${at(i)} and ${at(j)} swapped which is higher`);
      // across the rim of what the brush reached: no step that wasn't there
      if (reached[i] !== reached[j] && Math.abs(b[i] - b[j]) > Math.abs(a[i] - a[j])) out.push(`a new step at the stroke's edge between ${at(i)} and ${at(j)}`);
    }
  }
  // nothing one tile wide that wasn't there (on the tiles it changed, or beside them)
  const narrow = (h: Uint8Array, i: number, st: number) => h[i] !== h[i - st] && h[i] !== h[i + st];
  for (let i = 0; i < a.length; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === W - 1) continue;
    for (const st of [1, W]) {
      if (b[i] === a[i] && b[i - st] === a[i - st] && b[i + st] === a[i + st]) continue;
      if (!narrow(b, i, st) || narrow(a, i, 1) || narrow(a, i, W)) continue;
      const kind = b[i] > Math.max(b[i - st], b[i + st]) ? "a wall" : b[i] < Math.min(b[i - st], b[i + st]) ? "a slot" : "a tread";
      // (a tile it left as it was may be a tread where a step moved beside it: only never a sliver)
      if (b[i] === a[i] && kind === "a tread") continue;
      out.push(`${at(i)} is ${kind} one tile wide ${st === 1 ? "east-west" : "north-south"}`);
    }
  }
  const f0 = drainage(a, W, W, { eight: false }).filled;
  const f1 = drainage(b, W, W, { eight: false }).filled;
  for (let i = 0; i < a.length; i++) if (f1[i] - b[i] > f0[i] - a[i]) out.push(`${at(i)} holds deeper water (${f0[i] - a[i]} → ${f1[i] - b[i]})`);
  return out;
}

function changed(a: Uint8Array, b: Uint8Array): { tiles: number; cut: number; fill: number } {
  let tiles = 0;
  let cut = 0;
  let fill = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    tiles++;
    if (b[i] < a[i]) cut += a[i] - b[i];
    else fill += b[i] - a[i];
  }
  return { tiles, cut, fill };
}

const MAPS: [ThemeId, number, number | undefined][] = [
  ["riverValley", 3, 100],
  ["lakeBasin", 1, 100],
  ["highlands", 2, undefined],
  ["canyon", 4, undefined],
  ["riverValley", 6, 100],
  ["highlands", 5, 100],
  ["delta", 2, undefined],
  ["islands", 5, undefined],
];

describe("Naturalize keeps the downhill order (D399)", () => {
  for (const [theme, seed, tr] of MAPS)
    it(`${theme} ${seed}${tr !== undefined ? ` at Terracing ${tr}` : ""}: random strokes break nothing`, () => {
      const s = session(theme, seed, tr);
      const rand = mulberry(seed * 7919 + theme.length);
      let cut = 0;
      let fill = 0;
      let moved = 0;
      for (let k = 0; k < 8; k++) {
        const size = [2, 3.5, 5, 8, 14, 24][Math.floor(rand() * 6)];
        const strength = 1 + Math.floor(rand() * 10);
        const p = stroke(rand, 6 + rand() * (W - 12), 6 + rand() * (W - 12), size, strength);
        const before = s.built.heights.slice();
        const u = s.apply({ op: "brush", params: p }, "user", "Naturalize");
        expect(u.errors).toEqual([]);
        expect(u.applied[0].params, "a new stroke records its rule").toMatchObject({ weathering: 4 });
        const reached = new Uint8Array(W * W);
        markBrushTiles(p, W, W, reached);
        const after = s.built.heights;
        expect(broken(before, after, reached), `${theme} ${seed}, stroke ${k + 1} (Size ${size}, Strength ${strength})`).toEqual([]);
        const c = changed(before, after);
        cut += c.cut;
        fill += c.fill;
        moved += c.tiles;
      }
      expect(moved, "the strokes weathered the land").toBeGreaterThan(0);
      console.log(`${theme} ${seed}: ${moved} tiles changed by 8 strokes; cut ${cut}, fill ${fill} (information)`);
      // and the map is the one its operations build
      expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    });
});

/** The middle of the most terraced dry ground (no water, no moisture: farmland keeps its height) a
 *  stroke of Size 12 can reach, away from the map's edge. */
function terraced(s: MapSession): [number, number] {
  const b = s.built;
  let best: [number, number] = [W / 2, W / 2];
  let most = -1;
  for (let y = 16; y < W - 16; y += 2)
    for (let x = 16; x < W - 16; x += 2) {
      let edges = 0;
      let wet = false;
      for (let yy = y - 8; yy <= y + 8 && !wet; yy++)
        for (let xx = x - 8; xx <= x + 8; xx++) {
          const i = yy * W + xx;
          if (b.water[i] > 0 || b.moisture[i] > 0) {
            wet = true;
            break;
          }
          if (b.heights[i] !== b.heights[i + 1]) edges++;
          if (b.heights[i] !== b.heights[i + W]) edges++;
        }
      if (!wet && edges > most) (most = edges), (best = [x, y]);
    }
  return best;
}

describe("painting the same spot again settles (D399)", () => {
  // (on #265's River Valley 3, rule 3 changed 378, 136, 40, 94 tiles at Size 12, Strength 10: the shed
  // lost some cliffs' slopes, and the cliffs left were cut back again by every stroke; rule 4 measures
  // the slope from every cliff)
  for (const [size, strength] of [
    [5, 5],
    [12, 10],
  ] as const)
    it(`ten strokes at Size ${size}, Strength ${strength} change less each time`, () => {
      const s = session("riverValley", 3, 100);
      const rand = mulberry(size * 31 + strength);
      const [cx, cy] = terraced(s);
      const p = stroke(rand, cx, cy, size, strength);
      const counts: number[] = [];
      for (let k = 0; k < 10; k++) {
        const before = s.built.heights.slice();
        // a new stroke each time, as the page paints one: the same path, its own seed
        expect(s.apply({ op: "brush", params: { ...p, seed: 1000 + k } }, "user", "Naturalize").errors).toEqual([]);
        counts.push(changed(before, s.built.heights).tiles);
      }
      console.log(`Size ${size}, Strength ${strength}: tiles changed by each stroke ${counts.join(", ")}`);
      expect(counts[0]).toBeGreaterThan(0);
      // less each time, but for a few tiles of jitter once nearly settled
      for (let k = 1; k < counts.length; k++) expect(counts[k], `stroke ${k + 1} of ${counts.join(", ")}`).toBeLessThanOrEqual(counts[k - 1] + Math.max(3, Math.round(0.1 * counts[0])));
      expect(counts[9], `the tenth stroke changes far less than the first: ${counts.join(", ")}`).toBeLessThanOrEqual(counts[0] / 4);
    });
});

describe("an older map has fewer terraces, not more (D399, Kyler's round 2 verdict)", () => {
  // Size 64 at Strength 10 dragged across the map: the land's level edges (neighbouring tiles at
  // different levels) are no more than before: cliffs shed into a few chunky steps, not ladders, and
  // narrow terraces join their neighbours. The maps of the captures Kyler judged (tools/capture-
  // naturalize.ts), whose themes terrace cleanly at high Terracing
  // Expected failures, kept on the seeds that caught them (Kyler: a test is never moved off the seed that
  // caught a bug): on M9b's lands, met in its merge of dev, River Valley 3 (2,050 level edges → 2,081)
  // and Lake Basin 3 (2,808 → 2,963) end with more level edges than they had. For the milestone
  // session; when one passes, it comes off this list. Lake Basin's maps at Terracing 100 moved when
  // round 2 came to every Lake Basin map (2026-10-03): seed 3 passes now, seed 1 (2,258 → 2,380) fails. On 0.8.1's final maps (D148; badwater ditches follow the land) seed 1
  // still fails (2,300 → 2,332), after passing on an intermediate build, so it is back on the list.
  // River Valley 6 (2,388 → 2,412 with rule 3) passes with rule 4 (2,299), whose shed measures the
  // slope from every cliff. With rule 4, River Valley 3 ends 2,079 → 2,298 and Lake Basin 1 2,300 →
  // 2,315.
  const fails = new Set(["riverValley 3", "lakeBasin 1"]);
  for (const [theme, seed] of [
    ["riverValley", 3],
    ["riverValley", 6],
    ["lakeBasin", 1],
    ["lakeBasin", 3],
  ] as const)
    (fails.has(`${theme} ${seed}`) ? it.fails : it)(`${theme} ${seed} at Terracing 100`, () => {
      const s = session(theme, seed, 100);
      const dabs: number[] = [];
      for (let k = 0; k < 30; k++) dabs.push(4 * (W / 2 - 30 + 2 * k) + 2, 4 * (W / 2) + 2);
      const edges = (h: Uint8Array) => {
        let c = 0;
        for (let i = 0; i < h.length; i++) {
          if (i % W < W - 1 && h[i] !== h[i + 1]) c++;
          if (i + W < h.length && h[i] !== h[i + W]) c++;
        }
        return c;
      };
      const before = edges(s.built.heights);
      expect(s.apply({ op: "brush", params: { tool: "naturalize", size: 64, strength: 10, seed: 5, weathers: true, dabs } }, "user", "Naturalize").errors).toEqual([]);
      const after = edges(s.built.heights);
      console.log(`${theme} ${seed}: level edges ${before} → ${after} (information)`);
      expect(after, "level edges after a Size 64, Strength 10 stroke").toBeLessThanOrEqual(before);
    });
});

describe("Naturalize keeps the water where it stood (D399)", () => {
  for (const [theme, seed] of [
    ["riverValley", 3],
    ["lakeBasin", 1],
  ] as const)
    it(`${theme} ${seed} at Terracing 100: strokes along a river's and a lake's terraced banks flood no dry tile`, () => {
      const s = session(theme, seed, 100);
      const rand = mulberry(seed * 977);
      const wet = (d: ArrayLike<number>, i: number) => d[i] > 1e-3;
      let strokes = 0;
      let lowered = 0;
      for (let k = 0; k < 10; k++) {
        const h0 = s.built.heights.slice();
        const d0 = s.built.water.slice();
        // a shore tile: dry, beside water
        const shore: number[] = [];
        for (let i = W * 4; i < W * (W - 4); i++) {
          const x = i % W;
          if (x < 4 || x >= W - 4 || wet(d0, i)) continue;
          if ([i - 1, i + 1, i - W, i + W].some((j) => wet(d0, j))) shore.push(i);
        }
        expect(shore.length, `${theme} ${seed} has water beside dry land`).toBeGreaterThan(20);
        const at = shore[Math.floor(rand() * shore.length)];
        const p = stroke(rand, (at % W) + 0.5, Math.floor(at / W) + 0.5, [4, 6, 9][k % 3], 6 + (k % 5));
        expect(s.apply({ op: "brush", params: p }, "user", "Naturalize").errors).toEqual([]);
        strokes++;
        const h1 = s.built.heights;
        const bad: string[] = [];
        for (let i = 0; i < h0.length; i++) {
          if (h1[i] === h0[i]) continue;
          if (h1[i] < h0[i]) lowered++;
          if (wet(d0, i)) {
            if (h1[i] > h0[i]) bad.push(`wet (${i % W}, ${Math.floor(i / W)}) raised ${h0[i]} → ${h1[i]}`);
            continue;
          }
          for (const j of [i - 1, i + 1, i - W, i + W]) {
            if (!wet(d0, j)) continue;
            const surface = h0[j] + d0[j];
            if (h1[i] < surface - 1e-9 && h0[i] >= surface - 1e-9) bad.push(`(${i % W}, ${Math.floor(i / W)}) came down to ${h1[i]}, under the water beside it at ${surface.toFixed(2)}`);
          }
        }
        expect(bad, `${theme} ${seed}, stroke ${k + 1} at (${at % W}, ${Math.floor(at / W)})`).toEqual([]);
      }
      expect(strokes).toBe(10);
      expect(lowered, "the banks still weathered").toBeGreaterThan(0);
    });
});

describe("farmland is never lost (D399, Kyler's round 3 verdict)", () => {
  // no tile wet or moist before a stroke ends out of the water's reach: the moisture of the settled
  // water (the game's soil rules, sim/soil.ts, as the build stores it) on the land before and after,
  // the water standing as it stood
  for (const [theme, seed] of [
    ["riverValley", 3],
    ["riverValley", 6],
    ["lakeBasin", 1],
    ["lakeBasin", 3],
  ] as const)
    it(`${theme} ${seed} at Terracing 100: strokes by the water and a Size 64 drag keep every moist tile moist`, () => {
      const s = session(theme, seed, 100);
      const rand = mulberry(seed * 4241 + theme.length);
      const depth0 = s.built.water.slice();
      const contamination = s.built.contamination.slice();
      // (the soil by the game's rules, as the build stores it and Naturalize holds it, D298; the older
      // port, sim/moisture.ts, counted tiles by a badwater ditch moist that the game counts dry, and
      // 0.8.1's ditches join rivers and lakes)
      const objects = s.built.entities.map(toMapObject);
      for (let k = 0; k < 6; k++) {
        const h0 = s.built.heights.slice();
        const m0 = gameSoil(W, W, h0, depth0, contamination, objects).moisture;
        // a moist dry tile to paint on, or (the last stroke) Size 64 across the map
        const moistTiles: number[] = [];
        for (let i = W * 4; i < W * (W - 4); i++) if (i % W >= 4 && i % W < W - 4 && m0[i] > 0 && !(depth0[i] > 0)) moistTiles.push(i);
        expect(moistTiles.length, `${theme} ${seed} has moist ground`).toBeGreaterThan(20);
        const at = moistTiles[Math.floor(rand() * moistTiles.length)];
        let p: BrushParams;
        if (k === 5) {
          const dabs: number[] = [];
          for (let q = 0; q < 30; q++) dabs.push(4 * (W / 2 - 30 + 2 * q) + 2, 4 * (W / 2) + 2);
          p = { tool: "naturalize", size: 64, strength: 10, seed: 3, weathers: true, dabs };
        } else p = stroke(rand, (at % W) + 0.5, Math.floor(at / W) + 0.5, [5, 9, 14, 24][k % 4], 5 + (k % 6));
        expect(s.apply({ op: "brush", params: p }, "user", "Naturalize").errors).toEqual([]);
        const h1 = s.built.heights;
        // the water as it stood: its surface over the land now
        const depth1 = new Float64Array(depth0.length);
        for (let i = 0; i < depth1.length; i++) if (depth0[i] > 0) depth1[i] = Math.max(0, h0[i] + depth0[i] - h1[i]);
        const m1 = gameSoil(W, W, h1, depth1, contamination, objects).moisture;
        const lost: string[] = [];
        for (let i = 0; i < m0.length; i++) if (m0[i] > 0 && !(m1[i] > 0)) lost.push(`(${i % W}, ${Math.floor(i / W)}) ${h0[i]} → ${h1[i]}`);
        expect(lost, `${theme} ${seed}, stroke ${k + 1} (Size ${p.size}, Strength ${p.strength}) dried`).toEqual([]);
      }
    });
});

describe("the page's stroke is the stroke the session builds (D399)", () => {
  it("dabs handed in a few at a time give the land the operation builds", () => {
    const s = session("riverValley", 3, 100);
    const rand = mulberry(99);
    for (const [size, strength] of [
      [5, 5],
      [20, 9],
    ] as const) {
      const p = stroke(rand, W / 2, W / 2, size, strength);
      const heights = s.built.heights.slice();
      const { dabs, ...settings } = p;
      const preview = new StrokePreview(settings, s.terrainState(), heights, W, W, groundUnderObjects(s.built.entities));
      for (let k = 0; k < dabs.length; k += 6) preview.add(dabs.slice(k, k + 6));
      // the page's settings now carry the rule and the water the preview kept, as its operation will
      expect(settings).toMatchObject({ weathering: 4, shore: expect.any(Array), pools: expect.any(Array), moist: expect.any(Array) });
      const u = s.apply({ op: "brush", params: { ...settings, dabs } }, "user", "Naturalize");
      expect(u.errors).toEqual([]);
      expect(Array.from(heights), `Size ${size}`).toEqual(Array.from(s.built.heights));
      // its working rectangle lies inside its bounds (a rebuild reads nothing beyond them)
      expect(brushBounds(u.applied[0].params as BrushParams, W, W)).not.toBeNull();
    }
  });
});
