// A carve as the editor shows it (PLAN §20 D321, items 29 and 30): the whole run is worked out first,
// a slice at a time (the worker answers the page between slices; the head's surge gathers at the
// origin meanwhile), each step's changes recorded; then it is played back at the pace the player
// chose (Fast: the land final within about two seconds of the gesture; Slow forces: about four times as
// long). The land, the objects and the sources change only as the head reaches them; the water stays
// as it was until the land is final. What is kept is always the run's own final map, so the result
// never depends on the pace.
//
// A river drawn uphill (D344, A5) still runs downhill, from the line's higher end (item 41: the land
// decides where its water goes), but it is shown the way it was drawn: `fromEnd` plays its course from
// its end back to its origin, each tile taking its final level as the head reaches it and each object
// going as it does. Only the showing changes: the land kept is the same.
//
// Nothing pops in after the cut (D368 (9)): the river's own shape, its depth and its Banks, is worked
// out once the canyon is cut (river.ts), all in the run's last step. Shown, each of those tiles takes
// its level a few stations behind the head as it passes, the banks settling just behind the cut, and
// what stood on them goes then; the last frame adds nothing the head didn't just reach.

import type { EntitySpec } from "../../format/entities";
import type { ForceHead, ForceMap } from "../force";
import type { CarveRun, Station } from "./run";

export class CarvePlay {
  /** The map as it shows now: the ground and objects at `shown` steps, the water as it was. */
  readonly map: ForceMap;
  /** Steps shown. */
  private at = 0;
  /** Each step's changes: the tiles and their new levels, interleaved. */
  private readonly changes: Int32Array[] = [];
  /** The head after each step, and how much of the course there was. */
  private readonly heads: ForceHead[] = [];
  private readonly lengths: number[] = [];
  private readonly first: ForceHead;
  /** The objects when it started (its own sources among them). */
  private readonly objects: EntitySpec[];
  private removedShown = 0;
  /** Its own sources, or an unleashed one: they follow the ground as it is cut. */
  private readonly riders: boolean;

  /** Shown from its end (A5): each step's changes, the latest step first, each tile once at its final
   *  level; made once it is worked out. */
  private backward: Int32Array[] | null = null;
  /** Objects whose ground the run's last step changed: the step they go at as shown, once the last
   *  step's changes are spread behind the head (D368 (9)). */
  private readonly goneSpread = new Map<string, number>();

  constructor(
    readonly run: CarveRun,
    /** Shown from the course's end back to its origin: the way its line was drawn (D344, A5). */
    readonly fromEnd = false,
  ) {
    const m = run.map;
    this.objects = m.entities.slice();
    this.map = { ...m, heights: run.original.slice(), entities: this.objects.slice(), water: { depth: m.water.depth.slice(), contamination: m.water.contamination.slice() }, ...(m.lava ? { lava: m.lava.slice() } : {}) };
    this.first = { ...run.head };
    // (drawn from its end: its surge gathers there while it is worked out)
    const end = run.intent.end;
    if (fromEnd && end !== undefined) this.first = { ...this.first, x: end % m.W, y: Math.floor(end / m.W), z: m.heights[end], dx: -this.first.dx, dy: -this.first.dy };
    this.riders = run.group.length > 0 || run.unleashedId !== null;
    this.record([]);
  }

  /** The forward step shown at step `k` from the end (k from 1 to total). */
  private forward(k: number): number {
    return this.total - k + 1;
  }

  /** The changes shown from the end: step k shows the forward step total - k + 1's tiles, each tile once,
   *  at the level its latest step left (its final one). */
  private backwardChanges(): Int32Array[] {
    if (this.backward) return this.backward;
    const total = this.total;
    const seen = new Uint8Array(this.map.heights.length);
    const out: Int32Array[] = [new Int32Array(0)];
    for (let s = total; s >= 1; s--) {
      const c = this.changes[s];
      const keep: number[] = [];
      for (let j = 0; j < c.length; j += 2)
        if (!seen[c[j]]) {
          seen[c[j]] = 1;
          keep.push(c[j], c[j + 1]);
        }
      out.push(Int32Array.from(keep));
    }
    return (this.backward = out);
  }

  /** The step an object goes at, as shown (from the end: when the head reaches it coming back). */
  private goneAt(s: number, id?: string): number {
    const at = id !== undefined ? (this.goneSpread.get(id) ?? s) : s;
    return this.fromEnd ? this.forward(at) : at;
  }

  /** How far behind the head (stations) the river's shape settles. */
  private static readonly SETTLE = 6;

  /** The run's last step, its river's shape among it, spread back along the course (D368 (9)): each of
   *  its tiles shown at the step the head passed its nearest station, SETTLE stations on, and never
   *  before the last earlier step that changed it; what stood there goes at that step too. */
  private spread(): void {
    const last = this.total;
    const c = this.changes[last];
    const path = this.run.path;
    if (last < 2 || !c.length || path.length < 2) return;
    const N = this.map.heights.length;
    const W = this.map.W;
    const earlier = new Int32Array(N);
    for (let s = 1; s < last; s++) {
      const d = this.changes[s];
      for (let j = 0; j < d.length; j += 2) earlier[d[j]] = s;
    }
    // (the step the head reached each station at)
    const reached = new Int32Array(path.length).fill(last);
    for (let s = 1, k = 0; s <= last; s++) for (const n = Math.min(this.lengths[s], path.length); k < n; k++) reached[k] = s;
    const at = new Int32Array(N).fill(-1);
    const by: number[][] = Array.from({ length: last + 1 }, () => []);
    for (let j = 0; j < c.length; j += 2) {
      const i = c[j];
      const x = (i % W) + 0.5;
      const y = Math.floor(i / W) + 0.5;
      let near = 0;
      let best = Infinity;
      for (let k = 0; k < path.length; k++) {
        const d = (path[k].x - x) * (path[k].x - x) + (path[k].y - y) * (path[k].y - y);
        if (d < best) {
          best = d;
          near = k;
        }
      }
      const s = Math.min(last, Math.max(reached[Math.min(path.length - 1, near + CarvePlay.SETTLE)], earlier[i] + 1));
      at[i] = s;
      by[s].push(i, c[j + 1]);
    }
    for (let s = 1; s <= last; s++) {
      if (!by[s].length) continue;
      if (s === last) {
        this.changes[s] = Int32Array.from(by[s]);
        continue;
      }
      const merged = new Int32Array(this.changes[s].length + by[s].length);
      merged.set(this.changes[s]);
      merged.set(by[s], this.changes[s].length);
      this.changes[s] = merged;
    }
    if (!by[last].length) this.changes[last] = new Int32Array(0);
    for (const [id, s] of this.run.removedAt) {
      if (s !== last) continue;
      const e = this.objects.find((o) => o.id === id);
      const t = e ? at[e.y * W + e.x] : -1;
      if (t > 0) this.goneSpread.set(id, t);
    }
  }

  private record(changed: readonly number[]): void {
    const h = this.run.map.heights;
    const c = new Int32Array(changed.length * 2);
    changed.forEach((i, k) => {
      c[2 * k] = i;
      c[2 * k + 1] = h[i];
    });
    this.changes.push(c);
    const r = this.run.head;
    this.heads.push({ ...r, ...(r.lanes ? { lanes: r.lanes.map((l) => ({ ...l })) } : {}) });
    this.lengths.push(this.run.path.length);
  }

  /** It is all worked out. */
  get planned(): boolean {
    return this.run.done;
  }

  /** Work it out for about `budgetMs` (Infinity: to the end); true once all of it is. */
  plan(budgetMs: number): boolean {
    const t0 = performance.now();
    while (!this.run.done) {
      this.record(this.run.step());
      if (this.run.done) this.spread();
      if (performance.now() - t0 > budgetMs) break;
    }
    return this.run.done;
  }

  /** Steps to show in all (once planned), and shown so far. */
  get total(): number {
    return this.changes.length - 1;
  }
  get shown(): number {
    return this.at;
  }

  /** Show `n` steps more (never past what is worked out). */
  advance(n: number): void {
    this.showTo(Math.min(this.total, this.at + n));
  }

  /** Show the land at step `k`. */
  showTo(k: number): void {
    const heights = this.map.heights;
    const changes = this.fromEnd && k > this.at ? this.backwardChanges() : this.changes;
    for (let s = this.at + 1; s <= k; s++) {
      const c = changes[s];
      for (let j = 0; j < c.length; j += 2) heights[c[j]] = c[j + 1];
    }
    if (this.map.lava) for (let s = this.at + 1; s <= k; s++) for (let j = 0; j < changes[s].length; j += 2) this.map.lava[changes[s][j]] &= (1 << heights[changes[s][j]]) - 1;
    this.at = k;
    // the objects the head has reached go; its own sources and an unleashed one ride the ground
    const removed = this.run.removedAt;
    const W = this.map.W;
    let gone = 0;
    for (const [id, s] of removed) if (this.goneAt(s, id) <= k) gone++;
    if (gone !== this.removedShown || this.riders) {
      this.removedShown = gone;
      this.map.entities = this.objects
        .filter((e) => !(removed.has(e.id) && this.goneAt(removed.get(e.id)!, e.id) <= k))
        .map((e) => {
          const own = this.run.group.find((g) => g.id === e.id);
          if (own) return e.z === heights[own.tile] ? e : { ...e, z: heights[own.tile] };
          if (e === this.unleashedObject()) return { ...e, z: heights[e.y * W + e.x] };
          return e;
        });
    }
  }

  private unleashedObject(): EntitySpec | undefined {
    const id = this.run.unleashedId;
    return id ? this.objects.find((e) => e.id === id) : undefined;
  }

  /** The head where the shown land has it (at the origin while it is worked out; from the end, at the
   *  end, heading back up its course). */
  get head(): ForceHead {
    if (this.at === 0) return this.first;
    if (!this.fromEnd) return this.heads[this.at];
    const h = this.heads[this.forward(this.at)];
    return { ...h, dx: -h.dx, dy: -h.dy };
  }

  /** The last stretch of the course shown (the effects' muddy surge): behind the head, the way it
   *  goes. */
  trail(): Station[] {
    if (!this.fromEnd) {
      const n = this.lengths[this.at];
      return this.run.path.slice(Math.max(0, n - 28), n);
    }
    if (this.at === 0) return [];
    const n = Math.max(0, this.lengths[this.forward(this.at)] - 1);
    return this.run.path
      .slice(n, n + 28)
      .reverse()
      .map((q) => ({ ...q, dx: -q.dx, dy: -q.dy }));
  }

  /** Shown to the end. */
  get done(): boolean {
    return this.planned && this.at >= this.total;
  }
}
