// The poisoned floodplain (docs/design/poisoned-floodplain.md; PREMISES.md §7 row 14): "The widest flat on the map is
// dead along a red stream. Turn the stream into the old dry valley and bring the river in behind it: the best land is
// yours."
//
// Build step 1 of the design's §9: the plan only (stage 0, pure arithmetic, no terrain): `eligible`, `draw` (from the
// stream `premise.plan`) and the `plan` invariants of the design's §7 with §1.4's shared checks. Not offered: it is not
// in `spec/mapspec.ts` `PREMISE_IDS`, so not in the choices, Any or a link; `premises/dev.ts` lists it for the tools
// and tests. No map is made from it yet. Playability (the start's room, wood and reach) is the shared gate's (D515).
//
// Land first (PREMISES §5.1): every landform is one a river makes, and nothing is laid along a ruled line. The plan says
// where, by number and position; stage 2 shapes by noise and distance. The courses wander (`gateBrooks.ts` `meander`);
// the walls' feet, the risers, the backswamp's edge and the levees' widths are noise, kept here as their parameters or
// as lines sampled from them. The gulch, the col and the Dry Fork are found by stage 2's search (the design's §3): the
// plan gives the search its window on the far wall and the target numbers.
//
// The plan is laid out in a local frame, then turned onto the map by the valley's angle (10° to 35° off the grid) and a
// quarter turn: u down the valley, v across it (toward the far wall), in a box whose side `boxOf` holds the turned
// map; only what stands on the map counts. The valley's axis bends once or twice, and its walls are not parallel.
// Across the floor from the near wall: the river (in the near third) between its levees, the plain at level L falling a
// level at each riser down the valley, the backswamp a level under it under the far wall. The start's terrace stands
// two over the plain at the plain's upstream end, on the plain's side of the river, looking down the valley and across
// the plain to the Red Fall under the far wall.

import { frameAt, LANDMARK_FAR, LANDMARK_NEAR, openingCamera, VISTA_ZOOM } from "../../analysis/opening";
import { ORIENTATIONS, type Orientation } from "../../format/footprints";
import { BED_FLOOR } from "../../land/genome";
import { hash32 } from "../../math/hash";
import { fbm } from "../../math/noise";
import { atan2, cos, pow, sin, tan } from "../../math/portable";
import { sillWidthFor } from "../../sim/sill";
import { EDITOR_LEVEL, type MapSpec } from "../../spec/mapspec";
import { FLOOR_MARGIN, rulesFor, START_FLOORS } from "../../validate/playability";
import type { PlanOverlay } from "../diagram";
import { premiseStream } from "../draw";
import { FRAME } from "../frame";
import { meander, sampled } from "../gateBrooks";
import { dist, headingOf, pathDist, pathLength, pointAt } from "../geom";
import { fail, nameOf, OK, PLAN_CHECKS } from "../planChecks";
import { longestStraight, straightestChord } from "../raster/levee";
import type { Body, Edge, Exit, Invariant, Link, Point, PremiseDef, PremisePlan, Region, Ridge, Source, Work } from "../types";
import { STAIR_FLOW } from "./lakeStair";

export const PLAIN_ID = "poisonedPlain";

// ------------------------------------------------------------------------------------------------- the numbers

/** Square maps, 128² to 256² (the design's §2: the plain needs a side of 128 or more; PREMISES ruling 7: squares only). */
export const PLAIN_SIDE = [128, 256] as const;
/** The green band's reach, `M`: how far the river's moisture crosses a levee one level over its water onto the plain
 *  (the design's §2). Step 2 measured it on the land with the core's soil rules (`plainBands`: the green band's tiles
 *  over the river's length on the plain) on seeds 1 and 2 at 128², 192² and 256²: 5.9 to 8.8, a mean of 7.4. Its mean
 *  is over 6, so the levee's low places are not widened. */
export const M_REACH = 7;
/** Each rung's floor per tile of the side (§6: two thirds of the first build's mean gain, `plainWorks.ts` measuring
 *  as `ladder.ts` measures, seeds 1 to 12 at 128², 192² and 256², `tools/plain-works.ts`): the levees' and the turn's
 *  tiles cleared of poison, the pond's water held (tile-levels), the river in's tiles turned green. Its most is twice
 *  its floor. */
export const GIVES = { lowLevee: 0.087, brookPond: 0.057, swampLevee: 0.064, turn: 7.41, riverIn: 23.95 } as const;
/** The dry band's least share of the plain and the backswamp together on day 1 (the design's §2). */
export const DRY_LEAST = 0.3;
/** Day 1's dead band's share of the floor (the design's §2, planning's ruling of 2026-11-15: 8 to 25 %). */
export const DEAD_SHARE = [0.08, 0.25] as const;
/** The backswamp's width, tiles, at every place along it (the design's §1): 7 to 10 at 128², up to `share` of the side
 *  on larger maps; how far it wanders about its mean. */
export const SWAMP = { least: 7, most: 10, share: 0.06, wander: 1.5, cell: 16 } as const;
/** The backswamp's widest on a side. */
export const swampMost = (N: number): number => Math.max(SWAMP.most, Math.floor(SWAMP.share * N));
/** The plain by the map (the design's §1 and §2, planning's ruling of 2026-11-15): its mean width `P` the larger of
 *  (M + 9) / 0.7 and `share` of the side, measured from the far side of the river's room (the farthest its plain-side
 *  levee foot stands) to the far wall's foot, the backswamp in it; its length `long` of the side along the axis; the
 *  floor (the plain and the backswamp) `floor` of the map; its width along its length `vary` of `P`, narrower at the
 *  plain's head (`head`) and wider at its foot. */
export const PLAIN = { dead: 9, share: [0.28, 0.36], long: [0.7, 0.85], floor: [0.2, 0.3], vary: [0.8, 1.3], head: [0.9, 0.97], foot: [1.03, 1.12] } as const;
/** Each wall wanders by its own line (the design's §1, planning's ruling of 2026-11-15, round 3): spurs out onto the
 *  floor and re-entrants back, `out` of `P` either way, a spur and its re-entrant `len` of `P` long together (each alone
 *  that long, a sine's flank ran within `near` tiles of straight for longer than `longest`), with a little noise
 *  (`rough` tiles over `roughCell` of `P`); the floor's width in the mean over any `P` of its length `PLAIN.vary` of `P`
 *  (drawn inside `mean`, a wall drawn again up to `draws` times); no wall's foot within `near` tiles of one straight
 *  line for longer than `longest` of `P` (`wall.wanders`), on the line and on its foot as the ground will draw it
 *  (`wallFoot`: the line read through the floor's warp, `FLOOR_WARP`, whose seeds are the spec's alone), the
 *  straightest draw by the foot's measure else, given a spur of `spur` tiles at the middle of its straightest run, up to
 *  `spurs` times (`spurWhereStraight`; step 5: the arches and noise scale with P, the ruler's 2 tiles and the warp do
 *  not, so at 128², P at its floor, the flank between two arches read straight on the ground on every draw of seeds 7
 *  and 9, where round 3 judged the line with a tile and a half's slack for the warp). */
export const WALL = { out: [0.15, 0.3], len: [1.5, 3], rough: 3, roughCell: 0.3, mean: [0.83, 1.27], draws: 32, near: 2, longest: 1.2, read: 1, spur: 5, spurs: 4 } as const;
/** The floor's lines are read through a warp of `amp` tiles (noise `cell` tiles across), so no contour follows the
 *  plan's lines exactly; the backswamp's edge wanders a further `swamp` tiles, and the plain's risers a further `riser`
 *  tiles down the valley (noise `riserCell`: the plan's risers wander a tile or two, and on the ground read as ruled
 *  lines across the plain); the warp fades to nothing from `calm[1]` to `calm[0]` tiles of the gulch's mouth
 *  (`plainLand.ts` `plainRelief`). */
export const FLOOR_WARP = { amp: 2.2, cell: 13, swamp: 1.2, swampCell: 9, riser: 7, riserCell: 11, calm: [4, 8] as const } as const;
/** The floor's warp's two seeds, along the valley and across it: the spec's seed and side alone (`raster/field.ts`
 *  `seedOf`), so the plan reads its walls' feet as stage 2's ground draws them. */
export function floorWarpSeeds(seed: number, W: number, H: number): { u: number; v: number } {
  return { u: hash32(seed, W, H, "premise.water", "plain", "warp.u"), v: hash32(seed, W, H, "premise.water", "plain", "warp.v") };
}
/** The least width the design's §2 asks of the plain. */
export const plainLeast = (M: number = M_REACH): number => Math.ceil((M + PLAIN.dead) / (1 - DRY_LEAST));
/** The plain's mean width's range on a side. */
export const plainRange = (N: number, M: number = M_REACH): [number, number] => [Math.max(plainLeast(M), Math.ceil(PLAIN.share[0] * N)), Math.max(plainLeast(M), Math.floor(PLAIN.share[1] * N))];
/** The valley is not a corridor (the design's §1, planning's ruling of 2026-11-15): its axis off the grid by `angle`
 *  degrees, with 1 or 2 gentle bends of `turn` degrees each, eased over `ease` of the side; drawn `margin` degrees
 *  inside the angle's range so the walls' noise keeps it there. `chord`: the run, tiles, its heading is read over. */
export const VALLEY = { angle: [10, 35], bends: [1, 2], turn: [6, 13], ease: [0.12, 0.2], margin: 2, chord: 24, step: 4 } as const;
/** The river's room off the near wall's foot: from the levee's width past its bank, `width` tiles (or `share` of `P`)
 *  across: the near third of the floor. */
export const RIVER_ROOM = { width: 8, share: 0.12 } as const;
/** The levees (the design's §1): a bank each side of the river whose width is noise along it, 3 to 6; whose crest is a
 *  level over the plain for most of its length, level with it at 2 to 4 low places 4 to 8 long, and two over where the
 *  noise runs high (`hump`, above which the crest stands a level higher; the crest rule asks a change of height at
 *  least every fifth of the river's length on the plain, which 2 to 4 low places alone cannot give). */
export const LEVEE = { width: [3, 6], cell: [10, 16], low: [4, 8], lows: { small: [2, 3], large: [3, 4] }, apart: 12, crestCell: 11, hump: 0.4, humpLen: [4, 7], most: 0.2, mostAt1: 0.5 } as const;
/** The plain falls a level down the valley every 40 to 60 tiles, at a riser that wanders across the floor: its wander
 *  `amp` tiles by noise over `cell` tiles across. A riser is the scar the river's old bends cut into the higher plain
 *  (planning's verdict on round 2: steps follow the river's old lines, never a ruled line across the plain): a chain of
 *  arcs `scar.len` tiles across each (wandering a third of that), each bowed `scar.bow` tiles up the valley at its middle,
 *  meeting the next in a cusp. None within `end` tiles of the plain's foot. The water's ceiling
 *  (`plainTop`) holds the Red Fall's 6 or 7 levels (D510) over the backswamp only with the plain's head low: so the
 *  plain has as many risers as leave its head at `L` that room (`mostRisersUnder`), and on a longer plain they stand
 *  farther apart (`riserEvery`). */
export const RISER = { every: [40, 60], amp: [3, 6], cell: [8, 14], end: 20, scar: { len: [16, 30], bow: [3, 8] } } as const;
/** The far wall stands this many levels or more over the plain wherever the first frame sees it (planning's verdict on
 *  round 1 of the land, 2026-11-15); the near wall `NEAR_OVER` (its crest along the valley). */
export const FAR_OVER = 8;
export const NEAR_OVER = [4, 6] as const;
/** The plain's least level at its head: the river's bed at the downstream end a level over the floor, two under it. */
const PLAIN_LEAST = BED_FLOOR + 3;
/** The plain's height budget (planning's verdict on step 3, round 2: the plain sits as high as its river's fall needs,
 *  the rim and the Red Fall keeping their drop above it): its head `L` stands `PLAIN_LEAST` plus a level for each riser
 *  (the river steps down with the plain) plus `JOIN.levels` where the red stream joins the river (the river at the join
 *  falls under the red stream's bed, so the red water drops into it), and no higher than leaves the Red Fall's least
 *  height and the gulch's least rise under `top - 2`, where the Red Spring may stand (the shared `plan.levels`). So the
 *  risers are what that leaves: two on a map whose red stream leaves by its own exit, one where it joins the river. */
export const mostRisersUnder = (top: number, join = false): number => Math.max(0, top - 2 - GULCH.rise[0] - GULCH.h[0] + 1 - PLAIN_LEAST - (join ? JOIN.levels : 0));
/** The risers' spacing on a plain whose risers may run `span` tiles (its head to `RISER.end` above its foot), `most`
 *  of them at most: 40 to 60 tiles, or evenly farther apart where `most` cannot reach its foot so. */
export function riserEvery(span: number, most: number): [number, number] {
  const even = span / (most + 1);
  return even * 1.15 <= RISER.every[1] ? [RISER.every[0], RISER.every[1]] : [Math.max(RISER.every[0], even * 0.95), even * 1.15];
}
/** The river's stage on its bed (planning's verdict on step 3, round 1: a longer river needs more fall, so its bed steps
 *  down a level at natural riffles, as many as its length and flow need; its width follows its flow, never its length).
 *  Measured on the settle (step 3, seeds 3 and 4 at 256², 15.7 a second on a bed 5 wide): the water stands `lip` deep
 *  over a step's lip (or the map's edge) and `slope` deeper for each tile up the reach from it; both by the flow a tile
 *  of width carries over `q`'s to the 2/3 (a channel's critical depth). The water stands `margin` under its ceiling
 *  everywhere: the plain beside the river (a levee's crest a level over the plain holds a badtide only over water no
 *  higher than the plain, §2), and at the red stream's join the red stream's bed, two under the plain (round 3: the red
 *  water falls into the river, `JOIN.drop`, and the river's cannot back up it). The red stream joins
 *  `join` tiles below a step (a yazoo: it keeps beside the river until the river has dropped): its mouth (its
 *  half-width and the cut a tile past it) wholly below the step and two tiles of the river between (round 3: red water
 *  at the step's foot climbed its first tile, 3e-2 as the file holds it, where the mouth met the foot). That step falls
 *  `fall` levels: the river's water stands 1.5 deep or more, so under a step of one level it still reaches over the
 *  reach above's bed and the settle's eddies carry traces of the red water up it (step 3, round 2: 1e-12 to 1e-152 up
 *  to 95 tiles); under two it stands below that bed. */
export const RIVER_STAGE = { lip: 1.6, slope: 0.0055, q: 15.7 / 5, margin: 0.15, join: [5, 9], fall: 1 } as const;
/** The river's stage over a flow `flow` on a bed `width` wide: how deep over a step's lip, and how much deeper a tile up
 *  the reach. */
export function riverStage(flow: number, width: number): { lip: number; slope: number } {
  const k = pow(flow / width / RIVER_STAGE.q, 2 / 3);
  return { lip: RIVER_STAGE.lip * k, slope: RIVER_STAGE.slope * k };
}

/** The river's riffles along a (local) path: the middles of the segments where its bends cross over (the sign of its
 *  turning changes, over three segments), at least `from` tiles along it and `end` short of its end. */
export function riffles(path: readonly Point[], from: number, end: number): number[] {
  const at: number[] = [0];
  for (let k = 1; k < path.length; k++) at.push(at[k - 1] + dist(path[k - 1], path[k]));
  const turn: number[] = [];
  for (let k = 1; k + 1 < path.length; k++) {
    const a: Point = [path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]];
    const b: Point = [path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]];
    turn.push(a[0] * b[1] - a[1] * b[0]);
  }
  // (turn[j] at vertex j + 1, smoothed over three vertices; a change of sign between vertices j + 1 and j + 2)
  const sm = turn.map((_, j) => (turn[j - 1] ?? 0) + turn[j] + (turn[j + 1] ?? 0));
  const out: number[] = [];
  for (let j = 1; j < sm.length; j++) {
    if (!(sm[j - 1] * sm[j] < 0)) continue;
    const mid = (at[j] + at[j + 1]) / 2;
    if (mid >= from && mid <= at[at.length - 1] - end) out.push(mid);
  }
  return out;
}

/** The river's steps (`RIVER_STAGE`): from its head's bed down, each reach as long as its water stands under its
 *  ceiling, a step at the farthest riffle that allows (the fewest steps), and one `RIVER_STAGE.join` above the red
 *  stream's join; the steps' places and the bed at each of the path's points (a level less past each step), or null
 *  where a reach finds no riffle to end at, the join none above it, or the bed would fall under `floor`.
 *  `ceiling(s)`, `flow(s)`: the water's ceiling and the river's flow `s` tiles along it. */
export function riverSteps(o: { path: readonly Point[]; head: number; floor: number; width: number; riffles: readonly number[]; ceiling: (s: number) => number; flow: (s: number) => number; join: number | null }): { at: number[]; bed: number[] } | null {
  const at: number[] = [0];
  for (let k = 1; k < o.path.length; k++) at.push(at[k - 1] + dist(o.path[k - 1], o.path[k]));
  const S = at[at.length - 1];
  const n = Math.floor(S) + 1;
  const ceil: number[] = [];
  const stage: { lip: number; slope: number }[] = [];
  for (let s = 0; s < n; s++) {
    ceil.push(o.ceiling(s));
    stage.push(riverStage(o.flow(s), o.width));
  }
  // (a reach from p to t on bed b: its water under its ceiling at every tile)
  const holds = (p: number, t: number, b: number): boolean => {
    for (let s = Math.ceil(p); s < t && s < n; s++) if (b + stage[s].lip + stage[s].slope * (t - s) >= ceil[s] - RIVER_STAGE.margin) return false;
    return true;
  };
  // (a straight run's riffle where no bend's crossing serves: any segment's middle)
  const mids: number[] = [];
  for (let k = 0; k + 1 < at.length; k++) if (at[k + 1] - at[k] > 0.5 && (at[k] + at[k + 1]) / 2 >= (o.riffles[0] ?? 0)) mids.push((at[k] + at[k + 1]) / 2);
  let forced: number | null = null;
  if (o.join !== null) {
    const j = o.join;
    const inJoin = (r: number) => r >= j - RIVER_STAGE.join[1] && r <= j - RIVER_STAGE.join[0];
    forced = o.riffles.filter(inJoin).pop() ?? mids.filter(inJoin).pop() ?? null;
    if (forced === null) return null;
  }
  const steps: number[] = [];
  let p = 0;
  let b = o.head;
  for (;;) {
    const owed = forced !== null && forced > p;
    if (!owed && holds(p, S, b)) break;
    // (owed the join's step: there where the reach holds to it, else short of it)
    let t = owed && holds(p, forced!, b) ? forced! : -1;
    const before = owed ? forced! : Infinity;
    if (t < 0) for (const r of o.riffles) if (r > p && r < before && holds(p, r, b)) t = r;
    if (t < 0) for (const r of mids) if (r > p && r < before && holds(p, r, b)) t = r;
    if (t < 0) return null;
    // (the join's step falls `RIVER_STAGE.fall` levels: the water under it stands below the reach above's bed, so none
    // of the red stream's runs back up it)
    const n = t === forced ? RIVER_STAGE.fall : 1;
    for (let j = 0; j < n; j++) steps.push(t);
    p = t;
    b -= n;
    if (b < o.floor) return null;
  }
  return { at: steps, bed: at.map((s) => o.head - steps.filter((t) => t < s).length) };
}
/** The start's terrace at the plain's head (the design's §5): its length down the valley holds the start's bench
 *  (`frame.bench`) `room` times over beside the brook, which crosses it `brookAt` tiles from its upstream end; the start
 *  stands `lip` tiles back from its downstream lip, or nearer its brook where the terrace is long, `brook` tiles down the
 *  valley from where the brook crosses (step 5: on the narrow floor of 128² the bench needs a long terrace, and from its
 *  lip the brook ran 11 to 17 tiles' walk off, the berries by it at the walk's edge), `across` of the way from the
 *  river's room to the far wall, and is taken only where its brook already runs within its walk (planning's verdict on
 *  step 3, round 2: found, not laid). */
export const TERRACE = { len: [26, 56], room: 1.2, brookAt: 9, brook: 13, lip: 4, across: [1 / 3, 1 / 2], rise: 2 } as const;
/** The search window on the far wall (the design's §3 and §5, planning's ruling of 2026-11-15): from the badwater
 *  distance down the valley from the start (searched nearest-first from there, so the Red Fall stays in the vista
 *  frame) to `to` of the plain's length; the least run of it the vista frame shows around the gulch's mouth, tiles (the
 *  lip's widest and a tile either side); how far past the nearest framed place the mouth may be drawn. */
export const WINDOW = { to: 0.75, framed: 9, past: 3 } as const;
/** The gulch (the Stain): its floor over the backswamp at its mouth (the Red Fall's height there: 6 or 7, D510), its width, its
 *  length into the far wall, its narrows (where in its lower half, how wide), how far its floor rises to its head; the
 *  col over the narrows' floor; the Dry Fork's fall from the col to its edge. */
export const GULCH = { h: [6, 7], width: [4, 7], len: [18, 30], slant: 0.4, narrowsAt: [0.2, 0.45], narrows: [2, 3], rise: [1, 3], colOver: 2, colOut: [7, 11], forkFall: [3, 6] } as const;
/** How far pure badwater poisons the soil on the level (the design's §2, the game's soil rule: `sim/soil3d.ts`): the
 *  shared gate's `start.badwater` reads contaminated ground as badwater, so the start keeps its badwater distance and
 *  this from the red water (step 3, round 3: a Red Pool 15 tiles off left its dead soil 11 to 13 from the start). */
export const BAD_SOIL = 7;
/** The red source's strength as a share of the river's by the Badwater setting (the design's §4, planning's ruling of
 *  2026-11-15: a fifth, a quarter, a third). */
export const RED_SHARE = { low: 1 / 5, normal: 1 / 4, high: 1 / 3 } as const;
/** The red stream's bed (the design's §4, step 3): a level under the backswamp, as wide as its flow needs for its water
 *  to stand under the backswamp's floor (`depth` deep at most), so the stream keeps to its bed and its water's ceiled
 *  surface is the backswamp's level, which poisons the whole strip (§2). `carry`: the flow a tile of its width carries
 *  for each level of depth on its gently falling bed, measured on the settle (step 3: a bed 2 wide ran 1.07 deep with
 *  3.5 a second and flooded the backswamp, 3 wide 0.65; the table's `WATER.channelCarry` is a steeper brook's).
 *  `depth` is the Red Pool's water over its sill, the stream's head bed (`Body.sill`: 0.1 to 0.6): at 0.7, 3 wide,
 *  the pool stood 0.62 to 0.83 over it, deeper the longer the stream's first flat reach, and the Red Fall fell short
 *  of its height less the veil's half level on 12 of 36 maps; 4 wide, 0.43 to 0.67 (step 3, round 3). */
export const RED_BED = { carry: 1.8, depth: 0.6, least: 3 } as const;
/** The red stream's half-width for its flow (`RED_BED`). */
export const redHalf = (flow: number): number => Math.max(RED_BED.least, Math.ceil(flow / (RED_BED.carry * RED_BED.depth))) / 2;
/** The red stream's course across the backswamp (step 6, planning's look at step 5: at 256² seed 2 its meander read
 *  as a drawn wave): meandered by the river's own maker (`gateBrooks.ts` `meander`), its stream's width and its bends
 *  varying along it as the river's do (`TRUNK_VARY`), about an axis that drifts across the backswamp by noise of cell
 *  `cell` tiles, up to `most` of the backswamp's width off its drawn share and within `keep` of it (the room its bends
 *  swing in moves with it, so no reach's lobes are capped alike). */
export const RED_DRIFT = { most: 0.6, cell: 36, keep: [0.2, 0.8] as const } as const;
/** The red stream's pools (step 5, planning: the red stream read as a one-tile thread in the whole-map frame at 192²
 *  and 256²): a stream on a backswamp's flat scours its bends, so its bed widens there by up to `widen` tiles either
 *  side, by how sharply it turns over `window` of its points either way (`turn` degrees and more: the whole widening),
 *  and keeps its own width where it runs straight, over its first `from` points below the Red Pool (the pool's sill is
 *  its head bed, `RED_BED.depth`) and across the plain to its join; never past `edge` tiles short of the backswamp's
 *  edges. The bends' pools are the land's own shape: no width is laid where the stream does not turn. */
export const RED_POOLS = { widen: 2, window: 2, turn: 50, from: 3, edge: 1 } as const;

/** The red stream's half-width at each point of its path (local, `RED_POOLS`): its flow's (`half`), widened at its
 *  bends while the point stands on the backswamp (`room`: the half-width the backswamp leaves there, or less than
 *  `half` off it). */
export function redHalves(path: readonly Point[], half: number, room: (p: Point) => number): number[] {
  const n = path.length;
  return path.map((q, k) => {
    if (k < RED_POOLS.from || k < RED_POOLS.window || k + RED_POOLS.window >= n) return half;
    const a = path[k - RED_POOLS.window];
    const b = path[k + RED_POOLS.window];
    const t1 = atan2(q[1] - a[1], q[0] - a[0]);
    const t2 = atan2(b[1] - q[1], b[0] - q[0]);
    let turn = Math.abs(t2 - t1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const want = half + RED_POOLS.widen * Math.min(1, turn / ((RED_POOLS.turn * Math.PI) / 180));
    return Math.max(half, Math.min(want, Math.round(2 * room(q)) / 2));
  });
}
/** The start's brook: one small spring (under the Gate's brook springs, 2.0 to 2.6, for a brook 2 wide). */
export const BROOK_SPRING = [1.5, 2.0] as const;
/** The red stream's join, as a share of the river's length (the design's §4: in its last 30 %, D476, D498); how far
 *  down the valley its way across the plain runs for each tile across (`slant`); the least run along the backswamp
 *  below the Red Fall before it turns; how far before the turn its course may leave the backswamp (the meander's axis
 *  rounds the turn over 6 tiles, `BROOK_MEANDER.axis`); the levels the plain's budget keeps for the join
 *  (`mostRisersUnder`); and its last reach (planning's verdict on step 3, round 2: short, and it falls): its bed a
 *  level under the backswamp to within `drop` tiles of the river's middle, through the levee, then down to the river's
 *  bed, a level or more under it, so the red water falls into the river and the river's water, standing under the red
 *  stream's bed (`riverSteps`' ceiling there), cannot back up it. */
export const JOIN = { at: [0.72, 0.94], slant: [0.15, 0.4], swamp: 15, bend: 8, levels: 1, drop: 4 } as const;

/** How far the red stream's own water keeps from the river's, less a tile's bank between: under 0, they touch. Read
 *  along the red course where it runs outside the river's water, each point by the river's point nearest it, against
 *  two rules (step 3, round 3): away from its end (the two half-widths and a tile) it touches the river nowhere (stage 1
 *  parts two waters that touch where no link joins them, and the river gave up its tiles across its width: a dam), and
 *  within it touches no reach of the river at its bed or higher (whose water stands over the red bed, which it backs
 *  up: a stream turning along the river into its join met it a step up; a reach's bed the one at its upper end, as a
 *  tile between two beds may take either). */
export function redClear(river: readonly Point[], riverBed: readonly number[], riverHalf: number, red: readonly Point[], redBed: readonly number[], redHalf: number): number {
  const all: { p: Point; bed: number }[] = [];
  for (let i = 0; i + 1 < river.length; i++)
    for (const q of walk([river[i], river[i + 1]], 0.5)) all.push({ p: q.p, bed: riverBed[i] });
  const end = red[red.length - 1];
  let least = Infinity;
  for (let k = 0; k + 1 < red.length; k++)
    for (const q of walk([red[k], red[k + 1]], 0.5)) {
      let near = all[0];
      let d = Infinity;
      for (const w of all) {
        const e = dist(q.p, w.p);
        if (e < d) [d, near] = [e, w];
      }
      if (d < riverHalf || (dist(q.p, end) <= riverHalf + redHalf + 1 && near.bed < redBed[k])) continue;
      least = Math.min(least, d - riverHalf - redHalf - 1);
    }
  return least;
}
/** The sloughs (the design's §1, planning's rulings of 2026-11-15 and 2026-11-17): one from a plain-side low place in
 *  the levee's middle third along the river (its upper half where the red stream joins the river), on the highest
 *  level of the plain that range offers `reach` tiles of the river on (the plain's level read `side` tiles past the
 *  river's half-width), within `near` of the river's length of that run's lower end; at 192² and over a second from a
 *  low place `apart` of the plain's length or more above the first (a layout with no room for it is drawn
 *  again); 2 or 3 wide; drawn as a meander `bend` times its width (the design's bend every 6 to 10 widths). `room`: the red stream turns off the backswamp this far below the
 *  lowest slough's mouth. */
export const SLOUGH = { width: [2, 3], bend: 1.6, apart: 1 / 3, slant: [0.3, 0.6], room: 6, side: 6, reach: 12, near: 0.04 } as const;
/** The springs' pool at the river's head and the small pools (the brook's spring, the red source, the Red Fall's foot). */
const POOL_R = { springs: 3, well: 1.5, red: 2, foot: 2 } as const;
/** Layouts an attempt draws before it gives up. */
const LAYOUT_TRIES = 24;

// ------------------------------------------------------------------------------------------------- the plan's own numbers

export interface Riser {
  /** Where it crosses the floor, u, and its wander across the floor by noise. */
  at: number;
  amp: number;
  cell: number;
  seed: number;
}

/** A run of a levee's crest along the river (arc length `from` to `to` along the river's path), `over` the plain. */
export interface CrestRun {
  from: number;
  to: number;
  over: 0 | 1 | 2;
}

/** A low place in a levee: where an old flood broke out, level with the plain. */
export interface LowPlace {
  id: string;
  side: "plain" | "near";
  from: number;
  to: number;
  /** Its middle at the levee's crest (map). */
  at: Point;
}

/** An old flood channel from a low place across the plain to the backswamp: a dry bed a level under the plain. */
export interface Slough {
  id: string;
  low: string;
  path: Point[];
  half: number;
  bed: number[];
}

/** The poisoned floodplain's own numbers (as the Gate's `GateNumbers`), kept so the invariants and the diagram read
 *  them directly. Lines and spans are local (u down the valley, v across it); points and paths are on the map. */
export interface PlainNumbers {
  /** The local frame onto the map: the local box (side `boxOf(N, angle)`) turned `angle` degrees about its middle onto
   *  the map's, then `mirror` (x flipped) and `turn` quarter turns. */
  turn: number;
  mirror: boolean;
  angle: number;
  /** The valley's axis's bends: where (u) and by how much (degrees, + toward +v). */
  bends: { at: number; turn: number }[];
  /** The valley's lines, a sample every `step` tiles of u (0 to the box's side): its axis, the near wall's foot (the
   *  axis with a little noise), the far wall's foot and the backswamp's width under it, v. */
  step: number;
  axis: number[];
  near: number[];
  far: number[];
  swamp: number[];
  /** The river's centre's room, tiles off the near wall's foot: the near third of the floor. */
  room: [number, number];
  /** Levels: the plain at its upstream end (`L`), the terrace, the walls' crests. The backswamp stands a level under the
   *  plain where it is, the river's bed and the red stream's two under it. */
  L: number;
  terraceLevel: number;
  walls: { near: number; far: number };
  /** The plain's mean width (from the far side of the river's room to the far wall's foot, the backswamp in it), and
   *  `M`. */
  P: number;
  M: number;
  /** The start's terrace (u from, to), where the plain begins (its head, u) and where its middle leaves the map (u). */
  terrace: [number, number];
  plainFrom: number;
  plainTo: number;
  risers: Riser[];
  /** The levees: their width by noise along the river; the crest runs each side, along the river's path from where the
   *  plain begins (`from`) to its end (`to`); the low places. */
  levee: { width: { mid: number; amp: number; cell: number; seed: number }; from: number; to: number; plain: CrestRun[]; near: CrestRun[]; low: LowPlace[] };
  sloughs: Slough[];
  /** The far wall's search window (u along its foot) and every run of it the vista frame shows from the start. */
  window: { from: number; to: number; framed: [number, number][] };
  /** The gulch's targets (stage 2 finds it): its mouth (u on the far wall's foot), the Red Fall's height over the
   *  backswamp there, its width and length, its head (map), its narrows (map, width, floor level), the rise of its
   *  floor from the mouth to the head. */
  gulch: { mouth: number; h: number; crest: number; width: number; length: number; head: Point; narrows: { at: Point; width: number; floor: number }; rise: number };
  /** The col between the gulch and the Dry Fork (its neighbour up or down the valley), and the Dry Fork's course from
   *  the col to an edge of its own, its bed from the col's level down to its edge's. */
  col: { at: Point; level: number; side: "up" | "down" };
  fork: { path: Point[]; bed: [number, number]; edge: Edge };
  /** The red stream's end by seed: joining the river (`at` tiles along its path) or leaving by an exit of its own;
   *  `swampTo` the u where it leaves the backswamp (its end, for an exit). */
  red: { end: "join" | "exit"; at?: number; swampTo: number };
  /** The flows: the river's springs together, the red source, the brook's spring. */
  flow: { river: number; red: number; brook: number };
  /** The badwater distance the start keeps (D469, D85). */
  badwater: number;
  /** Stage 2's search (`plainLand.ts`): the side valley found for the gulch (its index among the relief's), the tiles the
   *  mend changed, how far over the narrows the col stood before the mend, and where the plan as drawn looked for the
   *  gulch and how long it drew it (the far wall's side valleys are drawn from there, the gulch's that long, before and
   *  after the re-siting). Absent on the plan as drawn. */
  found?: { valley: number; changed: number; over: number; anchor: number; anchorLen: number };
}

export type PlainPlan = Omit<PremisePlan, "premise"> & { premise: typeof PLAIN_ID; plain: PlainNumbers };

/** The poisoned floodplain's numbers of a plan, or null. */
export const plainOf = (plan: PremisePlan): PlainNumbers | null => (plan as unknown as Partial<PlainPlan>).plain ?? null;

/** The plan's ids. */
export const PLAIN_IDS = { river: "river", brook: "brook", redFall: "redFall", red: "red", springs: "springs", well: "well", redSpring: "redSpring", redPool: "redPool", out: "out", redOut: "redOut", stain: "stain", fork: "fork", col: "col" } as const;
const I = PLAIN_IDS;

// ------------------------------------------------------------------------------------------------- eligibility

const plainTop = (spec: MapSpec) => Math.min(spec.settings.terrain.highestTerrain, EDITOR_LEVEL);
/** The badwater distance the start keeps (as the shared gate reads it: `validate/playability.ts`). */
const badwaterOf = (spec: MapSpec) => spec.settings.hazards.badwaterDistance;

export function poisonedPlainEligible(spec: MapSpec): string | null {
  const { x, y } = spec.size;
  if (x !== y) return "The poisoned floodplain is drawn on square maps only, for now";
  if (x < PLAIN_SIDE[0]) return `The poisoned floodplain needs at least ${PLAIN_SIDE[0]} tiles a side for its broad valley floor`;
  if (x > PLAIN_SIDE[1]) return `The poisoned floodplain is drawn up to ${PLAIN_SIDE[1]} tiles a side`;
  if (spec.settings.hazards.badwater === "off") return "The poisoned floodplain is a red stream's story, and Badwater is Off";
  if (spec.settings.water.rivers === 0) return "The poisoned floodplain needs its river, and Rivers is 0";
  // the Red Fall's spring under the water's ceiling: the plain's lowest level, the backswamp under it, the fall over it
  if (PLAIN_LEAST - 1 + GULCH.h[0] + GULCH.rise[0] > plainTop(spec) - 2) return `Highest terrain ${spec.settings.terrain.highestTerrain} is too low for the plain's levels and the Red Fall`;
  if (PLAIN_LEAST + FAR_OVER + 1 > spec.settings.terrain.highestTerrain) return `Highest terrain ${spec.settings.terrain.highestTerrain} is too low for the far wall over the plain`;
  return null;
}

// ------------------------------------------------------------------------------------------------- the turn

/** The local frame onto the map: `k` quarter turns, `m` u mirrored first (as the Gate's `Turn`). */
export interface Turn {
  k: number;
  m: boolean;
  N: number;
  /** The angle's cosine and sine (portable), and the local box's side. */
  c: number;
  s: number;
  U: number;
}

/** The local box's side for a map's side and the valley's angle (degrees): the turned map square fits inside it. */
export const boxOf = (N: number, angle: number): number => N * (cos((angle * Math.PI) / 180) + sin((angle * Math.PI) / 180));

function turnFor(k: number, m: boolean, N: number, angle: number): Turn {
  const a = (angle * Math.PI) / 180;
  return { k, m, N, c: cos(a), s: sin(a), U: boxOf(N, angle) };
}

export function toMap(T: Turn, [u, v]: Point): Point {
  const N = T.N;
  const du = u - T.U / 2;
  const dv = v - T.U / 2;
  let x = N / 2 + du * T.c - dv * T.s;
  const y = N / 2 + du * T.s + dv * T.c;
  if (T.m) x = N - x;
  return T.k === 0 ? [x, y] : T.k === 1 ? [y, N - x] : T.k === 2 ? [N - x, N - y] : [N - y, x];
}

export function toLocal(T: Turn, [px, py]: Point): Point {
  const N = T.N;
  let [x, y]: Point = T.k === 0 ? [px, py] : T.k === 1 ? [N - py, px] : T.k === 2 ? [N - px, N - py] : [py, N - px];
  if (T.m) x = N - x;
  const dx = x - N / 2;
  const dy = y - N / 2;
  return [T.U / 2 + dx * T.c + dy * T.s, T.U / 2 - dx * T.s + dy * T.c];
}

/** Whether a local point lies on the map, `margin` tiles inside its edges. */
export function onMap(T: Turn, q: Point, margin = 0): boolean {
  const [x, y] = toMap(T, q);
  return x >= margin && x <= T.N - margin && y >= margin && y <= T.N - margin;
}

/** The map edge a map point stands on (or nearest): S at y = 0, N at y = N (`planChecks.ts` `plan.graph`). */
export function edgeAt(N: number, [x, y]: Point): Edge {
  const d = [y, N - x, N - y, x];
  const k = d.indexOf(Math.min(...d));
  return (["S", "E", "N", "W"] as const)[k];
}

/** A map point set exactly on an edge. */
const onEdgeOf = (N: number, e: Edge, [x, y]: Point): Point => (e === "S" ? [x, 0] : e === "N" ? [x, N] : e === "W" ? [0, y] : [N, y]);

/** Where the local segment from `a` (on the map) to `b` (off it) crosses the map's edge, in local, set exactly on the
 *  edge on the map. */
function crossing(T: Turn, a: Point, b: Point): Point {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 30; k++) {
    const t = (lo + hi) / 2;
    if (onMap(T, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) lo = t;
    else hi = t;
  }
  const [x, y] = toMap(T, [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo]);
  const e = edgeAt(T.N, [x, y]);
  const on = onEdgeOf(T.N, e, [x, y]);
  return toLocal(T, [Math.max(0, Math.min(T.N, on[0])), Math.max(0, Math.min(T.N, on[1]))]);
}

/** A local path cut where it first leaves the map, ended on the edge (null if it never leaves). */
function cutAtEdge(T: Turn, path: readonly Point[]): Point[] | null {
  for (let k = 1; k < path.length; k++) if (!onMap(T, path[k])) return [...path.slice(0, k), crossing(T, path[k - 1], path[k])];
  return null;
}

function dirToMap(T: Turn, d: Point): Point {
  const a = toMap(T, [0, 0]);
  const b = toMap(T, d);
  return [b[0] - a[0], b[1] - a[1]];
}

export const turnOf = (plan: PremisePlan, p: PlainNumbers): Turn => turnFor(p.turn, p.mirror, plan.W, p.angle);
const r2 = (v: number) => Math.round(v * 100) / 100;
const rp = (p: Point): Point => [r2(p[0]), r2(p[1])];

/** A sampled line at u (linear between samples, held past its ends). */
export function lineAt(line: readonly number[], step: number, u: number): number {
  const f = Math.max(0, Math.min(line.length - 1, u / step));
  const k = Math.min(line.length - 2, Math.floor(f));
  return line[k] + (line[k + 1] - line[k]) * (f - k);
}

/** Where a riser crosses the floor at v (u): its wander, less its scar's arc there (`RISER.scar`; each arc's length
 *  and bow by noise of the riser's own seed, so the plan's draws are untouched). */
export const riserAt = (r: Riser, v: number): number => r.at + r.amp * fbm(r.seed, 0, v, r.cell, 2) - scarAt(r, v);
function scarAt(r: Riser, v: number): number {
  const { len, bow } = RISER.scar;
  const mean = (len[0] + len[1]) / 2;
  const t = (v + (mean / 3) * fbm(r.seed ^ 0x2c1b3c6d, 0, v, mean, 1)) / mean;
  const k = Math.floor(t);
  const b = bow[0] + (bow[1] - bow[0]) * (0.5 + 0.5 * fbm(r.seed ^ 0x51ed270b, k * 7.31 + 0.37, 0.53, 1, 1));
  return b * sin(Math.PI * (t - k));
}

/** The plain's level at a local point: L, a level less past each riser. */
export function plainLevel(p: Pick<PlainNumbers, "L" | "risers">, u: number, v: number): number {
  let n = 0;
  for (const r of p.risers) if (u >= riserAt(r, v)) n++;
  return p.L - n;
}

/** A levee's width at `s` tiles along the river on one side. */
export function leveeWidth(p: Pick<PlainNumbers, "levee">, s: number, side: "plain" | "near"): number {
  const w = p.levee.width;
  return Math.max(LEVEE.width[0], Math.min(LEVEE.width[1], w.mid + w.amp * fbm(w.seed, s, side === "plain" ? 0 : 1000, w.cell, 2)));
}

/** The crest's height over the plain at `s` along the river on one side, by its runs (a level where no run says). */
export function crestOver(runs: readonly CrestRun[], s: number): number {
  for (const r of runs) if (s >= r.from && s < r.to) return r.over;
  return 1;
}

// ------------------------------------------------------------------------------------------------- the valley in local

/** A path's points every `step` tiles along it, its end included, each with its arc length and its unit direction:
 *  one pass (a `pointAt` a sample is quadratic in the path). */
export function walk(path: readonly Point[], step: number): { p: Point; s: number; dir: Point }[] {
  const out: { p: Point; s: number; dir: Point }[] = [];
  let run = 0;
  let next = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const len = dist(a, b);
    if (!(len > 0)) continue;
    const dir: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    while (next <= run + len) {
      const t = (next - run) / len;
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], s: next, dir });
      next += step;
    }
    run += len;
  }
  const last = path[path.length - 1];
  if (!out.length || out[out.length - 1].s < run - 1e-9) out.push({ p: [last[0], last[1]], s: run, dir: out[out.length - 1]?.dir ?? [1, 0] });
  return out;
}

/** The river's path in local, sampled every half tile, with each point's arc length along it and the unit normal
 *  toward the plain (+v). */
export function riverLocal(T: Turn, path: readonly Point[]): { p: Point; s: number; n: Point }[] {
  return riverWalk(path.map((q) => toLocal(T, q)));
}

/** A local path sampled every half tile, with each point's arc length and its unit normal toward +v. */
export function riverWalk(path: readonly Point[]): { p: Point; s: number; n: Point }[] {
  return walk(path, 0.5).map(({ p, s, dir }) => {
    const n: Point = [-dir[1], dir[0]];
    return { p, s, n: n[1] >= 0 ? n : [-n[0], -n[1]] };
  });
}

/** The plain-side levee's foot (v) at each whole u, 0 to the local box's side `N` (−Infinity where the river does not
 *  pass). */
export function leveeFoot(p: PlainNumbers, N: number, half: number, river: ReturnType<typeof riverLocal>): Float64Array {
  N = Math.ceil(N);
  const out = new Float64Array(N + 1).fill(-Infinity);
  for (const q of river) {
    const w = half + leveeWidth(p, q.s, "plain");
    const f: Point = [q.p[0] + q.n[0] * w, q.p[1] + q.n[1] * w];
    for (const u of [Math.floor(q.p[0]), Math.floor(f[0])]) if (u >= 0 && u <= N) out[u] = Math.max(out[u], f[1], q.p[1] + half);
  }
  // (a gap a meander's turn leaves: its neighbours')
  for (let u = 1; u < N; u++) if (out[u] === -Infinity) out[u] = Math.max(out[u - 1], out[u + 1]);
  return out;
}

/** Smoothstep on 0 to 1. */
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** The valley's axis's heading off its local u (degrees) at u: each bend eased in over `ease` tiles about its place. */
export const axisHeading = (bends: readonly { at: number; turn: number }[], ease: number, u: number): number => bends.reduce((h, b) => h + b.turn * smooth((u - b.at + ease / 2) / ease), 0);

/** The floor's width (far wall's foot to near wall's foot, less the river's room and levee) at each whole u of the
 *  plain. */
export function floorWidths(near: readonly number[], far: readonly number[], step: number, toFoot: number, from: number, to: number): number[] {
  const out: number[] = [];
  for (let u = Math.ceil(from); u <= to; u++) out.push(lineAt(far, step, u) - lineAt(near, step, u) - toFoot);
  return out;
}

/** The floor's mean width over each run of `P` tiles of its length (one a tile). */
export function widthMeans(widths: readonly number[], P: number): number[] {
  const n = Math.max(1, Math.min(widths.length, Math.round(P)));
  const out: number[] = [];
  let sum = 0;
  for (let k = 0; k < widths.length; k++) {
    sum += widths[k];
    if (k >= n) sum -= widths[k - n];
    if (k >= n - 1) out.push(sum / n);
  }
  return out;
}

/** The longest run, tiles, of a wall's foot (a line sampled every `step` of u, from `from` to `to`, where it stands on
 *  the map) that stays within `WALL.near` tiles of one straight line: every start, the longest chord the foot stays
 *  within `WALL.near` of (`longestStraight`: a chord that strays does not end the search from its start). */
export function wallStraight(T: Turn, line: readonly number[], step: number, from: number, to: number, near: number = WALL.near): number {
  const pts: Point[] = [];
  for (let k = Math.max(0, Math.ceil(from / step)); k < line.length && k * step <= to; k++) {
    const q: Point = [k * step, line[k]];
    pts.push(onMap(T, q) ? q : [NaN, NaN]);
  }
  return longestStraight(pts, near);
}

/** A wall's foot as stage 2's ground draws it (`plainLand.ts` `groundFoot`, `plainRelief`): every 2 tiles of u from
 *  `from` to `to`, the last tile out from the floor toward the wall (`side`: 1 the far wall, -1 the near) whose middle,
 *  read through the floor's warp (`FLOOR_WARP`, without its calm round the gulch, which stage 2 finds later), stands
 *  on the floor's side of the line; NaN where the walk leaves the map. `us`: each point's u. */
export function wallFoot(T: Turn, line: readonly number[], step: number, from: number, to: number, side: 1 | -1, W: number, H: number, warp: (x: number, y: number) => readonly [number, number]): { pts: Point[]; us: number[] } {
  const pts: Point[] = [];
  const us: number[] = [];
  for (let u = Math.ceil(from); u <= to; u += 2) {
    const v0 = lineAt(line, step, u);
    let last: Point | null = null;
    let off = false;
    for (let t = -8; t <= 8; t += 0.5) {
      const q = toMap(T, [u, v0 + side * t]);
      const x = Math.floor(q[0]);
      const y = Math.floor(q[1]);
      if (x < 0 || y < 0 || x >= W || y >= H) {
        off = true;
        break;
      }
      const [lu, lv] = toLocal(T, [x + 0.5, y + 0.5]);
      const [du, dv] = warp(x, y);
      const at = lineAt(line, step, lu + du);
      if (side > 0 ? lv + dv > at : lv + dv < at) break;
      last = q;
    }
    pts.push(last && !off ? last : [NaN, NaN]);
    us.push(u);
  }
  return { pts, us };
}

/** A wall's line with a spur (`WALL.spur` tiles, a sine's arch half the run long, the way the line already bows off
 *  the run's chord) at the middle of its foot's straightest run (`foot`, `wallFoot`) while that run is over `most`
 *  tiles, up to `WALL.spurs` times (step 5: where no draw wanders enough). A new line. */
export function spurWhereStraight(line: readonly number[], step: number, most: number, foot: (line: readonly number[]) => { pts: Point[]; us: number[] }): number[] {
  const out = line.slice();
  for (let n = 0; n < WALL.spurs; n++) {
    const f = foot(out);
    const c = straightestChord(f.pts, WALL.near + WALL.read);
    if (c.len <= most || c.from < 0) break;
    const [u0, u1] = [f.us[c.from], f.us[c.to]];
    const uc = (u0 + u1) / 2;
    const half = (u1 - u0) / 4;
    const chordAt = (lineAt(out, step, u0) + lineAt(out, step, u1)) / 2;
    const sg = lineAt(out, step, uc) >= chordAt ? 1 : -1;
    for (let k = 0; k < out.length; k++) {
      const u = k * step;
      if (Math.abs(u - uc) < half) out[k] = r2(out[k] + sg * WALL.spur * sin((Math.PI * (u - uc + half)) / (2 * half)));
    }
  }
  return out;
}

/** The runs of the far wall's foot (whole u from `w0` to `w1`) that the vista frame from `start` shows: each u whose
 *  foot stands `LANDMARK_NEAR` to `LANDMARK_FAR` from the start and inside the frame at the backswamp's level and
 *  `over` above it (inside by the lip's half-width and its water: its ends stand up to 4.5 tiles either way along the
 *  wall). */
export function framedRuns(T: Turn, p: Pick<PlainNumbers, "far" | "swamp" | "step" | "L" | "risers" | "plainFrom">, start: { x: number; y: number; z: number; orientation: Orientation }, w0: number, w1: number, over: number): [number, number][] {
  const vista = openingCamera(start, VISTA_ZOOM);
  const vF = (u: number) => lineAt(p.far, p.step, u);
  const vB = (u: number) => vF(u) - lineAt(p.swamp, p.step, u);
  const lv = (u: number, v: number) => (u < p.plainFrom ? p.L : plainLevel(p, u, v));
  const shown = (u: number) => {
    const q = toMap(T, [u, vF(u)]);
    const d = dist([start.x + 0.5, start.y + 0.5], q);
    if (d < LANDMARK_NEAR || d > LANDMARK_FAR) return false;
    const lvl = lv(u, vB(u) + 1) - 1;
    const inside = (f: { u: number; v: number } | null) => !!f && Math.abs(f.u) <= FRAME.uSide - 0.1 && Math.abs(f.v) <= FRAME.vTop - 0.05;
    return inside(frameAt(vista, q[0], q[1], lvl + over)) && inside(frameAt(vista, q[0], q[1], lvl));
  };
  const runs: [number, number][] = [];
  for (let u = Math.ceil(w0); u <= Math.floor(w1); u++) {
    if (!shown(u)) continue;
    let e = u;
    while (e + 1 <= Math.floor(w1) && shown(e + 1)) e++;
    runs.push([u, e]);
    u = e;
  }
  return runs;
}

// ------------------------------------------------------------------------------------------------- the layout

const RIVER_NAMES = ["the Alder River", "the Sedge River", "the Long River", "the Willow River", "the Grey River"];
const FALL_NAMES = ["the Red Fall", "the Rust Fall", "the Blood Fall"];
const STAIN_NAMES = ["the Stain", "the Red Gulch", "the Rust Gulch"];
const FORK_NAMES = ["the Dry Fork", "the Old Fork", "the Bare Fork"];

type Laid = { plan: PlainPlan } | { why: string };

function layout(spec: MapSpec, attempt: number, t: number): Laid {
  const rng = premiseStream(spec, "premise.plan", attempt, "plain", t);
  const draw = () => rng.float();
  const seedOf = () => rng.nextU32();
  const N = spec.size.x;
  const top = plainTop(spec);
  const sky = spec.settings.terrain.highestTerrain;
  const flow = STAIR_FLOW[spec.settings.water.riverFlow];
  // (the red stream's end by its own draw: the river's width follows the most it carries, below a join its own and the
  // red stream's)
  const endJoin = premiseStream(spec, "premise.plan", attempt, "plain", t, "end").float() < 0.5;
  // the river's width by flow, as the lake stair's gorge: 5 wide carries about 13 a level deep, 6 wide the lush 22
  const carried = flow + BROOK_SPRING[1] + (endJoin ? flow * (RED_SHARE[spec.settings.hazards.badwater as keyof typeof RED_SHARE] ?? RED_SHARE.normal) : 0);
  const half = carried > 18 ? 3 : 2.5;
  const dBw = badwaterOf(spec);

  // ---- the valley on the map: its axis off the grid, with one or two gentle bends
  const nb = rng.int(VALLEY.bends[0], VALLEY.bends[1] + 1);
  const turns: number[] = [];
  for (let k = 0; k < nb; k++) {
    const sg = k === 0 ? (draw() < 0.5 ? 1 : -1) : -Math.sign(turns[0]) * (draw() < 0.65 ? 1 : -1);
    turns.push(r2(sg * rng.range(VALLEY.turn[0], VALLEY.turn[1])));
  }
  const heads = [0];
  for (const d of turns) heads.push(heads[heads.length - 1] + d);
  const aLo = VALLEY.angle[0] + VALLEY.margin - Math.min(...heads);
  const aHi = VALLEY.angle[1] - VALLEY.margin - Math.max(...heads);
  if (aHi < aLo) return { why: "the valley's bends turn it onto the grid" };
  const angle = r2(rng.range(aLo, aHi));
  const T = turnFor(rng.int(0, 4), draw() < 0.5, N, angle);
  const U = T.U;
  const ease = N * rng.range(VALLEY.ease[0], VALLEY.ease[1]);
  const bendAt = nb === 1 ? [U / 2 + N * rng.range(-0.2, 0.2)] : [U / 2 - N * rng.range(0.1, 0.3), U / 2 + N * rng.range(0.1, 0.3)];
  const bends = turns.map((d, k) => ({ at: r2(bendAt[k]), turn: d }));
  const headingAt = (u: number) => axisHeading(bends, ease, u);

  // ---- across the floor: the plain's mean width P by the map, the river's room (the near third), the backswamp
  const lw = LEVEE.width[1];
  const [Plo, Phi] = plainRange(N);
  const Lfrac = rng.range(PLAIN.long[0], PLAIN.long[1]);
  const Lp = Lfrac * N;
  const roomGuess = Math.max(RIVER_ROOM.width, Math.round(RIVER_ROOM.share * ((Plo + Phi) / 2)));
  const P = Math.max(Plo, Math.min(Phi, Math.round((rng.range(PLAIN.floor[0] + 0.02, PLAIN.floor[1] - 0.03) * N * N) / Lp - roomGuess / 2)));
  const roomW = Math.max(RIVER_ROOM.width, Math.round(RIVER_ROOM.share * P));
  const room: [number, number] = [half + lw + 1, half + lw + 1 + roomW];
  const mid = (room[0] + room[1]) / 2;
  const toFoot = room[1] + half + lw;
  const swampMean = rng.range(SWAMP.least + 0.5, swampMost(N) - 0.5);
  const step = 4;
  const K = Math.ceil(U / step);
  // the axis: its heading integrated down the valley, set so the valley and its far wall's gulches sit on the map
  const axisRaw: number[] = [0];
  for (let u = 1; u <= K * step; u++) axisRaw.push(axisRaw[u - 1] + tan((headingAt(u - 0.5) * Math.PI) / 180));
  // (the line between the river and the floor's middle through the map's middle: the longest run on the map for the
  // river's springs, the terrace and the plain; the far wall's gulches fit beyond the floor on all but the largest P)
  const nearGround = 14;
  const shift = U / 2 - (mid + toFoot + P / 2) / 2 - axisRaw[Math.round(U / 2)];
  // a wall's own line off the axis: spurs and re-entrants by turns, a sine's arch each, and a little noise
  const wallLine = (): number[] => {
    const arches: { a: number; len: number; h: number }[] = [];
    let sg = draw() < 0.5 ? 1 : -1;
    for (let a = -rng.range(0, WALL.len[1]) * P; a < K * step; sg = -sg) {
      const len = (rng.range(WALL.len[0], WALL.len[1]) * P) / 2;
      arches.push({ a, len, h: sg * rng.range(WALL.out[0], WALL.out[1]) * P });
      a += len;
    }
    const seed = seedOf();
    const out: number[] = [];
    for (let k = 0; k <= K; k++) {
      const u = k * step;
      const arch = arches.find((x) => u >= x.a && u < x.a + x.len);
      out.push((arch ? arch.h * sin((Math.PI * (u - arch.a)) / arch.len) : 0) + WALL.rough * fbm(seed, u, 0, WALL.roughCell * P, 2));
    }
    return out;
  };
  const axis: number[] = [];
  for (let k = 0; k <= K; k++) axis.push(r2(axisRaw[k * step] + shift));
  // (each wall drawn, where a draw allows, with no run of `longest` of P within `near` tiles of a line on its foot as
  // the ground draws it, `wallFoot`, the straightest of its draws by that measure else, spurred where it runs straight:
  // the land's warp moves the foot a tile or two either way, and where it moves against the line's bend it reads
  // straighter on the ground than drawn)
  const most = WALL.longest * P;
  const ws = floorWarpSeeds(spec.seed, N, N);
  const warped = new Map<number, readonly [number, number]>();
  const warp = (x: number, y: number): readonly [number, number] => {
    const i = y * N + x;
    let w = warped.get(i);
    if (!w) warped.set(i, (w = [FLOOR_WARP.amp * fbm(ws.u, x, y, FLOOR_WARP.cell, 2), FLOOR_WARP.amp * fbm(ws.v, x, y, FLOOR_WARP.cell, 2)]));
    return w;
  };
  const footRun = (line: readonly number[], from: number, to: number, side: 1 | -1) => longestStraight(wallFoot(T, line, step, from, to, side, N, N, warp).pts, WALL.near + WALL.read);
  let near: number[] = [];
  let nearRun = Infinity;
  for (let d = 0; d < WALL.draws; d++) {
    const off = wallLine();
    const line = axis.map((c, k) => r2(c + off[k]));
    if (wallStraight(T, line, step, 0, K * step) > most) continue;
    const run = footRun(line, 0, K * step, -1);
    if (run < nearRun) [near, nearRun] = [line, run];
    if (run <= most) break;
  }
  if (!near.length) return { why: "the near wall runs straight" };
  if (nearRun > most) near = spurWhereStraight(near, step, most, (l) => wallFoot(T, l, step, 0, K * step, -1, N, N, warp));
  const vN = (u: number) => lineAt(near, step, u);
  // where the floor's middle leaves the map: the plain's foot; its head `Lp` up the valley; the terrace above it
  const midLine = (u: number): Point => [u, vN(u) + toFoot + P / 2];
  let plainTo = -1;
  for (let u = Math.floor(U); u >= 0; u--)
    if (onMap(T, midLine(u))) {
      plainTo = u;
      break;
    }
  const plainFrom = r2(plainTo - Lp);
  const benchAim = Math.round(FLOOR_MARGIN * START_FLOORS[spec.designedFor].bench[spec.settings.start.area]);
  const tLen = Math.max(TERRACE.len[0], Math.min(TERRACE.len[1], TERRACE.brookAt + Math.ceil((TERRACE.room * benchAim) / P))) + rng.int(0, 5);
  const terrace: [number, number] = [r2(plainFrom - tLen), plainFrom];
  let riverIn = Infinity;
  for (let u = 0; u <= U; u++)
    if (onMap(T, [u, vN(u) + mid], POOL_R.springs + 3)) {
      riverIn = u;
      break;
    }
  // (the springs up the valley from the brook's join below the terrace's head: the river may come in beside it)
  if (riverIn + 2 * POOL_R.springs + 2 > terrace[0] + TERRACE.brookAt - 4) return { why: "no room up the valley for the river's springs above the terrace's brook" };
  // the far wall by its own line: the floor narrower at the plain's head and wider at its foot, the wall's spurs and
  // re-entrants on that, set so the floor's mean width is P and its mean over any P of its length stays in bounds
  const head = rng.range(PLAIN.head[0], PLAIN.head[1]);
  const footW = rng.range(PLAIN.foot[0], PLAIN.foot[1]);
  const ramp = (u: number) => head + (footW - head) * smooth(Math.max(0, Math.min(1, (u - plainFrom) / Lp)));
  let far: number[] = [];
  let farRun = Infinity;
  for (let d = 0; d < WALL.draws; d++) {
    const off = wallLine();
    const raw = axis.map((c, k) => c + toFoot + P * ramp(k * step) + off[k]);
    const w0 = floorWidths(near, raw, step, toFoot, plainFrom, plainTo);
    const lift = P - w0.reduce((a, b) => a + b, 0) / w0.length;
    const line = raw.map((v) => r2(v + lift));
    const means = widthMeans(floorWidths(near, line, step, toFoot, plainFrom, plainTo), P);
    if (Math.min(...means) < WALL.mean[0] * P || Math.max(...means) > WALL.mean[1] * P || wallStraight(T, line, step, terrace[0], plainTo) > most) continue;
    const run = footRun(line, terrace[0], plainTo, 1);
    if (run < farRun) [far, farRun] = [line, run];
    if (run <= most) break;
  }
  if (!far.length) return { why: "the far wall cannot wander and keep the floor's width" };
  if (farRun > most) {
    // (spurred, then set again so the floor's mean width is P, as each draw is)
    const bent = spurWhereStraight(far, step, most, (l) => wallFoot(T, l, step, terrace[0], plainTo, 1, N, N, warp));
    const w0 = floorWidths(near, bent, step, toFoot, plainFrom, plainTo);
    const lift = P - w0.reduce((a, b) => a + b, 0) / w0.length;
    const line = bent.map((v) => r2(v + lift));
    const means = widthMeans(floorWidths(near, line, step, toFoot, plainFrom, plainTo), P);
    if (Math.min(...means) >= WALL.mean[0] * P && Math.max(...means) <= WALL.mean[1] * P) far = line;
  }
  const swamp: number[] = [];
  const swampW = { seed: seedOf() };
  for (let k = 0; k <= K; k++) swamp.push(r2(Math.max(SWAMP.least, Math.min(swampMost(N), swampMean + SWAMP.wander * fbm(swampW.seed, k * step, 0, SWAMP.cell, 2)))));
  const vF = (u: number) => lineAt(far, step, u);
  const vB = (u: number) => vF(u) - lineAt(swamp, step, u);

  // ---- down the valley: the plain's risers, its level
  // (the height budget, `mostRisersUnder`: a level for each riser and, where the red stream joins the river, one for
  // the join; a level more by the draw where the budget leaves it)
  const risers: Riser[] = [];
  const mostR = mostRisersUnder(top, endJoin);
  const every = riserEvery(plainTo - RISER.end - plainFrom, mostR);
  for (let u = plainFrom + rng.range(every[0], every[1]); u < plainTo - RISER.end && risers.length < mostR; u += rng.range(every[0], every[1]))
    risers.push({ at: r2(u), amp: r2(rng.range(RISER.amp[0], RISER.amp[1])), cell: r2(rng.range(RISER.cell[0], RISER.cell[1])), seed: seedOf() });
  const L = PLAIN_LEAST + risers.length + (endJoin ? JOIN.levels : 0) + (draw() < 0.5 && risers.length < mostR ? 1 : 0);
  const lv = (u: number, v: number) => (u < plainFrom ? L : plainLevel({ L, risers }, u, v));

  // ---- the start on the terrace's lip at the plain's head (or nearer its brook, `TERRACE.brook`), a third to a half
  // of the way across from the river, looking down the valley across the plain (the river's room's far side stands for
  // the river: so the frame is judged before the river is drawn)
  const uS = Math.min(plainFrom - TERRACE.lip, terrace[0] + TERRACE.brookAt + TERRACE.brook);
  const vRoom = vN(uS) + room[1] + half;
  const fS = rng.range(TERRACE.across[0] + 0.01, TERRACE.across[1] - 0.01);
  const vS = vRoom + fS * (vF(uS) - vRoom);
  const sAt = toMap(T, [uS + 0.5, vS + 0.5]);
  const sx = Math.floor(sAt[0]);
  const sy = Math.floor(sAt[1]);
  if (sx < 10 || sy < 10 || sx > N - 10 || sy > N - 10) return { why: "the terrace stands off the map" };
  const z = L + TERRACE.rise;

  // ---- the far wall's search window and every run of it the vista frame shows; the start looks the way that frames
  // the nearest place for the Red Fall, and the gulch is drawn there (nearest-first)
  // (from where the start stands at the lip: a start drawn back toward its brook, `TERRACE.brook`, keeps the fall where
  // the plain below the lip shows it)
  const uWin = uS < plainFrom - TERRACE.lip ? plainFrom - TERRACE.lip : toLocal(T, [sx + 0.5, sy + 0.5])[0];
  const w0 = Math.max(plainFrom + WINDOW.framed, uWin + dBw);
  const w1 = plainFrom + WINDOW.to * Lp;
  if (w1 - w0 < WINDOW.framed) return { why: "the badwater distance leaves no search window" };
  const hMid = (GULCH.h[0] + GULCH.h[1]) / 2;
  const runsFor = (orientation: Orientation) => framedRuns(T, { far, swamp, step, L, risers, plainFrom }, { x: sx, y: sy, z, orientation }, w0, w1, hMid);
  let orientation: Orientation = ORIENTATIONS[0];
  let framed: [number, number][] = [];
  let run: [number, number] | undefined;
  for (const o of ORIENTATIONS) {
    const runs = runsFor(o);
    const r = runs.find(([a, b]) => b - a >= WINDOW.framed);
    if (r && (!run || r[0] < run[0])) {
      run = r;
      framed = runs;
      orientation = o;
    }
  }
  if (!run) return { why: "frame: the vista frame cannot show the Red Fall in its search window" };
  const start = { x: sx, y: sy, z, orientation };
  const vista = openingCamera(start, VISTA_ZOOM);

  // ---- the gulch's targets, the Red Fall at its mouth, the col and the Dry Fork
  const lipHalf = WINDOW.framed / 2;
  const uM = run[0] + lipHalf + Math.min(WINDOW.past, run[1] - run[0] - 2 * lipHalf) * draw();
  const vMouth = vF(uM);
  const Lm = lv(uM, vB(uM) + 1);
  const swampLevel = Lm - 1;
  let h = rng.int(GULCH.h[0], GULCH.h[1] + 1);
  h = Math.min(h, top - 2 - GULCH.rise[0] - swampLevel);
  if (h < GULCH.h[0]) return { why: "no room under the water's ceiling for the Red Fall" };
  const crest = swampLevel + h;
  const rise = Math.min(rng.int(GULCH.rise[0], GULCH.rise[1] + 1), top - 2 - crest);
  const gw = rng.int(GULCH.width[0], GULCH.width[1] + 1);
  const gLen = rng.range(GULCH.len[0], GULCH.len[1]);
  const slant = rng.range(-GULCH.slant, GULCH.slant);
  const gDir: Point = [sin(slant), cos(slant)];
  const gHead: Point = [uM + gDir[0] * gLen, vMouth + gDir[1] * gLen];
  if (!onMap(T, gHead, POOL_R.red + 3)) return { why: "the gulch runs off the map" };
  const nf = rng.range(GULCH.narrowsAt[0], GULCH.narrowsAt[1]);
  const nAt: Point = [uM + gDir[0] * gLen * nf, vMouth + gDir[1] * gLen * nf];
  const nFloor = crest + Math.floor(rise * nf);
  const nWidth = rng.int(GULCH.narrows[0], GULCH.narrows[1] + 1);
  const colSide: "up" | "down" = draw() < 0.5 ? "up" : "down";
  const sgn = colSide === "down" ? 1 : -1;
  const colAt: Point = [nAt[0] + sgn * (gw / 2 + rng.range(GULCH.colOut[0], GULCH.colOut[1])), nAt[1] + 2];
  if (!onMap(T, colAt, 4)) return { why: "the col stands off the map" };
  const colLevel = nFloor + GULCH.colOver;
  // the Dry Fork falls from the col away from the plain to an edge of its own
  const forkL: Point[] = [colAt];
  const forkSeed = seedOf() & 0xffff;
  for (let v = colAt[1] + 6; v < U + 12; v += 6) {
    const q: Point = [colAt[0] + sgn * 3 * fbm(forkSeed, v, 0, 20, 1) + sgn * 2, v];
    if (!onMap(T, q)) {
      forkL.push(crossing(T, forkL[forkL.length - 1], q));
      break;
    }
    forkL.push(q);
  }
  if (onMap(T, forkL[forkL.length - 1], 0.01) || forkL.length < 3) return { why: "the Dry Fork finds no edge of its own" };
  const forkBed: [number, number] = [colLevel - 1, Math.max(BED_FLOOR + 1, colLevel - rng.int(GULCH.forkFall[0], GULCH.forkFall[1] + 1))];
  // ---- the river: springs at its head by the upstream edge, meandering in the near third to the downstream edge
  const headU = riverIn;
  const course: Point[] = [];
  let pastEdge = 0;
  for (let u = headU + POOL_R.springs; pastEdge < 2; u += 4) {
    course.push([u, vN(u) + mid]);
    if (!onMap(T, [u, vN(u) + mid])) pastEdge++;
  }
  const inRoom = (p: Point) => {
    const off = p[1] - vN(p[0]);
    return off >= room[0] && off <= room[1];
  };
  const rm = meander(course, 2 * half, draw, { levels: 0, from: 0 }, (p, _u, toEnd) => inRoom(p) && (toEnd < 10 || onMap(T, p, 1)), 2, true);
  const riverCut = cutAtEdge(T, sampled(rm, 4).path);
  if (!riverCut) return { why: "the river does not reach the map's edge" };
  const riverL = riverCut.map(rp);
  for (const q of riverL.slice(0, -1)) if (q[1] - vN(q[0]) < room[0] - 1 || q[1] - vN(q[0]) > room[1] + 1) return { why: "the river leaves the near third" };
  // (its bed, stepping down at riffles, once the red stream's join is known: `riverSteps`)
  let low = Infinity;
  let riverBed: number[] = [];
  const S = pathLength(riverL);
  const riverAt = (s: number) => pointAt(riverL, s);
  // (the river a point a tile, for the searches along it)
  const rs = walk(riverL, 1);
  // where the plain begins along the river
  const sPlain = rs.find((q) => q.p[0] >= plainFrom)?.s ?? 0;

  const redFlow = r2(flow * (RED_SHARE[spec.settings.hazards.badwater as keyof typeof RED_SHARE] ?? RED_SHARE.normal));
  // (the draw the red stream's end once took, kept so the draws after it stand)
  rng.float();
  const walls = { near: Math.min(sky - 2, L + rng.int(NEAR_OVER[0] + 1, NEAR_OVER[1] + 1)), far: 0 };
  walls.far = Math.min(sky, Math.max(walls.near + 2, crest + rise + 4, L + FAR_OVER + 1));
  if (walls.far < L + FAR_OVER) return { why: "the far wall cannot stand 8 over the plain under the highest ground" };
  if (walls.far < colLevel + 2) return { why: "the far wall stands under the col" };

  // ---- the levees: width by noise, the low places, the crest runs; the sloughs from the low places to the backswamp
  const levee: PlainNumbers["levee"] = { width: { mid: 4.5, amp: 1.5, cell: r2(rng.range(LEVEE.cell[0], LEVEE.cell[1])), seed: seedOf() }, from: r2(sPlain), to: r2(S), plain: [], near: [], low: [] };
  const big = N >= 192;
  // (a second slough only where the land offers its low place a third of the plain above the first, planning's ruling
  // of 2026-11-17: a layout with no room for it is drawn again, never a slough laid where the land has no low place)
  const nSlough = big ? 2 : 1;
  const nLow = rng.int((big ? LEVEE.lows.large : LEVEE.lows.small)[0], (big ? LEVEE.lows.large : LEVEE.lows.small)[1] + 1);
  const sOfU = (u: number, from = sPlain) => {
    let best = from;
    let bd = Infinity;
    for (const q of rs) {
      if (q.s < from) continue;
      const d = Math.abs(q.p[0] - u);
      if (d < bd) {
        bd = d;
        best = q.s;
      }
    }
    return best;
  };
  const lows: { side: "plain" | "near"; mid: number; len: number; slough?: number }[] = [];
  const free = (m: number, len: number) => m - len / 2 > sPlain + 6 && m + len / 2 < S - 6 && lows.every((o) => Math.abs(o.mid - m) > (o.len + len) / 2 + LEVEE.apart);
  // (the first, the river in's, from a low place in the levee's middle third (along the river); a second a third of
  // the plain's length or more from it, up the valley or down it where there is room)
  // (in its upper half where the red stream joins the river, the join below the sloughs' mouths, a second slough then
  // above it)
  // (a second slough stands above the first (planning's ruling of 2026-11-17): the river in's weir lifts the river's
  // reach above it over the second's mouth too, where a second below the first stayed dry, and the dry band above the
  // first is the one a ditch cannot reach up a riser; so the first is drawn where the river has passed the room for the
  // second's low place above it: `upRoom` below holds one)
  const apart = SLOUGH.apart * Lp;
  let firstLeast = 1 / 3 + 0.02;
  const firstMost = endJoin ? 1 / 2 : 2 / 3 - 0.02;
  if (nSlough > 1) {
    const want = plainFrom + 14 + apart + 1 + 4;
    while (firstLeast < firstMost && riverAt(sPlain + (S - sPlain) * firstLeast).p[0] < want) firstLeast += 0.005;
    if (firstLeast >= firstMost) return { why: "no room for a second slough a third of the plain above the first" };
  }
  // (the first leaves from the highest level of the plain its range offers `SLOUGH.reach` of the river on: its water
  // runs down to every level under it, and a player's ditch carries it there, but never up a riser to the plain above;
  // and as far down that level as the range goes, within `SLOUGH.near` of its end: with the second slough above it,
  // the two part the dry band nearest its middle, where a first early in its range left the plain below it dry)
  const sideLevel = (f: number) => {
    const q = riverAt(sPlain + (S - sPlain) * f);
    const n0: Point = [-q.dir[1], q.dir[0]];
    const n: Point = n0[1] >= 0 ? n0 : [-n0[0], -n0[1]];
    return lv(q.p[0] + n[0] * (half + SLOUGH.side), q.p[1] + n[1] * (half + SLOUGH.side));
  };
  let firstTo = firstMost;
  {
    const top = sideLevel(firstLeast);
    let f = firstLeast;
    while (f < firstMost && sideLevel(f) >= top) f += 0.005;
    if ((f - firstLeast) * (S - sPlain) >= SLOUGH.reach) firstTo = Math.min(firstMost, f - 0.005);
  }
  const firstS = sPlain + (S - sPlain) * rng.range(Math.max(firstLeast, firstTo - SLOUGH.near), firstTo);
  const first = riverAt(firstS).p[0];
  const upRoom: [number, number] = [plainFrom + 14, first - apart - 1];
  const ups = upRoom[1] - upRoom[0] >= 4;
  for (let k = 0; k < nSlough; k++) {
    const len = rng.int(LEVEE.low[0], LEVEE.low[1] + 1);
    const span = upRoom;
    if (k > 0 && !ups) return { why: "no room for a second slough a third of the plain above the first" };
    const u = k === 0 ? first : span[0] + (span[1] - span[0]) * draw();
    const m = k === 0 ? firstS : sOfU(u);
    if (!free(m, len)) return { why: "no room for a slough's low place" };
    lows.push({ side: "plain", mid: m, len, slough: k });
  }
  for (let tries = 0; lows.length < nLow && tries < 40; tries++) {
    const len = rng.int(LEVEE.low[0], LEVEE.low[1] + 1);
    const m = sPlain + (S - sPlain) * draw();
    if (free(m, len)) lows.push({ side: draw() < 0.5 ? "plain" : "near", mid: m, len });
  }
  if (lows.length < nLow) return { why: "no room for the levee's low places" };
  lows.sort((a, b) => a.mid - b.mid);
  const P0 = { L, risers, levee } as PlainNumbers;
  const crestRuns = (side: "plain" | "near", seed: number): CrestRun[] | null => {
    const over: number[] = [];
    const s0 = Math.floor(sPlain);
    const s1 = Math.ceil(S);
    for (let s = s0; s < s1; s++) {
      const lo = lows.find((o) => o.side === side && s + 0.5 >= o.mid - o.len / 2 && s + 0.5 < o.mid + o.len / 2);
      over.push(lo ? 0 : fbm(seed, s, 0, LEVEE.crestCell, 2) > LEVEE.hump ? 2 : 1);
    }
    const most = LEVEE.most * (S - sPlain);
    // a run of one height too long takes a hump (or a dip back to a level) where its noise is highest (lowest)
    for (let round = 0; round < 24; round++) {
      let a = 0;
      let worst: [number, number] | null = null;
      for (let k = 1; k <= over.length; k++)
        if (k === over.length || over[k] !== over[a]) {
          if (k - a > most && (!worst || k - a > worst[1] - worst[0])) worst = [a, k];
          a = k;
        }
      if (!worst) break;
      const [ra, rb] = worst;
      const hump = over[ra] === 1;
      let at = -1;
      let best = -Infinity;
      for (let k = ra + 8; k < rb - 8; k++) {
        const n = fbm(seed, k + s0, 0, LEVEE.crestCell, 2) * (hump ? 1 : -1);
        if (n > best) {
          best = n;
          at = k;
        }
      }
      if (at < 0) return null;
      const hl = rng.int(LEVEE.humpLen[0], LEVEE.humpLen[1] + 1);
      for (let k = at - (hl >> 1); k < at - (hl >> 1) + hl; k++) over[k] = hump ? 2 : 1;
    }
    const runs: CrestRun[] = [];
    let a = 0;
    for (let k = 1; k <= over.length; k++)
      if (k === over.length || over[k] !== over[a]) {
        runs.push({ from: a === 0 ? r2(sPlain) : a + s0, to: k === over.length ? r2(S) : k + s0, over: over[a] as 0 | 1 | 2 });
        a = k;
      }
    return runs;
  };
  const plainRuns = crestRuns("plain", seedOf());
  const nearRuns = crestRuns("near", seedOf());
  if (!plainRuns || !nearRuns) return { why: "the levee's crest holds one height too long" };
  levee.plain = plainRuns;
  levee.near = nearRuns;
  let li = 0;
  const lowOf = new Map<number, string>();
  for (const o of lows) {
    const q = riverAt(o.mid);
    const n0: Point = [-q.dir[1], q.dir[0]];
    const n: Point = n0[1] >= 0 ? n0 : [-n0[0], -n0[1]];
    const sg = o.side === "plain" ? 1 : -1;
    const w = half + leveeWidth(P0, o.mid, o.side) / 2;
    if (o.slough !== undefined) lowOf.set(o.slough, `low${li + 1}`);
    levee.low.push({ id: `low${++li}`, side: o.side, from: r2(o.mid - o.len / 2), to: r2(o.mid + o.len / 2), at: rp(toMap(T, [q.p[0] + sg * n[0] * w, q.p[1] + sg * n[1] * w])) });
  }
  // the sloughs: from each of the first plain-side low places past the Red Fall's mouth to the backswamp
  const sloughs: Slough[] = [];
  let lastSlough = uM;
  const sloughLows = Array.from({ length: nSlough }, (_, k) => levee.low.find((o) => o.id === lowOf.get(k))!);
  const riverLoc = riverWalk(riverL);
  const foot = leveeFoot({ ...P0, levee } as PlainNumbers, U, half, riverLoc);
  for (const [k, o] of sloughLows.entries()) {
    const sm = (o.from + o.to) / 2;
    const q = riverAt(sm);
    const n0: Point = [-q.dir[1], q.dir[0]];
    const n: Point = n0[1] >= 0 ? n0 : [-n0[0], -n0[1]];
    const w = half + leveeWidth(P0, sm, "plain") + 0.5;
    const a: Point = [q.p[0] + n[0] * w, q.p[1] + n[1] * w];
    const ue = a[0] + (vB(a[0]) - a[1]) * rng.range(SLOUGH.slant[0], SLOUGH.slant[1]);
    if (!onMap(T, [ue, vB(ue) + 1], 6)) return { why: "no room for a slough below its low place" };
    lastSlough = Math.max(lastSlough, ue);
    const b: Point = [ue, vB(ue) + 1];
    const width = rng.int(SLOUGH.width[0], SLOUGH.width[1] + 1);
    const c: Point[] = [];
    const span = dist(a, b);
    for (let j = 0; j <= Math.max(2, Math.ceil(span / 4)); j++) {
      const f = j / Math.max(2, Math.ceil(span / 4));
      c.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    const sm2 = meander(c, SLOUGH.bend * width, draw, { levels: 0, from: 0 }, (p) => p[1] >= (foot[Math.max(0, Math.min(foot.length - 1, Math.floor(p[0])))] ?? -Infinity) + 1 && p[1] <= vF(p[0]) - 1, 1, false);
    const sl = sampled(sm2, 3).path.map(rp);
    let lo2 = Infinity;
    const bed = sl.map((p) => (lo2 = Math.min(lo2, lv(p[0], p[1]) - 1)));
    sloughs.push({ id: k === 0 ? "slough" : `slough${k + 1}`, low: o.id, path: sl.map((p) => rp(toMap(T, p))), half: width / 2, bed });
  }

  // ---- the red stream: from the Red Fall's pool along the backswamp, then into the river or out by its own exit
  const footC: Point = [uM, vMouth - POOL_R.foot - 0.5];
  const along = rng.range(0.4, 0.6);
  const alongSeed = hash32(spec.seed, N, N, "premise.water", "plain", "red.along");
  const swampV = (u: number) => vB(u) + (vF(u) - vB(u)) * Math.max(RED_DRIFT.keep[0], Math.min(RED_DRIFT.keep[1], along + RED_DRIFT.most * fbm(alongSeed, u, 0, RED_DRIFT.cell, 2)));
  let joinS = 0;
  let joinP: Point = [0, 0];
  let approach: Point = [0, 0];
  let swampTo = U;
  // (the river's steps for a join at `join` whose red stream leaves the backswamp at `turn` (u), or none: its water
  // under the plain beside it, the lowest level within its levees' reach, and at the join under the red stream's bed, a
  // level under the backswamp it runs from and under the plain it crosses to the river, so the red water falls into the
  // river: `JOIN.drop`)
  const rif = riffles(riverL, POOL_R.springs + 1, 4);
  const besideOf = (s: number) => {
    const q = rs[Math.max(0, Math.min(rs.length - 1, Math.round(s)))];
    const n: Point = [-q.dir[1], q.dir[0]];
    let m = Infinity;
    for (let o = -(half + 7); o <= half + 7; o++) m = Math.min(m, lv(q.p[0] + n[0] * o, q.p[1] + n[1] * o));
    return m;
  };
  const beside: number[] = rs.map((q) => besideOf(q.s));
  // (at each slough's mouth the ceiling is its bed: the slough's head reaches the river through its low place, a level
  // under the plain, `plainLand.ts` `sloughMouths`; the river's water stands under it on day 1, so the slough is dry,
  // and the weir below it lifts the river over it, step 4)
  sloughs.forEach((sl, k) => {
    const o = sloughLows[k];
    for (let s = Math.max(0, Math.floor(o.from) - 1); s <= Math.min(beside.length - 1, Math.ceil(o.to) + 1); s++) beside[s] = Math.min(beside[s], sl.bed[0]);
  });
  const redOver = (join: number, turn: number): number => {
    // (the red stream's bed on its way across the plain: two under the lowest ground from its turn to the river)
    const a: Point = [turn, swampV(turn)];
    const b = riverAt(join).p;
    let m = lv(a[0], a[1]);
    const n = Math.ceil(dist(a, b));
    for (let k = 1; k <= n; k++) m = Math.min(m, lv(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n));
    return m - 2;
  };
  const stepsFor = (join: number | null, turn: number) => {
    const swamp = join === null ? Infinity : Math.min(redOver(join, turn), besideOf(join));
    return riverSteps({
      path: riverL,
      head: lv(riverL[0][0], riverL[0][1]) - 2,
      floor: BED_FLOOR,
      width: 2 * half,
      riffles: rif,
      ceiling: (s) => (join !== null && s >= join - 1 && s <= join + 3 ? Math.min(swamp, beside[Math.min(beside.length - 1, s)]) : beside[Math.min(beside.length - 1, s)]),
      flow: (s) => flow + BROOK_SPRING[1] + (join !== null && s >= join ? redFlow : 0),
      join,
    });
  };
  const redCourse: Point[] = [[uM + POOL_R.foot, swampV(uM + POOL_R.foot)]];
  if (endJoin) {
    // (it turns off the backswamp below the Red Fall and the sloughs' mouths, so the river in runs the old red bed
    // from them down, and crosses the plain `slant` tiles down the valley a tile across)
    const slant = rng.range(JOIN.slant[0], JOIN.slant[1]);
    const need = Math.max(uM + JOIN.swamp, lastSlough + SLOUGH.room);
    const turnsAt = (q: Point) => q[0] - (vB(q[0]) - q[1]) * slant;
    let s0 = JOIN.at[0] * S;
    while (s0 < JOIN.at[1] * S && turnsAt(riverAt(s0).p) < need) s0 += 1;
    if (s0 >= JOIN.at[1] * S) return { why: "no room for the red stream's join below the sloughs" };
    // (just below one of the river's steps: of the joins whose river holds its water under its ceilings with the fewest
    // steps, one by the draw)
    const fits: { s: number; bed: number[]; n: number }[] = [];
    for (let j = Math.ceil(s0); j <= JOIN.at[1] * S; j++) {
      if (turnsAt(riverAt(j).p) < need) continue;
      const st = stepsFor(j, turnsAt(riverAt(j).p));
      if (st) fits.push({ s: j, bed: st.bed, n: st.at.length });
    }
    const least = Math.min(...fits.map((f) => f.n));
    const best = fits.filter((f) => f.n === least);
    const pick = best[Math.min(best.length - 1, Math.floor(draw() * best.length))];
    if (!pick) return { why: "the river finds no riffle above the red stream's join for the fall its length needs" };
    joinS = pick.s;
    riverBed = pick.bed;
    joinP = riverAt(joinS).p;
    swampTo = turnsAt(joinP);
    if (swampTo < need) return { why: "the red stream's join comes too soon below the Red Fall" };
    for (let u = uM + POOL_R.foot + 4; u < swampTo; u += 4) redCourse.push([u, swampV(u)]);
    redCourse.push([swampTo, swampV(swampTo)]);
    // (its last way square across the river's bank from the plain's side, the two half-widths and two tiles: its water
    // meets the river's at its end only, `redClear`)
    const d = riverAt(joinS).dir;
    const side: Point = d[0] >= 0 ? [-d[1], d[0]] : [d[1], -d[0]];
    const A = half + redHalf(redFlow) + 2;
    approach = [joinP[0] + side[0] * A, joinP[1] + side[1] * A];
    redCourse.push(approach);
  } else {
    const st = stepsFor(null, 0);
    if (!st) return { why: "the river finds no riffles for the fall its length needs" };
    riverBed = st.bed;
    let off = 0;
    for (let u = uM + POOL_R.foot + 4; off < 2; u += 4) {
      redCourse.push([u, swampV(u)]);
      if (!onMap(T, [u, swampV(u)])) off++;
    }
  }
  const swampLen = pathLength(redCourse.slice(0, endJoin ? -1 : undefined));
  const inSwamp = (p: Point) => p[1] >= vB(p[0]) + 1 && p[1] <= vF(p[0]) - 1;
  // (the river's maker at the stream's own width, its bends varying: `RED_DRIFT`)
  const redM = meander(redCourse, 2 * redHalf(redFlow), draw, { levels: 0, from: 0 }, (p, a, toEnd) => (a <= swampLen ? inSwamp(p) && (endJoin || toEnd < 10 || onMap(T, p, 1)) : true), 2, true);
  let redL: Point[];
  if (endJoin) {
    redL = sampled(redM, 3).path.map(rp);
    redL[redL.length - 1] = rp(approach);
    const n = Math.ceil(dist(approach, joinP) / 3);
    for (let k = 1; k <= n; k++) redL.push(rp([approach[0] + ((joinP[0] - approach[0]) * k) / n, approach[1] + ((joinP[1] - approach[1]) * k) / n]));
  } else {
    const cut = cutAtEdge(T, sampled(redM, 3).path);
    if (!cut) return { why: "the red stream does not reach the map's edge" };
    redL = cut.map(rp);
    swampTo = redL[redL.length - 1][0];
  }
  low = Infinity;
  const redBed = redL.map((q) => (low = Math.min(low, lv(q[0], q[1]) - 2)));
  if (endJoin) {
    // (its last reach short, and it falls, `JOIN.drop`: its bed a level under the backswamp to its last point but one,
    // within `drop` of the river's middle, then the river's bed there, below its step)
    let run = 0;
    let k = 0;
    while (k + 1 < riverL.length && run < joinS) run += dist(riverL[k], riverL[++k]);
    const rb = riverBed[k];
    const m = redL.length - 1;
    if (m < 2 || dist(redL[m - 1], redL[m]) > JOIN.drop) return { why: "the red stream's last reach into the river is long" };
    if (redBed[m - 1] - rb < 1) return { why: "the red stream does not fall into the river at its join" };
    redBed[m] = rb;
    if (redClear(riverL, riverBed, half, redL, redBed, redHalf(redFlow)) < 0) return { why: "the red stream runs beside the river where the river stands over its bed" };
  }

  // ---- the start's brook: a spring in the far wall's slope over the terrace, across it into the river
  const uB = terrace[0] + TERRACE.brookAt + rng.range(-2, 2);
  const wellC: Point = [uB, vF(uB) + POOL_R.well + 1.5];
  if (!onMap(T, wellC, POOL_R.well + 2)) return { why: "the terrace's spring stands off the map" };
  // (past the river's first tiles out of its springs)
  const brookS = sOfU(uB, 6);
  const brookEnd = riverAt(brookS).p;
  const bStart: Point = [wellC[0], wellC[1] - POOL_R.well];
  const bc: Point[] = [];
  const bSpan = dist(bStart, brookEnd);
  const bn = Math.max(3, Math.ceil(bSpan / 4));
  for (let j = 0; j <= bn; j++) bc.push([bStart[0] + ((brookEnd[0] - bStart[0]) * j) / bn, bStart[1] + ((brookEnd[1] - bStart[1]) * j) / bn]);
  // (down its three levels in its last 9 tiles, or from 2 short of where it leaves the terrace for the river's room,
  // the plain a level under its bed there)
  const offTerrace = bSpan * Math.max(0, Math.min(1, (bStart[1] - (vN(uB) + room[1] + half)) / Math.max(1e-9, bStart[1] - brookEnd[1])));
  const bm = meander(bc, 2, draw, { levels: 3, from: Math.max(0, Math.min(bSpan - 9, offTerrace - 2)), to: 1 }, (p) => Math.abs(p[0] - uB) < 6, 2, false);
  const brookL = bm.path.length > 2 ? sampled(bm, 3).path.map(rp) : bc.map(rp);
  brookL[brookL.length - 1] = rp(brookEnd);
  const bAlong = sampled(bm, 3).along;
  const brookBed = brookL.map((_, j) => L + 1 - bm.drops.filter((d) => d <= (bAlong[j] ?? bm.length)).length);
  brookBed[brookBed.length - 1] = Math.min(brookBed[brookBed.length - 1], L - 2);
  if (Math.abs(uS - uB) < 10) return { why: "the brook crosses the start's ground" };
  // (the start's own clean water within its walk, D515: from its middle to the brook's bank over the level terrace,
  // a walk of 1 a tile and √2 a diagonal (`analysis/walk.ts`), on the map's grid; a start whose brook runs farther is
  // not taken, the layout drawn again)
  let toBrook = Infinity;
  for (const q of brookL) {
    if (q[1] < vRoom) continue;
    const m = toMap(T, q);
    const dx = Math.abs(m[0] - (sx + 0.5));
    const dy = Math.abs(m[1] - (sy + 0.5));
    toBrook = Math.min(toBrook, Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) - 1);
  }
  if (toBrook > rulesFor(spec).waterWithin) return { why: "the start's brook runs beyond its walk" };

  // ---- on the map
  const map = (p: Point) => rp(toMap(T, p));
  const mapPath = (p: readonly Point[]) => p.map(map);
  // (a path's end on its edge exactly: the local frame's rounding moves it off by a hair)
  const onEdge = (path: Point[]): Point[] => {
    const q = path[path.length - 1];
    path[path.length - 1] = onEdgeOf(N, edgeAt(N, q), q);
    return path;
  };
  const riverM = onEdge(mapPath(riverL));
  const redM2 = endJoin ? mapPath(redL) : onEdge(mapPath(redL));
  // (its bends' pools, `RED_POOLS`: on the backswamp, never across the plain to the join)
  const redHalvesL = redHalves(redL, redHalf(redFlow), (q) => (q[0] >= swampTo - 1 ? 0 : Math.min(q[1] - vB(q[0]), vF(q[0]) - q[1]) - RED_POOLS.edge));
  const forkM = onEdge(mapPath(forkL));
  const brookM = mapPath(brookL);
  const gulchPath: Point[] = [map([gHead[0] - gDir[0] * POOL_R.red, gHead[1] - gDir[1] * POOL_R.red]), map(nAt), map([uM, vMouth])];
  const lipW = Math.max(GULCH.width[0], Math.min(gw, sillWidthFor(redFlow) + 2));
  const lip: [Point, Point] = [map([uM - lipW / 2, vMouth]), map([uM + lipW / 2, vMouth])];
  const faceDir = dirToMap(T, [0, -1]);
  const outEdge = edgeAt(N, map(riverL[riverL.length - 1]));
  const redEdge = edgeAt(N, map(redL[redL.length - 1]));
  const farEdge = edgeAt(N, map(forkL[forkL.length - 1]));

  const sources: Source[] = [];
  const springsC = map([headU, vN(headU) + mid]);
  for (let k = 0; k < 3; k++) sources.push({ id: `spring${k + 1}`, at: rp([springsC[0] + [0, 1, -1][k], springsC[1] + [0, -1, 1][k]]), strength: r2(flow / 3), into: I.springs });
  const brookFlow = r2(rng.range(BROOK_SPRING[0], BROOK_SPRING[1]));
  sources.push({ id: "terraceSpring", at: map(wellC), strength: brookFlow, into: I.well });
  sources.push({ id: "badwater", at: map(gHead), strength: redFlow, into: I.redSpring, bad: true });

  const bodies: Body[] = [
    { id: I.springs, kind: "pool", sill: L - 1, arms: [[[springsC[0], springsC[1], POOL_R.springs]]], meadow: 0, deep: 1, dry: false, region: "wet" },
    { id: I.well, kind: "pool", sill: L + TERRACE.rise + 1, arms: [[[...map(wellC), POOL_R.well]]], meadow: 0, deep: 1, dry: false, region: "home" },
    { id: I.redSpring, kind: "pool", sill: crest + rise, arms: [[[...map(gHead), POOL_R.red]]], meadow: 0, deep: 1, dry: false, region: "top" },
    // (the Red Pool's sill the red stream's head bed, a level under the backswamp: a pool's rim stands at its sill, and
    // at the backswamp's own level its water stood over the floor and ran out across it, step 3, round 3; the Red Fall's
    // height is to its sill, a level more than the landmark's drop on the ground, the gulch's mouth over the backswamp)
    { id: I.redPool, kind: "pool", sill: swampLevel - 1, arms: [[[...map(footC), POOL_R.foot]]], meadow: 0, deep: 1, dry: false, region: "low" },
  ];
  const exits: Exit[] = [{ id: I.out, edge: outEdge, at: riverM[riverM.length - 1] }];
  if (!endJoin) exits.push({ id: I.redOut, edge: redEdge, at: redM2[redM2.length - 1] });
  const links: Link[] = [
    { id: I.river, from: I.springs, to: I.out, kind: "channel", path: riverM, half, bed: riverBed, wet: true, gates: [], rows: [] },
    { id: I.brook, from: I.well, to: I.out, kind: "brook", path: brookM, half: 1, bed: brookBed, wet: true, gates: [], rows: [], wander: 0, joins: { link: I.river, at: r2(brookS) } },
    {
      id: I.redFall,
      from: I.redSpring,
      to: I.redPool,
      kind: "fall",
      path: gulchPath,
      half: 1,
      bed: [crest + rise, nFloor, crest],
      wet: true,
      gates: [],
      rows: [],
      fall: { height: crest - swampLevel + 1, crest, width: lipW, face: headingOf(faceDir[0], faceDir[1]), lip, notch: 0, piers: 0, breach: 0 },
    },
    { id: I.red, from: I.redPool, to: endJoin ? I.out : I.redOut, kind: "channel", path: redM2, half: redHalf(redFlow), halves: redHalvesL, bed: redBed, wet: true, gates: [], rows: [], wander: 0, ...(endJoin ? { joins: { link: I.river, at: r2(joinS) } } : {}) },
  ];

  // ---- the ladder (the design's §6): each rung where the land offers its site
  const startTile: Point = [start.x + 0.5, start.y + 0.5];
  const firstLow = levee.low.filter((o) => o.side === "plain").reduce((a, b) => (dist(a.at, startTile) <= dist(b.at, startTile) ? a : b));
  const brookMid = pointAt(brookM, pathLength(brookM) * 0.35).p;
  // the riser levee where the red stream runs nearest the plain, below the Red Fall
  let lap: Point = redL[1];
  let lapGap = Infinity;
  for (const q of redL) {
    if (q[0] < uM + 8 || q[0] > swampTo - 6) continue;
    const g = q[1] - vB(q[0]);
    if (g < lapGap) {
      lapGap = g;
      lap = q;
    }
  }
  const lapAt = map([lap[0], vB(lap[0])]);
  const slough0 = sloughLows[0];
  const sAfter = Math.min(S - 2, slough0.to + rng.range(3, 6));
  const weirAt = rp(riverAt(sAfter).p);
  // what each buys: its floor by the side (`GIVES`, the first builds' gains), its most twice that
  const gives = (f: number): [number, number] => [Math.round(f * N), Math.round(2 * f * N)];
  const works: Work[] = [
    { id: "lowLevee", rung: "first", kind: "levee", on: I.river, at: firstLow.at, tiles: Math.round(firstLow.to - firstLow.from), needs: [], gives: { green: gives(GIVES.lowLevee) }, region: "wet" },
    { id: "brookPond", rung: "small", kind: "damToPond", on: I.brook, at: rp(brookMid), tiles: 4, needs: [], gives: { green: [0, 30], reservoir: gives(GIVES.brookPond) }, region: "home" },
    { id: "swampLevee", rung: "small", kind: "levee", on: I.red, at: lapAt, tiles: 20, needs: [], gives: { green: gives(GIVES.swampLevee) }, region: "low" },
    { id: "turn", rung: "medium", kind: "damToPond", on: I.redFall, at: map(nAt), tiles: nWidth + 2, needs: [], gives: { green: gives(GIVES.turn) }, tradeoff: "The gulch behind the dam and the Dry Fork stay red", region: "top" },
    { id: "riverIn", rung: "large", kind: "raisedSill", on: I.river, at: map(weirAt), tiles: Math.round(2 * half + 2 + (slough0.to - slough0.from)), needs: [], gives: { green: gives(GIVES.riverIn) }, region: "dry" },
  ];

  // ---- the regions, the ridges, the names, the line
  const plainMid = (u: number) => map([u, (foot[Math.floor(u)] + vB(u)) / 2]);
  const regions: Region[] = [
    { id: "home", role: "home", problem: "A bench over the river, with a brook and no more", prize: "The start's meadow, the plain below it", dayOne: "green", at: map([(terrace[0] + terrace[1]) / 2, vS + 4]) },
    { id: "wet", role: "wet", problem: "A badtide runs red through the levees' low places", prize: "The green band along the river", dayOne: "green", at: map([plainFrom + Lp * 0.5, vN(plainFrom + Lp * 0.5) + mid]) },
    { id: "dry", role: "dry", problem: "Too far from the river for its water", prize: "The widest flat on the map, once the river comes in", dayOne: "dry", at: plainMid(plainFrom + Lp * 0.45) },
    { id: "low", role: "low", problem: "Dead along the red stream", prize: "The old red bed, cleared by the turn", dayOne: "dry", at: map([Math.min(plainTo - 10, uM + 25), swampV(Math.min(plainTo - 10, uM + 25))]) },
    { id: "top", role: "top", problem: "The red source in the gulch", prize: "The turn: the red stream sent down the Dry Fork", dayOne: "dryForGood", at: map([uM, (vF(uM) + gHead[1]) / 2 + 6]) },
  ];
  // (the walls along the valley, on the map: off it they are the next valley's)
  const ridgeLine = (v: (u: number) => number): Point[] => {
    const out: Point[] = [];
    for (let u = 0; u <= U; u += 8) if (onMap(T, [u, v(u)])) out.push(map([u, v(u)]));
    return out;
  };
  const ridges: Ridge[] = [
    { id: "nearWall", role: "wall", path: ridgeLine((u) => vN(u) - nearGround / 2), top: walls.near, half: r2(nearGround / 2 - 2), drop: 2, ledge: 3, rough: 1 },
    { id: "farWall", role: "wall", path: ridgeLine((u) => vF(u) + 14), top: walls.far, half: 10, drop: 2, ledge: 3, rough: 1.5 },
  ];
  const pickName = (list: readonly string[]) => list[rng.int(0, list.length)];
  const names: Record<string, string> = {
    [I.river]: pickName(RIVER_NAMES),
    [I.springs]: "the Springs",
    [I.well]: "the Terrace Spring",
    [I.brook]: "the Terrace Brook",
    [I.redSpring]: "the Red Spring",
    [I.redFall]: pickName(FALL_NAMES),
    [I.redPool]: "the Red Pool",
    [I.red]: "the Red Stream",
    [I.stain]: pickName(STAIN_NAMES),
    [I.fork]: pickName(FORK_NAMES),
    [I.col]: "the Col",
    slough: "the Slough",
    slough2: "the Old Slough",
  };
  const line = `The widest flat on the map is dead along ${names[I.red]} below ${names[I.redFall]}. Turn the stream at ${names[I.stain]} into ${names[I.fork]} and bring ${names[I.river]} in down ${names.slough}: the best land is yours.`;
  const edges: PremisePlan["edges"] = { N: "ridge", E: "ridge", S: "ridge", W: "ridge" };
  edges[farEdge] = "falls away";
  edges[outEdge] = "water leaves";
  if (!endJoin) edges[redEdge] = "water leaves";
  const ahead = lip.map((p) => (p[0] - start.x) * vista.look[0] + (p[1] - start.y) * vista.look[1]);

  const plainNums: PlainNumbers = {
    turn: T.k,
    mirror: T.m,
    angle,
    bends,
    step,
    axis,
    near,
    far,
    swamp,
    room,
    L,
    terraceLevel: L + TERRACE.rise,
    walls,
    P,
    M: M_REACH,
    terrace,
    plainFrom,
    plainTo,
    risers,
    levee,
    sloughs,
    window: { from: r2(w0), to: r2(w1), framed },
    gulch: { mouth: r2(uM), h, crest, width: gw, length: r2(gLen), head: map(gHead), narrows: { at: map(nAt), width: nWidth, floor: nFloor }, rise },
    col: { at: map(colAt), level: colLevel, side: colSide },
    fork: { path: forkM, bed: forkBed, edge: farEdge },
    red: { end: endJoin ? "join" : "exit", ...(endJoin ? { at: r2(joinS) } : {}), swampTo: r2(swampTo) },
    flow: { river: flow, red: redFlow, brook: brookFlow },
    badwater: dBw,
  };
  const plan: PlainPlan = {
    premise: PLAIN_ID,
    seed: spec.seed,
    W: N,
    H: N,
    top,
    sky,
    line,
    sources,
    bodies,
    links,
    exits,
    regions,
    ridges,
    edges,
    frame: { start, landmark: I.redFall, lipAhead: r2((ahead[0] + ahead[1]) / 2), bench: benchAim, benchTo: map([Math.max(terrace[0] + 4, uS - 12), vS + 4]).map(Math.floor) as Point },
    works,
    setPieces: [],
    names,
    plain: plainNums,
  };
  return { plan };
}

// ------------------------------------------------------------------------------------------------- what the plan predicts

/** Day 1's shares of the valley floor (from the near wall's foot to the far wall's, down the plain, but the river's and
 *  the red stream's water: the floor the ground's bands read, `plainLand.ts` `plainBands`) by the plan's arithmetic
 *  (the design's §2): dead where the red stream's poison reaches
 *  (`BAD_SOIL` past its bed's edge: the backswamp below the Red Fall, its water standing at the backswamp's level, and
 *  its way across the plain to a join; round 3: the plan counted the red stream's own bed and the backswamp past its
 *  reach dead, and left the river's side out, 11 % where the ground gave 7 %), green within `M` of the plain-side
 *  levee's foot and on the river's side of it, dry the rest; and the share of the map from that foot to the far wall's
 *  (`plain.width`). A tile a step, on the map only. */
export function plainShares(plan: PremisePlan): { dead: number; dry: number; green: number; floor: number; plain: number } | null {
  const p = plainOf(plan);
  const river = plan.links.find((l) => l.id === I.river);
  const red = plan.links.find((l) => l.id === I.red);
  if (!p || !river?.path || !red?.path) return null;
  const T = turnOf(plan, p);
  const N = plan.W;
  const foot = leveeFoot(p, T.U, river.half ?? 2.5, riverLocal(T, river.path));
  const redL = red.path.map((q) => toLocal(T, q));
  const riverL = river.path.map((q) => toLocal(T, q));
  const redHalfW = red.half ?? 1.5;
  const reach = BAD_SOIL + redHalfW;
  const cross = p.red.end === "join" ? redL.filter((q) => q[0] >= p.red.swampTo - 1) : [];
  const crossFrom = cross.length ? Math.min(...cross.map((q) => q[0])) - reach : Infinity;
  const crossTo = cross.length ? Math.max(...cross.map((q) => q[0])) + reach : -Infinity;
  let dead = 0;
  let dry = 0;
  let green = 0;
  // (the floor's share of the map, `plain.width`: from the plain-side levee's foot to the far wall's, every tile)
  let region = 0;
  let swampTiles = 0;
  for (let u = Math.ceil(p.plainFrom); u < foot.length; u++) {
    const f = foot[u];
    if (!Number.isFinite(f)) continue;
    const fv = lineAt(p.far, p.step, u + 0.5);
    const bv = fv - lineAt(p.swamp, p.step, u + 0.5);
    for (let v = Math.ceil(lineAt(p.near, p.step, u + 0.5)); v < fv; v++) {
      if (!onMap(T, [u + 0.5, v + 0.5])) continue;
      const inSwamp = v + 0.5 >= bv;
      if (v >= Math.ceil(f)) {
        region++;
        if (inSwamp) swampTiles++;
      }
      // (the river's water and the red stream's are not floor; the river's side of the levee's foot is its green)
      if (pathDist(u + 0.5, v + 0.5, riverL).d <= (river.half ?? 2.5)) continue;
      const toRed = pathDist(u + 0.5, v + 0.5, redL).d;
      if (toRed <= redHalfW) continue;
      if (v < f) {
        green++;
        continue;
      }
      const nearCross = cross.length > 1 && u + 0.5 >= crossFrom && u + 0.5 <= crossTo && pathDist(u + 0.5, v + 0.5, cross).d <= reach;
      // (its water stands at the backswamp's level: the poison reaches 5 tiles less a level up, the game's soil rule)
      const up = inSwamp ? 0 : Math.max(0, plainLevel(p, u + 0.5, v + 0.5) - (plainLevel(p, u + 0.5, bv + 0.5) - 1));
      if ((u + 0.5 >= p.gulch.mouth - reach && u + 0.5 <= p.red.swampTo && toRed <= reach - 5 * up) || nearCross) dead++;
      else if (v + 0.5 - f < p.M) green++;
      else dry++;
    }
  }
  const all = dead + dry + green;
  if (!all) return null;
  return { dead: dead / all, dry: dry / all, green: green / all, floor: region / (N * N), plain: (region - swampTiles) / (N * N) };
}

// ------------------------------------------------------------------------------------------------- the invariants

const linkOf = (plan: PremisePlan, id: string): Link | undefined => plan.links.find((l) => l.id === id);
const bodyOf = (plan: PremisePlan, id: string): Body | undefined => plan.bodies.find((b) => b.id === id);
const NO_PLAIN = "The plan has no poisoned floodplain";

/** The longest run of one height in a levee's crest, tiles along the river. */
function longestRun(runs: readonly CrestRun[]): number {
  let best = 0;
  let a = 0;
  for (let k = 1; k <= runs.length; k++)
    if (k === runs.length || runs[k].over !== runs[a].over) {
      best = Math.max(best, runs[k - 1].to - runs[a].from);
      a = k;
    }
  return best;
}

/** `plain.levels` (the design's §1 and §7): the levels by number. The plain at `L` falling a level at each riser 40 to
 *  60 apart; the river's bed two under `L` at its head, falling a level at a time at its riffles (two at the red stream's join,
 *  `riverSteps`) and never over two under the plain beside it nor under the floor, the river's springs a
 *  level under `L`; the levees a level over the plain for most of the river's length on the plain, level with it at 2
 *  to 4 low places 4 to 8 long, and no run of the crest at one height over a fifth of that length; the backswamp a
 *  level under the plain and the red stream's bed one under it; the terrace two over `L`; the Red Fall from the gulch's
 *  floor 3 to 5 over the backswamp at its mouth onto its pool on the backswamp (the fall itself 3 to 5); the gulch's floor rising to
 *  its head, the narrows on it; the col two over the narrows' floor and under the far wall's crest; the Dry Fork's bed
 *  falling from under the col to its edge, on the floor; the far wall over the near; the sloughs a level under the
 *  plain. */
const plainLevels: Invariant = {
  id: "plain.levels",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    if (!p) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    const lv = (q: Point, local = false) => {
      const [u, v] = local ? q : toLocal(T, q);
      return u < p.plainFrom ? p.L : plainLevel(p, u, v);
    };
    if (p.terraceLevel !== p.L + TERRACE.rise) return fail(`The terrace stands at ${p.terraceLevel}, not ${TERRACE.rise} over the plain (${p.L + TERRACE.rise})`);
    let last = p.plainFrom;
    const mostR = mostRisersUnder(plan.top, p.red.end === "join");
    const every = riserEvery(p.plainTo - RISER.end - p.plainFrom, mostR);
    if (p.risers.length > mostR) return fail(`The plain has ${p.risers.length} risers (${mostR} at most under the water's ceiling, ${plan.top})`);
    for (const r of p.risers) {
      const gap = r.at - last;
      if (gap < every[0] - 0.01 || gap > every[1] + 0.01) return fail(`A riser of the plain stands ${gap.toFixed(1)} tiles below the last (${every.map((e) => e.toFixed(0)).join(" to ")})`);
      if (r.amp < RISER.amp[0] - 0.01) return fail(`A riser of the plain wanders ${r.amp} tiles (a straight step)`);
      last = r.at;
    }
    if (p.plainTo - last > every[1] + RISER.end + 0.01) return fail(`The plain runs ${(p.plainTo - last).toFixed(0)} tiles to its foot without a riser`);
    const river = linkOf(plan, I.river);
    const springs = bodyOf(plan, I.springs);
    if (!river?.path || !Array.isArray(river.bed) || !springs) return fail("The plan has no river from its springs");
    if (springs.sill !== p.L - 1) return fail(`${nameOf(plan, I.springs)} stand at ${springs.sill}, not a level under the plain (${p.L - 1})`);
    if (river.bed[0] !== p.L - 2) return fail(`${nameOf(plan, I.river)}'s bed stands at ${river.bed[0]} at its head, not two under the plain (${p.L - 2})`);
    for (let k = 0; k < river.path.length; k++) {
      const most = lv(river.path[k]) - 2;
      if (river.bed[k] > most) return fail(`${nameOf(plan, I.river)}'s bed stands at ${river.bed[k]} at point ${k}, over two under the plain there (${most})`);
      if (river.bed[k] < BED_FLOOR) return fail(`${nameOf(plan, I.river)}'s bed stands at ${river.bed[k]} at point ${k}, under the floor (${BED_FLOOR})`);
      if (k && (river.bed[k] > river.bed[k - 1] || river.bed[k] < river.bed[k - 1] - RIVER_STAGE.fall)) return fail(`${nameOf(plan, I.river)}'s bed goes from ${river.bed[k - 1]} to ${river.bed[k]} at point ${k}, not down by steps`);
    }
    // the levees
    const len = p.levee.to - p.levee.from;
    for (const side of ["plain", "near"] as const) {
      const runs = p.levee[side];
      if (!runs.length || Math.abs(runs[0].from - p.levee.from) > 0.01 || Math.abs(runs[runs.length - 1].to - p.levee.to) > 0.01) return fail(`The ${side} levee does not run the river's length on the plain`);
      for (let k = 1; k < runs.length; k++) if (Math.abs(runs[k].from - runs[k - 1].to) > 0.01) return fail(`The ${side} levee's crest has a gap at ${runs[k].from}`);
      const at1 = runs.filter((r) => r.over === 1).reduce((a, r) => a + r.to - r.from, 0);
      if (at1 < LEVEE.mostAt1 * len) return fail(`The ${side} levee stands a level over the plain for ${((100 * at1) / len).toFixed(0)} % of its length (most of it)`);
      const run = longestRun(runs);
      if (run > LEVEE.most * len + 0.01) return fail(`The ${side} levee's crest holds one height for ${run.toFixed(0)} tiles, over a fifth of the river's ${len.toFixed(0)} on the plain`);
      for (const r of runs.filter((x) => x.over === 0)) if (!p.levee.low.some((o) => o.side === side && Math.abs(o.from - r.from) < 1.01 && Math.abs(o.to - r.to) < 1.01)) return fail(`The ${side} levee is level with the plain at ${r.from.toFixed(0)}, where no low place is`);
    }
    const lows = p.levee.low;
    if (lows.length < 2 || lows.length > 4) return fail(`${lows.length} low places in the levees (2 to 4)`);
    for (const o of lows) if (o.to - o.from < LEVEE.low[0] - 0.01 || o.to - o.from > LEVEE.low[1] + 0.01) return fail(`Low place ${o.id} is ${(o.to - o.from).toFixed(1)} tiles long (${LEVEE.low.join(" to ")})`);
    // the backswamp and the red stream
    const red = linkOf(plan, I.red);
    const pool = bodyOf(plan, I.redPool);
    const fall = linkOf(plan, I.redFall);
    const spring = bodyOf(plan, I.redSpring);
    if (!red?.path || !Array.isArray(red.bed) || !pool || !fall?.fall || !Array.isArray(fall.bed) || !spring) return fail("The plan has no red stream from the Red Fall");
    const lm = plainLevel(p, p.gulch.mouth, lineAt(p.far, p.step, p.gulch.mouth) - lineAt(p.swamp, p.step, p.gulch.mouth) + 1);
    const swamp = lm - 1;
    // (where it joins the river, its last point in the river at the river's bed: `stream.join`, `JOIN.drop`)
    for (let k = 0; k + (red.joins ? 1 : 0) < red.path.length; k++) {
      const want = lv(red.path[k]) - 2;
      if (red.bed[k] > want || red.bed[k] < want - 1) return fail(`${nameOf(plan, I.red)}'s bed stands at ${red.bed[k]} at point ${k}, not a level under the backswamp there (${want})`);
    }
    if (pool.sill !== swamp - 1) return fail(`${nameOf(plan, I.redPool)} stands at ${pool.sill}, not a level under the backswamp (${swamp}) at its stream's head`);
    const f = fall.fall;
    if (p.gulch.h < GULCH.h[0] || p.gulch.h > GULCH.h[1] || p.gulch.crest !== swamp + p.gulch.h || f.crest !== p.gulch.crest) return fail(`${nameOf(plan, I.redFall)} falls from ${f.crest}, not ${GULCH.h.join(" to ")} over the backswamp (${swamp}) at the gulch's mouth`);
    if (f.crest - f.height !== pool.sill) return fail(`${nameOf(plan, I.redFall)} does not fall onto ${nameOf(plan, I.redPool)}`);
    if (spring.sill !== p.gulch.crest + p.gulch.rise || p.gulch.rise < GULCH.rise[0]) return fail(`${nameOf(plan, I.redSpring)} stands at ${spring.sill}, not the gulch's floor at its head (${p.gulch.crest + p.gulch.rise})`);
    if (p.gulch.narrows.floor < p.gulch.crest || p.gulch.narrows.floor > spring.sill) return fail(`The gulch's narrows stands at ${p.gulch.narrows.floor}, off its floor (${p.gulch.crest} to ${spring.sill})`);
    if (p.col.level !== p.gulch.narrows.floor + GULCH.colOver) return fail(`The col stands at ${p.col.level}, not ${GULCH.colOver} over the narrows' floor (${p.gulch.narrows.floor + GULCH.colOver})`);
    if (p.walls.far < p.col.level + 2 || p.walls.far <= p.walls.near || p.walls.far > (plan.sky ?? plan.top)) return fail(`The far wall's crest (${p.walls.far}) is not over the col + 2 (${p.col.level + 2}) and the near wall (${p.walls.near}), under the highest ground`);
    if (!(p.fork.bed[0] < p.col.level) || p.fork.bed[1] > p.fork.bed[0] || p.fork.bed[1] < BED_FLOOR) return fail(`${nameOf(plan, I.fork)}'s bed (${p.fork.bed.join(" to ")}) does not fall from under the col (${p.col.level}) to its edge on the floor`);
    for (const s of p.sloughs) for (let k = 0; k < s.path.length; k++) {
      const want = lv(s.path[k]) - 1;
      if (s.bed[k] > want || s.bed[k] < want - 1) return fail(`${nameOf(plan, s.id)}'s bed stands at ${s.bed[k]} at point ${k}, not a level under the plain there (${want})`);
    }
    return OK;
  },
};

/** `plain.width` (the design's §1 and §2, planning's ruling of 2026-11-15): the valley is not a corridor and its floor
 *  grows with the map. The valley's axis off the grid by 10° to 35° at every chord of `VALLEY.chord` tiles along it,
 *  with 1 or 2 gentle bends, the near wall's foot near the axis; the plain's mean width `P` (from the far side of the
 *  river's room, the farthest its plain-side levee foot stands, to the far wall's foot, the backswamp in it) the larger
 *  of (M + 9) / 0.7 and 0.28 to 0.36 of the side, its width along its length 0.8 to 1.3 of `P` and its mean `P`, and
 *  (M + the backswamp's width there) / 0.7 or more from the levee's foot, so the dry band holds 30 % across it; its
 *  length 0.7 to 0.85 of the side along the axis, its foot where its middle leaves the map; the backswamp 7 to 10 wide
 *  (up to 0.06 of the side on larger maps); the river's middle in the near third of the floor; the floor 20 to 30 % of
 *  the map; and day 1's shares of the floor by the plan's arithmetic (`plainShares`): dead 8 to 25 %, dry 30 % or
 *  more. */
const plainWidth: Invariant = {
  id: "plain.width",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    const river = linkOf(plan, I.river);
    if (!p || !river?.path) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    const N = plan.W;
    const pct = (x: number) => `${Math.round(100 * x)} %`;
    // the valley's shape on the map
    if (p.bends.length < VALLEY.bends[0] || p.bends.length > VALLEY.bends[1]) return fail(`The valley bends ${p.bends.length} times (${VALLEY.bends.join(" or ")})`);
    for (const b of p.bends) if (Math.abs(b.turn) < VALLEY.turn[0] - 0.01 || Math.abs(b.turn) > VALLEY.turn[1] + 0.01) return fail(`A bend of the valley turns ${Math.abs(b.turn)}° (${VALLEY.turn.join(" to ")}°, gentle)`);
    const stray = WALL.out[1] * p.P + WALL.rough + 0.02;
    for (let k = 0; k < p.near.length; k++) if (Math.abs(p.near[k] - p.axis[k]) > stray) return fail(`The near wall's foot strays ${Math.abs(p.near[k] - p.axis[k]).toFixed(1)} tiles off the valley's axis (${stray.toFixed(1)} at most)`);
    const ax = (u: number): Point => toMap(T, [u, lineAt(p.axis, p.step, u)]);
    for (let u = p.terrace[0]; u + VALLEY.chord <= p.plainTo; u += VALLEY.step) {
      const a = ax(u);
      const b = ax(u + VALLEY.chord);
      const deg = (atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0])) * 180) / Math.PI;
      const off = Math.min(deg, 90 - deg);
      if (off < VALLEY.angle[0] - 0.01 || off > VALLEY.angle[1] + 0.01) return fail(`The valley runs ${off.toFixed(0)}° off the grid ${(u - p.terrace[0]).toFixed(0)} tiles below the terrace's head (${VALLEY.angle.join(" to ")}°: not a corridor)`);
    }
    // the plain by the map
    const [Plo, Phi] = plainRange(N, p.M);
    if (p.P < Plo || p.P > Phi) return fail(`The plain is ${p.P} wide, not ${Plo} to ${Phi} (the larger of (M + ${PLAIN.dead}) / ${1 - DRY_LEAST} and ${PLAIN.share.join(" to ")} of the side)`);
    const len = (p.plainTo - p.plainFrom) / N;
    if (len < PLAIN.long[0] - 0.005 || len > PLAIN.long[1] + 0.005) return fail(`The plain is ${pct(len)} of the side long (${PLAIN.long.map(pct).join(" to ")})`);
    const rf = linkOf(plan, I.river)!;
    const half = rf.half ?? 2.5;
    const toFoot = p.room[1] + half + LEVEE.width[1];
    const midAt = (u: number): Point => [u, lineAt(p.near, p.step, u) + toFoot + p.P / 2];
    if (!onMap(T, midAt(p.plainTo - 1)) || onMap(T, midAt(p.plainTo + 2))) return fail("The plain's foot is not where its middle leaves the map");
    const most = swampMost(N);
    for (const w of p.swamp) if (w < SWAMP.least - 0.01 || w > most + 0.01) return fail(`The backswamp is ${w} wide (${SWAMP.least} to ${most})`);
    const loc = riverLocal(T, river.path);
    const foot = leveeFoot(p, T.U, half, loc);
    const widths = floorWidths(p.near, p.far, p.step, toFoot, p.plainFrom, p.plainTo);
    const meanW = widths.reduce((a, b) => a + b, 0) / widths.length / p.P;
    if (Math.abs(meanW - 1) > 0.03) return fail(`The floor's mean width is ${meanW.toFixed(2)} of P`);
    const means = widthMeans(widths, p.P);
    for (let k = 0; k < means.length; k++) {
      const w = means[k] / p.P;
      if (w < PLAIN.vary[0] - 0.005 || w > PLAIN.vary[1] + 0.005) return fail(`The floor is ${w.toFixed(2)} of P wide in the mean over P from ${(Math.ceil(p.plainFrom) + k).toFixed(0)} tiles down the valley (${PLAIN.vary.join(" to ")})`);
    }
    for (let u = Math.ceil(p.plainFrom); u <= p.plainTo; u++) {
      const vf = lineAt(p.far, p.step, u);
      const b = lineAt(p.swamp, p.step, u);
      if (Number.isFinite(foot[u]) && vf - foot[u] < (p.M + b) / (1 - DRY_LEAST) - 0.01) return fail(`The plain is ${(vf - foot[u]).toFixed(1)} wide at ${u} tiles down the valley, too narrow for a dry band of 30 % beside the backswamp (${b.toFixed(1)})`);
    }
    for (const q of loc) {
      const vn = lineAt(p.near, p.step, q.p[0]);
      const floor = lineAt(p.far, p.step, q.p[0]) - vn;
      if (q.p[1] - vn > floor / 3 + 0.5) return fail(`${nameOf(plan, I.river)} leaves the near third of the floor at ${q.p[0].toFixed(0)} tiles down the valley`);
    }
    const sh = plainShares(plan);
    if (!sh) return fail(NO_PLAIN);
    if (sh.floor < PLAIN.floor[0] || sh.floor > PLAIN.floor[1]) return fail(`The floor is ${pct(sh.floor)} of the map (${PLAIN.floor.map(pct).join(" to ")})`);
    if (sh.dead < DEAD_SHARE[0] || sh.dead > DEAD_SHARE[1]) return fail(`Day 1's dead band is ${pct(sh.dead)} of the floor (${DEAD_SHARE.map(pct).join(" to ")})`);
    if (sh.dry < DRY_LEAST) return fail(`Day 1's dry band is ${pct(sh.dry)} of the floor, under ${pct(DRY_LEAST)}`);
    return OK;
  },
};

/** `wall.wanders` (the design's §1, planning's ruling of 2026-11-15, round 3): each wall wanders by its own line, not
 *  an offset of the axis: no wall's foot stays within `WALL.near` tiles of one straight line for longer than
 *  `WALL.longest` of `P`, along the valley from the terrace's head to the plain's foot, where it stands on the map. */
const wallWanders: Invariant = {
  id: "wall.wanders",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    if (!p) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    const most = WALL.longest * p.P;
    for (const [side, line] of [["near", p.near], ["far", p.far]] as const) {
      const run = wallStraight(T, line, p.step, side === "near" ? 0 : p.terrace[0], side === "near" ? T.U : p.plainTo);
      if (run > most + 0.01) return fail(`The ${side} wall's foot runs within ${WALL.near} tiles of one straight line for ${run.toFixed(0)} tiles (${most.toFixed(0)} at most: drawn with a ruler)`);
    }
    return OK;
  },
};

/** `stream.join` (the design's §4, D476, D498): the red stream runs from the Red Fall's pool along the backswamp (every
 *  point of its reach there inside the strip), then either joins the river in the river's last 30 % at one level with
 *  its bed, or leaves the map by an exit of its own on an edge; nothing red joins the river above that. */
const streamJoin: Invariant = {
  id: "stream.join",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    const red = linkOf(plan, I.red);
    const river = linkOf(plan, I.river);
    if (!p || !red?.path || !river?.path) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    for (const q of red.path) {
      const [u, v] = toLocal(T, q);
      if (u > p.red.swampTo - (p.red.end === "join" ? JOIN.bend : 0.5)) break;
      const vf = lineAt(p.far, p.step, u);
      const vb = vf - lineAt(p.swamp, p.step, u);
      if (v < vb - 0.25 || v > vf + 0.25) return fail(`${nameOf(plan, I.red)} leaves the backswamp at ${u.toFixed(0)} tiles down the valley`);
    }
    const S = pathLength(river.path);
    const bad = new Set(plan.sources.filter((s) => s.bad).map((s) => s.into));
    for (const l of plan.links) if (l.joins?.link === I.river && l.id !== I.red && bad.has(l.from)) return fail(`${nameOf(plan, l.id)} runs red into ${nameOf(plan, I.river)}`);
    if (p.red.end === "join") {
      const j = red.joins;
      if (!j || j.link !== I.river || red.to !== river.to) return fail(`${nameOf(plan, I.red)} is said to join ${nameOf(plan, I.river)} and does not`);
      if (j.at < (1 - 0.3) * S || j.at > S - 2) return fail(`${nameOf(plan, I.red)} joins ${nameOf(plan, I.river)} ${((100 * j.at) / S).toFixed(0)} % along it, not in its last 30 %`);
      const end = red.path[red.path.length - 1];
      if (dist(end, pointAt(river.path, j.at).p) > 1.5) return fail(`${nameOf(plan, I.red)} ends away from ${nameOf(plan, I.river)} at its join`);
      const rb = Array.isArray(river.bed) ? river.bed : null;
      const own = Array.isArray(red.bed) ? red.bed : null;
      if (rb && own) {
        let k = 0;
        while (k + 1 < river.path.length && pathLength(river.path.slice(0, k + 2)) <= j.at) k++;
        if (Math.abs(own[own.length - 1] - rb[k]) > 1) return fail(`${nameOf(plan, I.red)}'s bed meets ${nameOf(plan, I.river)}'s ${Math.abs(own[own.length - 1] - rb[k])} levels apart`);
        // (its last reach short, and it falls into the river: `JOIN.drop`)
        const m = red.path.length - 1;
        const last = m > 0 ? dist(red.path[m - 1], red.path[m]) : Infinity;
        if (last > JOIN.drop + 0.01 || !(own[m - 1] - rb[k] >= 1)) return fail(`${nameOf(plan, I.red)}'s last reach runs ${last.toFixed(1)} tiles and falls ${own[m - 1] - rb[k]} into ${nameOf(plan, I.river)} (${JOIN.drop} at most, and a level or more)`);
      }
      return OK;
    }
    if (red.joins) return fail(`${nameOf(plan, I.red)} is said to leave by its own exit and joins ${nameOf(plan, red.joins.link)}`);
    const exit = plan.exits.find((e) => e.id === red.to);
    if (!exit || exit.id === river.to) return fail(`${nameOf(plan, I.red)} does not leave by an exit of its own`);
    if (dist(red.path[red.path.length - 1], exit.at) > 1.5) return fail(`${nameOf(plan, I.red)} ends away from its exit`);
    return OK;
  },
};

/** `start.badwater` (the design's §1, §4, §5, D469): the start on the terrace (two over the plain, between its upstream
 *  end and its lip, on the plain's side of the river, a third to a half of the way across from the river's room to the
 *  far wall), the search window starting the badwater distance or more down the
 *  valley from it, the gulch's mouth inside the window, and no red water (the Red Spring, the gulch, the Red Fall's
 *  pool, the red stream, the river below the red stream's join) within the badwater distance of the start. */
const startBadwater: Invariant = {
  id: "start.badwater",
  at: "plan",
  test({ spec, plan }) {
    const p = plainOf(plan);
    const river = linkOf(plan, I.river);
    if (!p || !river?.path) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    const s = plan.frame.start;
    const [u, v] = toLocal(T, [s.x + 0.5, s.y + 0.5]);
    if (s.z !== p.terraceLevel) return fail(`The start stands on ${s.z}, not on the terrace (${p.terraceLevel})`);
    if (u < p.terrace[0] + 2 || u > p.terrace[1] - 2) return fail("The start does not stand on the terrace at the plain's upstream end");
    let vr = -Infinity;
    for (const q of riverLocal(T, river.path)) if (Math.abs(q.p[0] - u) <= 3) vr = Math.max(vr, q.p[1]);
    if (!(v > vr) || v > lineAt(p.far, p.step, u)) return fail(`The start does not stand on the plain's side of ${nameOf(plan, I.river)}`);
    const vRoom = lineAt(p.near, p.step, u) + p.room[1] + (river.half ?? 2.5);
    const across = (v - vRoom) / (lineAt(p.far, p.step, u) - vRoom);
    // (a tile's rounding either way: the start stands on a whole tile)
    const slack = 1.5 / (lineAt(p.far, p.step, u) - vRoom);
    if (across < TERRACE.across[0] - slack || across > TERRACE.across[1] + slack) return fail(`The start stands ${Math.round(100 * across)} % of the way across from ${nameOf(plan, I.river)} to the far wall (a third to a half)`);
    const d = badwaterOf(spec);
    if (p.badwater !== d) return fail(`The plan keeps badwater ${p.badwater} tiles off, the settings ask ${d}`);
    if (p.window.from < u + d - 0.01) return fail(`The search window starts ${(p.window.from - u).toFixed(0)} tiles down the valley from the start, under the badwater distance (${d})`);
    if (p.gulch.mouth < p.window.from - 0.01 || p.gulch.mouth > p.window.to + 0.01) return fail("The gulch's mouth stands outside its search window");
    const st: Point = [s.x + 0.5, s.y + 0.5];
    const red: Point[] = [];
    for (const id of [I.redFall, I.red]) {
      const l = linkOf(plan, id);
      if (l?.path) for (const q of walk(l.path, 1)) red.push(q.p);
    }
    // (the river below the red stream's join carries its red water on)
    const rj = linkOf(plan, I.red)?.joins;
    if (rj?.link === I.river) for (const q of walk(river.path, 1)) if (q.s >= rj.at - 0.5) red.push(q.p);
    for (const id of [I.redSpring, I.redPool]) {
      const b = bodyOf(plan, id);
      if (b) red.push([b.arms[0][0][0], b.arms[0][0][1]]);
    }
    // (the shared gate reads the soil the red water poisons as badwater too: the poison reaches `BAD_SOIL` on the level)
    for (const q of red) if (dist(q, st) < d + BAD_SOIL) return fail(`Red water stands ${dist(q, st).toFixed(0)} tiles from the start, inside the badwater distance (${d}) and the ${BAD_SOIL} tiles its soil's poison reaches`);
    return OK;
  },
};

/** `frame.fall` (the design's §5): the Red Fall is the landmark, a fall of 3 to 5 onto the backswamp, its lip's ends
 *  and its foot inside the opening camera's vista frame (`VISTA_ZOOM`: the first frame at the default zoom reaches under
 *  20 tiles, the fall stands across the plain), between `LANDMARK_NEAR` and `LANDMARK_FAR` of the start; the frame
 *  showing a run of the search window `WINDOW.framed` tiles or more, and the gulch's mouth where a run it shows holds
 *  its lip. (The plan draws its target at the nearest such place; stage 2's search keeps the nearest side valley that
 *  holds, `gulch.found`, and turns the start to frame it.) */
const frameFall: Invariant = {
  id: "frame.fall",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    const fall = linkOf(plan, plan.frame.landmark);
    if (!p || !fall?.fall || plan.frame.landmark !== I.redFall) return fail(`The landmark is not ${nameOf(plan, I.redFall)}`);
    const pool = bodyOf(plan, fall.to);
    // (its drop over the backswamp: its height is to the Red Pool's sill, a level under the backswamp)
    const drop = fall.fall.height - 1;
    if (drop < GULCH.h[0] || drop > GULCH.h[1]) return fail(`${nameOf(plan, I.redFall)} drops ${drop} over the backswamp (${GULCH.h.join(" to ")})`);
    const s = plan.frame.start;
    const cam = openingCamera(s, VISTA_ZOOM);
    const st: Point = [s.x + 0.5, s.y + 0.5];
    const foot = pool?.sill ?? fall.fall.crest - fall.fall.height;
    for (const e of fall.fall.lip) {
      const d = dist(e, st);
      if (d < LANDMARK_NEAR || d > LANDMARK_FAR) return fail(`${nameOf(plan, I.redFall)} stands ${d.toFixed(0)} tiles from the start (${LANDMARK_NEAR} to ${LANDMARK_FAR})`);
      for (const [z, what] of [[fall.fall.crest + FRAME.overLip, "lip"], [foot, "foot"]] as const) {
        const f = frameAt(cam, e[0], e[1], z);
        if (!f || Math.abs(f.u) > FRAME.uSide || Math.abs(f.v) > FRAME.vTop) return fail(`${nameOf(plan, I.redFall)}'s ${what} falls outside the vista frame${f ? ` (u ${f.u.toFixed(2)}, v ${f.v.toFixed(2)})` : ""}`);
      }
    }
    for (const [a, b] of p.window.framed) if (a < p.window.from - 1 || b > p.window.to + 0.01 || b < a) return fail("A framed run lies outside the search window");
    const first = p.window.framed.find(([a, b]) => b - a >= WINDOW.framed);
    if (!first) return fail(`The vista frame shows no run of the search window ${WINDOW.framed} tiles or more`);
    const lipHalf = WINDOW.framed / 2;
    if (!p.window.framed.some(([a, b]) => p.gulch.mouth >= a + lipHalf - 0.01 && p.gulch.mouth <= b - lipHalf + 0.01)) return fail("The gulch's mouth is not where the vista frame shows its lip in the search window");
    return OK;
  },
};

/** `poisoned.ladder` (the design's §6): every rung has its site. The first, a levee across the plain-side low place
 *  nearest the start, as long as the low place (4 to 8); a pond on the start's brook on the terrace; a levee of 20
 *  along the backswamp's riser below the Red Fall; the turn, a dam of 6 tiles or fewer at the gulch's narrows, inside
 *  the search window; the river in, a weir across the river just below the first slough's low place (within 8 tiles),
 *  that slough reaching the backswamp below the Red Fall and every slough reaching the backswamp. The turn and the
 *  river in need nothing (either order); each buys some green. */
const poisonedLadder: Invariant = {
  id: "poisoned.ladder",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    const river = linkOf(plan, I.river);
    const brook = linkOf(plan, I.brook);
    if (!p || !river?.path || !brook?.path) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    const w = (id: string) => plan.works.find((x) => x.id === id);
    const st: Point = [plan.frame.start.x + 0.5, plan.frame.start.y + 0.5];
    const plainLows = p.levee.low.filter((o) => o.side === "plain");
    if (!plainLows.length) return fail("No low place on the plain's side");
    const nearest = plainLows.reduce((a, b) => (dist(a.at, st) <= dist(b.at, st) ? a : b));
    const first = w("lowLevee");
    if (!first || first.rung !== "first" || first.kind !== "levee" || first.on !== I.river || dist(first.at, nearest.at) > 0.5 || Math.abs(first.tiles - (nearest.to - nearest.from)) > 1) return fail("The first rung is not a levee across the low place nearest the start");
    const pond = w("brookPond");
    if (!pond || pond.kind !== "damToPond" || pond.on !== I.brook || pathDist(pond.at[0], pond.at[1], brook.path).d > 1) return fail(`No pond on ${nameOf(plan, I.brook)}`);
    const pu = toLocal(T, pond.at)[0];
    if (pu < p.terrace[0] || pu > p.terrace[1]) return fail(`The pond on ${nameOf(plan, I.brook)} is not on the terrace`);
    const lap = w("swampLevee");
    if (!lap || lap.kind !== "levee" || lap.on !== I.red || lap.tiles !== 20) return fail("No levee of 20 along the backswamp's riser");
    const [lu, lv] = toLocal(T, lap.at);
    const vb = lineAt(p.far, p.step, lu) - lineAt(p.swamp, p.step, lu);
    if (lu < p.gulch.mouth || lu > p.red.swampTo || Math.abs(lv - vb) > 1) return fail("The backswamp's levee does not stand on its riser below the Red Fall");
    const turn = w("turn");
    if (!turn || turn.rung !== "medium" || turn.on !== I.redFall || turn.tiles > 6 || dist(turn.at, p.gulch.narrows.at) > 0.5 || turn.needs.length) return fail("The turn is not a dam of 6 tiles or fewer at the gulch's narrows, needing nothing");
    const tu = toLocal(T, turn.at)[0];
    if (tu < p.window.from - GULCH.len[1] || tu > p.window.to + GULCH.len[1]) return fail("The turn stands away from the search window");
    const inn = w("riverIn");
    const slough = p.sloughs[0];
    const low = slough && p.levee.low.find((o) => o.id === slough.low);
    if (!slough || !low || low.side !== "plain") return fail("No slough from a low place on the plain's side");
    const share = ((low.from + low.to) / 2 - p.levee.from) / (p.levee.to - p.levee.from);
    const most = p.red.end === "join" ? 1 / 2 : 2 / 3;
    if (share < 1 / 3 - 0.01 || share > most + 0.01) return fail(`${nameOf(plan, slough.id)} leaves the levee ${Math.round(100 * share)} % along it, not in its middle third${p.red.end === "join" ? "'s upper half (the red stream joins the river)" : ""}`);
    const want = plan.W >= 192 ? 2 : 1;
    if (p.sloughs.length !== want) return fail(`${p.sloughs.length} sloughs (${want} at ${plan.W}²)`);
    if (!inn || inn.rung !== "large" || inn.kind !== "raisedSill" || inn.on !== I.river || inn.needs.length) return fail("The river in is not a weir on the river on the large rung, needing nothing");
    const at = pathDist(inn.at[0], inn.at[1], river.path);
    if (at.d > 0.5 || at.s < low.to - 0.5 || at.s > low.to + 8) return fail(`The weir does not stand on ${nameOf(plan, I.river)} just below ${nameOf(plan, slough.id)}'s low place`);
    for (const s of p.sloughs) {
      const [eu, ev] = toLocal(T, s.path[s.path.length - 1]);
      const vbe = lineAt(p.far, p.step, eu) - lineAt(p.swamp, p.step, eu);
      if (ev < vbe - 0.5) return fail(`${nameOf(plan, s.id)} does not reach the backswamp`);
      if (s === slough && eu < p.gulch.mouth) return fail(`${nameOf(plan, s.id)} does not reach the backswamp below ${nameOf(plan, I.redFall)}`);
      const o = p.levee.low.find((x) => x.id === s.low);
      if (!o || o.side !== "plain" || dist(s.path[0], o.at) > 6) return fail(`${nameOf(plan, s.id)} does not leave a low place on the plain's side`);
    }
    for (const x of plan.works) if (!(x.gives.green[1] > 0)) return fail(`Work ${x.id} buys nothing`);
    return OK;
  },
};

const PLAIN_PLAN_CHECKS: Invariant[] = [plainLevels, plainWidth, wallWanders, streamJoin, startBadwater, frameFall, poisonedLadder];
const invariants: Invariant[] = [...PLAN_CHECKS, ...PLAIN_PLAN_CHECKS];

// ------------------------------------------------------------------------------------------------- the def

function planFailure(spec: MapSpec, plan: PremisePlan): string | null {
  for (const inv of invariants) {
    if (inv.at !== "plan") continue;
    const r = inv.test({ spec, plan });
    if (!r.ok) return `${inv.id}: ${r.reason}`;
  }
  return null;
}

/** One layout try's plan (or why it stopped) and the first `plan` invariant it fails: for the tools. */
export function plainLayoutTry(spec: MapSpec, attempt: number, t: number): { plan: PremisePlan | null; failed: string | null } {
  const r = layout(spec, attempt, t);
  if ("why" in r) return { plan: null, failed: `layout: ${r.why}` };
  const plan = r.plan as unknown as PremisePlan;
  return { plan, failed: planFailure(spec, plan) };
}

/** The layout tries an attempt took to hold (for the tools' tables), or null where none held. */
export function plainTries(spec: MapSpec, attempt: number): number | null {
  for (let t = 0; t < LAYOUT_TRIES; t++) if (!plainLayoutTry(spec, attempt, t).failed) return t + 1;
  return null;
}

function draw(spec: MapSpec, attempt: number): PremisePlan | { reason: string } {
  const why = poisonedPlainEligible(spec);
  if (why) return { reason: why };
  let last = "";
  for (let t = 0; t < LAYOUT_TRIES; t++) {
    const r = plainLayoutTry(spec, attempt, t);
    if (r.plan && !r.failed) return r.plan;
    last = r.failed ?? "";
  }
  return { reason: `No poisoned floodplain fits seed ${spec.seed} at ${spec.size.x}² in ${LAYOUT_TRIES} layouts (${last})` };
}

/** The premise's definition, for the shared stage functions (`draw.ts` `firstPlan`, `failing`). Its id is outside
 *  `PremiseId` until it is offered (`premises/dev.ts`), hence the one cast here. */
export const poisonedPlain: PremiseDef = {
  id: PLAIN_ID as unknown as PremiseDef["id"],
  eligible: poisonedPlainEligible,
  draw,
  invariants,
};

// ------------------------------------------------------------------------------------------------- the diagram

const C = { floor: "#efe6c8", green: "#cfe3a8", dead: "#a9a49b", swamp: "#d9cfae", terrace: "#e4d6a4", levee: "#7c8f4a", low: "#e07a1f", riser: "#8a7a5c", slough: "#b0895a", window: "#5a3e8c", framed: "#c0392b", fork: "#9c7b4f", col: "#5a3e8c" } as const;

/** The plan's own pieces for the water-story diagram (`diagram.ts` `planSvg`): the valley floor's bands (green, dry,
 *  dead), the terrace, the risers, the levees with their low places, the sloughs, the search window and its framed run,
 *  the gulch's narrows, the col and the Dry Fork. */
export function plainOverlays(plan: PremisePlan): PlanOverlay[] {
  const p = plainOf(plan);
  const river = linkOf(plan, I.river);
  if (!p || !river?.path) return [];
  const T = turnOf(plan, p);
  const half = river.half ?? 2.5;
  const loc = riverLocal(T, river.path);
  const foot = leveeFoot(p, T.U, half, loc);
  const N = foot.length - 1;
  const m = (q: Point) => toMap(T, q);
  const out: PlanOverlay[] = [];
  const band = (from: (u: number) => number, to: (u: number) => number, u0: number, u1: number, colour: string, legend?: string, opacity = 1) => {
    const top: Point[] = [];
    const bot: Point[] = [];
    for (let u = u0; u <= u1; u += 1) {
      top.push(m([u, to(u)]));
      bot.push(m([u, from(u)]));
    }
    out.push({ kind: "band", points: [...bot, ...top.reverse()], colour, opacity, legend });
  };
  const vF = (u: number) => lineAt(p.far, p.step, u);
  const vB = (u: number) => vF(u) - lineAt(p.swamp, p.step, u);
  const ft = (u: number) => foot[Math.max(0, Math.min(N, Math.round(u)))];
  const u0 = Math.ceil(p.plainFrom);
  // (to where the river leaves the map: past it the floor is off the map)
  let uEnd = N;
  while (uEnd > u0 && !Number.isFinite(ft(uEnd))) uEnd--;
  band((u) => ft(u), vF, u0, uEnd, C.floor, "dry band (the plain)");
  band((u) => ft(u), (u) => Math.min(vB(u), ft(u) + p.M), u0, uEnd, C.green, `green band (M = ${p.M})`);
  band(vB, vF, u0, uEnd, C.swamp);
  band(vB, vF, Math.ceil(p.gulch.mouth), Math.floor(Math.min(p.red.swampTo, uEnd)), C.dead, "dead band (the backswamp)");
  band((u) => lineAt(p.near, p.step, u) + p.room[0] - half, vF, p.terrace[0], p.terrace[1], C.terrace, "the start's terrace", 0.9);
  for (const r of p.risers) {
    const pts: Point[] = [];
    const vn = lineAt(p.near, p.step, r.at);
    for (let v = vn; v <= vF(r.at) + 0.01; v += 1) pts.push(m([riserAt(r, v), v]));
    out.push({ kind: "line", points: pts, colour: C.riser, width: 1.5, dash: true, legend: r === p.risers[0] ? "riser (a level down)" : undefined });
  }
  // the levees: their crest a line along each bank, two over the plain thicker, the low places marked
  for (const side of ["plain", "near"] as const) {
    const sg = side === "plain" ? 1 : -1;
    const at = (s: number) => {
      const q = loc[Math.max(0, Math.min(loc.length - 1, Math.round(s * 2)))];
      const w = half + leveeWidth(p, s, side) / 2;
      return m([q.p[0] + sg * q.n[0] * w, q.p[1] + sg * q.n[1] * w]);
    };
    for (const r of p.levee[side]) {
      const pts: Point[] = [];
      for (let s = r.from; s <= r.to + 0.01; s += 1) pts.push(at(Math.min(s, r.to)));
      if (pts.length < 2) pts.push(at(r.to));
      out.push({ kind: "line", points: pts, colour: r.over === 0 ? C.low : C.levee, width: r.over === 2 ? 3 : r.over === 1 ? 2 : 4, legend: side === "plain" && r === p.levee.plain.find((x) => x.over === 2) ? "levee (thick: two over the plain)" : undefined });
    }
  }
  for (const o of p.levee.low) out.push({ kind: "label", points: [o.at], colour: C.low, text: "low", legend: o === p.levee.low[0] ? "low place (level with the plain)" : undefined });
  for (const s of p.sloughs) out.push({ kind: "line", points: s.path, colour: C.slough, width: Math.max(2, 2 * s.half * 2), dash: true, legend: s === p.sloughs[0] ? "slough (a dry bed)" : undefined });
  const wl = (a: number, b: number): Point[] => {
    const pts: Point[] = [];
    for (let u = a; u <= b + 0.01; u += 1) pts.push(m([Math.min(u, b), vF(Math.min(u, b)) + 1.5]));
    return pts;
  };
  out.push({ kind: "line", points: wl(p.window.from, p.window.to), colour: C.window, width: 3, legend: "the gulch's search window" });
  for (const [a, b] of p.window.framed) out.push({ kind: "line", points: wl(a, b), colour: C.framed, width: 5, legend: a === p.window.framed[0][0] ? "its runs in the vista frame" : undefined });
  out.push({ kind: "line", points: p.fork.path, colour: C.fork, width: 3, dash: true, legend: `${nameOf(plan, I.fork)} (dry, to its edge)` });
  out.push({ kind: "label", points: [p.col.at], colour: C.col, text: `col ${p.col.level}` });
  out.push({ kind: "label", points: [p.gulch.narrows.at], colour: C.col, text: `narrows ${p.gulch.narrows.width}` });
  out.push({ kind: "label", points: [p.gulch.head], colour: C.col, text: `${nameOf(plan, I.stain)} ${p.gulch.crest + p.gulch.rise}` });
  return out;
}
