// What a force left, as the document keeps it (op.ts `forceResult`): the literal difference between
// the map it started from and the map it made. The five forces share this; a carve adds its source and
// its sealed lake (carve/result.ts).

import * as portable from "../math/portable";
import { rebuiltSlope } from "../features/ids";
import { slopeStands, slopeTiles } from "../features/slopes";
import { footprint } from "./objects";
import type { EntitySpec } from "../format/entities";
import type { ForceMap, FullForceMap } from "./force";
import type { ForceResultParams, ForceSettingsRecord, ForceWhere, Verb } from "./op";
import type { StagedRun } from "./runs";

type Literal = Pick<ForceResultParams, "tiles" | "heights" | "rock" | "removed" | "moved" | "felled">;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Objects a force never lists as removed: the start, and the slopes the build derives again. */
export const keptObject = (e: EntitySpec) => e.template === "StartingLocation" || rebuiltSlope(e.owner) || e.owner.startsWith("pinned:");

/** The difference between `before` and `after`: the tiles whose level changed, the fresh rock that
 *  changed, the objects gone and carried, the trees newly knocked down. `kept(e)`: objects the result
 *  never lists (the start, and the slopes the build derives again from the ground). */
export function literalOf(before: ForceMap, after: ForceMap, kept: (e: EntitySpec) => boolean = keptObject): Literal {
  const tiles: number[] = [];
  const heights: number[] = [];
  for (let i = 0; i < after.heights.length; i++)
    if (after.heights[i] !== before.heights[i]) {
      tiles.push(i);
      heights.push(after.heights[i]);
    }
  const rockTiles: number[] = [];
  const bits: number[] = [];
  if (after.lava || before.lava)
    for (let i = 0; i < after.heights.length; i++) {
      const b = before.lava?.[i] ?? 0;
      const a = after.lava?.[i] ?? 0;
      if (a !== b) {
        rockTiles.push(i);
        bits.push(a);
      }
    }
  const now = new Map(after.entities.map((e) => [e.id, e]));
  const removed = before.entities.filter((e) => !now.has(e.id) && !kept(e)).map((e) => e.id);
  // a carried object put down where the start or a slope the build keeps still stands is lost there:
  // the force carries neither (the editor carries the start, D257; the build keeps its slopes), and
  // listing it as carried would leave the build to drop it while they stand and bring it back once
  // they move on (D368 (10): only the player places objects)
  const held = new Set<number>();
  for (const b of before.entities) {
    if (b.template === "StartingLocation") for (const i of footprint(before, b)) held.add(i);
    else if (kept(b) && b.template === "Slope") {
      const t = slopeTiles(b, before.W, before.H);
      if (t && slopeStands(t, after.heights)) held.add(t[0]);
    }
  }
  const moved: { id: string; x: number; y: number }[] = [];
  for (const b of before.entities) {
    const e = now.get(b.id);
    if (!e || kept(b) || (e.x === b.x && e.y === b.y)) continue;
    if (footprint(after, e).some((i) => held.has(i))) removed.push(b.id);
    else moved.push({ id: b.id, x: e.x, y: e.y });
  }
  const wasFallen = new Set((before.fallen ?? []).map((f) => f.id));
  const felled: { id: string; dx: number; dy: number }[] = [];
  for (const f of after.fallen ?? []) {
    const e = now.get(f.id);
    if (!e || kept(e) || wasFallen.has(f.id)) continue;
    // (which way it lies: a unit direction, whatever length the force gave it)
    const l = portable.hypot(f.dx, f.dy) || 1;
    felled.push({ id: f.id, dx: round4(f.dx / l), dy: round4(f.dy / l) });
  }
  return {
    tiles,
    heights,
    ...(rockTiles.length ? { rock: { tiles: rockTiles, bits } } : {}),
    removed,
    ...(moved.length ? { moved } : {}),
    ...(felled.length ? { felled } : {}),
  };
}

/** What the player asked of a force, and where (a record: replay never runs the force). */
export interface ForceRecord {
  verb: Verb;
  settings: ForceSettingsRecord;
  where: ForceWhere;
  /** The layer showing when it ran (D207), or null. */
  cut: number | null;
  steps: number;
  reason: string;
  /** Try another: the force (its operation's seq) this one replaces. */
  replaces?: number;
}

/** The operation a force becomes, against the map it started from (null: it changed nothing). */
export function forceParamsOf(before: ForceMap, after: FullForceMap | ForceMap, rec: ForceRecord): ForceResultParams | null {
  const lit = literalOf(before, after);
  if (!lit.tiles.length && !lit.removed.length && !lit.moved?.length && !lit.felled?.length && !lit.rock) return null;
  return {
    version: 1,
    verb: rec.verb,
    settings: rec.settings,
    where: rec.where,
    ...(rec.cut !== null ? { cut: rec.cut } : {}),
    steps: rec.steps,
    reason: rec.reason,
    ...lit,
    ...(rec.replaces !== undefined ? { replaces: rec.replaces } : {}),
  };
}

/** A staged force's operation (Craterize, Erupt, Quake, Glaciate), once planned: its `steps` are the
 *  steps that show it (`total`), never how many slices its planning took, which follows the machine's
 *  speed; so the same gesture is the same operation on any machine (D366). Null: it changed nothing. */
export function stagedParamsOf(before: ForceMap, run: StagedRun, rec: Omit<ForceRecord, "steps" | "reason">): ForceResultParams | null {
  const after = run.final();
  return after ? forceParamsOf(before, after, { ...rec, steps: run.total, reason: "done" }) : null;
}

/** A painted line as the operation keeps it (to a hundredth of a tile). */
export const pathRecord = (path: readonly { x: number; y: number }[]): [number, number][] => path.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);
