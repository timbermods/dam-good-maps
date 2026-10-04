// A force as the editor starts it (PLAN §20 D194, D202, D203, D206, D246; D342: planning in the
// core, the worker only drives it): the request the page sends, the map it starts from
// (`fullForceMapOf`), its planning (`planForce`: the ground it leaves alone, the refusals of the
// points it was given, each verb's intent and run), and Try another's request (`againRequest`).
// Plain functions on plain data: ids come from the caller (the worker names a carve's source).

import type { BuildResult } from "../features/build";
import { areaDepth } from "../features/raster/brush";
import type { TerrainState } from "../features/raster/strokePreview";
import { integrityAt } from "../features/raster/terrain";
import { forceMapOf } from "./carve/result";
import { CarveRun, type CarveIntent, type CarveSettings } from "./carve/run";
import { edgeAim } from "./carve/edge";
import { breakout, sourceTile, unleashWidth } from "./carve/unleash";
import type { CraterSettings } from "./craterize";
import { fissureBreadth, type EruptSettings, type Point } from "./erupt";
import { plainEntities, type FullForceMap } from "./force";
import { GlaciateRun } from "./glaciate/run";
import { glaciateNextSeed, type GlaciateSettings } from "./glaciate/model";
import { autoDetailsOf, natureOf } from "./nature";
import type { Verb } from "./op";
import { clickFault, strokeLength, TAP, type QuakeSettings } from "./quake";
import { nextSeed } from "./random";
import { trimRock } from "./rock";
import { CraterRun, EruptRun, QuakeRun, type Finalize, type StagedRun } from "./runs";

/** A force to start (D194, D202, D203, D206): which, its settings (the seed is the series', Try
 *  another takes the next), where (a carve's origin and aimed end, an impact and its aim, a vent or
 *  a painted fissure, a painted fault and the side that moves), and the layer showing (D207: the
 *  ground above it is left as it is). A carve drawn uphill is shown from its end (`shownFrom`, D344
 *  A5: only its showing; its operation and its land are the same). A painted Lift (`painting`) shows its result as it is painted
 *  (`forcePaint`), and is kept when the pointer lets go. */
export type ForceRequest = (
  | { verb: "carve"; settings: CarveSettings; origin: [number, number]; end?: [number, number]; via?: [number, number][]; cut: number | null; source?: string; shownFrom?: "end" }
  | { verb: "craterize"; settings: CraterSettings; origin: [number, number]; end?: [number, number]; cut: number | null }
  | { verb: "erupt"; settings: EruptSettings; origin: [number, number]; path?: Point[]; cut: number | null }
  | { verb: "quake"; settings: QuakeSettings; path: Point[]; side: 1 | -1; cut: number | null; painting?: boolean }
  | { verb: "glaciate"; settings: GlaciateSettings; origin: [number, number]; end?: [number, number]; via?: [number, number][]; cut: number | null }
) & {
  /** The working area (D254, D259: the Select tool's open selection), as runs [y, x0, x1]: the land
   *  outside it is unbreakable rock to the force, and inside it the force's change eases to the
   *  locked land a level a tile. */
  area?: [number, number, number][];
  /** The editor's row (D289): the choices it doesn't show are drawn from the land and the seed
   *  (nature.ts), again at each Try another. */
  natural?: boolean;
  /** The gesture's own name (D341): Esc or undo for it (`forceCancel`) reaches this force whenever it
   *  arrives. Left out, the worker names it. */
  gesture?: number;
};

export type AnyForceSettings = CarveSettings | CraterSettings | EruptSettings | QuakeSettings | GlaciateSettings;
export type ForcePoint = Point;

/** The open map as a force starts from it: its ground, its objects, the water as it stands
 *  (`water`: the water in flight, when it is still settling), its hidden rock (`rockLayers`, derived
 *  once from the map as opened), the fresh rock the forces laid (`lava`, null for none), the trees
 *  already down (`down`: each one's pose, by id) and the ids the document has used (`usedIds`). */
export function fullForceMapOf(
  b: BuildResult,
  from: {
    water?: { depth: ArrayLike<number>; contamination: ArrayLike<number> };
    rockLayers: number[];
    lava: Uint32Array | null;
    down: ReadonlyMap<string, { dx: number; dy: number }>;
    usedIds: ReadonlySet<string>;
  },
): FullForceMap {
  const m = forceMapOf(b, from.water);
  const lava = from.lava;
  const W = m.W;
  const down = from.down;
  const fallen = m.entities
    .filter((e) => down.has(e.id))
    .map((e) => ({ id: e.id, x: e.x + 0.5, y: e.y + 0.5, z: m.heights[e.y * W + e.x], dx: down.get(e.id)!.dx, dy: down.get(e.id)!.dy, length: e.template === "Oak" ? 2.6 : 2 }));
  return { ...m, rockLayers: from.rockLayers, lava: lava ? lava.slice() : new Uint32Array(m.W * m.H), fallen, usedIds: from.usedIds };
}

/** The fresh volcanic rock the forces' operations laid (rock.ts), on the ground `heights` as it
 *  stands; null when there is none. */
export function lavaOf(sculpts: readonly { op: string; params?: unknown }[], heights: Uint8Array, W: number, H: number): Uint32Array | null {
  let lava: Uint32Array | null = null;
  for (const op of sculpts) {
    const rock = op.op === "forceResult" ? (op.params as { rock?: { tiles: readonly number[]; bits: readonly number[] } }).rock : undefined;
    if (rock) {
      lava ??= new Uint32Array(W * H);
      const { tiles, bits } = rock;
      for (let k = 0; k < tiles.length; k++) lava[tiles[k]] = bits[k];
    }
  }
  if (lava) trimRock({ heights, lava });
  return lava;
}

/** The same map for Craterize, Erupt and Quake: they work on plain copies of the objects (an
 *  imported object's file entry stays with the map). */
export function stagedForceMap(m: FullForceMap): FullForceMap {
  return { ...m, entities: plainEntities(m.entities.map((e) => (e.raw ? (({ raw: _raw, ...rest }) => rest)(e) : e))) };
}

/** The build's integrity pass (its step 7) on a force's final map, round what the force changed:
 *  the map then shows exactly what the build keeps (a one-tile pit or spike the force left beside
 *  its tiles is worn away, levels past the editor's limit are clipped). `state` is the terrain the
 *  build starts its last steps from, before the force; `ground` the heights the force started on;
 *  `owned` the ground a force sets even where it left its level as it was (a glacier's banks: its
 *  operation lists them, so the build keeps them too). */
export function buildTouches(state: TerrainState, ground: Uint8Array, owned?: () => Uint8Array | null): Finalize {
  return (m) => {
    const { W, H } = m;
    const pre = state.pre.slice();
    const protect = state.protect.slice();
    const own = owned?.() ?? null;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; i < m.heights.length; i++)
      if (m.heights[i] !== ground[i] || own?.[i]) {
        pre[i] = m.heights[i];
        protect[i] = 1;
        const x = i % W;
        const y = (i - x) / W;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    if (x1 < 0) return;
    const base = state.base;
    const locked = state.locked;
    const candidate = base ? (i: number) => pre[i] !== base[i] : locked ? (i: number) => !locked[i] : () => true;
    integrityAt(pre, m.heights, W, H, protect, state.channel, candidate, Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(W - 1, x1 + 1), Math.min(H - 1, y1 + 1));
    trimRock(m);
  };
}

/** What `planForce` is given: the map the force starts from, the request, the tiles an imported
 *  map's caves and overhangs stand on (a force leaves them as they are), the terrain the build's
 *  last steps start from (`buildTouches`), and where a carve's source id comes from (`newId`, the
 *  caller's: the worker draws a fresh one; called once, only for a carve that starts). */
export interface ForcePlanInput {
  base: FullForceMap;
  request: ForceRequest;
  caves: Iterable<number>;
  state: TerrainState;
  newId: () => string;
}

/** A planned force: the request it runs with (nature's choices drawn, a Carve clicked at the edge
 *  turned inward), its run (a carve's, or a staged force's), and the map its result is against. Or
 *  why it can't start (one plain reason). */
export type ForcePlan =
  | { ok: true; request: ForceRequest; carve: CarveRun | null; staged: StagedRun | null; before: FullForceMap }
  | { ok: false; error: string };

/** The words for a force's refusal, from its run's (only nature and the map's limits refuse one:
 *  the start is never in its way, D257). */
function refusal(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** A force planned on the map as it stands (D194, D202, D203, D206, D246): the ground no force
 *  touches (above the layer showing, an imported map's caves, outside the working area), the points
 *  it was given checked against it, and each verb's run started on its intent. */
export function planForce(input: ForcePlanInput): ForcePlan {
  const { base, state } = input;
  let req = input.request;
  const refuse = (error: string): ForcePlan => ({ ok: false, error });
  const { W, H } = base;
  const N = W * H;
  if (req.natural) req = natureOf(req, base);
  // a Carve clicked where its water would run straight off the map carves inward (D360 (1a))
  if (req.natural && req.verb === "carve" && req.settings.mode === "unleash" && !req.source && !req.end) {
    const aim = edgeAim(base.heights, base.W, base.H, Math.round(req.origin[1]) * base.W + Math.round(req.origin[0]), req.settings.power);
    if (aim !== null) req = { ...req, settings: { ...req.settings, mode: "aim", defyGravity: true }, end: [aim % base.W, Math.floor(aim / base.W)] };
  }
  const cut = req.cut;
  const inMap = (p: [number, number]) => p[0] >= 0 && p[1] >= 0 && p[0] < W && p[1] < H;
  const at = (p: [number, number]) => p[1] * W + p[0];
  // the ground no force touches here: above the layer showing, and an imported map's caves
  const keep = new Uint8Array(N);
  if (cut !== null) for (let i = 0; i < N; i++) if (base.heights[i] > cut) keep[i] = 1;
  for (const i of input.caves) keep[i] = 1;
  // the working area (D254, D259): the land outside it is locked, unbreakable rock to the force
  const inside = req.area ? areaDepth(req.area, W, H) : null;
  if (inside) for (let i = 0; i < N; i++) if (!inside[i]) keep[i] = 1;
  const hidden = cut !== null ? "That ground is above the layer showing: show it to change it" : "A force leaves caves and overhangs as they are";
  const points = req.verb === "quake" ? [] : [req.origin, ...(req.verb !== "erupt" && req.end ? [req.end] : []), ...((req.verb === "carve" || req.verb === "glaciate") && req.end ? (req.via ?? []) : [])];
  if (points.some((p) => !inMap(p))) return refuse("Pick a spot on the map");
  if (inside && points.some((p) => inMap(p) && !inside[at(p)])) return refuse("Outside the working area: Esc clears it");
  if (points.some((p) => keep[at(p)])) return refuse(req.verb === "carve" ? (cut !== null ? "That ground is above the layer showing: show it to carve there" : "A carve leaves caves and overhangs as they are") : hidden);
  let carve: CarveRun | null = null;
  let staged: StagedRun | null = null;
  let map = base;
  try {
    switch (req.verb) {
      case "carve": {
        const aimed = req.settings.mode === "aim" && req.end ? req.end : undefined;
        if (req.source) {
          // Unleash (D239): the placed source's own water carves; its strength sets the width; from
          // a pool or a lake it breaks out where the water would spill over (aimed: the rim nearest
          // its aim); no other source is added
          const e = base.entities.find((g) => g.id === req.source && (g.template === "WaterSource" || g.template === "BadwaterSource"));
          if (!e) throw new Error("That source is gone");
          // (its strength as the page reads it: an imported map's in its raw components)
          const comps = (e.raw ? (e.raw as { Components?: Record<string, unknown> }).Components ?? {} : { ...(e.before ?? {}), ...e.components }) as Record<string, unknown>;
          const raw = (comps.WaterSource as { SpecifiedStrength?: unknown } | undefined)?.SpecifiedStrength;
          const strength = typeof raw === "number" ? raw : Number((raw as { value?: number } | undefined)?.value ?? 1);
          const from = breakout(W, H, base.heights, base.water.depth, sourceTile(e, W), keep, aimed ? at(aimed) : null);
          const settings: CarveSettings = { ...req.settings, width: unleashWidth(strength), dry: true };
          // (drawn from it, D321 item 41: its river follows the line)
          const via = aimed && req.via?.length ? req.via.map(at) : [];
          const intent: CarveIntent = { origin: from.origin, ...(aimed ? { end: at(aimed) } : {}), ...(via.length ? { via } : {}) };
          try {
            carve = new CarveRun(base, settings, intent, { keep, sourceId: input.newId(), unleashed: e.id, bad: e.template === "BadwaterSource" });
          } catch (err) {
            // (a source's own water runs downhill: an unleashed source never cuts uphill)
            throw /uphill/.test(String(err instanceof Error ? err.message : err)) ? new Error("That point is uphill of the source: water runs downhill, aim it lower") : err;
          }
          break;
        }
        // (its drawn path, D321 item 41: a smooth curve through its points to the end)
        const via = aimed && req.via?.length ? req.via.map(at) : [];
        const intent: CarveIntent = { origin: at(req.origin), ...(aimed ? { end: at(aimed) } : {}), ...(via.length ? { via } : {}) };
        carve = new CarveRun(base, req.settings, intent, { keep, sourceId: input.newId() });
        break;
      }
      case "craterize": {
        map = stagedForceMap(base);
        const aimed = req.settings.mode === "aim" && req.end && (req.end[0] !== req.origin[0] || req.end[1] !== req.origin[1]) ? req.end : undefined;
        const settings: CraterSettings = { ...req.settings, mode: aimed ? "aim" : "strike" };
        staged = new CraterRun(map, settings, { origin: at(req.origin), ...(aimed ? { end: at(aimed) } : {}) }, keep);
        staged.finalize = buildTouches(state, base.heights);
        break;
      }
      case "erupt": {
        map = stagedForceMap(base);
        const fissure = req.settings.mode === "fissure" && req.path && req.path.length >= 2;
        // the editor's fissure (D344, A6): its drawn shape sets its breadth; Size is for a vent's click
        const size = fissure && req.natural ? { size: fissureBreadth(req.settings, req.path!) } : {};
        staged = new EruptRun(map, { ...req.settings, mode: fissure ? "fissure" : "vent", ...size }, { origin: at(req.origin), ...(fissure ? { path: req.path } : {}) }, keep);
        staged.finalize = buildTouches(state, base.heights);
        break;
      }
      case "glaciate": {
        // a click Flows down the valleys, a drag Aims through the ridges (D258): the gesture is its mode
        map = stagedForceMap(base);
        const aimed = req.end && (req.end[0] !== req.origin[0] || req.end[1] !== req.origin[1]) ? req.end : undefined;
        // its drawn path (D321, item 41): the tiles that move on from the last, between the origin and the end
        const stops: [number, number][] = [];
        for (const p of aimed ? (req.via ?? []) : []) {
          const last = stops.at(-1) ?? req.origin;
          if (p[0] !== last[0] || p[1] !== last[1]) stops.push(p);
        }
        while (stops.length && aimed && stops.at(-1)![0] === aimed[0] && stops.at(-1)![1] === aimed[1]) stops.pop();
        const run = new GlaciateRun(map, { ...req.settings, mode: aimed ? "aim" : "flow" }, { origin: at(req.origin), ...(aimed ? { end: at(aimed) } : {}), ...(stops.length ? { via: stops.map(at) } : {}) }, keep);
        run.finalize = buildTouches(state, base.heights, () => run.footprint());
        staged = run;
        break;
      }
      case "quake": {
        map = stagedForceMap(base);
        // a click (a tap, no line drawn) makes a short natural fault there, the land choosing its way
        // and the seed turning it, so Try another varies it (D360 (1b)); the operation keeps the fault
        const tap = req.natural && !req.painting && strokeLength(req.path) < TAP;
        const path = tap ? clickFault(base.heights, W, H, req.path[0], req.settings.power, req.settings.seed ?? 0) : req.path;
        const run = new QuakeRun(map, req.settings, { path, side: req.side }, keep);
        run.finalize = buildTouches(state, base.heights);
        if (req.painting) run.repaint({ path: req.path, side: req.side });
        staged = run;
        break;
      }
    }
  } catch (e) {
    return refuse(refusal(e));
  }
  return { ok: true, request: req, carve, staged, before: map };
}

/** The seed after `seed` in a force's series (Try another): Glaciate's own series, the others'. */
export function nextForceSeed(verb: Verb, seed: number): number {
  return verb === "glaciate" ? glaciateNextSeed(seed) : nextSeed(seed);
}

/** Try another's request: the kept force's `request` again with `seed`. `pins` (D309): for a force
 *  whose row drew its details from nature (`natural`), the row's current per-detail state, `null`
 *  for a detail still on Auto (so nature draws it again) or its pinned value (so it keeps it); left
 *  out, every detail resets to Auto. A force started without `natural` keeps its settings exactly.
 *  `gesture`: the new try's own (left out, the worker names it). */
export function againRequest(request: ForceRequest, seed: number, pins?: Record<string, unknown>, gesture?: number): ForceRequest {
  const settings: Record<string, unknown> = { ...request.settings, ...(request.natural ? { ...autoDetailsOf(request.verb), ...pins } : {}), seed };
  // (a pin sent as undefined is back to its default: the Floor at 1 is no floor in the record)
  for (const [k, v] of Object.entries(settings)) if (v === undefined) delete settings[k];
  // (a gesture of its own: the kept force's is not this one's)
  const req = { ...request, settings, gesture, ...(request.verb === "quake" ? { painting: false } : {}) } as unknown as ForceRequest;
  if (gesture === undefined) delete req.gesture;
  return req;
}
