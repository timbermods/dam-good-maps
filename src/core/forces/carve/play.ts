// A carve as the editor shows it (PLAN §20 D321, items 29 and 30): the whole run is worked out first,
// a slice at a time (the worker answers the page between slices; the head's surge gathers at the
// origin meanwhile), each step's changes recorded; then it is played back at the pace the player
// chose (Fast: the land final within about two seconds of the gesture; Watch: about four times as
// long). The land, the objects and the sources change only as the head reaches them; the water stays
// as it was until the land is final. What is kept is always the run's own final map, so the result
// never depends on the pace.

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

  constructor(readonly run: CarveRun) {
    const m = run.map;
    this.objects = m.entities.slice();
    this.map = { ...m, heights: run.original.slice(), entities: this.objects.slice(), water: { depth: m.water.depth.slice(), contamination: m.water.contamination.slice() }, ...(m.lava ? { lava: m.lava.slice() } : {}) };
    this.first = { ...run.head };
    this.riders = run.group.length > 0 || run.unleashedId !== null;
    this.record([]);
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
    for (let s = this.at + 1; s <= k; s++) {
      const c = this.changes[s];
      for (let j = 0; j < c.length; j += 2) heights[c[j]] = c[j + 1];
    }
    if (this.map.lava) for (let s = this.at + 1; s <= k; s++) for (let j = 0; j < this.changes[s].length; j += 2) this.map.lava[this.changes[s][j]] &= (1 << heights[this.changes[s][j]]) - 1;
    this.at = k;
    // the objects the head has reached go; its own sources and an unleashed one ride the ground
    const removed = this.run.removedAt;
    const W = this.map.W;
    let gone = 0;
    for (const s of removed.values()) if (s <= k) gone++;
    if (gone !== this.removedShown || this.riders) {
      this.removedShown = gone;
      this.map.entities = this.objects
        .filter((e) => !((removed.get(e.id) ?? Infinity) <= k))
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

  /** The head where the shown land has it (at the origin while it is worked out). */
  get head(): ForceHead {
    return this.at === 0 ? this.first : this.heads[this.at];
  }

  /** The last stretch of the course shown (the effects' muddy surge). */
  trail(): Station[] {
    const n = this.lengths[this.at];
    return this.run.path.slice(Math.max(0, n - 28), n);
  }

  /** Shown to the end. */
  get done(): boolean {
    return this.planned && this.at >= this.total;
  }
}
