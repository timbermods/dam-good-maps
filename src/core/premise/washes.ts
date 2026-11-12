// The dry washes and the old bed on a premise's ground (`land/washes.ts`, the pass every generator path shares): cut
// into stage 2's ground once stage 3 has put the start, before the ladder reads the land. They keep off what stage 1
// decided (its beds, sills, lips, wadi strips and the start's 5 × 5, `WaterRaster.fixed`), the planned water and a
// margin round it, the works with the ladder's window round them, the badwater's niches, the start's
// ground and its ways out; the old bed starts behind the lip of a lake that holds water on day 1.

import { BED_FLOOR } from "../land/genome";
import { planWashes, startKeepOff, type Wash } from "../land/washes";
import { hash32 } from "../math/hash";
import { stream } from "../math/rng";
import type { PremiseLand } from "./map";
import type { PremisePlan } from "./types";

/** Round a work, kept clear (the ladder's window round what a work changes reaches about this far). */
const WORK_CLEAR = 20;
/** Round the falls, the empty basins and the works' laid ground (round the rest of what stage 1 decided, two), and
 *  round the badwater's niches. */
const FIXED_CLEAR = 3;
const NICHE_CLEAR = 5;

/** Cut the washes into `land.heights` for a start at `start` and add their ramps to `land.ramps`; the beds cut. */
export function premiseWashes(plan: PremisePlan, land: PremiseLand, start: { x: number; y: number }, attempt: number): Wash[] {
  const { W, H } = plan;
  const N = W * H;
  const r = land.water.raster;
  const h = land.heights;
  const off = new Uint8Array(N);
  const disc = (cx: number, cy: number, rad: number) => {
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        const x = Math.round(cx) + dx;
        const y = Math.round(cy) + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && dx * dx + dy * dy <= rad * rad) off[y * W + x] = 1;
      }
  };
  // (the water's own margin is the pass's; here the dry ground stage 1 decided, the falls and the empty basins)
  for (let i = 0; i < N; i++) {
    const wet = r.surface[i] === r.surface[i] && !(r.lake[i] && plan.bodies[r.lake[i] - 1].dry);
    if (r.pool[i] || r.crest[i] || (r.lake[i] && !wet)) disc(i % W, Math.floor(i / W), FIXED_CLEAR);
    else if (r.fixed[i] && !wet) disc(i % W, Math.floor(i / W), 2);
  }
  for (const wk of plan.works) disc(wk.at[0], wk.at[1], WORK_CLEAR);
  for (const at of Object.values(land.niches)) disc(at[0] + 1, at[1] + 1, NICHE_CLEAR);
  for (const ts of [...Object.values(land.laid.plugs), ...Object.values(land.laid.banks)]) for (const i of ts) disc(i % W, Math.floor(i / W), FIXED_CLEAR);
  const ways: number[] = [];
  for (const [a, b] of land.ramps ?? []) ways.push(a, b);
  startKeepOff(h, W, H, [start], ways, off);
  // the water as planned: its surface where a body or a channel holds water on day 1
  const surface = new Float64Array(N).fill(NaN);
  const lakes = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    const s = r.surface[i];
    if (!(s === s)) continue;
    const body = r.lake[i] ? plan.bodies[r.lake[i] - 1] : null;
    if (body?.dry) continue;
    surface[i] = s;
    if (body && !body.backwater) {
      const l = lakes.get(r.lake[i]) ?? [];
      l.push(i);
      lakes.set(r.lake[i], l);
    }
  }
  const { beds, steps } = planWashes({ W, H, heights: h, surface, lakes: [...lakes.values()], keepOff: off, floor: BED_FLOOR, rng: stream(plan.seed, "washes", attempt), seed: hash32(plan.seed, "washes", attempt), starts: [start] });
  // (their natural ramps join the start's ways out in the field: the colony walks into the beds and across them)
  if (steps.length) land.ramps = [...(land.ramps ?? []), ...steps];
  return beds;
}
