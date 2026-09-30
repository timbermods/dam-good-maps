// The shared forces core (PLAN §20 D203, D206, D219, D220), pinned to Codex's prototypes: the
// forces-core investigation (#59) compared its extracted verbs with the four prototypes' pinned
// sources byte for byte on 45 cases (investigation/forces-core/checks/parity.json). The port in
// src/core/forces must give the same land, objects and fallen trees on each of them. Since D257 a
// force is bound only by nature: the prototypes' Quake and Erupt kept the start's ground (a Lift
// carried the start on a flattened apron, a volcano left its ground alone), so those two are held to
// the prototypes live, on the same studies without their start, where nothing else differs (D148).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CarveRun, DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS, impact } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS, erupt } from "../../src/core/forces/erupt";
import { snapshotMap, type ForceMap } from "../../src/core/forces/force";
import { blockObject } from "../../src/core/format/entities";
import { FaultBrush, QUAKE_DEFAULTS, quake, revealQuake, slideTiles, type QuakeIntent } from "../../src/core/forces/quake";
import { hash } from "../../src/core/forces/random";
import { transportRock } from "../../src/core/forces/rock";
import { CraterRun, EruptRun, modelOf, QuakeRun } from "../../src/core/forces/runs";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { WaterSim } from "../../src/core/sim/water";
import { fixture } from "./forceFixtures";
import { carve as protoCarve, erupt as protoErupt, quake as protoQuake } from "../../investigation/forces-core/verbs";
import { FLOOR_DEFAULT, holdAtFloor } from "../../src/core/forces/floor";
import { fixture as protoFixture } from "../../investigation/forces-core/demo/maps";
import { snapshot as protoSnapshot } from "../../investigation/forces-core/core/map";

/** A study and the prototype's same study, both without their start (D257). */
function startless(kind: "slide" | "plain"): { m: ReturnType<typeof fixture>; proto: ReturnType<typeof protoFixture> } {
  const m = fixture(kind, 64);
  m.entities = m.entities.filter((e) => e.template !== "StartingLocation");
  const proto = protoFixture(kind, 64);
  proto.entities = proto.entities.filter((e) => e.template !== "StartingLocation");
  return { m, proto };
}

interface Pinned {
  verb: string;
  seed: number;
  sha256: string;
  mode?: string;
  scarp?: string;
  centre?: string;
  shape?: string;
  wander?: number;
}

const PINNED: { cases: number; results: Pinned[] } = JSON.parse(readFileSync(join(__dirname, "../../investigation/forces-core/checks/parity.json"), "utf8"));

const digest = (m: ForceMap) =>
  createHash("sha256")
    .update(m.heights)
    .update(JSON.stringify(m.entities))
    .update(JSON.stringify(m.fallen ?? []))
    .digest("hex");

const pinned = (p: Partial<Pinned>) => PINNED.results.find((r) => Object.entries(p).every(([k, v]) => r[k as keyof Pinned] === v))!.sha256;

describe("the forces core, pinned to the prototypes (#59's 45 cases)", () => {
  it("has the 45 cases", () => {
    expect(PINNED.cases).toBe(45);
    expect(PINNED.results.length).toBe(45);
  });

  it("Quake: Lift and Slide, Sheer and Stepped, three personalities (the prototype's, without the start: D257; Slide at Power 100, where D361's 1-to-20-tile travel meets the prototype's)", () => {
    for (const seed of [0, 1, 42])
      for (const mode of ["lift", "slide"] as const)
        for (const scarp of ["sheer", "stepped"] as const) {
          const { m, proto } = startless("slide");
          const intent = { path: [{ x: 0, y: 38 }, { x: 63, y: 38 }], side: seed % 2 ? (1 as const) : (-1 as const) };
          // (D361 (3): Slide travels 1 tile at Power 0 to 20 at 100, the prototype 3 to 20: the same at 100)
          const power = mode === "slide" ? 100 : QUAKE_DEFAULTS.power;
          const p = quake(snapshotMap(m), { ...QUAKE_DEFAULTS, seed, mode, scarp, power }, intent);
          const q = protoQuake.quake(protoSnapshot(proto), { ...protoQuake.DEFAULTS, seed, mode, scarp, power }, intent);
          expect(digest(p.map), `${mode} ${scarp} ${seed}`).toBe(digest(q.map as unknown as ForceMap));
        }
  });

  it("Craterize: every centre, with and without rays", () => {
    for (const seed of [0, 1, 42])
      for (const centre of ["bowl", "peak", "ring", "flat"] as const) {
        const m = fixture("plain", 64);
        const p = impact(snapshotMap(m), { ...CRATER_DEFAULTS, seed, centre, power: 50, size: 28, rays: seed > 0 }, { origin: 38 * 64 + 40 });
        expect(digest(p.map), `${centre} ${seed}`).toBe(pinned({ verb: "craterize", centre, seed }));
      }
  });

  it("Erupt: Vent and Fissure, Steep and Broad (the prototype's height and reach, reshaped by D321 item 14; without the start: D257)", () => {
    for (const seed of [0, 1, 42])
      for (const mode of ["vent", "fissure"] as const)
        for (const shape of ["steep", "broad"] as const) {
          const { m, proto } = startless("plain");
          const intent = { origin: 40 * 64 + 35, path: [{ x: 30, y: 40 }, { x: 50, y: 42 }] };
          const p = erupt(snapshotMap(m), { ...ERUPT_DEFAULTS, seed, mode, shape, power: 45 }, intent);
          const q = protoErupt.erupt(protoSnapshot(proto), { ...protoErupt.DEFAULTS, seed, mode, shape, power: 45 }, intent);
          // (item 14 reshapes its crater, its skirt of lava and its rock: the same height, a like reach)
          const what = `${mode} ${shape} ${seed}`;
          expect(Math.abs(Math.max(...p.map.heights) - Math.max(...q.map.heights)), what).toBeLessThanOrEqual(3);
          const raised = (h: ArrayLike<number>) => Array.from(h).filter((v, i) => v !== m.heights[i]).length;
          // (its skirt reaches less far than the prototype's: under a third less of the land, never more)
          expect(raised(p.map.heights), what).toBeGreaterThan(raised(q.map.heights) * 0.3);
          expect(raised(p.map.heights), what).toBeLessThan(raised(q.map.heights) * 1.6);
        }
  });

  it("Carve: straight to winding, three personalities, every step to the end (the prototype's land held at the Floor, D321 item 40)", () => {
    for (const seed of [0, 1, 42])
      for (const wander of [0, 35, 100]) {
        const m = fixture("plain", 64);
        const settings = { ...CARVE_DEFAULTS, mode: "aim" as const, dry: true, defyGravity: true, width: 5, power: 75, wander, seed };
        const r = new CarveRun(snapshotMap(m), settings, { origin: 55 * 64 + 40, end: 3 * 64 + 40 });
        for (let k = 0; k < 1400 && !r.metrics.stable; k++) r.step();
        expect(r.metrics.stable).toBe(true);
        // the prototype, run as pinned (its own 45 cases: the same land), then held at the Floor,
        // which it didn't have: the port cuts to 1 at most, exactly where the prototype went lower
        const proto = new protoCarve.CarveRun(protoSnapshot(protoFixture("plain", 64)), { ...protoCarve.DEFAULTS, ...settings }, { origin: 55 * 64 + 40, end: 3 * 64 + 40 });
        for (let k = 0; k < 1400 && !proto.metrics.stable; k++) proto.step();
        expect(digest(proto.map as unknown as ForceMap), `the prototype, wander ${wander} seed ${seed}`).toBe(pinned({ verb: "carve", wander, seed }));
        const held = { ...(proto.map as unknown as ForceMap), heights: proto.map.heights.slice() };
        holdAtFloor(m.heights, held.heights, FLOOR_DEFAULT);
        expect(digest(r.map), `wander ${wander} seed ${seed}`).toBe(digest(held));
      }
  });
});

// --------------------------------------------------------------- the forces' own regressions (#59, #52)

describe("the forces' own regressions (Quake's strokes and rivers, the rock between forces, the stages)", () => {
  it("every short stroke quakes, and every random stroke quakes: the start never refuses one (D257)", () => {
    const b = fixture("plain", 48);
    for (const distance of [0, 0.000001, 0.01, 0.2, 0.9, 1.99, 2, 2.99, 3, 20]) {
      const i: QuakeIntent = { side: 1, path: [{ x: 25.2, y: 25.4 }, { x: 25.2 + distance, y: 25.4 }] };
      expect(quake(snapshotMap(b), QUAKE_DEFAULTS, i).stats.changed).toBeGreaterThan(0);
    }
    let accepted = 0;
    for (let seed = 0; seed < 300; seed++) {
      const m = snapshotMap(b);
      if (seed % 4 === 0) {
        m.heights.fill(seed % 8 === 0 ? 0 : 22);
        for (const e of m.entities) e.z = m.heights[e.y * m.W + e.x];
      }
      const x = hash(seed, 1) * 47;
      const y = hash(seed, 2) * 47;
      const points = [];
      for (let k = 0; k < (seed % 5) + 2; k++) points.push(seed % 4 === 1 ? { x: Math.max(0, Math.min(47, x + k * hash(seed, k + 30) * 0.15)), y } : { x: hash(seed, k * 2 + 10) * 47, y: hash(seed, k * 2 + 11) * 47 });
      const intent: QuakeIntent = { path: points, side: seed % 2 ? 1 : -1 };
      const settings = { ...QUAKE_DEFAULTS, power: seed % 101, seed, mode: seed % 3 ? ("lift" as const) : ("slide" as const), scarp: seed % 2 ? ("sheer" as const) : ("stepped" as const) };
      const p = quake(m, settings, intent);
      expect(settings.mode === "slide" ? p.stats.fullOffset : p.stats.changed, `stroke ${seed}`).toBeGreaterThan(0);
      expect(p.map.heights.every((h) => h >= 0 && h <= 22)).toBe(true);
      expect(p.map.entities.map((e) => e.id)).toEqual(m.entities.map((e) => e.id));
      accepted++;
    }
    expect(accepted).toBe(300);
    // the pen: smooth, reaching the release point, flipping, and bounded
    const pen = new FaultBrush({ x: 20, y: 20 }, 48, 48);
    for (let k = 0; k < 10000; k++) {
      pen.aim({ x: 24 + 20 * Math.sin(k * 0.03), y: 24 + 20 * Math.cos(k * 0.03) });
      pen.advance(1 / 144);
    }
    pen.aim({ x: 10.25, y: 12.75 });
    pen.advance(0, true);
    pen.side = -1;
    expect(pen.intent().path.at(-1)).toEqual({ x: 10.25, y: 12.75 });
    expect(pen.intent().side).toBe(-1);
    expect(pen.intent().path.length).toBeLessThanOrEqual(512);
  });

  it("a Slide carries ridges and ruins exactly Power's tiles, and a river across it keeps flowing, live and settled", () => {
    for (const power of [0, 50, 100])
      for (const side of [1, -1] as const) {
        const m = fixture("river", 128);
        const y = side === 1 ? 86 : 38;
        const x = 30;
        for (let yy = y; yy < y + 4; yy++) for (let xx = x; xx < x + 5; xx++) m.heights[yy * 128 + xx] = 14 + ((xx - x) % 3);
        m.entities = m.entities.filter((e) => e.template === "StartingLocation" || e.template === "WaterSource");
        m.entities.push(blockObject({ id: "ridge-ruin", template: "RuinColumnH3", x: x + 2, y, z: 16, orientation: "Cw0", flipped: false, owner: "quake-test" }));
        const p = quake(m, { ...QUAKE_DEFAULTS, mode: "slide", power, scarp: "sheer", seed: 18 }, { side, path: [{ x: 0, y: 64 }, { x: 127, y: 64 }] });
        const ruin = p.map.entities.find((e) => e.id === "ridge-ruin")!;
        const expected = slideTiles(power);
        expect(ruin.x - x - 2).toBe(expected);
        expect(ruin.y).toBe(y);
        for (let xx = 0; xx < 5; xx++) expect(p.map.heights[(y + 2) * 128 + x + xx + expected]).toBe(m.heights[(y + 2) * 128 + x + xx]);
      }
    for (const side of [1, -1] as const)
      for (const scarp of ["sheer", "stepped"] as const) {
        const base = fixture("river", 96);
        const plan = quake(snapshotMap(base), { ...QUAKE_DEFAULTS, mode: "slide", power: 85, scarp, seed: 18 }, { side, path: [{ x: 0, y: 48 }, { x: 95, y: 48 }] });
        const m = plan.map;
        expect(plan.stats.channel).toBeGreaterThan(0);
        let live = snapshotMap(base);
        for (let k = 1; k <= 8; k++) {
          live = revealQuake(plan, live, k);
          const sim = new WaterSim(modelOf(live), live.water).run(12);
          live.water = { depth: sim.D, contamination: sim.C };
        }
        const sim = new WaterSim(modelOf(live), live.water).run(400);
        const wet = canonicalSettle(modelOf(m));
        const connected = (depth: Float64Array) => {
          const q = m.entities.filter((e) => e.template === "WaterSource").map((e) => e.y * m.W + e.x);
          const seen = new Set(q);
          for (let k = 0; k < q.length; k++) {
            const i = q[k];
            const xx = i % m.W;
            const yy = Math.floor(i / m.W);
            if (yy < 8) return true;
            for (const [a, c] of [
              [xx - 1, yy],
              [xx + 1, yy],
              [xx, yy - 1],
              [xx, yy + 1],
            ]) {
              const j = c * m.W + a;
              if (a < 0 || c < 0 || a >= m.W || c >= m.H || seen.has(j) || depth[j] < 0.02) continue;
              seen.add(j);
              q.push(j);
            }
          }
          return false;
        };
        expect(connected(sim.D), `live ${side} ${scarp}`).toBe(true);
        expect(connected(wet.depth), `settled ${side} ${scarp}`).toBe(true);
      }
  });

  it("volcanic rock moves with the land: Slide carries it, Lift lifts it, digging takes it away; Carve bends round an eruption's lava", () => {
    const base = fixture("plain", 32);
    const rock = snapshotMap(base);
    rock.lava[20 * 32 + 20] = (1 << 7) | (1 << 8);
    const moved = snapshotMap(base);
    const source = Uint32Array.from({ length: 1024 }, (_, i) => i);
    source[21 * 32 + 20] = 20 * 32 + 20;
    transportRock(rock, moved, source, false);
    expect(moved.lava[21 * 32 + 20]).toBe(rock.lava[20 * 32 + 20]);
    moved.heights[21 * 32 + 20] = 7;
    transportRock(rock, moved, source, true);
    expect(moved.lava[21 * 32 + 20]).toBe((1 << 5) | (1 << 6));
    // an eruption, then a carve aimed across its lava: it crosses fewer lava tiles than on soft rock
    const land = fixture("plain", 128);
    const volcano = erupt(snapshotMap(land), { ...ERUPT_DEFAULTS, power: 35, seed: 6 }, { origin: 62 * 128 + 68 });
    const hard = volcano.map;
    expect(hard.lava.some((b) => b > 0)).toBe(true);
    const soft = { ...snapshotMap(hard), lava: new Uint32Array(hard.lava.length) };
    const cs = { ...CARVE_DEFAULTS, mode: "aim" as const, power: 60, seed: 18, wander: 0, width: 4, dry: true, defyGravity: true };
    const ci = { origin: 72 * 128 + 28, end: 72 * 128 + 112 };
    const h = new CarveRun(hard, cs, ci);
    const s = new CarveRun(soft, cs, ci);
    for (const r of [h, s]) for (let k = 0; k < 1200 && !r.metrics.stable; k++) r.step();
    const crossed = (r: CarveRun) => r.path.filter((p) => hard.lava[Math.round(p.y) * 128 + Math.round(p.x)] > 0).length;
    expect(crossed(h)).toBeLessThan(crossed(s));
    // a carve takes away the rock it cuts through
    const cut = h.map.lava!;
    for (let i = 0; i < cut.length; i++) expect(cut[i] >> h.map.heights[i]).toBe(0);
  });

  it("a staged force keeps the same land at any pace, and its stages end exactly on it; the ground kept out stays as it was", () => {
    const m = fixture("river", 64);
    const runs = () => [
      new CraterRun(snapshotMap(m), { ...CRATER_DEFAULTS, power: 40, rays: true }, { origin: 40 * 64 + 20 }),
      new EruptRun(snapshotMap(m), { ...ERUPT_DEFAULTS, power: 40 }, { origin: 40 * 64 + 20 }),
      new QuakeRun(snapshotMap(m), { ...QUAKE_DEFAULTS, mode: "slide", power: 40 }, { side: 1, path: [{ x: 0, y: 40 }, { x: 63, y: 42 }] }),
      new QuakeRun(snapshotMap(m), { ...QUAKE_DEFAULTS, power: 40 }, { side: -1, path: [{ x: 0, y: 40 }, { x: 63, y: 42 }] }),
    ];
    const fast = runs().map((r) => r.finishAll());
    const slow = runs();
    for (const r of slow) for (let k = 0; k < 400 && !r.done; k++) r.step();
    slow.forEach((r, k) => {
      expect(r.done).toBe(true);
      expect(Array.from(r.map.heights), r.verb).toEqual(Array.from(fast[k].final()!.heights));
      expect(Array.from(r.final()!.heights)).toEqual(Array.from(fast[k].final()!.heights));
    });
    // under a cut: the land above it stays exactly as it was
    const keep = new Uint8Array(64 * 64);
    for (let i = 0; i < keep.length; i++) if (m.heights[i] > 7) keep[i] = 1;
    for (const r of [
      new CraterRun(snapshotMap(m), { ...CRATER_DEFAULTS, power: 40 }, { origin: 40 * 64 + 34 }, keep),
      new EruptRun(snapshotMap(m), { ...ERUPT_DEFAULTS, power: 40 }, { origin: 40 * 64 + 34 }, keep),
      new QuakeRun(snapshotMap(m), QUAKE_DEFAULTS, { side: 1, path: [{ x: 0, y: 40 }, { x: 63, y: 40 }] }, keep),
    ]) {
      r.finishAll();
      const f = r.final()!;
      for (let i = 0; i < keep.length; i++) if (keep[i]) expect(f.heights[i], `${r.verb} ${i}`).toBe(m.heights[i]);
    }
  });
});
