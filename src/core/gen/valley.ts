// The valley archetypes (PLAN §8): River Valley and Canyon, one planner with a typed table of
// layout parameters per archetype. A river crosses the map west to east inside a valley floor, with
// terraces (River Valley) or canyon walls and rim terraces (Canyon) rising to the highlands on both
// sides. Its bed steps down over falls. Upstream of the start a basin opens behind a rock ridge the
// river cuts through: the dam site (in Canyon, inside a narrows). The colony starts on a bench
// beside the river; in Canyon a stairway climbs the wall beside it.
//
// The settings move the layout (PLAN §5): relief sets how far the land rises from the lowest reach
// to the highest terrain, terracing how many of the rises are one level, buildable land the width
// of the valley floor and how much the band edges wander, rivers and river style the river's
// tributaries, spring and meander, waterfalls the falls on its bed, drought reserve the basin's
// length, lakes and basins the ponds, and the badwater settings the badwater basins.
//
// The planner emits features only (PLAN §19.2): it builds the layout's terrain to fit the relief
// and place ponds and badwater on it, then builds through the canonical water settle to
// plan the resources on the simulated moisture, and hands the full list to the one build pipeline.

import type { Orientation } from "../format/footprints";
import { arcAtX, bedAt, pathField, pointAtArc, polygonMask, round } from "../features/geometry";
import { buildMap, START_CLEAR_RADIUS, type BuildResult, type LockedLayer, type SettleCache } from "../features/build";
import { inBench } from "../features/raster/terrain";
import { featureId } from "../features/ids";
import { BUILDERS, flowBudget, planSetPiece, type PlanContext as PieceContext, type PlanRecord } from "../features/setpieces";
import type {
  BedStep,
  Feature,
  LakeFeature,
  LandformFeature,
  MapObjectFeature,
  Point,
  RiverFeature,
  SetPieceFeature,
  StartFeature,
} from "../features/schema";
import { cosDet, PI, sinDet, TWO_PI } from "../math/detmath";
import { tilesToRuns } from "../math/grid";
import { stream, type Rng } from "../math/rng";
import type { MapSpec } from "../spec/mapspec";
import { bandsFor, drawBands, fitRelief, layoutTargets, type LayoutTargets } from "./layout";
import { planRiver } from "../doc/tools";
import { districtCandidates, obstacleSpots, planExtras } from "./extras";
import { DISTRICT_RADIUS, districtTiles } from "../features/setpieces/secondDistrict";
import { obstacleTiles } from "../features/setpieces/obstaclePayoff";
import { RUIN_HEIGHT_SHARES } from "./calibrated";
import { ruinColumns } from "../resources/baseline";
import { walkRegions } from "../analysis/regions";
import { slopeHighSide } from "../format/footprints";
import { entityTiles } from "../features/edits";
import { objectTiles } from "../features/objects";
import { WALK_BLOCKERS } from "../validate/playability";
import { nearStartTargets, planResources } from "./resources";
import { groundOf, placeBadwater, placeRiversidePonds, reachOf, type PlanGround } from "./water";

export type ValleyArchetype = "riverValley" | "canyon" | "highlands" | "delta";

/** Layout parameters per archetype (PLAN §8: a typed table, tunable without code changes). */
export const VALLEY: Record<
  ValleyArchetype,
  {
    /** Valley floor half-width: a share of the side across the flow (null: `canyonFloor` tiles). */
    floorShare: boolean;
    canyonFloor: [number, number];
    /** The first rise at the valley floor's edge: the canyon's wall (null: from the terracing). */
    wall: boolean;
    /** Band-edge wiggle, relative to the buildable land's. */
    wobble: number;
    /** How jagged the band edges are, fixed (null: from Buildable land). */
    jag: number | null;
    /** A gorge narrows the river at the dam site. */
    narrows: boolean;
    /** A stairway climbs the valley wall beside the start. */
    stairs: boolean;
    /** Where the dam site's gorge is drawn, as shares of the map's width (Delta's lies west, to
     *  leave room for the delta a braided river builds below it: the river ends in a head pool,
     *  and 2–4 channels fan out from it across a low plain to the east edge, the start at the
     *  head; PLAN §5.3, §8). */
    gorge: [number, number];
    /** Highlands: how many plateaus rise on the terraces (a cliff all round), and a stream from a
     *  spring on the highest cascades down to the river (PLAN §8). */
    plateaus: [number, number];
    /** Ruins on a plateau that takes player stairs to reach (PLAN §9.4). */
    obstacle: boolean;
  }
> = {
  riverValley: { floorShare: true, canyonFloor: [0, 0], wall: false, wobble: 1, jag: null, narrows: false, stairs: false, gorge: [0.42, 0.58], plateaus: [0, 0], obstacle: true },
  canyon: { floorShare: false, canyonFloor: [9, 12.5], wall: true, wobble: 0.45, jag: 0.3, narrows: true, stairs: true, gorge: [0.42, 0.58], plateaus: [0, 0], obstacle: false },
  highlands: { floorShare: true, canyonFloor: [0, 0], wall: false, wobble: 0.8, jag: null, narrows: false, stairs: false, gorge: [0.42, 0.58], plateaus: [2, 4], obstacle: true },
  delta: { floorShare: true, canyonFloor: [0, 0], wall: false, wobble: 1, jag: null, narrows: false, stairs: false, gorge: [0.3, 0.4], plateaus: [0, 0], obstacle: true },
};

const MIN_RIVER_WIDTH = 4.4; // tiles with centre distance < 2.2 are channel (5 rows)
/** A river with less than 90% of the map's Normal flow may be narrower, down to 3 rows, so its water
 *  stays deep enough to pump (0.3, PLAN §11.4). */
const MIN_THIN_RIVER_WIDTH = 2.4;
const MAX_RIVER_WIDTH = 8.4;
const BENCH_RADIUS = { small: 5, normal: 6, large: 8 } as const;
/** Bed steps stand at least this far apart along the river (PLAN §5.3: 12+ tiles between falls). */
const STEP_GAP = 12;

/** Channel width for a flow: wide enough that the water stays about 0.55 deep, well inside its
 *  one-level banks. A channel passes its flow over a lip at about 0.3·q deep (q = flow per tile of
 *  width) and its surface climbs about 0.0015·q per tile upstream of the lip (PLAN §9.2), so long
 *  flat reaches on big maps need a wider channel (PLAN §20, D26). */
export function riverWidth(flow: number, W: number, H = W): number {
  const reach = 0.8 * W; // the longest flat reach, in tiles along the river
  const q = 0.55 / (0.3 + 0.0015 * reach);
  const min = flow < 0.9 * flowBudget(W, H) ? MIN_THIN_RIVER_WIDTH : MIN_RIVER_WIDTH;
  return Math.min(MAX_RIVER_WIDTH, Math.max(min, round(flow / q, 2)));
}

/** Regeneration constraints for the planner (PLAN §7.0). */
export interface PlanContext {
  /** Tiles the planner keeps its rivers, lakes, set pieces, start and resources off: the player's
   *  features, locked regions and keep-out regions. */
  protect: Uint8Array | null;
  /** The player's features, built with the plan, so the resources are planned on their ground. */
  features: readonly Feature[];
  /** What a regeneration keeps under locks. */
  locked: LockedLayer | null;
}

/** The planner could not keep its layout off the protected tiles. */
export class PlanConflict extends Error {}

/** Layouts drawn per attempt before the planner gives up on the protected tiles. */
export const MAX_LAYOUT_TRIES = 24;

interface StepPlan {
  x: number;
  drop: number;
  /** A named fall (an on-river waterfall set piece) or a 1-level step. */
  role: string | null;
}

export function planValley(archetype: ValleyArchetype, spec: MapSpec, attempt: number, candidate = 0, settleCache?: SettleCache, context?: PlanContext): Feature[] {
  const A = VALLEY[archetype];
  const W = spec.size.x;
  const H = spec.size.y;
  const seed = spec.seed;
  const t = layoutTargets(spec);
  const rng = stream(seed, "layout", candidate, attempt);
  const id = (kind: Feature["kind"], role: string) => featureId(seed, kind, role);
  const hard = spec.designedFor === "hard";

  for (let tryN = 0; ; tryN++) {
    // ------------------------------------------------------------------ macro layout
    const ph1 = rng.float() * TWO_PI;
    const ph2 = rng.float() * TWO_PI;
    const l1 = W * rng.range(0.7, 1.1);
    const l2 = W * rng.range(0.3, 0.45);
    const halfWidth = A.floorShare ? round(H * t.land.floor, 2) : round(rng.range(A.canyonFloor[0], A.canyonFloor[1]) * t.land.canyon, 2);
    // the valley floor reaches about halfWidth + 11 tiles from the river before the first terrace;
    // keeping that inside the map keeps a dammed basin off the map edge (edges drain, PLAN §9.1)
    const edgeMargin = halfWidth + 12;
    const M = t.meander;
    const centre = (x: number) =>
      Math.min(H - 1 - edgeMargin, Math.max(edgeMargin, H / 2 + H * M * sinDet((TWO_PI * x) / l1 + ph1) + H * M * 0.35 * sinDet((TWO_PI * x) / l2 + ph2)));
    // the gorge goes on the gentlest stretch near its drawn place: a river crossing the ridge at a
    // steep angle leaves a gap no short straight dam can close (PLAN §9.1, D25)
    const gorgeDraw = Math.floor(W * rng.range(A.gorge[0], A.gorge[1]));
    let gorgeX = gorgeDraw;
    let gentlest = Infinity;
    const reachX = Math.round(W * 0.08);
    for (let x = Math.max(Math.round(W * (A.gorge[0] - 0.04)), gorgeDraw - reachX); x <= Math.min(Math.round(W * (A.gorge[1] + 0.04)), gorgeDraw + reachX); x++) {
      const slope = Math.abs(centre(x + 3) - centre(x - 3)) / 6;
      const score = slope + 0.002 * Math.abs(x - gorgeDraw);
      if (score < gentlest) {
        gentlest = score;
        gorgeX = x;
      }
    }
    // the drought reserve sets the basin's length (PLAN §5.3)
    const basinShare = t.reserve >= 3 ? rng.range(0.2, 0.26) : t.reserve >= 1.5 ? rng.range(0.14, 0.2) : rng.range(0.12, 0.16);
    // a canyon's basin reach holds the start's bench and the flight beside it
    const basinLen = Math.max(A.stairs ? 34 : 0, Math.floor(W * basinShare));
    const basinX0 = Math.max(4, gorgeX - basinLen - 2);
    const basinX1 = gorgeX - 6; // ends clear of the ridge (it spans about ±4 around the gorge)
    // on Hard the start stands between the gorge and the falls, so the falls keep 26 tiles off; a
    // delta's river ends at its head pool, and the delta fills the rest of the map
    // (a braided river builds the delta in any valley but a canyon's narrows; Delta's preset is
    // braided)
    const braided = spec.settings.water.riverStyle === "braided" && !A.narrows;
    const headX = braided ? Math.min(W - Math.max(24, Math.round(0.28 * W)), gorgeX + 32 + Math.round(0.05 * W)) : 0;
    const fallsX = braided ? headX : Math.floor(Math.min(W - 8, Math.max(hard ? gorgeX + (A.stairs ? 40 : 26) : 0, gorgeX + W * rng.range(0.16, 0.24))));
    const cascadeX = Math.max(3, basinX0 - 2);

    // ---- the bed's steps (PLAN §5.3 Waterfalls: 0 / 1–2 / 3–6 falls of 2+ levels). A Hard map's
    // cascade drops 4, so a dam 4 high holds a reservoir 3 deep on average (PLAN §11.4). A delta's
    // falls all stand upstream of the basin: its river runs level from the gorge to the head.
    const off = t.waterfalls === "off";
    const steps: StepPlan[] = [];
    const cascadeDrop = hard ? 4 : off ? 1 : 2;
    steps.push({ x: cascadeX, drop: cascadeDrop, role: off && !hard ? null : "setpiece/waterfall/cascade" });
    if (off && !hard && cascadeX - STEP_GAP >= 3) steps.push({ x: cascadeX - STEP_GAP, drop: 1, role: null });
    if (!braided) {
      steps.push({ x: fallsX, drop: off ? 1 : 2, role: off ? null : "setpiece/waterfall/falls" });
      if (off && fallsX + STEP_GAP <= W - 6) steps.push({ x: fallsX + STEP_GAP, drop: 1, role: null });
    }
    const extra = t.waterfalls === "many" ? 1 + rng.int(0, 4) : 0; // 3–6 falls in all
    const slots: number[] = [];
    for (let x = cascadeX - STEP_GAP - 2; x >= 8; x -= STEP_GAP + 4) slots.push(x);
    if (!braided) for (let x = fallsX + STEP_GAP + 2; x <= W - 8; x += STEP_GAP + 4) slots.push(x);
    const slotOrder = rng.shuffle(slots.slice());
    for (let k = 0; k < extra && k < slotOrder.length; k++) steps.push({ x: slotOrder[k], drop: 2, role: `setpiece/waterfall/extra/${slotOrder[k] < cascadeX ? "up" : "down"}/${k}` });
    steps.sort((a, b) => a.x - b.x);
    const crest = hard ? 4 : 2;
    // the falls must fit under the highest terrain: the upstream floodplain at most one below it,
    // the ridge above the basin (crest + 3) within it; extra falls go first, then 2-level drops
    // become 1
    const fits = () => {
      const total = steps.reduce((a, s) => a + s.drop, 0);
      const below = steps.filter((s) => s.x > cascadeX).reduce((a, s) => a + s.drop, 0);
      return total <= t.top - 3 && below <= t.top - crest - 4;
    };
    while (!fits()) {
      const k = steps.findIndex((s) => s.role?.startsWith("setpiece/waterfall/extra/"));
      if (k >= 0) {
        steps.splice(k, 1);
        continue;
      }
      const big = steps.find((s) => s.drop > 1 && !(hard && s.x === cascadeX));
      if (!big) break;
      big.drop -= 1;
      if (big.drop < 2) big.role = null;
    }
    const dropBelow = (x: number) => steps.filter((s) => s.x > x).reduce((a, s) => a + s.drop, 0);
    const totalDrop = steps.reduce((a, s) => a + s.drop, 0);

    // ---- draws for the terraces, taken once so the relief fit never draws again
    const draws = { north: drawBands(rng, t.p1), south: drawBands(rng, t.p1) };
    const wob = t.land.wobble * A.wobble;
    const flowTotal = t.flow;
    // the main river carries the River flow setting's water; each tributary brings a stream of a
    // quarter of it more, and the main channel is sized for all of it (its water stays deep enough
    // to pump above the confluences and inside its banks below them)
    const tributaries = Math.max(0, t.rivers - 1);
    const mainFlow = flowTotal;
    const tribFlow = round(0.25 * flowTotal, 2);
    const riverW = riverWidth(round(flowTotal * (1 + 0.25 * tributaries), 2), W, H);
    const startSide = rng.float() < 0.5 ? 1 : -1;
    const startEdge = rng.int(6, 10);
    const startDraw = rng.float();
    const tribDraws = [0, 1].map(() => ({ at: rng.float(), wiggle: rng.range(-0.5, 0.5), x2: rng.range(-8, 8), steps: rng.float() }));
    // a delta's channels: 2–4 of them, their mouths spread over 30–60% of the east edge
    const deltaDraws = braided ? { n: 2 + rng.int(0, 3), spread: rng.range(0.3, 0.6), wiggle: [0, 1, 2, 3].map(() => rng.range(-1, 1)) } : null;
    // Highlands: the plateaus' draws (count, then per plateau: where, size, height)
    const plateauDraws = A.plateaus[1] > 0 ? { n: A.plateaus[0] + rng.int(0, A.plateaus[1] - A.plateaus[0] + 1), each: [0, 1, 2, 3, 4, 5].map(() => ({ u: rng.float(), r: rng.range(0.8, 1.2), rise: 2 + rng.int(0, 3), shape: rng.float() })) } : null;

    // the path follows the meander; a river fed by a spring (no river enters on the edge) starts
    // three tiles in; a delta's ends at its head pool
    const x0 = t.rivers === 0 ? 3 : 0;
    const xEnd = braided ? headX : W - 1;
    const path: Point[] = [];
    for (let x = x0; x < xEnd; x += 4) path.push([x, round(centre(x), 2)]);
    path.push([xEnd, round(centre(xEnd), 2)]);
    const riverId = id("river", "river/main");
    const arc = (x: number) => round(arcAtX(path, Math.max(x0, x)), 2);
    const sGorge = arc(gorgeX);
    const gorgePoint = pointAtArc(path, sGorge).p;

    // levels: the lowest reach's floodplain sits `range` below the highest terrain (the relief),
    // and every level above follows the steps; the ridge above the basin stays within the top
    const lowFloor0 = t.top - t.range;
    const basinDrop = dropBelow(cascadeX);
    const maxLowBed = Math.min(t.top - 2 - totalDrop, t.top - crest - 3 - basinDrop, 13);
    const make = (shift: number): { features: Feature[]; river: RiverFeature; lake: LakeFeature; start: StartFeature; damSite: SetPieceFeature; floorTop: number } | null => {
      const lowBed = Math.max(0, Math.min(maxLowBed, lowFloor0 - 1 + shift));
      const bedSteps: BedStep[] = steps.map((s) => ({ at: arc(s.x), drop: s.drop, ...(s.role ? { setPiece: id("setPiece", s.role) } : {}) }));
      const bedProfile = { start: lowBed + totalDrop, steps: bedSteps };
      const floorTop = bedAt(bedProfile, sGorge) + 1; // the basin's floodplain
      const river: RiverFeature = {
        id: riverId,
        kind: "river",
        origin: "generated",
        role: "river/main",
        locked: false,
        params: {
          path,
          width: riverW,
          bedDepth: 1,
          bedProfile,
          flow: mainFlow,
          style: spec.settings.water.riverStyle === "straight" ? "straight" : "meandering",
          meander: M,
          entry: t.rivers === 0 ? { spring: [path[0][0], path[0][1]] } : { edge: "west" },
          exit: { edge: "east" },
          badwater: false,
        },
      };
      const valley: LandformFeature = {
        id: id("landform", "landform/valley"),
        kind: "landform",
        origin: "generated",
        role: "landform/valley",
        locked: false,
        params: { kind: "valley", edgeStyle: A.wall ? "cliff" : "terraced", along: { river: riverId, halfWidth, floorAboveBed: 1 } },
      };
      // terraces: from the basin's floodplain up to the highest terrain, reached 80% of the way to
      // the map edge; a canyon's first rise is its wall (4–6 levels by the relief), a Hard map's a
      // cliff of 3 round the basin (a dam 4 high then holds water 3 deep on average)
      const lift = Math.max(0, t.top - floorTop);
      const span = Math.max(8, 0.8 * (H / 2 - halfWidth - 2));
      const wall = A.wall ? Math.max(4, Math.min(6, Math.round(3 + 0.04 * spec.settings.terrain.relief))) : hard ? 3 : undefined;
      const terraces = (side: 1 | -1, name: "north" | "south"): LandformFeature => ({
        id: id("landform", `landform/terraces/${name}`),
        kind: "landform",
        origin: "generated",
        role: `landform/terraces/${name}`,
        locked: false,
        params: {
          kind: "terraces",
          edgeStyle: "terraced",
          along: {
            river: riverId,
            halfWidth,
            floorAboveBed: 1,
            side,
            baseLevel: floorTop,
            // a canyon's rims are terraces (PLAN §8), one level each, up to the plateau
            bands: bandsFor(draws[name], lift, span, wall, A.wall ? 16 : 0, t.land.cliffs),
            wobble: { amp: round(wob, 2), cell: 24, amp2: round(wob * (A.jag ?? t.land.jag), 2), cell2: A.jag === null ? t.land.grain : 8 },
            maxLevel: t.top,
          },
        },
      });
      // the basin: the valley widens upstream of the gorge; a planned lake (dry until dammed). The
      // outline runs column by column (the river flows west to east), which never self-intersects
      // the way offsets along a meandering path would.
      const left: Point[] = [];
      const right: Point[] = [];
      const nSteps = Math.max(2, Math.ceil((basinX1 - basinX0) / 2));
      // River Valley's basin bulges to 1.45× the floor's width, Canyon's to 1.6× (the start's reach
      // of a canyon floor needs room for its fields)
      const bw = halfWidth;
      const bulge = A.floorShare ? 0.45 : 0.6;
      for (let k = 0; k <= nSteps; k++) {
        const x = basinX0 + ((basinX1 - basinX0) * k) / nSteps;
        const w = bw * (1 + bulge * sinDet((PI * k) / nSteps));
        const c = centre(x);
        // the basin stays 4 tiles off the map edges: a reservoir must never touch an edge (PLAN §9.1)
        left.push([round(x, 2), round(Math.min(H - 5, c + w), 2)]);
        right.push([round(x, 2), round(Math.max(4, c - w), 2)]);
      }
      const lake: LakeFeature = {
        id: id("lake", "lake/basin/primary"),
        kind: "lake",
        origin: "generated",
        role: "lake/basin/primary",
        locked: false,
        params: {
          outline: [...left, ...right.reverse()],
          floorDepth: 1,
          outlet: { at: [round(gorgePoint[0], 2), round(gorgePoint[1], 2)], sill: bedAt(bedProfile, sGorge), to: "river", target: riverId },
          inflow: { rivers: [riverId] },
          planned: true,
          river: riverId,
        },
      };
      const layoutCtx = (features: Feature[]): PieceContext => ({ W, H, seed, features, heights: new Uint8Array(0) });
      const piece = (kind: SetPieceFeature["params"]["kind"], request: PlanRecord, features: Feature[], role: string): SetPieceFeature => {
        const r = planSetPiece(kind, request, layoutCtx(features), { id: id("setPiece", role), origin: "generated", role }, true);
        if (!r.ok) throw new Error(`${archetype}'s ${role}: ${r.errors.join("; ")}`);
        return r.feature;
      };
      // the ridge's top stands 3 above the crest (PLAN §9.1, D25)
      const damSite = piece("damSite", { river: riverId, at: sGorge, crest }, [river], "setpiece/damSite/primary");
      const falls = steps.filter((s) => s.role).map((s) => piece("waterfall", { mode: "on-river", river: riverId, at: arc(s.x), drop: s.drop }, [river], s.role!));
      const narrows = A.narrows
        ? [piece("gorge", { river: riverId, from: round(Math.max(1, sGorge - 7), 2), length: 14, width: Math.max(3, Math.min(5, Math.floor(riverW))), wallHeight: crest + 1, access: "none" }, [river], "setpiece/gorge/narrows")]
        : [];

      // ---- the start: on a bench beside the river, its door toward the water. Its edge distance
      // follows the rule for pumpable water (PLAN §5.6); it keeps within 34 tiles of the gorge so
      // the dam site is within 40 (PLAN §9.1). On Hard it stands below the gorge, where a dam 4 high
      // cannot flood it.
      const rules = spec.settings.start.rules;
      const hi = Math.max(3, Math.min(9, rules.waterWithin - 4));
      const edge = Math.max(3, Math.min(hi, startEdge));
      const floorRoom = halfWidth - riverW / 2 - 2;
      const dist = riverW / 2 + Math.max(3, Math.min(edge, A.floorShare ? edge : Math.floor(floorRoom)));
      const startY = (x: number, sd: number) => {
        let y = Math.round(centre(x));
        while (y > 8 && y < H - 9 && distToPath(path, x, y) < dist) y += sd;
        return Math.min(H - 9, Math.max(8, y));
      };
      const toGorge = (x: number, sd: number) => {
        const dx = x - gorgePoint[0];
        const dy = startY(x, sd) - gorgePoint[1];
        return Math.sqrt(dx * dx + dy * dy);
      };
      let side = startSide;
      let sx: number;
      const benchR = BENCH_RADIUS[spec.settings.start.area];
      if (A.stairs) {
        // a canyon's start leaves room downstream for the flight up the wall beside its bench
        const lo = hard ? gorgeX + 8 + benchR : cascadeX + 5 + benchR;
        const top = Math.max(lo, (hard ? fallsX - 6 : gorgeX - 8) - (benchR + 10));
        sx = lo + Math.floor(startDraw * (top - lo + 1));
      } else if (hard || braided) {
        // below the ridge, clear of it by the bench and its margin (a delta's start stands at the
        // head of the delta, clear of its pool)
        const lo = gorgeX + 14;
        const top = Math.max(lo, braided ? headX - 16 : fallsX - 10);
        sx = Math.min(top, lo + Math.floor(startDraw * Math.max(1, top - lo)));
      } else {
        sx = basinX0 + 2 + Math.floor(startDraw * Math.max(1, gorgeX - 6 - basinX0 - 2));
        const lastX = Math.max(basinX0 + 2, gorgeX - 7);
        while (sx < lastX && toGorge(sx, side) > 34) sx++;
      }
      if (toGorge(sx, side) > 34 && toGorge(sx, -side) < toGorge(sx, side)) side = -side;
      // the bench stands a level above the floodplain (D26), 3–9 tiles from the channel by the
      // water rule; the colony walks down to the river over the map's own slopes (the water rule,
      // D153: the start no longer needs water on its own level, so the bench no longer
      // runs to the bank)
      const sy = startY(sx, side);
      const benchLevel = bedAt(river.params.bedProfile, arcAtX(path, sx)) + 2;
      const orientation: Orientation = centre(sx) < sy ? "Cw0" : "Cw180";
      const start: StartFeature = {
        id: id("start", "start/main"),
        kind: "start",
        origin: "generated",
        role: "start/main",
        locked: false,
        params: {
          position: [sx, sy],
          orientation,
          benchRadius: BENCH_RADIUS[spec.settings.start.area],
          benchLevel,
          player: 0,
        },
      };

      // ---- tributaries (Rivers 2–3): from the north or south edge into the main river, clear of
      // the start and the basin, each in its own valley cut through the terraces
      const tribFeatures: Feature[] = [];
      const tribRivers: RiverFeature[] = [];
      // a tributary keeps clear of the dam site's ridge, of the start's zone on the start's side,
      // and of the other tributaries
      const startN: 1 | -1 = centre(sx) < sy ? 1 : -1;
      const busy: [number, number, number][] = [[gorgeX - 12, gorgeX + 12, 0], [sx - 18, sx + 18, startN]];
      if (braided) busy.push([headX - 16, W, 0]);
      for (let k = 0; k < tributaries; k++) {
        const d = tribDraws[k];
        const tside = (k % 2 === 0 ? -startN : startN) as 1 | -1;
        const free: number[] = [];
        for (let x = 10; x <= W - 12; x++) if (!busy.some(([a, b, sd]) => x >= a && x <= b && (sd === 0 || sd === tside))) free.push(x);
        if (!free.length) break;
        const xj = free[Math.min(free.length - 1, Math.floor(d.at * free.length))];
        busy.push([xj - 16, xj + 16, 0]);
        const tr = tributary(k, tside, xj, d, river, centre, t, tribFlow, W, H, id, halfWidth);
        tribFeatures.push(...tr.features);
        tribRivers.push(tr.river);
      }

      // ---- a delta (PLAN §8): the river ends in a head pool 2 deep, and 2–4 channels fan out from
      // it across a low plain to the east edge, their mouths over 30–60% of it
      const delta = deltaDraws ? deltaOf(deltaDraws, river, headX, centre, t, W, H, id) : null;
      if (delta) river.params.exit = { lake: delta.pool.id };

      const features: Feature[] = [
        river,
        ...(delta ? delta.channels : []),
        ...tribRivers,
        valley,
        terraces(1, "north"),
        terraces(-1, "south"),
        ...(delta ? [delta.plain] : []),
        ...tribFeatures,
        lake,
        ...(delta ? [delta.pool] : []),
        damSite,
        ...narrows,
        ...falls,
        start,
      ];
      return { features, river, lake, start, damSite, floorTop };
    };

    const lowMin = -(lowFloor0 - 1);
    const fitted = fitRelief(make, t.range, W, H, seed, { min: lowMin, max: maxLowBed - (lowFloor0 - 1) });
    if (!fitted) throw new Error(`${archetype}: no layout`);
    const { river, lake, start, damSite } = fitted;
    const layout = fitted.features;

    // regeneration (PLAN §7.0): the layout stays off the player's features, locks and keep-out
    // regions; a layout that touches them is drawn again from the same stream
    if (context?.protect) {
      const hit = layoutConflict(context.protect, W, H, river, lake, start, damSite, layout);
      if (hit) {
        if (tryN + 1 < MAX_LAYOUT_TRIES) continue;
        throw new PlanConflict(`the ${archetype === "canyon" ? "canyon" : "river valley"} could not keep ${hit} off your features, locks and keep-out areas (${MAX_LAYOUT_TRIES} layouts tried)`);
      }
    }

    // ------------------------------------------------------------------ on the built ground
    const extrasRng = stream(seed, "extras", candidate, attempt);
    const others = context?.features ?? [];
    let ground = groundOf(W, H, seed, [...layout, ...others]);
    const [sx, sy] = start.params.position;
    const zone = { x: sx, y: sy, radius: Math.max(start.params.benchRadius, START_CLEAR_RADIUS) + 1 };
    // nothing may cut the dam site's band: its ridge seals into the ground at both ends
    const band = damBandMask(W, H, river, damSite, 4);
    const avoid = keepOff(W, H, ground, lake, zone, context?.protect ?? null, 10, band);
    // ponds may lie near the start (drinking water and storage), off its zone
    const pondsAvoid = keepOff(W, H, ground, lake, zone, context?.protect ?? null, 2, band);
    // and off the bench's strip to the bank, with a margin
    markBench(start, W, H, 3, avoid, pondsAvoid);

    // the pre-built weir (PLAN §5.7, §9.1 variants; D72): on half the maps a NaturalDam line across
    // the channel at the dam site holds the river 0.65 above its bed upstream (not in a canyon's
    // narrows, where the water it holds back floods the canyon floor). Where the main river carries
    // too much water per tile for it (its water would top the banks), a smaller river takes it,
    // below (after the Highlands' stream is planned).
    const wantWeir = !A.narrows && stream(seed, "weir", candidate, attempt).float() < 0.5;
    let hasWeir = false;
    if (wantWeir) {
      const w = weirAt(ground, river, damSite, t.rivers, id);
      if (w) {
        layout.splice(layout.indexOf(start), 0, w);
        ground = groundOf(W, H, seed, [...layout, ...others]);
        hasWeir = true;
      }
    }

    // Canyon: a stair climbs the wall right behind the start (PLAN §8: slope chains up the walls
    // near the start), a terraced cliff of 2-deep steps with a slope on each
    if (A.stairs) {
      const keep = ground.protect.slice();
      if (context?.protect) for (let i = 0; i < keep.length; i++) if (context.protect[i]) keep[i] = 1;
      const st = planStairs(ground, river, start, keep, id);
      if (st) {
        layout.splice(layout.indexOf(start), 0, st);
        ground = groundOf(W, H, seed, [...layout, ...others]);
        const tiles = BUILDERS.terracedCliffs!.area!(st, W, H, layout);
        for (const i of tiles)
          for (const a of [avoid, pondsAvoid])
            for (let dy = -3; dy <= 3; dy++)
              for (let dx = -3; dx <= 3; dx++) {
                const x = (i % W) + dx;
                const y = Math.floor(i / W) + dy;
                if (x >= 0 && y >= 0 && x < W && y < H) a[y * W + x] = 1;
              }
      }
    }

    // a delta's head pool is kept clear like the basin
    if (braided) {
      for (const f of layout) {
        if (f.kind !== "lake" || f.role !== "lake/delta/head") continue;
        const m = polygonMask(f.params.outline, W, H);
        for (let i = 0; i < m.length; i++) {
          if (!m[i]) continue;
          const x = i % W;
          const y = (i - x) / W;
          for (let dy = -3; dy <= 3; dy++)
            for (let dx = -3; dx <= 3; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < W && yy < H) avoid[yy * W + xx] = pondsAvoid[yy * W + xx] = 1;
            }
        }
      }
    }

    // Highlands: plateaus rise on the terraces, and a stream from a spring on the highest cascades
    // down to the river (PLAN §8)
    if (plateauDraws) {
      const hl = highlandsOf(plateauDraws, ground, river, zone, band, context?.protect ?? null, t, halfWidth, id, [...layout, ...others]);
      if (hl.length) {
        layout.splice(layout.indexOf(start), 0, ...hl);
        ground = groundOf(W, H, seed, [...layout, ...others]);
        for (const f of hl) {
          const tiles: number[] = [];
          if (f.kind === "landform" && f.params.outline) {
            const m = polygonMask(f.params.outline, W, H);
            for (let i = 0; i < m.length; i++) if (m[i]) tiles.push(i);
          } else if (f.kind === "river") {
            const fl = pathField(f.params.path, W, H);
            for (let i = 0; i < W * H; i++) if (fl.d[i] < f.params.width / 2 + 2) tiles.push(i);
          }
          for (const i of tiles) avoid[i] = pondsAvoid[i] = 1;
        }
      }
    }

    // badwater basins first: their outlets join the river below the first step downstream of the
    // start's reach (the canonical pre-fill spreads badwater along a flat reach, so it must not
    // share the start's), and far enough that the rest of the river keeps its distance. A delta's
    // run to a map edge: its channels are level with its head pool, beside the start.
    const fromStep = firstStepAfter(river, arcAtX(river.params.path, hard ? fallsX - 1 : gorgeX));
    const reachFrom = Math.max(fromStep + 4, farReach(river.params.path, sx, sy, t.badwaterDistance + 12));
    const bad = placeBadwater({
      rng: extrasRng,
      ground,
      t,
      drains: braided ? [] : [reachOf(river, reachFrom)],
      avoid: withChannelBanks(avoid, ground),
      noRoute: noRouteMask(W, H, lake, [], context?.protect ?? null, band),
      start: { x: sx, y: sy },
      idOf: (k) => ({ id: id("setPiece", `setpiece/badwaterBasin/${k}`), role: `setpiece/badwaterBasin/${k}` }),
    });
    // the reaches below the lowest bed badwater reaches take it in: no pond there
    let tainted = -1;
    if (bad.length) {
      layout.splice(layout.indexOf(start), 0, ...bad);
      ground = groundOf(W, H, seed, [...layout, ...others]);
      for (const b of bad) {
        const p = b.params.plan as { outlet: number[]; outletTo: string; x: number; y: number };
        for (let yy = p.y - 3; yy <= p.y + 5; yy++) for (let xx = p.x - 3; xx <= p.x + 5; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) pondsAvoid[yy * W + xx] = 1;
        for (let k = 0; k + 1 < p.outlet.length; k += 2) {
          for (let dy = -3; dy <= 3; dy++)
            for (let dx = -3; dx <= 3; dx++) {
              const xx = p.outlet[k] + dx;
              const yy = p.outlet[k + 1] + dy;
              if (xx >= 0 && yy >= 0 && xx < W && yy < H) pondsAvoid[yy * W + xx] = 1;
            }
        }
        if (p.outletTo === river.id) {
          const n = p.outlet.length;
          const s = arcAtX(river.params.path, p.outlet[n - 2]);
          tainted = Math.max(tainted, bedAt(river.params.bedProfile, s));
        }
      }
    }

    // ponds (Lakes and basins), on reaches the badwater never reaches; Plenty asks some within
    // reach of the start
    const ponds = placeRiversidePonds({
      rng: extrasRng,
      ground,
      rivers: layout.filter((f): f is RiverFeature => f.kind === "river"),
      count: t.basins,
      avoid: pondsAvoid,
      near: t.reserve >= 3 ? { x: sx, y: sy, count: Math.min(2, t.basins) } : undefined,
      floorDepth: hard ? 3 : 2,
      minSill: tainted + 1,
      idOf: (k) => ({ id: id("lake", `lake/pond/${k}`), role: `lake/pond/${k}` }),
    });
    if (ponds.length) layout.splice(layout.indexOf(start), 0, ...ponds);

    // the weir on a smaller river (a tributary, Highlands' stream), 8 tiles above its mouth, where
    // its water per tile is small enough (not a delta's channel: the head pool would send its water
    // down the others, and the weir would only stop it)
    if (wantWeir && !hasWeir) {
      const w = smallRiverWeir(ground, layout, id);
      if (w) {
        layout.splice(layout.indexOf(start), 0, w);
        ground = groundOf(W, H, seed, [...layout, ...others]);
      }
    }

    // ------------------------------------------------------------------ objects and resources on the settled water
    const resources = objectsAndResources(spec, layout, others, context, candidate, attempt, settleCache, band, A.obstacle);
    return [...layout, ...resources];
  }
}

// ----------------------------------------------------------------------- objects and resources

/** The map objects (PLAN §5.4–5.5) and then the resources, both on the layout's settled water: the
 *  objects take their tiles first (and thorn belts stop moisture), so the ground is built again
 *  with them before the resources are planned (the water settle is reused: none of them moves
 *  water). Returns the new features; the objects are also appended to `layout`. */
export function objectsAndResources(
  spec: MapSpec,
  layout: Feature[],
  others: readonly Feature[],
  context: PlanContext | undefined,
  candidate: number,
  attempt: number,
  settleCache: SettleCache | undefined,
  avoid: Uint8Array | null,
  obstacle = false,
): Feature[] {
  const W = spec.size.x;
  const H = spec.size.y;
  const seed = spec.seed;
  const buildWith = (fs: readonly Feature[]) => buildMap({ W, H, seed, features: [...fs, ...others], locked: context?.locked }, { stopBeforeResources: true, settleCache });
  let base = buildWith(layout);
  // a weir whose water spills out of the channel onto the floodplain upstream of it is left out
  // (the estimate in weirOn missed it)
  const weir = layout.findIndex((f) => f.kind === "mapObject" && f.role === "mapObject/weir/primary");
  const on = weir >= 0 ? weirRiver(layout[weir] as MapObjectFeature, layout, W, H) : null;
  if (weir >= 0 && on) {
    const { river: wr, field, at } = on;
    // the river over its banks: wet tiles beside its channel, off every lake and pond
    const lakes = new Uint8Array(W * H);
    for (const f of layout) {
      if (f.kind !== "lake" || f.params.planned) continue;
      const m = polygonMask(f.params.outline, W, H);
      for (let i = 0; i < m.length; i++) if (m[i]) lakes[i] = 1;
    }
    // (the floodplain upstream of the weir, one level above the river's bed there)
    let flooded = false;
    for (let i = 0; i < W * H && !flooded; i++) {
      if (base.channel[i] || lakes[i] || !(base.water[i] > 0.05) || field.d[i] > wr.params.width / 2 + 6) continue;
      const s = field.s[i];
      if (s < at - 60 || s >= at) continue;
      if (base.heights[i] === bedAt(wr.params.bedProfile, s) + 1) flooded = true;
    }
    // the weir blocks walking too: it may not cut the colony's way along the river's bed
    const land = (fs: readonly Feature[]) => startWalkable(buildMap({ W, H, seed, features: [...fs, ...others], locked: context?.locked }, { stopBeforeWater: true }));
    if (!flooded && land(layout) < land(layout.filter((_, k) => k !== weir)) - 60) flooded = true;
    if (flooded) {
      layout.splice(weir, 1);
      base = buildWith(layout);
    }
  }
  // what the colony walks on from the start: an object or a plateau may not cut it off (a mine
  // site in a corridor), beyond the tiles it stands on
  const walked = startWalkable(base);
  const keepsWalk = (b: BuildResult, own: number) => startWalkable(b) >= walked - own - 40;
  // the second district's site (PLAN §9.8, maps of 128² and up): the first candidate whose ground
  // the derived slopes join to the start's
  const avoidAll = avoid ? avoid.slice() : new Uint8Array(W * H);
  if (context?.protect) for (let i = 0; i < avoidAll.length; i++) if (context.protect[i]) avoidAll[i] = 1;
  // the dam site's reservoir: what a dam of its crest would flood, and two tiles round it (a
  // plateau or an object there takes the water the colony stores; water.reservoir, D58)
  const damSite = layout.find((f): f is SetPieceFeature => f.kind === "setPiece" && f.params.kind === "damSite");
  const damRiver = damSite ? layout.find((f): f is RiverFeature => f.kind === "river" && f.id === damSite.params.plan.river) : undefined;
  if (damSite && damRiver) for (const i of reservoirReach(base, damRiver, damSite, 2)) avoidAll[i] = 1;
  const sites: { x: number; y: number }[] = [];
  if (W * H >= 128 * 128) {
    for (const [x, y] of districtCandidates(base, [...layout, ...others], avoidAll, 4)) {
      const ctx: PieceContext = { W, H, seed, features: [...layout, ...others], heights: base.heights, channel: base.channel, water: base.water, contamination: base.contamination, start: base.start ? { x: base.start.x, y: base.start.y, radius: 4 } : null };
      const role = "setpiece/secondDistrict/primary";
      const r = planSetPiece("secondDistrict", { at: [x, y] }, ctx, { id: featureId(seed, "setPiece", role), origin: "generated", role }, true);
      if (!r.ok) continue;
      const b2 = buildWith([...layout, r.feature]);
      if (!walkableFromStart(b2, x, y)) continue;
      layout.push(r.feature);
      base = b2;
      sites.push({ x, y });
      for (const i of districtTiles({ x, y, radius: DISTRICT_RADIUS + 4 }, W, H)) avoidAll[i] = 1;
      break;
    }
  }
  // ruins on a plateau (PLAN §9.4): a plateau two levels above ground the colony walks on, a ruin
  // field on top; one flight of player stairs reaches it
  const keepOffResources = context?.protect ? context.protect.slice() : new Uint8Array(W * H);
  const extraFeatures: Feature[] = [];
  let scrapPlaced = 0;
  if (obstacle) {
    const radius = W * H >= 128 * 128 ? 5 : 4;
    for (const [x, y] of obstacleSpots(base, [...layout, ...others], avoidAll, radius, 3, nearStartTargets(spec).ruinsClear)) {
      const ctx: PieceContext = { W, H, seed, features: [...layout, ...others], heights: base.heights, channel: base.channel, start: base.start ? { x: base.start.x, y: base.start.y, radius: 8 } : null, protect: base.cache.terrain.protect };
      const role = "setpiece/obstaclePayoff/ruins";
      const r = planSetPiece("obstaclePayoff", { at: [x, y], radius, rise: 2 }, ctx, { id: featureId(seed, "setPiece", role), origin: "generated", role }, true);
      if (!r.ok) continue;
      const disc = obstacleTiles({ x, y, radius }, W, H);
      const b2 = buildWith([...layout, r.feature]);
      if (!keepsWalk(b2, disc.length)) continue;
      // a reward worth the climb: a field of the taller kind (resources/baseline.ts)
      const fr = "ruinField/obstacle";
      const fid = featureId(seed, "ruinField", fr);
      const tallness = 0.5;
      scrapPlaced = ruinColumns(disc, W, stream(seed, fid, "heights"), tallness).scrap;
      layout.push(r.feature);
      extraFeatures.push({ id: fid, kind: "ruinField", origin: "generated", role: fr, locked: false, params: { area: tilesToRuns(disc, W), scrapTarget: scrapPlaced, heightMix: [...RUIN_HEIGHT_SHARES], centerBias: 0, layout: { tallness } } });
      for (const i of obstacleTiles({ x, y, radius: radius + 3 }, W, H)) avoidAll[i] = keepOffResources[i] = 1;
      base = b2;
      break;
    }
  }
  const objects = planExtras({ spec, base, features: [...layout, ...others], protect: context?.protect ?? null, avoid: avoidAll, candidate, attempt });
  if (objects.length) {
    const before = startWalkable(base);
    let b2 = buildWith([...layout, ...objects]);
    // objects that cut the colony's land in two go (the thorn belts, then the biggest first)
    const own = (f: MapObjectFeature) => objectTiles(f, W, H).length;
    const kept = objects.slice();
    const total = () => kept.reduce((a, f) => a + own(f), 0);
    while (kept.length && startWalkable(b2) < before - total() - 40) {
      kept.sort((a, c) => (a.params.kind === "thornBelt" ? 0 : 1) - (c.params.kind === "thornBelt" ? 0 : 1) || own(c) - own(a));
      kept.shift();
      b2 = buildWith([...layout, ...kept]);
    }
    layout.push(...kept);
    base = b2;
  }
  const constraints = { protect: keepOffResources, lockedMask: context?.locked?.mask ?? null, scrapPlaced };
  return [...extraFeatures, ...planResources(spec, base, candidate, attempt, constraints, sites)];
}

/** Dry tiles the colony walks on from the start: same level, the built slopes, round the objects
 *  that block walking (the `start.reach` rule of the playability checks). */
export function startWalkable(b: BuildResult): number {
  if (!b.start) return 0;
  const { W, H } = b;
  const N = W * H;
  const links: [number, number][] = [];
  const blocked = new Uint8Array(N);
  for (const e of b.entities) {
    if (WALK_BLOCKERS.has(e.template)) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([e.y * W + e.x, hy * W + hx]);
  }
  const labels = walkRegions(b.heights, W, H, blocked, links);
  const root = labels[b.start.y * W + b.start.x];
  let n = 0;
  for (let i = 0; i < N; i++) if (root >= 0 && labels[i] === root && !(b.water[i] > 0.05)) n++;
  return n;
}

/** Whether (x, y) is on ground the colony can walk to from the start (same level, and the built
 *  slopes). */
function walkableFromStart(b: BuildResult, x: number, y: number): boolean {
  if (!b.start) return false;
  const { W, H } = b;
  const links: [number, number][] = [];
  for (const e of b.entities) {
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([e.y * W + e.x, hy * W + hx]);
  }
  const labels = walkRegions(b.heights, W, H, null, links);
  return labels[b.start.y * W + b.start.x] >= 0 && labels[b.start.y * W + b.start.x] === labels[y * W + x];
}

// ---------------------------------------------------------------------------------- the weir

/** A weir (NaturalDam line) across the river's channel at the dam site: the channel's tiles whose
 *  arc position is within half a tile of the ridge's centre. A slab one tile thick across the flow
 *  leaves no side-to-side gap, so the water stands 0.65 above the bed upstream before it spills. */
export function weirAt(g: PlanGround, river: RiverFeature, damSite: SetPieceFeature, flows: number, id: (kind: Feature["kind"], role: string) => string): MapObjectFeature | null {
  return weirOn(g, river, Number(damSite.params.plan.at), river.params.flow * (1 + 0.25 * Math.max(0, flows - 1)), id, "mapObject/weir/primary");
}

/** The tiles a dam of the dam site's crest would flood, upstream of it, and `margin` round them. */
function reservoirReach(b: BuildResult, river: RiverFeature, dam: SetPieceFeature, margin: number): number[] {
  const { W, H } = b;
  const N = W * H;
  const at = Number(dam.params.plan.at);
  const crest = Math.max(1, Number(dam.params.plan.crest ?? 1));
  const top = bedAt(river.params.bedProfile, at) + crest;
  const field = pathField(river.params.path, W, H);
  const half = river.params.width / 2;
  const seen = new Uint8Array(N);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) {
    if (field.d[i] < half && field.s[i] >= at - 4 && field.s[i] < at && b.heights[i] < top) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    const next = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const j of next) {
      if (j < 0 || seen[j] || b.heights[j] >= top || field.s[j] > at) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    let near = false;
    for (let dy = -margin; dy <= margin && !near; dy++)
      for (let dx = -margin; dx <= margin && !near; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && seen[yy * W + xx]) near = true;
      }
    if (near) out.push(i);
  }
  return out;
}

/** A weir on a smaller river: a tributary or Highlands' stream, 8 tiles above its mouth (then 14),
 *  the first that fits. */
function smallRiverWeir(g: Pick<PlanGround, "W" | "H" | "channel">, layout: readonly Feature[], id: (kind: Feature["kind"], role: string) => string): MapObjectFeature | null {
  for (const f of layout) {
    if (f.kind !== "river" || f.params.badwater || !f.role || !/^river\/(tributary|stream)\//.test(f.role)) continue;
    const len = pathLength(f.params.path);
    for (const back of [8, 14]) {
      if (len - back < 6) continue;
      const w = weirOn(g, f, round(len - back, 2), f.params.flow, id, "mapObject/weir/primary");
      if (w) return w;
    }
  }
  return null;
}

/** The river a weir stands across, its field, and the weir's arc position on it. */
function weirRiver(w: MapObjectFeature, layout: readonly Feature[], W: number, H: number): { river: RiverFeature; field: ReturnType<typeof pathField>; at: number } | null {
  const tiles = objectTiles(w, W, H).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
  if (!tiles.length) return null;
  let best: { river: RiverFeature; field: ReturnType<typeof pathField>; at: number } | null = null;
  let bd = Infinity;
  for (const f of layout) {
    if (f.kind !== "river") continue;
    const field = pathField(f.params.path, W, H);
    let d = 0;
    let s = 0;
    for (const [x, y] of tiles) {
      d += field.d[y * W + x];
      s += field.s[y * W + x];
    }
    if (d < bd) {
      bd = d;
      best = { river: f, field, at: s / tiles.length };
    }
  }
  return best;
}

function pathLength(path: readonly Point[]): number {
  let len = 0;
  for (let k = 1; k < path.length; k++) {
    const dx = path[k][0] - path[k - 1][0];
    const dy = path[k][1] - path[k - 1][1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

/** A weir across a river's channel at arc position `at`, carrying `flow`, or null when it would not
 *  fit (see weirAt). */
export function weirOn(g: Pick<PlanGround, "W" | "H" | "channel">, river: RiverFeature, at: number, flow: number, id: (kind: Feature["kind"], role: string) => string, role: string): MapObjectFeature | null {
  const { W, H } = g;
  const field = pathField(river.params.path, W, H);
  const half = river.params.width / 2;
  const tiles: number[] = [];
  for (let i = 0; i < W * H; i++) if (g.channel[i] && field.d[i] < half + 1 && Math.abs(field.s[i] - at) <= 0.5) tiles.push(i);
  if (tiles.length < 2 || tiles.length > 16) return null;
  // the water spills over the weir about 0.3·q deep (q the flow per tile across it, PLAN §9.2): it
  // must stay below the floodplain one level above the bed, or the weir floods the valley floor
  if (0.65 + (0.35 * flow) / tiles.length > 0.93) return null;
  return { id: id("mapObject", role), kind: "mapObject", origin: "generated", role, locked: false, params: { kind: "weir", placement: { area: tilesToRuns(tiles, W) } } };
}

// ---------------------------------------------------------------------------------- highlands

/** Highlands (PLAN §8): 2–4 plateaus on the terraces, each 2–4 levels above the ground under it with
 *  a cliff all round (reaching one takes stairs), at different levels; then a stream from a spring
 *  on the highest runs down to the river, planned as the editor plans a drawn river (its bed follows
 *  the ground down, so it falls over the plateau's cliff and the terraces' steps). */
function highlandsOf(
  d: { n: number; each: { u: number; r: number; rise: number; shape: number }[] },
  g: PlanGround,
  main: RiverFeature,
  zone: { x: number; y: number; radius: number },
  band: Uint8Array,
  protect: Uint8Array | null,
  t: LayoutTargets,
  halfWidth: number,
  id: (kind: Feature["kind"], role: string) => string,
  features: readonly Feature[],
): Feature[] {
  const { W, H } = g;
  const N = W * H;
  const field = pathField(main.params.path, W, H);
  const taken = new Uint8Array(N);
  const plateaus: { f: LandformFeature; cx: number; cy: number; r: number; height: number }[] = [];
  const side = Math.min(W, H);
  for (let k = 0; k < d.n; k++) {
    const e = d.each[k];
    const r = Math.max(5, round(0.06 * side * e.r, 2));
    const R = Math.ceil(r) + 1;
    const cands: number[] = [];
    for (let y = R + 3; y < H - R - 3; y++)
      for (let x = R + 3; x < W - R - 3; x++) {
        const i = y * W + x;
        if (field.d[i] < halfWidth + 8 + r || taken[i] || band[i] || protect?.[i]) continue;
        if (Math.abs(x - zone.x) <= zone.radius + 12 + r && Math.abs(y - zone.y) <= zone.radius + 12 + r) continue;
        cands.push(i);
      }
    let placed = false;
    for (let q = 0; q < 24 && cands.length && !placed; q++) {
      const v = (e.u + q * 0.6180339887) % 1;
      const c = cands[Math.floor(v * cands.length)];
      const cx = c % W;
      const cy = (c - cx) / W;
      // the disc and a tile round it: no river, set piece, dam band or other plateau
      let level = 0;
      let ok = true;
      for (let y = cy - R; y <= cy + R && ok; y++)
        for (let x = cx - R; x <= cx + R && ok; x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > R * R) continue;
          const i = y * W + x;
          if (g.channel[i] || g.protect[i] || band[i] || taken[i] || protect?.[i]) ok = false;
          else if (g.heights[i] > level) level = g.heights[i];
        }
      const height = Math.min(t.top, level + e.rise);
      if (!ok || height < level + 2) continue;
      const outline: Point[] = [];
      for (let j = 0; j < 12; j++) {
        const a = j / 6;
        const rr = r * (1 + 0.15 * sinDet(3 * a * PI + TWO_PI * e.shape));
        outline.push([round(cx + rr * cosDet(a * PI), 2), round(cy + rr * sinDet(a * PI), 2)]);
      }
      const role = `landform/plateau/${k}`;
      const f: LandformFeature = { id: id("landform", role), kind: "landform", origin: "generated", role, locked: false, params: { kind: "plateau", edgeStyle: "cliff", outline, height } };
      plateaus.push({ f, cx, cy, r, height });
      const keep = R + 8;
      for (let y = Math.max(0, cy - keep); y <= Math.min(H - 1, cy + keep); y++) for (let x = Math.max(0, cx - keep); x <= Math.min(W - 1, cx + keep); x++) taken[y * W + x] = 1;
      placed = true;
    }
  }
  const out: Feature[] = plateaus.map((p) => p.f);
  if (!plateaus.length) return out;
  // the stream: from a spring on the highest plateau straight to the nearest reach of the river,
  // away from the start, the dam site's band and the map's edges
  const ground = groundOf(W, H, g.seed, [...features, ...out]);
  const top = plateaus.reduce((a, p) => (p.height > a.height ? p : a), plateaus[0]);
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < N; i++) {
    if (!ground.channel[i] || band[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (Math.abs(x - zone.x) <= zone.radius + 8 && Math.abs(y - zone.y) <= zone.radius + 8) continue;
    if (field.d[i] > main.params.width / 2) continue; // the main river's own channel
    const dd = (x - top.cx) * (x - top.cx) + (y - top.cy) * (y - top.cy);
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  if (best < 0) return out;
  const jx = best % W;
  const jy = (best - jx) / W;
  const ctx: PieceContext = {
    W,
    H,
    seed: g.seed,
    features: [...features, ...out],
    heights: ground.heights,
    channel: ground.channel,
    start: zone,
    protect: ground.protect,
    locked: protect,
  };
  const role = "river/stream/0";
  const r = planRiver({ points: [[top.cx, top.cy], [jx, jy]], flow: round(0.25 * t.flow, 2) }, ctx, id("river", role), "generated");
  if (r.ok && r.feature.kind === "river") out.push({ ...r.feature, role });
  return out;
}

// ---------------------------------------------------------------------------------- the delta

/** A delta below the gorge (PLAN §8): the river ends in a head pool 2 deep (its water stays through
 *  a drought), and 2–4 channels leave the pool at its level and fan out across a low plain, one
 *  above the channels' beds, to the east edge, their mouths over 30–60% of it. The channels share
 *  the river's water by how it flows; each is sized for its share. */
function deltaOf(
  d: { n: number; spread: number; wiggle: number[] },
  main: RiverFeature,
  headX: number,
  centre: (x: number) => number,
  t: LayoutTargets,
  W: number,
  H: number,
  id: (kind: Feature["kind"], role: string) => string,
): { pool: LakeFeature; channels: RiverFeature[]; plain: LandformFeature } {
  const path = main.params.path;
  const end = path[path.length - 1];
  const bp = main.params.bedProfile;
  const L = bp.start - bp.steps.reduce((a, s) => a + s.drop, 0);
  const rx = Math.max(5, Math.round(0.045 * W));
  const ry = Math.max(4, Math.round(0.04 * H));
  const cx = end[0] + rx - 1;
  const cy = end[1];
  const outline: Point[] = [];
  for (let k = 0; k < 16; k++) outline.push([round(cx + rx * cosDet((k / 8) * PI), 2), round(cy + ry * sinDet((k / 8) * PI), 2)]);
  const poolId = id("lake", "lake/delta/head");
  const n = d.n;
  const span = d.spread * H;
  const lo = Math.min(H - 11 - span, Math.max(10, centre(W - 1) - span / 2));
  const flow = round(t.flow / n, 2);
  const width = riverWidth(flow, W, H);
  const channels: RiverFeature[] = [];
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let k = 0; k < n; k++) {
    const ey = round(lo + (span * (k + 0.5)) / n, 2);
    yMin = Math.min(yMin, ey);
    yMax = Math.max(yMax, ey);
    const dx = W - 1 - cx;
    const dy = ey - cy;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const x0 = cx + ux * rx * 0.8;
    const y0 = cy + uy * ry * 0.8;
    const pts: Point[] = [];
    for (let q = 0; q <= 6; q++) {
      const u = q / 6;
      const w = d.wiggle[k] * 3 * sinDet(PI * u);
      pts.push([round(x0 + (W - 1 - x0) * u - uy * w, 2), round(y0 + (ey - y0) * u + ux * w, 2)]);
    }
    pts[6] = [W - 1, ey];
    const role = `river/distributary/${k}`;
    channels.push({
      id: id("river", role),
      kind: "river",
      origin: "generated",
      role,
      locked: false,
      params: {
        path: pts,
        width,
        bedDepth: 1,
        bedProfile: { start: L, steps: [] },
        flow,
        style: "braided",
        meander: 0,
        entry: { lake: poolId },
        exit: { edge: "east" },
        badwater: false,
      },
    });
  }
  const pool: LakeFeature = {
    id: poolId,
    kind: "lake",
    origin: "generated",
    role: "lake/delta/head",
    locked: false,
    params: {
      outline,
      floorDepth: 2,
      outlet: { at: [round(cx + rx, 2), round(cy, 2)], sill: L, to: "river", target: channels[0].id },
      inflow: { rivers: [main.id] },
      planned: false,
    },
  };
  const top = Math.max(2, Math.min(cy - ry - 6, yMin - 8));
  const bottom = Math.min(H - 3, Math.max(cy + ry + 6, yMax + 8));
  const plain: LandformFeature = {
    id: id("landform", "landform/delta"),
    kind: "landform",
    origin: "generated",
    role: "landform/delta",
    locked: false,
    params: {
      kind: "valley",
      edgeStyle: "cliff",
      outline: [
        [round(headX - 4, 2), round(Math.max(2, cy - ry - 6), 2)],
        [W, round(top, 2)],
        [W, round(bottom, 2)],
        [round(headX - 4, 2), round(Math.min(H - 3, cy + ry + 6), 2)],
      ],
      height: L + 1,
    },
  };
  return { pool, channels, plain };
}

// ---------------------------------------------------------------------------------- tributaries

function tributary(
  k: number,
  side: 1 | -1,
  xj: number,
  d: { wiggle: number; x2: number; steps: number },
  main: RiverFeature,
  centre: (x: number) => number,
  t: LayoutTargets,
  flow: number,
  W: number,
  H: number,
  id: (kind: Feature["kind"], role: string) => string,
  mainHalf: number,
): { river: RiverFeature; features: Feature[] } {
  const role = `river/tributary/${k}`;
  const rid = id("river", role);
  const yEdge = side > 0 ? H - 1 : 0;
  const yj = centre(xj);
  const xe = Math.min(W - 10, Math.max(10, round(xj + d.x2, 2)));
  // from the edge to the main river's centreline, gently bent
  const path: Point[] = [];
  const n = 6;
  for (let q = 0; q <= n; q++) {
    const u = q / n;
    const x = xe + (xj - xe) * u + d.wiggle * 6 * sinDet(PI * u);
    const y = yEdge + (yj - yEdge) * u;
    path.push([round(x, 2), round(y, 2)]);
  }
  let len = 0;
  for (let q = 0; q + 1 < path.length; q++) {
    const dx = path[q + 1][0] - path[q][0];
    const dy = path[q + 1][1] - path[q][1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  // its bed joins the main river's bed and climbs to 3 below the highest terrain at the edge, in
  // 1-level steps (2-level falls when the waterfalls are Many) outside the main valley floor
  const sj = arcAtX(main.params.path, xj);
  const joinBed = bedAt(main.params.bedProfile, sj);
  const climb = Math.max(0, t.top - 3 - joinBed);
  const steps: BedStep[] = [];
  const upper = len - (mainHalf + 10); // arc positions from the edge; the lower end stays flat
  if (climb > 0 && upper > 6) {
    const dropEach = t.waterfalls === "many" ? 2 : 1;
    const count = Math.ceil(climb / dropEach);
    let left = climb;
    for (let q = 0; q < count; q++) {
      const at = round(4 + ((upper - 4) * (q + 0.5 + 0.3 * (d.steps - 0.5))) / count, 2);
      const dr = Math.min(dropEach, left);
      left -= dr;
      steps.push({ at, drop: dr });
    }
  }
  const width = Math.max(3, Math.min(6, round(riverWidth(flow, W) * 0.7, 2)));
  const river: RiverFeature = {
    id: rid,
    kind: "river",
    origin: "generated",
    role,
    locked: false,
    params: {
      path,
      width,
      bedDepth: 1,
      bedProfile: { start: joinBed + steps.reduce((a, s) => a + s.drop, 0), steps },
      flow,
      style: "meandering",
      meander: 0,
      entry: { edge: side > 0 ? "north" : "south" },
      exit: { river: main.id },
      badwater: false,
    },
  };
  const valley: LandformFeature = {
    id: id("landform", `landform/valley/tributary/${k}`),
    kind: "landform",
    origin: "generated",
    role: `landform/valley/tributary/${k}`,
    locked: false,
    params: { kind: "valley", edgeStyle: "cliff", along: { river: rid, halfWidth: round(width / 2 + 3, 2), floorAboveBed: 1 } },
  };
  return { river, features: [valley] };
}

// ---------------------------------------------------------------------------------- stairs

/** The stair beside the start (Canyon): a flight of 1-level steps with a slope on each, one tile
 *  wide, running along the foot of the canyon wall from the floor up to the wall's top. It starts a
 *  couple of tiles past the start's bench, on the side where the wall's foot runs straight. */
function planStairs(g: PlanGround, river: RiverFeature, start: StartFeature, keep: Uint8Array, id: (kind: Feature["kind"], role: string) => string): SetPieceFeature | null {
  const { W, H, heights: h } = g;
  const [sx, sy] = start.params.position;
  const field = pathField(river.params.path, W, H);
  const away = field.side[sy * W + sx]; // +1: the start is left of the flow (north for a west-east river)
  const dy = away > 0 ? 1 : -1;
  const floor = start.params.benchLevel - 1;
  const r = start.params.benchRadius;
  const wallRow = (x: number): number => {
    let y = sy;
    while (y > 1 && y < H - 2 && h[y * W + x] <= floor + 1) y += dy;
    return y;
  };
  const role = "setpiece/terracedCliffs/stairs";
  const ctx: PieceContext = { W, H, seed: g.seed, features: [river], heights: h, channel: g.channel, start: { x: sx, y: sy, radius: r - 1 }, locked: keep };
  for (const dir of [1, -1]) {
    for (let off = r + 2; off <= r + 8; off++) {
      const x0 = sx + dir * off;
      const yw = wallRow(x0);
      if (yw <= 1 || yw >= H - 2) continue;
      const rise = h[yw * W + x0] - floor;
      if (rise < 2 || rise > 8) continue;
      const yf = yw - dy;
      // the floor in front of the flight two tiles deep, no river under it, and the wall's top
      // beside its last step at that step's level
      let ok = true;
      for (let k = -2; k < rise && ok; k++) {
        const x = x0 + dir * k;
        if (x < 1 || x > W - 2 || g.channel[yf * W + x]) ok = false;
        else if (k < 0) ok = h[yf * W + x] === floor;
      }
      if (!ok || h[yw * W + x0 + dir * (rise - 1)] !== floor + rise) continue;
      const facing = dir > 0 ? "west" : "east";
      const res = planSetPiece("terracedCliffs", { at: [x0, yf], facing, bands: rise, depth: 1, width: 1, stair: true }, ctx, { id: id("setPiece", role), origin: "generated", role }, true);
      if (res.ok) return res.feature;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------- helpers

/** Tiles ponds and basins keep off: the start's zone and a margin, the reservoir basin, the
 *  set pieces' protected tiles, the map's border, and the player's protected tiles. */
function keepOff(W: number, H: number, g: PlanGround, lake: LakeFeature, zone: { x: number; y: number; radius: number }, protect: Uint8Array | null, margin: number, band: Uint8Array): Uint8Array {
  const N = W * H;
  const avoid = band.slice();
  const basin = polygonMask(lake.params.outline, W, H);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (basin[i] || g.protect[i] || protect?.[i] || x < 3 || y < 3 || x > W - 4 || y > H - 4) avoid[i] = 1;
    if (Math.abs(x - zone.x) <= zone.radius + margin && Math.abs(y - zone.y) <= zone.radius + margin) avoid[i] = 1;
  }
  return avoid;
}

/** The arc position of the first bed step at or after `s` on a river (its length when none). */
function firstStepAfter(r: RiverFeature, s: number): number {
  let best = Infinity;
  for (const st of r.params.bedProfile.steps) if (st.at >= s && st.at < best) best = st.at;
  if (best < Infinity) return best;
  let len = 0;
  const p = r.params.path;
  for (let k = 0; k + 1 < p.length; k++) len += Math.sqrt((p[k + 1][0] - p[k][0]) * (p[k + 1][0] - p[k][0]) + (p[k + 1][1] - p[k][1]) * (p[k + 1][1] - p[k][1]));
  return len;
}

/** Tiles a badwater outlet may not cross: the reservoir basin, the ponds and the player's tiles. */
function noRouteMask(W: number, H: number, lake: LakeFeature, ponds: readonly LakeFeature[], protect: Uint8Array | null, band: Uint8Array): Uint8Array {
  const out = polygonMask(lake.params.outline, W, H);
  for (let i = 0; i < out.length; i++) if (band[i]) out[i] = 1;
  for (const p of ponds) {
    const m = polygonMask(p.params.outline, W, H);
    for (let i = 0; i < m.length; i++) if (m[i]) out[i] = 1;
  }
  if (protect) for (let i = 0; i < out.length; i++) if (protect[i]) out[i] = 1;
  return out;
}

/** The avoid mask with every river channel and its banks added. */
function withChannelBanks(avoid: Uint8Array, g: PlanGround): Uint8Array {
  const { W, H } = g;
  const out = avoid.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!g.channel[y * W + x]) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) out[(y + dy) * W + x + dx] = 1;
    }
  return out;
}

/** The arc position from which the whole rest of a river keeps at least `d` from (x, y): the reach
 *  a badwater outlet may join, so badwater never flows back past the start on a meander. */
export function farReach(path: Point[], x: number, y: number, d: number): number {
  let total = 0;
  for (let k = 0; k + 1 < path.length; k++) total += Math.sqrt((path[k + 1][0] - path[k][0]) * (path[k + 1][0] - path[k][0]) + (path[k + 1][1] - path[k][1]) * (path[k + 1][1] - path[k][1]));
  let from = total;
  for (let s = total; s >= 0; s -= 1) {
    const p = pointAtArc(path, s).p;
    if ((p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y) < d * d) break;
    from = s;
  }
  return from;
}

/** Distance from (x, y) to a polyline. */
/** Mark the start's bench (its disc and its strip to the bank), grown by `margin` tiles. */
export function markBench(start: StartFeature, W: number, H: number, margin: number, ...masks: Uint8Array[]): void {
  const [cx, cy] = start.params.position;
  const bank = start.params.bank ?? start.params.position;
  const r = start.params.benchRadius + margin + 2;
  const x0 = Math.max(0, Math.floor(Math.min(cx - r, bank[0] - margin - 2)));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(cx + r, bank[0] + margin + 2)));
  const y0 = Math.max(0, Math.floor(Math.min(cy - r, bank[1] - margin - 2)));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(cy + r, bank[1] + margin + 2)));
  const bench = new Uint8Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inBench(start, x, y)) bench[y * W + x] = 1;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!bench[y * W + x]) continue;
      for (let dy = -margin; dy <= margin; dy++)
        for (let dx = -margin; dx <= margin; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) for (const m of masks) m[yy * W + xx] = 1;
        }
    }
}

function distToPath(path: Point[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i];
    const vx = path[i + 1][0] - ax;
    const vy = path[i + 1][1] - ay;
    const l2 = vx * vx + vy * vy;
    let u = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
    const px = ax + u * vx - x;
    const py = ay + u * vy - y;
    const d = px * px + py * py;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export type { Rng };

/** The dam site's band across the valley (damSite.ts), `margin` tiles wider along the river: the
 *  ridge and the ground its ends seal into. */
export function damBandMask(W: number, H: number, river: RiverFeature, dam: SetPieceFeature, margin: number): Uint8Array {
  const out = new Uint8Array(W * H);
  const plan = dam.params.plan as { at: number; thickness: number; wobble: number };
  const path = river.params.path;
  const c = pointAtArc(path, plan.at).p;
  const ax = path[path.length - 1][0] - path[0][0];
  const ay = path[path.length - 1][1] - path[0][1];
  const al = Math.sqrt(ax * ax + ay * ay) || 1;
  const half = plan.thickness / 2 + plan.wobble + margin;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const along = ((x - c[0]) * ax + (y - c[1]) * ay) / al;
      if (Math.abs(along) <= half) out[y * W + x] = 1;
    }
  return out;
}

/** What of a drawn layout lands on protected tiles (PLAN §7.0): the channel with a tile of bank,
 *  the basin, the dam ridge across the valley floor, a tributary, or the start with its bench and
 *  clear zone. */
function layoutConflict(
  protect: Uint8Array,
  W: number,
  H: number,
  river: RiverFeature,
  lake: LakeFeature,
  start: StartFeature,
  dam: SetPieceFeature,
  features: readonly Feature[],
): string | null {
  const N = W * H;
  for (const r of features) {
    if (r.kind !== "river") continue;
    const field = pathField(r.params.path, W, H);
    const bank = r.params.width / 2 + 1;
    for (let i = 0; i < N; i++) if (protect[i] && field.d[i] < bank) return r.id === river.id ? "the river" : "a tributary";
  }
  const basin = polygonMask(lake.params.outline, W, H);
  for (let i = 0; i < N; i++) if (protect[i] && basin[i]) return "the basin";
  const [cx, cy] = start.params.position;
  const r = Math.max(start.params.benchRadius, START_CLEAR_RADIUS + 1);
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) if (protect[y * W + x]) return "the start";
  // the ridge reaches across the valley floor and into the first terraces (damSite.ts)
  const plan = dam.params.plan as { at: number; thickness: number; wobble: number };
  const path = river.params.path;
  const c = pointAtArc(path, plan.at).p;
  const ax = path[path.length - 1][0] - path[0][0];
  const ay = path[path.length - 1][1] - path[0][1];
  const al = Math.sqrt(ax * ax + ay * ay) || 1;
  const half = plan.thickness / 2 + plan.wobble + 1;
  const across = H * 0.2 + 12;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!protect[y * W + x]) continue;
      const along = ((x - c[0]) * ax + (y - c[1]) * ay) / al;
      const side = ((y - c[1]) * ax - (x - c[0]) * ay) / al;
      if (Math.abs(along) <= half && Math.abs(side) <= across) return "the dam site";
    }
  return null;
}
