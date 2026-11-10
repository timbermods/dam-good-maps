// Roll (rust/forces/src/roll.rs, core/forces/roll.ts): the land under the gesture rolls in one-level steps.
// A cliff grades into a walkable flank, a tabletop breaks into swells; water and the ground beside it stay; a
// click anywhere on dry ground moves something at Power 0 (D356); the Floor and kept ground hold; it adds no
// object; and as an operation it validates, keeps its last frame, undoes and reopens (D342, D444; its bytes in
// every engine are tools/rust/forces-jobs.ts').
import { describe, expect, test } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import type { FullForceMap } from "../../src/core/forces/force";
import { keptForceParams } from "../../src/core/forces/keep";
import { forceProblems } from "../../src/core/forces/op";
import { forceParamsOf } from "../../src/core/forces/result";
import { ROLL_DEFAULTS, RollRun, type RollSettings } from "../../src/core/forces/roll";
import { executeInRust, jobBytes, planInRust } from "../../src/core/forces/rust/bridge";
import { decode } from "../../src/core/forces/rust/protocol";
import { planForce } from "../../src/core/forces/start";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { fixture } from "./forceFixtures";

type P = { x: number; y: number };

/** A hand-made map: heights from `h`, dry, no objects. */
function ground(W: number, h: (x: number, y: number) => number): FullForceMap {
  const heights = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) heights[y * W + x] = h(x, y);
  return { W, H: W, heights, entities: [], water: { depth: new Float64Array(W * W), contamination: new Float64Array(W * W) }, maxHeight: 22, rockLayers: Array.from({ length: 23 }, () => 0), lava: new Uint32Array(W * W), fallen: [] };
}

const roll = (m: FullForceMap, s: Partial<RollSettings>, path: P[], keep: Uint8Array | null = null) => new RollRun(m, { ...ROLL_DEFAULTS, ...s }, { path }, keep).finishAll();

/** The largest height step between 4-neighbours whose tiles both pass `inside`. */
function steepest(m: FullForceMap, inside: (x: number, y: number) => boolean): number {
  let worst = 0;
  for (let y = 0; y < m.H; y++)
    for (let x = 0; x < m.W; x++) {
      if (!inside(x, y)) continue;
      const i = y * m.W + x;
      if (x + 1 < m.W && inside(x + 1, y)) worst = Math.max(worst, Math.abs(m.heights[i] - m.heights[i + 1]));
      if (y + 1 < m.H && inside(x, y + 1)) worst = Math.max(worst, Math.abs(m.heights[i] - m.heights[i + m.W]));
    }
  return worst;
}

describe("the land rolls in one-level steps", () => {
  test("a cliff nine levels tall grades into a walkable flank along the stroke, its top slumping as its foot builds out", () => {
    for (const power of [0, 50, 100]) {
      const m = ground(48, (x) => (x < 24 ? 3 : 12));
      const r = roll(m, { power, seed: 3 }, [{ x: 23.5, y: 6 }, { x: 23.5, y: 42 }]);
      // (the band's inner two thirds, away from the stroke's ends)
      const reach = (14 + 0.3 * power) / 2;
      expect(steepest(r.map, (x, y) => Math.abs(x - 23.5) < reach * 0.6 && y > 10 && y < 38), `power ${power}`).toBe(1);
      expect(r.plan0.stats.graded, `power ${power}`).toBeGreaterThan(20);
      expect(r.plan0.stats.raised).toBeGreaterThan(0);
      expect(r.plan0.stats.lowered).toBeGreaterThan(0);
      // far from the stroke the land is as it was
      expect(r.map.heights[24 * 48 + 2]).toBe(3);
      expect(r.map.heights[24 * 48 + 46]).toBe(12);
    }
  });

  test("a tabletop four levels over the plain breaks into graded swells", () => {
    const m = ground(48, (x, y) => (Math.hypot(x - 24, y - 24) < 10 ? 10 : 6));
    const r = roll(m, { power: 100, seed: 5 }, [{ x: 24, y: 24 }]);
    expect(r.plan0.stats.changed).toBeGreaterThan(150);
    expect(r.plan0.stats.graded).toBeGreaterThan(20);
    expect(steepest(r.map, (x, y) => Math.hypot(x - 24, y - 24) < 9)).toBeLessThanOrEqual(1);
    // the top no longer one level
    const top = new Set<number>();
    for (let y = 18; y <= 30; y++) for (let x = 18; x <= 30; x++) top.add(r.map.heights[y * 48 + x]);
    expect(top.size).toBeGreaterThan(1);
  });

  test("Try another changes the swells; the same seed rolls the same", () => {
    const m = ground(48, () => 8);
    const a = roll(m, { power: 60, seed: 5 }, [{ x: 24, y: 24 }]).map.heights;
    const b = roll(m, { power: 60, seed: 6 }, [{ x: 24, y: 24 }]).map.heights;
    expect(b).not.toEqual(a);
    expect(roll(m, { power: 60, seed: 5 }, [{ x: 24, y: 24 }]).map.heights).toEqual(a);
  });
});

describe("what it leaves as it was", () => {
  test("at Power 0, a click anywhere on dry ground moves it, at the smallest and largest Size, and adds no object", () => {
    for (const kind of ["plain", "river", "slide", "lake"] as const)
      for (const p of [{ x: 0, y: 0 }, { x: 63, y: 63 }, { x: 32, y: 32 }, { x: 10, y: 12 }, { x: 20, y: 50 }])
        for (const size of [8, 64]) {
          const m = fixture(kind, 64);
          let r: RollRun;
          try {
            r = roll(m, { power: 0, size, seed: 11 }, [p]);
          } catch (e) {
            // (water and its banks only: it says why)
            expect((e as Error).message, `${kind} ${p.x},${p.y} size ${size}`).toBe("Roll leaves water and the ground beside it as they are");
            continue;
          }
          expect(r.plan0.stats.changed, `${kind} ${p.x},${p.y} size ${size}`).toBeGreaterThan(0);
          expect(r.map.entities.map((e) => e.id)).toEqual(m.entities.map((e) => e.id));
          expect(r.map.water).toEqual(m.water);
        }
  });

  test("water and the ground beside it stay as they are", () => {
    for (const kind of ["river", "lake"] as const)
      for (const power of [0, 100]) {
        const m = fixture(kind, 64);
        const r = roll(m, { power, size: 64, seed: 2 }, [{ x: 10, y: 40 }, { x: 54, y: 40 }]);
        expect(r.plan0.stats.changed).toBeGreaterThan(0);
        const W = 64;
        for (let i = 0; i < W * W; i++) {
          const near = [i, i - 1, i + 1, i - W, i + W].some((j) => j >= 0 && j < W * W && m.water.depth[j] > 0.02);
          if (near) expect(r.map.heights[i], `${kind} ${i % W},${Math.floor(i / W)}`).toBe(m.heights[i]);
        }
      }
  });

  test("the Floor and kept ground hold; objects ride their ground", () => {
    const m = fixture("river", 64);
    const keep = new Uint8Array(64 * 64);
    keep[30 * 64 + 20] = 1;
    const r = roll(m, { power: 100, size: 64, floor: 9, seed: 4 }, [{ x: 8, y: 30 }, { x: 30, y: 30 }], keep);
    expect(r.plan0.stats.changed).toBeGreaterThan(0);
    expect(r.map.heights.every((h, i) => h >= Math.min(m.heights[i], 9))).toBe(true);
    expect(r.map.heights[30 * 64 + 20]).toBe(m.heights[30 * 64 + 20]);
    for (const e of r.map.entities) {
      const b = m.entities.find((b) => b.id === e.id)!;
      expect(b).toBeDefined();
      expect([e.x, e.y]).toEqual([b.x, b.y]);
      expect(e.z - b.z).toBe(r.map.heights[e.y * 64 + e.x] - m.heights[b.y * 64 + b.x]);
    }
  });
});

describe("Roll as an operation (D342)", () => {
  const path = [{ x: 12, y: 30 }, { x: 32, y: 33 }, { x: 52, y: 29 }];
  const stepped = () => ground(64, (x) => 6 + 3 * Math.floor(x / 16));

  test("no end pop; the typed boundary and the packed result agree; its record validates", () => {
    const m = stepped();
    const r = new RollRun(m, ROLL_DEFAULTS, { path });
    r.planAll();
    while (!r.done) r.step();
    expect(r.map).toEqual(r.final());
    expect(new RollRun(m, ROLL_DEFAULTS, { path }).finishAll().map).toEqual(r.map);
    const job = { verb: "roll" as const, map: m, settings: ROLL_DEFAULTS, intent: { path }, keep: null };
    const packed = decode(executeInRust(jobBytes(job))) as { raw: { heights: number[] }; arrival: number[] };
    expect(packed.raw.heights).toEqual(Array.from(planInRust(job).raw.heights));
    expect(packed.arrival).toEqual(Array.from(r.plan0.arrival));
    const op = forceParamsOf(m, r.map, { verb: "roll", settings: ROLL_DEFAULTS, where: { path: path.map((p) => [p.x, p.y]) }, cut: null, steps: r.total, reason: "done" })!;
    expect(forceProblems(op, 64, 64, 22)).toEqual([]);
    expect(op.tiles.length).toBeGreaterThan(0);
  });

  test("core planForce and keptForceParams handle the request without the page", () => {
    const m = stepped();
    const state = { W: 64, H: 64, pre: m.heights.slice(), protect: new Uint8Array(4096), channel: new Uint8Array(4096) } as never;
    const p = planForce({ base: m, request: { verb: "roll", settings: ROLL_DEFAULTS, path, cut: null, natural: true } as never, state, caves: [], newId: () => { throw Error("Roll must not request an id"); } });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    p.staged!.finishAll();
    expect(keptForceParams({ before: p.before, request: p.request, carve: null, staged: p.staged }).ok).toBe(true);
  });

  test("refusals are one-line reasons and leave the map as it was", () => {
    const m = stepped();
    const before = m.heights.slice();
    expect(() => new RollRun(m, { ...ROLL_DEFAULTS, power: -1 }, { path })).toThrow("a roll's power is 0 to 100");
    expect(() => new RollRun(m, { ...ROLL_DEFAULTS, size: 4 }, { path })).toThrow("a roll's size is 8 to 64 tiles, or null (it follows Power)");
    expect(() => new RollRun(m, ROLL_DEFAULTS, { path: [] })).toThrow("Draw Roll on the map");
    expect(() => new RollRun(m, ROLL_DEFAULTS, { path }, new Uint8Array(64 * 64).fill(1))).toThrow("the Floor and the working area leave nothing here to roll");
    expect(m.heights).toEqual(before);
  });

  test("keeps the frame shown, undoes, and reopens with the same land", async () => {
    await runGenerate(makeSpec({ seed: 22, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.refine();
    const before = ed.terrainNow().heights.slice();
    expect(ed.forceStart({ verb: "roll", settings: { ...ROLL_DEFAULTS, power: 80 }, path: [{ x: 30, y: 30 }, { x: 60, y: 60 }], cut: null }).errors).toEqual([]);
    let shown = before;
    for (let k = 0; k < 80; k++) {
      const f = ed.forceAdvance(2)!;
      if (f.heights) shown = f.heights.slice();
      if (f.done) break;
    }
    expect(ed.forceStop().errors).toEqual([]);
    const after = ed.terrainNow().heights.slice();
    expect(after).toEqual(shown);
    expect(after).not.toEqual(before);
    expect(MapSession.open(decodeProject(ed.project().bytes)).built.heights).toEqual(after);
    ed.undo();
    expect(ed.terrainNow().heights).toEqual(before);
  }, 120000);
});
