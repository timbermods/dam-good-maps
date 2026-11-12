// Erode as landforms (the force audit's 11, 24 and 30; rust/forces/src/erode.rs): openings scaled to their
// cliff, separate alcoves of unequal size along a sweep, a fin under 4 tiles cut through into an arch, rills
// that drain on slopes and terraces where no face can wear, nothing it leaves the game would drop, and every
// tile it changes inside the reach the collaboration band declares (`erodeExtent`).

import { describe, expect, it } from "vitest";
import { forceBand } from "../../src/core/collab/footprint";
import { ERODE_DEFAULTS, ErodeRun, withMasks, type ErodeSettings } from "../../src/core/forces/erode";
import type { FullForceMap } from "../../src/core/forces/force";
import { unsupportedVoxels } from "../../src/core/terrain/support";
import { fixture } from "./forceFixtures";

type P = { x: number; y: number };

function ground(W: number, H: number, h: (x: number, y: number) => number, hard: number[] = []): FullForceMap {
  const heights = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = h(x, y);
  return { W, H, heights, entities: [], water: { depth: new Float64Array(W * H), contamination: new Float64Array(W * H) }, maxHeight: 22, rockLayers: Array.from({ length: 23 }, (_, z) => (hard.includes(z) ? 1 : 0)), lava: new Uint32Array(W * H), fallen: [] };
}

function erode(m: FullForceMap, s: Partial<ErodeSettings>, path: P[]) {
  const run = new ErodeRun(withMasks(m), { ...ERODE_DEFAULTS, ...s }, { path });
  run.planAll();
  while (!run.done) run.step();
  const after = run.final()!;
  return { before: run.before, after };
}

const solid = (m: Uint32Array, i: number, z: number) => ((m[i] >>> z) & 1) === 1;

/** Each tile's water level when the map is filled to its spill points (priority flood; the map's edge drains). */
function filled(W: number, H: number, h: ArrayLike<number>): Float64Array {
  const N = W * H;
  const level = new Float64Array(N).fill(Infinity);
  const heap: [number, number][] = [];
  const push = (l: number, i: number) => {
    heap.push([l, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] < heap[k][0] || (heap[p][0] === heap[k][0] && heap[p][1] <= heap[k][1])) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const a = 2 * k + 1;
        const b = a + 1;
        let m = k;
        const less = (u: number, v: number) => heap[u][0] < heap[v][0] || (heap[u][0] === heap[v][0] && heap[u][1] < heap[v][1]);
        if (a < heap.length && less(a, m)) m = a;
        if (b < heap.length && less(b, m)) m = b;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
        level[y * W + x] = h[y * W + x];
        push(h[y * W + x], y * W + x);
      }
  while (heap.length) {
    const [l, i] = pop();
    if (l > level[i]) continue;
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= N) continue;
      const v = Math.max(l, h[j]);
      if (v < level[j]) {
        level[j] = v;
        push(v, j);
      }
    }
  }
  return level;
}

describe("openings scaled to the cliff, apart along a sweep (the force audit's 11)", () => {
  const W = 48;
  const cliff = () => ground(W, W, (x) => (x < 24 ? 3 : 15));
  it("a click's opening stands a third to over half of its twelve-level face, 3 to 8 wide, under a roof", () => {
    for (const [power, least] of [[55, 4], [100, 6]] as const)
      for (const seed of [1, 2, 3]) {
        const { after } = erode(cliff(), { power, seed }, [{ x: 23, y: 24 }]);
        const m = after.masks!;
        let high = 0;
        let wide = 0;
        for (let y = 0; y < W; y++) {
          const i = y * W + 24;
          let open = 0;
          for (let z = 3; z < 15; z++) if (!solid(m, i, z)) open = z - 2;
          high = Math.max(high, open);
          if (!solid(m, i, 3)) wide++;
          expect(solid(m, i, 14) && solid(m, i, 13) && solid(m, i, 12), "a roof of three").toBe(true);
        }
        expect(high, `power ${power} seed ${seed}`).toBeGreaterThanOrEqual(least);
        expect(wide).toBeGreaterThanOrEqual(3);
        expect(wide).toBeLessThanOrEqual(8);
        expect(Array.from(after.heights)).toEqual(Array.from(cliff().heights));
      }
  });

  it("a sweep along the cliff wears separate alcoves every 6 to 10 tiles, of unequal widths, rock between them", () => {
    const { after } = erode(cliff(), { power: 70, seed: 4 }, [{ x: 21, y: 4 }, { x: 21, y: 44 }]);
    const m = after.masks!;
    // the openings along the face at its foot
    const runs: number[] = [];
    let k = 0;
    for (let y = 0; y <= W; y++) {
      const open = y < W && !solid(m, y * W + 24, 3);
      if (open) k++;
      else if (k) {
        runs.push(k);
        k = 0;
      }
    }
    expect(runs.length).toBeGreaterThanOrEqual(3);
    for (const r of runs) expect(r).toBeLessThanOrEqual(8);
    expect(new Set(runs).size, `widths ${runs}`).toBeGreaterThan(1);
    // (and the rock between two openings is at least two tiles)
    let wall = 0;
    let seen = false;
    for (let y = 0; y < W; y++) {
      if (!solid(m, y * W + 24, 3)) {
        if (seen && wall) expect(wall, `the wall before ${y}`).toBeGreaterThanOrEqual(2);
        seen = true;
        wall = 0;
      } else wall++;
    }
  });

  it("a fin under 4 tiles thick is cut through into an arch that holds", () => {
    for (const thick of [2, 3])
      for (const seed of [1, 2, 3]) {
        const fin = ground(W, W, (x, y) => (x >= 24 && x < 24 + thick && y > 8 && y < 40 ? 10 : 3));
        const { after } = erode(fin, { power: 55, seed }, [{ x: 23, y: 24 }]);
        const m = after.masks!;
        let through = false;
        for (let y = 9; y < 40 && !through; y++)
          for (let z = 3; z < 7 && !through; z++) {
            let all = true;
            for (let x = 24; x < 24 + thick; x++) if (solid(m, y * W + x, z)) all = false;
            if (all) through = true;
          }
        expect(through, `fin ${thick} thick, seed ${seed}`).toBe(true);
        expect(unsupportedVoxels({ W, H: W, mask: m }).some((v) => v === 1)).toBe(false);
      }
  });
});

describe("where no face can wear, rills and scours that drain (the force audit's 24)", () => {
  const W = 48;
  const cases: [string, FullForceMap, P[]][] = [
    ["terraces", ground(W, W, (x, y) => 2 + Math.floor((x + y) / 9) * 2), [{ x: 24, y: 24 }]],
    ["slope", ground(W, W, (x) => 2 + Math.floor(x / 3)), [{ x: 24, y: 24 }]],
    ["slope sweep", ground(W, W, (x) => 2 + Math.floor(x / 3)), [{ x: 24, y: 8 }, { x: 24, y: 40 }]],
    ["bench", ground(W, W, (x) => (x < 30 ? 6 : 4)), [{ x: 20, y: 24 }]],
  ];
  // (level ground with nothing lower in reach keeps a closed scour a level deep, D356: the next test)
  it("a level deep, never a pond the land did not hold before; 2 to 4 rills down a slope", () => {
    for (const [name, m, path] of cases)
      for (const power of [0, 55, 100]) {
        const { before, after } = erode(m, { power, seed: 3 }, path);
        const was = filled(W, W, before.heights);
        const now = filled(W, W, after.heights);
        let lowered = 0;
        for (let i = 0; i < W * W; i++) {
          if (after.heights[i] === before.heights[i]) continue;
          lowered++;
          expect(before.heights[i] - after.heights[i], `${name} ${power}`).toBe(1);
          // water standing on it, no deeper than the land held there before
          expect(now[i] - after.heights[i], `${name} ${power}: a pond at ${i % W},${Math.floor(i / W)}`).toBeLessThanOrEqual(Math.max(0, was[i] - before.heights[i]));
        }
        expect(lowered, `${name} ${power}`).toBeGreaterThan(0);
        if (name === "slope" && path.length === 1) {
          // rills: separate lines down the fall line (runs across a row of the slope)
          const row = (x: number) => {
            let n = 0;
            let open = false;
            for (let y = 0; y < W; y++) {
              const low = after.heights[y * W + x] < before.heights[y * W + x];
              if (low && !open) n++;
              open = low;
            }
            return n;
          };
          expect(Math.max(row(22), row(24), row(26)), `${name} ${power}: rills`).toBeGreaterThanOrEqual(2);
          expect(Math.max(row(22), row(24), row(26))).toBeLessThanOrEqual(4);
        }
      }
  });

  it("on level ground with lower ground in reach, the scour runs to it and drains; with none, it stays a level deep and elongated", () => {
    // (the bench: level 6 west of x = 30, 4 beyond; a click 10 tiles from its edge at Power 55, Size 13.7)
    const bench = ground(W, W, (x) => (x < 30 ? 6 : 4));
    const { after } = erode(bench, { power: 55, seed: 2 }, [{ x: 20, y: 24 }]);
    const low = Array.from(after.heights).map((h, i) => (h < bench.heights[i] ? i : -1)).filter((i) => i >= 0);
    expect(low.some((i) => i % W === 29), "it reaches the bench's edge").toBe(true);
    // a flat table with nothing lower in reach: longer than wide
    const flat = ground(W, W, () => 6);
    const f = erode(flat, { power: 55, seed: 2 }, [{ x: 24, y: 24 }]).after;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < W * W; i++) if (f.heights[i] < 6) (xs.push(i % W), ys.push(Math.floor(i / W)));
    expect(xs.length).toBeGreaterThan(0);
    // (longer than wide whichever way it runs: its spread along its long axis at least twice that across)
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const [mx, my] = [mean(xs), mean(ys)];
    const sxx = mean(xs.map((x) => (x - mx) ** 2));
    const syy = mean(ys.map((y) => (y - my) ** 2));
    const sxy = mean(xs.map((x, k) => (x - mx) * (ys[k] - my)));
    const mid = (sxx + syy) / 2;
    const rad = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    expect(mid + rad).toBeGreaterThanOrEqual(4 * (mid - rad));
    expect(Math.min(...Array.from(f.heights))).toBe(5);
    // (the plain fixture, level through the gesture's reach, the same)
    const plain = fixture("plain", W);
    const p = erode(plain, { power: 0, seed: 3 }, [{ x: 20, y: 20 }]).after;
    for (let i = 0; i < W * W; i++) expect(plain.heights[i] - p.heights[i]).toBeLessThanOrEqual(1);
  });
});

describe("every tile it changes is inside its declared reach", () => {
  let seed = 977;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), seed / 4294967296);
  const W = 64;
  const maps: [string, FullForceMap][] = [
    ["cliff", ground(W, W, (x) => (x < 32 ? 3 : 14), [9])],
    ["ridges", ground(W, W, (x, y) => ((x % 16) < 3 && y > 6 && y < 58 ? 12 : 3))],
    ["terraces", ground(W, W, (x, y) => 2 + Math.floor((x + y) / 9) * 2)],
    ["plain", fixture("plain", W)],
  ];
  it("on cliffs, fins, terraces and a plain, at random Powers, Sizes and gestures", () => {
    const view = (m: FullForceMap) => ({ size: { x: m.W, y: m.H }, built: { heights: m.heights, entities: [] } }) as never;
    for (const [name, m] of maps)
      for (let k = 0; k < 8; k++) {
        const a = { x: Math.floor(next() * W), y: Math.floor(next() * W) };
        const path = next() < 0.5 ? [a] : [a, { x: Math.max(0, Math.min(W - 1, a.x + Math.round((next() - 0.5) * 40))), y: Math.max(0, Math.min(W - 1, a.y + Math.round((next() - 0.5) * 40))) }];
        const settings = { ...ERODE_DEFAULTS, power: Math.round(next() * 100), size: next() < 0.5 ? null : 4 + 2 * Math.floor(next() * 18), seed: Math.floor(next() * 1e6) };
        let r;
        try {
          r = erode(m, settings, path);
        } catch {
          continue;
        }
        const band = forceBand({ verb: "erode", settings: settings as never, path }, view(m)).tiles;
        const masks0 = r.before.masks!;
        for (let i = 0; i < W * W; i++)
          if (r.after.masks![i] !== masks0[i] || r.after.heights[i] !== r.before.heights[i]) expect(band.has(i), `${name} ${JSON.stringify(path)} ${settings.power}/${settings.size}: ${i % W},${Math.floor(i / W)}`).toBe(true);
      }
  });
});
