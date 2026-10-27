// Naturalize weathers what the player paints (PLAN §20 D368 (8); D356: a tool always has a visible
// effect where it is used). It leaves only what must not change for the map to stay correct: the start's
// pad, and the ground under water sources and objects. A force's result, a Raise stroke (exact since
// item 37), a river and a set piece are all fair game.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { planEntity } from "../../src/core/doc/placing";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import type { ForceResultParams } from "../../src/core/forces/op";
import { inBench } from "../../src/core/features/raster/terrain";
import type { BrushParams } from "../../src/core/features/raster/brush";
import { groundUnderObjects } from "../../src/core/features/raster/objectGround";
import { tilesToRuns } from "../../src/core/math/grid";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 96;
const PLANT = /^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Succulent|BlueberryBush|Slope|RuinColumnH\d+)$/;

// (seed 1 on M9b's maps, D148: seed 3 has no 19 × 19 stretch of dry, open ground below level 12 away from the start; the best has 16 bad tiles;
// seed 11 for 0.8.1's maps, D148: badwater ditches now follow the land and seed 1's best spot has 49 bad tiles; seed 7 has an open spot, but it straddles a four-level terrace edge, so the Raise cliff's tallest step is the terrace's)
function session(seed = 11): MapSession {
  const r = generate(makeSpec({ seed, theme: "riverValley", size: { x: W, y: W } }));
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  return s;
}

/** A spot far from the start with dry open ground (no objects but plants, no water) for a cliff of
 *  radius 4 and the weathering round it (radius 8). */
function openSpot(s: MapSession): [number, number] {
  const b = s.built;
  const st = b.start!;
  const busy = new Uint8Array(W * W);
  for (const e of b.entities) {
    if (PLANT.test(e.template) || e.template === "StartingLocation") continue;
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
      const x = e.x + dx;
      const y = e.y + dy;
      if (x >= 0 && y >= 0 && x < W && y < W) busy[y * W + x] = 1;
    }
  }
  let best: [number, number] = [0, 0];
  let bestBad = Infinity;
  for (let y = 12; y < W - 12; y++)
    for (let x = 12; x < W - 12; x++) {
      if (Math.hypot(x - st.x, y - st.y) < 20) continue;
      let bad = 0;
      for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
        const i = (y + dy) * W + x + dx;
        if (b.water[i] > 0 || b.channel[i] || busy[i] || b.heights[i] > 11) bad++;
      }
      if (bad < bestBad) {
        bestBad = bad;
        best = [x, y];
      }
    }
  if (bestBad > 0) throw new Error(`no open spot, the best has ${bestBad} bad tiles`);
  return best;
}

const disc = (cx: number, cy: number, r: number): number[] => {
  const out: number[] = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out.push(y * W + x);
  return out.sort((a, b) => a - b);
};

/** A Quake Lift's result as the build keeps it: a block of ground lifted by `up` levels. */
function liftOp(s: MapSession, tiles: number[], up: number): EditOp {
  const h = s.built.heights;
  const params: ForceResultParams = {
    version: 1,
    verb: "quake",
    settings: { ...QUAKE_DEFAULTS, mode: "lift" } as ForceResultParams["settings"],
    where: { path: [[10, 10], [20, 10]], side: 1 },
    steps: 1,
    reason: "done",
    tiles,
    heights: tiles.map((i) => Math.min(16, h[i] + up)),
    removed: [],
  };
  return { op: "forceResult", params };
}

/** A Naturalize stroke pressing on (cx, cy) again and again, so it weathers all it can. */
function weather(cx: number, cy: number, size = 8): BrushParams {
  const dabs: number[] = [];
  for (let k = 0; k < 60; k++) dabs.push(4 * cx + 2, 4 * cy + 2);
  return { tool: "naturalize", size, strength: 10, seed: 12345, weathers: true, dabs };
}

/** How much Naturalize eased the cliff: the tallest step between neighbours in the area before and
 *  after, and the tiles inside the cliff that came down. */
function eased(before: Uint8Array, after: Uint8Array, cx: number, cy: number) {
  const area = disc(cx, cy, 8);
  const inside = new Set(disc(cx, cy, 4));
  let stepBefore = 0;
  let stepAfter = 0;
  for (const i of area) for (const j of [i + 1, i + W]) {
    stepBefore = Math.max(stepBefore, Math.abs(before[i] - before[j]));
    stepAfter = Math.max(stepAfter, Math.abs(after[i] - after[j]));
  }
  let lowered = 0;
  for (const i of inside) if (after[i] < before[i]) lowered++;
  let changed = 0;
  for (const i of area) if (after[i] !== before[i]) changed++;
  return { stepBefore, stepAfter, lowered, changed };
}

describe("Naturalize weathers a cliff the player made (D368 (8))", () => {
  it("a cliff a force lifted (Quake Lift) is worn into a slope", () => {
    const s = session();
    const [cx, cy] = openSpot(s);
    expect(s.apply(liftOp(s, disc(cx, cy, 4), 5), "user").errors).toEqual([]);
    const before = s.built.heights.slice();
    expect(s.apply({ op: "brush", params: weather(cx, cy) }, "user", "Naturalize").errors).toEqual([]);
    const e = eased(before, s.built.heights, cx, cy);
    expect(e.stepBefore).toBeGreaterThanOrEqual(5);
    expect(e.stepAfter, "the tallest step across the cliff came down").toBeLessThan(e.stepBefore);
    expect(e.lowered, "the lifted ground itself weathered, not only its foot").toBeGreaterThanOrEqual(8);
    expect(e.changed).toBeGreaterThanOrEqual(30);
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
  });

  it("a cliff a Raise stroke made (exact) is worn into a slope", () => {
    const s = session();
    const [cx, cy] = openSpot(s);
    const top = s.built.heights[cy * W + cx] + 5;
    const raise: BrushParams = { tool: "raise", size: 4, strength: 5, target: top, dabs: [4 * cx + 2, 4 * cy + 2] };
    expect(s.apply({ op: "brush", params: raise }, "user", "Raise").errors).toEqual([]);
    const before = s.built.heights.slice();
    expect(s.apply({ op: "brush", params: weather(cx, cy) }, "user", "Naturalize").errors).toEqual([]);
    const e = eased(before, s.built.heights, cx, cy);
    expect(e.stepBefore).toBeGreaterThanOrEqual(5);
    expect(e.stepAfter).toBeLessThan(e.stepBefore);
    expect(e.lowered).toBeGreaterThanOrEqual(8);
    expect(e.changed).toBeGreaterThanOrEqual(30);
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
  });
});

describe("a Naturalize stroke saved before D368 replays as it did", () => {
  it("without `weathers` it leaves a force's ground as it is", () => {
    const s = session();
    const [cx, cy] = openSpot(s);
    const lifted = disc(cx, cy, 4);
    expect(s.apply(liftOp(s, lifted, 5), "user").errors).toEqual([]);
    const before = s.built.heights.slice();
    const { weathers: _w, ...old } = weather(cx, cy);
    expect(s.apply({ op: "brush", params: old }, "user", "Naturalize").errors).toEqual([]);
    for (const i of lifted) expect(s.built.heights[i]).toBe(before[i]);
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
  });
});

describe("Naturalize still leaves what must not change (D368 (8))", () => {
  it("the start's pad stays as it is, with a wall built against it", () => {
    const s = session();
    const st = s.features.find((f) => f.kind === "start")!;
    if (st.kind !== "start") throw new Error("no start");
    const [px, py] = st.params.position;
    const r = st.params.benchRadius;
    const pad = disc(Math.round(px), Math.round(py), Math.ceil(r) + 1).filter((i) => inBench(st, i % W, Math.floor(i / W)));
    expect(pad.length).toBeGreaterThan(10);
    // a wall just east of the pad, and a stroke that presses on both
    const wallCx = Math.round(px) + Math.ceil(r) + 3;
    const wall = disc(wallCx, Math.round(py), 2).filter((i) => !inBench(st, i % W, Math.floor(i / W)));
    expect(s.apply(liftOp(s, wall, 5), "user").errors).toEqual([]);
    const before = s.built.heights.slice();
    expect(s.apply({ op: "brush", params: weather(Math.round(px) + Math.ceil(r), Math.round(py), 6) }, "user", "Naturalize").errors).toEqual([]);
    for (const i of pad) expect(s.built.heights[i], `pad tile (${i % W}, ${Math.floor(i / W)})`).toBe(before[i]);
    // and it did weather the wall beside it
    expect(wall.some((i) => s.built.heights[i] !== before[i])).toBe(true);
  });

  it("the ground under a water source and under an object stays as it is with no keep runs given, with a wall built against each", () => {
    const s = session();
    const [cx, cy] = openSpot(s);
    // a water source and a geothermal field on open ground, then walls lifted beside them
    const src: { id: string; template: string; x: number; y: number; components?: Record<string, unknown> } = { id: "11111111-2222-4333-8444-555555555551", template: "WaterSource", x: cx - 2, y: cy, components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } };
    const geo: typeof src = { id: "11111111-2222-4333-8444-555555555552", template: "GeothermalField", x: cx + 2, y: cy + 5 };
    for (const o of [src, geo]) {
      const plan = planEntity(s, { template: o.template, x: o.x, y: o.y, orientation: "Cw0", ...(o.components ? { components: o.components } : {}) }, o.id);
      if (!plan.ok) throw new Error(plan.errors.join("; "));
      for (const op of plan.ops) expect(s.apply(op, "user").errors).toEqual([]);
    }
    const objects = s.built.entities.filter((e) => e.id === src.id || e.id === geo.id);
    expect(objects.length).toBe(2);
    const keep = groundUnderObjects(objects);
    const kept = new Set<number>();
    for (const [y, a, b] of keep) for (let x = a; x <= b; x++) kept.add(y * W + x);
    expect(kept.size).toBeGreaterThanOrEqual(2);
    expect(kept.has(cy * W + cx - 2), "the source's tile").toBe(true);
    expect(kept.has((cy + 5) * W + cx + 2), "the object's tile").toBe(true);
    // a wall beside each, outside what they stand on
    const wall = [...disc(cx - 5, cy, 2), ...disc(cx + 5, cy + 5, 2)].filter((i) => !kept.has(i));
    expect(s.apply(liftOp(s, wall, 5), "user").errors).toEqual([]);
    const before = s.built.heights.slice();
    // a headless stroke with no keep runs: the core works out the ground under them itself (D342)
    const stroke = weather(cx, cy + 2, 9);
    expect(stroke.keep).toBeUndefined();
    const u = s.apply({ op: "brush", params: stroke }, "user", "Naturalize");
    expect(u.errors).toEqual([]);
    expect(u.applied[0].params).toMatchObject({ keep: expect.any(Array) });
    for (const i of kept) expect(s.built.heights[i], `kept tile (${i % W}, ${Math.floor(i / W)})`).toBe(before[i]);
    // the same stroke without them kept does weather that ground (they are in reach)
    expect(wall.some((i) => s.built.heights[i] !== before[i])).toBe(true);
    expect(tilesToRuns([...kept].sort((a, b) => a - b), W)).toEqual(keep);
    // it replays the same: the project reopens to the map, and undo and redo agree
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    const done = s.built.heights.slice();
    s.undo();
    s.redo();
    expect(Array.from(s.built.heights)).toEqual(Array.from(done));
  });

  it("trees, bushes and slopes are not objects whose ground it keeps", () => {
    const s = session();
    const plants = s.built.entities.filter((e) => PLANT.test(e.template));
    expect(plants.length).toBeGreaterThan(0);
    expect(groundUnderObjects(plants)).toEqual([]);
  });
});
