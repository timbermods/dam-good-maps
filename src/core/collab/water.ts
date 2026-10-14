// The water in the background. Applying an entry needs none: a peer's session stays in the defer mode,
// where an edit shows the last settled water carried over, and the water, the soil and which trees and
// bushes stand and live are settled afterwards, for the latest sequence only. The canonical settle has no
// memory (core/sim/prefill.ts `canonicalRun`: it starts from the ground, not from the water before), so a
// settle that a newer entry overtakes is simply dropped and started again on the new map, as the checks
// worker does in single-player (`adoptWater` when `sameWaterModel` holds).
//
// "In the background" is an explicit step here: `pump(ticks)` runs a slice and says whether the water
// has settled, so the page's worker calls it between messages and a test calls it when it chooses.

import type { MapSession } from "../doc/session";
import { plainEntities } from "../forces/force";
import { murmur3 } from "../math/hash";
import { stable } from "./mapState";

export class WaterBarrier {
  private run: ReturnType<MapSession["canonicalRun"]> | null = null;

  constructor(readonly session: MapSession) {
    // (an edit never waits on the water: it shows the last settled water carried over)
    session.setWaterMode("defer");
  }

  /** The map's water is the canonical settle of the ground as it stands. */
  get settled(): boolean {
    return !this.session.waterPending;
  }

  /** The map changed: a settle in progress is for ground that is gone. */
  invalidate(): void {
    this.run = null;
  }

  /** Run a slice of the settle (`ticks` of the water's clock; the default runs it to its end). True when the water has settled. */
  pump(ticks = Infinity): boolean {
    if (this.settled) return true;
    this.run ??= this.session.canonicalRun();
    const water = this.run.advance(ticks);
    if (!water) return false;
    const run = this.run;
    this.run = null;
    if (this.session.adoptWater(run.model, water)) return true;
    // (the map changed under the settle: start again on it)
    return this.settled;
  }

  /** Settle now, to the end (a force plans on the settled water of the entry before it, so it waits for it). */
  settleNow(): void {
    while (!this.pump()) {
      /* the slices end when the settle has */
    }
  }
}

/** A short text standing for the whole map once its water has settled: everything `stateHash` covers,
 *  all the objects (the resources too), the water and the contamination. The host announces it for the
 *  sequence it settled at; a peer compares its own at that sequence. */
export function settledHash(session: MapSession): string {
  const b = session.built;
  const entities = new TextEncoder().encode(stable(plainEntities(b.entities)));
  const water = new Uint8Array(b.water.buffer, b.water.byteOffset, b.water.byteLength);
  const dirty = new Uint8Array(b.contamination.buffer, b.contamination.byteOffset, b.contamination.byteLength);
  const all = new Uint8Array(entities.length + water.length + dirty.length + b.heights.length);
  all.set(entities, 0);
  all.set(water, entities.length);
  all.set(dirty, entities.length + water.length);
  all.set(b.heights, entities.length + water.length + dirty.length);
  return murmur3(all, 0x363).toString(16).padStart(8, "0");
}
