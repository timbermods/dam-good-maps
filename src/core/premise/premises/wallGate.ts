// The wall with one gate (docs/PREMISES.md §5.1): The Gate (tools/showcase/the-gate.ts), generalised. "A mountain wall
// runs across the map, a green valley on your side and a dry basin beyond; the river rises in a cleft of the wall and
// pours over the Veil and runs down to the lake at your door. Carry the water through the one gate or round by the pass, and
// before the first badtide close the Still Pool's inlet."
//
// Stage 0 only (the Gate's first PR): `eligible`, `draw` (the plan, by arithmetic, from the stream `premise.plan`)
// and the `plan` halves of §5.1's invariants with §1.4's checks. Not offered to players yet: it is not in
// `spec/mapspec.ts` `PREMISE_IDS`, so not in `PREMISE_CHOICES`, `PREMISES` or Any; `premises/dev.ts` lists it for the
// tools and tests until it makes a whole map. Playability (the start's room, wood and reach) is the shared gate's, not
// this premise's (planning, 2026-11-11): no floor of its own here.
//
// Land first, story second (planning, 2026-11-11): the wall is a mountain range whose spine wanders across the map and
// whose crest rises and falls as noise; the Veil stands where it is highest near the middle, the Gate is a gorge where it
// is lowest, the Pass where it is lowest on the other side, and the basin is a dry lake's depression past it. The plan
// says where (`GateNumbers.range`, `pan`); stage 2 (`gateLand.ts`) shapes the land from it by the shared relief.
//
// The plan is laid out in a local frame, then turned onto the map: u along the range, v across it, the valley at low v
// (toward the opening camera), the basin at high v. The start's turn is the layout's turn, so the camera always looks
// within 35° of square at the wall's valley face (`wall.camera`); a mirror flips u. Unmirrored, the Pass and the drain
// bay lie at low u, the Still Pool and the Gate at high u.

import { frameAt, openingCamera } from "../../analysis/opening";
import { ORIENTATIONS } from "../../format/footprints";
import { BED_FLOOR } from "../../land/genome";
import { smoothstep } from "../../math/clamp";
import { fbm } from "../../math/noise";
import { cos, hypot, pow, sin, sqrt } from "../../math/portable";
import { hazardDays } from "../../sim/weather";
import { MAX_SILL_WIDTH, sillWidthFor } from "../../sim/sill";
import { EDITOR_LEVEL, type MapSpec } from "../../spec/mapspec";
import { premiseStream } from "../draw";
import { lipInFrame } from "../frame";
import { holdDeep } from "../levels";
import { bodyDist, bodyGap, dist, headingOf, pathDist, pathGap, pathLength, pointAt, subPath } from "../geom";
import { fail, nameOf, OK, PLAN_CHECKS, reach } from "../planChecks";
import { GATE_WATER_CHECKS, gateWater } from "../gateWater";
import { besideRun, brookGround, brookLegsWrong, brookPlaces, brookWay, courseReach, meander, sampled, selfGap } from "../gateBrooks";
import { gateLand } from "../gateLand";
import { rangeAt, sideOf, spineLocal, type GateRange } from "../gateRange";
import { lakeCanal, lakeShape, lakeShapeOn } from "../gateMeasures";
export { rangeAt, sideOf, spineLocal, type GateRange } from "../gateRange";
import type { Body, Edge, Exit, Invariant, Link, Point, PremiseDef, PremisePlan, Region, Ridge, Source, Spine, Work } from "../types";

// ------------------------------------------------------------------------------------------------- the ranges

/** Whether (u, v) lies in the spine's union of tapered capsules. */
function inSpine(sp: Spine, u: number, v: number, inset = 0): boolean {
  return edgeOf(sp, u, v) <= -inset;
}

/** How far (u, v) stands outside the spine's union of tapered capsules (under 0 inside it). */
function edgeOf(sp: Spine, u: number, v: number): number {
  let least = Infinity;
  for (let k = 0; k + 1 < sp.length; k++) {
    const [a, b] = [sp[k], sp[k + 1]];
    const du = b[0] - a[0];
    const dv = b[1] - a[1];
    const l2 = du * du + dv * dv;
    const f = l2 > 0 ? Math.max(0, Math.min(1, ((u - a[0]) * du + (v - a[1]) * dv) / l2)) : 0;
    least = Math.min(least, hypot(u - a[0] - du * f, v - a[1] - dv * f) - (a[2] + (b[2] - a[2]) * f));
  }
  return least;
}

/** The premise's id. Not a `PremiseId` yet: it joins `PREMISE_IDS` when it makes a whole map. */
export const GATE_ID = "wallGate";
/** Square maps, 128² to 256² (as the lake stair; ruling 7). */
export const GATE_SIDE = [128, 256] as const;
/** The valley lake's sill: four over the floor, so the Gate's slot floor (two under it) still falls a level or more to
 *  the rim's notch on `BED_FLOOR` (D325). The Gate's round 8 stood it at 7, its bed at 1: here the bed stops at 3. */
export const LAKE_SILL = BED_FLOOR + 3;
/** The plunge pool at the start's door stands this far over the valley's lake (its brook falls it, in two steps). */
export const DOOR_RISE = 2;
/** The plunge pool's lobe: its middle this far past the lip's end; it leaves over a low lip into its brook four wide
 *  there (half `OUTFLOW_HALF`, its widest): the Veil's whole flow (9.5 on normal) over a brook's own head stood the pool a level over its
 *  sill, on the start's bench. */
export const DOOR_LOBE = 8;
export const OUTFLOW_HALF = 2;
/** A southern brook's half width at its tarn (the table reads it: narrower, the tarns stood over their sills). */
export const TARN_HALF = 1.4;
/** The range's spurs (planning's ruling of 2026-11-13): roots `gap` tiles apart along the spine, `len` of their flank
 *  long, turned up to `turn` radians off square, forking where longer than `fork` of the flank, the branches `forkTurn`
 *  radians apart each way. */
export const SPURS = { gap: [8, 30], len: [0.3, 1.2], out: [1.1, 2.4], backLen: [0.5, 1.5], half: 4, draws: 16, turn: 0.5, fork: 0.85, forkTurn: [0.3, 0.6], least: 2 } as const;
/** Two southern brooks' middles stand this far apart at the least (the plan's checks refuse under 1.5). */
export const BROOK_APART = 3;
/** How far round the lake its field is read, tiles (past it, the lake is that far). */
export const LAKE_FIELD = 18;
/** How far round the paths the brooks keep from their field is read, tiles. */
export const PATH_FIELD = 16;
/** A brook takes a cove no further from its spring than `[0]` times the lake's nearest shore and `[1]` tiles. */
export const BROOK_COVE = [1.5, 12] as const;
/** Within this many tiles of a cove's head two brooks may come together. */
export const BROOK_SHARE = 5;
/** A brook's channel is drawn this many times at the most on one way, until it holds what a brook's must. */
export const BROOK_DRAWS = 6;
/** A brook's course keeps this many tiles off the map's edge. */
export const BROOK_EDGE = 7;
/** A brook's bed keeps its first level this many tiles along its axis (its first step, two points down). */
export const BROOK_HEAD = 6;
/** How far out of its tarn a brook runs square to its shore before it bends, tiles past the tarn's radius: its bed is
 *  a level down from 3.4 out, three wide and more, and clear of the tarn's water only so. */
export const BROOK_OUT = 4;
/** A brook's channel never comes within `gap` tiles of itself `along` tiles or more further on (a curve that touches
 *  itself: planning's ruling on the bends). */
export const BROOK_SELF = { along: 12, gap: 6 } as const;
/** A brook's way is sought within this share of the side round the box of its spring and its nearest end. */
export const BROOK_BOX = 0.15;
/** A brook's confluence (planning's ruling: land drains as a tree): a brook keeps a meander's `belt` from another or joins
 *  it, at `angle` radians to the trunk pointing downstream, never within `clear` tiles of a level the trunk drops, of
 *  its tarn or of the lake; within `near` tiles of its way in it may come close; its last `straight` tiles run straight
 *  in; the trunk's bed steps down `above` tiles above the join and the tributary's before its last `clear` tiles, so the
 *  two meet at one level. */
export const BROOK_JOIN = { belt: 13, angle: [0.5236, 1.0472], clear: 6, near: 1.5, straight: 7, above: 10, most: 2, gather: 5, reach: 1.6 } as const;
/** The brooks as a tree (planning's verdicts of 2026-11-14): with `brooks` brooks or more (192² and up) the western
 *  springs gather, a twig into a branch and the branch into a trunk; with `four` brooks or more (256² and up) a fourth
 *  joins the trunk high, and the beds gather in `orders` orders (Strahler's: springs, branches, a trunk; three springs
 *  in a chain are three ranks but two of Strahler's orders). No brook runs beside another (`gateBrooks.ts`
 *  `besideRun`: within 12 tiles of it and heading as it does) for more than `run` tiles of its length. The tree's
 *  springs (`springs`: its trunk, the one that joins it high, its branch and the branch's own; `three`: the trunk, the
 *  branch and its twig) stand `sill` over the lake's sill and are `spring` of a spring's strength; a tributary joins
 *  within `upTo` of the bed's length from its head (the high one, the others), and the trunk's and the branch's beds
 *  keep their first level over `level` of their length, so no step of theirs lies where one joins. */
export const BROOK_TREE = { brooks: 5, four: 6, orders: 3, run: 30, sill: 5, upTo: [0.3, 0.45], level: 0.5, springs: [4, 0, 3, 1], three: [4, 0, 3], spring: 0.72 } as const;

/** The tree's springs for a valley of `brooks` brooks (`BROOK_TREE`), or null: the trunk, the one that joins it high
 *  (-1 for none), the branch and the branch's twig. */
export function treeOf(brooks: number): { trunk: number; high: number; branch: number; twig: number } | null {
  if (brooks >= BROOK_TREE.four) return { trunk: BROOK_TREE.springs[0], high: BROOK_TREE.springs[1], branch: BROOK_TREE.springs[2], twig: BROOK_TREE.springs[3] };
  if (brooks >= BROOK_TREE.brooks) return { trunk: BROOK_TREE.three[0], high: -1, branch: BROOK_TREE.three[1], twig: BROOK_TREE.three[2] };
  return null;
}
/** The lake's main arm between its lobes: a point every `every` tiles, `off` tiles off its line by turns, its width
 *  `width` of the lobes' between them, `least` at the least; where the arm is wider than `wide` tiles from its middle
 *  to its shore, the points further apart and further off its line by as much (the wider arm of the lake that falls
 *  across the valley lay as a straight even reach of 170 to 220 tiles at 256², its wander lost in its width). */
export const LAKE_WANDER = { every: 6, off: [1, 2.2], width: [-0.25, 0.25], least: 2.8, wide: 3.5, nub: 7, nubOut: [3.5, 5], nubR: [2.5, 3.5], apart: 12 } as const;
/** The Steps, the small pool between the plunge pool's brook's two steps: across the brook, as wide as its lip
 *  (`r` its half length along the brook), at least `reach` tiles of brook each side of it. */
export const STEPS = { r: 2.6, reach: 4, meadow: 4, clear: 3.2 } as const;
/** The valley's brooks (planning's rulings of 2026-11-12: never wide and straight). The plunge pool's falls the two
 *  levels to the lake in two steps, a level over the pool's low lip into a reach, then the Steps' cascade `cascade` of
 *  the way between; its width `stream` (3 or 4: two wide, its 9.5 stood two deep), the southern brooks' `valley` (3 or 4: two
 *  wide, a spring's 2.5 stood a level deep and ran out over the banks). A
 *  whole width is drawn afresh after a run of `run` tiles, never the one before; `valley.water` holds only the most:
 *  never one width for more than `run[1]` tiles (the least only spaces the draws). A point every `every` tiles. */
export const BROOK = { stream: [3, 4], valley: [3, 4], mouth: [3, 4], run: [3, 6], every: 3, cascade: [0.35, 0.6] } as const;
/** The plunge pool's brook runs this far on from its lip, away from the bench, before it turns down the valley. */
export const OUTFLOW_AWAY = 16;
/** The valley's lake at its low end (planning's ruling: one broad body with a shore, ten across or more at its widest,
 *  its width varying two-fold or more, a bay or two): its wide lobe's radius `wide` (× 0.6 + 0.4 × side ÷ 128), a
 *  narrows of half that, the span along the valley it takes (× side ÷ 128, `least` at the least), its top at least `offBench` rows under the
 *  Veil's face; its meadow. And planning's verdict of 2026-11-14 (a lake pools in the valley's lowest ground; it does
 *  not lie along the wall): from its head by the plunge pool's brook it falls across the valley by `across` of its run
 *  along the range, where the valley has the room over the brooks' country (`brooks` of the side), and sags toward the
 *  valley's far edge between its ends by `sag` of its length, so its shore toward the wall turns from it; a narrows
 *  before its end (`throat` of the end's radius back, `throatR` of it wide), its end a round pool `endPool` times as
 *  wide as the Low River's lip; a bay toward the Gate where the Gate stands `bay` tiles or more past it, a narrows or a
 *  pool every `bayEvery` tiles along it; and a lump on the side of each lobe `lump` tiles or more in radius (`lumpAt`
 *  of the radius off its middle, `lumpR` of it wide). A layout whose lake reads as a canal lake (`gateMeasures.ts`
 *  `LAKE_CANAL`: over a third of its shore along the range, or under two-fold in width) is laid again, read `tighter`
 *  than `valley.lake` reads the laid water (its shore wanders by a tile there, and the brooks' mouths notch it). */
export const LAKE_SHAPE = { tighter: 0.02, wide: [7, 10.5], span: 36, least: 22, offBench: 16, meadow: 10, widest: 10, varies: 2, across: [0.6, 1], brooks: 0.1, sag: [0.12, 0.3], bay: 6, throat: [1.25, 1.6], throatR: [0.42, 0.55], endPool: 1.25, bayEvery: 12, lump: 8, lumpAt: 0.85, lumpR: 0.45 } as const;
/** The Veil: a fall of 6 or 7 from the cleft's lip into the plunge pool at the start's door. */
/** The lake bends (planning's look verdict of 2026-11-14 on round 2: one straight-sided arm running to the map's edge
 *  read as a canal): the main arm's middle is laid `off` of its length off the line between its ends (the side it
 *  sags to), and a lake whose main arm turns less than `least` radians within every `within` of its length is drawn
 *  again (`armBend`); no arm's shore within `edge` tiles of the map's edge. A lobe or a point of its shore held under
 *  the bench (or over the valley's low edge) stands back from that line 0 to `back` tiles by draw: held on the line,
 *  their edges lay as one straight shore 80 tiles long, 256² seed 3. */
export const LAKE_BEND = { off: 0.25, least: 0.5, within: 0.4, edge: 6, back: 3 } as const;

/** How much a chain of capsules turns: over every stretch `within` of its length long, the angle between the chords of
 *  its two halves; the most of them, radians. */
export function armBend(arm: Spine, within: number = LAKE_BEND.within): number {
  const pts: Point[] = arm.map((q) => [q[0], q[1]]);
  const L = pathLength(pts);
  if (!(L > 0)) return 0;
  const w = within * L;
  let most = 0;
  for (let s = 0; s + w <= L + 1e-9; s += Math.max(0.5, L / 200)) {
    const a = pointAt(pts, s).p;
    const m = pointAt(pts, s + w / 2).p;
    const b = pointAt(pts, s + w).p;
    const [x1, y1, x2, y2] = [m[0] - a[0], m[1] - a[1], b[0] - m[0], b[1] - m[1]];
    const l1 = hypot(x1, y1);
    const l2 = hypot(x2, y2);
    if (!(l1 > 0 && l2 > 0)) continue;
    most = Math.max(most, Math.acos(Math.max(-1, Math.min(1, (x1 * x2 + y1 * y2) / (l1 * l2)))));
  }
  return most;
}

export const VEIL = [6, 7] as const;
/** The range's highest peak: 17 to 22, under the highest ground (its crest falls from there to the gap's saddle): 17 or
 *  18 at 128², a level more each 64 tiles of side (planning's ruling of 2026-11-14: height follows breadth; the back
 *  slope's breadth at a level every three to five tiles is what earns it). Never under 17: the Veil's cleft stands on the
 *  crest two over its pool. */
export const CREST = [17, 22] as const;
/** The least Highest terrain the premise takes (unchanged by the scarp's lower crest: the Veil's crest stands 18 at the
 *  most likely). */
export const CREST_SKY = 18;
/** The range (§5.1, planning's ruling of 2026-11-11: a mountain range, not a wall): its spine wanders across the map,
 *  sampled every `sample` tiles along u; it stands `veil` tiles behind the Veil's face, there and within `calm` tiles
 *  of the Veil's middle, coming in over `calmIn` more; elsewhere it wanders behind by `wander` of the side (by noise
 *  `wanderCell` of the side across), past `reach` of the side behind the Veil's face (its back foot) a third as fast, so
 *  the basin keeps its room. Its crest is noise along it (`profileCell` of the side across), its lowest saddle
 *  the gap's, `SADDLE_OVER` over the megadam's water, its highest peak `CREST`. Half-widths: `front` toward the valley
 *  (`veilFront` at the Veil, whose face is a cliff), `back` toward the basin, both wandering, and both wider on a larger
 *  map (0.6 + 0.4 × side ÷ 128 times). */
export const RANGE = { sample: 4, veil: 7, calm: 6, calmIn: 14, wander: [2, 4], wanderCell: [0.18, 0.3], profileCell: [0.17, 0.25], front: [6, 10], veilFront: 9, back: [8, 12], reach: 0.3 } as const;
/** The range's line swings (planning's verdict of 2026-11-14 on the first sheet: the wall crossed the map as a ruler
 *  line): one broad bend each side of the Veil, where the range stands nearest the valley. On each side it falls back
 *  toward the basin by `amp` of the side over `span` of the side (as the sine of the way to the `rise`: as its
 *  square, it left the Veil so slowly that the foot ran straight for 36 and 37 tiles of 128 there, over a quarter of
 *  the side), then comes forward again by `back` of that. Within the first frame, `frame[0]` tiles each side of the
 *  Veil, it falls back by `frame[1]` tiles at the most, and by `frame[2]` a tile more past it: the opening camera
 *  looks at the Veil across the range's line, and a range fallen back 20 to 26 tiles there left the frame's top on
 *  one side and its edge on the other, `wall.camera` refused on 7 plans of 16 (256² seed 8). Its
 *  thickness toward the valley swells and thins by `swell` of its width, by noise `swellCell` of the side across. */
export const RANGE_BEND = { amp: [0.07, 0.12], span: [0.26, 0.36], back: [0.4, 0.9], rise: 1.25, frame: [60, 10, 0.5], swell: 0.55, swellCell: 0.16, col: 3.5, colCell: 0.1 } as const;
/** The gap's saddle over the megadam's water: the range's lowest, so the gorge is the one low way through. */
export const SADDLE_OVER = 2;
/** The crest varies by this many levels or more along the range (planning: peaks and saddles, four or more). */
export const CREST_VARIES = 4;
/** The cleft's pool: its middle row behind the lip, its radius. */
const CLEFT = { back: 7.6, r: 1.8 } as const;
/** The Veil's lip, 9 to 12 tiles along the range's face at the Veil. */
export const LIP = [9, 12] as const;
/** The Gate's gorge, 5 to 7 wide, from 8 tiles of bench before the range's foot; its bar a level over the lake's sill, 3
 *  tiles long at the shore; two rows of Blockages behind. */
export const SLOT = [5, 7] as const;
export const SLOT_BENCH = 8;
export const BAR_LENGTH = 3;
/** The leat's row of Blockages, this far along it: behind its bar, two tiles past the cleft. */
export const LEAT_ROW = 3.5;
/** The basin (§5.1; planning's ruling of 2026-11-12: a dried lake's floor is flat, land a player can water): a playa
 *  `long` of the side along the range and `deep` of the basin's room across it (`room` tiles at the least), within two
 *  levels of its pan (a level over the beds' floor), two old shoreline benches a level apart round it, `shore` tiles
 *  each (× 0.75 + 0.25 × side ÷ 128), the natural hills beyond; the beds leave the map by one outlet on the far edge,
 *  `NOTCH` wide between their outer banks at most. */
export const BASIN = { long: [0.4, 0.48], deep: [0.5, 0.6], shore: [4, 7], room: 24 } as const;
export const NOTCH = 11;
/** The Still Pool (§5.1's neck): 12 tiles or more, its inlet 3 wide at most and 3.5 long at most (a kettle's neck,
 *  §4.5), shut by a levee of 3. */
export const NECK = { least: 12, wide: 3, long: 3.5, levee: 3 } as const;
/** The springs in the cleft: three, 9.5 on normal River flow (the round's 9 to 10); the valley's three brooks each
 *  about a quarter of that (the round's 2.5 to 3, a little less: the whole valley leaves over the Low River's lip,
 *  16 at most, and at the round's the lake stood 0.6 over its sill at 256²). */
export const GATE_FLOW = { trickle: 7, normal: 9.5, strong: 12, lush: 14 } as const;
export const POOL_SOURCES = 3;
export const BROOK_SPRING = [2.0, 2.6] as const;
/** The lake's meadow by Buildable land (the round's 18 on normal). */
export const GATE_MEADOW = { tight: 15, normal: 18, generous: 21 } as const;
/** The Low River's gorge: 5 wide, 6 at lush, through a spur ridge `SPUR` thick and the megadam's level + 3 high. */
export const GORGE = { normal: 5, lush: 6 } as const;
export const SPUR_HALF = 4.5;
/** The megadam holds the valley `MEGADAM_RISE` over its lake's sill (the round's 9 over 7). */
export const MEGADAM_RISE = 2;
/** The start's bench stage 0 builds for (D515, planning 2026-11-11): 1.1 × the shared gate's floor for the Start area
 *  (`validate/playability.ts` `START_FLOORS`' 480, 640 and 980, milestone's #1015; read from there once it is on dev).
 *  The gate holds no floor of its own: this is where it aims, the shared checks judge. */
const BENCH_FLOOR = { small: 480, normal: 640, large: 980 } as const;
const BENCH_OVER = 1.1;
/** The start's walk before any slope stands is its level pocket, and the shared stage 3 (#1015) reads it against three
 *  quarters of the walkable floor (1,300): the pocket holds that too. */
const WALK_READ = 0.75 * 1300;
/** The rows the lake stands off the wall's foot at the least (the trench, the start's 5 × 5 and the rows round it). */
const BENCH_ROWS = 9;
/** The valley's room under the lake (the brooks' springs and their runs), a share of the side. */
const UNDER_LAKE = 0.14;

/** What each rung buys (§4.2: a floor, the most twice it), per tile of the map's side: round 8's gains at 192² (the Gate
 *  opened 1,318, the leat 1,839, the whole shares 1,534 and 1,663: 3.6 %, 5.0 %, 4.2 % and 4.5 %) at two thirds, over
 *  192. A rung greens along its bed, whose length grows with the side, not the map's area: measured on the ladder (19
 *  seeds over three sizes), the Gate opened 3.1 % of the map at 192² and 2.4 % at 256². The megadam's is water
 *  (tile-levels): it raises the lake and its meadow, which grow with the side too: two thirds of what it holds with the
 *  lake at the valley's low end (812 to 1,050 at 128², planning's ruling of 2026-11-12; round 8's lake by the bench held
 *  1,828 to 3,741). */
const GIVES = { gateOpen: (2 / 3) * 1318 / 192, gateWhole: (2 / 3) * 1534 / 192, leatOpen: (2 / 3) * 1839 / 192, leatWhole: (2 / 3) * 1663 / 192, megadam: 5 } as const;
/** The rungs whose gain is their share of the river down a bed already wet: by number none (`gateWorks.ts`
 *  `SHARE_RUNGS`), so their floor is 0, the round's share their most. */
const SHARE = new Set(["gateWhole", "leatWhole"]);

/** How far the Gate's gorge swings to each side of its line across the range, a point every three tiles. */
export const GORGE_WANDER = [1.5, 2.5] as const;
/** The gorge's one broad bend through the range: this far to one side of its line at its middle (× 0.75 + 0.25 × side ÷ 128). */
export const GORGE_BOW = [3, 5.5] as const;
/** Layouts an attempt draws before it gives up. */
const LAYOUT_TRIES = 72;

// ------------------------------------------------------------------------------------------------- the plan's own numbers

/** The wall with one gate's own numbers (as `StairPlan` is the lake stair's), kept so the invariants read them. */
export interface GateNumbers {
  /** The layout's turn (the start's orientation, 0 to 3) and whether it was mirrored. */
  turn: number;
  mirror: boolean;
  /** Levels: the lake's sill, the Veil's drop (`drop`), the range's highest peak (`crest`) and the gap's saddle, the
   *  Pass (the leat's crossing), the megadam's water, the basin's floor (lowest and highest). */
  sill: number;
  drop: number;
  crest: number;
  saddle: number;
  pass: number;
  megadam: number;
  floor: [number, number];
  /** The range (local), and the Veil's face (local v of its lip). */
  range: GateRange;
  face: number;
  /** The basin's playa (map, its middle; the pan), its level, its half-depth across the range and half-length along it,
 *  and each old shoreline bench's width. */
  pan: { at: Point; level: number; r: number; long: number; shore: number };
/** Ids: the lake, the springs' pool (the cleft), the Still Pool and its inlet, the Veil, the Gate, the leat, the Low
   *  River; the ridges (the wall, the spur the gorge cuts, the rim's two pieces). */
  lake: string;
  /** The plunge pool at the start's door the Veil falls into (the start's water, a level over the lake). */
  door: string;
  pool: string;
  kettle: string;
  inlet: string;
  veil: string;
  gate: string;
  leat: string;
  low: string;
  wall: string;
  spur: string;
  /** The Gate: the gorge's width, the index of the gate's path point where the gorge ends (the Gate Bed begins); its bar's
   *  level and length from the shore. */
  slot: { width: number; to: number };
  /** The range's spurs (local u, v), each a path from where it leaves (the spine, or a fork) toward a side (0 the
   *  valley's, 2 the basin's); a fork's two branches start where its trunk ends. */
  spurs: { side: 0 | 2; trunk: boolean; path: Point[] }[];
  bar: { level: number; length: number };
  /** The leat: the bar at its head (two over its bed), and the index of its path point at the Pass (the Pass Bed
   *  begins after it); the Pass's span along the crest. */
  leatBar: number;
  passAt: number;
  passSpan: [Point, Point];
  /** The beds' outlet on the basin's far edge, its middle and width. */
  notch: { at: Point; width: number };
  /** Which side the Low River leaves by: the Pass's or the Gate's. */
  lowSide: "pass" | "gate";
}

/** A plan of this premise: a `PremisePlan` with its numbers (`premise` is the id above, outside `PremiseId` until it is
 *  offered). */
export type GatePlan = Omit<PremisePlan, "premise"> & { premise: typeof GATE_ID; gate: GateNumbers };

/** The gate's numbers of a plan, or null. */
export const gateOf = (plan: PremisePlan): GateNumbers | null => (plan as unknown as Partial<GatePlan>).gate ?? null;

// ------------------------------------------------------------------------------------------------- eligibility

/** The springs' strength, the lake's meadow and the gorge's width for a spec. */
const flowOf = (spec: MapSpec) => GATE_FLOW[spec.settings.water.riverFlow];
const meadowOf = (spec: MapSpec) => GATE_MEADOW[spec.settings.terrain.buildableLand];
const gorgeOf = (spec: MapSpec) => (spec.settings.water.riverFlow === "lush" ? GORGE.lush : GORGE.normal);
/** The water's ceiling (as the lake stair's `stairTop`: never over the in-game editor's 16). */
const gateTop = (spec: MapSpec) => Math.min(spec.settings.terrain.highestTerrain, EDITOR_LEVEL);

export function wallGateEligible(spec: MapSpec): string | null {
  const { x, y } = spec.size;
  if (x !== y) return "The wall with one gate is drawn on square maps only, for now";
  if (x < GATE_SIDE[0]) return `The wall with one gate needs at least ${GATE_SIDE[0]} tiles a side for a valley and a basin`;
  if (x > GATE_SIDE[1]) return `The wall with one gate is drawn up to ${GATE_SIDE[1]} tiles a side`;
  if (spec.settings.start.easyStart) return "Easy start is not offered with the wall with one gate yet";
  if (spec.settings.water.lakes === "none") return "The wall with one gate needs its valley lake, and Lakes is None";
  if (spec.settings.water.waterfalls === "off") return "The wall with one gate needs its fall, and Waterfalls is Off";
  if (spec.settings.water.sources === "none") return "The wall with one gate needs its springs, and Sources is None";
  if (spec.settings.terrain.highestTerrain < CREST_SKY) return `Highest terrain ${spec.settings.terrain.highestTerrain} is too low for the wall (its crest stands at ${CREST_SKY} or more)`;
  if (LAKE_SILL + VEIL[0] > gateTop(spec) - 2) return `Highest terrain ${spec.settings.terrain.highestTerrain} is too low for the springs over the fall`;
  return null;
}

// ------------------------------------------------------------------------------------------------- the turn

/** The local frame onto the map: u along the wall, v across it toward the basin. `k` turns local v onto the camera's
 *  look (Cw0: north, Cw90: east, Cw180: south, Cw270: west); `m` mirrors u first. */
export interface Turn {
  k: number;
  m: boolean;
  N: number;
}

/** A point (continuous) from local to map. */
export function onMap(T: Turn, [u0, v]: Point): Point {
  const u = T.m ? T.N - u0 : u0;
  const N = T.N;
  return T.k === 0 ? [u, v] : T.k === 1 ? [v, N - u] : T.k === 2 ? [N - u, N - v] : [N - v, u];
}

/** A point from map to local. */
export function onLocal(T: Turn, [x, y]: Point): Point {
  const N = T.N;
  const [u, v]: Point = T.k === 0 ? [x, y] : T.k === 1 ? [N - y, x] : T.k === 2 ? [N - x, N - y] : [y, N - x];
  return [T.m ? N - u : u, v];
}

/** A tile index (its corner, as the plan's start and lips are) from local to map: the tile's middle turned. */
function tileOnMap(T: Turn, [i, j]: Point): Point {
  const [x, y] = onMap(T, [i + 0.5, j + 0.5]);
  return [Math.round(x - 0.5), Math.round(y - 0.5)];
}

/** A direction from local to map. */
function dirOnMap(T: Turn, [du0, dv]: Point): Point {
  const du = T.m ? -du0 : du0;
  return T.k === 0 ? [du, dv] : T.k === 1 ? [dv, -du] : T.k === 2 ? [-du, -dv] : [-dv, du];
}

/** The map edge a local edge lands on. */
function edgeOnMap(T: Turn, e: Edge): Edge {
  const out: Point = e === "N" ? [0, 1] : e === "S" ? [0, -1] : e === "E" ? [1, 0] : [-1, 0];
  const [dx, dy] = dirOnMap(T, out);
  return dx > 0.5 ? "E" : dx < -0.5 ? "W" : dy > 0.5 ? "N" : "S";
}

export const turnOf = (plan: PremisePlan, g: GateNumbers): Turn => ({ k: g.turn, m: g.mirror, N: plan.W });
const spineOnMap = (T: Turn, s: Spine): Spine => s.map(([u, v, r]) => [...onMap(T, [u, v]), r] as [number, number, number]);
const pathOnMap = (T: Turn, p: readonly Point[]): Point[] => p.map((q) => onMap(T, q));
const r2 = (v: number) => Math.round(v * 100) / 100;
const rp = (p: Point): Point => [r2(p[0]), r2(p[1])];

// ------------------------------------------------------------------------------------------------- the range in local

/** The index of the sample between `lo` and `hi` (tiles of u) whose value `better` prefers, or -1. */
function bestSample(raw: readonly number[], step: number, lo: number, hi: number, better: (a: number, b: number) => boolean): number {
  let best = -1;
  for (let k = Math.max(0, Math.ceil(lo / step)); k <= Math.min(raw.length - 1, Math.floor(hi / step)); k++) if (best < 0 || better(raw[k], raw[best])) best = k;
  return best;
}

const LAKE_NAMES = ["Wall Lake", "Long Lake", "Shadow Lake", "Foot Lake"];
const VEIL_NAMES = ["the Veil", "the Curtain", "the White Drop", "the Bridal Fall"];
const POOL_NAMES = ["the Cleft", "the Wellhead", "the Spring Cleft"];
const DOOR_NAMES = ["the Plunge Pool", "the Spray Pool", "the Foam Pool"];
const KETTLE_NAMES = ["the Still Pool", "the Door Pool", "the Quiet Pool"];
const PASS_NAMES = ["the Pass", "the Saddle", "the Col"];
const BROOK_WORDS = ["Valley", "Fern", "Alder", "Rowan", "Sedge", "Birch", "Hazel", "Willow"];

/** A failed layout says why in a word or two (for the tools). */
type Laid = { plan: GatePlan } | { why: string };

function layout(spec: MapSpec, attempt: number, t: number): Laid {
  const rng = premiseStream(spec, "premise.plan", attempt, "gate", t);
  const N = spec.size.x;
  const top = gateTop(spec);
  const sky = spec.settings.terrain.highestTerrain;
  const T: Turn = { k: rng.int(0, 4), m: rng.float() < 0.5, N };
  const S = LAKE_SILL;
  // (the Veil falls into the plunge pool at the start's door, a level over the valley's lake, which its brook runs down to)
  const D = S + DOOR_RISE;
  const veils = VEIL.filter((h) => D + h <= top - 2);
  const Hv = veils[rng.int(0, veils.length)];
  const poolSill = D + Hv;
  // (as high as the theme's ceiling allows, a level of play: planning's ruling of 2026-11-13, use the height)
  // (and three over the cleft's pool at least: the Veil's springs rise in the crest)
  const C = Math.min(CREST[1], sky, Math.max(poolSill + 3, CREST[0] + 1 + Math.round((N - 128) / 64) + rng.int(0, 2)));
  const P = poolSill - 2;
  const M = S + MEGADAM_RISE;
  const Gs = M + SADDLE_OVER;
  // (the valley falls from the Veil toward the Gate's side: its lake lies at that low end, the Low River leaves it there,
  // and the Gate leaves its shore; the Pass and the leat are on the Veil's other side)
  const lowSide = "gate" as GateNumbers["lowSide"];
  const flow = flowOf(spec);
  const gorge = gorgeOf(spec);

  // ---- the range, land first (planning, 2026-11-11): its crest along it and its spine's wander are noise; the Veil
  // stands where its crest is highest near the map's middle (the springs rise high in the range), the gap where it is
  // lowest on the Still Pool's side, the Pass where it is lowest on the other; a range whose lowest saddle is not
  // where a gap can stand is drawn again
  const step = RANGE.sample;
  const n = Math.ceil(N / step);
  const us = Array.from({ length: n + 1 }, (_, k) => k * step);
  const seed = () => rng.int(1, 1 << 30);
  const [sP, sV, sF, sB] = [seed(), seed(), seed(), seed()];
  const pCell = N * rng.range(RANGE.profileCell[0], RANGE.profileCell[1]);
  const vCell = N * rng.range(RANGE.wanderCell[0], RANGE.wanderCell[1]);
  const fb = Math.round(N * rng.range(0.53, 0.58));
  const w = rng.int(LIP[0], LIP[1] + 1);
  const slotW = rng.int(SLOT[0], SLOT[1] + 1);
  const vj = rng.range(-1.5, 1.5);
  const gj = rng.range(-1, 1);
  // (the Still Pool at the lip's end away from the low end, the plunge pool's lobe and its brook's head at the other)
  const ks = -1;
  const spurU = lowSide === "pass" ? Math.round(0.08 * N) : N - Math.round(0.08 * N);
  // the range is drawn along three times the map's side and the map frames a stretch of it, read either way: the first
  // stretch, from a drawn start, whose lowest saddle stands where a gap can, with the Veil, the Pass and the levels in
  // reach (the land is drawn first; the frame only chooses what of it to show)
  const long = Array.from({ length: 3 * n + 1 }, (_, k) => fbm(sP, k * step, 0.5, pCell, 3));
  const o0 = rng.int(0, 2 * n + 1);
  // (planning's ruling of 2026-11-13, use the height: the range stands high between its saddles, the noise's share of
  // the way up taken as 1 − (1 − q)³, so the crest stands near its peak for most of its length)
  const lift = (q: number) => 1 - (1 - q) * (1 - q) * (1 - q);
  const atU = (a: readonly number[], u: number) => {
    const q = Math.max(0, Math.min(a.length - 1, u / step));
    const k = Math.min(a.length - 2, Math.floor(q));
    return a[k] + (a[k + 1] - a[k]) * (q - k);
  };
  let pick: { raw: number[]; lm: number; lu0: number; lu1: number; kg: number; kp: number } | null = null;
  let why = "range";
  for (let j = 0; j <= 2 * n && !pick; j++)
    for (const rev of [false, true]) {
      const o = (o0 + j) % (2 * n + 1);
      const raw = long.slice(o, o + n + 1);
      if (rev) raw.reverse();
      const kv = bestSample(raw, step, 0.38 * N, 0.5 * N, (a, b) => a > b);
      if (kv < 0) continue;
      const lu0 = Math.round(us[kv] + vj - w / 2);
      const lu1 = lu0 + w - 1;
      const lm = (lu0 + lu1 + 1) / 2;
      const kE = ks > 0 ? lu1 : lu0;
      void kE;
      const gLeast = lu1 + DOOR_LOBE + 4.2 + 12;
      // the gap: the range's lowest saddle on the Still Pool's side, clear of the Still Pool and the map's end; no
      // saddle of the range anywhere lower (the one low way through)
      const kg = bestSample(raw, step, gLeast, Math.min(N - 18 - slotW / 2, spurU - SPUR_HALF - 8 - 4), (a, b) => a < b);
      if (kg < 0 || raw.some((r) => r < raw[kg])) {
        why = "gap not lowest";
        continue;
      }
      // the Pass: the lowest saddle on the Veil's other side, over the gap
      const kp = bestSample(raw, step, (lowSide === "pass" ? spurU + 6 : 12) + 4, lm - w / 2 - 14, (a, b) => a < b);
      if (kp < 0) {
        why = "pass room";
        continue;
      }
      const span = Math.max(...raw) - raw[kg];
      // (a range stands high between its saddles: the noise's share of the way up taken as q (2 − q))
      const level = (u: number) => Gs + lift((atU(raw, u) - raw[kg]) / span) * (C - Gs);
      if (!(span > 0) || level(lm) < poolSill + 2) {
        why = "veil under the crest";
        continue;
      }
      if (level(us[kp]) < Math.max(P, Gs + 1)) {
        why = "pass low";
        continue;
      }
      pick = { raw, lm, lu0, lu1, kg, kp };
      break;
    }
  if (!pick) return { why };
  const { raw, lm, lu0, lu1, kg, kp } = pick;
  // the spine: at the Veil's face + 7 there (the cleft's pool on the crest behind the lip), wandering behind it elsewhere,
  // so the Veil's buttress is the range's most forward foot
  const A = (rng.range(RANGE.wander[0], RANGE.wander[1]) * N) / 128;
  const calm = (u: number) => smoothstep((Math.abs(u - lm) - RANGE.calm) / RANGE.calmIn);
  // (the range's widths grow with the map: two fifths more at 256²)
  const wide = 0.6 + (0.4 * N) / 128;
  const fm = ((RANGE.front[0] + RANGE.front[1]) / 2) * wide;
  const bm = ((RANGE.back[0] + RANGE.back[1]) / 2) * wide;
  const back = us.map((u) => Math.max(RANGE.back[0] * wide, Math.min(RANGE.back[1] * wide, bm + 0.8 * wide * (RANGE.back[1] - RANGE.back[0]) * fbm(sB, u, 0.5, 18, 2))));
  // (past its reach the spine comes on a third as fast, so it keeps wandering and the basin keeps its room)
  // (its line swings: a broad bend each side of the Veil, back toward the basin and forward again, each side's own)
  const bends = [0, 1].map(() => ({ amp: N * rng.range(RANGE_BEND.amp[0], RANGE_BEND.amp[1]), span: N * rng.range(RANGE_BEND.span[0], RANGE_BEND.span[1]), back: rng.range(RANGE_BEND.back[0], RANGE_BEND.back[1]) }));
  const bend = (u: number): number => {
    const b = bends[u < lm ? 0 : 1];
    const x = Math.max(0, Math.abs(u - lm) - RANGE.calm) / b.span;
    const q = sin((Math.PI * Math.min(x, 2)) / 2);
    const [within, most, more] = RANGE_BEND.frame;
    return Math.min(b.amp * (x <= 1 ? pow(q, RANGE_BEND.rise) : 1 - b.back * (1 - q * q)), most + more * Math.max(0, Math.abs(u - lm) - within));
  };
  const sv = us.map((u, k) => {
    const cap = fb + RANGE.reach * N - back[k];
    const v = fb + RANGE.veil + calm(u) * A * Math.max(0, 1 + 1.3 * fbm(sV, u, 0.5, vCell, 2)) + bend(u);
    return v <= cap ? v : cap + (v - cap) / 3;
  });
  // (its thickness toward the valley swells and thins along it: its foot is not its spine's line moved over)
  const sSw = seed();
  const front = us.map((u, k) => {
    const swell = 1 + RANGE_BEND.swell * calm(u) * fbm(sSw, u, 0.5, RANGE_BEND.swellCell * N, 2);
    const f = RANGE.veilFront + calm(u) * (fm * swell - RANGE.veilFront + 0.8 * wide * (RANGE.front[1] - RANGE.front[0]) * fbm(sF, u, 0.5, 18, 2));
    return Math.max(RANGE.front[0] - (1 - calm(u)) * 2 - 1, Math.min(RANGE.front[1] * wide * (1 + RANGE_BEND.swell) + 1, f, sv[k] - fb + 2));
  });
  const gu = Math.round(us[kg] + gj) + (slotW % 2 ? 0.5 : 0);
  const pu = us[kp];
  // the crest by level: the gap's saddle `Gs` (the megadam's water + 2), the highest peak `C`, the rest between by the
  // noise; the cleft's ground over its pool, the Pass over the gap. And it rises and falls along its high stretches
  // (planning's verdict of 2026-11-14: a range, not a band): cols up to `RANGE_BEND.col` levels deep, `colCell` of the
  // side apart, none at the Veil, the gap or the Pass, the highest peak left at `C`
  const span = Math.max(...raw) - raw[kg];
  const sCol = seed();
  const top0 = raw.map((r) => Gs + lift((r - raw[kg]) / span) * (C - Gs));
  const colAt = us.map((u, k) => (Math.abs(u - pu) < 8 ? 0 : calm(u) * Math.max(0, Math.min(1, (top0[k] - Gs - 2) / 3)) * RANGE_BEND.col * (0.5 + 0.5 * fbm(sCol, u, 0.5, RANGE_BEND.colCell * N, 2))));
  const kTop = top0.reduce((best, c, k) => (c - colAt[k] > top0[best] - colAt[best] ? k : best), 0);
  const crest = top0.map((c, k) => r2(k === kTop ? C : Math.min(C, c - colAt[k])));
  const Rp: GateRange = { step, v: sv, crest, front, back };

  // ---- the range's spurs (planning's ruling of 2026-11-13: not on a beat): from the spine at spacings drawn from
  // `SPURS.gap`, toward either side as it falls (two in a row from one side as often as not), each `SPURS.len` of its
  // flank long, wandering; a long one forks. Not before the Veil's face, nor across the Gate's gorge or the Pass. The
  // side valleys lie between them.
  // (drawn again, `SPURS.draws` times at most, until both sides have theirs: a third of the layouts were refused for it)
  const spurs: GateNumbers["spurs"] = [];
  const spursLeast = Math.round((SPURS.least * N) / 128);
  for (let again = 0; again < SPURS.draws && [0, 2].some((sd) => spurs.filter((x) => x.trunk && x.side === sd).length < spursLeast); again++) {
  spurs.length = 0;
  for (let su = rng.range(4, 12); su < N - 6; su += rng.range(SPURS.gap[0], SPURS.gap[1])) {
    // (either side as it falls, but never three more on one side than the other: both flanks have their valleys)
    const lead = spurs.filter((x) => x.trunk && x.side === 0).length - spurs.filter((x) => x.trunk && x.side === 2).length;
    const toss = rng.float();
    const side: 0 | 2 = lead >= 2 ? 2 : lead <= -2 ? 0 : toss < 0.5 ? 0 : 2;
    const ra = rangeAt(Rp, su);
    const flank = side === 0 ? ra.front : ra.back;
    // (toward the valley a spur leaves the scarp where the spine stands back from the Veil's face line: out to
    // `SPURS.out` of the scarp's width, its end short of that line; toward the basin `SPURS.backLen` of the back slope)
    const room = ra.v - fb - 1;
    const draw = rng.float();
    const len = side === 0 ? Math.max(flank * (SPURS.len[0] + (SPURS.len[1] - SPURS.len[0]) * draw), Math.min(room, flank * (SPURS.out[0] + (SPURS.out[1] - SPURS.out[0]) * draw))) : flank * (SPURS.backLen[0] + (SPURS.backLen[1] - SPURS.backLen[0]) * draw);
    const turn = rng.range(-SPURS.turn, SPURS.turn);
    const forkAt = len > SPURS.fork * flank ? rng.range(0.45, 0.65) : 2;
    const forkTurn = rng.range(SPURS.forkTurn[0], SPURS.forkTurn[1]);
    // (nor its end: a spur that leans runs `len` sin `turn` along the range)
    const tip = su + len * sin(turn);
    if ([su, tip].some((x) => x < 6 || x > N - 4 || (side === 0 && x > lu0 - 10 && x < lu1 + 10) || Math.abs(x - gu) < slotW / 2 + 10 || Math.abs(x - pu) < 8)) continue;
    const dv = side === 0 ? -1 : 1;
    const walk = (from: Point, a: number, l: number): Point[] => {
      const out: Point[] = [from];
      let p = from;
      for (let d = 2; d <= l + 1e-9; d += 2) {
        const aa = a + rng.range(-0.25, 0.25);
        p = [p[0] + 2 * sin(aa), p[1] + 2 * dv * cos(aa)];
        out.push([r2(p[0]), r2(p[1])]);
      }
      return out;
    };
    const root: Point = [r2(su), r2(ra.v)];
    if (forkAt > 1) spurs.push({ side, trunk: true, path: walk(root, turn, len) });
    else {
      const trunk = walk(root, turn, len * forkAt);
      spurs.push({ side, trunk: true, path: trunk });
      const at = trunk[trunk.length - 1];
      spurs.push({ side, trunk: false, path: walk(at, turn - forkTurn, len * (1 - forkAt)) });
      spurs.push({ side, trunk: false, path: walk(at, turn + forkTurn, len * (1 - forkAt) * rng.range(0.6, 1)) });
    }
  }
  }

  // (the scarp's foot comes out round each spur toward the valley: the plan's front there is the spur's reach)
  for (const sp of spurs) {
    if (sp.side !== 0) continue;
    for (let k = 0; k <= n; k++) {
      let need = 0;
      for (const q of sp.path) {
        const du = Math.abs(q[0] - us[k]);
        if (du < SPURS.half + step) need = Math.max(need, (sv[k] - q[1]) * Math.min(1, (SPURS.half + step - du) / step) + SPURS.half);
      }
      if (need > front[k]) front[k] = Math.min(need, sv[k] - fb + 2);
    }
  }
  const R0: GateRange = { step, v: sv, crest: raw, front, back };
  const R: GateRange = { step, v: sv.map(r2), crest, front: front.map(r2), back: back.map(r2) };
  const vAt = (u: number) => rangeAt(R0, u).v;
  const foot = (u: number) => vAt(u) - rangeAt(R0, u).front;
  const backFoot = (u: number) => vAt(u) + rangeAt(R0, u).back;

  // ---- the cleft, the trench, the Still Pool
  const poolSpine: Spine = [[lm - 2.5, fb + CLEFT.back, CLEFT.r], [lm + 2.5, fb + CLEFT.back, CLEFT.r]];
  // the trench under the lip and the drain bay to the lake, one arm: stage 1 lays the arm nearest the landmark's lip as
  // the first frame's bay, a level deep with the drowned river's ribbon two (raster/bodies.ts `bayOf`), so it carries
  // the whole Veil to the lake (a shelf a tile or two wide at the sill carried half of it, and the foot stood over the
  // start's bench)
  // (the Still Pool stands beside the start, at the lip's end the camera leans to, where the frame puts the start; the
  // drain bay leaves by the other end, clear of the start's bench: on a mirrored layout the two swap ends)
  const kEnd = ks > 0 ? lu1 : lu0;
  const bEnd = ks > 0 ? lu0 : lu1;
  // (the bay opens wide at the lip's end: a trench a tile or two wide there between the foot and the bay, beside the
  // lip's shoulders, held the fall back over the start's bench)
  // the plunge pool: the Veil's foot along the lip, opening into a lobe past the lip's end, where its brook leaves
  // (its lobe as wide as the low lip its brook leaves over, which the table sizes by the Veil's flow, 8 at the least)
  // (three wider than the flow asks: the plunge pool stands low under the start's bench, the Veil falls its height)
  const doorLip = Math.max(8, Math.min(MAX_SILL_WIDTH, sillWidthFor(flowOf(spec)) + 4));
  const doorR = doorLip / 2 + 0.5;
  const doorAt: Point = [bEnd - DOOR_LOBE * ks, fb - 4.5];
  // (wider toward its lobe than the old drain bay: the Veil's whole flow runs along it to the lip, and narrower it stood
  // the foot over its sill and the Veil short of its height)
  const trench: Spine = [[kEnd + ks, fb - 0.6, 0.7], [bEnd - 0.5 * ks, fb - 1.6, 1.7], [bEnd - 4 * ks, fb - 2.8, 2.9], [doorAt[0], doorAt[1], r2(doorR)]];
  const cu = kEnd + 6.5 * ks;
  const kettle: Spine = [[cu, fb - 2.2, 1.8], [cu + 2.5 * ks, fb - 2.8, 1.8]];
  const inletPath: Point[] = [[kEnd + 1.6 * ks, fb - 0.7], [cu - 1.4 * ks, fb - 2.1]];


  const shoreV = foot(gu) - SLOT_BENCH;
  const footV = backFoot(gu) + 3;
  const benchAim = BENCH_OVER * Math.max(BENCH_FLOOR[spec.settings.start.area], WALK_READ);
  // (the Low River leaves over the lake's own wide sill, sized by the valley's flow as the lake stair's lowest sill
  // over its gorge: round 8's 14; its end of the lake as wide as the lip)
  // (with every brook the valley has: more of them on a larger map)
  const brooks = 3 + Math.round(3 * (N / 128 - 1));
  const valleyFlow = flow * (1 + (brooks * (BROOK_SPRING[0] + BROOK_SPRING[1])) / 2 / GATE_FLOW.normal);
  const lowLip = Math.max(10, Math.min(MAX_SILL_WIDTH, sillWidthFor(valleyFlow) + 2));
  // ---- the valley's lake at its low end, away from the bench: one broad body with a shore, its width varying two-fold
  // and more (a wide lobe, a narrows, the Low River's end), the Gate leaving its shore, the Low River its far end
  const uE = spurU - SPUR_HALF - 8;
  const uL = lu1 + DOOR_LOBE + 12 + rng.range(0, 4);
  if (uE - uL < 6) return { why: "lake span" };
  if (gu < uL - 8) return { why: "gate before the lake" };
  const m = N / 128;
  const rWide = rng.range(LAKE_SHAPE.wide[0], LAKE_SHAPE.wide[1]) * (0.6 + 0.4 * m);
  const rNeck = Math.max(2.8, rWide / 2 - rng.range(0, 0.6));
  // (its near end at a reach of the plunge pool that does not grow with the map: the brook falls one level whatever the
  // side, and on a larger map led further it backed the pool up over the start's bench)
  const lakeTopV = Math.min(foot(gu) - SLOT_BENCH - 1, fb - LAKE_SHAPE.offBench);
  const lakeLow = UNDER_LAKE * N;
  const cv = Math.min(lakeTopV - rWide, Math.max(lakeLow + rWide + 3, (lakeTopV + lakeLow) / 2));
  if (cv - rWide < lakeLow - 1 || cv + rWide > lakeTopV + 0.5) return { why: "lake room" };
  // (planning's verdict of 2026-11-14, a lake pools in the valley's low ground, it does not lie along the wall: its
  // head, a small lobe, stays in reach of the plunge pool's brook; from there it falls across the valley, `LAKE_SHAPE.
  // across` of its run along the range where the valley has the room over the brooks' country (`LAKE_SHAPE.brooks` of
  // the side), bowed, through a narrows to its wide lobe, a second narrows and the Low River's end)
  const rHead = rng.range(4.5, 6) * (0.75 + 0.25 * m);
  // (three tiles and more past the plunge pool's reach and under the bench's rows: nearer, its brook had no room for its Steps)
  const v0 = lakeTopV - rHead - rng.range(1, 4);
  // (its end a round pool `LAKE_SHAPE.endPool` times as wide as the Low River's lip, the lip a tile past it where it
  // was: as wide as its lip, the lake's last rows and the lip's square approach lay as one straight even reach of 170
  // to 250 tiles, a plan in four at 256²)
  const rEnd = LAKE_SHAPE.endPool * (lowLip / 2 + 0.5);
  const uEnd = uE + lowLip / 2 + 0.5 - rEnd;
  const lowest = lakeLow + rEnd + 0.5;
  const fallAcross = rng.range(LAKE_SHAPE.across[0], LAKE_SHAPE.across[1]) * (uE - uL);
  let vEnd = Math.max(lowest + LAKE_SHAPE.brooks * N, Math.min(lakeTopV - rEnd, cv, v0 - fallAcross));
  // (where the valley is short along the range, as far down it as the lake's least length asks)
  if (hypot(uE - uL, v0 - vEnd) < LAKE_SHAPE.least) vEnd = Math.max(lowest, v0 - sqrt(Math.max(0, (LAKE_SHAPE.least + 0.5) * (LAKE_SHAPE.least + 0.5) - (uE - uL) * (uE - uL))));
  if (hypot(uE - uL, v0 - vEnd) < LAKE_SHAPE.least) return { why: "lake span" };
  const fw = rng.range(0.4, 0.62);
  const bow = -rng.range(LAKE_SHAPE.sag[0], LAKE_SHAPE.sag[1]) * hypot(uE - uL, v0 - vEnd);
  const lobes: [number, number][] = [[0, rHead], [fw * rng.range(0.45, 0.6), Math.max(2.8, rHead * rng.range(0.5, 0.65))], [fw, rWide * rng.range(1, 1.2)], [fw + (1 - fw) * rng.range(0.45, 0.6), rNeck]];
  const main: Spine = [];
  {
    const [du, dv] = [uE - uL - lowLip / 4, vEnd - v0];
    const dl = hypot(du, dv);
    // (and its middle `LAKE_BEND.off` of its length off the line, on the side it sags to, every lobe on the one arc: bowed
    // alone, a long arm swung so gently its shore ran straight, 256² seed 5; its middle alone off the line, the half
    // past it lay straight, 62 tiles)
    const midR = Math.max(LAKE_WANDER.least, ((rHead + rWide) / 2) * rng.range(0.7, 0.9));
    const withMid = [...lobes.map(([f, r]) => ({ f, r })), { f: 0.5, r: midR }].sort((a, b) => a.f - b.f);
    const sag = Math.sign(bow || -1) * Math.max(Math.abs(bow), LAKE_BEND.off * dl);
    for (const { f, r } of withMid) {
      const off = sag * sin(Math.PI * f);
      const u = uL + du * f - (dv / dl) * off + (f ? rng.range(-1.5, 1.5) : 3);
      const v = v0 + dv * f + (du / dl) * off + (f ? rng.range(-2, 2) * m : 0);
      // (held under the bench or over the valley's low edge, back from the line by `LAKE_BEND.back` drawn)
      const back = rng.range(0, LAKE_BEND.back);
      main.push([r2(u), r2(Math.max(lakeLow + 1 + r + back, Math.min(lakeTopV - r - back, v))), r2(r)]);
    }
  }
  // (a last narrows before its end's pool, `LAKE_SHAPE.throat` of the pool's radius back from its middle and `throatR`
  // of it wide)
  {
    const a = main[main.length - 1];
    const [du, dv] = [uEnd - a[0], vEnd - a[1]];
    const dl = hypot(du, dv);
    const back = rng.range(LAKE_SHAPE.throat[0], LAKE_SHAPE.throat[1]) * rEnd;
    const off = (rng.float() < 0.5 ? -1 : 1) * rng.range(0.15, 0.3) * rEnd;
    const rr = Math.max(LAKE_WANDER.least, rEnd * rng.range(LAKE_SHAPE.throatR[0], LAKE_SHAPE.throatR[1]));
    if (dl > back + 3) main.push([r2(uEnd - (du / dl) * back - (dv / dl) * off), r2(Math.min(lakeTopV - rr, vEnd - (dv / dl) * back + (du / dl) * off)), r2(rr)]);
  }
  main.push([r2(uEnd), r2(vEnd), r2(rEnd)]);
  // (its shore wanders between the lobes: a point every `LAKE_WANDER.every` tiles, off the line by turns and its width
  // drawn afresh; between three lobes alone the arm lay as a straight even channel 300 tiles of water long at 256²)
  {
    const out: Spine = [main[0]];
    let side = rng.float() < 0.5 ? -1 : 1;
    for (let k = 0; k + 1 < main.length; k++) {
      const [a, b] = [main[k], main[k + 1]];
      const len = hypot(b[0] - a[0], b[1] - a[1]);
      const by = Math.max(1, (a[2] + b[2]) / 2 / LAKE_WANDER.wide);
      const n = Math.floor(len / (LAKE_WANDER.every * by));
      for (let j = 1; j < n; j++) {
        const f = j / n;
        const off = side * by * rng.range(LAKE_WANDER.off[0], LAKE_WANDER.off[1]);
        side = -side;
        const rr = (a[2] + (b[2] - a[2]) * f) * (1 + rng.range(LAKE_WANDER.width[0], LAKE_WANDER.width[1]));
        const pu = a[0] + (b[0] - a[0]) * f - ((b[1] - a[1]) / len) * off;
        const pv = a[1] + (b[1] - a[1]) * f + ((b[0] - a[0]) / len) * off;
        out.push([r2(pu), r2(Math.min(lakeTopV - rr - rng.range(0, LAKE_BEND.back), pv)), r2(Math.max(LAKE_WANDER.least, rr))]);
      }
      out.push(b);
    }
    main.splice(0, main.length, ...out);
  }
  const mv = cv;
  // (the Gate leaves the lake's shore nearest it, and winds across the bench to the range: where the lake's main arm
  // lies `LAKE_SHAPE.bay` tiles or more under the bench there, a bay of the lake runs up to the Gate, tapered and bent)
  let gs: Spine[number] = main[0];
  let gateBay: Spine | null = null;
  {
    const rTip = rng.range(3, 4);
    const lean = (rng.float() < 0.5 ? -1 : 1) * rng.range(0.22, 0.4);
    const tipV = lakeTopV - rTip;
    let base = main[0];
    for (const p of main.slice(0, -1)) if (hypot(p[0] - gu, p[1] - tipV) - p[2] < hypot(base[0] - gu, base[1] - tipV) - base[2]) base = p;
    const up = tipV - base[1];
    if (up - base[2] >= LAKE_SHAPE.bay) {
      const tipU = Math.max(base[0] - 0.7 * up, Math.min(base[0] + 0.7 * up, gu));
      const rb = Math.min(base[2], 5.5);
      // (bowed to one side, and along it a narrows and a pool by turns, each off its line the other way, one every
      // `LAKE_SHAPE.bayEvery` tiles of its length, two at the least: bent once and tapered evenly, a long bay lay as a
      // straight even reach of 100 to 220 tiles at 256², a canal up to the Gate)
      const n = Math.max(2, Math.round(up / LAKE_SHAPE.bayEvery));
      let alt = rng.float() < 0.5 ? -1 : 1;
      gateBay = [[base[0], base[1], r2(rb)]];
      for (let j = 1; j <= n; j++) {
        const f = (j + rng.range(-0.2, 0.2)) / (n + 1);
        const narrows = j % 2 === 1;
        const rr = Math.max(LAKE_WANDER.least, (rb + (rTip - rb) * f) * (narrows ? rng.range(0.58, 0.72) : rng.range(1.1, 1.35)));
        gateBay.push([r2(base[0] + (tipU - base[0]) * f + lean * up * sin(Math.PI * f) + alt * rng.range(1.5, 3)), r2(Math.min(lakeTopV - rr, base[1] + (tipV - base[1]) * f)), r2(rr)]);
        alt = -alt;
      }
      gateBay.push([r2(tipU), r2(tipV), r2(rTip)]);
      gs = gateBay[gateBay.length - 2];
    } else for (const p of main) if (Math.abs(p[0] - gu) < Math.abs(gs[0] - gu)) gs = p;
  }
  const gate0u = Math.max(gs[0] - gs[2] + 2, Math.min(gs[0] + gs[2] - 2, gu));
  // (its shore where the gorge leaves it: the arm's edge at the gorge's u, the capsules between the lobes included;
  // from the nearest lobe's own edge, the gorge started inside the arm between two lobes, the commonest plan refused)
  let gShore = gs[1] + gs[2] + 0.5;
  for (const arm of gateBay ? [main, gateBay] : [main])
    for (let k = 0; k + 1 < arm.length; k++)
      for (let f = 0; f <= 1; f += 0.05) {
        const pu = arm[k][0] + (arm[k + 1][0] - arm[k][0]) * f;
        const pv = arm[k][1] + (arm[k + 1][1] - arm[k][1]) * f;
        const pr = arm[k][2] + (arm[k + 1][2] - arm[k][2]) * f;
        const du = Math.abs(pu - gate0u);
        if (du < pr) gShore = Math.max(gShore, pv + sqrt(pr * pr - du * du) + 0.5);
      }
  const lakeArms: Spine[] = gateBay ? [main, gateBay] : [main];
  // ---- the frame: the start in the Veil's lap, the lip whole in the first frame
  const z = D + 1;
  const orientation = ORIENTATIONS[T.k];
  const lipMap: [Point, Point] = [tileOnMap(T, [lu0, fb]), tileOnMap(T, [lu1, fb])];
  let start: { x: number; y: number } | null = null;
  let bestU = Infinity;
  let lipAhead = 0;
  // (the start's tile is its corner, so its 5 × 5 reaches toward the lip or away from it by the camera's turn: from
  // fb − 6 and fb − 7 alone, every layout turned Cw180 stood the lip past the frame's top edge, a quarter of all tries)
  // (the farthest row that frames the lip first, rows 6 and 7 off the face as before: nearer, the plunge pool reached the
  // start's 5 × 5)
  for (let sv0 = fb - 7; sv0 <= fb - 3 && !start; sv0++)
    for (let su = lu0 + 1; su <= lu1 - 4; su++) {
      const [x, y] = tileOnMap(T, [su, sv0]);
      const fr = lipInFrame({ x, y, z, orientation }, lipMap, poolSill, D + 0.3);
      if (frameReason(fr)) continue;
      const mid = Math.abs(fr.ends[0].u + fr.ends[1].u);
      if (mid < bestU) {
        bestU = mid;
        start = { x, y };
        lipAhead = r2((fr.ahead[0] + fr.ahead[1]) / 2);
      }
    }
  if (!start) return { why: "frame" };

  // ---- the basin: a depression past the range, its pan low on the Gate's side of the middle, the old lake's shore round
  // it; the beds leave by one outlet on the far edge near it
  // (the playa: half as deep as the basin's room past the range, `BASIN.long` of the side along it, its old shorelines
  // `BASIN.shore` tiles each)
  const playa = N * rng.range(BASIN.long[0], BASIN.long[1]);
  const panU = Math.max(playa * 0.7, Math.min(N - playa * 0.7, N * (0.5 + rng.range(-0.08, 0.08))));
  const room = N - backFoot(panU);
  const panR = room * rng.range(BASIN.deep[0], BASIN.deep[1]);
  const panV = backFoot(panU) + room * rng.range(0.47, 0.55);
  const shore = rng.range(BASIN.shore[0], BASIN.shore[1]) * (0.75 + (0.25 * N) / 128);
  if (room < BASIN.room) return { why: "basin room" };
  const notchU = Math.round(Math.max(pu + 24, Math.min(N - 16, panU + N * rng.range(-0.08, 0.08))));
  // (the gorge may leave the range past the pan's middle, where the range has fallen back: the Gate Bed then runs along
  // the range's back foot into the pan)
  if (notchU - 6 <= pu + 8 || panV + 0.6 * panR <= footV + 3) return { why: "notch" };
  // (a bed's run between two points, winding: a point every `leg` tiles, each off the straight line by up to `wob`)
  const wind = (from: Point, to: Point, leg: number, wob: number): Point[] => {
    const L = dist(from, to);
    const m = Math.max(1, Math.round(L / leg));
    const out: Point[] = [];
    for (let i = 1; i < m; i++) {
      const f = i / m;
      const o = rng.range(-wob, wob);
      out.push([from[0] + (to[0] - from[0]) * f - ((to[1] - from[1]) / L) * o, from[1] + (to[1] - from[1]) * f + ((to[0] - from[0]) / L) * o]);
    }
    out.push(to);
    return out;
  };

  // (corners cut twice, the ends kept: a bed bends, never turns a corner)
  const smooth = (p: Point[]): Point[] => {
    let q = p;
    for (let round = 0; round < 2; round++) {
      const o: Point[] = [q[0]];
      for (let k = 0; k + 1 < q.length; k++) {
        const [a, b] = [q[k], q[k + 1]];
        if (k > 0) o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
        if (k + 2 < q.length) o.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      o.push(q[q.length - 1]);
      q = o;
    }
    return q;
  };

  // (a path again with a point every `every` tiles at most, its ends kept: a width and a bed at each; rounded, the
  // points stood a little over `every` apart and three of one width ran over `BROOK.run`'s most)
  const resample = (p: Point[], every: number): Point[] => {
    const L = pathLength(p);
    const n = Math.max(1, Math.ceil(L / every - 1e-9));
    const out: Point[] = [p[0]];
    for (let i = 1; i < n; i++) out.push(pointAt(p, (L * i) / n).p);
    out.push(p[p.length - 1]);
    return out;
  };
  // (a brook's half width at each point: a whole width in `wide` held for a run of `BROOK.run` tiles, then another;
  // the first `head` points at `headHalf`, and the first width past them never `not`)
  const halvesAlong = (p: Point[], wide: readonly [number, number], headHalf: number, head = 1, not = Math.round(2 * headHalf)): number[] => {
    const out: number[] = [];
    let w = not;
    let until = -Infinity;
    let began = 0;
    let s = 0;
    for (let k = 0; k < p.length; k++) {
      if (k > 0) s += dist(p[k - 1], p[k]);
      if (k < head) {
        out.push(headHalf);
        continue;
      }
      // (a fresh width at its run's end, or before the next point would carry this one past `BROOK.run`'s most)
      const next = k + 1 < p.length ? dist(p[k], p[k + 1]) : 0;
      if (s >= until || s + next - began > BROOK.run[1]) {
        const choices: number[] = [];
        for (let x = wide[0]; x <= wide[1]; x++) if (x !== w) choices.push(x);
        w = choices[rng.int(0, choices.length)];
        until = s + rng.range(BROOK.run[0], BROOK.run[1]);
        began = s;
      }
      out.push(w / 2);
    }
    return out;
  };

  // ---- the leat: from the cleft along the crest to the Pass, then the Pass Bed down to the pan's side and the outlet
  const leat: Point[] = [[lm - 2.5 - CLEFT.r + 1, fb + CLEFT.back]];
  for (let u = lm - 2.5 - CLEFT.r - 4; u > pu + 3; u -= 5) leat.push([u, vAt(u)]);
  leat.push([pu, vAt(pu)]);
  const passAt = leat.length - 1;
  const passFoot: Point = [pu + rng.range(-2, 2), backFoot(pu) + 3];
  const passPan: Point = [panU - 0.9 * panR, panV + rng.range(-2, 2)];
  leat.push(...smooth([passFoot, ...wind(passFoot, passPan, 10, (6 * N) / 128), ...wind(passPan, [notchU - 2, N], 10, (3 * N) / 128)]).slice(0, -1), [notchU - 2, N]);

  // ---- the Gate's path: the gorge winding through the range at the gap, then the Gate Bed through the pan to the outlet
  let ju = 0;
  const jog = () => (ju = Math.max(-5, Math.min(5, ju + rng.range(-3, 3))));
  // (straight for its bar and rows, then winding across the bench to the range's foot)
  const gate: Point[] = [[gate0u, gShore - 0.5], [gate0u, gShore + BAR_LENGTH + 4]];
  const benchLegs = Math.max(1, Math.round((foot(gu) - 1 - (gShore + BAR_LENGTH + 4)) / 3));
  // (swinging side to side across the bench too, as through the range)
  const benchSwing = rng.float() < 0.5 ? -1 : 1;
  for (let i = 1; i <= benchLegs; i++) gate.push([gate0u + ((gu - gate0u) * i) / benchLegs + (i % 2 ? benchSwing : -benchSwing) * rng.range(GORGE_WANDER[0], GORGE_WANDER[1]), gShore + BAR_LENGTH + 4 + ((foot(gu) - 1 - (gShore + BAR_LENGTH + 4)) * i) / benchLegs]);
  const gr = rangeAt(R0, gu);
  // (a point every three tiles or so across the range, swinging from side to side of its line by `GORGE_WANDER` tiles,
  // so it is two or more off its line in every eight (planning's ruling of 2026-11-14): a random walk ran straight for
  // fifteen tiles and stood one sheer face along it)
  const across = Math.max(3, Math.round((footV - (gr.v - gr.front / 2)) / 3));
  let swing = rng.float() < 0.5 ? -1 : 1;
  // (and bowed, a water gap's one broad bend through the range: `GORGE_BOW` tiles to one side at its middle)
  const bowBy = (rng.float() < 0.5 ? -1 : 1) * rng.range(GORGE_BOW[0], GORGE_BOW[1]) * (0.75 + (0.25 * N) / 128);
  for (let i = 0; i <= across; i++) {
    gate.push([gu + bowBy * sin((Math.PI * i) / across) + (i === 0 ? jog() : swing * rng.range(GORGE_WANDER[0], GORGE_WANDER[1])), gr.v - gr.front / 2 + ((footV - (gr.v - gr.front / 2)) * i) / across]);
    swing = -swing;
  }
  const slotTo = gate.length - 1;
  const inPan: Point = [panU + 0.3 * panR, panV - 0.4 * panR];
  const outPan: Point = [panU + 0.4 * panR + rng.range(-1, 1), panV + 0.6 * panR];
  gate.push(...smooth([gate[slotTo], ...wind(gate[slotTo], inPan, 10, (6 * N) / 128), ...wind(inPan, outPan, 10, 2), ...wind(outPan, [notchU + 1.5, N], 10, (3 * N) / 128)]).slice(1, -1), [notchU + 1.5, N]);

  // ---- the Low River, through the spur to the edge
  const lowEnd = lowSide === "pass" ? main[0] : main[main.length - 1];
  const out = lowSide === "pass" ? -1 : 1;
  const lowV = lowEnd[1] + rng.range(-3, 3);
  const lipAt: Point = [lowEnd[0] + out * (lowEnd[2] + 1), lowEnd[1]];
  const low: Point[] = [
    lipAt,
    [lowEnd[0] + out * (lowEnd[2] + 4), lowEnd[1]],
    [spurU, lowV],
    [lowSide === "pass" ? 0 : N, lowV + rng.range(-3, 3)],
  ];
  // (the spur runs from the range's foot to past the Low River by 14 rows: a lake stood off the range for the start's
  // bench left the gorge near the spur's end, and the valley at the megadam's water walked round it; and to 0.16 of the
  // side at least: to a quarter, the valley at the megadam's water walked round its end on 3 to 5 of 12 maps at 256²)
  const spurEnd = Math.max(6, Math.min(Math.round(0.16 * N), Math.round(lowV - 14)));
  const spurTop = foot(spurU);
  const spurPath: Point[] = [[spurU, spurTop], [spurU + rng.range(-3, 3), (spurTop + spurEnd) / 2], [spurU + rng.range(-3, 3), spurEnd]];

  // ---- the plunge pool's brook: from its lobe down the valley to the lake's near end, wandering, away from the bench
  // (its lip three tiles off its lobe's middle, toward the valley: on the lobe's line, the lobe, its lip and the brook's
  // head lay as one straight even reach of 120 to 140 tiles of water under the Veil)
  const doorLipAt: Point = [doorAt[0] - ks * (doorR + 1), doorAt[1] - 3];
  // (it runs on along the range's foot away from the bench before it turns down the valley: down at once, it ran beside
  // the bench and ringed it with the pool)
  const outFrom: Point = [Math.min(doorLipAt[0] - ks * OUTFLOW_AWAY, main[0][0] - main[0][2]), doorAt[1] - 1];
  // (into the lake's near lobe on the side it comes from, a tile inside its shore; it falls down the valley, never back
  // toward the bench)
  const od = dist(outFrom, [main[0][0], main[0][1]]);
  const outTo: Point = [main[0][0] + ((outFrom[0] - main[0][0]) / od) * (main[0][2] - 1), main[0][1] + ((outFrom[1] - main[0][1]) / od) * (main[0][2] - 1)];
  if (outTo[0] < outFrom[0] - 2 || outFrom[1] - outTo[1] < 4 || dist(outFrom, outTo) < 6) return { why: "outflow room" };
  const outflow: Point[] = resample([doorLipAt, ...smooth([[doorLipAt[0] - ks * 3, doorLipAt[1]], outFrom, ...wind(outFrom, outTo, 9, 4)])], BROOK.every);
  // its two steps (planning's ruling of 2026-11-12): over the plunge pool's low lip into its upper reach a level under
  // it, along to the Steps, a small pool across the brook, and over its lip, a short cascade, into its lower reach at
  // the lake's level. (Each step a lip as wide as its flow asks, as the lake stair's: a step in a brook's own bed under
  // the Veil's whole flow stood its water over the step, and a fall planned two dropped one)
  const outLen = pathLength(outflow);
  const stepLip = Math.max(8, Math.min(MAX_SILL_WIDTH, sillWidthFor(flowOf(spec))));
  const stepsFrom = STEPS.r + STEPS.reach;
  const stepsTo = outLen - STEPS.r - 1 - STEPS.reach;
  if (stepsTo < stepsFrom) return { why: "steps room" };
  // (clear of the plunge pool by `BODY_GAP` and a tile: the drawn place first, then on down the brook until it is)
  const gapToDoor = (c: number): number => {
    const { p, dir } = pointAt(outflow, c);
    const n: Point = [-dir[1], dir[0]];
    let least = Infinity;
    for (let q = -1; q <= 1; q += 0.25) {
      const sp: Point = [p[0] + n[0] * q * (stepLip / 2 - STEPS.r), p[1] + n[1] * q * (stepLip / 2 - STEPS.r)];
      for (let k = 0; k + 1 < trench.length; k++)
        for (let f = 0; f <= 1; f += 0.25) {
          const a = trench[k];
          const b = trench[k + 1];
          const tp: Point = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
          least = Math.min(least, dist(sp, tp) - (a[2] + (b[2] - a[2]) * f) - STEPS.r);
        }
    }
    return least;
  };
  let cascadeAt = stepsFrom + (stepsTo - stepsFrom) * rng.range(BROOK.cascade[0], BROOK.cascade[1]);
  while (cascadeAt <= stepsTo && gapToDoor(cascadeAt) < STEPS.clear) cascadeAt += 1;
  if (cascadeAt > stepsTo) return { why: "cascade room" };
  const along = (k: number) => pathLength(outflow.slice(0, k + 1));
  const { p: stepsAt, dir: sd } = pointAt(outflow, cascadeAt);
  const sn: Point = [-sd[1], sd[0]];
  const stepsAcross = stepLip / 2 - STEPS.r;
  const stepsSpine: Spine = [
    [r2(stepsAt[0] + sn[0] * stepsAcross), r2(stepsAt[1] + sn[1] * stepsAcross), STEPS.r],
    [r2(stepsAt[0] - sn[0] * stepsAcross), r2(stepsAt[1] - sn[1] * stepsAcross), STEPS.r],
  ];
  const stepsLipAt: Point = [stepsAt[0] + sd[0] * (STEPS.r + 1), stepsAt[1] + sd[1] * (STEPS.r + 1)];
  const upperK = outflow.map((_, k) => k).filter((k) => along(k) < cascadeAt - STEPS.r - 1);
  const lowerK = outflow.map((_, k) => k).filter((k) => along(k) > cascadeAt + STEPS.r + 2);
  const upper: Point[] = [...upperK.map((k) => outflow[k]), [stepsAt[0] - sd[0] * (STEPS.r - 1), stepsAt[1] - sd[1] * (STEPS.r - 1)]];
  const lower: Point[] = [stepsLipAt, ...lowerK.map((k) => outflow[k])];
  if (upper.length < 2 || lower.length < 2) return { why: "steps reach" };
  // (four wide at the plunge pool's lip; two wide, the Veil's whole flow stood two deep and ran over its banks)
  const upperHalves = halvesAlong(upper, BROOK.stream, OUTFLOW_HALF);
  const lowerHalves = halvesAlong(lower, BROOK.stream, OUTFLOW_HALF);

  // ---- the names and the springs' strengths, drawn before the brooks so the plan is one function of what is laid
  const lakeName = LAKE_NAMES[rng.int(0, LAKE_NAMES.length)];
  const veilName = VEIL_NAMES[rng.int(0, VEIL_NAMES.length)];
  const passName = PASS_NAMES[rng.int(0, PASS_NAMES.length)];
  const kettleName = KETTLE_NAMES[rng.int(0, KETTLE_NAMES.length)];
  const doorName = DOOR_NAMES[rng.int(0, DOOR_NAMES.length)];
  const poolName = POOL_NAMES[rng.int(0, POOL_NAMES.length)];
  // (each brook its own word)
  const word0 = rng.int(0, BROOK_WORDS.length);
  const brookWords = Array.from({ length: brooks }, (_, k) => BROOK_WORDS[(word0 + k) % BROOK_WORDS.length]);
  // (the tree's four springs `BROOK_TREE.spring` of a spring's: the trunk carries all four below its second join, a width
  // wider than a brook's, under a level deep)
  const treeAt = treeOf(brooks);
  const inTree = (k: number) => !!treeAt && [treeAt.trunk, treeAt.high, treeAt.branch, treeAt.twig].includes(k);
  const brookSprings = Array.from({ length: brooks }, (_, k) => r2(((inTree(k) ? BROOK_TREE.spring : 1) * rng.range(BROOK_SPRING[0], BROOK_SPRING[1]) * flow) / GATE_FLOW.normal));
  // (a bed from `hi` at its head down to `lo` at its end, a level at a time, evenly along the path)
  const bedAlong = (path: readonly Point[], hi: number, lo: number, from = 0): number[] => {
    const len = pathLength(path.slice(from));
    let run = 0;
    return path.map((p, k) => {
      if (k <= from) return hi;
      run += dist(path[k - 1], p);
      return k === path.length - 1 ? lo : Math.max(lo, hi - Math.floor(((hi - lo + 0.999) * run) / len));
    });
  };
  // ---- onto the map: the plan with the brooks laid so far
  type Tarn = { spine: Spine; sill: number; path: Point[]; bed: number[]; halves: number[]; joins?: { k: number; at: number } };
  const planOf = (tarns: readonly Tarn[]): GatePlan => {
    const plan = emptyPlan(spec);
    const names = plan.names;
    Object.assign(names, {
      lake: lakeName,
      door: doorName,
      outflow: `${veilName.replace(/^the /, "").replace(/^./, (c) => c.toUpperCase())} Brook`,
      steps: `${veilName.replace(/^the /, "").replace(/^./, (c) => c.toUpperCase())} Steps`,
      cascade: `the cascade at ${veilName.replace(/^the /, "").replace(/^./, (c) => c.toUpperCase())} Steps`,
      pool: poolName,
      kettle: kettleName,
      inlet: `${kettleName}'s inlet`,
      veil: veilName,
      gate: "the Gate",
      leat: "the old leat",
      low: "the Low River",
    });
    const body = (id: string, kind: Body["kind"], sill: number, arms: Spine[], meadow: number, region: string, deep = 1): Body => ({ id, kind, sill, arms: arms.map((a) => spineOnMap(T, a)), meadow, deep, dry: false, region });
    // (the lake's and the cleft's floors by the drought they must last, as the lake stair's: `holdDeep`, its sill no
    // notch, so it keeps most of its water through the difficulty's longest drought; the start's trench stays a level
    // deep, stage 1's bay. The Still Pool and the springs' tarns a level)
    const hold = holdDeep(false, hazardDays(spec.designedFor, "drought"));
    plan.bodies.push(
      body("lake", "lake", S, lakeArms, Math.round(LAKE_SHAPE.meadow * m), "low", Math.min(S - BED_FLOOR, hold)),
      body("door", "lake", D, [trench], meadowOf(spec), "home", Math.min(D - BED_FLOOR, hold)),
      body("pool", "pool", poolSill, [poolSpine], 4, "top"),
      // (a backwater: the plunge pool's water stands in it through its inlet and does not run through it)
      { ...body("kettle", "kettle", D, [kettle], 4, "home"), backwater: true },
      body("steps", "pool", S + 1, [stepsSpine], STEPS.meadow, "low"),
    );
    const strengths = [0.36, 0.33, 0.31].map((f) => r2(f * flow));
    strengths[2] = r2(flow - strengths[0] - strengths[1]);
    const sources: Source[] = strengths.map((s, k) => ({ id: `spring${k + 1}`, at: rp(onMap(T, [lm - 2.5 + 2.5 * k, fb + CLEFT.back])), strength: s, into: "pool" }));
    plan.sources.push(...sources);


    const veilFace = dirOnMap(T, [0, -1]);
    const veilBack = dirOnMap(T, [0, 1]);
    const lipMid: Point = [(lipMap[0][0] + lipMap[1][0]) / 2, (lipMap[0][1] + lipMap[1][1]) / 2];
    // (the Gate's gorge floor two under the sill the whole way through the range, then the Gate Bed falling to the floor)
    const gateBed = [...gate.slice(0, slotTo + 1).map(() => S - 2), ...bedAlong(gate.slice(slotTo), S - 2, BED_FLOOR).slice(1)];
    plan.links.push(
      {
        id: "veil",
        from: "pool",
        to: "door",
        kind: "fall",
        fall: { height: Hv, crest: poolSill, width: w, face: headingOf(veilFace[0], veilFace[1]), lip: lipMap, notch: 0, piers: 0, breach: 0 },
        // (the cleft's mouth: from inside the pool to the lip, the landmark's hanging valley at its shortest, so stage 1
        // lays it as the first frame's landmark, its lip the plan's and its foot a shelf)
        // (it starts at the pool's front: stage 1 leads a channel 2 tiles into its body, so from further in its tiles
        // stood past the range's back)
        path: [rp([lipMid[0] + (CLEFT.back - CLEFT.r - 0.5) * veilBack[0], lipMid[1] + (CLEFT.back - CLEFT.r - 0.5) * veilBack[1]]), rp(lipMid)],
        half: 2,
        bed: [poolSill, poolSill],
        wet: true,
        gates: [],
        rows: [],
      },
      // (the plunge pool leaves over a low lip, a level, into its brook: a brook led straight from the pool, its head a
      // weir three or four wide, stood the pool a level over its sill on the Veil's 9.5, over the start's bench)
      {
        id: "outflow",
        from: "door",
        to: "steps",
        kind: "gorge",
        fall: {
          height: 1,
          crest: D,
          width: doorLip,
          face: headingOf(...dirOnMap(T, [-ks, 0])),
          lip: [rp(onMap(T, [doorLipAt[0], doorLipAt[1] - doorLip / 2])), rp(onMap(T, [doorLipAt[0], doorLipAt[1] + doorLip / 2]))],
          notch: 0,
          piers: 0,
          breach: 0,
        },
        path: pathOnMap(T, upper).map(rp),
        // (the table's depth reads one width: its middle; the raster lays each point's)
        half: (BROOK.stream[0] + BROOK.stream[1]) / 4,
        halves: upperHalves,
        bed: upper.map(() => S + 1),
        wet: true,
        gates: [],
        rows: [],
      },
      // (the Steps leave over their lip, the brook's cascade, a level down into its lower reach on to the lake)
      {
        id: "cascade",
        from: "steps",
        to: "lake",
        kind: "gorge",
        fall: {
          height: 1,
          crest: S + 1,
          width: stepLip,
          face: headingOf(...dirOnMap(T, sd)),
          lip: [rp(onMap(T, [stepsLipAt[0] + (sn[0] * stepLip) / 2, stepsLipAt[1] + (sn[1] * stepLip) / 2])), rp(onMap(T, [stepsLipAt[0] - (sn[0] * stepLip) / 2, stepsLipAt[1] - (sn[1] * stepLip) / 2]))],
          notch: 0,
          piers: 0,
          breach: 0,
        },
        path: pathOnMap(T, lower).map(rp),
        half: (BROOK.stream[0] + BROOK.stream[1]) / 4,
        halves: lowerHalves,
        bed: lower.map(() => S),
        wet: true,
        gates: [],
        rows: [],
      },
      { id: "inlet", from: "door", to: "kettle", kind: "channel", path: pathOnMap(T, inletPath).map(rp), half: 0.5, wet: true, gates: [1], rows: [] },
      {
        id: "gate",
        from: "lake",
        to: "notch",
        kind: "channel",
        path: pathOnMap(T, gate).map(rp),
        half: slotW / 2,
        bed: gateBed,
        wet: false,
        gates: [],
        rows: [BAR_LENGTH + 1, BAR_LENGTH + 3],
      },
      {
        id: "leat",
        from: "pool",
        to: "notch",
        kind: "leat",
        path: pathOnMap(T, leat).map(rp),
        half: 0.5,
        bed: [...bedAlong(leat.slice(0, passAt + 1), poolSill - 1, P - 1), ...bedAlong(leat.slice(passAt), S - 2, BED_FLOOR).slice(1)],
        wet: false,
        gates: [],
        // (its first tile or so is in the cleft: the row 3.5 along leaves the bar its two tiles before it, round 8's)
        rows: [LEAT_ROW],
      },
      {
        id: "low",
        from: "lake",
        to: "lowExit",
        kind: "gorge",
        fall: {
          height: S - BED_FLOOR,
          crest: S,
          width: lowLip,
          face: headingOf(...dirOnMap(T, [out, 0])),
          lip: [rp(onMap(T, [lipAt[0], lipAt[1] - lowLip / 2])), rp(onMap(T, [lipAt[0], lipAt[1] + lowLip / 2]))],
          notch: 0,
          piers: 0,
          breach: 0,
        },
        path: pathOnMap(T, low).map(rp),
        half: gorge / 2,
        bed: low.map(() => BED_FLOOR),
        wet: true,
        gates: [],
        rows: [],
      },
    );
    // the permanent badwater source (D200) in the Low River's gorge past the spur, as the lake stair's in its gorge: its
    // water leaves by the exit and reaches no lake; its niche is stage 2's (`raster/relief.ts` `badwaterNiches`)
    const bw = spec.settings.hazards.badwater;
    if (bw !== "off") plan.sources.push({ id: "badwater", at: rp(pointAt(pathOnMap(T, low), pathLength(low) * 0.75).p), strength: bw === "low" ? 1 : bw === "normal" ? 1.5 : 2.75, into: "low", bad: true });
    tarns.forEach((tn, k) => {
      const id = `tarn${k + 1}`;
      const word = brookWords[k];
      names[id] = `${word} Spring`;
      names[`brook${k + 1}`] = `${word} Brook`;
      plan.bodies.push(body(id, "tarn", tn.sill, [tn.spine], 6, "low"));
      plan.sources.push({ id: `${id}Spring`, at: rp(onMap(T, [tn.spine[0][0], tn.spine[0][1]])), strength: brookSprings[k], into: id });
      plan.links.push({ id: `brook${k + 1}`, from: id, to: "lake", kind: "brook", path: pathOnMap(T, tn.path).map(rp), half: TARN_HALF, halves: tn.halves, bed: tn.bed, wander: 0, wet: true, gates: [], rows: [], ...(tn.joins ? { joins: { link: `brook${tn.joins.k + 1}`, at: r2(tn.joins.at) } } : {}) });
    });
    const exits: Exit[] = [
      { id: "lowExit", edge: edgeOnMap(T, lowSide === "pass" ? "W" : "E"), at: rp(onMap(T, low[low.length - 1])) },
      { id: "notch", edge: edgeOnMap(T, "N"), at: rp(onMap(T, [notchU, N])) },
    ];
    plan.exits.push(...exits);
    plan.edges = { N: "ridge", E: "ridge", S: "ridge", W: "ridge" };
    for (const e of exits) plan.edges[e.edge] = "water leaves";

    // ---- ridges: the range's spine (for the diagram and the readers; the land is shaped from `gate.range`), the spur
    const ridge = (id: string, role: Ridge["role"], path: Point[], top: number, half: number): Ridge => ({ id, role, path: pathOnMap(T, path).map(rp), top, half, drop: 0, ledge: 0, rough: 0.5 });
    plan.ridges.push(ridge("wall", "wall", spineLocal(R).filter((_, k) => k % 2 === 0 || k === n), C, 2.5), ridge("spur", "spur", spurPath, M + 3, SPUR_HALF));

    // ---- the start and its frame
    plan.frame = { start: { x: start.x, y: start.y, z, orientation }, landmark: "veil", lipAhead, bench: Math.round(benchAim) };

    // ---- the ladder (round 8's rungs)
    const at = (p: Point) => rp(onMap(T, p));
    const gives = (f: number, id = ""): [number, number] => [SHARE.has(id) ? 0 : Math.round(f * N), Math.round(2 * f * N)];
    const works: Work[] = [
      { id: "neck", rung: "first", kind: "levee", on: "inlet", at: at([(inletPath[0][0] + inletPath[1][0]) / 2, (inletPath[0][1] + inletPath[1][1]) / 2]), tiles: NECK.levee, needs: [], gives: { green: [0, 0] }, tradeoff: "Before the first badtide: it keeps the pool clean while the trench runs red", region: "home" },
      { id: "gateOpen", rung: "medium", kind: "canal", on: "gate", at: at([gu, gShore + 1]), tiles: slotW * (BAR_LENGTH + 2), needs: [], gives: { green: gives(GIVES.gateOpen) }, tradeoff: "The river splits: the lake keeps less", region: "wet" },
      { id: "gateWhole", rung: "medium", kind: "levee", on: "low", at: at(low[1]), tiles: gorge * 2 + slotW, needs: ["gateOpen"], gives: { green: gives(GIVES.gateWhole, "gateWhole") }, tradeoff: "The lake sinks half a level and the Low River runs dry", region: "wet" },
      { id: "leatOpen", rung: "medium", kind: "leat", on: "leat", at: at(leat[0]), tiles: 3, needs: [], gives: { green: gives(GIVES.leatOpen) }, region: "top" },
      { id: "leatWhole", rung: "large", kind: "leat", on: "leat", at: at(leat[0]), tiles: 2, needs: ["leatOpen"], gives: { green: gives(GIVES.leatWhole, "leatWhole") }, tradeoff: `${veilName[0].toUpperCase()}${veilName.slice(1)} dwindles`, region: "top" },
      { id: "megadam", rung: "large", kind: "megadam", on: "low", at: at([spurU, lowV]), tiles: gorge + slotW, needs: [], gives: { green: [0, 0], reservoir: gives(GIVES.megadam) }, tradeoff: "It floods the lake's low meadows, and the Gate is dammed with it", region: "low" },
    ];
    plan.works.push(...works);

    // ---- regions
    const region = (id: string, role: Region["role"], problem: string, prize: string, dayOne: Region["dayOne"], p: Point): Region => ({ id, role, problem, prize, dayOne, at: at(p) });
    plan.regions.push(
      region("home", "home", "The trench runs red in a badtide", `${kettleName} kept clean, ${veilName} at the door`, "green", [lm, fb - 6]),
      region("low", "low", "The lake leaves by the Low River", "Meadows, wood and the megadam's sea", "green", [main[1][0], mv]),
      region("top", "top", "Far and high, along the crest", `The old leat and ${passName}`, "dry", [pu, vAt(pu)]),
      region("wet", "wet", "Dry until the Gate is opened", "The dry lake's floor", "dry", [(gu + panU) / 2, (footV + panV) / 2]),
      region("dry", "dry", "No water reaches it", "Room, the hills' far view", "dryForGood", [Math.max(8, Math.min(pu, notchU) / 2), N - 10]),
    );

    plan.line = `A mountain range runs across the map, a green valley on your side and a dry lake's basin beyond; the river rises in a cleft of the range, pours over ${veilName} and runs down to ${lakeName} at your door. Carry the water through the Gate or round by ${passName}, and before the first badtide close ${kettleName}'s inlet.`;

    plan.gate = {
      turn: T.k,
      mirror: T.m,
      sill: S,
      drop: Hv,
      crest: C,
      saddle: Gs,
      pass: P,
      megadam: M,
      floor: [BED_FLOOR, S + 1],
      range: R,
      face: fb,
      pan: { at: rp(onMap(T, [panU, panV])), level: BED_FLOOR + 1, r: r2(panR), long: r2(playa), shore: r2(shore) },
      lake: "lake",
      door: "door",
      pool: "pool",
      kettle: "kettle",
      inlet: "inlet",
      veil: "veil",
      gate: "gate",
      leat: "leat",
      low: "low",
      wall: "wall",
      spur: "spur",
      slot: { width: slotW, to: slotTo },
      spurs,
      bar: { level: S + 1, length: BAR_LENGTH },
      leatBar: poolSill + 1,
      passAt,
      passSpan: [rp(onMap(T, [pu - 4, vAt(pu - 4)])), rp(onMap(T, [pu + 4, vAt(pu + 4)]))],
      notch: { at: rp(onMap(T, [notchU, N])), width: NOTCH },
      lowSide,
    };
    return plan;
  };
  // ---- the brooks: springs in the valley's far corners, each brook wandering to the lake's nearest point
  // (more of them on a larger map, spread along the valley's far edge: the valley's green is the brooks' and the lake's,
  // and three brooks on a 256² valley greened a sixth of the map where a quarter is asked)
  const tarnAt: Point[] = [
    [N * 0.12, N * 0.1],
    [N * rng.range(0.42, 0.58), N * 0.07],
    [N * 0.88, N * 0.12],
  ];
  const more = brooks - 3;
  if (more >= 1) tarnAt.push([N * rng.range(0.26, 0.34), N * rng.range(0.08, 0.14)]);
  if (more >= 2) tarnAt.push([N * rng.range(0.05, 0.08), N * rng.range(0.3, 0.38)]);
  if (more >= 3) tarnAt.push([N * rng.range(0.66, 0.74), N * rng.range(0.08, 0.14)]);
  const tarns: Tarn[] = [];
  // what the lake's coves and bays keep clear of: the springs, the brooks, the start's bench and the Low River
  const clear = (p: Point, r: number) =>
    p[1] - r > LAKE_BEND.edge &&
    p[0] - r > LAKE_BEND.edge &&
    p[0] + r < N - LAKE_BEND.edge &&
    p[1] + r < lakeTopV &&
    pathDist(p[0], p[1], outflow).d > r + 4 &&
    tarnAt.every((t) => dist(p, t) > r + 3.2 + 5) &&
    tarns.every((tn) => pathDist(p[0], p[1], tn.path).d > r + 4) &&
    pathDist(p[0], p[1], low).d > r + 5 &&
    // (and off the Gate's gorge: a bay across it was the commonest plan refused, the Gate running through the lake)
    pathDist(p[0], p[1], gate.slice(1)).d > r + slotW / 2 + 3;
  // the lake's coves, before the brooks: coves are where the brooks come in (planning's ruling on the brooks)
  const coves: { spine: Spine; out: Point; at: number }[] = [];
  // (and small coves along its shore, every `LAKE_WANDER.nub` tiles by turns each side, `nubOut` tiles past its edge: a
  // broad arm's shore is the union of its lobes, so points between them changed little, and a 20-wide arm still lay
  // as a straight even reach of 250 to 330 tiles)
  {
    let side = rng.float() < 0.5 ? -1 : 1;
    let run = 0;
    let done = 0;
    const lastAt = [-Infinity, -Infinity, -Infinity];
    // (square to the arm's whole run: square to a wandering point's own segment, a cove ran along the shore)
    const last = main[main.length - 1];
    const armLen = hypot(last[0] - main[0][0], last[1] - main[0][1]);
    const armDir: Point = [(last[0] - main[0][0]) / armLen, (last[1] - main[0][1]) / armLen];
    for (let k = 0; k + 1 < main.length; k++) {
      const [a, b] = [main[k], main[k + 1]];
      const len = hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = LAKE_WANDER.nub - run; t < len; t += LAKE_WANDER.nub) {
        const nubOut = rng.range(LAKE_WANDER.nubOut[0], LAKE_WANDER.nubOut[1]);
        const nr = rng.range(LAKE_WANDER.nubR[0], LAKE_WANDER.nubR[1]);
        // (its side by turns; where that place is not clear, a few tiles either way along)
        const cove = (sd: number, tt: number): Spine | null => {
          const f = Math.max(0, Math.min(1, tt / len));
          const pr = a[2] + (b[2] - a[2]) * f;
          const nu = -armDir[1] * sd;
          const nv = armDir[0] * sd;
          const pu = a[0] + (b[0] - a[0]) * f;
          const pv = a[1] + (b[1] - a[1]) * f;
          // (past the arm's own edge there, the union of its capsules: off the line by the wander, the edge from the
          // line's radius left the coves inside the arm)
          let edge = pr;
          while (edge < pr + 8 && inSpine(main, pu + nu * (edge + 0.25), pv + nv * (edge + 0.25))) edge += 0.25;
          const tip: Point = [pu + nu * (edge + nubOut - nr), pv + nv * (edge + nubOut - nr)];
          // (clear of the springs, the Low River and the Gate as the bays are: deeper, the coves met them, the plans the
          // commonest refused)
          if (tip[1] + nr > lakeTopV - 0.5 || tip[1] - nr < lakeLow - 1 || !clear(tip, nr)) return null;
          return [[r2(pu), r2(pv), r2(Math.min(pr, nr + 1))], [r2(tip[0]), r2(tip[1]), r2(nr)]];
        };
        // (where neither is, the other side, but never within `LAKE_WANDER.apart` of that side's last cove: closer, the
        // coves ran together along one shore into an even one)
        let got: Spine | null = null;
        let sd = side;
        for (const dt of [0, -2, 2, -4, 4]) got ??= cove(side, t + dt);
        if (!got && done + t - lastAt[-side + 1] >= LAKE_WANDER.apart) {
          sd = -side;
          for (const dt of [0, -2, 2, -4, 4]) got ??= cove(-side, t + dt);
        }
        side = -side;
        if (got) {
          lakeArms.push(got);
          const gl = dist([got[0][0], got[0][1]], [got[1][0], got[1][1]]);
          coves.push({ spine: got, out: [(got[1][0] - got[0][0]) / gl, (got[1][1] - got[0][1]) / gl], at: done + t });
          lastAt[sd + 1] = done + t;
        }
      }
      run = (run + len) % LAKE_WANDER.nub;
      done += len;
    }
  }

  // (and a lump on the side of each broad lobe, `LAKE_SHAPE.lump`: a lobe ten tiles and more from its middle to its
  // shore is round enough to lie as a straight even reach by itself, a dozen rows of one width across its middle, 100
  // to 370 tiles of water at 256²; its lump stands `lumpAt` of its radius off its middle, square to the arm there,
  // `lumpR` of its radius wide, on whichever side has the room)
  for (let k = 0; k < main.length; k++) {
    const c = main[k];
    if (c[2] < LAKE_SHAPE.lump || (k > 0 && main[k - 1][2] > c[2]) || (k + 1 < main.length && main[k + 1][2] >= c[2])) continue;
    const [a, b] = [main[Math.max(0, k - 1)], main[Math.min(main.length - 1, k + 1)]];
    const dl = hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t: Point = [(b[0] - a[0]) / dl, (b[1] - a[1]) / dl];
    const rr = Math.max(LAKE_WANDER.least, LAKE_SHAPE.lumpR * c[2]);
    const along = rng.range(-0.2, 0.2) * c[2];
    const first = rng.float() < 0.5 ? -1 : 1;
    for (const sd of [first, -first]) {
      const q: Point = [c[0] + t[0] * along - t[1] * sd * LAKE_SHAPE.lumpAt * c[2], c[1] + t[1] * along + t[0] * sd * LAKE_SHAPE.lumpAt * c[2]];
      if (q[1] + rr > lakeTopV - 0.5 || q[1] - rr < lakeLow - 1 || !clear(q, rr)) continue;
      lakeArms.push([[r2(c[0] - t[1] * sd * 0.4 * c[2]), r2(c[1] + t[0] * sd * 0.4 * c[2]), r2(Math.min(0.6 * c[2], rr + 1))], [r2(q[0]), r2(q[1]), r2(rr)]]);
      break;
    }
  }

  // the lake's bays: one or two arms off the main arm into the valley, clear of the springs, the start's bench and the
  // Low River (`clear`), before the brooks, which find their way round them
  const want = rng.int(1, 3);
  for (let tries = 0, bays = lakeArms.length; tries < 24 && lakeArms.length < bays + want; tries++) {
    const j = rng.int(0, main.length - 1);
    const base = main[j];
    const dx = rng.range(-2.4, 2.4);
    const dl = sqrt(dx * dx + 1);
    const len = rng.range(7, 14) * (0.75 + 0.25 * m);
    const tip = rng.range(3, 4.5);
    const mid: Point = [base[0] + (dx / dl) * len * 0.55, base[1] - (1 / dl) * len * 0.55];
    const end: Point = [base[0] + (dx / dl) * len, base[1] - (1 / dl) * len];
    if (!clear(mid, (base[2] + tip) / 2 + 0.5) || !clear(end, tip)) continue;
    lakeArms.push([[base[0], base[1], r2(Math.min(base[2], 6))], [r2(mid[0]), r2(mid[1]), r2((Math.min(base[2], 6) + tip) / 2 + 0.5)], [r2(end[0]), r2(end[1]), r2(tip)]]);
  }
  // (what fails before a brook is laid fails here: the range, the frame, the plunge pool's brook, the Gate and the
  // works are the same plan with the brooks or without, and the brooks are most of a layout's time)
  {
    const before = planFailure(spec, planOf([]) as unknown as PremisePlan);
    if (before) return { why: before };
  }
  // (the valley's rises and hollows the brooks find their way through, one ground for all of them)
  const ground = brookGround(N, rng.int(0, 0x7fffffff));
  const places = brookPlaces(N, () => rng.float());
  const radii = tarnAt.map(() => rng.range(2.6, 3.2));
  const sills = tarnAt.map(() => S + rng.int(3, 5));
  // (the tree, with `BROOK_TREE.brooks` brooks or more: the western springs gather in three orders. The side valley's
  // brook is the trunk, the long way along the valley to the lake's head; the far corner's joins it high; the next
  // spring along the far edge joins it lower, and takes the one past it. Each of the four `BROOK_TREE.sill` over the
  // lake's sill: a trunk's bed steps down a level at each join and its tributaries stand over where they meet it)
  const tree = treeAt;
  if (tree) for (const k of [tree.trunk, tree.high, tree.branch, tree.twig]) if (k >= 0) sills[k] = S + BROOK_TREE.sill;
  // (the lake's water, its main arm's with its coves' and bays': under 0 in it)
  // (read a tile at a time from a field laid once, each arm over its own box and `LAKE_FIELD` tiles round it, and again
  // for each mouth's notch: read afresh from every arm, it was most of a plan's time at 256²)
  const lakeField = new Float32Array(N * N).fill(LAKE_FIELD);
  const layArm = (arm: Spine) => {
    const x0 = Math.max(0, Math.floor(Math.min(...arm.map((q) => q[0] - q[2])) - LAKE_FIELD));
    const x1 = Math.min(N - 1, Math.ceil(Math.max(...arm.map((q) => q[0] + q[2])) + LAKE_FIELD));
    const y0 = Math.max(0, Math.floor(Math.min(...arm.map((q) => q[1] - q[2])) - LAKE_FIELD));
    const y1 = Math.min(N - 1, Math.ceil(Math.max(...arm.map((q) => q[1] + q[2])) + LAKE_FIELD));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) lakeField[y * N + x] = Math.min(lakeField[y * N + x], edgeOf(arm, x + 0.5, y + 0.5));
  };
  for (const arm of lakeArms) layArm(arm);
  // (the lake bends, `LAKE_BEND`: a main arm that turns too little anywhere is drawn again, and so is a lake whose shore
  // comes within `edge` tiles of the map's edge)
  if (armBend(main) < LAKE_BEND.least) return { why: "lake straight" };
  for (const arm of lakeArms) for (const [u, v, rr] of arm) if (Math.min(u - rr, v - rr, N - u - rr, N - v - rr) < LAKE_BEND.edge) return { why: "lake edge" };
  // (no canal lake, planning's verdict of 2026-11-14: read here on the layout's own field, a little tighter than
  // `valley.lake` reads the laid water, so a layout it would refuse costs no brooks and no attempt)
  {
    const canal = lakeCanal(lakeShapeOn(N, N, (i) => lakeField[i] < 0, (x, y) => [x, y], Rp), LAKE_SHAPE.tighter);
    if (canal) return { why: "canal lake" };
  }
  const lakeAt = (p: Point): number => {
    const x = Math.floor(p[0]);
    const y = Math.floor(p[1]);
    return x < 0 || y < 0 || x >= N || y >= N ? LAKE_FIELD : lakeField[y * N + x];
  };
  // each brook comes into the lake at a cove's head, never across a cove's mouth (planning's ruling on the brooks: coves
  // are where streams come in), the nearest it can reach, a tile and a half inside the cove's end
  const heads: Point[] = coves.map((c) => [c.spine[1][0] + c.out[0] * (c.spine[1][2] - 1.5), c.spine[1][1] + c.out[1] * (c.spine[1][2] - 1.5)]);
  // (the lake's shore, its main arm's, its bays' and its coves', a tile or two inside it, a place a tile)
  const shoreAll: Point[] = [];
  {
    const xs = lakeArms.flatMap((arm) => arm.map((q) => q[0]));
    const ys = lakeArms.flatMap((arm) => arm.map((q) => q[1]));
    for (let y = Math.floor(Math.min(...ys) - 16); y <= Math.max(...ys) + 16; y++)
      for (let x = Math.floor(Math.min(...xs) - 16); x <= Math.max(...xs) + 16; x++) {
        const q: Point = [x + 0.5, y + 0.5];
        const e = lakeAt(q);
        if (e <= -1 && e >= -2) shoreAll.push(q);
      }
  }
  // (how far each tile stands from the plunge pool's brook, the Low River, the Gate and the brooks laid so far, `PATH_FIELD`
  // tiles out at most, laid once and read a tile at a time: asked afresh of every place and way, they were most of a
  // plan's time at 256²)
  const layPath = (f: Float32Array, path: readonly Point[]) => {
    for (let k = 0; k + 1 < path.length; k++) {
      const [a, b] = [path[k], path[k + 1]];
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - PATH_FIELD));
      const x1 = Math.min(N - 1, Math.ceil(Math.max(a[0], b[0]) + PATH_FIELD));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - PATH_FIELD));
      const y1 = Math.min(N - 1, Math.ceil(Math.max(a[1], b[1]) + PATH_FIELD));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f[y * N + x] = Math.min(f[y * N + x], pathDist(x + 0.5, y + 0.5, [a, b]).d);
    }
  };
  const fieldOf = (path: readonly Point[]): Float32Array => {
    const f = new Float32Array(N * N).fill(PATH_FIELD);
    layPath(f, path);
    return f;
  };
  const fieldAt = (f: Float32Array, p: Point): number => {
    const x = Math.floor(p[0]);
    const y = Math.floor(p[1]);
    return x < 0 || y < 0 || x >= N || y >= N ? PATH_FIELD : f[y * N + x];
  };
  const nearOut = fieldOf(outflow);
  const nearLow = fieldOf(low);
  const nearGate = fieldOf(gate);
  const nearBrooks = new Float32Array(N * N).fill(PATH_FIELD);
  // (nearest the lake first: a far spring's brook, laid first, passed in front of a nearer spring)
  const byLake = tarnAt.map((t, k) => ({ k, d: edgeOf(main, t[0], t[1]) })).sort((x, y) => x.d - y.d || x.k - y.k).map((x) => x.k);
  // (the tree's four after the rest, trunk first)
  const treeOrder: number[] = tree ? [tree.trunk, tree.high, tree.branch, tree.twig].filter((k) => k >= 0) : [];
  const laying = [...byLake.filter((k) => !treeOrder.includes(k)), ...treeOrder];
  // (two brooks may share a cove, meeting at its head: a confluence at the water's edge; planning's ruling on room)
  const uses = coves.map(() => 0);
  const laid: Tarn[] = [];
  // (each laid brook's spring, in the order laid)
  const laidAs: number[] = [];
  const wideFromOf = new Map<Tarn, number>();
  for (const tk of laying) {
    const [tu, tv] = tarnAt[tk];
    const r = radii[tk];
    const sill = sills[tk];
    // its course: the cheapest way from its tarn down to a cove's head over the valley's own rises and hollows
    // (`gateBrooks.ts`), never back up the valley's fall, clear of what is laid: which side of the valley, round which
    // rise, to which shore; where no cove's head is in reach, to the nearest shore, its mouth its own small notch
    const others = tarnAt.filter(([x, y]) => x !== tu || y !== tv);
    const reach = BROOK_COVE[0] * edgeOf(main, tu, tv) + BROOK_COVE[1];
    // (a head the lake's water has not swallowed, its way in on dry ground)
    const targets = coves.map((_, c) => c).filter((c) => uses[c] < 2 && dist(heads[c], [tu, tv]) <= reach && lakeAt(heads[c]) > -2.5 && lakeAt([heads[c][0] + coves[c].out[0] * 4, heads[c][1] + coves[c].out[1] * 4]) > 2);
    let apart: number = BROOK_JOIN.belt;
    const near = (p: Point, room: number): boolean =>
      // (off the map's edge by its bed and its banks: a lobe swung to the edge ran its water off the map, no exit there)
      p[0] > BROOK_EDGE &&
      p[1] > BROOK_EDGE &&
      p[0] < N - BROOK_EDGE &&
      p[1] < lakeTopV &&
      // (and a brook's room round every other spring, so a spring laid after it still has its way out)
      others.every(([x, y]) => dist(p, [x, y]) > 3.2 + 4 + BROOK_APART + 3) &&
      fieldAt(nearOut, p) > room + 3 &&
      fieldAt(nearLow, p) > room + 3 &&
      fieldAt(nearGate, p) > slotW / 2 + room + 2;
    // (where it may join a brook laid before it, a confluence (planning's ruling: land drains as a tree, not a comb):
    // any point of that brook's course but within `BROOK_JOIN.clear` tiles of a level its bed drops or of the lake, or
    // so near its head that its bed could not step down `BROOK_JOIN.above` tiles above the join. The two meet at one
    // level, a level under the trunk's bed as it was laid: the trunk steps down above the join, the tributary before
    // its last reach)
    const joinAt = new Map<Point, { j: number; at: number; dir: Point; level: number }>();
    // (in the tree each joins the one it is laid for, on its upper course: `BROOK_TREE.upTo` of the trunk's length)
    const onto = !tree ? -1 : tk === tree.high || tk === tree.branch ? tree.trunk : tk === tree.twig ? tree.branch : -2;
    const upTo = !tree ? 1 : tk === tree.high ? BROOK_TREE.upTo[0] : BROOK_TREE.upTo[1];
    tarns.forEach((tn, j) => {
      if (tree && laidAs[j] !== onto) return;
      // (the beds gather as a tree, planning's verdict of 2026-11-14: a trunk takes `BROOK_JOIN.most` tributaries, a
      // tributary one, a tributary's tributary none; each new join below the trunk's last by its step and its clear
      // run. The water table gives a trunk its depth by reach (`levels.ts` `LinkFlow.reaches`): by one depth for its
      // whole flow, three springs in one bed stood 1.03 deep from its head, 0.67 over a tributary's, and the raster
      // parts waters half a level apart where they meet)
      const has = tarns.filter((t) => t.joins?.k === laidAs[j]);
      const deep = tn.joins ? (laid[tn.joins.k]?.joins ? 2 : 1) : 0;
      if (deep >= 2 || has.length >= (deep ? 1 : BROOK_JOIN.most)) return;
      const below = has.length ? Math.max(...has.map((t) => t.joins!.at)) + BROOK_JOIN.above + BROOK_JOIN.clear : 0;
      const len = pathLength(tn.path);
      const drops: number[] = [];
      let at = 0;
      const ats = tn.path.map((p, k) => (at += k ? dist(tn.path[k - 1], p) : 0));
      // (and only where the trunk below the join, a width wider there, still lies as no straight even reach: five wide,
      // a crossing between two bends along the grid is one at 12 rows, 128² seed 7's 65 tiles)
      // (read once for each laid brook: its course does not change)
      let wideFrom = wideFromOf.get(tn);
      if (wideFrom === undefined) {
        wideFrom = 0;
        for (let k = tn.path.length - 4; k >= 1 && !wideFrom; k--) if (courseReach(tn.path.slice(k), BROOK.valley[1] / 2 + 0.5).tiles > 0) wideFrom = ats[k + 1];
        wideFromOf.set(tn, wideFrom);
      }

      for (let k = 1; k < tn.path.length; k++) if (tn.bed[k] !== tn.bed[k - 1]) drops.push(ats[k]);
      for (let k = 1; k + 1 < tn.path.length; k++) {
        const p = tn.path[k];
        if (ats[k] < Math.max(BROOK_HEAD + BROOK_JOIN.above, wideFrom, below) || ats[k] > Math.min(len - BROOK_JOIN.clear, upTo * len) || lakeAt(p) < BROOK_JOIN.clear) continue;
        // (and never on the trunk's last reach, level with the water it runs to: its bed cannot step down there, and the
        // two flows stood over its banks, a level over the bed, and spread across the flat beside it)
        // (its bed has stepped down once for each join above this one)
        const bedAt = tn.bed[k] - has.length;
        if (drops.some((d) => d > ats[k] - BROOK_JOIN.above - 3 && d < ats[k] + BROOK_JOIN.clear) || bedAt > sill - 1 || bedAt <= tn.bed[tn.bed.length - 1]) continue;
        const dd = dist(tn.path[k - 1], tn.path[k + 1]);
        joinAt.set(p, { j: laidAs[j], at: ats[k], dir: [(tn.path[k + 1][0] - tn.path[k - 1][0]) / dd, (tn.path[k + 1][1] - tn.path[k - 1][1]) / dd], level: bedAt - 1 });
      }
    });
    // (and its way in: places along a line at 45° to the trunk on either side, pointing downstream, 4, 8 and 12 tiles back,
    // where it may come near the trunk)
    const wayIn: Point[] = [];
    const nearJoin = new Float32Array(N * N).fill(PATH_FIELD);
    for (const [p, jn] of joinAt) {
      for (const sd of [-1, 1]) {
        const c = 0.7071;
        const d: Point = [jn.dir[0] * c - sd * jn.dir[1] * c, jn.dir[1] * c + sd * jn.dir[0] * c];
        const line: Point[] = [4, 8, 12].map((t) => [p[0] - d[0] * t, p[1] - d[1] * t]);
        wayIn.push(...line);
        layPath(nearJoin, [p, line[2]]);
      }
    }
    // (clear of the brooks laid before it by a meander's belt, so where two would run within it they join; but at the
    // lake, at a cove's head it may share and where it joins)
    const byOthers = (p: Point, room: number): boolean => lakeAt(p) < 3 || targets.some((c) => dist(p, heads[c]) < BROOK_SHARE) || fieldAt(nearJoin, p) < BROOK_JOIN.near || fieldAt(nearBrooks, p) > room;
    // (read a tile at a time and kept: the way's search asks of each place and each way's middle, and asked afresh it was
    // most of a plan's time at 256²)
    let memo = new Uint8Array(N * N);
    const open = (p: Point): boolean => {
      const x = Math.floor(p[0]);
      const y = Math.floor(p[1]);
      if (x < 0 || y < 0 || x >= N || y >= N) return false;
      const i = y * N + x;
      if (!memo[i]) {
        const q: Point = [x + 0.5, y + 0.5];
        memo[i] = dist(q, [tu, tv]) > r + 1.5 && near(q, 3) && byOthers(q, apart) && lakeAt(q) > 2 ? 1 : 2;
      }
      return memo[i] === 1;
    };
    // (the shore's places a tile or two inside the main arm, off every cove and bay: a brook never crosses a cove's mouth)
    const shore = shoreAll.filter((q) => coves.every((c) => edgeOf(c.spine, q[0], q[1]) > 0.5));
    const passes: { into: (p: Point) => boolean; ends: Point[]; toward: (p: Point) => number }[] = [];
    if (targets.length)
      passes.push({
        into: (p) => targets.some((c) => dist(p, heads[c]) < 0.01),
        // (each head, and a place four tiles out from it, the way in square to the cove's end)
        ends: targets.flatMap((c) => [heads[c], [heads[c][0] + coves[c].out[0] * 4, heads[c][1] + coves[c].out[1] * 4] as Point]),
        toward: (p) => Math.min(...targets.map((c) => dist(p, heads[c]))),
      });
    const onShore = new Set(shore);
    passes.push({ into: (p) => onShore.has(p), ends: shore, toward: lakeAt });
    // (and a join, pointing downstream at `BROOK_JOIN.angle` to the trunk, never square on; into the lake square enough)
    const joins = [...joinAt.keys()];
    for (const pass of passes) {
      const into0 = pass.into;
      pass.into = (p) => into0(p) || joinAt.has(p);
      pass.ends = [...pass.ends, ...joins, ...wayIn];
    }
    // (where the valley has `BROOK_JOIN.gather` brooks or more, a brook tries the laid brooks first, within `reach`
    // times its way to the lake: the beds gather into a tree before they reach the lake)
    if (brooks >= BROOK_JOIN.gather && joins.length) {
      const toJoin = (p: Point) => Math.min(...joins.map((q) => dist(p, q)));
      if (tree || toJoin([tu, tv]) <= BROOK_JOIN.reach * edgeOf(main, tu, tv) + 12) passes.unshift({ into: (p) => joinAt.has(p), ends: [...joins, ...wayIn], toward: toJoin });
    }
    const enters = (from: Point, to: Point): boolean => {
      const L = dist(from, to);
      const jn = joinAt.get(to);
      if (jn) {
        const c = ((to[0] - from[0]) * jn.dir[0] + (to[1] - from[1]) * jn.dir[1]) / L;
        return c >= cos(BROOK_JOIN.angle[1]) && c <= cos(BROOK_JOIN.angle[0]);
      }
      return L >= 3 && lakeAt([to[0] + ((from[0] - to[0]) * 2.5) / L, to[1] + ((from[1] - to[1]) * 2.5) / L]) > 0.5;
    };
    // (a way at a time: to a cove's head, then to the shore, each clear of the laid brooks by a meander's belt, then
    // nearer; each way's channel drawn up to `BROOK_DRAWS` times, until one holds what a brook's must: no straight
    // reach, no curve touching itself, its own spring or another brook, its bends unlike one another. A brook is mended
    // where it fails, never the whole layout drawn again for it)
    let got: { way: Point[]; course: Point[]; along: number[]; drops: number[]; joined?: { j: number; at: number; dir: Point; level: number } } | null = null;
    let whyNot = "way";
    search: for (const pass of passes) {
      if (!pass.ends.length) continue;
      // (its head on its tarn's shore toward the nearest end, and a place three tiles out of the tarn that way)
      let aim = pass.ends[0];
      for (const q of pass.ends) if (dist(q, [tu, tv]) < dist(aim, [tu, tv])) aim = q;
      const ad = dist(aim, [tu, tv]);
      const head: Point = [tu + ((aim[0] - tu) / ad) * (r - 1), tv + ((aim[1] - tv) / ad) * (r - 1)];
      const out: Point = [tu + ((aim[0] - tu) / ad) * (r + 3), tv + ((aim[1] - tv) / ad) * (r + 3)];
      // (its places within `BROOK_BOX` tiles of the box round its spring and its nearest end: searched over the whole
      // valley, the ways were most of a plan's time at 256²)
      const bx = [Math.min(tu, aim[0]) - BROOK_BOX * N, Math.min(tv, aim[1]) - BROOK_BOX * N, Math.max(tu, aim[0]) + BROOK_BOX * N, Math.max(tv, aim[1]) + BROOK_BOX * N];
      const nearby = places.filter((q) => q[0] >= bx[0] && q[1] >= bx[1] && q[0] <= bx[2] && q[1] <= bx[3]);
      for (const ap of [BROOK_JOIN.belt, BROOK_APART]) {
        apart = ap;
        memo = new Uint8Array(N * N);
        const way = brookWay(ground, [...nearby, ...pass.ends, out], head, open, pass.into, pass.toward, lakeAt, enters);
        if (!way || way.length < 3) continue;
        const joined = joinAt.get(way[way.length - 1]);
        // (out of its tarn square to its shore, toward its way's first place, `BROOK_OUT` tiles clear of it before it
        // bends: led off beside its tarn, its bed a level down touched the tarn's water, the two were parted and the
        // tarn stood a level over its sill with no way out, 192² seeds 1 and 2; then its corners cut twice: a brook
        // bends, never turns a corner)
        const wd = dist(way[1], [tu, tv]);
        const od: Point = [(way[1][0] - tu) / wd, (way[1][1] - tv) / wd];
        const courseLine = smooth([
          [tu + od[0] * (r - 1), tv + od[1] * (r - 1)],
          [tu + od[0] * (r + BROOK_OUT), tv + od[1] * (r + BROOK_OUT)],
          ...way.slice(1).filter((q, k, rest) => k === rest.length - 1 || dist(q, [tu, tv]) > r + BROOK_OUT + 1.5),
        ]);
        // (to the lake's sill, or a tributary's to the level it meets its trunk at)
        const lo = joined ? joined.level : S;
        // its channel meanders about its course (`meander`; planning's rulings on the bends: on a flat floor a stream
        // does not follow relief, it meanders by its own flow; at each level its bed drops it steps aside); a tributary
        // comes in straight along its way in, its last `BROOK_JOIN.straight` tiles: bent there, it ran along its trunk
        // before it met it
        for (let d = 0; d < BROOK_DRAWS && !got; d++) {
          const mm = meander(
            courseLine,
            (BROOK.valley[0] + BROOK.valley[1]) / 2,
            () => rng.float(),
            // (the tree's trunk and its branch step down a level above each join they take, two and one: their own drops
            // are the levels left, past `BROOK_TREE.level` of their length. Told all its levels there, the trunk's
            // lower course was drawn as a steep reach, no swing and a step aside at each drop, and where the joins
            // had taken two of its levels it lay 50 tiles straight, 256² seed 2)
            { levels: Math.max(0, sill - 1 - lo - (tree && tk === tree.trunk ? (tree.high >= 0 ? BROOK_JOIN.most : 1) : tree && tk === tree.branch ? 1 : 0)), from: tree && (tk === tree.trunk || tk === tree.branch) ? Math.max(BROOK_HEAD, BROOK_TREE.level * pathLength(courseLine)) : BROOK_HEAD, to: joined ? BROOK_JOIN.clear : 0 },
            (p, u, toEnd) => near(p, 2) && (u < 2 || dist(p, [tu, tv]) > r + Math.min(BROOK_OUT, u - 1) - 0.3) && (toEnd < 5 || lakeAt(p) > 1.5) && (toEnd < BROOK_JOIN.clear || fieldAt(nearBrooks, p) > BROOK_APART + 2),
            joined ? BROOK_JOIN.straight : 2,
            // (a trunk's bends vary, `TRUNK_VARY`: the tree's trunk and its branch, the twig's trunk)
            !!tree && (tk === tree.trunk || tk === tree.branch),
          );
          // (a point every `BROOK.every` tiles at most, four at the least: its bed's first step needs two past the head)
          const { path: course, along } = sampled(mm, BROOK.every);
          // (and a tributary's bed its levels down before its last reach, three tiles or more to a level)
          if (course.length < 4 || (joined && mm.length < BROOK_HEAD + BROOK_JOIN.clear + 3 * (sill - 1 - lo))) {
            whyNot = "short";
            break;
          }
          // (a course that lies as a straight even reach, read three and four wide, is no brook's)
          if (courseReach(course, 1.5).tiles > 0 || courseReach(course, 2).tiles > 0) {
            whyNot = "straight";
            continue;
          }
          if (selfGap(mm.path, BROOK_SELF.along) < BROOK_SELF.gap) {
            whyNot = "touches itself";
            continue;
          }
          if (brookLegsWrong(course)) {
            whyNot = "bends alike";
            continue;
          }
          // (its middle off its own spring, and off every laid brook's middle, as the plan's checks read them)
          const cl = pathLength(course);
          const mid = cl > 10 ? subPath(course, 4, cl - 4) : null;
          if (subPath(course, 2, cl - 2).some((q) => dist(q, [tu, tv]) < r + 0.3) || subPath(course, BROOK_OUT + 1, cl - 2).some((q) => dist(q, [tu, tv]) < r + BROOK_OUT - 1.2)) {
            whyNot = "through its spring";
            continue;
          }
          if (mid && tarns.some((tn) => pathLength(tn.path) > 10 && pathGap(mid, subPath(tn.path, 4, pathLength(tn.path) - 4), BROOK_APART) < BROOK_APART)) {
            whyNot = "crosses a brook";
            continue;
          }
          got = { way, course, along, drops: mm.drops, joined };
        }
        if (got) break search;
      }
    }
    if (!got) return { why: `brook ${whyNot}` };
    const { way, course, along, joined } = got;
    const end = way[way.length - 1];
    const cove = coves.findIndex((_, c) => dist(end, heads[c]) < 0.01);
    if (joined) {
      // (it ends on its trunk: the trunk carries both flows below the join)
    } else if (cove >= 0) uses[cove]++;
    else {
      // (its mouth its own small notch in the shore, a tile or two, square to where it comes in)
      const prev = way[way.length - 2];
      const pd = dist(prev, end);
      lakeArms.push([[r2(end[0]), r2(end[1]), 1.2], [r2(end[0] + ((prev[0] - end[0]) / pd) * 1), r2(end[1] + ((prev[1] - end[1]) / pd) * 1), 0.9]]);
      layArm(lakeArms[lakeArms.length - 1]);
    }
    // (its tarn's level to its bed's first step, two points down, then a level lower past each drop along its axis, where
    // its channel steps aside: narrower over the step or under it, the brook stood its tarn 0.4 over the level the
    // table gives)
    const lo = joined ? joined.level : S;
    const bed = course.map((_, k) => (k < 2 ? sill : k === course.length - 1 ? lo : Math.max(lo, sill - 1 - got!.drops.filter((d) => d <= along[k]).length)));
    const halves = halvesAlong(course, BROOK.valley, TARN_HALF, 2, BROOK.valley[0]);
    // (on its last reach, level with the lake's sill, three or four wide: two wide there, its spring's 2.3 stood a level
    // deep, over its banks, and ran out beside it, the stray water of 192² seed 1; the table reads one width)
    const flatFrom = bed.findIndex((b) => b === S);
    if (flatFrom >= 0) {
      // (its first width there unlike the last above it: begun at one fixed width, the two ran on as one past `BROOK.run`)
      const tail = halvesAlong(course.slice(flatFrom), BROOK.mouth, BROOK.mouth[0] / 2, 0, Math.round(2 * halves[Math.max(0, flatFrom - 1)]));
      for (let k = flatFrom; k < course.length; k++) halves[k] = tail[k - flatFrom];
    }
    laid[tk] = { spine: [[tu, tv, r]], sill, path: course, bed, halves, joins: joined ? { k: joined.j, at: joined.at } : undefined };
    laidAs.push(tk);
    tarns.push(laid[tk]);
    layPath(nearBrooks, course);
  }
  // (in the springs' own order again, for their names)
  tarns.splice(0, tarns.length, ...laid);
  // (a trunk a width wider below its first join: it carries the flows of all above it)
  for (const tn of tarns) {
    const into = tarns.filter((t) => t.joins && tarns[t.joins.k] === tn).sort((a, b) => a.joins!.at - b.joins!.at);
    // (and its bed a level lower from `BROOK_JOIN.above` tiles above the join, never under its last reach's: at its own
    // bed the two flows stood over banks a level over it and spread across the flat beside it, the stray water of most
    // confluences. It steps down above the join, and its tributary before its own last reach, so the two meet at one
    // level: stepped down at the join, one stood a level over the other where their beds met, the raster parted them
    // there (`partWaters`) and one was dammed, its tarn a level over its sill or its water out over its banks, 192²
    // seeds 1 and 2)
    const end = tn.bed[tn.bed.length - 1];
    for (const t of into) {
      const at = t.joins!.at;
      let s = 0;
      let first = -1;
      tn.path.forEach((p, k) => {
        if (k) s += dist(tn.path[k - 1], p);
        // (a width wider below its first join only: below a second it carries the tree's weaker springs)
        if (s >= at) {
          if (first < 0) first = k;
          if (t === into[0]) tn.halves[k] += 0.5;
        }
        if (s >= at - BROOK_JOIN.above && k >= 2) tn.bed[k] = Math.max(end, tn.bed[k] - 1);
      });
      // (where the wider reach begins at the width of the reach above it, its widths the other way round: the two ran on
      // as one width past `BROOK.run`)
      if (t === into[0] && first > 2 && tn.halves[first] === tn.halves[first - 1]) {
        const both = (BROOK.valley[0] + BROOK.valley[1]) / 2 + 1;
        for (let k = first; k < tn.halves.length; k++) tn.halves[k] = both - tn.halves[k];
      }
    }
  }
  // (the tree and its room, planning's verdict of 2026-11-14: with `BROOK_TREE.brooks` brooks or more the beds gather in
  // three orders, springs, branches and a trunk; and no two brooks run side by side for more than `run` tiles)
  {
    const order = (tn: Tarn): number => {
      let o = 1;
      for (const t of tarns.filter((q) => q.joins && tarns[q.joins.k] === tn).sort((a, b) => a.joins!.at - b.joins!.at)) {
        const ot = order(t);
        o = ot === o ? o + 1 : Math.max(o, ot);
      }
      return o;
    };
    // (three springs in a chain: the twig joins the branch and the branch the trunk)
    if (tree && Math.max(...tarns.map(order)) < (tree.high >= 0 ? BROOK_TREE.orders : 2)) return { why: "brook tree" };
    if (tree && (laid[tree.twig]?.joins?.k !== tree.branch || laid[tree.branch]?.joins?.k !== tree.trunk)) return { why: "brook tree" };
    for (const a of tarns) for (const b of tarns) if (a !== b && besideRun(a.path, b.path) > BROOK_TREE.run) return { why: "brooks side by side" };
  }
  return { plan: planOf(tarns) };
}

function emptyPlan(spec: MapSpec): GatePlan {
  return {
    premise: GATE_ID,
    seed: spec.seed,
    W: spec.size.x,
    H: spec.size.y,
    top: gateTop(spec),
    sky: spec.settings.terrain.highestTerrain,
    line: "",
    sources: [],
    bodies: [],
    links: [],
    exits: [],
    regions: [],
    ridges: [],
    edges: { N: "ridge", E: "ridge", S: "ridge", W: "ridge" },
    frame: { start: { x: 0, y: 0, z: -1, orientation: "Cw0" }, landmark: "", lipAhead: 0, bench: 0 },
    works: [],
    setPieces: [],
    names: {},
    gate: undefined as unknown as GateNumbers,
  };
}

// ------------------------------------------------------------------------------------------------- the first frame

/** The Veil in the first frame (§5.1 `frame.lip`, its plan half): both lip ends and the foot inside the frame (the
 *  foot allowed 0.1 under its bottom edge), the far end under the top edge's limit, the near end in front of the start.
 *  The lake stair's "square to the look" and "35 to 56 % of the width" do not hold here: the lip runs along the wall,
 *  which runs along the grid, 35° off the look by the camera's own turn, and the round's 9-tile lip spans about a
 *  quarter of the frame. */
function frameReason(fr: ReturnType<typeof lipInFrame>): string | null {
  const a = Math.min(...fr.ahead);
  const b = Math.max(...fr.ahead);
  if (a < 0.5) return `the lip's near end stands ${a.toFixed(2)} tiles in front of the start (0.5 at least)`;
  if (b > fr.limit + 0.05) return `the lip stands ${b.toFixed(2)} tiles in front of the start, past the frame's top edge (${fr.limit.toFixed(2)})`;
  for (const e of fr.ends) if (!(Math.abs(e.u) <= 0.95 && e.v <= 0.98)) return `a lip end falls outside the first frame (u ${e.u.toFixed(2)}, v ${e.v.toFixed(2)})`;
  for (const e of fr.feet) if (!(Math.abs(e.u) <= 0.95 && e.v <= 0.98 && e.v >= -1.1)) return `the fall's foot falls outside the first frame (u ${e.u.toFixed(2)}, v ${e.v.toFixed(2)})`;
  return null;
}

// ------------------------------------------------------------------------------------------------- the invariants

const linkOf = (plan: PremisePlan, id: string): Link | undefined => plan.links.find((l) => l.id === id);
const bodyOf = (plan: PremisePlan, id: string): Body | undefined => plan.bodies.find((b) => b.id === id);
/** The plan's range (local) and its turn. */
const rangeOf = (plan: PremisePlan, g: GateNumbers) => ({ R: g.range, T: turnOf(plan, g) });

/** `gate.levels`: the levels by number. The lake's sill four over the floor; the cleft's springs the Veil's 6 or 7 over
 *  it, the Veil a fall from the pool onto the lake; the range's highest peak 17 to 19, the gap's saddle two over the
 *  megadam's water and the crest's lowest; the Pass (the leat's crossing) two under the pool, over the meadow and under
 *  the peak; the Still Pool at the lake's level; the megadam's water two over the sill; the basin's pan under the sill;
 *  the Gate's bar a level over the sill. */
const gateLevels: Invariant = {
  id: "gate.levels",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const S = g.sill;
    if (S !== LAKE_SILL) return fail(`The lake's sill is ${S}, not ${LAKE_SILL}`);
    const lake = bodyOf(plan, g.lake);
    const door = bodyOf(plan, g.door);
    const pool = bodyOf(plan, g.pool);
    const kettle = bodyOf(plan, g.kettle);
    if (!lake || lake.kind !== "lake" || lake.sill !== S) return fail(`${nameOf(plan, g.lake)} is not a lake on sill ${S}`);
    if (!door || door.sill !== S + DOOR_RISE) return fail(`${nameOf(plan, g.door)} is not ${DOOR_RISE} over the lake's sill`);
    const D = door.sill;
    if (!(VEIL as readonly number[]).includes(g.drop)) return fail(`The fall is ${g.drop} levels (6 or 7)`);
    if (!pool || pool.sill !== D + g.drop) return fail(`${nameOf(plan, g.pool)} is not ${g.drop} over the plunge pool`);
    const veil = linkOf(plan, g.veil);
    if (plan.frame.landmark !== g.veil || !veil?.fall || veil.from !== g.pool || veil.to !== g.door || veil.fall.height !== g.drop || veil.fall.crest !== pool.sill) return fail(`${nameOf(plan, g.veil)} is not the landmark, a fall of ${g.drop} from ${nameOf(plan, g.pool)} into ${nameOf(plan, g.door)}`);
    if (g.crest < CREST[0] || g.crest > CREST[1] || g.crest > (plan.sky ?? plan.top)) return fail(`The range's peak stands at ${g.crest} (${CREST[0]} to ${CREST[1]}, under the highest ground)`);
    if (g.megadam !== S + MEGADAM_RISE) return fail(`The megadam holds ${g.megadam}, not ${S + MEGADAM_RISE}`);
    if (g.saddle !== g.megadam + SADDLE_OVER) return fail(`The gap's saddle stands at ${g.saddle}, not ${SADDLE_OVER} over the megadam's water (${g.megadam + SADDLE_OVER})`);
    if (g.floor[0] < BED_FLOOR || g.floor[1] > S + 1) return fail(`The basin's floor is ${g.floor.join(" to ")} (on the floor, at most the sill + 1)`);
    if (g.pass !== pool.sill - 2 || g.pass <= D + 1 || g.pass >= g.crest) return fail(`The Pass stands at ${g.pass}, not two under the springs (${pool.sill - 2}) between the meadow and the peak`);
    if (!kettle || kettle.sill !== D) return fail(`${nameOf(plan, g.kettle)} is not at the plunge pool's level`);
    if (!(g.pan.level < S) || g.pan.level < BED_FLOOR) return fail(`The basin's pan stands at ${g.pan.level}, not under the lake's sill (${S}) on the floor`);
    if (g.bar.level !== S + 1) return fail(`The Gate's bar stands at ${g.bar.level}, not a level over the sill (${S + 1})`);
    if (g.leatBar !== pool.sill + 1) return fail(`The leat's bar stands at ${g.leatBar}, not two over its bed (${pool.sill + 1})`);
    return OK;
  },
};

/** `range.spine` (§5.1, planning's ruling of 2026-11-11: a mountain range, not a wall): the range runs from edge to
 *  edge along a spine that wanders off the grid (no four samples in a row at one v but at the Veil's buttress), its crest
 *  rising and falling by `CREST_VARIES` levels or more, its highest the peak and its lowest the gap's saddle; the
 *  Veil's lip along its face, 9 to 12 tiles, the cleft's crest over its pool, and the Veil's buttress the range's most
 *  forward foot. */
const rangeSpine: Invariant = {
  id: "range.spine",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const { R, T } = rangeOf(plan, g);
    const n = R.v.length - 1;
    if ([R.crest, R.front, R.back].some((a) => a.length !== n + 1) || n * R.step < plan.W) return fail("The range does not run from edge to edge");
    const veil = linkOf(plan, plan.frame.landmark);
    if (!veil?.fall) return fail("The plan has no fall");
    const ends = veil.fall.lip.map((p) => onLocal(T, [p[0] + 0.5, p[1] + 0.5]));
    const lm = (ends[0][0] + ends[1][0]) / 2;
    for (let k = 0; k + 3 <= n; k++) {
      if (Math.abs(k * R.step - lm) < RANGE.calm + R.step * 3) continue;
      if (R.v[k] === R.v[k + 1] && R.v[k] === R.v[k + 2] && R.v[k] === R.v[k + 3]) return fail(`The range's spine runs straight along the grid from u ${k * R.step}`);
    }
    const hi = Math.max(...R.crest);
    const lo = Math.min(...R.crest);
    if (hi - lo < CREST_VARIES) return fail(`The range's crest varies by ${(hi - lo).toFixed(1)} levels (${CREST_VARIES} or more)`);
    if (Math.abs(hi - g.crest) > 0.01) return fail(`The range's highest crest is ${hi}, not its peak ${g.crest}`);
    if (Math.abs(lo - g.saddle) > 0.01) return fail(`The range's lowest crest is ${lo}, not the gap's saddle ${g.saddle}`);
    if (ends.some((e) => Math.abs(e[1] - 0.5 - g.face) > 0.01)) return fail(`${nameOf(plan, veil.id)}'s lip is not along the Veil's face`);
    const lo0 = Math.min(ends[0][0], ends[1][0]) - 0.5;
    const hi0 = Math.max(ends[0][0], ends[1][0]) + 0.5;
    if (hi0 - lo0 !== veil.fall.width || veil.fall.width < LIP[0] || veil.fall.width > LIP[1]) return fail(`${nameOf(plan, veil.id)}'s lip is ${hi0 - lo0} tiles for a width of ${veil.fall.width} (${LIP.join(" to ")})`);
    if (rangeAt(R, lm).crest < veil.fall.crest + 2) return fail(`The range's crest at ${nameOf(plan, veil.id)} stands at ${rangeAt(R, lm).crest.toFixed(1)}, under its pool + 2 (${veil.fall.crest + 2})`);
    for (let k = 0; k <= n; k++) if (R.v[k] - R.front[k] < g.face - 2 - 0.01) return fail(`The range's foot stands before the Veil's buttress at u ${k * R.step}`);
    return OK;
  },
};

/** `wall.camera`, its plan half (§5.1): the start's turn faces the wall's valley face (its normal within 45° of the
 *  camera's look, against it) and the start stands in the valley, in front of the Veil. */
const wallCamera: Invariant = {
  id: "wall.camera",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const T = turnOf(plan, g);
    const s = plan.frame.start;
    if (s.orientation !== ORIENTATIONS[g.turn]) return fail(`The start faces ${s.orientation}, not the layout's turn (${ORIENTATIONS[g.turn]})`);
    const look = openingCamera(s).look;
    const n = dirOnMap(T, [0, -1]);
    const c = -(look[0] * n[0] + look[1] * n[1]);
    if (c < 0.7071) return fail(`The wall's face is ${((1 - c) * 90).toFixed(0)}° or more off the camera's look (45° at most)`);
    const veil = linkOf(plan, g.veil);
    if (!veil?.fall) return fail("The plan has no fall");
    const lip = veil.fall.lip.map((p) => onLocal(T, [p[0] + 0.5, p[1] + 0.5])[0]);
    const [u, v] = onLocal(T, [s.x + 0.5, s.y + 0.5]);
    if (u < Math.min(...lip) - 2 || u > Math.max(...lip) + 2 || v > g.face - 3) return fail("The start does not stand in the valley in front of the Veil");
    return OK;
  },
};

/** `frame.lip`, the plan half (§5.1: the lake stair's, with the lip along the wall and its foot allowed 0.1 under the
 *  frame): the start on the bench a level over the lake, the Veil's lip and foot inside the first frame. */
const frameLip: Invariant = {
  id: "frame.lip",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    const veil = linkOf(plan, plan.frame.landmark);
    if (!g || !veil?.fall) return fail("The plan has no landmark fall");
    const s = plan.frame.start;
    const D = g.sill + DOOR_RISE;
    if (s.z !== D + 1) return fail(`The start stands on ${s.z}, not one over the plunge pool's sill (${D + 1})`);
    const fr = lipInFrame(s, veil.fall.lip, veil.fall.crest, D + 0.3);
    const why = frameReason(fr);
    if (why) return fail(`In the first frame, ${why}`);
    if (Math.abs(fr.ahead[0] + fr.ahead[1] - 2 * plan.frame.lipAhead) > 0.3) return fail(`The plan says the lip stands ${plan.frame.lipAhead} in front; it stands ${((fr.ahead[0] + fr.ahead[1]) / 2).toFixed(2)}`);
    return OK;
  },
};

/** `gate.gap`, its plan half (§5.1, planning's ruling: the gate is a water gap, a gorge an old river cut where the
 *  range's lowest saddle is): one gorge through the range, 5 to 7 wide, from 8 tiles of bench before the range's foot to
 *  past its back foot, winding, where the crest is lowest; its floor two under the lake's sill the whole way; the bar a
 *  level over the sill at the shore and two rows of Blockages behind it in the gorge. No other water but the leat (on the
 *  crest, over the Pass), the Veil's mouth (the cleft to its lip) and the Still Pool's inlet at the Veil's foot enters
 *  the range. */
const gateGap: Invariant = {
  id: "gate.gap",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const gate = linkOf(plan, g.gate);
    if (!gate?.path || !Array.isArray(gate.bed)) return fail("The plan has no Gate");
    if (gate.from !== g.lake) return fail(`The Gate leaves ${nameOf(plan, gate.from)}, not the lake`);
    if (g.slot.width < SLOT[0] || g.slot.width > SLOT[1] || g.slot.width !== 2 * (gate.half ?? 0)) return fail(`The Gate's gorge is ${2 * (gate.half ?? 0)} wide (${SLOT.join(" to ")})`);
    const { R, T } = rangeOf(plan, g);
    const a = onLocal(T, gate.path[0]);
    const b = onLocal(T, gate.path[g.slot.to]);
    const r0 = rangeAt(R, a[0]);
    if (r0.v - r0.front - a[1] < SLOT_BENCH - 1) return fail(`The Gate's gorge starts ${(r0.v - r0.front - a[1]).toFixed(1)} tiles before the range (${SLOT_BENCH} of bench)`);
    if (sideOf(R, b[0], b[1] - 1) !== 2) return fail("The Gate's gorge stops inside the range");
    // (the gorge crosses the spine where the crest is at its lowest)
    let cross = -1;
    for (let k = 1; k <= g.slot.to; k++) {
      const p = onLocal(T, gate.path[k]);
      if (p[1] >= rangeAt(R, p[0]).v) {
        cross = p[0];
        break;
      }
    }
    if (cross < 0) return fail("The Gate's gorge does not cross the range's spine");
    // (within the gorge's own winding of the saddle's lowest point)
    let low = Infinity;
    for (let du = -6; du <= 6; du += 0.5) low = Math.min(low, rangeAt(R, cross + du).crest);
    if (low > g.saddle + 0.25) return fail(`The Gate crosses the range where its crest stands at ${low.toFixed(1)} at the lowest, not at its lowest saddle (${g.saddle})`);
    let straight = 0;
    for (let k = 2; k <= g.slot.to; k++) if (Math.abs(onLocal(T, gate.path[k])[0] - a[0]) > 0.4) straight++;
    if (!straight) return fail("The Gate's gorge runs straight through the range");
    for (let k = 0; k <= g.slot.to; k++) if (gate.bed[k] > g.sill - 2) return fail(`The Gate's gorge floor stands at ${gate.bed[k]}, over two under the sill (${g.sill - 2})`);
    const slotLen = pathLength(gate.path.slice(0, g.slot.to + 1));
    if (g.bar.length < 1 || g.bar.length > 4) return fail(`The Gate's bar is ${g.bar.length} tiles long`);
    if (gate.rows.length !== 2 || gate.rows.some((s) => s <= g.bar.length || s >= slotLen)) return fail(`The Gate has ${gate.rows.length} rows of Blockages at ${gate.rows.join(", ")} (two, behind its bar, inside the gorge)`);
    for (const l of plan.links) {
      // (the Veil's own mouth, from the cleft to its lip, is the range's)
      if (l.id === g.gate || l.id === g.leat || l.id === g.veil || l.id === g.inlet || !l.path) continue;
      for (const p of l.path) {
        const [u, v] = onLocal(T, p);
        if (sideOf(R, u, v + 0.5) !== 0) return fail(`${nameOf(plan, l.id)} crosses the range`);
      }
    }
    return OK;
  },
};

/** `basin.bowl`, its plan half (§5.1, planning's ruling: a dry lake in a natural depression): the basin's pan past the
 *  range's back foot and inside the map, under the lake's sill, the old lake's shore round it; the Gate Bed through the
 *  pan; the Gate and the leat both leave by the one outlet on the basin's far edge. */
const basinBowl: Invariant = {
  id: "basin.bowl",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const { R, T } = rangeOf(plan, g);
    const N = plan.W;
    const [pu, pv] = onLocal(T, g.pan.at);
    if (sideOf(R, pu, pv - g.pan.r / 2) !== 2) return fail("The basin's pan reaches into the range");
    if (pu - g.pan.long / 2 < 0 || pu + g.pan.long / 2 > N) return fail("The basin's playa runs off the map along the range");
    if (!(g.pan.shore >= 3) || !(g.pan.long > g.pan.r)) return fail(`The playa's shoreline benches are ${g.pan.shore} wide (3 or more), its length ${g.pan.long} over its depth ${g.pan.r}`);
    const gate = linkOf(plan, g.gate);
    if (!gate?.path || pathDist(g.pan.at[0], g.pan.at[1], gate.path).d > g.pan.r) return fail("The Gate Bed does not cross the basin's playa");
    const notch = onLocal(T, g.notch.at);
    if (Math.abs(notch[1] - N) > 0.01) return fail("The beds' outlet is not on the basin's far edge");
    if (g.notch.width < NOTCH - 2 || g.notch.width > NOTCH + 2) return fail(`The outlet is ${g.notch.width} wide (${NOTCH - 2} to ${NOTCH + 2})`);
    for (const id of [g.gate, g.leat]) if (linkOf(plan, id)?.to !== "notch" || !plan.exits.some((e) => e.id === "notch")) return fail(`${nameOf(plan, id)} does not leave by the outlet`);
    return OK;
  },
};

/** `start.neck`, its plan half (§5.1): the Still Pool, 12 tiles or more, beside the start, joined to the lake by its
 *  inlet alone, 3 wide at most and 3.5 long at most, a gate on it and the first rung's levee of 3 or fewer there. */
const startNeck: Invariant = {
  id: "start.neck",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const k = bodyOf(plan, g.kettle);
    const lake = bodyOf(plan, g.door);
    if (!k || !lake) return fail("The plan has no Still Pool");
    const area = countTiles(k);
    if (area < NECK.least) return fail(`${nameOf(plan, k.id)} holds ${area} tiles (${NECK.least} at least)`);
    const s = plan.frame.start;
    if (bodyDist(s.x + 0.5, s.y + 0.5, k) > 12) return fail(`${nameOf(plan, k.id)} is not beside the start`);
    const joins = plan.links.filter((l) => l.from === k.id || l.to === k.id);
    if (joins.length !== 1 || joins[0].id !== g.inlet) return fail(`${nameOf(plan, k.id)} is joined to the river by ${joins.length} ways, not its inlet alone`);
    const inlet = joins[0];
    if (inlet.from !== g.door || !inlet.wet || !inlet.gates.length) return fail(`${nameOf(plan, inlet.id)} is not a wet, gated way from the plunge pool`);
    if (2 * (inlet.half ?? 0) > NECK.wide) return fail(`${nameOf(plan, inlet.id)} is ${2 * (inlet.half ?? 0)} wide (${NECK.wide} at most)`);
    const long = bodyGap(lake, k);
    if (long > NECK.long) return fail(`${nameOf(plan, inlet.id)} is ${long.toFixed(1)} tiles long (${NECK.long} at most)`);
    const levee = plan.works.find((w) => w.on === inlet.id && w.rung === "first" && w.kind === "levee");
    if (!levee || levee.tiles > NECK.levee) return fail(`No first levee of ${NECK.levee} or fewer on ${nameOf(plan, inlet.id)}`);
    return OK;
  },
};

/** The tiles inside a body's outline. */
function countTiles(b: Body): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const arm of b.arms)
    for (const [x, y, r] of arm) {
      x0 = Math.min(x0, x - r);
      y0 = Math.min(y0, y - r);
      x1 = Math.max(x1, x + r);
      y1 = Math.max(y1, y + r);
    }
  let n = 0;
  for (let j = Math.floor(y0); j <= y1; j++) for (let i = Math.floor(x0); i <= x1; i++) if (bodyDist(i + 0.5, j + 0.5, b) < 0) n++;
  return n;
}

/** `leat.own`, its plan half (§5.1): the leat leaves the cleft on the side away from the Gate, rides the range to
 *  the Pass (its bed from a level under the springs to a level under the Pass), and keeps 4 tiles or more from the
 *  Gate's slot; a bar and a row of Blockages at its head; the Pass's dip on the crest away from the Gate. */
const leatOwn: Invariant = {
  id: "leat.own",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const leat = linkOf(plan, g.leat);
    const gate = linkOf(plan, g.gate);
    const pool = bodyOf(plan, g.pool);
    if (!leat?.path || !Array.isArray(leat.bed) || !gate?.path || !pool) return fail("The plan has no leat");
    if (leat.from !== g.pool || leat.wet || leat.kind !== "leat") return fail(`${nameOf(plan, leat.id)} is not a dry leat from ${nameOf(plan, g.pool)}`);
    if (2 * (leat.half ?? 0) > 1) return fail(`${nameOf(plan, leat.id)} is ${2 * (leat.half ?? 0)} wide (one)`);
    if (leat.rows.length !== 1 || leat.rows[0] > LEAT_ROW) return fail(`${nameOf(plan, leat.id)} has ${leat.rows.length} rows of Blockages (one, at its head behind its bar)`);
    const { R, T } = rangeOf(plan, g);
    const gu = onLocal(T, gate.path[0])[0];
    const head = onLocal(T, leat.path[0]);
    const pass = onLocal(T, leat.path[g.passAt]);
    if (Math.sign(pass[0] - head[0]) === Math.sign(gu - head[0])) return fail(`${nameOf(plan, leat.id)} runs toward the Gate`);
    for (let k = 0; k < g.passAt; k++) {
      const [a, b] = [onLocal(T, leat.path[k]), onLocal(T, leat.path[k + 1])];
      for (let s = 0; s <= 1; s += 0.25) {
        const u = a[0] + (b[0] - a[0]) * s;
        const v = a[1] + (b[1] - a[1]) * s;
        const r = rangeAt(R, u);
        if (v < r.v - r.front + 1 || v > r.v + r.back - 1) return fail(`${nameOf(plan, leat.id)} leaves the range before ${nameOf(plan, "pass")}`);
      }
    }
    if (leat.bed[0] !== pool.sill - 1) return fail(`${nameOf(plan, leat.id)}'s bed starts at ${leat.bed[0]}, not a level under the springs (${pool.sill - 1})`);
    if (leat.bed[g.passAt] !== g.pass - 1) return fail(`${nameOf(plan, leat.id)}'s bed is ${leat.bed[g.passAt]} at the Pass, not a level under it (${g.pass - 1})`);
    const slot = gate.path.slice(0, g.slot.to + 1);
    for (const p of leat.path.slice(0, leat.path.length - 1)) if (pathDist(p[0], p[1], slot).d < 4 + (gate.half ?? 0)) return fail(`${nameOf(plan, leat.id)} meets the Gate's slot`);
    const span = g.passSpan.map((p) => onLocal(T, p)[0]);
    if (pass[0] < Math.min(...span) - 0.01 || pass[0] > Math.max(...span) + 0.01) return fail(`${nameOf(plan, leat.id)} leaves the crest outside the Pass`);
    return OK;
  },
};

/** `valley.enclosed`, its plan half (§5.1): the Low River is the valley's one wet way out, a gorge through the spur
 *  ridge, which stands three over the megadam's water and meets the range's foot; every other edge the valley touches
 *  rises (a "ridge" edge); the Gate, the valley's dry way out, is barred; the megadam on the gorge on the large rung. */
const valleyEnclosed: Invariant = {
  id: "valley.enclosed",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const low = linkOf(plan, g.low);
    if (!low?.path || low.kind !== "gorge" || !low.wet || low.from !== g.lake) return fail("The Low River is not a gorge out of the lake");
    const valley = new Set(plan.bodies.filter((b) => b.id !== g.pool).map((b) => b.id));
    const exits = new Set(plan.exits.map((e) => e.id));
    for (const l of plan.links) {
      if (!valley.has(l.from) || !l.wet || l.id === g.low) continue;
      const down = reach(plan, [l.to], (x) => x.wet && x.id !== g.low);
      down.add(l.to);
      if ([...down].some((id) => exits.has(id))) return fail(`${nameOf(plan, l.id)} lets the valley's water out besides the Low River`);
    }
    const gate = linkOf(plan, g.gate);
    if (!gate || gate.wet || !(g.bar.level > g.sill)) return fail("The Gate is not barred");
    const spur = plan.ridges.find((r) => r.id === g.spur);
    if (!spur) return fail("No spur for the Low River to cut");
    if (spur.top < g.megadam + 3) return fail(`The spur stands at ${spur.top}, under the megadam's water + 3 (${g.megadam + 3})`);
    // (its path crosses the spur's line: a leg of one across a leg of the other. Read as a point of the river within a
    // tile of the spur's line, a spur that wandered three tiles off the river's own point on it was refused, wherever
    // the lake's end lay more than 40 tiles from the spur's root)
    const crosses = (a: Point, b: Point, c: Point, d: Point): boolean => {
      const side = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      return side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0;
    };
    const cut = low.path.some((p, k) => k > 0 && spur.path.some((q, j) => j > 0 && crosses(low.path![k - 1], p, spur.path[j - 1], q)));
    if (!cut && pathDist(spur.path[0][0], spur.path[0][1], low.path).d > 40 && !low.path.some((p) => pathDist(p[0], p[1], spur.path).d < 1)) return fail("The Low River does not cut through the spur");
    const { R, T } = rangeOf(plan, g);
    const top = onLocal(T, spur.path[0]);
    const rt = rangeAt(R, top[0]);
    if (Math.abs(top[1] - (rt.v - rt.front)) > 1) return fail("The spur does not meet the range's foot");
    const lowExit = plan.exits.find((e) => e.id === low.to);
    if (!lowExit) return fail("The Low River leads to no exit");
    const valleyEdges = (["S", g.lowSide === "pass" ? "W" : "E", g.lowSide === "pass" ? "E" : "W"] as Edge[]).map((e) => edgeOnMap(T, e));
    for (const e of valleyEdges) if (e !== lowExit.edge && plan.edges[e] !== "ridge") return fail(`The valley's ${e} edge ${plan.edges[e]}, where it must rise`);
    const mega = plan.works.find((w) => w.kind === "megadam");
    if (!mega || mega.on !== g.low || mega.rung !== "large") return fail("No megadam on the Low River on the large rung");
    return OK;
  },
};

/** `gate.ladder` (§5.1's rungs): the first rung, the Still Pool's levee, inside the first frame; the Gate opened and the
 *  leat opened on the medium rung, needing nothing; the Gate made whole (the Low River levee'd) after the Gate is
 *  opened; the leat's whole share after its first; the megadam large. */
const gateLadder: Invariant = {
  id: "gate.ladder",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const find = (kind: Work["kind"], on: string, rung: Work["rung"]) => plan.works.filter((w) => w.kind === kind && w.on === on && w.rung === rung);
    const neck = find("levee", g.inlet, "first")[0];
    if (!neck) return fail("No first rung on the Still Pool's inlet");
    const s = plan.frame.start;
    const p = frameAt(openingCamera(s), neck.at[0] + 0.5, neck.at[1] + 0.5, s.z);
    if (!p || Math.abs(p.u) > 1 || Math.abs(p.v) > 1) return fail("The first rung does not stand inside the first frame");
    const open = find("canal", g.gate, "medium")[0];
    if (!open || open.needs.length) return fail("The Gate is not opened on the medium rung, needing nothing");
    const whole = plan.works.find((w) => w.on === g.low && w.kind === "levee");
    if (!whole || !whole.needs.includes(open.id)) return fail("The Low River's levee does not follow the Gate's opening");
    const leat1 = find("leat", g.leat, "medium")[0];
    const leat2 = find("leat", g.leat, "large")[0];
    if (!leat1 || leat1.needs.length) return fail("The leat is not opened on the medium rung, needing nothing");
    if (!leat2 || !leat2.needs.includes(leat1.id)) return fail("The leat's whole share does not follow its opening");
    for (const w of plan.works) if (w.gives.green[1] > 0.12 * plan.W * plan.H) return fail(`Work ${w.id} would green ${w.gives.green[1]} tiles, over 12 % of the map`);
    return OK;
  },
};

/** `gate.skeleton`: the five regions of §5.1 (the start's bench, the valley, the range, the Gate's canvas, the far
 *  side, which is dry for good), the range's spine a ridge of role wall at its peak's level, the spur. */
const gateSkeleton: Invariant = {
  id: "gate.skeleton",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const roles = new Set(plan.regions.map((r) => r.role));
    for (const r of ["home", "low", "wet", "top", "dry"] as const) if (!roles.has(r)) return fail(`No ${r} region`);
    if (plan.regions.find((r) => r.role === "dry")?.dayOne !== "dryForGood") return fail("The basin's far side is not dry for good");
    const wall = plan.ridges.find((r) => r.id === g.wall);
    if (!wall || wall.role !== "wall" || wall.top !== g.crest) return fail("No range at its peak's level");
    for (const r of plan.ridges) if (r.top > (plan.sky ?? plan.top)) return fail(`Ridge ${r.id} rises to ${r.top}, over the highest ground`);
    return OK;
  },
};

/** The longest run of a link's course at one width (`Link.halves`), tiles: the whole course where it has one width. */
export function sameWidthRun(l: Link): number {
  const p = l.path ?? [];
  const h = l.halves && l.halves.length === p.length ? l.halves : p.map(() => l.half ?? 0);
  let most = 0;
  let run = 0;
  for (let k = 1; k < p.length; k++) {
    run = h[k] === h[k - 1] ? run + dist(p[k - 1], p[k]) : 0;
    most = Math.max(most, run);
  }
  return most;
}

/** `valley.water` (planning's ruling of 2026-11-12: a pool, a brook and a lake, never channels): the Veil falls into the
 *  plunge pool at the start's door; its brook leaves it for the lake, falling the two levels in two steps (the pool's
 *  lip to a reach a level under it, the Steps, then their lip's cascade to the lake's level), `BROOK.stream` wide and never one width for
 *  more than `BROOK.run`'s most; the southern brooks `BROOK.valley` wide past their heads, likewise; the lake lies away from the start
 *  (`LAKE_AWAY` tiles or more), ten across or more at its widest and its width varying two-fold or more along its main
 *  arm, with a bay or more; the Low River leaves the lake. */
const valleyWater: Invariant = {
  id: "valley.water",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const lake = bodyOf(plan, g.lake);
    const door = bodyOf(plan, g.door);
    if (!lake || !door) return fail("The plan has no lake or plunge pool");
    // (the plunge pool's brook: a reach a level under it to the Steps, then the cascade's reach to the lake)
    const outs = plan.links.filter((l) => l.from === g.door && l.wet && l.to !== g.kettle);
    const mid = outs.length === 1 ? bodyOf(plan, outs[0].to) : undefined;
    const ons = mid ? plan.links.filter((l) => l.from === mid.id && l.wet) : [];
    if (!mid || mid.sill !== door.sill - 1 || ons.length !== 1 || ons[0].to !== g.lake || lake.sill !== mid.sill - 1) return fail(`${nameOf(plan, g.door)}'s brook does not fall to ${nameOf(plan, g.lake)} a level at a time in two steps`);
    const reaches = [outs[0], ons[0]];
    for (const l of reaches) {
      const ws = (l.halves ?? []).map((h) => 2 * h);
      if (!l.path || ws.length !== l.path.length || ws.some((w) => w < BROOK.stream[0] || w > BROOK.stream[1])) return fail(`${nameOf(plan, l.id)} is ${ws.length ? `${Math.min(...ws)} to ${Math.max(...ws)}` : 2 * (l.half ?? 0)} wide (${BROOK.stream[0]} to ${BROOK.stream[1]} at each point)`);
    }
    const southern = plan.links.filter((k) => k.kind === "brook" && k.to === g.lake);
    for (const l of [...reaches, ...southern]) {
      const run = sameWidthRun(l);
      if (run > BROOK.run[1] + 1e-9) return fail(`${nameOf(plan, l.id)} runs ${run.toFixed(1)} tiles at one width (${BROOK.run[1]} at most)`);
      // (past its head `BROOK.valley` wide; on its last reach, level with the lake's sill, `BROOK.mouth`)
      const bed = Array.isArray(l.bed) ? l.bed : [];
      // (a trunk a width wider below where a tributary joins it)
      const trunk = plan.links.some((k) => k.joins?.link === l.id) ? 1 : 0;
      const wrong = (l.halves ?? []).some((h, k) => {
        if (k < 2) return false;
        const [lo, hi] = bed[k] === lake.sill ? BROOK.mouth : BROOK.valley;
        return 2 * h < lo || 2 * h > hi + trunk;
      });
      if (southern.includes(l) && wrong) return fail(`${nameOf(plan, l.id)} is not ${BROOK.valley[0]} to ${BROOK.valley[1]} wide past its head (${BROOK.mouth[0]} to ${BROOK.mouth[1]} on its last reach)`);
    }
    // (a confluence, `BROOK_JOIN`: a trunk takes `most` tributaries, a tributary one, a tributary's tributary none, and
    // the two meet at one level)
    for (const l of southern) {
      const j = l.joins;
      if (!j) continue;
      const trunk = southern.find((k) => k.id === j.link);
      const tb = trunk && Array.isArray(trunk.bed) ? trunk.bed : null;
      const lb = Array.isArray(l.bed) ? l.bed : null;
      if (!trunk?.path || !tb || !lb) return fail(`${nameOf(plan, l.id)} joins no brook`);
      const upper = trunk.joins ? southern.find((k) => k.id === trunk.joins!.link) : undefined;
      if (upper?.joins) return fail(`${nameOf(plan, l.id)} joins a tributary's tributary`);
      if (southern.filter((k) => k.joins?.link === trunk.id).length > (trunk.joins ? 1 : BROOK_JOIN.most)) return fail(`${nameOf(plan, trunk.id)} gathers more tributaries than a ${trunk.joins ? "tributary" : "trunk"} takes`);
      let run = 0;
      let at = 0;
      let gap = Infinity;
      trunk.path.forEach((q, k) => {
        if (k) run += dist(trunk.path![k - 1], q);
        if (Math.abs(run - j.at) < gap) {
          gap = Math.abs(run - j.at);
          at = k;
        }
      });
      if (lb[lb.length - 1] !== tb[at]) return fail(`${nameOf(plan, l.id)} meets ${nameOf(plan, trunk.id)} at level ${lb[lb.length - 1]}, the trunk's bed ${tb[at]} there (one level)`);
    }
    const s = plan.frame.start;
    const away = bodyDist(s.x + 0.5, s.y + 0.5, lake);
    if (away < LAKE_AWAY) return fail(`${nameOf(plan, g.lake)} lies ${away.toFixed(1)} tiles from the start (${LAKE_AWAY} or more)`);
    const rs = lake.arms[0].map((p) => p[2]);
    const widest = 2 * Math.max(...rs);
    if (widest < LAKE_SHAPE.widest) return fail(`${nameOf(plan, g.lake)} is ${widest.toFixed(1)} across at its widest (${LAKE_SHAPE.widest} or more)`);
    if (Math.max(...rs) < LAKE_SHAPE.varies * Math.min(...rs) - 0.01) return fail(`${nameOf(plan, g.lake)}'s width varies ${(Math.max(...rs) / Math.min(...rs)).toFixed(2)}-fold (${LAKE_SHAPE.varies} or more)`);
    // (a bay is an arm of three points or more; the shore's coves are two)
    if (!lake.arms.slice(1).some((arm) => arm.length >= 3)) return fail(`${nameOf(plan, g.lake)} has no bay`);
    if (linkOf(plan, g.low)?.from !== g.lake) return fail(`The Low River does not leave ${nameOf(plan, g.lake)}`);
    // (the brook keeps off the Gate's dry channel: beside it, its water ran into the Gate past its bar)
    const gate = linkOf(plan, g.gate);
    if (gate?.path) for (const l of reaches) for (const p of l.path!) if (pathDist(p[0], p[1], gate.path).d < (gate.half ?? 0) + Math.max(l.half ?? 0, ...(l.halves ?? [])) + 4) return fail(`${nameOf(plan, l.id)} runs beside ${nameOf(plan, g.gate)}`);
    return OK;
  },
};
const LAKE_AWAY = 16;

/** `valley.brooks` (planning's ruling on the brooks: a brook turning every few tiles at one angle, left and right by
 *  turns, is a ruler with a rhythm): each southern brook's legs between its turns (`gateBrooks.ts` `brookLegsWrong`)
 *  vary, no three of one length in a row, their spread over their mean `BROOK_LEGS.spread` or more, and its turns not
 *  left and right by turns throughout. */
const valleyBrooks: Invariant = {
  id: "valley.brooks",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    for (const l of plan.links) {
      if (l.kind !== "brook" || l.to !== g.lake || !l.path || bodyOf(plan, l.from)?.kind !== "tarn") continue;
      const wrong = brookLegsWrong(l.path);
      if (wrong) return fail(`${nameOf(plan, l.id)} ${wrong}`);
    }
    return OK;
  },
};

/** `range.spurs` (planning's ruling of 2026-11-13): spurs leave the spine toward both sides, `SPURS.least` or more a side
 *  per 128 tiles of the map's side, a fork's branches aside. */
const rangeSpurs: Invariant = {
  id: "range.spurs",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const least = Math.round((SPURS.least * plan.W) / 128);
    const [f, b] = [0, 2].map((sd) => (g.spurs ?? []).filter((x) => x.trunk && x.side === sd).length);
    return f >= least && b >= least ? OK : fail(`The range has ${f} spurs toward the valley and ${b} toward the basin (${least} or more each)`);
  },
};


/** `valley.lake` (planning's verdict of 2026-11-14: the lake at the wall's foot was a canal lake, long, straight-sided,
 *  one width, parallel to the wall): on stage 1's water at most a third of the lake's shore lies along the range, and
 *  its width varies two-fold or more along its length (`gateMeasures.ts` `lakeShape`, `LAKE_CANAL`). */
const valleyLake: Invariant = {
  id: "valley.lake",
  at: "land",
  test({ plan, water }) {
    if (!water) throw new Error("A land invariant needs stage 1's water");
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const canal = lakeCanal(lakeShape(plan, water));
    return canal ? fail(`${nameOf(plan, g.lake)} is a canal lake: ${canal}`) : OK;
  },
};

const gatePlanInvariants: Invariant[] = [rangeSpurs, gateLevels, rangeSpine, valleyWater, valleyBrooks, wallCamera, frameLip, gateGap, basinBowl, startNeck, leatOwn, valleyEnclosed, gateLadder, gateSkeleton];

// ------------------------------------------------------------------------------------------------- the def

const invariants: Invariant[] = [...PLAN_CHECKS, ...gatePlanInvariants, ...GATE_WATER_CHECKS, valleyLake];

/** The first `plan` invariant a plan fails, as "id: reason", or null. */
function planFailure(spec: MapSpec, plan: PremisePlan): string | null {
  for (const inv of invariants) {
    if (inv.at !== "plan") continue;
    const r = inv.test({ spec, plan });
    if (!r.ok) return `${inv.id}: ${r.reason}`;
  }
  return null;
}

/** One layout try's plan (or why it stopped) and the first `plan` invariant it fails: for the tools. */
export function gateLayoutTry(spec: MapSpec, attempt: number, t: number): { plan: PremisePlan | null; failed: string | null } {
  const r = layout(spec, attempt, t);
  if ("why" in r) return { plan: null, failed: r.why.includes(": ") ? r.why : `layout: ${r.why}` };
  const plan = r.plan as unknown as PremisePlan;
  return { plan, failed: planFailure(spec, plan) };
}

/** One attempt: a layout try at a time from its own stream, the first whose plan passes every `plan` invariant. */
function draw(spec: MapSpec, attempt: number): PremisePlan | { reason: string } {
  const why = wallGateEligible(spec);
  if (why) return { reason: why };
  let last = "";
  for (let t = 0; t < LAYOUT_TRIES; t++) {
    const r = gateLayoutTry(spec, attempt, t);
    if (r.plan && !r.failed) return r.plan;
    last = r.failed ?? "";
  }
  return { reason: `No wall with one gate fits seed ${spec.seed} at ${spec.size.x}² in ${LAYOUT_TRIES} layouts (${last})` };
}

/** The premise's definition, for the shared stage functions (`draw.ts` `firstPlan`, `failing`). Its id is outside
 *  `PremiseId` until it is offered (`premises/dev.ts`), hence the one cast here. */
export const wallGate: PremiseDef = {
  id: GATE_ID as unknown as PremiseDef["id"],
  eligible: wallGateEligible,
  draw,
  invariants,
  // (its own stages 1 and 2, through the shared stages' seams: PREMISES §2.2 "Seams")
  water: gateWater,
  land: (plan, water, style) => gateLand(plan, water, style?.relief),
};
