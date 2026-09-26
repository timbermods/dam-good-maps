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
// drifts by thousandths for a long time), with a cap of one game day.

import { prefill, type CanonicalWater } from "./prefill";
import { SettleRun, TICKS_PER_DAY, WaterSim, type WaterModel, type WaterState } from "./water";

/** How far (tiles, Chebyshev) around a changed tile the warm start takes the pre-fill. */
export const WARM_MARGIN = 2;
/** The preview's settle: checks every 64 ticks, at most 0.05% of tiles moving by more than 0.05,
 *  one day at most. */
export const PREVIEW_CHECK = 64;
export const PREVIEW_MOVED = 0.0005;
export const PREVIEW_TOL = 0.05;
export const PREVIEW_DAYS = 1;

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

/** The warm start of `next` from a settled state (see the file comment). */
export function warmStart(from: WarmState, next: WaterModel): { state: WaterState; out: Float64Array | null } {
  const init = prefill(next);
  const changed = changedTiles(from.model, next);
  if (!changed) return { state: init, out: null };
  const N = next.W * next.H;
  const out = new Float64Array(4 * N);
  const po = from.water.out ?? null;
  for (let i = 0; i < N; i++) {
    if (changed[i]) continue;
    init.depth[i] = from.water.depth[i];
    init.contamination[i] = from.water.contamination[i];
    if (po) for (let k = 0; k < 4; k++) out[4 * i + k] = po[4 * i + k];
  }
  return { state: init, out: po ? out : null };
}

/** The preview's water for `next`, warm-started from `from` (a previous settle of the same map). */
export function previewSettle(from: WarmState, next: WaterModel): CanonicalWater {
  const { state, out } = warmStart(from, next);
  const sim = new WaterSim(next, state);
  if (out) sim.out.set(out);
  const run = new PreviewRun(sim);
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
  if (from.model.W === next.W && from.model.H === next.H) {
    const a = from.model.floor;
    const b = next.floor;
    for (let i = 0; i < N; i++) {
      if (a[i] === b[i] || !(depth[i] > 0)) continue;
      const surface = a[i] + depth[i];
      depth[i] = surface > b[i] ? surface - b[i] : 0;
    }
  }
  return {
    settled: false,
    ticks: 0,
    depth,
    contamination: prev.contamination.slice(),
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
  private readonly run: PreviewRun;
  private result: CanonicalWater | null = null;

  constructor(
    from: WarmState,
    readonly model: WaterModel,
  ) {
    const { state, out } = warmStart(from, model);
    this.sim = new WaterSim(model, state);
    if (out) this.sim.out.set(out);
    this.run = new PreviewRun(this.sim);
  }

  /** Run at most `ticks` more ticks; the settled preview water when it is done, else null. */
  advance(ticks: number): CanonicalWater | null {
    if (this.result) return this.result;
    const r = this.run.advance(ticks);
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

/** The preview's stopping rule: `SettleRun`'s test with the stricter share and shorter period. */
class PreviewRun {
  private readonly run: SettleRun;
  constructor(sim: WaterSim) {
    this.run = new SettleRun(sim, { checkEvery: PREVIEW_CHECK, maxDays: PREVIEW_DAYS, movedShare: PREVIEW_MOVED, tol: PREVIEW_TOL });
  }
  advance(ticks: number) {
    return this.run.advance(ticks);
  }
}

export { TICKS_PER_DAY };
