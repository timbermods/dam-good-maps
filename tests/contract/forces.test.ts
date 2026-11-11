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

  it("Quake: Lift and Slide, Sheer and Stepped, three personalities (the prototype's, without the start: D257; Slide at Power 100, where D361's 2-to-20-tile travel meets the prototype's)", () => {
    for (const seed of [0, 1, 42])
      for (const mode of ["lift", "slide"] as const)
        for (const scarp of ["sheer", "stepped"] as const) {
          const { m, proto } = startless("slide");
          const intent = { path: [{ x: 0, y: 38 }, { x: 63, y: 38 }], side: seed % 2 ? (1 as const) : (-1 as const) };
          // (D361 (3): Slide travels 2 tiles at Power 0 to 20 at 100, the prototype 3 to 20: the same at 100)
          const power = mode === "slide" ? 100 : QUAKE_DEFAULTS.power;
          const p = quake(snapshotMap(m), { ...QUAKE_DEFAULTS, seed, mode, scarp, power }, intent);
          const q = protoQuake.quake(protoSnapshot(proto), { ...protoQuake.DEFAULTS, seed, mode, scarp, power }, intent);
          expect(digest(p.map), `${mode} ${scarp} ${seed}`).toBe(digest(q.map as unknown as ForceMap));
        }
  });

  // (pinned to the prototype's until showcase-craft gap 25 rebuilt the crater so it reads as a real landform, not a
  // stadium: overlapping hollows, slumped blocks and a hill of wide plates, made land in the forces' shared last step;
  // D148)
  const CRATERS: Record<string, string> = {
    "bowl 0": "d6153f050478b44bdb34d7b6d9dd64ddb6dd1e4bad2a4cbec7bfdde64bce7677",
    "peak 0": "6c5523b8795667fe25e01defe3906f0593911897a85c37c94caf6869089177c0",
    "ring 0": "7b28d50bfbda4fa270a5cab44c1112e635f34cbb8f09b7429f1a1f362df5f0a4",
    "flat 0": "256c91bb426036d7bfee71d7f5af5ba8b37cdb2141a0c5bb542919d851941a26",
    "bowl 1": "7fb79da96a505a1ddde9428d78da63939a4d4ecc0d9cb29a8c9a91edefc972c8",
    "peak 1": "a7e1e6654c60be953507b1edb6f548b2e8b77d060556c8dc1035615a47c20a74",
    "ring 1": "368de4830637a1740b8b193b39a30912e2bb774f50b9d3e60f4f53dec545c9a5",
    "flat 1": "d72b3d22f64b1ece7f2c277a699da31c5826075186944acdc7d2afb8a5c80b9e",
    "bowl 42": "2792ba927ac4baf499fb183f9f44be068b5fb2da7629bfbc5ae15642ece269a2",
    "peak 42": "793a5a86d7ce46e14f9d35347a8da5755b90c4ccefba1f0c723fd07b75e88a91",
    "ring 42": "07f1caa886b455bacda6bdad9e57d11a5ff3bbb288000cff52824d27f86617c6",
    "flat 42": "6fe252da230f48e2cd323816267508e875f842c5f813d5aa7972f20f97e06d4c",
  };
  it("Craterize: every centre, with and without rays", () => {
    for (const seed of [0, 1, 42])
      for (const centre of ["bowl", "peak", "ring", "flat"] as const) {
        const m = fixture("plain", 64);
        const p = impact(snapshotMap(m), { ...CRATER_DEFAULTS, seed, centre, power: 50, size: 28, rays: seed > 0 }, { origin: 38 * 64 + 40 });
        expect(digest(p.map), `${centre} ${seed}`).toBe(CRATERS[`${centre} ${seed}`]);
      }
  });

  /** Whether a tile stands in ground two tiles wide: in a two-by-two square of its own level, or a single tile on the
   *  side of one (rust/forces/src/levels.rs). */
  const twoWide = (h: Uint8Array, W: number, H: number, x: number, y: number): boolean => {
    const square = (x: number, y: number) => {
      const l = h[y * W + x];
      const at = (dx: number, dy: number) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && h[(y + dy) * W + x + dx] === l;
      return (at(-1, 0) && at(0, -1) && at(-1, -1)) || (at(1, 0) && at(0, -1) && at(1, -1)) || (at(-1, 0) && at(0, 1) && at(-1, 1)) || (at(1, 0) && at(0, 1) && at(1, 1));
    };
    const l = h[y * W + x];
    const same = (dx: number, dy: number) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && h[(y + dy) * W + x + dx] === l && square(x + dx, y + dy);
    return square(x, y) || same(-1, 0) || same(1, 0) || same(0, -1) || same(0, 1);
  };
  /** A crater on level ground with nothing on it (the land alone is judged). */
  const bare = (W: number) => {
    const m = fixture("plain", W);
    m.entities = [];
    return m;
  };

  it("Craterize leaves nothing narrower than two tiles (showcase-craft gap 25): no one-tile pillar, pit, ridge, trench, lone block or step, in the bowl, on the rim or in the debris, at any size, with either walls, every centre, both debris and rays", () => {
    const W = 96;
    for (const [size, power] of [[5, 20], [10, 30], [14, 40], [20, 55], [30, 55], [44, 60], [64, 75]] as const)
      for (const walls of ["terraced", "steep"] as const)
        for (const [k, centre] of (["auto", "bowl", "peak", "ring", "flat"] as const).entries()) {
          const m = bare(W);
          const settings = { ...CRATER_DEFAULTS, walls, centre, seed: k + size, power, size, rays: k % 2 === 0, debris: k % 3 === 0 ? ("light" as const) : ("heavy" as const) };
          const h = impact(snapshotMap(m), settings, { origin: 48 * W + 48 }).map.heights;
          const narrow: string[] = [];
          for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) if (h[y * W + x] !== m.heights[y * W + x] && !twoWide(h, W, W, x, y)) narrow.push(`${x},${y}`);
          expect(narrow, `Size ${size}, ${walls}, ${centre}: ground one tile wide`).toEqual([]);
        }
  });

  it("Craterize leaves nothing one tile wide where it changes the ground or beside it, on rough ground too: no ledge strip on a steep wall, no spot put back alone, no sliver at its edge (#912's review)", () => {
    const W = 96;
    const cases = [
      { kind: "plain", at: [48, 48], size: 54, centre: "bowl", seed: 288, debris: "heavy" }, // (a ledge strip on a 13, 7, 2 wall)
      { kind: "slide", at: [40, 48], size: 54, centre: "bowl", seed: 288, debris: "heavy" }, // (the end of a ledge strip)
      { kind: "lake", at: [40, 48], size: 40, centre: "auto", seed: 0, debris: "heavy" }, // (a tile put back where it stood)
      { kind: "slide", at: [40, 48], size: 40, centre: "peak", seed: 1, debris: "light" }, // (the same, by a peak)
      { kind: "lake", at: [40, 48], size: 54, centre: "bowl", seed: 1, debris: "light" }, // (a sliver at the crater's edge)
    ] as const;
    for (const c of cases) {
      const m = fixture(c.kind, W);
      const h = impact(snapshotMap(m), { ...CRATER_DEFAULTS, power: 55, size: c.size, centre: c.centre, walls: "steep", debris: c.debris, rays: false, seed: c.seed }, { origin: c.at[1] * W + c.at[0] }).map.heights;
      const narrow: string[] = [];
      for (let y = 1; y < W - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          let near = false;
          for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) near ||= h[(y + v) * W + x + u] !== m.heights[(y + v) * W + x + u];
          if (near && !twoWide(h, W, W, x, y)) narrow.push(`${x},${y}`);
        }
      expect(narrow, `${c.kind} Size ${c.size} ${c.centre} seed ${c.seed}: ground one tile wide`).toEqual([]);
    }
  });

  it("Craterize: a small crater is a shallow bowl with no centre, never a shaft, and a crater's depth grows with its size", () => {
    const W = 96;
    let last = 0;
    for (const size of [6, 8, 10, 12, 14, 16, 20, 24, 27])
      for (const walls of ["terraced", "steep"] as const)
        for (const seed of [0, 1, 2]) {
          const m = bare(W);
          const p = impact(snapshotMap(m), { ...CRATER_DEFAULTS, walls, seed, power: 100, size, rays: false }, { origin: 48 * W + 48 });
          const a = p.anatomy;
          const h = p.map.heights;
          const what = `Size ${size}, ${walls}, ${seed}`;
          expect(a.centre, what).toBe("bowl");
          let low = 255;
          let middle = 0;
          for (let i = 0; i < h.length; i++) {
            const d = Math.hypot((i % W) - a.x, Math.floor(i / W) - a.y);
            if (d < a.radius) low = Math.min(low, h[i]);
            if (d < Math.max(1.5, a.radius * 0.3)) middle = Math.max(middle, h[i]);
          }
          // shallow: at most a level for every five tiles across, and one more
          expect(a.datum - low, `${what}: its depth`).toBeLessThanOrEqual(Math.floor(size / 5) + 1);
          expect(a.datum - low, `${what}: its depth`).toBeGreaterThanOrEqual(1);
          // no centre: nothing in the middle stands above the floor's lowest step
          expect(middle - low, `${what}: its middle above its floor`).toBeLessThanOrEqual(1);
          expect(a.depth, `${what}: deeper than a smaller crater`).toBeGreaterThanOrEqual(last);
          if (walls === "steep" && seed === 2) last = a.depth;
        }
  });

  it("Craterize reads as a crater, not a stadium (showcase-craft gap 25): its rim's crest is uneven round it, and no bench of its wall runs more than a quarter turn round the bowl", () => {
    for (const walls of ["terraced", "steep"] as const)
      for (const [size, power] of [[40, 60], [64, 75]] as const)
        for (const seed of [0, 1, 2, 3]) {
          const W = 128;
          const m = bare(W);
          const p = impact(snapshotMap(m), { ...CRATER_DEFAULTS, walls, seed, power, size, rays: false, debris: "light" }, { origin: 64 * W + 64 });
          const a = p.anatomy;
          const h = p.map.heights;
          const what = `${walls} ${size} ${seed}`;
          // the crest: the most the ground rose along each of 48 bearings, from inside the bowl out past the rim
          const crest: number[] = [];
          for (let k = 0; k < 48; k++) {
            const t = (k / 48) * Math.PI * 2;
            let top = 0;
            for (let d = a.radius * 0.6; d < a.radius * 1.3; d += 0.5) {
              const x = Math.round(a.x + Math.cos(t) * d);
              const y = Math.round(a.y + Math.sin(t) * d);
              if (x >= 0 && y >= 0 && x < W && y < m.H) top = Math.max(top, h[y * W + x] - m.heights[y * W + x]);
            }
            crest.push(top);
          }
          expect(Math.max(...crest) - Math.min(...crest), `${what}: the crest's height round the rim`).toBeGreaterThanOrEqual(2);
          // a bench: tiles of one level that touch, in the wall (past half the way out), above the floor and its
          // hummocks and below the ground round the crater; the turn it takes is the whole circle less its widest gap
          const floor = a.datum - Math.round(a.depth);
          const inWall = (i: number) => {
            const d = Math.hypot((i % W) - a.x, Math.floor(i / W) - a.y);
            return h[i] > floor + 1 && h[i] < a.datum && d >= a.radius * 0.5 && d <= a.radius * 1.05;
          };
          const seen = new Uint8Array(h.length);
          for (let s = 0; s < h.length; s++) {
            if (seen[s] || !inWall(s)) continue;
            const stack = [s];
            const bearings: number[] = [];
            seen[s] = 1;
            while (stack.length) {
              const i = stack.pop()!;
              bearings.push(Math.atan2(Math.floor(i / W) - a.y, (i % W) - a.x));
              for (const j of [i - 1, i + 1, i - W, i + W])
                if (!seen[j] && h[j] === h[s] && inWall(j)) {
                  seen[j] = 1;
                  stack.push(j);
                }
            }
            bearings.sort((u, v) => u - v);
            let gap = bearings[0] + Math.PI * 2 - bearings[bearings.length - 1];
            for (let k = 1; k < bearings.length; k++) gap = Math.max(gap, bearings[k] - bearings[k - 1]);
            expect(((Math.PI * 2 - gap) * 180) / Math.PI, `${what}: a bench's turn round the bowl, at level ${h[s]}`).toBeLessThanOrEqual(90);
          }
        }
  });

  it("Craterize: a central peak stands clear of the lake its crater would hold, so a crater filled as a lake keeps an island; it is a mountain, below the rim's crest, never a tower", () => {
    for (const walls of ["terraced", "steep"] as const)
      for (const [size, power] of [[40, 60], [30, 55], [60, 5]] as const)
        for (const seed of [0, 1, 2, 3]) {
          const W = 128;
          const m = bare(W);
          const p = impact(snapshotMap(m), { ...CRATER_DEFAULTS, walls, centre: "peak", seed, power, size, rays: false, debris: "light" }, { origin: 64 * W + 64 });
          const a = p.anatomy;
          const h = p.map.heights;
          const off = (i: number) => Math.hypot((i % W) - a.x, Math.floor(i / W) - a.y);
          // the lake's level: the lowest pass from the bowl's lowest tile to lower ground past the crater or the
          // map's edge (a minimax path)
          let start = Math.round(a.y) * W + Math.round(a.x);
          for (let i = 0; i < h.length; i++) if (off(i) < a.radius * 0.7 && h[i] < h[start]) start = i;
          const best = new Array<number>(h.length).fill(Infinity);
          best[start] = h[start];
          const queue: [number, number][] = [[h[start], start]];
          let lake = -1;
          while (lake < 0 && queue.length) {
            queue.sort((u, v) => u[0] - v[0]);
            const [level, i] = queue.shift()!;
            if (level > best[i]) continue;
            const [x, y] = [i % W, Math.floor(i / W)];
            if (x === 0 || y === 0 || x === W - 1 || y === m.H - 1 || (off(i) > a.radius * 1.6 && h[i] < level)) lake = level;
            else
              for (const j of [i - 1, i + 1, i - W, i + W]) {
                const v = Math.max(level, h[j]);
                if (v < best[j]) [best[j], queue[queue.length]] = [v, [v, j]];
              }
          }
          let top = 0;
          let island = 0;
          let foot = 0;
          let crest = 0;
          let low = 255;
          for (let i = 0; i < h.length; i++) {
            if (off(i) < a.radius * 0.45) {
              top = Math.max(top, h[i]);
              low = Math.min(low, h[i]);
              if (h[i] > lake) island++;
            }
            if (off(i) < a.radius * 1.4) crest = Math.max(crest, h[i]);
          }
          for (let i = 0; i < h.length; i++) if (off(i) < a.radius * 0.45 && h[i] > low + 1) foot++;
          const what = `${walls} ${size} ${seed}`;
          expect(top, `${what}: the peak's top above the lake at ${lake}`).toBeGreaterThanOrEqual(lake + 2);
          expect(island, `${what}: the island's tiles`).toBeGreaterThanOrEqual(8);
          if (power > 5) {
            expect(top, `${what}: the peak's top, under the rim's crest at ${crest}`).toBeLessThanOrEqual(crest);
            // a mountain: as broad at its foot as a cone that rises a level and a half a tile
            expect(Math.sqrt(foot / Math.PI), `${what}: the peak's foot, ${foot} tiles, under a top ${top - low} levels up`).toBeGreaterThanOrEqual((top - low) / 1.5);
          }
        }
  });

  it("Craterize: a chosen peak is a broad, low hill of wide plates, never a tower, a plinth or a stack of blocks; Auto gives none", () => {
    const W = 128;
    // (D148: Auto gave a peak from Size 42 until planning's decision on #912, 2026-11-10: the default is what
    // already passes, a floor with low hummocks, from 68 a low massif; a central hill is the Peak's, chosen)
    for (const size of [28, 30, 36, 40, 44, 54, 60, 66, 68, 80, 96]) expect(impact(snapshotMap(bare(W)), { ...CRATER_DEFAULTS, size, power: 55 }, { origin: 64 * W + 64 }).anatomy.centre, `Size ${size}`).toBe("flat");
    for (const [size, power] of [[44, 55], [54, 55], [60, 55], [64, 75], [40, 15]] as const)
      for (const walls of ["terraced", "steep"] as const)
        for (const seed of [0, 1, 2, 3, 4]) {
          const m = bare(W);
          const p = impact(snapshotMap(m), { ...CRATER_DEFAULTS, walls, centre: "peak", seed, power, size, rays: false }, { origin: 64 * W + 64 });
          const a = p.anatomy;
          const h = p.map.heights;
          const what = `${walls} ${size} ${seed}`;
          // the hill: the ground within a third of the way out that stands above the floor's hummocks
          const floor = a.datum - Math.round(a.depth);
          const inHill = (i: number) => Math.hypot((i % W) - a.x, Math.floor(i / W) - a.y) < a.radius * 0.33;
          let top = 0;
          const area = new Map<number, number>();
          for (let i = 0; i < h.length; i++)
            if (inHill(i)) {
              top = Math.max(top, h[i]);
              for (const j of [i + 1, i + W]) if (inHill(j)) expect(Math.abs(h[i] - h[j]), `${what}: a face at ${i % W},${Math.floor(i / W)}`).toBeLessThanOrEqual(2);
              area.set(h[i], (area.get(h[i]) ?? 0) + 1);
            }
          // its top plate four tiles across or more, and every plate under it broader than the one above
          expect(area.get(top)!, `${what}: the top plate's tiles`).toBeGreaterThanOrEqual(12);
          let above = 0;
          for (let level = top; level > floor + 2; level--) {
            const here = [...area].filter(([l]) => l >= level).reduce((n, [, c]) => n + c, 0);
            if (above) expect(here, `${what}: the hill at level ${level} and up, against the level above`).toBeGreaterThanOrEqual(above);
            above = here;
          }
          // broad for its height: two levels up from its floor it is at least twice as wide as it is high
          const foot = [...area].filter(([l]) => l >= floor + 2).reduce((n, [, c]) => n + c, 0);
          expect(2 * Math.sqrt(foot / Math.PI), `${what}: the hill's width, ${top - floor} levels high`).toBeGreaterThanOrEqual(Math.min(2 * (top - floor), a.radius * 0.6));
        }
  });

  it("Craterize: from Size 68 Auto's floor carries a low massif, broad hummocks at most two levels above it, their summits off the bowl's centre", () => {
    const W = 128;
    for (const size of [68, 80, 96])
      for (const walls of ["terraced", "steep"] as const)
        for (const seed of [0, 1, 2, 3, 4]) {
          const settings = { ...CRATER_DEFAULTS, walls, seed, power: 75, size, rays: false };
          const p = impact(snapshotMap(bare(W)), settings, { origin: 64 * W + 64 });
          // (the same crater with a Flat centre chosen: its floor without the massif)
          const flat = impact(snapshotMap(bare(W)), { ...settings, centre: "flat" }, { origin: 64 * W + 64 }).map.heights;
          const a = p.anatomy;
          const h = p.map.heights;
          const what = `${walls} ${size} ${seed}`;
          expect(a.centre, what).toBe("flat");
          const floor = a.datum - Math.round(a.depth);
          let summit = 0;
          for (let i = 0; i < h.length; i++)
            if (h[i] > flat[i]) {
              const where = `${what}: the massif at ${i % W},${Math.floor(i / W)}`;
              // (a wall's bench a tile wider where a hummock meets it, no gap a tile wide left between: the
              // forces' last step)
              if ([i - 1, i + 1, i - W, i + W].some((j) => flat[j] === h[i])) continue;
              expect(h[i] - floor, where).toBeLessThanOrEqual(2);
              if (h[i] - floor < 2) continue;
              summit++;
              expect(Math.hypot((i % W) - a.x, Math.floor(i / W) - a.y), `${where}, by the bowl's centre`).toBeGreaterThan(a.radius * 0.1);
            }
          expect(summit, `${what}: the massif's summits, two levels up`).toBeGreaterThanOrEqual(12);
        }
  });

  it("Craterize: from above a peak's plates are not nested rings: three at most under its top, the top off the middle of the hill's foot, and no plate's ledge the same width all round it", () => {
    const W = 128;
    for (const [size, power] of [[44, 55], [54, 55], [60, 55], [64, 75]] as const)
      for (const walls of ["terraced", "steep"] as const)
        for (const seed of [0, 1, 2, 3, 4]) {
          const p = impact(snapshotMap(bare(W)), { ...CRATER_DEFAULTS, walls, centre: "peak", seed, power, size, rays: false }, { origin: 64 * W + 64 });
          const a = p.anatomy;
          const h = p.map.heights;
          const what = `${walls} ${size} ${seed}`;
          const floor = a.datum - Math.round(a.depth);
          const near = (i: number) => Math.hypot((i % W) - a.x, Math.floor(i / W) - a.y) < a.radius * 0.5;
          let top = 0;
          for (let i = 0; i < h.length; i++) if (near(i)) top = Math.max(top, h[i]);
          // the plates, two levels apart from the top down to two levels above the floor; each the ground at its level and up
          const plates: Set<number>[] = [];
          for (let level = top; level > floor + 1; level -= 2) plates.push(new Set([...h.keys()].filter((i) => near(i) && h[i] >= level)));
          expect(plates.length - 1, `${what}: the plates under the top`).toBeLessThanOrEqual(3);
          const middle = (s: Set<number>) => [[...s].reduce((n, i) => n + (i % W), 0) / s.size, [...s].reduce((n, i) => n + Math.floor(i / W), 0) / s.size];
          const [tx, ty] = middle(plates[0]);
          const [fx, fy] = middle(plates[plates.length - 1]);
          expect(Math.hypot(tx - fx, ty - fy), `${what}: the top's middle from the foot's`).toBeGreaterThanOrEqual(0.75);
          // each plate's ledge, along 32 bearings from the top's middle: wide on one side and narrow on another
          const edge = (s: Set<number>, t: number) => {
            let d = 0;
            while (s.has(Math.round(ty + Math.sin(t) * d) * W + Math.round(tx + Math.cos(t) * d))) d += 0.5;
            return d;
          };
          for (let k = 1; k < plates.length; k++) {
            const ledges = Array.from({ length: 32 }, (_, q) => edge(plates[k], (q * Math.PI) / 16) - edge(plates[k - 1], (q * Math.PI) / 16));
            expect(Math.max(...ledges) - Math.min(...ledges), `${what}: how unevenly the ledge of plate ${k} runs round it`).toBeGreaterThanOrEqual(3);
          }
        }
  });

  it("Craterize: a small crater has a low lip of lumps all round it but for one gap, and a rounded bowl", () => {
    const W = 64;
    for (const size of [10, 12, 14, 18])
      for (const seed of [0, 1, 2, 3, 4, 5]) {
        const m = bare(W);
        const p = impact(snapshotMap(m), { ...CRATER_DEFAULTS, seed, power: 40, size, debris: "light", rays: false }, { origin: 32 * W + 32 });
        const a = p.anatomy;
        const h = p.map.heights;
        const what = `Size ${size}, ${seed}`;
        // the lip: on each of 24 bearings, the most the ground rose from the bowl out past the rim
        let raised = 0;
        let high = 0;
        for (let k = 0; k < 24; k++) {
          const t = (k / 24) * Math.PI * 2;
          let up = 0;
          for (let d = a.radius * 0.5; d < a.radius + 5; d += 0.5) {
            const x = Math.round(a.x + Math.cos(t) * d);
            const y = Math.round(a.y + Math.sin(t) * d);
            up = Math.max(up, h[y * W + x] - m.heights[y * W + x]);
          }
          if (up > 0) raised++;
          high = Math.max(high, up);
        }
        expect(raised, `${what}: the bearings (of 24) with a lip`).toBeGreaterThanOrEqual(17);
        expect(raised, `${what}: the lip has a gap`).toBeLessThan(24);
        expect(high, `${what}: the lip's height`).toBeLessThanOrEqual(2);
        // the bowl: no straight side longer than half the crater (a square hollow has four)
        let straight = 0;
        for (let y = 1; y < W - 1; y++) {
          let run = 0;
          for (let x = 1; x < W - 1; x++) {
            const side = h[y * W + x] < a.datum && h[(y - 1) * W + x] >= a.datum;
            run = side ? run + 1 : 0;
            straight = Math.max(straight, run);
          }
        }
        expect(straight, `${what}: the hollow's longest straight side`).toBeLessThanOrEqual(Math.ceil(size * 0.55));
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
