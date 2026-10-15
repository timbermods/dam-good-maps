// What an edit reaches (collaborative editing, claims; D362, D486; docs/COLLAB-BRIEF.md §3).
//
// Pure, headless questions of the core (D342) about the tiles an edit writes. What the water does afterwards
// never counts (it flows across claims, §4, waterNotes.ts); the tiles an edit itself writes in the water
// (Fill, Remove unfed water, a force's lake) do.
//   - The host decides. After it applies an entry its record holds the exact writes (`record.writes`, #397's
//     `touchesOf`, which counts the objects a force removes, carries or fells, generated trees and bushes
//     included, at the tiles they stood on). `trialWrites(session, ops)` asks the same of an edit before it
//     is sent: it tries it and takes it back. Both are what claims.ts refuses on.
//   - `bandOf(ops, map)` and `forceBand(gesture, map)`: the quick, cautious warning while a stroke is drawn:
//     the stroke's band plus the force's reach. It may reach past what the host will record (and warn near a
//     border when the edit would not really reach in), but never falls short of it. Carve Unleash and Glaciate
//     flow, which are clicks that run as far as the land lets them, have the whole map as their band; the
//     other forces a corridor derived from the planners' own constants (`corridor`).
//   - `footprintOf(ops, map)`: the tiles an edit is aimed at, per operation kind, from its recorded
//     parameters and the map it lands on; a force's from its completed plan (its tiles, rock, lake, and the
//     objects it removes, carries, fells, clears and adds). The force preview shows it; for any other edit
//     the host's record is the truth.
//
// Adapted from investigation/collab-architecture (`architecture.ts` `touches`, `forces.ts`), which was built
// against an older commit and recomputed a force; here a force's footprint is read off its stored result.
// Try another's replaced force counts through its tiles and the objects still standing; the objects it had
// removed that stand again are in the host's record, not in the map this reads.

import { blockTileBits } from "../terrain/blocks";
import { entityTiles, type PlaceEntityParams } from "../features/edits";
import { brushBounds, markBrushTiles, weathersLikeNature, type BrushParams } from "../features/raster/brush";
import type { BuildResult } from "../features/build";
import type { EntitySpec } from "../format/entities";
import { FOOTPRINTS, type Orientation } from "../format/footprints";
import { planPaintObjects } from "../doc/paint";
import { patchFeature, type EditOp } from "../doc/ops";
import type { Feature, StartFeature } from "../features/schema";
import { inBench } from "../features/raster/terrain";
import type { MapSession } from "../doc/session";
import type { ForceResultParams, ForceWhere, Verb } from "../forces/op";
import { quakeReach, slideTiles } from "../forces/quake";
import { GLACIATE_AUTO_SIZE } from "../forces/glaciate/model";
import { forceReach } from "../forces/reach";
import type { Runs } from "../math/grid";
import * as portable from "../math/portable";
import { captureState } from "./mapState";
import { Mask } from "./mask";
import { touchesOf } from "./touches";

/** A set of tiles of a W × H map (y · W + x). */
export class TileMask {
  readonly bits: Uint8Array;
  constructor(readonly W: number, readonly H: number) {
    this.bits = new Uint8Array(W * H);
  }
  /** Add tile `i`; off the map, nothing. */
  add(i: number): this {
    if (Number.isInteger(i) && i >= 0 && i < this.bits.length) this.bits[i] = 1;
    return this;
  }
  addXY(x: number, y: number): this {
    if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.bits[y * this.W + x] = 1;
    return this;
  }
  addRect(x0: number, y0: number, x1: number, y1: number): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.W - 1, x1); x++) this.bits[y * this.W + x] = 1;
    return this;
  }
  addRuns(runs: Runs | readonly (readonly number[])[]): this {
    for (const [y, x0, x1] of runs) this.addRect(x0, y, x1, y);
    return this;
  }
  has(i: number): boolean {
    return this.bits[i] === 1;
  }
  count(): number {
    let n = 0;
    for (let i = 0; i < this.bits.length; i++) n += this.bits[i];
    return n;
  }
  tiles(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i++) if (this.bits[i]) out.push(i);
    return out;
  }
  union(m: TileMask): this {
    for (let i = 0; i < this.bits.length; i++) if (m.bits[i]) this.bits[i] = 1;
    return this;
  }
  /** Every tile within `n` tiles (a square reach) of a tile in the set, added. */
  grow(n: number): this {
    if (n <= 0) return this;
    const { W, H } = this;
    const src = this.bits.slice();
    // two passes (rows, then columns): a square reach
    const rows = new Uint8Array(src.length);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (src[y * W + x]) for (let xx = Math.max(0, x - n); xx <= Math.min(W - 1, x + n); xx++) rows[y * W + xx] = 1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (rows[y * W + x]) for (let yy = Math.max(0, y - n); yy <= Math.min(H - 1, y + n); yy++) this.bits[yy * W + x] = 1;
    return this;
  }
}

/** What an edit reaches. `whole`: its reach cannot be bounded (a feature operation rebuilds the map's
 *  features; INTEGRATION.md: the full map until the build's reads are audited), so it counts as reaching
 *  wherever the other player holds a claim. */
export interface Footprint {
  tiles: TileMask;
  whole: boolean;
}

/** The map an edit lands on, as the footprint questions read it (a `MapSession` is one). */
export interface MapView {
  size: { x: number; y: number };
  built: Pick<BuildResult, "heights" | "entities">;
}

type Reader = MapView & Partial<Pick<MapSession, "logOps">>;

export const emptyFootprint = (W: number, H: number): Footprint => ({ tiles: new TileMask(W, H), whole: false });

const entityTilesOf = (e: Pick<EntitySpec, "template" | "x" | "y" | "orientation"> & { flipped?: boolean }): [number, number][] =>
  FOOTPRINTS[e.template] ? entityTiles({ template: e.template, x: e.x, y: e.y, orientation: e.orientation, flipped: e.flipped }) : [];

/** A single tile object (no footprint entry) still stands on its own tile. */
function addEntity(m: TileMask, e: Pick<EntitySpec, "template" | "x" | "y" | "orientation"> & { flipped?: boolean }): void {
  const t = entityTilesOf(e);
  if (t.length) for (const [x, y] of t) m.addXY(x, y);
  else m.addXY(e.x, e.y);
}

// ------------------------------------------------------------------------------------- brush

/** The tiles a brush stroke is aimed at: the tiles it presses on (its dabs' discs, an area's rectangle)
 *  within its working area when it has one, the pieces that ride it whole and the slopes it records; a
 *  weathering Naturalize works all round its dabs (its band). A stroke that changes nothing there still
 *  counts: it was aimed at that ground. (The integrity pass may tidy a pit or spike one tile past what a
 *  stroke changed; the host's record has it, `bandOf` allows for it.) */
function brushTiles(p: BrushParams, W: number, H: number): TileMask {
  const out = new TileMask(W, H);
  const pressed = new Uint8Array(W * H);
  markBrushTiles(p, W, H, pressed);
  const inside = p.area?.length ? new TileMask(W, H).addRuns(p.area) : null;
  for (let i = 0; i < pressed.length; i++) if (pressed[i] && (!inside || inside.bits[i])) out.bits[i] = 1;
  if (weathersLikeNature(p)) out.union(brushBand(p, W, H));
  for (const [x0, y0, x1, y1] of p.rigid ?? []) out.addRect(x0, y0, x1, y1);
  for (const [x, y] of p.slopes ?? []) out.addXY(x, y);
  return out;
}

/** The stroke's band: each dab's square of everything the stroke can reach (`brushBounds` for that dab:
 *  the disc, the tiles next to it that Smooth and Naturalize read, a weathering stroke's margin). Grown by one more tile: the integrity pass may tidy a pit or spike one tile past
 *  what the stroke changed. A band, not the footprint: it holds everything the footprint holds. */
function brushBand(p: BrushParams, W: number, H: number): TileMask {
  const out = new TileMask(W, H);
  const step = p.shape === "area" ? 4 : 2;
  const forDab = (dabs: number[]) => brushBounds({ ...p, dabs, rigid: undefined }, W, H);
  if (p.shape === "area") {
    const b = forDab(p.dabs.slice(0, 4));
    if (b) out.addRect(b.x0, b.y0, b.x1, b.y1);
  } else
    for (let k = 0; k + 1 < p.dabs.length; k += step) {
      const b = forDab([p.dabs[k], p.dabs[k + 1]]);
      if (b) out.addRect(b.x0, b.y0, b.x1, b.y1);
    }
  // (not clipped to a working area: the integrity pass and the area's feathered edge work past it)
  out.grow(1);
  for (const [x0, y0, x1, y1] of p.rigid ?? []) out.addRect(x0, y0, x1, y1);
  for (const [x, y] of p.slopes ?? []) out.addXY(x, y);
  return out;
}

// -------------------------------------------------------------------------------------- forces

/** A force's footprint from its completed plan: the changed tiles, the fresh rock, the lake it keeps,
 *  and every object it removes, clears, carries (old and new place), fells or adds (sources). */
function forceTiles(p: ForceResultParams, m: Reader, W: number, H: number): TileMask {
  const out = new TileMask(W, H);
  for (const i of p.tiles) out.add(i);
  for (const i of p.rock?.tiles ?? []) out.add(i);
  for (const i of p.lake?.tiles ?? []) out.add(i);
  const byId = new Map(m.built.entities.map((e) => [e.id, e]));
  const standing = (id: string) => {
    const e = byId.get(id);
    if (e) addEntity(out, e);
  };
  for (const id of p.removed) standing(id);
  for (const c of p.cleared ?? []) standing(c.id);
  for (const f of p.felled ?? []) standing(f.id);
  for (const mv of p.moved ?? []) {
    standing(mv.id);
    const e = byId.get(mv.id);
    if (e) addEntity(out, { ...e, x: mv.x, y: mv.y });
    else out.addXY(mv.x, mv.y);
  }
  for (const s of [...(p.source ? [p.source] : []), ...(p.sources ?? [])]) out.addXY(s.x, s.y);
  // Try another: the force it replaces comes out again, with its own ground and objects
  if (p.replaces !== undefined && m.logOps) {
    const prior = m.logOps.find((o) => o.seq === p.replaces);
    if (prior && prior.op === "forceResult") out.union(forceTiles(prior.params, m, W, H));
  }
  return out;
}

/** Objects standing on tiles an edit writes ride the new ground, or go: their whole footprints count. So
 *  does a Slope beside them: it goes when the step it joined is gone (the build takes it away). */
function carried(out: TileMask, m: Reader): void {
  const { x: W, y: H } = m.size;
  const add: EntitySpec[] = [];
  const touches = (x: number, y: number, reach: number) => {
    for (let yy = Math.max(0, y - reach); yy <= Math.min(H - 1, y + reach); yy++) for (let xx = Math.max(0, x - reach); xx <= Math.min(W - 1, x + reach); xx++) if (out.has(yy * W + xx)) return true;
    return false;
  };
  for (const e of m.built.entities) {
    if (e.template === "Slope") {
      if (touches(e.x, e.y, 1)) add.push(e);
      continue;
    }
    const t = entityTilesOf(e);
    const tiles = t.length ? t : [[e.x, e.y] as [number, number]];
    if (tiles.some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && out.has(y * W + x))) add.push(e);
  }
  for (const e of add) addEntity(out, e);
}

// ----------------------------------------------------------------------------------- the footprint

/** Mark the whole map: the edit's reach cannot be bounded. */
function everywhere(acc: Footprint): void {
  acc.whole = true;
  acc.tiles.bits.fill(1);
}

/** The start feature(s) a feature operation puts, moves or takes away, before and after, or null when
 *  it is another feature's. */
function startOf(op: EditOp, m: Reader & Partial<MapSession>): StartFeature[] | null {
  const features = (m.features ?? []) as readonly Feature[];
  switch (op.op) {
    case "addFeature": return op.params.feature.kind === "start" ? [op.params.feature as StartFeature] : null;
    case "deleteFeature": {
      const f = features.find((g) => g.id === op.params.id);
      return f?.kind === "start" ? [f] : null;
    }
    case "updateFeature": {
      const f = features.find((g) => g.id === op.params.id);
      return f?.kind === "start" ? [f, patchFeature(f, op.params.patch) as StartFeature] : null;
    }
    default: return null;
  }
}

/** A start: its building (3 tiles square, its door a tile past) and its bench, the disc of ground the
 *  build levels round it. */
function addStart(t: TileMask, f: StartFeature, W: number, H: number): void {
  const [cx, cy] = f.params.position;
  const r = Math.max(f.params.benchRadius, 1) + 2;
  t.addRect(Math.floor(cx) - r, Math.floor(cy) - r, Math.ceil(cx) + r, Math.ceil(cy) + r);
  if (f.params.bank) {
    const [bx, by] = f.params.bank;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inBench(f, x, y)) t.addXY(x, y);
    t.addRect(Math.floor(bx) - 1, Math.floor(by) - 1, Math.ceil(bx) + 1, Math.ceil(by) + 1);
  }
}

/** The footprint of one operation, added to `acc`. */
function addOp(acc: Footprint, op: EditOp, m: Reader & Partial<MapSession>): void {
  const { x: W, y: H } = m.size;
  const t = acc.tiles;
  const byId = (id: string) => m.built.entities.find((e) => e.id === id);
  switch (op.op) {
    case "brush": t.union(brushTiles(op.params, W, H)); break;
    case "sculpt": t.addRuns(op.params.cells); break;
    case "blocks": for (const i of blockTileBits(op.params, W, H).keys()) t.add(i); break;
    case "forceResult": t.union(forceTiles(op.params, m, W, H)); break;
    case "placeEntity": {
      const p: PlaceEntityParams = op.params;
      addEntity(t, { template: p.template, x: p.x, y: p.y, orientation: p.orientation, flipped: !!p.flipped && !!FOOTPRINTS[p.template]?.flippable });
      break;
    }
    case "moveEntity": {
      const e = byId(op.params.id);
      if (e) addEntity(t, e);
      const p = op.params;
      const orientation: Orientation = p.orientation ?? e?.orientation ?? "Cw0";
      if (e) addEntity(t, { ...e, x: p.x, y: p.y, orientation });
      else t.addXY(p.x, p.y);
      break;
    }
    case "deleteEntities":
      for (const id of op.params.entities) {
        const e = byId(id);
        if (e) addEntity(t, e);
      }
      break;
    case "setEntityProps": {
      const e = byId(op.params.id);
      if (e) addEntity(t, e);
      break;
    }
    case "pinSlope":
    case "removeSlope": t.addXY(op.params.x, op.params.y); break;
    // Remove unfed water and Fill name the tiles they write (the water they take or set); the water
    // that flows from them afterwards is not theirs (waterNotes.ts)
    case "removeUnfedWater":
      for (const i of op.params.tiles) t.add(i);
      if (op.params.area) t.addRuns(op.params.area);
      break;
    case "fillHollow":
      for (const i of op.params.lake.tiles) t.add(i);
      break;
    case "paintObjects": {
      const s = m as MapSession;
      const plan = typeof s.check === "function" ? planPaintObjects(s, op.params) : null;
      if (plan?.ok) for (const o of plan.ops) addOp(acc, o, m);
      else t.addRuns(op.params.area);
      break;
    }
    // the start is a feature of a generated map: its bench (a disc the build levels) and its building
    case "addFeature":
    case "updateFeature":
    case "deleteFeature": {
      const start = startOf(op, m);
      // (a lock toggled changes no ground)
      if (op.op === "updateFeature" && Object.keys(op.params.patch).every((k) => k === "locked") && !start) break;
      if (start) for (const f of start) addStart(t, f, W, H);
      else everywhere(acc);
      break;
    }
    // any other feature is built from rules that read far (rivers, lakes, landforms): the whole map
    case "reorderFeature": everywhere(acc); break;
  }
}

/** The footprint of an edit (one operation, or the operations of a step): the tiles it writes, and the
 *  objects standing on them. A step's is the union of its operations'. */
export function footprintOf(ops: EditOp | readonly EditOp[], map: MapView & Partial<MapSession>): Footprint {
  const list = Array.isArray(ops) ? (ops as readonly EditOp[]) : [ops as EditOp];
  const acc = emptyFootprint(map.size.x, map.size.y);
  for (const op of list) addOp(acc, op, map);
  carried(acc.tiles, map);
  return acc;
}

// ---------------------------------------------------------------------------------- the band

/** The cautious band of an edit while it is drawn: never smaller than what the host will record as written.
 *  A brush stroke's is its dabs' reach; any ground an edit changes is allowed one tile more (the integrity
 *  pass may tidy a pit or spike beside it); a force's, once its plan is complete, is its footprint (before
 *  it is, `forceBand`). */
export function bandOf(ops: EditOp | readonly EditOp[], map: MapView & Partial<MapSession>): Footprint {
  const list = Array.isArray(ops) ? (ops as readonly EditOp[]) : [ops as EditOp];
  const { x: W, y: H } = map.size;
  const out = emptyFootprint(W, H);
  for (const op of list) {
    const one = emptyFootprint(W, H);
    addOp(one, op, map);
    if (op.op !== "forceResult") one.tiles.grow(1);
    if (op.op === "brush") one.tiles.union(brushBand(op.params, W, H));
    out.tiles.union(one.tiles);
    if (one.whole) out.whole = true;
  }
  carried(out.tiles, map);
  return out;
}

/** A force as it is asked, before its plan is complete: the verb, its settings and where. Both the
 *  operation's record (`where`) and the page's request (`origin`, `end`, `via`, `path` beside the verb) fit. */
export interface ForceBandRequest {
  verb: Verb;
  settings: ForceResultParams["settings"];
  where?: ForceWhere;
  origin?: readonly [number, number];
  end?: readonly [number, number];
  /** Glaciate and Carve: the points the line was drawn through between origin and end. */
  via?: readonly (readonly [number, number])[];
  path?: readonly ({ x: number; y: number } | readonly [number, number])[];
}

/** The points a force gesture is drawn through, in order: its point, its line, its end. */
export function gesturePoints(g: ForceBandRequest): [number, number][] {
  const w = g.where ?? g;
  const pts: [number, number][] = [];
  if (w.origin) pts.push([w.origin[0], w.origin[1]]);
  for (const p of (g as ForceBandRequest).via ?? []) pts.push([p[0], p[1]]);
  for (const p of w.path ?? []) pts.push(Array.isArray(p) ? [p[0], p[1]] : [(p as { x: number }).x, (p as { y: number }).y]);
  if (w.end) pts.push([w.end[0], w.end[1]]);
  return pts;
}

const dist = (ax: number, ay: number, bx: number, by: number): number => portable.hypot(ax - bx, ay - by);

/** How far the corridor round a force gesture reaches, and the points it runs through, or null when the
 *  gesture cannot be bounded before its plan is complete. Each reach is derived from the planner that makes
 *  the force (the line numbers are rust/forces/src/lib.rs unless a file is named):
 *  - Craterize: the ejecta skirt reaches 2.65 radii for Heavy debris, 1.48 for Light (2519), the rays 1.4 more
 *    (2630) and a ray starts at 1.12 and runs 2.45 radii on (2262-2270), all of it measured along the oval
 *    a glancing blow makes: its long axis is radius × (1 + 0.65 × glance), glance the aim's length over the
 *    crater's diameter (2223-2224);
 *  - Erupt: lava lobes run up to 2.36 radii for Heavy flows, 1.42 for Light (erupt.ts lavaLobes), and are
 *    up to 4.84 × max(0.7, radius / 22) wide;
 *  - Quake: lift moves ground out to max(reach, 1.3 × the fault's length) from it, slide to
 *    max(reach, 1.3 × length, slide + 12) + 12, then a slide's travel on (9346, 9530, 9567; quake.ts);
 *  - an aimed Carve stays within the drawn path's length + 20.25 of its end (3262, 4226), a half-width of 0.72 × 24
 *    either side (4848) and its banks, 1.8 × banks + 14;
 *  - an aimed Glaciate drawn through points stays by its line within 1.12 × its Size (5992) and a margin for
 *    hanging valleys and outwash: 0.5 × Size + 10 is not derived, it is the margin the long sweep
 *    (collabClaims.heavy.test.ts) shows to hold;
 *  - Rift and Deposit: their size (their width) and the ground they move.
 *  Carve Unleash and Glaciate flow are clicks with no drawing phase, and run as far as the land lets them. */
function corridor(g: ForceBandRequest): { pts: [number, number][]; r: number } | null {
  const pts = gesturePoints(g);
  const s = g.settings as unknown as Record<string, number | string | boolean | null | undefined> & { power: number };
  const JITTER = 1.65;
  switch (g.verb) {
    case "craterize": {
      const R = forceReach({ verb: "craterize", settings: s as never });
      const diameter = R * 2;
      const aim = s.mode === "aim" && pts.length > 1;
      const glance = aim ? Math.max(0, Math.min(1, dist(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]) / Math.max(12, diameter))) : 0;
      const a = R * (1 + 0.65 * glance);
      const skirt = ((s.debris === "light" ? 1.48 : 2.65) + (s.rays ? 1.4 : 0)) * a;
      const ray = s.rays ? 1.12 * a + R * 2.45 * (1 + 0.5 * glance) : 0;
      return { pts: pts.slice(0, 1), r: Math.max(skirt, ray) + JITTER + 2 };
    }
    case "erupt": {
      const R = forceReach({ verb: "erupt", settings: s as never });
      const lobes = (s.flows === "light" ? 1.42 : 2.36) * R + 4.84 * Math.max(0.7, R / 22);
      return { pts, r: Math.max(lobes, R) + JITTER + 2 };
    }
    case "quake": {
      let L = 0;
      for (let k = 1; k < pts.length; k++) L += dist(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
      const reach = quakeReach(s.power);
      const slide = slideTiles(s.power);
      const r = s.mode === "slide" ? Math.max(reach, L * 1.3, slide + 12) + 12 + slide : Math.max(reach, L * 1.3);
      return { pts, r: r + JITTER + 2 };
    }
    case "carve": {
      if (s.mode !== "aim" || pts.length < 2) return null;
      const end = pts[pts.length - 1];
      // (the drawn path's length: the carve follows the line drawn through its points)
      let far = 0;
      for (let k = 1; k < pts.length; k++) far += dist(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
      const banks = typeof s.banks === "number" ? s.banks : 0;
      return { pts: [end], r: far + 20.25 + 0.72 * 24 + 1.8 * banks + 14 + 2 };
    }
    case "glaciate": {
      const drawn = pts.length > 2 || ((g.where?.path?.length ?? 0) > 2);
      if (s.mode !== "aim" || !drawn) return null;
      const size = typeof s.size === "number" ? s.size : GLACIATE_AUTO_SIZE;
      return { pts, r: 1.12 * size + 0.5 * size + 10 };
    }
    default:
      return { pts, r: ((typeof s.size === "number" ? s.size : 20) / 2) * 3 + 8 };
  }
}

/** The corridor a force gesture asks about: a disc round its point, a capsule along its line (see
 *  `corridor` for each force's reach); the whole map for the two that are clicks and run as far as the land
 *  lets them. Cautious: never smaller than the footprint of the plan the gesture then makes. A force that
 *  breaks the start's ground carries the start up to 24 tiles on, so wherever the start stands in the band
 *  the band reaches that far from it. */
export function forceBand(g: ForceBandRequest, map: MapView): Footprint {
  const { x: W, y: H } = map.size;
  const acc = emptyFootprint(W, H);
  const c = corridor(g);
  if (!c) {
    everywhere(acc);
    return acc;
  }
  const { pts } = c;
  if (!pts.length) return acc;
  const r = Math.ceil(c.r);
  const out = acc.tiles;
  const near = (x: number, y: number): boolean => {
    for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[Math.min(k + 1, pts.length - 1)];
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const u = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
      if (dist(x, y, ax + u * dx, ay + u * dy) <= r) return true;
    }
    return false;
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (let y = Math.max(0, Math.floor(y0 - r)); y <= Math.min(H - 1, Math.ceil(y1 + r)); y++)
    for (let x = Math.max(0, Math.floor(x0 - r)); x <= Math.min(W - 1, Math.ceil(x1 + r)); x++) if (near(x + 0.5, y + 0.5)) out.bits[y * W + x] = 1;
  for (const e of map.built.entities) {
    if (e.template !== "StartingLocation" || !entityTilesOf(e).some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && out.has(y * W + x))) continue;
    out.addRect(e.x - START_CARRY, e.y - START_CARRY, e.x + START_CARRY, e.y + START_CARRY);
  }
  carried(out, map);
  return acc;
}

/** How far a force can carry the start from where it stands (doc/start.ts `moveStartNear`: 24 tiles; its
 *  building and door a few more). */
const START_CARRY = 28;

// ------------------------------------------------------------------- what the host decides on

/** What an edit would write, by trying it: applied to `session` and taken back, so the numbers of its
 *  operations and the map are as they were. The host's own rule (the record's writes), asked
 *  before anything is ordered. `session` is the player's own copy; a refusal is `ok: false` with the
 *  reason the edit itself would be refused for (not a claims matter). */
export function trialWrites(session: MapSession, ops: EditOp | readonly EditOp[]): { ok: true; writes: Mask } | { ok: false; reason: string } {
  const list = Array.isArray(ops) ? (ops as readonly EditOp[]) : [ops as EditOp];
  const earlier = captureState(session);
  const mark = session.mark();
  const r = list.length === 1 ? session.apply(list[0]) : session.applyAll(list);
  if (!r.ok) return { ok: false, reason: r.errors[0] ?? "The edit could not be applied" };
  const t = touchesOf(session.lastStepOps(), earlier, captureState(session));
  const step = session.stepSince(mark);
  if (!step || !session.takeBack(step)) throw new Error("A trial edit could not be taken back");
  return { ok: true, writes: t.writes };
}
