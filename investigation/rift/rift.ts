// Demo-only Rift. Imports the forces' shared pieces; product files stay untouched.
import { fullMap, snapshotMap, type ForceMap, type FullForceMap } from "../../src/core/forces/force";
import { Fault } from "../../src/core/forces/quake";
import { floorProblem, forceFloor, holdAtFloor } from "../../src/core/forces/floor";
import { footprint, startProblem } from "../../src/core/forces/objects";
import { hash, clamp, smooth } from "../../src/core/forces/random";
import { resamplePath, type PathPoint } from "../../src/core/forces/path";
import { hardAt, transportRock } from "../../src/core/forces/rock";
import { WaterSim } from "../../src/core/sim/water";
import { modelOf } from "../../src/core/forces/runs";

export interface Settings { power: number; size: number | null; walls: "auto" | "sheer" | "stepped"; floor: number; seed: number }
export interface Intent { path?: PathPoint[]; click?: PathPoint }
export const DEFAULTS: Settings = { power: 70, size: null, walls: "auto", floor: 1, seed: 1 };
export const widthOf = (s: Settings) => s.size ?? 10 + s.power * .18;
export interface Operation {
  version: 1; verb: "rift"; settings: Settings; path: PathPoint[];
  tiles: number[]; heights: number[]; entities: FullForceMap["entities"]; lava: number[];
}
export interface Plan {
  before: FullForceMap; map: FullForceMap; arrival: Float32Array; fault: Fault;
  settings: Settings; operation: Operation; stats: { changed: number; drop: number; held: number; stepped: number; sheer: number; startCarried: boolean };
}
export function validate(m: ForceMap, s: Settings, i: Intent): void {
  if (!Number.isFinite(s.power) || s.power < 0 || s.power > 100 ||
      (s.size !== null && (!Number.isFinite(s.size) || s.size < 4 || s.size > 64)) ||
      !["auto", "sheer", "stepped"].includes(s.walls) || floorProblem(s.floor, m.maxHeight) ||
      !Number.isInteger(s.seed) || s.seed < 0 || s.seed > 0xffffffff) throw Error("Invalid Rift settings");
  const path = i.path ?? (i.click ? [i.click] : []);
  if (path.length < 1 || path.length > 512 || path.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > m.W - 1 || p.y > m.H - 1))
    throw Error("Draw the Rift on the map");
}
function noise(seed: number, t: number, key: number): number {
  const k = Math.floor(t), a = hash(seed, k + key), b = hash(seed, k + key + 1);
  return a + (b - a) * smooth(t - k);
}
function pathOf(m: ForceMap, s: Settings, intent: Intent): PathPoint[] {
  if (intent.path && intent.path.length >= 2) return resamplePath(intent.path, 2, 128);
  const p = intent.click ?? intent.path![0], angle = hash(s.seed, 580) * Math.PI;
  const r = widthOf(s) * .85;
  return [-1, 1].map(d => ({ x: clamp(p.x + Math.cos(angle) * r * d, 0, m.W - 1), y: clamp(p.y + Math.sin(angle) * r * d, 0, m.H - 1) }));
}

/** Land planning yields every four rows, as Quake does. Front and final map are independent of pace. */
export function* planRift(input: ForceMap, settings: Settings, intent: Intent): Generator<void, Plan> {
  validate(input, settings, intent);
  const before = fullMap(input), map = snapshotMap(before), s = { ...settings };
  const path = pathOf(before, s, intent);
  const fault = new Fault({ mode: "lift", power: s.power, scarp: "sheer", seed: s.seed, floor: s.floor }, { path, side: 1 });
  const arrival = new Float32Array(map.heights.length).fill(2);
  const stats = { changed: 0, drop: 0, held: 0, stepped: 0, sheer: 0, startCarried: false };
  const width = widthOf(s), throwDepth = s.power * .125;
  for (let y = 0; y < map.H; y++) {
    for (let x = 0; x < map.W; x++) {
      const tile = y * map.W + x, h = before.heights[tile], f = fault.at(x, y);
      // Coherent independent fault margins, both following Quake's natural crack.
      const bank = f.d < 0 ? 700 : 800;
      const half = width * .5 * (.80 + .36 * noise(s.seed, f.along / 19, bank));
      const taper = smooth(f.along / Math.max(3, width * .65)) * smooth((fault.length - f.along) / Math.max(3, width * .65));
      const reach = half * (.35 + .65 * Math.sqrt(taper));
      const distance = Math.abs(f.d);
      if (f.end > .6 || distance >= reach || taper <= 0 || throwDepth === 0) continue;
      const hard = hardAt(before, tile, h) || before.rockLayers[Math.max(0, h - 1)] > .5;
      const stepped = s.walls === "stepped" || (s.walls === "auto" && hard);
      // Outer fault ledges, then a broad dropped block; never a smooth U-shaped trench.
      const edge = (reach - distance) / Math.max(1, reach);
      const wall = stepped ? (edge < .13 ? .28 : edge < .28 ? .58 : edge < .40 ? .82 : 1) : smooth(edge / .11);
      const tilt = (hash(s.seed, 920) * 2 - 1) * f.d / half * .85;
      const block = Math.floor(f.along / 17);
      const broken = hash(s.seed, block + 1000) > .58 ? .9 : -.25;
      const lengthTilt = (hash(s.seed, 950) * 2 - 1) * (f.along / Math.max(1, fault.length) - .5) * 1.8;
      const drop = Math.max(0, Math.round((throwDepth + tilt + broken + lengthTilt) * wall * taper));
      map.heights[tile] = Math.max(0, h - drop);
      arrival[tile] = clamp(.04 + f.along / Math.max(1, fault.length) * .74 + distance / half * .05, .04, .85);
      if (drop) stepped ? stats.stepped++ : stats.sheer++;
    }
    if (y % 4 === 3) yield;
  }
  stats.held = holdAtFloor(before.heights, map.heights, forceFloor(s, map.maxHeight));
  transportRock(before, map, Uint32Array.from(map.heights, (_, i) => i), true);
  // Vertical transport never topples a tree or discards an object. z stays ground-relative.
  for (const e of map.entities) {
    const tile = e.y * map.W + e.x, dz = map.heights[tile] - before.heights[tile];
    if (dz) { e.z += dz; delete e.raw; }
  }
  stats.startCarried = carryStart(map, before);
  const tiles: number[] = [], heights: number[] = [];
  for (let i = 0; i < map.heights.length; i++) {
    const drop = before.heights[i] - map.heights[i];
    if (drop) { tiles.push(i); heights.push(map.heights[i]); stats.changed++; stats.drop = Math.max(stats.drop, drop); }
    else arrival[i] = 2;
  }
  return { before, map, arrival, fault, settings: s, stats,
    operation: { version: 1, verb: "rift", settings: s, path, tiles, heights, entities: structuredClone(map.entities), lava: tiles.map(i => map.lava[i]) } };
}
export function plan(input: ForceMap, s: Settings, intent: Intent): Plan {
  const g = planRift(input, s, intent);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}
/** Standalone adapter using the shared footprint/start check. Adoption uses carryStartOps. */
function carryStart(m: FullForceMap, before: FullForceMap): boolean {
  const start = m.entities.find(e => e.template === "StartingLocation");
  if (!start || !startProblem(m)) return false;
  const original = before.entities.find(e => e.id === start.id)!;
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let y = 2; y < m.H - 2; y++) for (let x = 2; x < m.W - 2; x++)
    candidates.push({ x, y, d: (x - original.x) ** 2 + (y - original.y) ** 2 });
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const occupied = new Set(m.entities.filter(e => e.id !== start.id && !/^(Pine|Oak|Birch|BlueberryBush|Succulent)$/.test(e.template)).flatMap(e => footprint(m, e)));
  for (const p of candidates) {
    const e = { ...start, x: p.x, y: p.y, z: m.heights[p.y * m.W + p.x] }, tiles = footprint(m, e, 1);
    if (tiles.some(i => m.heights[i] !== e.z || m.water.depth[i] > .05 || occupied.has(i))) continue;
    Object.assign(start, e); delete start.raw;
    return true;
  }
  throw Error("No level ground remains for the start");
}
/** Literal replay never reruns nature or changes an old result after tuning. */
export function replay(before: ForceMap, op: Operation): FullForceMap {
  const m = fullMap(before);
  op.tiles.forEach((i, k) => { m.heights[i] = op.heights[k]; m.lava[i] = op.lava[k]; });
  m.entities = structuredClone(op.entities);
  return m;
}
/** Nothing, including a carried start, changes before the rupture reaches its original ground. */
export function reveal(p: Plan, progress: number): FullForceMap {
  if (progress >= 1) return snapshotMap(p.map);
  const out = snapshotMap(p.before);
  for (let i = 0; i < out.heights.length; i++) if (p.arrival[i] <= progress) { out.heights[i] = p.map.heights[i]; out.lava[i] = p.map.lava[i]; }
  const final = new Map(p.map.entities.map(e => [e.id, e]));
  out.entities = p.before.entities.map(e => {
    const reached = footprint(out, e).some(i => p.arrival[i] <= progress);
    return structuredClone(reached ? final.get(e.id)! : e);
  });
  return out;
}
/** Continue the shared game's water rules from the old water; never conjure a lake's volume. */
export function waterSim(m: FullForceMap): WaterSim { return new WaterSim(modelOf(m), m.water); }
export function settle(m: FullForceMap, ticks = 768): void {
  const sim = waterSim(m).run(ticks);
  m.water = { depth: sim.D.slice(), contamination: sim.C.slice() };
}
