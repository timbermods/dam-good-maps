// Erode (D281; rust/forces/src/erode.rs, core/forces/erode.ts): the land decides the form. A cliff's
// foot wears into a cave, hard rock capping softer rock is left as an overhang, a thin ridge opens
// into an arch; nothing it leaves, nor any frame of its showing, is ground the game would drop (D121);
// a click anywhere wears something visible, at Power 0 too (D356); Try another changes the seams; it
// adds no object (D368 (10)); and as an operation it undoes exactly, reopens with the same voxels and
// exports them (D444's contract tests; its bytes in every engine are tools/rust/forces-jobs.ts').

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { ERODE_DEFAULTS, ErodeRun, plainMasks, withMasks, type ErodeSettings } from "../../src/core/forces/erode";
import type { FullForceMap } from "../../src/core/forces/force";
import { geology, nextSeed } from "../../src/core/forces/random";
import { fullForceMapOf } from "../../src/core/forces/start";
import { decodeWorld } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { ColumnTerrain } from "../../src/core/terrain/runs";
import { unsupportedVoxels } from "../../src/core/terrain/support";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { strFromU8, unzipSync } from "fflate";
import { fixture } from "./forceFixtures";

type P = { x: number; y: number };

/** A hand-made map: heights from `h`, its hard beds at `hard`, dry, no objects. */
function ground(W: number, H: number, h: (x: number, y: number) => number, hard: number[] = []): FullForceMap {
  const heights = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = h(x, y);
  return { W, H, heights, entities: [], water: { depth: new Float64Array(W * H), contamination: new Float64Array(W * H) }, maxHeight: 22, rockLayers: Array.from({ length: 23 }, (_, z) => (hard.includes(z) ? 1 : 0)), lava: new Uint32Array(W * H), fallen: [] };
}

/** Erode on `m`, shown to its end; every frame's voxels checked against the support rule. */
function erode(m: FullForceMap, s: Partial<ErodeSettings>, path: P[], keep: Uint8Array | null = null) {
  const run = new ErodeRun(withMasks(m), { ...ERODE_DEFAULTS, ...s }, { path }, keep);
  run.planAll();
  const base = unsupportedVoxels({ W: m.W, H: m.H, mask: run.before.masks! });
  let worst = 0;
  while (!run.done) {
    run.step();
    const now = unsupportedVoxels({ W: m.W, H: m.H, mask: run.map.masks! });
    let n = 0;
    for (let c = 0; c < now.length; c++) if (now[c] && !base[c]) n++;
    worst = Math.max(worst, n);
  }
  return { run, after: run.final()!, falls: worst };
}

const solid = (m: Uint32Array, i: number, z: number) => ((m[i] >>> z) & 1) === 1;
const changedTiles = (a: Uint32Array, b: Uint32Array) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

describe("the land decides the form (D281)", () => {
  // a cliff: level 3 west of x = 20, level 12 from it; its rock soft
  const W = 40;
  const cliff = (hard: number[] = []) => ground(W, W, (x) => (x < 20 ? 3 : 12), hard);
  it("a cliff's foot wears into a cave under a roof, its surface and floor as they were", () => {
    for (const power of [0, 55, 100]) {
      const { after, falls, run } = erode(cliff(), { power }, [{ x: 19, y: 20 }]);
      expect(falls, `power ${power}`).toBe(0);
      expect(after.heights, "the surface stays").toEqual(cliff().heights);
      const m = after.masks!;
      // the face's first tile is hollow at the foot's level, rock over it
      const i = 20 * W + 20;
      expect(solid(m, i, 3), `power ${power}`).toBe(false);
      expect(solid(m, i, 11)).toBe(true);
      expect(solid(m, i, 2), "the floor stays").toBe(true);
      // deeper and taller with Power
      if (power === 100) {
        let deep = 0;
        for (let x = 20; x < W; x++) if (!solid(m, 20 * W + x, 3)) deep = x - 19;
        expect(deep).toBeGreaterThanOrEqual(5);
        expect(run.plan0.stats.worn).toBeGreaterThan(300);
      }
    }
  });

  it("hard rock capping softer rock is left as an overhang", () => {
    const m0 = cliff([7]);
    const { after, falls } = erode(m0, { power: 60 }, [{ x: 19, y: 20 }]);
    expect(falls).toBe(0);
    const m = after.masks!;
    let undercut = 0;
    let hardGone = 0;
    let softGone = 0;
    for (let y = 0; y < W; y++)
      for (let x = 20; x < W; x++) {
        const i = y * W + x;
        if (solid(m, i, 7) && !solid(m, i, 6)) undercut++;
        if (!solid(m, i, 7)) hardGone++;
        for (const z of [4, 5, 6]) if (!solid(m, i, z)) softGone++;
      }
    // the soft rock under the bed wore back, the bed stayed over it
    expect(undercut).toBeGreaterThanOrEqual(6);
    expect(hardGone).toBeLessThan(softGone / 4);
    // the lip at the face: the hard bed over air
    expect(solid(m, 20 * W + 20, 7) && !solid(m, 20 * W + 20, 6)).toBe(true);
  });

  it("a thin ridge opens into an arch, its span held", () => {
    // a fin two tiles thick, 14 high, between two floors at level 2
    const fin = ground(W, W, (x) => (x === 20 || x === 21 ? 14 : 2));
    const { after, falls } = erode(fin, { power: 80 }, [{ x: 16, y: 20 }, { x: 25, y: 20 }]);
    expect(falls).toBe(0);
    const m = after.masks!;
    let through = 0;
    for (let y = 0; y < W; y++)
      for (let z = 2; z < 12; z++) if (!solid(m, y * W + 20, z) && !solid(m, y * W + 21, z) && solid(m, y * W + 20, 13) && solid(m, y * W + 21, 13)) through++;
    expect(through).toBeGreaterThan(0);
  });
});

describe("nothing falls, and a click anywhere wears something (D121, D356)", () => {
  let seed = 281;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const maps = (): [string, FullForceMap][] => [
    ["cliff", ground(48, 48, (x) => (x < 24 ? 3 : 12), [5, 9])],
    ["ridge", ground(48, 48, (x) => (x === 24 ? 15 : 2), [8])],
    ["terraces", ground(48, 48, (x, y) => 2 + Math.floor((x + y) / 9) * 2, [4, 8, 12])],
    ["mesa", ground(48, 48, (x, y) => (Math.hypot(x - 24, y - 24) < 9 ? 16 : Math.hypot(x - 24, y - 24) < 14 ? 7 : 3), [6, 10, 14])],
    ["plain", fixture("plain", 48)],
    ["lake", fixture("lake", 48)],
    ["slide", fixture("slide", 48)],
  ];
  it("random gestures leave no ground the game drops, in any frame", () => {
    for (const [name, m] of maps())
      for (let k = 0; k < 6; k++) {
        const a = { x: Math.floor(next() * 48), y: Math.floor(next() * 48) };
        const path = next() < 0.5 ? [a] : [a, { x: Math.max(0, Math.min(47, a.x + Math.round((next() - 0.5) * 30))), y: Math.max(0, Math.min(47, a.y + Math.round((next() - 0.5) * 30))) }];
        const power = next() < 0.3 ? 100 : Math.round(next() * 100);
        const size = next() < 0.5 ? null : 4 + Math.round(next() * 36);
        const { falls } = erode(m, { power, size, seed: Math.floor(next() * 1e9) }, path);
        expect(falls, `${name} ${JSON.stringify(path)} ${power}/${size}`).toBe(0);
      }
  });

  it("at Power 0, a click anywhere on dry ground changes the land, its edges and corners too, and adds no object", () => {
    for (const [name, m0] of maps()) {
      if (name === "lake") continue;
      const m = { ...m0, entities: [{ id: "tree-1", owner: "test", template: "Pine", x: 10, y: 10, z: m0.heights[10 * m0.W + 10], orientation: "Cw0" as const, flipped: false, components: {} }] };
      // (dry: no water within three tiles, so nothing it could breach)
      const dry = (p: P) => {
        for (let y = Math.max(0, p.y - 3); y <= Math.min(47, p.y + 3); y++) for (let x = Math.max(0, p.x - 3); x <= Math.min(47, p.x + 3); x++) if (m.water.depth[y * 48 + x] > 0) return false;
        return true;
      };
      let random = { x: 0, y: 0 };
      do random = { x: Math.floor(next() * 48), y: Math.floor(next() * 48) };
      while (!dry(random));
      for (const p of [{ x: 0, y: 0 }, { x: 47, y: 47 }, { x: 10, y: 10 }, { x: 40, y: 8 }, random].filter(dry))
        for (const size of [4, 40]) {
          const { after, run } = erode(m, { power: 0, size }, [p]);
          const changed = changedTiles(after.masks!, run.before.masks!);
          expect(changed, `${name} at ${p.x},${p.y}, size ${size}`).toBeGreaterThan(0);
          expect(after.entities.map((e) => e.id)).toEqual(["tree-1"]);
        }
    }
  });

  it("leaves water and the ground that holds it alone: a lake's rim and its bed", () => {
    const m = fixture("lake", 48);
    const W = 48;
    for (const [p, power] of [[{ x: 26, y: 41 }, 0], [{ x: 26, y: 41 }, 50], [{ x: 24, y: 24 }, 0], [{ x: 26, y: 33 }, 100]] as [P, number][]) {
      let after: FullForceMap;
      try {
        after = erode(m, { power }, [p]).after;
      } catch (e) {
        // (nothing it may wear there: it says why)
        expect((e as Error).message, `${p.x},${p.y} at ${power}`).toBe("Erode leaves water and the ground that holds it as they are");
        continue;
      }
      for (let i = 0; i < W * W; i++) {
        if (m.water.depth[i] > 0.01) {
          expect(after.heights[i], `wet tile ${i % W},${Math.floor(i / W)}`).toBe(m.heights[i]);
          continue;
        }
        // beside water, no ground goes below the water line
        const level = Math.max(...[i - 1, i + 1, i - W, i + W].filter((j) => j >= 0 && j < W * W).map((j) => (m.water.depth[j] > 0.01 ? Math.ceil(m.heights[j] + m.water.depth[j] - 0.02) : 0)));
        if (after.heights[i] !== m.heights[i]) expect(after.heights[i], `${i % W},${Math.floor(i / W)} beside water`).toBeGreaterThanOrEqual(level);
      }
    }
  });

  it("leaves the rock that holds back a cave's water and the ground an object stands on, and wears at the gesture", () => {
    const W = 40;
    const m = ground(W, W, (x) => (x < 20 ? 3 : 16));
    const masks = plainMasks(m.heights);
    const wet = new Uint32Array(W * W);
    // a pool in a chamber behind the face (tiles 22–24, rows 18–22, air at levels 3–4, water at 3)
    for (let y = 18; y <= 22; y++)
      for (let x = 22; x <= 24; x++) {
        masks[y * W + x] &= ~0b11000;
        wet[y * W + x] = 0b1000;
      }
    // a ledge in the face's tile at row 26 (solid 5–7, air 8–9) with a tree on it
    for (const y of [25, 26, 27]) masks[y * W + 20] &= ~(0b11 << 8);
    const tree = { id: "ledge-tree", owner: "test", template: "Pine", x: 20, y: 26, z: 8, orientation: "Cw0" as const, flipped: false, components: {} };
    const map = { ...m, masks, wet, entities: [tree] };
    for (const p of [{ x: 19, y: 20 }, { x: 19, y: 26 }]) {
      const after = erode(map, { power: 100 }, [p]).after.masks!;
      for (let y = 17; y <= 23; y++)
        for (let x = 21; x <= 25; x++) {
          const i = y * W + x;
          if (wet[i]) continue;
          // beside the pool, at its level: rock that was there stays
          const nextTo = [i - 1, i + 1, i - W, i + W].some((j) => wet[j]);
          if (nextTo && solid(masks, i, 3)) expect(solid(after, i, 3), `${x},${y}`).toBe(true);
        }
      for (let z = 5; z < 8; z++) expect(solid(after, 26 * W + 20, z), `under the tree, level ${z}`).toBe(true);
    }
    // Power 0 on open ground eight tiles from a cliff: the ground at the pointer changes, not the cliff
    const open = ground(W, W, (x) => (x < 28 ? 4 : 14));
    const { after, run } = erode(open, { power: 0 }, [{ x: 12, y: 20 }]);
    const near = Array.from(after.masks!).some((v, i) => v !== run.before.masks![i] && Math.hypot((i % W) - 12, Math.floor(i / W) - 20) <= 4);
    expect(near).toBe(true);
    expect(Array.from(after.masks!).some((v, i) => v !== run.before.masks![i] && i % W >= 26)).toBe(false);
  });

  it("Try another changes the seams; the same seed wears the same", () => {
    const m = ground(48, 48, (x) => (x < 24 ? 3 : 12), [9]);
    const a = erode(m, { power: 70, seed: 5 }, [{ x: 23, y: 24 }]).after.masks!;
    const b = erode(m, { power: 70, seed: nextSeed(5) }, [{ x: 23, y: 24 }]).after.masks!;
    const c = erode(m, { power: 70, seed: 5 }, [{ x: 23, y: 24 }]).after.masks!;
    expect(changedTiles(a, b)).toBeGreaterThan(0);
    expect(c).toEqual(a);
  });
});

/** Faces on a map: the foot of a cliff at least `drop` high, its side tiles off the edge and dry. */
function cliffFeet(m: FullForceMap, drop: number): { foot: number; face: number }[] {
  const { W, H } = m;
  const out: { foot: number; face: number }[] = [];
  for (let y = 3; y < H - 3; y++)
    for (let x = 3; x < W - 3; x++) {
      const i = y * W + x;
      if (m.water.depth[i] > 0.01) continue;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (m.heights[j] - m.heights[i] >= drop) out.push({ foot: i, face: j });
    }
  return out;
}

describe("on generated maps (D281)", () => {
  const mapOf = (theme: "canyon" | "highlands", seed: number) => {
    const r = generate(makeSpec({ seed, theme, size: { x: 128, y: 128 } }));
    const s = MapSession.fromGenerated(r);
    return [theme, fullForceMapOf(s.built, { rockLayers: geology(s.openedHeights), lava: null, down: new Map(), usedIds: new Set() })] as const;
  };
  const maps = (["canyon", "highlands"] as const).map((theme) => mapOf(theme, 3));

  it("a cliff's foot wears into a cave; under a hard bed, an overhang; nothing falls", () => {
    for (const [theme, m] of maps) {
      const feet = cliffFeet(m, 5);
      expect(feet.length, theme).toBeGreaterThan(0);
      let caves = 0;
      let overhangs = 0;
      for (const { foot, face } of feet.filter((_, k) => k % Math.max(1, Math.floor(feet.length / 6)) === 0).slice(0, 6)) {
        const { after, falls, run } = erode(m, { power: 60 }, [{ x: foot % m.W, y: Math.floor(foot / m.W) }]);
        expect(falls, theme).toBe(0);
        const masks = after.masks!;
        if (!solid(masks, face, m.heights[foot]) && solid(masks, face, m.heights[face] - 1)) caves++;
        for (const i of run.plan0.tiles) for (let z = 1; z < 22; z++) if (m.rockLayers[z] && solid(masks, i, z) && !solid(masks, i, z - 1) && solid(run.before.masks!, i, z - 1)) overhangs++;
      }
      expect(caves, theme).toBeGreaterThan(0);
      expect(overhangs, theme).toBeGreaterThan(0);
    }
  });

  it("a thin ridge, where the map has one, opens into an arch", () => {
    let ridges = 0;
    // (Highlands seed 2 since generator 0.10.5, D148: Canyon seed 3's ridge is gone with its map; of Canyon seeds
    // 1–18 and Highlands seeds 1–14, only Highlands 2 has a fin now, as only Canyon 3 had one before)
    for (const [theme, m] of [mapOf("highlands", 2)]) {
      const { W, H, heights: h } = m;
      // a dry fin two to four tiles thick, at least 5 over the ground on both sides, five tiles long
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
      for (let y = 10; y < H - 10 && !ridges; y++)
        for (let x = 10; x < W - 10 && !ridges; x++)
          for (const [dx, dy] of [[1, 0], [0, 1]]) {
            const t = fin(x, y, dx, dy);
            if (!t || ridges) continue;
            let along = 0;
            for (let s = -2; s <= 2; s++) if (fin(x + dy * s, y + dx * s, dx, dy)) along++;
            if (along < 5) continue;
            ridges++;
            const { after, falls } = erode(m, { power: 85 }, [{ x: x - dx * 5, y: y - dy * 5 }, { x: x + dx * (t + 4), y: y + dy * (t + 4) }]);
            expect(falls, theme).toBe(0);
            const masks = after.masks!;
            // light through it: every tile across the fin open at one level, somewhere along it
            let through = false;
            for (let s = -6; s <= 6 && !through; s++)
              for (let z = 1; z < 22 && !through; z++) {
                let all = true;
                for (let k = 0; k < t; k++) {
                  const i = (y + dy * k + dx * s) * W + x + dx * k + dy * s;
                  if (solid(masks, i, z) || !solid(m.masks ?? plainMasks(m.heights), i, z)) all = false;
                }
                if (all) through = true;
              }
            expect(through, `${theme} fin at ${x},${y}`).toBe(true);
          }
    }
    // (Highlands seed 2 has one; if a generator change takes it away, find another seed)
    expect(ridges).toBeGreaterThan(0);
  });
});

const voxelsOf = (bytes: Uint8Array) => decodeWorld(strFromU8(unzipSync(bytes)["world.json"]).replace(/^﻿/, "")).voxels;

describe("Erode as an operation (D342)", () => {
  it("keeps the frame shown, undoes and redoes exactly, reopens and exports its voxels; Try another rolls again, each roll exact", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.refine();
    const before = ed.terrainNow();
    expect(before.terrain.columns.length).toBe(0);
    const W = 96;
    const m = { heights: before.heights, W, H: W, water: { depth: before.terrain.water } } as unknown as FullForceMap;
    const [{ foot }] = cliffFeet(m, 7);
    const path = [{ x: foot % W, y: Math.floor(foot / W) }];
    expect(ed.forceStart({ verb: "erode", settings: { ...ERODE_DEFAULTS, power: 70, seed: 3 }, path, cut: null }).errors).toEqual([]);
    const shown = new Map<number, Uint8Array>();
    for (let k = 0; k < 200; k++) {
      const f = ed.forceAdvance(2)!;
      if (f.columns) f.columns.tiles.forEach((i, q) => shown.set(i, f.columns!.voxels.slice(q * 23, q * 23 + 23)));
      if (f.done) break;
    }
    const stop = ed.forceStop();
    expect(stop.kept).toBe(true);
    const after = ed.terrainNow();
    expect(after.heights).toEqual(before.heights);
    expect(after.terrain.columns.length).toBeGreaterThan(0);
    // the last frame is the land kept, voxel for voxel
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const t = s.terrain;
    expect(shown.size).toBe(after.terrain.columns.length);
    for (const [i, col] of shown) expect(t.column(i), `tile ${i}`).toEqual(col);
    // what the game loads: the hollows, and nothing it drops
    const voxels = voxelsOf(s.exportTimber().bytes);
    const exported = ColumnTerrain.fromVoxels(voxels, W, W);
    expect(exported.mask).toEqual(t.mask);
    expect(unsupportedVoxels(exported).some((v) => v === 1)).toBe(false);
    // undo, redo
    const masks = t.mask.slice();
    ed.undo();
    expect(ed.terrainNow().terrain.columns.length).toBe(0);
    expect(MapSession.open(decodeProject(ed.project().bytes)).terrain.mask).toEqual(ColumnTerrain.fromHeights(before.heights, W, W).mask);
    ed.redo();
    expect(MapSession.open(decodeProject(ed.project().bytes)).terrain.mask).toEqual(masks);
    // Try another: the same gesture from the same land, another roll of the same step (D488's rolls)
    expect(ed.forceAgain().errors).toEqual([]);
    for (let k = 0; k < 200; k++) if (ed.forceAdvance(4)!.done) break;
    expect(ed.forceStop().kept).toBe(true);
    const again = MapSession.open(decodeProject(ed.project().bytes)).terrain.mask;
    expect(changedTiles(again, masks)).toBeGreaterThan(0);
    // the first roll shown again is exactly its land; undo takes the force's step back whole, redo
    // brings back the roll that was shown, each exactly
    expect(ed.forceRoll({ step: -1 }).errors).toEqual([]);
    expect(MapSession.open(decodeProject(ed.project().bytes)).terrain.mask).toEqual(masks);
    ed.undo();
    expect(MapSession.open(decodeProject(ed.project().bytes)).terrain.mask).toEqual(ColumnTerrain.fromHeights(before.heights, W, W).mask);
    ed.redo();
    expect(MapSession.open(decodeProject(ed.project().bytes)).terrain.mask).toEqual(masks);
  }, 120000);

  it("stopped part way, keeps its whole result, and the log replays to it byte for byte", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.refine();
    const before = ed.terrainNow();
    const W = 96;
    const m = { heights: before.heights, W, H: W, water: { depth: before.terrain.water } } as unknown as FullForceMap;
    const [{ foot }] = cliffFeet(m, 7);
    expect(ed.forceStart({ verb: "erode", settings: { ...ERODE_DEFAULTS, power: 70, seed: 3 }, path: [{ x: foot % W, y: Math.floor(foot / W) }], cut: null }).errors).toEqual([]);
    // (planned, a few of its steps shown, then stopped)
    for (let k = 0; k < 3; k++) expect(ed.forceAdvance(2)!.done).toBe(false);
    expect(ed.forceStop().kept).toBe(true);
    // (its hollows are terrain above terrain, whose water settles in the background, #435: settled, the
    // project stores the map)
    ed.settleWater();
    const doc = decodeProject(ed.project().bytes);
    expect(MapSession.replayMatchesStored(doc)).toBe(true);
    const kept = MapSession.open(doc).terrain.mask;
    expect(changedTiles(kept, ColumnTerrain.fromHeights(before.heights, W, W).mask)).toBeGreaterThan(0);
    // the same request run to its end keeps the same land
    ed.undo();
    expect(ed.forceStart({ verb: "erode", settings: { ...ERODE_DEFAULTS, power: 70, seed: 3 }, path: [{ x: foot % W, y: Math.floor(foot / W) }], cut: null }).errors).toEqual([]);
    for (let k = 0; k < 200; k++) if (ed.forceAdvance(4)!.done) break;
    expect(ed.forceStop().kept).toBe(true);
    expect(MapSession.open(decodeProject(ed.project().bytes)).terrain.mask).toEqual(kept);
  }, 120000);
});
