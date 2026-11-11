// A body's bed by number (docs/PREMISES.md §2.2, stage 1; four-lakes-design's lake-bed block): its outline from its
// arms, wandering a little so no shore follows a compass; inside, a shelf at the sill, a margin, then the floor at the
// lake's `deep`, which stage 0 sets by number so the lake keeps most of its water through a drought (`levels.ts`
// `holdDeep`), and the drowned river's line down the main arm a level deeper (drop-offs, never depth rings); islands a
// level over the water. A spring
// tarn deepens from its shore; an empty basin is a flat floor a level under its sill crossed by its old river's line; the springs'
// pool is a level deep inside a ring at its sill. In the start's bay under the landmark (the first frame's water)
// the bed is a level under the sill but for the drowned river's ribbon, two (§4.3: deep water reads black).

import { BED_FLOOR } from "../../land/genome";
import { fbm } from "../../math/noise";
import { bodyDist, pathDist, spineDist } from "../geom";
import { designLevel, type WaterTable } from "../levels";
import type { Body, Point, PremisePlan, Spine } from "../types";
import { box, seedOf, type WaterRaster } from "./field";

/** How far an outline wanders from its arms, in tiles: little, the shape is the plan's. */
const WANDER: Record<Body["kind"], number> = { lake: 1.2, tarn: 0.9, basin: 0.9, kettle: 0.9, pool: 0.4 };
/** An empty basin's lobes (an old lake bed, never a capsule). */
const LOBES = 1.6;
/** The least gap a body's water keeps from another body's outline, so a guard tile fits between them. */
const APART = 2;

const centre = (s: Spine): Point[] => s.map(([x, y]) => [x, y] as Point);

/** Each body's water tiles, beds and islands, in the plan's order (an earlier body keeps a tile). */
export function rasterBodies(plan: PremisePlan, table: WaterTable, r: WaterRaster): void {
  const { W, H } = r;
  const boxes = plan.bodies.map((b) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const arm of b.arms)
      for (const [x, y, rad] of arm) {
        x0 = Math.min(x0, x - rad);
        y0 = Math.min(y0, y - rad);
        x1 = Math.max(x1, x + rad);
        y1 = Math.max(y1, y + rad);
      }
    return [x0, y0, x1, y1];
  });
  const bay = bayOf(plan);
  plan.bodies.forEach((b, k) => {
    const wander = WANDER[b.kind] + (b.dry ? LOBES : 0);
    const [bx0, by0, bx1, by1] = boxes[k];
    const [x0, y0, x1, y1] = box(W, H, bx0 - wander - 1, by0 - wander - 1, bx1 + wander + 1, by1 + wander + 1);
    // the bodies near enough to matter for keeping apart
    const others = plan.bodies.filter((o, j) => j !== k && boxes[j][0] - APART - 1 < x1 && boxes[j][2] + APART + 1 > x0 && boxes[j][1] - APART - 1 < y1 && boxes[j][3] + APART + 1 > y0);
    const sWob = seedOf(plan, b.id, "wob");
    const sLobe = seedOf(plan, b.id, "lobe");
    const sLine = seedOf(plan, b.id, "line");
    const sIsle = seedOf(plan, b.id, "isle");
    const sTarn = seedOf(plan, b.id, "tarn");
    const main = centre(b.arms[0]);
    const level = designLevel(table, b);
    const bayArm = bay && bay.body === b.id ? b.arms[bay.arm] : null;
    const bayLine = bayArm ? centre(bayArm) : null;
    // (how deep a lake's bed may go: the floor, `BED_FLOOR`, D325)
    const room = Math.max(b.deep, b.sill - BED_FLOOR);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (r.lake[i] || r.fixed[i]) continue;
        const cx = x + 0.5;
        const cy = y + 0.5;
        const raw = bodyDist(cx, cy, b);
        if (raw > wander + 0.5) continue;
        const own = raw + WANDER[b.kind] * fbm(sWob, x, y, 16, 3) + (b.dry ? LOBES * fbm(sLobe, x, y, 6, 2) : 0);
        if (own >= 0) continue;
        let apart = true;
        for (const o of others) if (bodyDist(cx, cy, o) < APART) apart = false;
        if (!apart) continue;
        // an island: land a level over the water
        let isle = Infinity;
        for (const s of b.islands ?? []) isle = Math.min(isle, spineDist(cx, cy, s) + 0.8 * fbm(sIsle, x, y, 7, 2));
        if (isle < 0) {
          r.heights[i] = b.sill + 1;
          r.fixed[i] = 1;
          continue;
        }
        let depth: number;
        if (b.kind === "lake") {
          // (a shelf at the sill, a margin a level over the floor, then the floor its depth by number, `holdDeep`, so
          // the lake keeps most of its water through a drought; the drowned river's line a level under it where the
          // floor leaves room: drop-offs, never depth rings)
          const shore = Math.max(0, Math.floor((Math.min(-own, isle) - 1.0) / 1.5));
          const w = 2.5 * fbm(sLine, x, y, 12, 2);
          const line = pathDist(cx + w, cy - w, main).d;
          depth = shore === 0 ? 0 : shore === 1 ? b.deep - 1 : line < 2.6 ? Math.min(b.deep + 1, room) : b.deep;
          if (bayArm && bayLine && spineDist(cx, cy, bayArm) < 0) {
            // (the first frame's bay: a level deep, the drowned river's ribbon two, which a pump at the start still
            // draws when a breach has sunk the lake a level)
            const ribbon = pathDist(cx + 0.3 * w, cy - 0.3 * w, bayLine).d < 1.15;
            depth = ribbon ? 2 : Math.min(depth, 1);
            if (ribbon) r.ribbon[i] = 1;
          }
        } else if (b.kind === "pool") {
          depth = -own > 1.5 ? b.deep : 0;
        } else if (b.dry) {
          // (an old lake bed: a flat floor a level under the sill, the old river's line down its main arm a level
          // deeper where it runs clear of the shore, wandering and pinching out as a lake's does: a floor crossed by a
          // dry channel, never a ring round a hollow)
          const w = 2.5 * fbm(sLine, x, y, 12, 2);
          const line = pathDist(cx + w, cy - w, main).d;
          depth = -own > 1.5 && line < 0.6 + 0.6 * fbm(sTarn, x, y, 6, 2) ? 2 : 1;
        } else {
          depth = Math.max(0, Math.floor((-own - 0.6) / 2.4 + 1.5 * fbm(sTarn, x, y, 5, 2) + 0.2));
        }
        depth = Math.min(b.kind === "lake" ? room : b.deep, depth);
        r.heights[i] = Math.max(0, b.sill - depth);
        r.fixed[i] = 1;
        r.lake[i] = k + 1;
        r.surface[i] = level;
      }
  });
}

/** The start's bay under the landmark: the arm of the landmark's lake whose end comes nearest its lip's middle. */
export function bayOf(plan: PremisePlan): { body: string; arm: number } | null {
  const lm = plan.links.find((l) => l.id === plan.frame.landmark);
  if (!lm?.fall) return null;
  const body = plan.bodies.find((b) => b.id === lm.to);
  if (!body) return null;
  const [a, c] = lm.fall.lip;
  const mid: Point = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  let best = -1;
  let bd = Infinity;
  body.arms.forEach((arm, k) => {
    const d = spineDist(mid[0], mid[1], arm);
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best >= 0 && bd < 12 ? { body: body.id, arm: best } : null;
}
