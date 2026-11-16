// The editor's water preview (EDITOR_PLAN §6, PLAN §19.7): after an edit the water re-settles from
// its previous state instead of from the canonical start, so a local edit is previewed in about a
// second on a 256² map. The file never gets this water: an export (and the background check) runs
// the canonical settle (prefill.ts), which the preview only approximates while it runs.
//
// The warm start keeps the previous settled water (depth, badwater share and outflow momentum) on
// every tile whose ground and water objects the edit left alone and that was wet or lies away from
// the edit, and takes the canonical pre-fill on the rest: the ground an edit changed, the tiles of
// emitters that are new or changed, and the dry tiles near them (WARM_MARGIN). A wet tile beside the
// edit keeps its water and momentum (D(new-preview)), but only where a source, a stored lake or the
// water kept away from the edit reaches it (D385): restarting a stretch of flowing river left a
// step in its surface with no momentum, which sloshed on past the cap. Then the exact simulation
// runs until the edit's water has found its level: checked every 64 ticks, the volume changes by
// under 0.2% and at most 0.05% of the map moves by more than 0.05 (a local change reaches a whole
// lake or sea, whose level then
// drifts by thousandths for a long time), with a cap of one game day. A sealed oxbow lake only
// evaporating is not the water still moving (D222): the preview stops once everything else has. The
// editor's background settle (`PreviewJob`, the one driver, with its own cap) runs on past the day
// while the water still moves, up to four days: stopping it there showed a filling lake as settled, and each
// stroke's draft then carried the whole settle on, sending the page a map of moving water every
// frame (the stutter after a volcano, D244's measurements).
//
// Water changes only through its causes (D260): water no running source can reach any more on the
// new ground (a pool whose source was removed, a stretch of river cut off, a lake breached) takes
// the canonical start too (dry), so it drains away in the edit's own journey instead of standing
// until the background check's settle; a lake a force or a Fill stored (`RetainedWater`) is its own
// cause and keeps its water while its hollow holds it, starting from it the moment it is stored. The
// unfed water Remove unfed water drained (the model's `drained`) goes at once (sim/fed.ts). Nor does
// water appear from nowhere (D385): the pre-fill's water on the tiles that take the canonical start
// stays only where a running source, a kept stored lake or the water kept from before reaches it
// (sim/fed.ts), so a pit dug on dry ground stays dry while one dug beside a river fills at once; and
// once the preview's water stops, the pre-fill's water that only the walk's thin water had joined to
// fed water is taken away and the water runs on, by the canonical settle's own drain (sim/fed.ts
// `withoutUnfed`, a new simulation on the water as it stands).
//
// Which water lost its feed depends on the cause (D260 as ruled 2026-11-15). A source removed or
// weakened takes water out of the map, so standing water above the new level must go and a warm pool
// drains too slowly to show it; every tile that source's walk reached and that lost over a tenth of
// its flow starts again as unfed (`LOST_SHARE`). Ground that only turns a walk takes no water out; it
// moves it, so only the tiles the flow left (under a tenth of it still there, `UNFED_SHARE`) are
// unfed, and the rest keep their depth and momentum and adjust.

import { drainUnfed, fedTiles, keptSeeds, withoutUnfed } from "./fed";
import { flowThrough, prefill, type CanonicalWater } from "./prefill";
import { sealedTiles, SettleRun, TICKS_PER_DAY, WaterSim, type WaterModel, type WaterState } from "./water";

/** How far (tiles, Chebyshev) around a changed tile the warm start takes the pre-fill on dry tiles. */
export const WARM_MARGIN = 2;
/** The share of a tile's walk flow (prefill.ts `flowThrough`) below which ground that only turned a walk
 *  has taken its feed (D260 as ruled 2026-11-15): a channel that still carries more keeps its water and
 *  momentum and adjusts. */
export const UNFED_SHARE = 0.1;
/** The same share on a tile the walk of a source the edit removed or weakened reached: any fall over a
 *  tenth (D260). */
export const LOST_SHARE = 0.9;
/** The preview's settle: checks every 64 ticks, at most 0.05% of tiles moving by more than 0.05,
 *  one day at most. */
export const PREVIEW_CHECK = 64;
export const PREVIEW_MOVED = 0.0005;
export const PREVIEW_TOL = 0.05;
export const PREVIEW_DAYS = 1;
/** Checks in a row the preview's test must pass (SettleRun `passes`): a surge passing down a river after
 *  an edit rises by under `PREVIEW_TOL` a check on every tile, and one check on its crest stopped the
 *  preview there (#1181: River Valley 96² seed 8, an Underground Ruins at 72,56, 0.64 where the settle
 *  gives 0.53). */
export const PREVIEW_PASSES = 2;
/** The editor's background settle runs on past `PREVIEW_DAYS` while the water still moves (not only
 *  sealed basins evaporating), a day at a time, up to this many days in all: water that stops at the
 *  cap while still filling a lake or finding a new course is shown as settled and then moves again
 *  under the next stroke (the draft), every tile of it. */
export const PREVIEW_JOB_DAYS = 4;

/** A settled state to start from: the water model it settled on, and its water with its outflows. */
export interface WarmState {
  model: WaterModel;
  water: CanonicalWater;
}

/** The water a sim holds now, on `model`, as a state a later settle warm-starts from (the preview's
 *  as it stands, a force's as it shows): not settled, its outflows kept. */
export function warmState(model: WaterModel, sim: WaterSim): WarmState {
  return { model, water: { settled: false, ticks: sim.ticks, depth: sim.D.slice(), contamination: sim.C.slice(), sat: new Uint8Array(sim.N), out: sim.out.slice(), preview: true } };
}

/** The tiles the edit itself changed: their floor or dam, or an emitter that is new, gone or changed
 *  emits into them (a mask), or null when the models differ in size. */
export function editedTiles(prev: WaterModel, next: WaterModel): Uint8Array | null {
  if (prev.W !== next.W || prev.H !== next.H) return null;
  const { W, H } = next;
  const N = W * H;
  const hit = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (prev.floor[i] !== next.floor[i]) hit[i] = 1;
    const a = prev.dam ? prev.dam[i] : -1;
    const b = next.dam ? next.dam[i] : -1;
    if (a !== b) hit[i] = 1;
  }
  // emitters that are new, gone or changed: every tile they emit into
  const key = (e: WaterModel["emitters"][number]) => JSON.stringify(e);
  const before = new Map<string, number>();
  for (const e of prev.emitters) before.set(key(e), (before.get(key(e)) ?? 0) + 1);
  const after = new Map<string, number>();
  for (const e of next.emitters) after.set(key(e), (after.get(key(e)) ?? 0) + 1);
  for (const e of prev.emitters) if ((after.get(key(e)) ?? 0) < (before.get(key(e)) ?? 0)) for (const c of e.cells) hit[c] = 1;
  for (const e of next.emitters) if ((before.get(key(e)) ?? 0) < (after.get(key(e)) ?? 0)) for (const c of e.cells) hit[c] = 1;
  return hit;
}

/** `hit` and WARM_MARGIN tiles round each of its tiles (Chebyshev), as a new mask. */
function widened(hit: Uint8Array, W: number, H: number): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!hit[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -WARM_MARGIN; dy <= WARM_MARGIN; dy++)
      for (let dx = -WARM_MARGIN; dx <= WARM_MARGIN; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) out[yy * W + xx] = 1;
      }
  }
  return out;
}

/** Each model's flow (prefill.ts `flowThrough`), kept while the model lives: the next edit's warm
 *  start compares against it. */
const flows = new WeakMap<WaterModel, { q: Float64Array; level: Float64Array; path: Uint8Array }>();
function flowOf(m: WaterModel): { q: Float64Array; level: Float64Array; path: Uint8Array } {
  let f = flows.get(m);
  if (!f) {
    const { q, level, path } = flowThrough(m);
    flows.set(m, (f = { q, level, path }));
  }
  return f;
}

/** The tiles the walk of the emitters `next` lost or weakened reached on the old ground (prefill.ts
 *  `flowThrough`'s path), or null when it lost none. */
function lostReach(prev: WaterModel, next: WaterModel): Uint8Array | null {
  const key = (e: WaterModel["emitters"][number]) => JSON.stringify(e);
  const left = new Map<string, number>();
  for (const e of next.emitters) left.set(key(e), (left.get(key(e)) ?? 0) + 1);
  const lost: WaterModel["emitters"] = [];
  for (const e of prev.emitters) {
    const n = left.get(key(e)) ?? 0;
    if (n > 0) left.set(key(e), n - 1);
    else lost.push(e);
  }
  return lost.length ? flowThrough({ ...prev, emitters: lost }).path : null;
}

/** The wet tiles whose water lost its feed on the new ground (D260), as a mask: of the water carried
 *  over to `next`'s ground (a tile keeps the old surface above its new floor, as `staleWater`), the
 *  tiles the canonical start (`start`, prefill.ts: every running emitter's water walked downhill or
 *  level over the filled surface, and the stored lakes up to their surface) no longer reaches, nor a
 *  tile round them (the water spreads a little further than that walk), and the tiles less water
 *  now flows through than before (a source removed or weakened, a river cut off or turned away). The
 *  flow is the walk's, which spreads over level ground, so a pool standing at its spill level counts
 *  a fall in it only where a source that is gone or weaker reached it: a cut far away re-routes the
 *  walk without taking any water off the pool, as a LargeRelic's levelling 17 tiles from a dam took a
 *  spring's walk off the dam's tiles and drained them while the water round them stayed (#756); in the
 *  open channel the flow sets the water's height. How far it must fall depends on its cause (D260 as
 *  ruled 2026-11-15): on a tile the walk of a source removed or weakened reached, over a tenth
 *  (`LOST_SHARE`), since that takes water out of the map; elsewhere ground only turned a walk, which
 *  moves water, and only a tile left under a tenth of its flow (`UNFED_SHARE`) counts.
 *  They take the canonical start, so their water drains in the edit's own journey as the canonical
 *  settle's does. Only water that lost its feed on the new ground: a tile the old ground's canonical
 *  start didn't reach either (nor a tile round it) holds water the settle itself spread there, a lake
 *  filling up behind a new dam, and keeps it (draining it made every later stroke's water refill it,
 *  all over the map). Null when the models differ in size. */
export function unfedTiles(from: WarmState, next: WaterModel, start: WaterState = prefill(next)): Uint8Array | null {
  const prev = from.model;
  if (prev.W !== next.W || prev.H !== next.H) return null;
  const { W, H } = next;
  const N = W * H;
  const d = from.water.depth;
  const reach = start.depth;
  const was = flowOf(prev).q;
  const { q: now, level } = flowOf(next);
  const before = reachOf(prev);
  const lost = lostReach(prev, next);
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!(d[i] > 0) || !(prev.floor[i] + d[i] > next.floor[i])) continue;
    if (now[i] < was[i] * (lost?.[i] ? LOST_SHARE : UNFED_SHARE) - 1e-9 && (!(level[i] > next.floor[i]) || lost?.[i])) {
      out[i] = 1;
      continue;
    }
    const x = i % W;
    const near = (r: ArrayLike<number>) => r[i] > 0 || (x > 0 && r[i - 1] > 0) || (x < W - 1 && r[i + 1] > 0) || (i >= W && r[i - W] > 0) || (i + W < N && r[i + W] > 0);
    if (near(reach)) continue;
    // (only water the canonical start reached before: water the settle spread past that walk on the
    // old ground too, a lake filling up behind a new dam, is fed as it was)
    if (!near(before)) continue;
    out[i] = 1;
  }
  return out;
}

/** The tiles of the pools the edit deepened (#1181), as a mask, or null when there are none: where the
 *  canonical start of `next` (prefill.ts) stands water at a level its walk reaches that is higher than
 *  the old ground's (a rim the edit raised, or a hollow the walk newly crosses), and the water carried
 *  over stands more than `PREVIEW_TOL` below it. The canonical settle starts such a pool full; kept as it
 *  was, a film on a tile that used to drain fills it only by a trickle, long after the preview has
 *  stopped (River Valley 96² seed 12, an Underground Ruins at 34,30 shut a pit off: 0.02 against the
 *  settle's 1.00). They take the canonical start, fed or not by D385's rule. */
export function deepenedPools(from: WarmState, next: WaterModel): Uint8Array | null {
  const prev = from.model;
  if (prev.W !== next.W || prev.H !== next.H) return null;
  const N = next.W * next.H;
  const was = flowOf(prev);
  const now = flowOf(next);
  const d = from.water.depth;
  let mask: Uint8Array | null = null;
  for (let i = 0; i < N; i++) {
    const lv = now.level[i];
    if (!now.path[i] || !(lv > next.floor[i])) continue;
    if (was.path[i] && !(lv > was.level[i] + 1e-9)) continue;
    const surface = prev.floor[i] + (d[i] > 0 ? d[i] : 0);
    if (!(Math.max(surface, next.floor[i]) < lv - PREVIEW_TOL)) continue;
    mask ??= new Uint8Array(N);
    mask[i] = 1;
  }
  return mask;
}

/** Each model's canonical start's water (the walk `unfedTiles` reads), kept while the model lives. */
const reaches = new WeakMap<WaterModel, Float64Array>();
function reachOf(m: WaterModel): Float64Array {
  let r = reaches.get(m);
  if (!r) reaches.set(m, (r = prefill(m).depth));
  return r;
}

/** The warm start of `next` from a settled state (see the file comment), and what feeds its water
 *  beside the running sources (`seeds`, a mask): the water kept from before and the kept stored
 *  lakes; null when nothing is kept. */
export function warmStart(from: WarmState, next: WaterModel): { state: WaterState; out: Float64Array | null; seeds: Uint8Array | null } {
  const init = prefill(next);
  const edited = editedTiles(from.model, next);
  if (!edited) return { state: init, out: null, seeds: null };
  // (the tiles that start again: those the edit changed, and the dry tiles round them; a wet tile round
  // them whose floor, dam and emitters the edit left alone keeps its water and its momentum, D(new-preview):
  // restarting a stretch of flowing river with the pre-fill's depth and no momentum left a step in its
  // surface that sloshed on past the preview's cap)
  // (such a tile is not a seed: like the restarted tiles it keeps its water only where a running
  // source, a stored lake or the other kept water reaches it, D385, so a pool whose only source the
  // edit deleted still dries)
  const changed = widened(edited, next.W, next.H);
  const beside = new Uint8Array(changed.length);
  for (let i = 0; i < changed.length; i++)
    if (changed[i] && !edited[i] && from.water.depth[i] > 0) {
      changed[i] = 0;
      beside[i] = 1;
    }
  // (water no source feeds any more starts as the canonical start has it: dry, D260)
  const unfed = unfedTiles(from, next, init);
  // (a pool the edit deepened starts full, as the canonical start has it, #1181)
  const deeper = deepenedPools(from, next);
  // (a lake the edit stored, a Fill: its tiles start from it, as the canonical start has them)
  const lakes = newLakeTiles(from.model, next);
  const N = next.W * next.H;
  const out = new Float64Array(4 * N);
  const po = from.water.out ?? null;
  // (the water kept from before, and the stored lakes, feed the pre-fill's water as the sources do)
  const seeds = keptSeeds(next) ?? new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (changed[i] || unfed?.[i] || lakes?.[i] || deeper?.[i]) continue;
    init.depth[i] = from.water.depth[i];
    init.contamination[i] = from.water.contamination[i];
    if (po) for (let k = 0; k < 4; k++) out[4 * i + k] = po[4 * i + k];
    if (!beside[i]) seeds[i] = 1;
  }
  // (water a removal drained feeds nothing)
  for (const i of next.drained ?? []) seeds[i] = 0;
  // (the pre-fill's water nothing reaches would come from nowhere: those tiles start dry, D385)
  const fed = fedTiles(next, init.depth, seeds);
  for (let i = 0; i < N; i++) {
    if (!(changed[i] || beside[i] || unfed?.[i] || deeper?.[i]) || fed[i] || !(init.depth[i] > 0)) continue;
    init.depth[i] = 0;
    init.contamination[i] = 0;
    if (beside[i]) for (let k = 0; k < 4; k++) out[4 * i + k] = 0;
  }
  // (and the unfed water a removal drained is gone, as the canonical settle takes it)
  drainUnfed(next, init.depth, init.contamination, po ? out : null);
  return { state: init, out: po ? out : null, seeds };
}

/** The tiles of the lakes `next` stores that `prev` does not (a Fill, a carve's oxbow lake just
 *  sealed), as a mask; null when there are none. */
export function newLakeTiles(prev: WaterModel, next: WaterModel): Uint8Array | null {
  if (!next.retained?.length || prev.W !== next.W || prev.H !== next.H) return null;
  const before = new Map<string, number>();
  for (const r of prev.retained ?? []) {
    const k = JSON.stringify(r);
    before.set(k, (before.get(k) ?? 0) + 1);
  }
  let mask: Uint8Array | null = null;
  for (const r of next.retained) {
    const k = JSON.stringify(r);
    const n = before.get(k) ?? 0;
    if (n > 0) {
      before.set(k, n - 1);
      continue;
    }
    mask ??= new Uint8Array(next.W * next.H);
    for (const i of r.tiles) mask[i] = 1;
  }
  return mask;
}

/** The preview's water for `next`, warm-started from `from` (a previous settle of the same map), in
 *  one go: `PreviewJob` with the preview's own cap of `PREVIEW_DAYS` (the build's preview and the
 *  generator's start-pad judgement). */
export function previewSettle(from: WarmState, next: WaterModel): CanonicalWater {
  const job = new PreviewJob(from, next, PREVIEW_DAYS);
  let r = job.advance(Infinity);
  while (!r) r = job.advance(Infinity);
  job.dispose();
  return r;
}

/** The water to show at once after an edit, before it settles again (live editing): the last
 *  settled water, carried over to the new ground. Where the ground changed, a tile that was wet
 *  keeps the old water surface above its new floor (none where the floor rose over it), and a tile
 *  that was dry stays dry; everything else is as it was. The background settle then flows it into
 *  the new shape (`PreviewJob`). Never written to a file. */
export function staleWater(from: WarmState, next: WaterModel): CanonicalWater {
  const N = next.W * next.H;
  const prev = from.water;
  const depth = prev.depth.slice();
  const contamination = prev.contamination.slice();
  // (on a map with caves or overhangs the lakes and removals are placed on their columns, features/build.ts)
  if (from.model.W === next.W && from.model.H === next.H) {
    const a = from.model.floor;
    const b = next.floor;
    for (let i = 0; i < N; i++) {
      if (a[i] === b[i] || !(depth[i] > 0)) continue;
      const surface = a[i] + depth[i];
      depth[i] = surface > b[i] ? surface - b[i] : 0;
    }
    // a lake the edit stored (a Fill) shows at once, and the unfed water a removal drained goes
    const lakes = next.stacked ? null : newLakeTiles(from.model, next);
    if (lakes) {
      const start = prefill(next);
      for (let i = 0; i < N; i++) {
        if (!lakes[i]) continue;
        depth[i] = start.depth[i];
        contamination[i] = start.contamination[i];
      }
    }
    if (!next.stacked) drainUnfed(next, depth, contamination);
  }
  return {
    settled: false,
    ticks: 0,
    depth,
    contamination,
    sat: prev.sat.slice(),
    ...(prev.out ? { out: prev.out.slice() } : {}),
    preview: true,
    stale: true,
  };
}

/** The preview's one settle driver: the warm start (`warmStart`), then the preview's stopping rule
 *  a day at a time while the water still moves, up to `days` in all, then the unfed water taken once
 *  and the water run on from there. Run a few ticks at a time it is the editor's background settle
 *  after an edit (live editing, D133's live water; `PREVIEW_JOB_DAYS`): the page gets the water as it
 *  flows and a newer edit can take over from the water as it stands (`state`). `previewSettle` runs
 *  it in one go with `PREVIEW_DAYS`. */
export class PreviewJob {
  /** The simulation; replaced once, by the one without its unfed water (`withoutUnfed`). */
  private current: WaterSim;
  private run: PreviewRun;
  private result: CanonicalWater | null = null;
  private readonly sealed: readonly number[] | undefined;
  private readonly startTicks: number;
  /** The ticks when the current `advance` began (its budget spans a new day's run too). */
  private before = 0;
  /** What feeds the water beside the sources (`warmStart`), and whether the unfed water has been
   *  taken once the water stopped. */
  private readonly seeds: Uint8Array | null;
  private drained = false;

  constructor(
    from: WarmState,
    readonly model: WaterModel,
    /** The most game days the water runs on while it still moves. */
    private readonly days: number = PREVIEW_JOB_DAYS,
  ) {
    const { state, out, seeds } = warmStart(from, model);
    this.current = new WaterSim(model, state);
    if (out) this.current.setOut(out);
    this.seeds = seeds;
    this.sealed = sealedTiles(model);
    this.run = new PreviewRun(this.current, this.sealed);
    this.startTicks = this.current.ticks;
  }

  /** The water as it runs (read it afresh: the unfed water's drain replaces it). */
  get sim(): WaterSim {
    return this.current;
  }

  /** Run at most `ticks` more ticks; the settled preview water when it is done, else null. */
  advance(ticks: number): CanonicalWater | null {
    if (this.result) return this.result;
    this.before = this.sim.ticks;
    const left = () => Math.max(0, ticks - (this.sim.ticks - this.before));
    let r = this.run.advance(ticks);
    for (;;) {
      // (the day's cap reached while the water still moves: another day, from the water as it stands)
      while (r && !r.settled && r.steadyTicks === undefined && this.sim.ticks - this.startTicks < this.days * TICKS_PER_DAY) {
        this.run = new PreviewRun(this.sim, this.sealed);
        r = this.run.advance(left());
      }
      if (!r) return null;
      // (stopped: the unfed water goes, once, and the water runs on from there, as the canonical
      // settle's does: fed is what a running source, a kept stored lake or the water kept from
      // before reaches. The warm start keeps the pre-fill's water wherever the walk's thin water
      // joins it to fed water, and that thin water drains as the water settles: a pit whose only
      // source was deleted, on flat ground another river's walk crosses, would otherwise keep its
      // pool, D385, D260)
      if (this.drained) break;
      this.drained = true;
      const next = withoutUnfed(this.model, this.current, {}, this.seeds ?? keptSeeds(this.model));
      if (!next) break;
      this.current.dispose();
      this.current = next;
      this.run = new PreviewRun(next, this.sealed);
      r = this.run.advance(left());
    }
    const sim = this.sim;
    this.result = { ...r, depth: sim.D.slice(), contamination: sim.C.slice(), sat: sim.saturation(), out: sim.out.slice(), preview: true };
    return this.result;
  }

  get ticks(): number {
    return this.sim.ticks;
  }

  /** Frees the job's simulation (WaterSim.dispose) when the job is replaced or dropped; `state` still reads it. */
  dispose(): void {
    this.current.dispose();
  }

  /** The water as it stands now: a newer edit warm-starts from it, so the water keeps flowing. */
  state(): WarmState {
    const sim = this.sim;
    return warmState(this.model, sim);
  }
}

/** The preview's stopping rule: `SettleRun`'s test with the stricter share and shorter period; it
 *  stops as soon as only sealed basins still change by evaporating (D222). */
class PreviewRun {
  private readonly run: SettleRun;
  constructor(sim: WaterSim, sealed: readonly number[] | undefined) {
    this.run = new SettleRun(sim, { checkEvery: PREVIEW_CHECK, maxDays: PREVIEW_DAYS, movedShare: PREVIEW_MOVED, tol: PREVIEW_TOL, sealed, passes: PREVIEW_PASSES });
  }
  advance(ticks: number) {
    return this.run.advance(ticks);
  }
}

export { TICKS_PER_DAY };
