// The ruin line: ruins as architecture, not scatter (MAPCRAFT step 7). With a ruin in hand the player drags a line and
// it lays columns along it as one broken structure: piers evenly spaced from end to end whose tops share one level, so
// they stand tall in the low ground and short at the ends (an aqueduct's or a dam's remains across a valley), with
// gaps knocked out at random by the seed. It is planned on the map as it stands and placed as one step; the log keeps
// the columns it placed (a `placeEntity` each, as a stroke of painted objects does), so a replay never plans again.

import { ORIENTATIONS } from "../format/footprints";
import { RUIN_VARIANTS } from "../format/entities";
import { ruinComponents } from "../gen/paint";
import { guidFrom, hash32, tileHash01 } from "../math/hash";
import type { EditOp, OpOrigin } from "./ops";
import { RUIN_LINE_BREAK, RUIN_LINE_SPACING, RUIN_MAX_HEIGHT } from "./ruinLineLimits";
import { planEntity } from "./placing";
import type { ApplyResult, MapSession } from "./session";

export * from "./ruinLineLimits";

export interface RuinLineParams {
  from: [number, number];
  to: [number, number];
  /** Tiles from one pier to the next (1: a wall of columns side by side). */
  spacing: number;
  /** The share of the piers between the ends that are missing, 0 to 0.8. */
  break: number;
  seed: number;
}

export interface RuinPier {
  x: number;
  y: number;
  /** Its tile (y·W + x). */
  tile: number;
  /** Its height in levels (the column's storeys). */
  height: number;
}

export type RuinLinePlan = { ok: true; piers: RuinPier[]; top: number; ops: EditOp[]; label: string } | { ok: false; errors: string[] };

/** What a ruin line would place on this map: its piers, the level their tops share, the operations and the history's
 *  words; or the plain one-line reason it can't be laid. Reads the map only. */
export function planRuinLine(s: MapSession, p: RuinLineParams, nextSeq: number = s.nextSeq): RuinLinePlan {
  const fail = (reason: string): RuinLinePlan => ({ ok: false, errors: [reason] });
  const { x: W, y: H } = s.size;
  for (const [x, y] of [p.from, p.to]) if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= W || y >= H) return fail(`X ${x} · Y ${y} is off the map`);
  if (!Number.isInteger(p.spacing) || p.spacing < RUIN_LINE_SPACING.min || p.spacing > RUIN_LINE_SPACING.max) return fail(`a ruin line's spacing must be a whole number from ${RUIN_LINE_SPACING.min} to ${RUIN_LINE_SPACING.max}`);
  if (!(p.break >= RUIN_LINE_BREAK.min && p.break <= RUIN_LINE_BREAK.max)) return fail(`a ruin line's break must be from ${RUIN_LINE_BREAK.min} to ${RUIN_LINE_BREAK.max}`);
  const dx = p.to[0] - p.from[0];
  const dy = p.to[1] - p.from[1];
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  const gaps = Math.floor(n / p.spacing);
  if (gaps < 1) return fail("a ruin line needs room for two piers: drag further");
  // the piers, evenly spaced from end to end
  const at: [number, number][] = [];
  for (let k = 0; k <= gaps; k++) at.push([Math.round(p.from[0] + (dx * k) / gaps), Math.round(p.from[1] + (dy * k) / gaps)]);
  const ground = at.map(([x, y]) => s.built.heights[y * W + x]);
  // one level for every top: a storey over the highest ground under the line
  const top = Math.max(...ground) + 1;
  const low = ground.indexOf(Math.min(...ground));
  if (top - ground[low] > RUIN_MAX_HEIGHT) return fail(`the ground under the line drops ${top - 1 - ground[low]} levels at X ${at[low][0]} · Y ${at[low][1]}: a ruin stands at most ${RUIN_MAX_HEIGHT} high`);
  // the gaps: piers between the ends knocked out by the seed
  const gone = hash32(p.seed, "ruin-line", "break");
  const look = hash32(p.seed, "ruin-line", "look");
  const piers: RuinPier[] = [];
  const ops: EditOp[] = [];
  let first: string | null = null;
  at.forEach(([x, y], k) => {
    const end = k === 0 || k === gaps;
    if (!end && tileHash01(gone, x, y) < p.break) return;
    const height = top - ground[k];
    const variant = RUIN_VARIANTS[Math.floor(tileHash01(look, x, y) * RUIN_VARIANTS.length) % RUIN_VARIANTS.length];
    const orientation = ORIENTATIONS[Math.floor(tileHash01(look, y, x) * ORIENTATIONS.length) % ORIENTATIONS.length];
    const r = planEntity(s, { template: `RuinColumnH${height}`, x, y, orientation, components: ruinComponents(height, variant) }, guidFrom("ruin-line", p.seed, nextSeq, k));
    // (a pier that can't stand, in water or on another object, is one more gap)
    if (!r.ok) return void (first ??= r.errors[0]);
    piers.push({ x, y, tile: y * W + x, height });
    ops.push(...r.ops);
  });
  if (piers.length < 2) return fail(first ?? "a ruin line needs two piers that can stand");
  return { ok: true, piers, top, ops, label: ruinLineLabel(piers.length) };
}

/** Lay the ruin line (`planRuinLine`): its columns placed as one step. */
export function applyRuinLine(s: MapSession, p: RuinLineParams, origin: OpOrigin = "user"): ApplyResult {
  const r = planRuinLine(s, p);
  if (!r.ok) return { ok: false, errors: r.errors, applied: [], dirty: null };
  return s.applyBatch(r.ops, origin, r.label);
}

/** The history's words for a ruin line. */
export function ruinLineLabel(piers: number): string {
  return `Lay a ruin line of ${piers} piers`;
}
