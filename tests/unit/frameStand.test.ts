// The stand of ruins in the opening view (gen/frameStand.ts, D493 as planning ruled it on 2026-11-20): on dry ground
// only, never between the start and its water, past Normal's clear distance, its whole self in the pulled-back frame,
// never a row or a grid; ahead of the colony and raised where the land offers it; its scrap given back by the map's
// other fields.

import { describe, expect, it } from "vitest";
import { elongation, FRAME_STAND, giveBackScrap, planFrameStand } from "../../src/core/gen/frameStand";
import { planResources } from "../../src/core/gen/resources";
import { makeSpec } from "../../src/core/spec/mapspec";
import { frameAt, openingCamera, VISTA_ZOOM } from "../../src/core/analysis/opening";
import { distanceFrom, runsToTiles } from "../../src/core/math/grid";
import { Rng } from "../../src/core/math/rng";

const W = 160, H = 160, N = W * H;
const START = { x: 64, y: 40, z: 2, orientation: "Cw0" as const };
const CLEAR = 16;

/** Level 2 ground with plateaus of level 4 (one ahead of the start's look, one green, one behind it), a pond ahead of
 *  the start with green round it, and the start's own green round it. */
function land(allGreen = false) {
  const heights = new Uint8Array(N).fill(2);
  const water = new Float64Array(N);
  const moisture = new Float64Array(N);
  const box = (x0: number, y0: number, x1: number, y1: number, f: (i: number) => void) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f(y * W + x);
  };
  box(76, 84, 98, 104, (i) => (heights[i] = 4)); // ahead and up
  box(20, 90, 40, 110, (i) => {
    heights[i] = 4;
    moisture[i] = 3; // a green plateau: never
  });
  box(100, 10, 120, 30, (i) => (heights[i] = 4)); // off the look
  box(60, 52, 68, 58, (i) => (water[i] = 1)); // the start's pond
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i - x) / W;
    if (!water[i] && Math.hypot(x - 64, y - 55) < 9) moisture[i] = 4;
    if (Math.hypot(x - START.x, y - START.y) < 12) moisture[i] = 5;
    if (allGreen && !water[i]) moisture[i] = 2;
  }
  const startMask = new Uint8Array(N);
  box(START.x - 1, START.y - 1, START.x + 2, START.y + 2, (i) => (startMask[i] = 1));
  const startDist = distanceFrom(startMask, W, H);
  const walk = Float64Array.from(startDist);
  const moist = Uint8Array.from(moisture, (m, i) => (m > 0 && !water[i] ? 1 : 0));
  const free = Uint8Array.from(water, (d) => (d > 0 ? 0 : 1));
  const g = { W, H, heights, water, moisture, soilContamination: new Float64Array(N), taken: new Uint8Array(N), entities: [] };
  return { g, moist, free, startDist, walk, water };
}

function stands(allGreen = false) {
  const l = land(allGreen);
  const out = [];
  for (let seed = 1; seed <= 8; seed++) out.push(planFrameStand(l.g, START, l.free, l.moist, l.startDist, l.walk, CLEAR, new Rng(seed)));
  return { l, out };
}

describe("the stand of ruins in the opening view", () => {
  const { l, out } = stands();
  const got = out.filter((s) => s !== null);

  it("finds a stand on the land that offers one, ahead of the colony and raised first", () => {
    expect(got.length).toBe(8);
    for (const s of got) {
      expect(s.ahead && s.raised).toBe(true);
      expect(s.tiles.every((i) => l.g.heights[i] === 4)).toBe(true);
    }
  });

  it("stands on dry ground only, past the clear distance, off the water", () => {
    for (const s of got)
      for (const i of s.tiles) {
        expect(l.moist[i]).toBe(0);
        expect(l.startDist[i]).toBeGreaterThanOrEqual(CLEAR);
        expect(l.water[i]).toBe(0);
      }
  });

  it("never stands between the start and its water", () => {
    // the shore the walk reaches first, and the ellipse round the way there
    let shore = -1;
    for (let i = 0; i < N; i++) {
      if (l.water[i]) continue;
      const x = i % W, y = (i - x) / W;
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => l.water[(y + dy) * W + x + dx] > 0);
      if (touches && (shore < 0 || l.walk[i] < l.walk[shore])) shore = i;
    }
    const sx = START.x + 0.5, sy = START.y + 0.5, wx = (shore % W) + 0.5, wy = Math.floor(shore / W) + 0.5;
    const toShore = Math.hypot(wx - sx, wy - sy);
    for (const s of got)
      for (const i of s.tiles) {
        const x = (i % W) + 0.5, y = Math.floor(i / W) + 0.5;
        expect(Math.hypot(x - sx, y - sy) + Math.hypot(x - wx, y - wy)).toBeGreaterThanOrEqual(toShore + FRAME_STAND.between);
      }
  });

  it("stands whole in the pulled-back frame", () => {
    const cam = openingCamera(START, VISTA_ZOOM);
    for (const s of got)
      for (const i of s.tiles)
        for (const z of [l.g.heights[i], l.g.heights[i] + 8]) {
          const p = frameAt(cam, (i % W) + 0.5, Math.floor(i / W) + 0.5, z)!;
          expect(Math.abs(p.u)).toBeLessThanOrEqual(1);
          expect(Math.abs(p.v)).toBeLessThanOrEqual(1);
        }
  });

  it("is never a row or a grid: one ragged piece of 12 to 36 columns, its long axis at most 2.4 × its short one", () => {
    for (const s of got) {
      expect(s.tiles.length).toBeGreaterThanOrEqual(FRAME_STAND.columns.least);
      expect(s.tiles.length).toBeLessThanOrEqual(FRAME_STAND.columns.most);
      expect(elongation(s.tiles, W)).toBeLessThanOrEqual(FRAME_STAND.elongation);
      const xs = s.tiles.map((i) => i % W), ys = s.tiles.map((i) => Math.floor(i / W));
      const box = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
      expect(s.tiles.length).toBeLessThan(box);
    }
    // and each map's stand its own shape
    expect(new Set(got.map((s) => s.tiles.join())).size).toBeGreaterThan(1);
  });

  it("finds none where the view holds only green: the map keeps its ruins as they are", () => {
    expect(stands(true).out.every((s) => s === null)).toBe(true);
  });

  it("is the same stand for the same seed", () => {
    expect(stands().out.map((s) => s?.tiles.join())).toEqual(out.map((s) => s?.tiles.join()));
  });
});

const box = (a: { [k: number]: number }, w: number, x0: number, y0: number, x1: number, y1: number, v: number) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * w + x] = v;
};

describe("the stand's place, in order: a step's foot, a rise, a level's rim, the far side of the water", () => {
  /** Level 2 ground, no green; `z` the start's level, `free` the ground the stand may take. */
  const places = (z: number, shape: (h: Uint8Array, w: Float64Array) => void, free?: (i: number) => boolean) => {
    const heights = new Uint8Array(N).fill(2), water = new Float64Array(N), moisture = new Float64Array(N);
    shape(heights, water);
    const startMask = new Uint8Array(N);
    box(startMask, W, START.x - 1, START.y - 1, START.x + 2, START.y + 2, 1);
    const startDist = distanceFrom(startMask, W, H);
    const g = { W, H, heights, water, moisture, soilContamination: new Float64Array(N), taken: new Uint8Array(N), entities: [] };
    const ok = Uint8Array.from(water, (d, i) => (d > 0 || (free && !free(i)) ? 0 : 1));
    const got: (string | undefined)[] = [];
    for (let seed = 1; seed <= 4; seed++) got.push(planFrameStand(g, { ...START, z }, ok, new Uint8Array(N), startDist, Float64Array.from(startDist), CLEAR, new Rng(seed))?.place);
    return got;
  };
  const plateau = (h: Uint8Array) => box(h, W, 70, 70, 100, 100, 4);
  // (a river across the view and a pond past it)
  const river = (_: Uint8Array, w: Float64Array) => {
    box(w, W, 0, 52, W, 58, 1);
    box(w, W, 70, 80, 80, 88, 1);
  };

  it("takes a step's foot before a rise", () => {
    expect(places(2, (h) => (plateau(h), box(h, W, 80, 80, 90, 90, 6)))).toEqual(["step", "step", "step", "step"]);
    expect(places(2, plateau)).toEqual(["rise", "rise", "rise", "rise"]);
  });

  it("takes a level's rim before the far side of the water, and the far side where no rim is left", () => {
    expect(places(9, river)).toEqual(["rim", "rim", "rim", "rim"]);
    expect(places(9, river, (i) => Math.floor(i / W) >= 59)).toEqual(["far", "far", "far", "far"]);
  });
});

describe("the map's other fields give back the stand's scrap", () => {
  const scrapOf = (t: readonly number[]) => 45 * t.length;
  const block = (x0: number, y0: number, w: number, h: number) => {
    const t: number[] = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) t.push(y * W + x);
    return t;
  };
  const onePiece = (tiles: readonly number[]) => {
    const set = new Set(tiles);
    const seen = new Set([tiles[0]]);
    const q = [tiles[0]];
    while (q.length) {
      const i = q.pop()!;
      for (const d of [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1])
        if (set.has(i + d) && !seen.has(i + d)) {
          seen.add(i + d);
          q.push(i + d);
        }
    }
    return seen.size === tiles.length;
  };

  it("the field farthest from the start first, each kept in one piece of 10 or more", () => {
    const near = block(70, 50, 5, 4), far = block(120, 140, 5, 4);
    const back = giveBackScrap([{ tiles: near, scrapOf }, { tiles: far, scrapOf }], 45 * 6, START, W);
    expect(back.given).toBe(45 * 6);
    expect(back.tiles[0]).toEqual(near);
    expect(back.tiles[1].length).toBe(14);
    expect(onePiece(back.tiles[1])).toBe(true);
    // a field gives down to 10 columns at most; the next gives the rest
    const more = giveBackScrap([{ tiles: near, scrapOf }, { tiles: far, scrapOf }], 45 * 13, START, W);
    expect(more.tiles[1].length).toBe(FRAME_STAND.fieldLeast);
    expect(more.tiles[0].length).toBe(17);
    expect(onePiece(more.tiles[0]) && onePiece(more.tiles[1])).toBe(true);
  });

  it("stops at the column that brings the scrap given back nearest the stand's", () => {
    expect(giveBackScrap([{ tiles: block(120, 140, 5, 4), scrapOf }], 45 * 2 + 20, START, W).given).toBe(90);
    expect(giveBackScrap([{ tiles: block(120, 140, 5, 4), scrapOf }], 45 * 2 + 25, START, W).given).toBe(135);
  });
});

describe("the stand in the map's resources (planResources)", () => {
  const S = 128, M = S * S;
  const ground = () => {
    const heights = new Uint8Array(M).fill(2), water = new Float64Array(M), moisture = new Float64Array(M);
    box(heights, S, 76, 84, 98, 104, 4);
    box(heights, S, 10, 10, 30, 30, 3);
    box(heights, S, 100, 20, 120, 40, 5);
    box(water, S, 60, 52, 68, 58, 1);
    box(water, S, 0, 110, S, 116, 1);
    for (let i = 0; i < M; i++) {
      const x = i % S, y = (i - x) / S;
      if (!water[i] && (Math.hypot(x - 64, y - 55) < 9 || Math.hypot(x - START.x, y - START.y) < 12 || (y > 104 && y < 122))) moisture[i] = 4;
    }
    return { W: S, H: S, heights, water, moisture, soilContamination: new Float64Array(M), occupied: new Uint8Array(M), start: { x: START.x, y: START.y }, entities: [] };
  };
  const spec = (seed: number) => makeSpec({ seed, size: { x: S, y: S }, theme: "riverValley", designedFor: "normal" });
  type Planned = ReturnType<typeof planResources>;
  const scrap = (fs: Planned) => fs.reduce((a, f) => a + (f.kind === "ruinField" ? f.params.scrapTarget : 0), 0);
  const stand = (fs: Planned) => fs.find((f) => f.kind === "ruinField" && f.role === "ruinField/firstView");

  it("keeps the map's scrap level, the stand's coming out of the other fields, and every other resource as it was", () => {
    for (const seed of [1, 2, 3]) {
      const off = planResources(spec(seed), ground(), 0, 0, { protect: null });
      const on = planResources(spec(seed), ground(), 0, 0, { protect: null, turn: "Cw0" });
      expect(stand(off)).toBeUndefined();
      expect(stand(on)).toBeDefined();
      // (within a column: 8 storeys of 15 scrap)
      expect(Math.abs(scrap(on) - scrap(off))).toBeLessThanOrEqual(120);
      expect(on.filter((f) => f.kind !== "ruinField")).toEqual(off.filter((f) => f.kind !== "ruinField"));
    }
  });

  it("keeps past the two-ways intention's reach where it is asked to (standBeyond)", () => {
    for (const seed of [1, 2]) {
      const f = stand(planResources(spec(seed), ground(), 0, 0, { protect: null, turn: "Cw0", standBeyond: 50 }));
      expect(f).toBeDefined();
      for (const i of runsToTiles((f as Extract<Planned[number], { kind: "ruinField" }>).params.area, S))
        expect(Math.hypot((i % S) - START.x, Math.floor(i / S) - START.y)).toBeGreaterThan(50);
    }
  });

  it("is not planned with Easy start, whose own field stands on the start's walk", () => {
    const easy = { safe: new Uint8Array(M).fill(1), bushes: 40, within: 15, ruins: 10 };
    expect(stand(planResources(spec(1), ground(), 0, 0, { protect: null, turn: "Cw0", easy }))).toBeUndefined();
  });
});
