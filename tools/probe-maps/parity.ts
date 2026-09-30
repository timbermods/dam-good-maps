// The DGM Probe's parity maps (PLAN §20 D337, D338, D339): one sample of each object the shelf gained, made in the
// editor's own core as a player would place them, for the probe batch that checks them in the game (the group
// "Parity"; the runner's catalog reads what this writes):
//
//   parity-seeps      a Water Seep in a closed pit and a Water Source of the same strength in another: the seep stops
//                     at 0.8 deep and never fills the pit, the source does (D337 (1))
//   parity-delay      a delayed source beside a control that runs at once: it waits out its countdown, then starts (D337 (4))
//   parity-sink       a source and a sink of the same strength in one pit: the sink drains (a negative strength, D337 (5))
//   parity-drain      a Badtide Drain and an Aquifer with its drill: the drain runs only in the badtide; the aquifer,
//                     unpowered, gives nothing (D337 (2), (3))
//   parity-reserves   a Reserve Pile, Warehouse and Tank, each holding its good (D338 (1))
//   parity-core       an Unstable Core going off in cycle 1, its sphere breaching a seep's pond, trees and a ruin in it: the
//                     land, and the water once settled again, match the preview (D339)
//   parity-succulents a stand of succulents painted on dry ground and another on moist ground beside the water: the game's
//                     soil keeps the first and kills the second within 7.2 to 8.8 days (D338 (4))
//
// The runner writes these itself before it plans `--group Parity` (tools/probe-maps/group.ts); `tools/probe-parity.ts`
// runs the same writer by hand. The maps go to C:\dgm-probe\parity with parity.json (each map's file, hash, and the
// tiles, ids and expected values the probe watches). Nothing here launches Timberborn; the batch needs Kyler's yes like
// every launch (PLAN §20 D117).

import { explosionAfter } from "../../src/core/doc/blast";
import { placeComponents } from "../../src/core/doc/objectOps";
import { MapSession } from "../../src/core/doc/session";
import { paintGround } from "../../src/core/doc/paint";
import { planEntity } from "../../src/core/doc/placing";
import type { Orientation } from "../../src/core/format/footprints";
import { generate } from "../../src/core/gen/generate";
import { guidFrom } from "../../src/core/math/hash";
import { makeSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import type { BuiltMap, GroupWriter } from "./group";

const W = 96;
const OWNER = "dgm-probe-parity";

let n = 0;
const uuid = () => guidFrom(OWNER, String(++n));

export function open(seed: number): MapSession {
  const r = generate(makeSpec({ seed, theme: "riverValley", size: { x: W, y: W } }));
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  s.settleCanonical(); // the ground the platforms are chosen on has the map's own water
  return s;
}

/** A free `size` × `size` square clear of the start, made level at the level most of it stands at: the corner. */
function platform(s: MapSession, size: number, from = 0): [number, number, number] {
  const g = paintGround(s);
  const start = s.built.start!;
  let seen = 0;
  let last: [number, number] | undefined;
  const take = (x: number, y: number): [number, number, number] => {
    const counts = new Map<number, number>();
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) counts.set(g.heights[(y + dy) * W + x + dx], (counts.get(g.heights[(y + dy) * W + x + dx]) ?? 0) + 1);
    const level = Math.max(4, [...counts].sort((a, b) => b[1] - a[1])[0][0]);
    flatten(s, x - 1, y - 1, size + 2, level);
    return [x, y, level];
  };
  for (let y = 8; y < W - 8 - size; y++)
    for (let x = 8; x < W - 8 - size; x++) {
      if (Math.hypot(x - start.x, y - start.y) < 20) continue;
      let ok = true;
      for (let dy = -1; dy <= size && ok; dy++) for (let dx = -1; dx <= size && ok; dx++) if (!g.free[(y + dy) * W + x + dx]) ok = false;
      if (!ok) continue;
      last = [x, y];
      if (seen++ >= from) return take(x, y);
    }
  // fewer clear squares than `from`: the last one there is
  if (last) return take(last[0], last[1]);
  throw new Error("no room for a platform");
}

const cells = (x0: number, y0: number, w: number, h: number): [number, number, number][] => Array.from({ length: h }, (_, k) => [y0 + k, x0, x0 + w - 1] as [number, number, number]);
function flatten(s: MapSession, x0: number, y0: number, size: number, level: number): void {
  const r = s.apply({ op: "sculpt", params: { mode: "flatten", cells: cells(x0, y0, size, size), level } });
  if (!r.ok) throw new Error(`flatten: ${r.errors.join("; ")}`);
}

/** The shelf's own placement of a template (its plan levels the footprint), with the components its options give. */
function place(s: MapSession, template: string, x: number, y: number, comps?: Record<string, unknown>, orientation: Orientation = "Cw0"): string {
  const id = uuid();
  const plan = planEntity(s, { template, x, y, orientation, ...(comps ? { components: comps } : {}) }, id);
  if (!plan.ok) throw new Error(`${template} at (${x}, ${y}): ${plan.errors.join("; ")}`);
  const r = s.applyAll(plan.ops, "user", plan.label);
  if (!r.ok) throw new Error(`${template} at (${x}, ${y}): ${r.errors.join("; ")}`);
  return id;
}
const find = (s: MapSession, id: string) => s.built.entities.find((e) => e.id === id)!;

export interface Sample {
  id: string;
  title: string;
  tests: string;
  /** What the probe watches, per kind of map. */
  data: Record<string, unknown>;
  build(s: MapSession): Record<string, unknown>;
  seed: number;
  /** Game days to play, and the weather (a badtide for the drain). */
  days: number;
  badtide?: boolean;
}

const PIT = 5;
export const SAMPLES: Sample[] = [
  {
    id: "parity-seeps",
    seed: 4242,
    days: 3,
    title: "Parity · a Water Seep and a Water Source in closed pits: the seep stops at 0.8",
    tests: "A Water Seep (2×2, strength 1) at the bottom of a 5×5 pit three levels deep and a Water Source of strength 1 in another: the source fills its pit to the rim, the seep switches itself off while more than 0.8 deep stands over it and holds the pit at about 0.8 (WaterDepthStrengthModifier, DepthLimit 0.8, restart at 0.72). The seep's pit is walled a level above the platform, so the source's overflow never reaches it.",
    data: {},
    build(s) {
      const [x, y, level] = platform(s, 16);
      // (the source floods the platform once its pit is full: a wall a level high keeps that water out of the seep's pit)
      flatten(s, x + 1, y + 1, PIT + 2, level + 1);
      flatten(s, x + 2, y + 2, PIT, level - 3);
      flatten(s, x + 9, y + 2, PIT, level - 3);
      const seep = place(s, "WaterSeep", x + 4, y + 4, placeComponents("WaterSeep", { strength: 1 }));
      const source = place(s, "WaterSource", x + 11, y + 4, placeComponents("WaterSource", { strength: 1 }));
      return { seep: { id: seep, anchor: [find(s, seep).x, find(s, seep).y] }, source: { id: source, tile: [find(s, source).x, find(s, source).y] }, pits: [[x + 2, y + 2, PIT, PIT], [x + 9, y + 2, PIT, PIT]], focus: [x + 8, y + 5] };
    },
  },
  {
    id: "parity-delay",
    seed: 4242,
    days: 5,
    title: "Parity · a source that starts in cycle 1 after a day, beside one that runs at once",
    tests: "Two sources of strength 1 in separate pits: one runs from the start, the other has a start delay (TimeActivatedComponent enabled, cycle 1, 1 day): its current strength is 0 until the countdown ends, then it starts and its pit begins to fill. The delayed source's pit is walled a level above the platform, so the other source's overflow never reaches it: its pit is dry in the file.",
    data: {},
    build(s) {
      const [x, y, level] = platform(s, 16, 4);
      // (the source that runs floods the platform once its pit is full: a wall a level high keeps that water out of the other pit)
      flatten(s, x + 8, y + 1, PIT + 2, level + 1);
      flatten(s, x + 2, y + 2, PIT, level - 2);
      flatten(s, x + 9, y + 2, PIT, level - 2);
      const now = place(s, "WaterSource", x + 4, y + 4, placeComponents("WaterSource", { strength: 1 }));
      const later = place(s, "WaterSource", x + 11, y + 4, placeComponents("WaterSource", { strength: 1, timed: { enabled: true, cycles: 1, days: 1 } }));
      return { now: { id: now, tile: [find(s, now).x, find(s, now).y] }, delayed: { id: later, tile: [find(s, later).x, find(s, later).y], cycles: 1, days: 1 }, pits: [[x + 2, y + 2, PIT, PIT], [x + 9, y + 2, PIT, PIT]], focus: [x + 8, y + 5] };
    },
  },
  {
    id: "parity-sink",
    seed: 4242,
    days: 3,
    title: "Parity · a source and a sink of the same strength in one pit",
    tests: "A Water Source of 1 and a sink (a Water Source of −1) side by side in a pit: the game runs the sink as the model does, draining the water that stands on its tile, so the pit stays shallow instead of filling; the sink's current strength is negative.",
    data: {},
    build(s) {
      const [x, y, level] = platform(s, 12, 8);
      flatten(s, x + 2, y + 2, PIT + 1, level - 3);
      const inflow = place(s, "WaterSource", x + 3, y + 3, placeComponents("WaterSource", { strength: 1 }));
      const sink = place(s, "WaterSource", x + 6, y + 6, placeComponents("WaterSource", { strength: -1 }));
      return { inflow: { id: inflow, tile: [find(s, inflow).x, find(s, inflow).y] }, sink: { id: sink, tile: [find(s, sink).x, find(s, sink).y] }, pits: [[x + 2, y + 2, PIT + 1, PIT + 1]], focus: [x + 5, y + 5] };
    },
  },
  {
    id: "parity-drain",
    seed: 4242,
    days: 6,
    badtide: true,
    title: "Parity · a Badtide Drain and an Aquifer with its drill",
    tests: "A Badtide Drain facing a pit runs only in a badtide (its current strength 0 until one starts, then above 0 with badwater), and an Aquifer with an Ancient Aquifer Drill on it gives no water at the map's start: the drill has no power.",
    data: {},
    build(s) {
      const [x, y, level] = platform(s, 18, 12);
      flatten(s, x + 6, y + 2, PIT, level - 2);
      // (Cw90 flows toward +x: its 1 × 3 footprint lies along x, the last tile the free one in front, at x + 5)
      const drain = place(s, "BadtideDrain", x + 3, y + 4, placeComponents("BadtideDrain"), "Cw90");
      const aquifer = place(s, "Aquifer", x + 12, y + 10, placeComponents("Aquifer"));
      const drill = place(s, "AncientAquiferDrill", find(s, aquifer).x, find(s, aquifer).y, undefined);
      return { drain: { id: drain, tile: [find(s, drain).x, find(s, drain).y], pit: [x + 6, y + 2, PIT, PIT] }, aquifer: { id: aquifer, tile: [find(s, aquifer).x, find(s, aquifer).y] }, drill: { id: drill }, focus: [x + 8, y + 6] };
    },
  },
  {
    id: "parity-reserves",
    seed: 4242,
    days: 1,
    title: "Parity · a Reserve Pile, Warehouse and Tank, each holding its good",
    tests: "A Reserve Pile of 100 logs, a Reserve Warehouse of 40 explosives and a Reserve Tank of 300 water, written as the official maps store their reserves (FixedStockpile, SingleGoodAllower, Inventory:Stockpile): the game loads all three with no loading issue and they stand where they were placed.",
    data: {},
    build(s) {
      const [x, y, level] = platform(s, 16, 14);
      void level;
      const pile = place(s, "ReservePile", x + 2, y + 2, placeComponents("ReservePile", { good: "Log", amount: 100 }));
      const warehouse = place(s, "ReserveWarehouse", x + 7, y + 2, placeComponents("ReserveWarehouse", { good: "Explosives", amount: 40 }), "Cw90");
      const tank = place(s, "ReserveTank", x + 11, y + 7, placeComponents("ReserveTank", { good: "Water", amount: 300 }));
      return { pile: { id: pile, good: "Log", amount: 100 }, warehouse: { id: warehouse, good: "Explosives", amount: 40 }, tank: { id: tank, good: "Water", amount: 300 }, focus: [x + 8, y + 6] };
    },
  },
  {
    id: "parity-core",
    seed: 4242,
    days: 8,
    title: "Parity · an Unstable Core going off in cycle 1, its sphere over land, a pond, trees and a ruin",
    tests: "An Unstable Core (radius 3, so a sphere of 4) that goes off in cycle 1 half a day after its countdown starts, its sphere breaching a pond held by a seep, with pines and a ruin column in it: the ground it clears, the objects it deletes and the water once it has settled again (the seep refilling pond and crater to 0.8 over it), in calm weather, are what the editor's preview (Show after it goes off) drew.",
    data: {},
    build(s) {
      const [x, y, level] = platform(s, 20, 16);
      // a small pond beside the core: a pit with a seep (it stops at 0.8, so the pond stays in its pit)
      flatten(s, x + 12, y + 12, 4, level - 2);
      place(s, "WaterSeep", x + 13, y + 13, placeComponents("WaterSeep", { strength: 1 }));
      // (its sphere reaches into the pond: the pond drains into the crater, and the seep refills both)
      const core = place(s, "UnstableCore", x + 9, y + 9, placeComponents("UnstableCore", { radius: 3, cycles: 1, days: 0.5 }));
      for (const [dx, dy] of [[6, 9], [7, 7], [10, 12]]) place(s, "Pine", x + dx, y + dy, undefined);
      place(s, "RuinColumnH2", x + 9, y + 6, undefined);
      const after = explosionAfter(s, core);
      const e = find(s, core);
      const changed: [number, number, number][] = [];
      for (let i = 0; i < W * W; i++) if (after.heights[i] !== s.built.heights[i]) changed.push([i % W, Math.floor(i / W), after.heights[i]]);
      const removed = s.built.entities.filter((g) => !after.entities.some((k) => k.id === g.id)).map((g) => ({ id: g.id, template: g.template, x: g.x, y: g.y }));
      // the water the preview settles: the tiles round the crater and the pond, for the game's water to be compared with
      const watched: [number, number, number][] = [];
      for (let yy = y + 4; yy < y + 17; yy++) for (let xx = x + 4; xx < x + 17; xx++) watched.push([xx, yy, Math.round(after.depth[yy * W + xx] * 1000) / 1000]);
      return { core: { id: core, tile: [e.x, e.y], radius: 3, cycles: 1, days: 0.5 }, expectedHeights: changed, removed, watched, info: after.info, focus: [x + 9, y + 9] };
    },
  },
  {
    id: "parity-succulents",
    seed: 4242,
    days: 10,
    title: "Parity · succulents on dry ground and on moist ground",
    tests: "A stand of succulents painted on ground the soil keeps dry and another on the bank of a pond, where the soil is moist: the game keeps the first alive and kills the second after 8 days on moist soil, 7.2 to 8.8 (AridNaturalResource, DaysToDieWet 8, times 0.9 to 1.1).",
    data: {},
    build(s) {
      const [x, y, level] = platform(s, 20, 0);
      // a pond on the east side, held by a seep (it stops at 0.8, so the pond stays in its pit): its banks are moist
      flatten(s, x + 14, y + 8, 5, level - 2);
      place(s, "WaterSeep", x + 15, y + 9, placeComponents("WaterSeep", { strength: 1 }));
      s.settleCanonical();
      // moist ground: the moistest dry tiles beside the pond, where the soil stays moist while the seep tops the pond up
      const near: number[] = [];
      const dry: number[] = [];
      for (let yy = y + 2; yy < y + 20; yy++)
        for (let xx = x + 1; xx < x + 20; xx++) {
          const i = yy * W + xx;
          if (s.built.water[i] > 0 || (xx >= x + 14 && xx < x + 19 && yy >= y + 8 && yy < y + 13)) continue;
          if (s.built.moisture[i] > 0 && xx >= x + 10) near.push(i);
        }
      const moist = near.sort((a, b) => s.built.moisture[b] - s.built.moisture[a] || a - b).slice(0, 12);
      // dry ground: the free tiles nearest the platform that no water reaches
      const free = paintGround(s).free;
      const drier = Array.from({ length: W * W }, (_, i) => i).filter((i) => free[i] && !(s.built.water[i] > 0) && !(s.built.moisture[i] > 0) && i % W > 6 && i % W < W - 6 && i / W > 6 && i / W < W - 6);
      drier.sort((a, b) => Math.hypot((a % W) - x, Math.floor(a / W) - y) - Math.hypot((b % W) - x, Math.floor(b / W) - y));
      dry.push(...drier.slice(0, 12));
      const put = (list: number[]) => list.map((i) => place(s, "Succulent", i % W, Math.floor(i / W), undefined));
      const idsDry = put(dry);
      const idsMoist = put(moist);
      return { dry: idsDry, moist: idsMoist, focus: [x + 12, y + 10] };
    },
  },
];

/** One sample made as the probe gets it: its map, with the water its file gets (the canonical settle), and what the
 *  probe watches. */
export function buildSample(p: Sample): { s: MapSession; data: Record<string, unknown> } {
  n = 0;
  const s = open(p.seed);
  const data = p.build(s);
  s.settleCanonical();
  return { s, data };
}

/** One sample as the probe gets it: its exported bytes and its manifest entry; a map our load checks refuse throws. */
export function buildParityMap(p: Sample): BuiltMap {
  const { s, data } = buildSample(p);
  const exported = s.exportTimber({ warnings: [] });
  const file = s.exportFile();
  const problems = validateMap(file, { profile: "export" }).report.checks.filter((c) => !c.ok && c.class === "load");
  if (problems.length) throw new Error(`${p.id}: our load checks refuse it: ${problems.map((c) => `${c.id}: ${c.message}`).join("; ")}`);
  return {
    file: `${p.id}.timber`,
    bytes: exported.bytes,
    size: [W, W],
    entry: { id: p.id, title: p.title, tests: p.tests, days: p.days, badtide: !!p.badtide, edits: s.history().filter((h) => h.applied).map((h) => h.label), loadProblems: [], ...data },
  };
}

export const PARITY_WRITER: GroupWriter = {
  group: "Parity",
  ids: SAMPLES.map((p) => p.id),
  tool: "tools/probe-parity.ts",
  folder: "parity",
  env: "DGM_PROBE_PARITY",
  manifest: "parity.json",
  build(log) {
    const maps: BuiltMap[] = [];
    for (const p of SAMPLES) {
      const t0 = Date.now();
      const m = buildParityMap(p);
      maps.push(m);
      log?.(`${p.id}: ${(m.entry.edits as string[]).length} steps (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    return { maps, manifest: { format: 1, tool: "tools/probe-parity.ts", decisions: "PLAN §20 D337, D338, D339" } };
  },
};
