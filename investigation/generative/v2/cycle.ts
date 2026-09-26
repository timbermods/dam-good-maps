// The cheap cycle signature (design version 2, task d): the exact cycle model's signature
// (investigation/cycles, summarize.ts) estimated in a few milliseconds from the settled water with
// the analytic drought (sim/drought.ts, D101), so the generator can read how a map behaves through
// the weather for every candidate. The exact model stays the validation (simplay-v2.ts runs it on a
// sample and compares).
// - short and long retention: the water left after the first Normal drought (3 days: 2 in the
//   weather seed's schedule after a day of ramp-down) and after the later Hard drought (26 days);
// - start days: how many days of a drought the start keeps pumpable clean water within its rule;
// - dried share: wet tiles dry after the long drought;
// - river share: the share of the wet tiles that run (not standing in a basin): a badtide turns
//   every source bad (VERIFIED.md), so running water is where badwater goes first, a proxy for the
//   exact model's badwater exposure.
// The group uses the exact signature's bins (longRetention, exposure, start days).

import { spillLevels } from "../../../src/core/sim/prefill";
import { droughtStorage } from "../../../src/core/sim/drought";
import type { WaterModel } from "../../../src/core/sim/water";
import { shoreWalkFrom } from "./start";

export const FIRST_NORMAL_DAYS = 3;
export const LATE_HARD_DAYS = 26;
const DAY_STEPS = [0, 1, 2, 3, 5, 7, 9, 14, 20, 26];

export interface CheapCycle {
  shortRetention: number;
  longRetention: number;
  startDays: number;
  driedShare: number;
  riverShare: number;
  /** Clean water within the start's water rule still pumpable after the first Normal drought. */
  startFirstDrought: boolean;
  vector: number[];
  group: string;
}

export function cheapCycle(b: { W: number; H: number; heights: Uint8Array; water: ArrayLike<number>; contamination: ArrayLike<number>; waterModel: WaterModel; start?: { x: number; y: number } | null }, rule: number): CheapCycle {
  const { W, H, heights: h, water: D, contamination: C, waterModel: m } = b;
  const N = W * H;
  let vol = 0;
  let wet = 0;
  for (let i = 0; i < N; i++) {
    vol += D[i];
    if (D[i] > 0.05) wet++;
  }
  const keptAt = new Map<number, Float64Array>();
  const kept = (d: number) => {
    let k = keptAt.get(d);
    if (!k) keptAt.set(d, (k = droughtStorage(m, D, d)));
    return k;
  };
  const sum = (a: ArrayLike<number>) => {
    let s = 0;
    for (let i = 0; i < N; i++) s += a[i];
    return s;
  };
  const shortRetention = vol > 0 ? sum(kept(FIRST_NORMAL_DAYS)) / vol : 0;
  const long = kept(LATE_HARD_DAYS);
  const longRetention = vol > 0 ? sum(long) / vol : 0;
  let dried = 0;
  for (let i = 0; i < N; i++) if (D[i] > 0.05 && long[i] < 0.05) dried++;
  const spill = spillLevels(m);
  let running = 0;
  for (let i = 0; i < N; i++) if (D[i] > 0.05 && !(spill[i] - m.floor[i] > 0.15)) running++;
  // the start: the longest drought (of the steps) it keeps pumpable water through
  let startDays = 0;
  let first = false;
  if (b.start) {
    const ok = (k: ArrayLike<number>) => {
      const w = shoreWalkFrom(h, W, H, k, C, rule);
      let best = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = Math.min(best, w[(b.start!.y + dy) * W + b.start!.x + dx]);
      return best <= rule;
    };
    first = ok(kept(FIRST_NORMAL_DAYS));
    for (const d of DAY_STEPS) {
      if (d === 0) {
        if (!ok(D)) break;
        continue;
      }
      if (!ok(kept(d))) break;
      startDays = d;
    }
  }
  const driedShare = wet ? dried / wet : 0;
  const riverShare = wet ? running / wet : 0;
  const bin = (v: number, cuts: number[]) => cuts.filter((c) => v >= c).length;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const vector = [shortRetention, longRetention, startDays / 26, driedShare, riverShare].map((x) => Math.min(1, Math.max(0, x)));
  return {
    shortRetention: r3(shortRetention),
    longRetention: r3(longRetention),
    startDays,
    driedShare: r3(driedShare),
    riverShare: r3(riverShare),
    startFirstDrought: first,
    vector: vector.map(r3),
    group: [bin(longRetention, [0.05, 0.25, 0.5, 0.75]), bin(riverShare, [0.25, 0.5, 0.75]), bin(startDays, [1, 7, 14, 26])].join("/"),
  };
}
