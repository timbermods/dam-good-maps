import { Terrain } from "../../erode/core/terrain";
import { support } from "../../erode/core/support";
import { settleThings } from "../../erode/core/objects";
import { waterPools, type Pool } from "../../erode/core/water";
import type { ErodeMap, Thing } from "../../erode/core/map";

export type Face = { x: number; y: number; z: number; nx: number; ny: number; nz: number };
export type Mode = "add" | "remove";
export type Stamp = { face: Face; size: number; mode: Mode; layer: number };
export type Change = [tile: number, before: number, after: number];
export interface Operation { version: 1; kind: "click" | "drag" | "hold"; stamps: Stamp[]; changes: Change[]; /** Omitted when objects/start did not change. */ things?: Thing[] }
export interface Snapshot { terrain: Terrain; things: Thing[] }
export interface Plan {
  revision: number; stamp: Stamp; voxels: number[]; unsupported: number[]; reason: string;
  result: Terrain; things: Thing[]; depth: Float32Array; pools: Pool[];
}

/** Keep the fixture's open-water elevations, then use Erode's roofed-gap approximation. */
export function water(t: Terrain, map: ErodeMap) {
  const depth = Float32Array.from(map.water, (d, i) => d > .02 ? Math.max(0, map.heights[i] + d - t.surface(i)) : 0);
  return { depth, pools: waterPools(t, depth) };
}
export function cell(v: number, t: Terrain): [number, number, number] {
  const z = Math.floor(v / t.N), i = v % t.N;
  return [i % t.W, Math.floor(i / t.W), z];
}
/** Even footprints bias one cell toward +axis; the ghost makes that choice explicit. */
export function footprint(s: Stamp): [number, number, number][] {
  const f = s.face, p = [f.x, f.y, f.z], n = [f.nx, f.ny, f.nz];
  const axes = [0, 1, 2].filter(a => n[a] === 0), low = -Math.floor((s.size - 1) / 2);
  if (axes.length !== 2 || n.reduce((sum, v) => sum + Math.abs(v), 0) !== 1) throw new Error("Expected an axis-aligned face");
  if (!Number.isInteger(s.size) || s.size < 1 || s.size > 8) throw new Error("Size must be 1–8");
  return Array.from({ length: s.size ** 2 }, (_, k) => {
    const q = p.map((v, a) => v + (s.mode === "add" ? n[a] : 0));
    q[axes[0]] += low + k % s.size;
    q[axes[1]] += low + Math.floor(k / s.size);
    return q as [number, number, number];
  });
}
/** Interpolate on the original face plane, independent of newly added/removed faces. */
export function line(a: Face, b: Face): Face[] {
  const steps = Math.max(Math.abs(b.x-a.x), Math.abs(b.y-a.y), Math.abs(b.z-a.z));
  return Array.from({ length: steps }, (_, i) => {
    const u = (i+1)/steps;
    return { ...a, x: Math.round(a.x+(b.x-a.x)*u), y: Math.round(a.y+(b.y-a.y)*u), z: Math.round(a.z+(b.z-a.z)*u) };
  });
}
export const deeper = (f: Face): Face => ({ ...f, x: f.x-f.nx, y: f.y-f.ny, z: f.z-f.nz });

export class BlockDocument {
  terrain: Terrain;
  things: Thing[];
  revision = 0;
  operations: Operation[] = [];
  private past: { before: Snapshot; after: Snapshot; op: Operation }[] = [];
  private future: typeof this.past = [];
  private active?: { before: Snapshot; stamps: Stamp[]; kind: Operation["kind"] };
  constructor(readonly map: ErodeMap, terrain: Terrain) { this.terrain = terrain; this.things = settleThings(terrain, map.things, water(terrain, map).depth); }
  snapshot(): Snapshot { return { terrain: this.terrain.clone(), things: structuredClone(this.things) }; }
  get working() { return !!this.active; }
  get undoCount() { return this.past.length; }
  begin(kind: Operation["kind"] = "click") { if (this.active) throw new Error("Gesture already active"); this.active = { before: this.snapshot(), stamps: [], kind }; }
  kind(kind: Operation["kind"]) { if (this.active) this.active.kind = kind; }
  preview(stamp: Stamp): Plan {
    const result = this.terrain.clone(), voxels: number[] = [];
    let reason = "";
    for (const [x,y,z] of footprint(stamp)) {
      if (x < 0 || y < 0 || x >= result.W || y >= result.H || z < 0 || z >= 22) { reason = "The square reaches beyond the map."; continue; }
      if (z >= stamp.layer) { reason = "The square reaches above the visible layer."; continue; }
      if (stamp.mode === "remove" && z === 0) { reason = "The bottom layer must stay."; continue; }
      const i = y*result.W+x, on = stamp.mode === "add";
      if (result.at(i,z) === on) continue;
      result.set(i,z,on); voxels.push(z*result.N+i);
    }
    const unsupported = support(result).unsupported;
    if (unsupported.length) reason = "These blocks would have no support within 3 tiles.";
    const wet = water(result, this.map);
    let things = this.things;
    if (!reason) {
      try { things = settleThings(result, this.things, wet.depth); }
      catch { reason = "No dry, level ground remains for the start."; }
    }
    return { revision: this.revision, stamp: structuredClone(stamp), voxels, unsupported, reason, result, things, ...wet };
  }
  /** The exact preview is the transaction. Refusals and stale previews change nothing. */
  apply(p: Plan): boolean {
    if (!this.active) throw new Error("Begin a gesture first");
    if (p.revision !== this.revision || p.reason || !p.voxels.length) return false;
    this.terrain = p.result; this.things = p.things; this.revision++;
    this.active.stamps.push(p.stamp);
    return true;
  }
  end() {
    const a = this.active; this.active = undefined;
    if (!a || !a.stamps.length) return;
    const changes: Change[] = [];
    for (let i=0; i<this.terrain.N; i++) if (a.before.terrain.cols[i] !== this.terrain.cols[i]) changes.push([i,a.before.terrain.cols[i],this.terrain.cols[i]]);
    const op: Operation = { version: 1, kind: a.kind, stamps: a.stamps, changes };
    if(JSON.stringify(a.before.things)!==JSON.stringify(this.things))op.things=structuredClone(this.things);
    this.past.push({ before: a.before, after: this.snapshot(), op }); this.future = []; this.operations.push(op);
  }
  private restore(s: Snapshot) { this.terrain = s.terrain.clone(); this.things = structuredClone(s.things); this.revision++; }
  cancel() { if (this.active) { this.restore(this.active.before); this.active = undefined; } }
  undo() { if (this.active) { this.cancel(); return; } const h = this.past.pop(); if (h) { this.restore(h.before); this.future.push(h); this.operations.pop(); } }
  redo() { if (this.active) return; const h = this.future.pop(); if (h) { this.restore(h.after); this.past.push(h); this.operations.push(h.op); } }
}

/** Literal operation replay: no pointer, frame time, randomness, or recomputed support. */
export function replay(initial: Terrain, operations: Operation[]): Terrain {
  const t = initial.clone();
  for (const op of operations) {
    if (op.version !== 1) throw new Error("Unknown Block operation version");
    for (const [i,before,after] of op.changes) {
      if (t.cols[i] !== before) throw new Error("Operation base does not match");
      t.cols[i] = after;
    }
  }
  return t;
}
