// The poisoned floodplain's stage 2, the land (docs/design/poisoned-floodplain.md §1, §3, §7, §9 row 2): a land at 128²
// holding every land invariant and the start, its gulch found in the relief and mended by taking ground away only within
// its budget, the same land for the same seed, and a hand-broken land for every land invariant. The six of the sheet
// (seeds 1 and 2 at each size) are premisePlainLand.heavy.test.ts.

import { describe, expect, it } from "vitest";
import { combOf, MEND, nearOnLine, PLAIN_LAND_CHECKS, plainLand, plainLandFailures, type PlainLand, type PlainLandContext, type SideValley } from "../../src/core/premise/plainLand";
import { FAR_OVER, lineAt, onMap, plainOf, toLocal, turnOf } from "../../src/core/premise/premises/poisonedPlain";
import type { Point } from "../../src/core/premise/types";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";

const spec = (seed: number, side: number): MapSpec => makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });

const landOf = (s: MapSpec): PlainLand & { held: boolean } => {
  const r = plainLand(s);
  if ("reason" in r) throw new Error(r.reason);
  return r;
};

// (seed 5 at 128², the map of the quick water and works tests, which step 5 moved off seed 2: its map now holds on its
// third attempt)
const s = spec(5, 128);
const good = landOf(s);

describe("The poisoned floodplain's land", () => {
  it("holds every land invariant and the start, its gulch found in the relief and mended within 4 % of the map", () => {
    expect(good.landFails).toEqual([]);
    expect(good.frame.reason).toBeNull();
    expect(good.held).toBe(true);
    const p = plainOf(good.plan)!;
    expect(p.found).toBeDefined();
    expect(good.found.changed).toBeLessThanOrEqual(MEND.share * 128 * 128);
    expect(p.gulch.mouth).toBe(Math.round(good.found.valley.mouth * 100) / 100);
  });

  it("is the same land for the same seed", () => {
    expect(Buffer.from(landOf(s).heights).equals(Buffer.from(good.heights))).toBe(true);
  });
});

describe("Broken poisoned-floodplain lands fail their invariants", () => {
  const ctxOf = (l: PlainLand = good): PlainLandContext => ({ spec: s, plan: JSON.parse(JSON.stringify(l.plan)), water: l.water, heights: l.heights.slice(), relief: { ...l.relief, floor: l.relief.floor.slice() } });
  const fails = (c: PlainLandContext) => plainLandFailures(c).map((f) => f.id);
  const W = good.plan.W;
  const tile = (i: number): [number, number] => [i % W, Math.floor(i / W)];

  const broken: [id: string, what: string, breakIt: (c: PlainLandContext) => void][] = [
    ["gulch.found", "the narrows dug out to the gulch's floor six wide", (c) => {
      const n = good.found.narrows;
      const sv = good.found.valley;
      const T = turnOf(c.plan, plainOf(c.plan)!);
      for (let i = 0; i < c.heights.length; i++) {
        const [u, v] = toLocal(T, [tile(i)[0] + 0.5, tile(i)[1] + 0.5]);
        const q = sv.line[Math.round(n.s)];
        if (Math.hypot(u - q[0], v - q[1]) <= 3.2) c.heights[i] = Math.min(c.heights[i], n.floor);
      }
    }],
    ["col.over", "the way up to the col, the col and the Dry Fork cut to a level over the narrows' floor", (c) => {
      for (const i of [...good.found.into, ...good.found.way]) c.heights[i] = Math.min(c.heights[i], good.found.narrows.floor + 1);
    }],
    ["fork.own", "a trench from the Dry Fork's first point onto the valley's floor", (c) => {
      // (the nearest floor tile, and a bed falling from where `fork.own` pours to it, under the Dry Fork's bed)
      const q = plainOf(c.plan)!.fork.path[1];
      const pour = Math.floor(q[1]) * W + Math.floor(q[0]);
      const [cx, cy] = tile(pour);
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < c.heights.length; i++)
        if (c.relief.floor[i] === 1 || c.relief.floor[i] === 2) {
          const d = Math.hypot(tile(i)[0] - cx, tile(i)[1] - cy);
          if (d < bd) [best, bd] = [i, d];
        }
      const [fx, fy] = tile(best);
      const top = c.heights[pour] - 2;
      const n = Math.ceil(bd * 2);
      for (let k = 0; k <= n; k++) {
        const x = Math.round(cx + ((fx - cx) * k) / n);
        const y = Math.round(cy + ((fy - cy) * k) / n);
        const z = Math.round(top + ((c.heights[best] - top) * k) / n);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
          const j = (y + dy) * W + x + dx;
          if (j >= 0 && j < c.heights.length) c.heights[j] = Math.min(c.heights[j], z);
        }
      }
    }],
    ["levee.wanders", "a bank's foot ruled along a row of the plain for 12 tiles", (c) => {
      // (the first 12 tiles of a row of dry plain with dry plain under them: a bank a level over them, its foot a
      // straight edge along the row)
      const r = c.water.raster;
      const dry = (i: number) => c.relief.floor[i] === 1 && !r.channel[i] && !r.lake[i] && !r.pool[i] && !c.relief.bank[i];
      const bank = c.relief.bank.slice();
      outer: for (let y = 0; y + 1 < c.plan.H; y++)
        for (let x = 0; x + 12 <= W; x++) {
          const run = Array.from({ length: 12 }, (_, k) => y * W + x + k);
          if (!run.every((i) => dry(i) && dry(i + W) && c.heights[i] === c.heights[i + W])) continue;
          for (const i of run) {
            bank[i] = 1;
            c.heights[i] += 1;
          }
          break outer;
        }
      c.relief = { ...c.relief, bank };
    }],
    ["plain.bands", "the red water clean (nothing red on the land)", (c) => {
      for (const l of c.plan.links) if (l.id === "red" || l.id === "redFall") l.id = `${l.id}Clean`;
      for (const b of c.plan.bodies) if (b.id === "redPool" || b.id === "redSpring") b.id = `${b.id}Clean`;
    }],
    ["wall.wanders", "the far wall's foot on the ground ruled from the terrace's head to the plain's foot", (c) => {
      const p = plainOf(c.plan)!;
      const T = turnOf(c.plan, p);
      // (over the stretch where the foot stands on the map, so the ruled foot is on the ground its whole length)
      let [a, b] = [Infinity, -Infinity];
      for (let u = Math.ceil(p.terrace[0]); u <= p.plainTo; u++)
        if (onMap(T, [u, lineAt(p.far, p.step, u)], 3)) [a, b] = [Math.min(a, u), Math.max(b, u)];
      const [va, vb] = [lineAt(p.far, p.step, a), lineAt(p.far, p.step, b)];
      for (let i = 0; i < c.heights.length; i++) {
        const [u, v] = toLocal(T, [tile(i)[0] + 0.5, tile(i)[1] + 0.5]);
        if (u < a || u > b || v < lineAt(p.near, p.step, u)) continue;
        const ruled = va + ((vb - va) * (u - a)) / (b - a);
        c.relief.floor[i] = v <= ruled ? 1 : 0;
      }
    }],
    ["wall.height", "the far wall shaved to 4 over the plain's head", (c) => {
      const p = plainOf(c.plan)!;
      const T = turnOf(c.plan, p);
      for (let i = 0; i < c.heights.length; i++) {
        const [u, v] = toLocal(T, [tile(i)[0] + 0.5, tile(i)[1] + 0.5]);
        if (!c.relief.floor[i] && v > lineAt(p.far, p.step, u)) c.heights[i] = Math.min(c.heights[i], p.L + FAR_OVER - 4);
      }
    }],
    ["fall.drop", "the gulch's mouth cut down to 3 over the backswamp", (c) => {
      const p = plainOf(c.plan)!;
      const T = turnOf(c.plan, p);
      const sv = good.found.valley;
      for (let i = 0; i < c.heights.length; i++) {
        if (c.relief.floor[i]) continue;
        const [u, v] = toLocal(T, [tile(i)[0] + 0.5, tile(i)[1] + 0.5]);
        const q = nearOnLine(sv.line, u, v);
        if (q.s <= 5 && q.d <= 3) c.heights[i] = Math.min(c.heights[i], sv.foot + 3);
      }
    }],
    ["terrain.ruled_land", "the far wall's side valleys a comb: evenly spaced, parallel, alike", (c) => {
      // (eight straight grooves 18 tiles apart, each 22 long at 20° off the wall's normal, 2.5 half-wide)
      const p = plainOf(c.plan)!;
      const comb: SideValley[] = [];
      for (let k = 0; k < 8; k++) {
        const a = p.terrace[0] + 10 + 18 * k;
        const v0 = lineAt(p.far, p.step, a);
        const line: Point[] = Array.from({ length: 23 }, (_, s) => [a + s * Math.sin(0.35), v0 + s * Math.cos(0.35)]);
        comb.push({ wall: "far", foot: p.L - 1, mouth: a, line, hang: 6, rise: 1, half: line.map(() => 2.5), pinch: -1, kind: "valley", box: [a - 14, v0 - 14, a + 22, v0 + 36] });
      }
      expect(combOf(c.plan, comb).why).toMatch(/evenly spaced|alike/);
      c.relief = { ...c.relief, valleys: [...comb, ...c.relief.valleys.filter((v) => v.wall === "near")] };
    }],
    ["terrain.ruled_land", "the ground laid in straight terraces", (c) => {
      for (let i = 0; i < c.heights.length; i++) c.heights[i] = 4 + Math.floor(tile(i)[1] / 6);
    }],
  ];

  it("draws its side valleys no comb", () => {
    for (const wall of ["far", "near"] as const) expect(combOf(good.plan, good.relief.valleys, wall).why).toBeNull();
  });

  it("has a broken land for every land invariant", () => {
    expect([...new Set(broken.map(([id]) => id))].sort()).toEqual(PLAIN_LAND_CHECKS.map((inv) => inv.id).sort());
  });

  for (const [id, what, breakIt] of broken)
    it(`${id}: ${what}`, () => {
      expect(fails(ctxOf())).toEqual([]);
      const c = ctxOf();
      breakIt(c);
      expect(fails(c)).toContain(id);
    });
});
