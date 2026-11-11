// Stage 0's second pass: the works sited by the land's day-1 moisture (docs/PREMISES.md §2.2 stage 0, §4.2 "As built
// (step 8)"). Stage 0 alone cannot see the green the lakes, the pool, the rim tarns and their runs already give: its
// plan-level guess predicted 90 to 220 green tiles where the land gave 0 to 90. So a premise that sites its works
// (`PremiseDef.site`) draws its plan once, lays its skeleton (the plan without the side network the works stand on:
// `PremiseDef.skeleton`) through stages 1 and 2, reads day 1's soil on that land (`ladder.ts` `dayOneSoil`, the
// ladder's own reading), and draws the side network again on it: each work where its water reaches ground that land
// leaves dry, its gain estimated by the soil's own rule (`soilReach`) on the skeleton's land with the work's water and
// the ground its template lays (`SiteModel.gain`). The plan that comes back is checked by every `plan` invariant again.
// Integer or portable maths only (D366): the plan it shapes builds the map.

import { dayOneSoil, soilReach } from "./ladder";
import { buildBench } from "./frame";
import { reliefBetween } from "./raster/relief";
import type { ReliefStyle } from "./style";
import type { PremiseDef, PremisePlan, SiteLand } from "./types";
import { waterByNumber, type StageWater } from "./water";
import type { MapSpec } from "../spec/mapspec";

export type { SiteLand };

/** The soil's furthest reach (2 × a full cluster's saturation of 8), and one tile more. */
const REACH = 17;

/** The skeleton's land (stages 1 and 2, in the theme's style where it has one, the start's `bench` built as the map's
 *  will be: `frame.ts` `buildBench`) and day 1's soil on it. */
export function siteLand(skeleton: PremisePlan, style?: ReliefStyle, refuse?: Refuse, bench = 0): SiteLand | { reason: string; id: string } {
  const w = waterByNumber(skeleton);
  const heights = reliefBetween(skeleton, w, style);
  buildBench(skeleton, w, heights, bench);
  const no = refuse?.(skeleton, w, heights);
  if (no) return no;
  return { W: skeleton.W, H: skeleton.H, heights, soil: dayOneSoil(w, heights) };
}

/** A check the skeleton's land can already fail (the side network the siting adds only takes ground from it): why
 *  the attempt is drawn again before its works are sited, or null. */
export type Refuse = (skeleton: PremisePlan, water: StageWater, heights: Uint8Array) => { reason: string; id: string } | null;

/** A premise's plan with its works sited by moisture (`PremiseDef.site`), or the plan as drawn where the premise
 *  sites none; or why it could not be sited, or `refuse`d on the skeleton's land (the attempt is drawn again). */
export function sitePlan(def: PremiseDef, spec: MapSpec, plan: PremisePlan, attempt: number, style?: ReliefStyle, refuse?: Refuse, bench = 0): { plan: PremisePlan; land?: SiteLand } | { reason: string; id?: string } {
  if (!def.site || !def.skeleton) return { plan };
  const land = siteLand(def.skeleton(plan), style, refuse, bench);
  if ("reason" in land) return land;
  const sited = def.site(spec, plan, attempt, land);
  return "reason" in sited ? sited : { plan: sited, land };
}

/** Water by tile: its surface as the soil reads it (ceiled: a pond a head over its spill at level `s` reads `s + 1`). */
export type Wet = Map<number, number>;
/** Ground by tile: the level a template lays (a bed's valley, a basin's beach), over the skeleton's. */
export type Ground = Map<number, number>;

/** The skeleton's land and day 1's soil, with the ground the works placed so far lay (`lay`), and the soil's reach of
 *  a work's water on it (`gain`). */
export class SiteModel {
  readonly W: number;
  readonly H: number;
  /** The land: the skeleton's, with each placed template's ground. */
  readonly land: Float64Array;
  /** Day 1's soil on the skeleton (2 water, 1 moist, 0 dry). */
  readonly soil: Uint8Array;
  /** 1 where the side network laid so far puts water (a basin, a bed's thread): no later body or pan stands on it. */
  readonly taken: Uint8Array;
  /** Gain estimates made (for the stage's timing). */
  calls = 0;
  constructor(l: SiteLand) {
    this.W = l.W;
    this.H = l.H;
    this.land = Float64Array.from(l.heights);
    this.soil = l.soil;
    this.taken = new Uint8Array(l.W * l.H);
  }

  /** The water a laid work puts on the land, kept so nothing later stands on it. */
  mark(wet: Wet): void {
    for (const i of wet.keys()) this.taken[i] = 1;
  }

  /** The ground a placed template lays, kept for every later estimate. */
  lay(ground: Ground): void {
    for (const [i, v] of ground) this.land[i] = v;
  }

  /** The level at a tile, under a template's ground where it lays one. */
  at(i: number, ground?: Ground): number {
    return ground?.get(i) ?? this.land[i];
  }

  /** The tiles the soil turns green or wet from `after` and not from `before` (the water a work needs done first),
   *  that day 1 leaves dry: a work's gain as the ladder measures it (`estimateGain`), on this land with `ground` laid. */
  gain(after: Wet, before: Wet = new Map(), ground: Ground = new Map()): number {
    this.calls++;
    const { W, H } = this;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (const i of after.keys()) {
      if (before.get(i) === after.get(i)) continue;
      const x = i % W;
      const y = (i - x) / W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < 0) return 0;
    // (counted within the soil's reach of the change; read from the water within its reach of those)
    const ix0 = Math.max(0, x0 - REACH);
    const iy0 = Math.max(0, y0 - REACH);
    const ix1 = Math.min(W - 1, x1 + REACH);
    const iy1 = Math.min(H - 1, y1 + REACH);
    const ox0 = Math.max(0, ix0 - REACH);
    const oy0 = Math.max(0, iy0 - REACH);
    const ox1 = Math.min(W - 1, ix1 + REACH);
    const oy1 = Math.min(H - 1, iy1 + REACH);
    const bw = ox1 - ox0 + 1;
    const bh = oy1 - oy0 + 1;
    const h = new Float64Array(bw * bh);
    const depth = new Float64Array(bw * bh);
    const con = new Float64Array(bw * bh);
    const reachOf = (wet: Wet): Uint8Array => {
      // (the land in the box, then the template's ground over it where it lays some: `at`)
      for (let y = oy0; y <= oy1; y++) {
        const row = (y - oy0) * bw - ox0;
        for (let x = ox0; x <= ox1; x++) {
          h[row + x] = this.land[y * W + x];
          depth[row + x] = 0;
        }
      }
      for (const [i, v] of ground) {
        const x = i % W;
        const y = (i - x) / W;
        if (x < ox0 || x > ox1 || y < oy0 || y > oy1) continue;
        h[(y - oy0) * bw + x - ox0] = v;
      }
      for (const [i, s] of wet) {
        const x = i % W;
        const y = (i - x) / W;
        if (x < ox0 || x > ox1 || y < oy0 || y > oy1) continue;
        const k = (y - oy0) * bw + x - ox0;
        // (the water's floor a level under its ceiled surface, half a level deep)
        h[k] = s - 1;
        depth[k] = 0.5;
      }
      return soilReach(h, { depth, contamination: con }, bw, bh);
    };
    const a = before.size ? reachOf(before) : new Uint8Array(bw * bh);
    const b = reachOf(after);
    let n = 0;
    for (let y = iy0; y <= iy1; y++)
      for (let x = ix0; x <= ix1; x++) {
        const k = (y - oy0) * bw + x - ox0;
        if (b[k] && !a[k] && !this.soil[y * W + x]) n++;
      }
    return n;
  }
}
