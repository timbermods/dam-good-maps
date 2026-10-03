// Your maps' background saving (PLAN §20 D234 (1), docs/UI-BRIEF.md §6): an edited map is kept
// quietly after its edits settle, never slowing the editor and never waited on. Replacing an edited
// map (Generate, a candidate, a real place, another of Your maps) saves it at once, still in the
// background: the page doesn't wait, since undo brings the map back from memory.
//
// The snapshot is taken only when the save runs (`take`), so a burst of edits costs one project
// file. Saves of one map never overlap: a change during a write is saved after it.

import { withSize, type StoreResult, type YourMapEntry, type YourMapsStore } from "./yourMaps";

export interface Snapshot {
  entry: YourMapEntry;
  project: Uint8Array;
}

export interface SaverOptions {
  /** Quiet time after the last edit before a save, in ms. */
  delay?: number;
  /** Timers (tests pass their own). */
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(t: unknown): void;
  /** Every save's result: the page says plainly when storage is full (`storeProblem`). */
  onResult?(r: StoreResult, id: string): void;
}

interface Pending {
  take: () => Snapshot | Promise<Snapshot>;
  timer: unknown;
}

export class YourMapsSaver {
  private pending = new Map<string, Pending>();
  private writing = new Map<string, Promise<void>>();
  private readonly delay: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (t: unknown) => void;

  constructor(
    private store: Pick<YourMapsStore, "put">,
    private opts: SaverOptions = {},
  ) {
    this.delay = opts.delay ?? 1500;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  }

  /** The map changed (an edit): save it once its edits settle. */
  changed(id: string, take: () => Snapshot | Promise<Snapshot>): void {
    const p = this.pending.get(id);
    if (p) this.clearTimer(p.timer);
    this.pending.set(id, { take, timer: this.setTimer(() => void this.flush(id), this.delay) });
  }

  /** Save now what is waiting (one map, or all). Nobody needs to await it. */
  flush(id?: string): Promise<void> {
    const ids = id === undefined ? [...this.pending.keys()] : this.pending.has(id) ? [id] : [];
    return Promise.all(ids.map((k) => this.run(k))).then(() => undefined);
  }

  /** Whether a save is waiting or being written (for tests and the page's leave warning). */
  busy(): boolean {
    return this.pending.size > 0 || this.writing.size > 0;
  }

  private run(id: string): Promise<void> {
    const p = this.pending.get(id);
    if (!p) return this.writing.get(id) ?? Promise.resolve();
    this.clearTimer(p.timer);
    this.pending.delete(id);
    const before = this.writing.get(id) ?? Promise.resolve();
    const w = before
      .then(async () => {
        let r: StoreResult;
        try {
          const s = await p.take();
          r = await this.store.put(withSize(s.entry, s.project), s.project);
        } catch {
          r = { ok: false, reason: "unavailable" };
        }
        this.opts.onResult?.(r, id);
      })
      .finally(() => {
        if (this.writing.get(id) === w) this.writing.delete(id);
      });
    this.writing.set(id, w);
    return w;
  }
}
