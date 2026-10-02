// The editor's water preview (EDITOR_PLAN §6, PLAN §19.7): after an edit the water re-settles from
// its previous state instead of from the canonical start, so a local edit is previewed in about a
// second on a 256² map. The file never gets this water: an export (and the background check) runs
// the canonical settle (prefill.ts), which the preview only approximates while it runs.
//
// The warm start keeps the previous settled water (depth, badwater share and outflow momentum) on
// every tile whose ground, water objects and neighbourhood the edit left alone, and takes the
// canonical pre-fill on the rest: the ground an edit changed, the tiles near it, and the tiles of
// emitters that are new or changed. Then the exact simulation runs until the edit's water has
// found its level: checked every 64 ticks, the volume changes by under 0.2% and at most 0.05% of
// the map moves by more than 0.05 (a local change reaches a whole lake or sea, whose level then
// drifts by thousandths for a long time), with a cap of one game day. A sealed oxbow lake only
// evaporating is not the water still moving (D222): the preview stops once everything else has. The
// editor's background settle (`PreviewJob`) runs on past the day while the water still moves, up to
// the canonical settle's four days: stopping it there showed a filling lake as settled, and each
// stroke's draft then carried the whole settle on, sending the page a map of moving water every
// frame (the stutter after a volcano, D244's measurements).
//
// Water changes only through its causes (D260): water no running source can reach any more on the
// new ground (a pool whose source was removed, a stretch of river cut off, a lake breached) takes
// the canonical start too (dry), so it drains away in the edit's own journey instead of standing
// until the background check's settle; a lake a force or a Fill stored (`RetainedWater`) is its own
// cause and keeps its water while its hollow holds it, starting from it the moment it is stored. The
// unfed water Remove unfed water drained (the model's `drained`) goes at once (sim/fed.ts).

import { drainUnfed } from "./fed";
import { flowThrough, prefill, type CanonicalWater } from "./prefill";
import { sealedTiles, SettleRun, TICKS_PER_DAY, WaterSim, type WaterModel, type WaterState } from "./water";

/** How far (tiles, Chebyshev) around a changed tile the warm start takes the pre-fill. */
export const WARM_MARGIN = 2;
/** The preview's settle: checks every 64 ticks, at most 0.05% of tiles moving by more than 0.05,
 *  one day at most. */
export const PREVIEW_CHECK = 64;
export const PREVIEW_MOVED = 0.0005;
export const PREVIEW_TOL = 0.05;
export const PREVIEW_DAYS = 1;
/** The editor's background settle runs on past `PREVIEW_DAYS` while the water still moves (not only
 *  sealed basins evaporating), a day at a time, up to this many days in all: water that stops at the
 *  cap while still filling a lake or finding a new course is shown as settled and then moves again
 *  under the next stroke (the draft), every tile of it. The canonical settle's own limit. */
export const PREVIEW_JOB_DAYS = 4;

/** A settled state to start from: the water model it settled on, and its water with its outflows. */
export interface WarmState {
  model: WaterModel;
  water: CanonicalWater;
}

/** The tiles whose water the edit may have changed: their floor or dam, their emitters, and
 *  WARM_MARGIN tiles round them (a mask), or null when the models differ in size. */
export function changedTiles(prev: WaterModel, next: WaterModel): Uint8Array | null {
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
const flows = new WeakMap<WaterModel, Float64Array>();
function flowOf(m: WaterModel): Float64Array {
  let q = flows.get(m);
  if (!q) flows.set(m, (q = flowThrough(m).q));
  return q;
}

/** The wet tiles whose water lost its feed on the new ground (D260), as a mask: of the water carried
 *  over to `next`'s ground (a tile keeps the old surface above its new floor, as `staleWater`), the
 *  tiles the canonical start (`start`, prefill.ts: every running emitter's water walked downhill or
 *  level over the filled surface, and the stored lakes up to their surface) no longer reaches, nor a
 *  tile round them (the water spreads a little further than that walk), and the tiles less water
 *  now flows through than before (a source removed or weakened, a river cut off or turned away).
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
  const was = flowOf(prev);
  const now = flowOf(next);
  const before = reachOf(prev);
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!(d[i] > 0) || !(prev.floor[i] + d[i] > next.floor[i])) continue;
    if (now[i] < was[i] * 0.9 - 1e-9) {
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

/** Each model's canonical start's water (the walk `unfedTiles` reads), kept while the model lives. */
const reaches = new WeakMap<WaterModel, Float64Array>();
function reachOf(m: WaterModel): Float64Array {
  let r = reaches.get(m);
  if (!r) reaches.set(m, (r = prefill(m).depth));
  return r;
}

/** The warm start of `next` from a settled state (see the file comment). */
export function warmStart(from: WarmState, next: WaterModel): { state: WaterState; out: Float64Array | null } {
  const init = prefill(next);
  const changed = changedTiles(from.model, next);
  if (!changed) return { state: init, out: null };
  // (water no source feeds any more starts as the canonical start has it: dry, D260)
  const unfed = unfedTiles(from, next, init);
  // (a lake the edit stored, a Fill: its tiles start from it, as the canonical start has them)
  const lakes = newLakeTiles(from.model, next);
  const N = next.W * next.H;
  const out = new Float64Array(4 * N);
  const po = from.water.out ?? null;
  for (let i = 0; i < N; i++) {
    if (changed[i] || unfed?.[i] || lakes?.[i]) continue;
    init.depth[i] = from.water.depth[i];
    init.contamination[i] = from.water.contamination[i];
    if (po) for (let k = 0; k < 4; k++) out[4 * i + k] = po[4 * i + k];
  }
  // (and the unfed water a removal drained is gone, as the canonical settle takes it)
  drainUnfed(next, init.depth, init.contamination, po ? out : null);
  return { state: init, out: po ? out : null };
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

/** The preview's water for `next`, warm-started from `from` (a previous settle of the same map). */
export function previewSettle(from: WarmState, next: WaterModel): CanonicalWater {
  const { state, out } = warmStart(from, next);
  const sim = new WaterSim(next, state);
  if (out) sim.out.set(out);
  const run = new PreviewRun(sim, sealedTiles(next));
  let r = run.advance(Infinity);
  while (!r) r = run.advance(Infinity);
  return { ...r, depth: sim.D, contamination: sim.C, sat: sim.saturation(), out: sim.out.slice(), preview: true };
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
  if (from.model.W === next.W && from.model.H === next.H) {
    const a = from.model.floor;
    const b = next.floor;
    for (let i = 0; i < N; i++) {
      if (a[i] === b[i] || !(depth[i] > 0)) continue;
      const surface = a[i] + depth[i];
      depth[i] = surface > b[i] ? surface - b[i] : 0;
    }
    // a lake the edit stored (a Fill) shows at once, and the unfed water a removal drained goes
    const lakes = newLakeTiles(from.model, next);
    if (lakes) {
      const start = prefill(next);
      for (let i = 0; i < N; i++) {
        if (!lakes[i]) continue;
        depth[i] = start.depth[i];
        contamination[i] = start.contamination[i];
      }
    }
    drainUnfed(next, depth, contamination);
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

/** The editor's background settle after an edit (live editing, D133's live water): the preview's
 *  warm start and stopping rule, run a few ticks at a time so the page gets the water as it flows
 *  and a newer edit can take over from the water as it stands (`state`). */
export class PreviewJob {
  readonly sim: WaterSim;
  private run: PreviewRun;
  private result: CanonicalWater | null = null;
  private readonly sealed: readonly number[] | undefined;
  private readonly startTicks: number;
  /** The ticks when the current `advance` began (its budget spans a new day's run too). */
  private before = 0;

  constructor(
    from: WarmState,
    readonly model: WaterModel,
  ) {
    const { state, out } = warmStart(from, model);
    this.sim = new WaterSim(model, state);
    if (out) this.sim.out.set(out);
    this.sealed = sealedTiles(model);
    this.run = new PreviewRun(this.sim, this.sealed);
    this.startTicks = this.sim.ticks;
  }

  /** Run at most `ticks` more ticks; the settled preview water when it is done, else null. */
  advance(ticks: number): CanonicalWater | null {
    if (this.result) return this.result;
    this.before = this.sim.ticks;
    let r = this.run.advance(ticks);
    // (the day's cap reached while the water still moves: another day, from the water as it stands)
    while (r && !r.settled && r.steadyTicks === undefined && this.sim.ticks - this.startTicks < PREVIEW_JOB_DAYS * TICKS_PER_DAY) {
      this.run = new PreviewRun(this.sim, this.sealed);
      r = this.run.advance(Math.max(0, ticks - (this.sim.ticks - this.before)));
    }
    if (!r) return null;
    const sim = this.sim;
    this.result = { ...r, depth: sim.D.slice(), contamination: sim.C.slice(), sat: sim.saturation(), out: sim.out.slice(), preview: true };
    return this.result;
  }

  get ticks(): number {
    return this.sim.ticks;
  }

  /** The water as it stands now: a newer edit warm-starts from it, so the water keeps flowing. */
  state(): WarmState {
    const sim = this.sim;
    return { model: this.model, water: { settled: false, ticks: sim.ticks, depth: sim.D.slice(), contamination: sim.C.slice(), sat: new Uint8Array(sim.N), out: sim.out.slice(), preview: true } };
  }
}

/** The preview's stopping rule: `SettleRun`'s test with the stricter share and shorter period; it
 *  stops as soon as only sealed basins still change by evaporating (D222). */
class PreviewRun {
  private readonly run: SettleRun;
  constructor(sim: WaterSim, sealed: readonly number[] | undefined) {
    this.run = new SettleRun(sim, { checkEvery: PREVIEW_CHECK, maxDays: PREVIEW_DAYS, movedShare: PREVIEW_MOVED, tol: PREVIEW_TOL, sealed, untilSteady: true });
  }
  advance(ticks: number) {
    return this.run.advance(ticks);
  }
}

export { TICKS_PER_DAY };
