// A stair of slopes (EDITOR_PLAN §4, the shelf's Slope; showcase-craft gap 6): the Slope dragged from high ground down
// to low ground lays a walkable way down in one step. A slope climbs one level, so leaving a mesa four levels high took
// four tiles lowered or raised by hand and four slopes placed and turned one by one. The stair is the player's own
// placement (D368 (10): only the player places objects), shaped as the generator's natural ramps are (land/levels.ts
// `dealTreads`, `shapeRamp`): straight along the drag's main axis from the higher end, a tread of two to four tiles for
// each level on the way down, a slope on the first tile of each tread and on the first tile of the lower end's level,
// its high side toward the top; the ground three tiles wide, and the lower ground beside a fill risen to it, so the
// stair reads as ground, a spur or a cleft, never a pier. The treads fill the drag's length, four tiles each at most,
// unevenly (drawn from the map's seed and the stair's place, so the preview is what the release lays); a short drag
// still lays the shortest stair, two tiles a level. Trees and bushes placed by hand on its line go in the same step (a
// generated forest makes room by itself), and the ground beside it under anything placed, water or a cave is left as
// it is; anything else on its line, water, a cave or the map's edge refuses it with one plain reason, never clamped.

import { entityTiles } from "../features/edits";
import { orientationForHigh } from "../features/setpieces";
import { tilesToRuns } from "../math/grid";
import { stream } from "../math/rng";
import { dealTreads, shapeRamp } from "../land/levels";
import { PLANT_CLEARANCE } from "../terrain/clearance";
import { itemName, withArticle } from "./labels";
import type { EditOp } from "./ops";
import { resourceOwners, waterDepth, type PlannedOps } from "./placing";
import type { MapSession } from "./session";

/** One slope of a stair: its tile, the level it stands on, and its turn. */
export interface StairStep {
  x: number;
  y: number;
  z: number;
  orientation: ReturnType<typeof orientationForHigh>;
}

export type StairPlan = (PlannedOps & { ok: true; steps: StairStep[] }) | { ok: false; errors: string[] };

const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

/** Water this deep or more on a tile is in the stair's way (the brushes' wet tile, drawn as water). */
const WET = 0.05;

/** Plan the stair a Slope dragged from tile `from` to tile `to` lays (nothing applied). `newId` names each slope. */
export function planStair(s: MapSession, from: readonly [number, number], to: readonly [number, number], newId: () => string): StairPlan {
  const { x: W, y: H } = s.size;
  const h = s.built.heights;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  if (!on(from[0], from[1]) || !on(to[0], to[1])) return fail("The stair runs off the map");
  if (from[0] === to[0] && from[1] === to[1]) return fail("Drag the slope down to the ground it leads to");
  // the higher end is the top, whichever way the drag went
  let top = from;
  let end = to;
  if (h[top[1] * W + top[0]] < h[end[1] * W + end[0]]) [top, end] = [end, top];
  const high = h[top[1] * W + top[0]];
  const low = h[end[1] * W + end[0]];
  if (high === low) return fail(`Both ends are at level ${high}: drag down from higher ground`);
  // straight along the drag's main axis (a slope faces one of four ways)
  const ddx = end[0] - top[0];
  const ddy = end[1] - top[1];
  const [dx, dy] = Math.abs(ddx) >= Math.abs(ddy) ? [Math.sign(ddx), 0] : [0, Math.sign(ddy)];
  const n = high - low;
  // the levels along the line: the top, a tread for each level between (a slope and a landing at least, four tiles
  // at most, the drag's spare length dealt to them), then the lower end's level, its slope and the foot past it
  const room = Math.abs(dx ? ddx : ddy) + 1;
  const len = new Array<number>(n + 1).fill(2);
  len[0] = 1;
  const spare = Math.min(room - (2 * n + 1), 2 * (n - 1));
  if (spare > 0) dealTreads(len, 1, n, spare, stream(s.spec?.seed ?? 0, "stair", top[1] * W + top[0], dx, dy, n), 64);
  const lev: number[] = [];
  for (let k = 0; k <= n; k++) for (let t = 0; t < len[k]; t++) lev.push(high - k);
  const line = lev.map((_, k) => [top[0] + dx * k, top[1] + dy * k] as const);
  const foot = line[line.length - 1];
  if (!line.every(([x, y]) => on(x, y))) return fail(`The stair runs off the map: it needs ${line.length} tiles from its top`);
  if (!line.every(([x, y]) => x >= 2 && y >= 2 && x < W - 2 && y < H - 2)) return fail("The stair runs into the map's edge, where the game drains the ground");
  const q = line.map(([x, y]) => y * W + x);
  const footTile = q[q.length - 1];
  const water = waterDepth(s);
  for (const i of q.slice(1)) {
    if (!s.plainAt(i)) return fail("A cave or an overhang is in the stair's way");
    if (water[i] >= WET) return fail("Water is in the stair's way");
  }
  if (h[footTile] !== low) return fail(`The stair's foot would meet ${h[footTile] > low ? "a wall" : "a drop"}: it ends at level ${low}, the ground past it is at ${h[footTile]}`);
  // what stands on its line: hand-placed trees and bushes go with it; a generated forest makes room by itself
  // (a building or another object on the tile past its foot would wall it off: refused too; a plant there is walked
  // past); beside the line, the ground under anything placed is left as it is
  const path = new Set(q.slice(1, -1));
  const skip = resourceOwners(s);
  const gone: string[] = [];
  const placed = new Uint8Array(W * H);
  for (const e of s.built.entities) {
    if (skip.has(e.owner)) continue;
    const under = entityTiles(e).filter(([x, y]) => on(x, y)).map(([x, y]) => y * W + x);
    const plant = e.template in PLANT_CLEARANCE;
    if (!plant && under.includes(footTile)) return fail(`${upper(withArticle(itemName(e.template)))} stands at the stair's foot`);
    if (under.some((i) => path.has(i))) {
      if (!plant) return fail(`${upper(withArticle(itemName(e.template)))} is in the stair's way`);
      gone.push(e.id);
      continue;
    }
    for (const i of under) placed[i] = 1;
  }
  const shaped = Uint8Array.from(h);
  const pairs: [number, number][] = [];
  shapeRamp(shaped, W, H, (j) => !!placed[j] || water[j] >= WET || !s.plainAt(j), q, lev, new Uint8Array(W * H), pairs);
  const steps: StairStep[] = pairs.map(([lo, hi]) => {
    const x = lo % W;
    const y = (lo - x) / W;
    return { x, y, z: shaped[lo], orientation: orientationForHigh((hi % W) - x, Math.floor(hi / W) - y) };
  });
  const ops: EditOp[] = [];
  if (gone.length) ops.push({ op: "deleteEntities", params: { entities: gone } });
  // (exact: each tile at its own level, which the integrity pass would otherwise round off a lone tile)
  const byLevel = new Map<number, number[]>();
  const tiles: number[] = [];
  for (let i = 0; i < shaped.length; i++) {
    if (shaped[i] === h[i]) continue;
    tiles.push(i);
    const at = byLevel.get(shaped[i]);
    if (at) at.push(i);
    else byLevel.set(shaped[i], [i]);
  }
  for (const [level, cells] of [...byLevel].sort((a, b) => b[0] - a[0])) ops.push({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(cells, W), level, exact: true } });
  for (const t of steps) ops.push({ op: "placeEntity", params: { id: newId(), template: "Slope", x: t.x, y: t.y, orientation: t.orientation } });
  const label = `Lay a stair of ${n} slope${n === 1 ? "" : "s"}`;
  return { ok: true, ops, report: [`${n} slope${n === 1 ? "" : "s"} from level ${high} down to ${low}`], label, tiles, steps };
}

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
