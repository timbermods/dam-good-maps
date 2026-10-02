// Naturalize weathers like nature (PLAN §20 D387 (4), D399): its contract, on generated maps and random
// strokes, through the session as the editor applies them (the built map, after the integrity pass).
// - No tile it changes ends higher than all four neighbours or lower than all four.
// - Nothing newly holds water (the terrain's drainage, `land/drainage.ts`, water leaving at the map's
//   edge and moving side to side as the game's does): no tile has deeper water after a stroke.
// - No neighbouring pair of tiles swaps which is higher.
// - Its edge makes no step that wasn't there: across the rim of what the brush reached, no new step.
// - Painting the same spot again changes less and less (repeating settles).
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
        expect(u.applied[0].params, "a new stroke records its rule").toMatchObject({ weathering: 2 });
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

describe("painting the same spot again settles (D399)", () => {
  for (const [size, strength] of [
    [5, 5],
    [12, 10],
  ] as const)
    it(`ten strokes at Size ${size}, Strength ${strength} change less each time`, () => {
      const s = session("riverValley", 3, 100);
      const rand = mulberry(size * 31 + strength);
      const p = stroke(rand, W / 2 - 6, W / 2 + 4, size, strength);
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
      const u = s.apply({ op: "brush", params: p }, "user", "Naturalize");
      expect(u.errors).toEqual([]);
      expect(Array.from(heights), `Size ${size}`).toEqual(Array.from(s.built.heights));
      // its working rectangle lies inside its bounds (a rebuild reads nothing beyond them)
      expect(brushBounds(u.applied[0].params as BrushParams, W, W)).not.toBeNull();
    }
  });
});
