// Editing helpers (EDITOR_PLAN §4): what the editor's tools, and later Claude's proposals, turn a
// gesture or a request into: planned features and the operations that apply them. Each plans on the
// document's current map (the `BuildContext` of PLAN §19.3), so the same request gives the same
// edit from a tool and from a proposal, and the operations engine applies it like any other edit.
//
// - Rivers are drawn by their points from source to outlet. The bed never rises downstream: it
//   follows the lowest ground along the channel down and cuts through what rises, and its banks
//   are raised where the ground beside it is lower (`banks`). A river that starts at the map edge
//   gets a sealed mouth (build step 9); one that starts inland gets a spring.
// - Lakes are drawn by their basin. The water level is the outlet sill (settled water is flat); a
//   rim holds it, and an outlet channel carries its spring's water to an edge, a river or a lake.
// - Landforms are drawn by their outline, with a height and an edge style.
// - Set pieces are planned by their shared builders; moving one plans it again at its new place.

import { buildMap, START_CLEAR_RADIUS, type BuildResult } from "../features/build";
import { bedAt, pathField, pointAtArc, polygonMask } from "../features/geometry";
import { edgeStep, landformLevel } from "../features/raster/terrain";
import { distanceFrom } from "../math/grid";
import { channelWidth, routeChannel } from "../features/route";
import { BUILDERS, planSetPiece, type PlanContext, type PlanRecord } from "../features/setpieces";
import { FLOW_PRESETS, type Facing } from "../features/setpieces/common";
import { startEntranceTile, type Orientation } from "../format/footprints";
import type { Edge, Feature, LakeFeature, LandformFeature, Point, RiverFeature, SetPieceFeature, SetPieceKind, StartFeature } from "../features/schema";
import { runsToTiles, type Runs } from "../math/grid";
import { clone } from "../spec/mergepatch";
import { dependentsOf, patchFeature, type EditOp, type OpParams } from "./ops";
import { entityTiles } from "../features/edits";
import { isLine, OBJECT_NAMES, objectTiles } from "../features/objects";
import type { MapSession } from "./session";

export type PlannedEdit<F extends Feature = Feature> =
  | { ok: true; ops: EditOp[]; feature: F; report: string[]; label: string; tiles: number[] }
  | { ok: false; errors: string[] };

const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

// ---------------------------------------------------------------------------------- the context

/** The map a tool plans on: the document's current map, or, when a feature is planned again (a
 *  move, a new width), the map without it. */
export function planContextOf(s: MapSession, exclude: string | null = null): PlanContext {
  const { x: W, y: H } = s.size;
  const features = exclude ? s.features.filter((f) => f.id !== exclude) : s.features;
  const b: BuildResult = exclude ? s.terrainWith(features) : s.built;
  const locked = s.state.locks.length ? new Uint8Array(W * H) : null;
  if (locked) for (const l of s.state.locks) for (const i of runsToTiles(l.region.runs, W)) if (i >= 0 && i < W * H) locked[i] = 1;
  return {
    W,
    H,
    seed: s.spec?.seed ?? 0,
    features,
    heights: b.heights,
    channel: b.channel,
    occupied: b.occupied,
    start: startZone(s, b),
    locked,
    protect: b.cache.terrain.protect,
    objects: b.entities.map((e) => ({ x: e.x, y: e.y, template: e.template })),
  };
}

function startZone(s: MapSession, b: BuildResult): PlanContext["start"] {
  const f = s.features.find((g): g is StartFeature => g.kind === "start");
  if (f) return { x: f.params.position[0], y: f.params.position[1], radius: Math.max(f.params.benchRadius, START_CLEAR_RADIUS) + 1 };
  const e = b.entities.find((g) => g.template === "StartingLocation");
  if (!e) return null;
  const c = startCentre(e.x, e.y, e.orientation);
  return { x: c[0], y: c[1], radius: START_CLEAR_RADIUS + 1 };
}

/** The middle tile of a StartingLocation placed at (x, y) with orientation o. */
export function startCentre(x: number, y: number, o: Orientation): [number, number] {
  switch (o) {
    case "Cw0":
      return [x + 1, y + 1];
    case "Cw90":
      return [x + 1, y - 1];
    case "Cw180":
      return [x - 1, y - 1];
    case "Cw270":
      return [x - 1, y + 1];
  }
}

// ------------------------------------------------------------------------------------- rivers

export interface RiverRequest {
  /** Points from source to outlet, in tiles. */
  points: Point[];
  /** Blocks per second: gentle 1, steady 2, strong 4, or an exact value. */
  flow: number;
  /** Channel width in tiles (3–9 by default from the flow). */
  width?: number;
  /** Levels the bed sits below its banks (1–4): moisture reaches 16, 10, 4 or 0 tiles. */
  bedDepth?: number;
}

const EDGE_SNAP = 2.5;

/** The channel width a drawn river gets for its flow: its water, about 0.3·S/w deep, stays deeper
 *  than a thin sheet (0.1, which spreads and flickers) and well inside its banks. A width of 1.5
 *  is one tile across (two on a slant, so the channel stays joined side to side). */
export function riverWidthFor(flow: number): number {
  return flow <= 1.25 ? 1.5 : flow <= 2 ? 3 : flow <= 4 ? 5 : Math.min(9, Math.ceil(flow) + 1);
}

function nearestEdge(p: Point, W: number, H: number): { edge: Edge; d: number } {
  const c: { edge: Edge; d: number }[] = [
    { edge: "west", d: p[0] },
    { edge: "east", d: W - 1 - p[0] },
    { edge: "south", d: p[1] },
    { edge: "north", d: H - 1 - p[1] },
  ];
  c.sort((a, b) => a.d - b.d);
  return c[0];
}

function snapTo(p: Point, e: Edge, W: number, H: number): Point {
  if (e === "west") return [0, p[1]];
  if (e === "east") return [W - 1, p[1]];
  if (e === "south") return [p[0], 0];
  return [p[0], H - 1];
}

function arcLength(path: readonly Point[]): number {
  let l = 0;
  for (let i = 0; i + 1 < path.length; i++) l += Math.sqrt((path[i + 1][0] - path[i][0]) ** 2 + (path[i + 1][1] - path[i][1]) ** 2);
  return l;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Plan a drawn river on the map (see the file comment). */
export function planRiver(req: RiverRequest, ctx: PlanContext, id: string, origin: Feature["origin"] = "user"): PlannedEdit {
  const { W, H } = ctx;
  const pts: Point[] = [];
  for (const p of req.points) {
    const q: Point = [r2(Math.min(W - 1, Math.max(0, p[0]))), r2(Math.min(H - 1, Math.max(0, p[1])))];
    if (!pts.length || Math.abs(q[0] - pts[pts.length - 1][0]) + Math.abs(q[1] - pts[pts.length - 1][1]) >= 1) pts.push(q);
  }
  if (pts.length < 2) return fail("a river needs at least two points, a tile or more apart");
  const flow = r2(req.flow);
  if (!(flow > 0 && flow <= 64)) return fail("a river's flow is more than 0 and at most 64 blocks per second");
  const report: string[] = [];
  // where it starts: the map edge (a sealed mouth) or a spring
  const first = nearestEdge(pts[0], W, H);
  let entry: RiverFeature["params"]["entry"];
  if (first.d <= EDGE_SNAP) {
    pts[0] = snapTo(pts[0], first.edge, W, H);
    entry = { edge: first.edge };
    // a mouth beside another river where it meets the edge would share its water with it
    const [mx, my] = pts[0];
    for (let d = -8; d <= 8; d++) {
      const x = first.edge === "west" || first.edge === "east" ? mx : Math.round(mx) + d;
      const y = first.edge === "west" || first.edge === "east" ? Math.round(my) + d : my;
      if (x >= 0 && y >= 0 && x < W && y < H && ctx.channel?.[y * W + x]) return fail("the river would start beside another river on the map edge: start it a few tiles away");
    }
  } else entry = { spring: [pts[0][0], pts[0][1]] };
  // where it ends: the map edge, another river or a lake
  const lastP = pts[pts.length - 1];
  const last = nearestEdge(lastP, W, H);
  let exit: RiverFeature["params"]["exit"] | null = null;
  const tile = Math.round(lastP[1]) * W + Math.round(lastP[0]);
  if (last.d <= EDGE_SNAP) {
    if ("edge" in entry && entry.edge === last.edge) return fail(`the river starts on the ${last.edge} edge: end it on another edge, in a river or in a lake`);
    pts[pts.length - 1] = snapTo(lastP, last.edge, W, H);
    exit = { edge: last.edge };
  } else {
    for (const f of ctx.features) {
      if (f.id === id) continue;
      if (f.kind === "river" && ctx.channel?.[tile] && nearPath(f.params.path, lastP[0], lastP[1]) < f.params.width / 2 + 1) {
        exit = { river: f.id };
        break;
      }
    }
    if (!exit) {
      for (const f of ctx.features) {
        if (f.id === id || f.kind !== "lake") continue;
        if (polygonMask(f.params.outline, W, H)[tile]) {
          exit = { lake: f.id };
          break;
        }
      }
    }
  }
  if (!exit) return fail("end the river at the map edge, in another river or in a lake, so its water drains");
  const length = arcLength(pts);
  if (length < 4) return fail("the river is too short: draw it at least 4 tiles long");
  // a river that comes back on itself would dam its own lower course with its upper one
  const clearance = Math.min(9, Math.max(1.5, req.width ?? riverWidthFor(flow))) + 3;
  for (let i = 0; i + 1 < pts.length; i++)
    for (let j = i + 1; j + 1 < pts.length; j++) {
      if (j === i + 1) {
        // a bend sharper than 120 degrees folds the river back along itself
        const ux = pts[i + 1][0] - pts[i][0];
        const uy = pts[i + 1][1] - pts[i][1];
        const vx = pts[j + 1][0] - pts[j][0];
        const vy = pts[j + 1][1] - pts[j][1];
        if (ux * vx + uy * vy < -0.5 * Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))) return fail("the river turns back on itself: draw it without hairpin turns");
        continue;
      }
      if (segmentSegment(pts[i], pts[i + 1], pts[j], pts[j + 1]) < clearance) return fail("the river comes back too close to itself: draw it without loops");
    }
  const exitLake = "lake" in exit ? ctx.features.find((f) => f.id === (exit as { lake: string }).lake) : undefined;
  const lakeMask = exitLake?.kind === "lake" ? polygonMask(exitLake.params.outline, W, H) : null;
  const exitRiver = "river" in exit ? exit.river : null;
  let bedDepth = Math.min(4, Math.max(1, Math.round(req.bedDepth ?? 1)));
  // the bed of the river it joins, where it joins: its own bed ends there, never below it (its
  // water flows in, and the other river's never flows back up it)
  let joinBed = -1;
  if (exitRiver) {
    const target = ctx.features.find((f): f is RiverFeature => f.kind === "river" && f.id === exitRiver);
    const [ex, ey] = pts[pts.length - 1];
    const rr = (target?.params.width ?? 3) / 2 + 3;
    let tb = Infinity;
    for (let y = Math.max(0, Math.floor(ey - rr)); y <= Math.min(H - 1, Math.ceil(ey + rr)); y++)
      for (let x = Math.max(0, Math.floor(ex - rr)); x <= Math.min(W - 1, Math.ceil(ex + rr)); x++) {
        const i = y * W + x;
        if (target && ctx.channel?.[i] && nearPath(target.params.path, x, y) < target.params.width / 2 + 0.5) tb = Math.min(tb, ctx.heights[i]);
      }
    if (tb !== Infinity) joinBed = tb;
  }
  // the bed: the lowest ground along the channel (its banks included), never rising downstream.
  // The rivers it crosses on the way pour into it where its bed is lower than theirs.
  const profile = (width: number) => {
    const reach = width / 2 + 1.5;
    let bed = 16 - bedDepth;
    const steps: { at: number; drop: number }[] = [];
    let start = -1;
    const crossed = new Set<string>();
    let reachStart = 0;
    let longest = 0;
    for (let s = 0; s <= length + 1e-9; s += 0.5) {
      const p = pointAtArc(pts, s).p;
      let g = Infinity;
      // a river it crosses: its bed goes one below theirs there, so their water pours into it
      // and never back
      let under = Infinity;
      for (let y = Math.max(0, Math.floor(p[1] - reach)); y <= Math.min(H - 1, Math.ceil(p[1] + reach)); y++)
        for (let x = Math.max(0, Math.floor(p[0] - reach)); x <= Math.min(W - 1, Math.ceil(p[0] + reach)); x++) {
          if ((x - p[0]) ** 2 + (y - p[1]) ** 2 > reach * reach) continue;
          const i = y * W + x;
          if (ctx.channel?.[i]) {
            for (const f of ctx.features) if (f.kind === "river" && f.id !== id && f.id !== exitRiver && !crossed.has(f.id) && nearPath(f.params.path, x, y) < f.params.width / 2 + 0.5) crossed.add(f.id);
            if (!exitRiver || s < length - reach - 2) under = Math.min(under, ctx.heights[i] - 1);
            continue;
          }
          if (lakeMask?.[i]) continue;
          if (ctx.heights[i] < g) g = ctx.heights[i];
        }
      let want = Math.max(0, Math.min(g === Infinity ? bed : g - bedDepth, under));
      // the last reach meets the river it joins at that river's bed
      if (joinBed >= 0 && s > length - reach - 3) want = Math.max(want, joinBed);
      if (start < 0) {
        bed = Math.min(bed, want);
        start = bed;
      } else if (want < bed) {
        steps.push({ at: r2(s), drop: bed - want });
        bed = want;
        longest = Math.max(longest, s - reachStart);
        reachStart = s;
      }
    }
    longest = Math.max(longest, length - reachStart);
    let taken = flow;
    for (const f of ctx.features) if (f.kind === "river" && crossed.has(f.id)) taken += f.params.flow;
    return { start, steps, bed, longest, taken };
  };
  // the width that keeps its water inside its banks: the water over a flat reach of L tiles is
  // about 0.3·q + 0.0015·q·L deep (q the flow per tile of width, PLAN §9.2, D26)
  const needWidth = (q: number, L: number, depth: number) => (q * (0.3 + 0.0015 * L)) / (depth - 0.35);
  let width = Math.min(9, Math.max(1.5, req.width ?? riverWidthFor(flow)));
  let pr = profile(width);
  for (let pass = 0; pass < 3; pass++) {
    let need = needWidth(pr.taken, pr.longest, bedDepth);
    while (need > 9 && bedDepth < 4) {
      bedDepth++;
      need = needWidth(pr.taken, pr.longest, bedDepth);
    }
    const w = Math.min(9, Math.max(1.5, Math.ceil(need * 2) / 2));
    if (w <= width) break;
    width = w;
    pr = profile(width);
  }
  if (req.width !== undefined && width > req.width) report.push(`widened from ${req.width} to ${width} tiles so its water stays inside its banks`);
  if (req.bedDepth !== undefined && bedDepth > req.bedDepth) report.push(`its bed sits ${bedDepth} below its banks to hold its water`);
  if (pr.taken > flow) report.push(`it takes in the water of the rivers it crosses, ${r2(pr.taken - flow)} blocks/s more`);
  const { start, steps, bed } = pr;
  // the water must flow into what it joins: a river's bed there, a lake's water level
  const endTiles: number[] = [];
  {
    const [ex, ey] = pts[pts.length - 1];
    const rr = width / 2 + 2;
    for (let y = Math.max(0, Math.floor(ey - rr)); y <= Math.min(H - 1, Math.ceil(ey + rr)); y++)
      for (let x = Math.max(0, Math.floor(ex - rr)); x <= Math.min(W - 1, Math.ceil(ex + rr)); x++) if ((x - ex) ** 2 + (y - ey) ** 2 <= rr * rr) endTiles.push(y * W + x);
  }
  const extra: EditOp[] = [];
  if (exitRiver) {
    const target = ctx.features.find((f): f is RiverFeature => f.kind === "river" && f.id === exitRiver)!;
    let tb = Infinity;
    for (const i of endTiles) if (ctx.channel?.[i] && nearPath(target.params.path, i % W, Math.floor(i / W)) < target.params.width / 2 + 0.5) tb = Math.min(tb, ctx.heights[i]);
    if (tb !== Infinity && bed < tb) return fail("this river would meet the other one below that river's water, so the water would run backwards up it: end it farther downstream, where the other river is lower, or at the map edge");
  }
  if (exitLake?.kind === "lake" && !exitLake.params.planned) {
    const sill = exitLake.params.outlet.sill;
    if (bed + bedDepth <= sill) return fail("the river would reach the lake below its water level, and the lake would flood its banks: end it at a lower lake, or draw it where the ground stays above the lake");
    // the lake's outlet now carries this river too: plan it again for the water it takes in
    if (exitLake.params.outlet.path) {
      const others = ctx.features.filter((f): f is RiverFeature => f.kind === "river" && f.id !== id && "lake" in f.params.exit && f.params.exit.lake === exitLake.id);
      const through = pr.taken + others.reduce((a, f) => a + f.params.flow, 0);
      const spring = "spring" in exitLake.params.inflow ? exitLake.params.inflow.spring : 0;
      const lake = planLake({ outline: exitLake.params.outline, level: sill, floorDepth: exitLake.params.floorDepth, spring, outletFlow: through }, { ...ctx, features: ctx.features.filter((f) => f.id !== exitLake.id) }, exitLake.id, exitLake.origin);
      if (!lake.ok) return fail(`the lake it flows into could not carry its water away: ${lake.errors[0]}`);
      extra.push({ op: "updateFeature", params: { id: exitLake.id, patch: { params: replacePatch(exitLake.params, lake.feature.params) as Record<string, unknown> } } });
      if (lake.feature.kind === "lake" && lake.feature.params.outlet.width !== exitLake.params.outlet.width) report.push(`the lake's outlet widens to ${lake.feature.params.outlet.width} tiles to carry its water`);
    }
  }
  const half = width / 2;
  // the channel must not run along another map edge (edges drain), nor through the start's zone
  const field = pathField(pts, W, H);
  for (let i = 0; i < W * H; i++) {
    if (field.d[i] >= half + 1) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (ctx.start && Math.abs(x - ctx.start.x) <= ctx.start.radius && Math.abs(y - ctx.start.y) <= ctx.start.radius) return fail("the river would run through the start's area: draw it round the start");
    if (ctx.locked?.[i]) return fail("the river would cross a locked area");
    if (field.d[i] >= half) continue;
    const onBorder = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    if (!onBorder) continue;
    const e: Edge = x === 0 ? "west" : x === W - 1 ? "east" : y === 0 ? "south" : "north";
    const atEntry = "edge" in entry && entry.edge === e && field.s[i] < half + 2;
    const atExit = "edge" in exit && exit.edge === e && field.s[i] > length - half - 2;
    if (!atEntry && !atExit) return fail(`the river runs along the ${e} edge near (${x}, ${y}): keep it a few tiles in, or its water drains there`);
  }
  const feature: RiverFeature = {
    id,
    kind: "river",
    origin,
    locked: false,
    params: {
      path: pts,
      width,
      bedDepth,
      bedProfile: { start, steps },
      flow,
      style: "straight",
      entry,
      exit,
      badwater: false,
      banks: true,
    },
  };
  report.push(`${flowWord(flow)}, ${width} tiles wide, its bed from level ${start} down to ${bed}`);
  if (steps.length) report.push(`${steps.length} step${steps.length > 1 ? "s" : ""} down where the ground falls`);
  report.push("edge" in entry ? `a sealed mouth on the ${entry.edge} edge feeds it` : "a spring feeds it");
  const tiles: number[] = [];
  for (let i = 0; i < W * H; i++) if (field.d[i] < half) tiles.push(i);
  return { ok: true, ops: [{ op: "addFeature", params: { feature } }, ...extra], feature, report, label: "Add river", tiles };
}

function flowWord(flow: number): string {
  const name = (Object.keys(FLOW_PRESETS) as (keyof typeof FLOW_PRESETS)[]).find((k) => FLOW_PRESETS[k] === flow);
  return name ? `a ${name} flow (${flow} blocks/s)` : `${flow} blocks/s`;
}

function pointSegment(p: Point, a: Point, b: Point): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = a[0] + t * vx - p[0];
  const dy = a[1] + t * vy - p[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** The least distance between two segments (0 when they cross). */
function segmentSegment(a: Point, b: Point, c: Point, d: Point): number {
  const cross = (o: Point, p: Point, q: Point) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}

function nearPath(path: readonly Point[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i];
    const vx = path[i + 1][0] - ax;
    const vy = path[i + 1][1] - ay;
    const l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + t * vx - x;
    const py = ay + t * vy - y;
    best = Math.min(best, px * px + py * py);
  }
  return Math.sqrt(best);
}

// -------------------------------------------------------------------------------------- lakes

export interface LakeRequest {
  outline: Point[];
  /** The water level: the outlet's sill. By default the lowest ground round the basin. */
  level?: number;
  /** Levels the floor lies below the water, 1–4 (default 2). */
  floorDepth?: number;
  /** The spring that keeps it full, blocks per second (default 0.5). */
  spring?: number;
  /** Water the outlet carries besides the spring's: the rivers that flow into the lake. */
  outletFlow?: number;
}

export function planLake(req: LakeRequest, ctx: PlanContext, id: string, origin: Feature["origin"] = "user"): PlannedEdit {
  const { W, H } = ctx;
  const outline = req.outline.map(([x, y]) => [r2(x), r2(y)] as Point);
  if (outline.length < 3) return fail("a lake needs an outline of at least three points");
  const mask = polygonMask(outline, W, H);
  const tiles: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) tiles.push(i);
  if (tiles.length < 4) return fail("the lake is too small: draw it at least 2 by 2 tiles");
  // the basin keeps off the map edge (edges drain) and its rim keeps off the start and rivers
  const rim: number[] = [];
  const inRim = new Uint8Array(W * H);
  for (const i of tiles) {
    const x = i % W;
    const y = (i - x) / W;
    if (x < 3 || y < 3 || x > W - 4 || y > H - 4) return fail("keep the lake at least 3 tiles from the map edge: edges drain");
    if (ctx.channel?.[i]) return fail("the lake would cover a river: draw the river into the lake instead");
    if (ctx.locked?.[i]) return fail("the lake would cover a locked area");
  }
  for (const i of tiles) {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const n = (y + dy) * W + (x + dx);
        if (!mask[n] && !inRim[n]) {
          inRim[n] = 1;
          rim.push(n);
        }
      }
  }
  for (const i of [...tiles, ...rim]) {
    const x = i % W;
    const y = (i - x) / W;
    if (ctx.start && Math.abs(x - ctx.start.x) <= ctx.start.radius && Math.abs(y - ctx.start.y) <= ctx.start.radius) return fail("the lake would cover the start's area: draw it farther from the start");
  }
  const report: string[] = [];
  let low = 16;
  for (const i of rim) if (!ctx.channel?.[i]) low = Math.min(low, ctx.heights[i]);
  const sill = Math.min(15, Math.max(1, Math.round(req.level ?? low)));
  if (req.level !== undefined && sill !== req.level) report.push(`water level ${req.level} changed to ${sill}: a lake's level is 1–15`);
  const floorDepth = Math.min(sill, Math.max(1, Math.round(req.floorDepth ?? 2)));
  const spring = r2(Math.min(8, Math.max(0, req.spring ?? 0.5)));
  // the outlet: out of the basin at the sill, to an edge, a river or a lake
  const blocked = new Uint8Array(W * H);
  if (ctx.start) {
    const r = ctx.start.radius + 1;
    for (let y = ctx.start.y - r; y <= ctx.start.y + r; y++) for (let x = ctx.start.x - r; x <= ctx.start.x + r; x++) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
  }
  if (ctx.locked) for (let i = 0; i < W * H; i++) if (ctx.locked[i]) blocked[i] = 1;
  if (ctx.protect) for (let i = 0; i < W * H; i++) if (ctx.protect[i] && !mask[i]) blocked[i] = 1;
  const route = routeChannel({ W, H, heights: ctx.heights, features: ctx.features, channel: ctx.channel, occupied: ctx.occupied }, tiles, sill, channelWidth(spring + (req.outletFlow ?? 0)), blocked, id);
  if (!route) return fail("the lake's water has no way out to a map edge, a river or another lake from here");
  const to: LakeFeature["params"]["outlet"]["to"] = route.to === "edge" ? "edge" : ctx.features.find((f) => f.id === route.to)?.kind === "lake" ? "lake" : "river";
  const feature: LakeFeature = {
    id,
    kind: "lake",
    origin,
    locked: false,
    params: {
      outline,
      floorDepth,
      outlet: { at: [route.tiles[0], route.tiles[1]], sill, to, ...(to !== "edge" ? { target: route.to } : {}), path: route.tiles, levels: route.levels, width: route.width },
      inflow: { spring },
      planned: false,
    },
  };
  report.push(`the water stands at level ${sill}, ${floorDepth} deep over ${tiles.length} tiles`);
  report.push(spring > 0 ? `a spring of ${spring} blocks/s keeps it full; its outlet drains to ${to === "edge" ? "the map edge" : `the ${to}`}` : "no spring: it slowly dries out (about 0.054 levels a day)");
  return { ok: true, ops: [{ op: "addFeature", params: { feature } }], feature, report, label: "Add lake", tiles };
}

// --------------------------------------------------------------------------------- landforms

export interface LandformRequest {
  outline: Point[];
  kind: LandformFeature["params"]["kind"];
  /** The level it rises (or sinks) to; by default 3 above the ground (2 for a cliff), or 2 below
   *  for a canyon or valley. */
  height?: number;
  edgeStyle: LandformFeature["params"]["edgeStyle"];
  bandDepth?: number;
}

export function planLandform(req: LandformRequest, ctx: PlanContext, id: string, origin: Feature["origin"] = "user"): PlannedEdit {
  const { W, H } = ctx;
  const outline = req.outline.map(([x, y]) => [r2(x), r2(y)] as Point);
  if (outline.length < 3) return fail("draw an outline of at least three points");
  if (!outline.every(([x, y]) => x >= -0.5 && y >= -0.5 && x <= W - 0.5 && y <= H - 0.5)) return fail("the outline leaves the map");
  const mask = polygonMask(outline, W, H);
  let n = 0;
  let base = 16;
  let top = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    n++;
    top = Math.max(top, ctx.heights[i]);
    const x = i % W;
    const y = (i - x) / W;
    const edge = !mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W] || x === 0 || y === 0 || x === W - 1 || y === H - 1;
    if (edge) base = Math.min(base, ctx.heights[i]);
    if (ctx.start && Math.abs(x - ctx.start.x) <= ctx.start.radius && Math.abs(y - ctx.start.y) <= ctx.start.radius) return fail("it would cover the start's area: draw it farther from the start");
  }
  if (n < 4) return fail("the outline is too small: draw it at least 2 by 2 tiles");
  const lowering = req.kind === "canyon" || req.kind === "valley";
  const fallback = lowering ? Math.max(0, base - 2) : req.edgeStyle === "cliff" ? Math.min(16, top + 2) : Math.min(16, base + 3);
  const height = Math.min(16, Math.max(0, Math.round(req.height ?? fallback)));
  const bandDepth = req.edgeStyle === "terraced" ? Math.min(12, Math.max(6, Math.round(req.bandDepth ?? 8))) : undefined;
  const feature: LandformFeature = {
    id,
    kind: "landform",
    origin,
    locked: false,
    params: { kind: req.kind, edgeStyle: req.edgeStyle, outline, height, ...(req.edgeStyle !== "cliff" ? { base } : {}), ...(bandDepth ? { bandDepth } : {}), onGround: true },
  };
  // the level its steps reach inside this outline: a gentle edge climbs 1 level every 3 tiles in
  // from the outline, so a small outline tops out lower than the height asked for (said, never a
  // surprise)
  const reach = landformTop(feature.params, mask, W, H);
  const spacing = req.edgeStyle === "gentle" ? 3 : (bandDepth ?? 8);
  // (the planner's own report, for the groundwork and old projects' landforms; the editor never
  // reaches this planner, tests/unit/boundaries.test.ts)
  // <!-- retired-terms:allow -->
  const report = [
    req.edgeStyle === "cliff"
      ? `level ${height}, with cliff edges (beavers need stairs to cross them)`
      : reach !== height
        ? `reaches level ${reach} here, not ${height}: its edge ${lowering ? "sinks" : "climbs"} 1 level every ${spacing} tiles from level ${base}, so level ${height} needs it about ${2 * spacing * Math.abs(height - base) + 1} tiles across`
        : `level ${height}, stepping 1 level every ${spacing} tiles from level ${base}, joined by slopes`,
  ];
  // <!-- /retired-terms:allow -->
  const tiles: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) tiles.push(i);
  return { ok: true, ops: [{ op: "addFeature", params: { feature } }], feature, report, label: `Add ${req.kind}`, tiles };
}

/** The level a drawn landform's steps reach inside its outline: its height, unless the outline is
 *  too small for the steps to climb (or sink) that far. A single tile above all its neighbours is
 *  levelled by the build (a spike), so the top must hold two tiles or more. With `shown` (the
 *  heights a build gives with it), what shows of its steps: where another feature keeps its own
 *  ground (a river's bed) the steps stop there; ground already higher than a step is not the
 *  landform's. */
export function landformTop(p: LandformFeature["params"], mask: Uint8Array, W: number, H: number, shown?: Uint8Array): number {
  const step = edgeStep(p);
  const height = p.height ?? 0;
  const lowers = p.base !== undefined ? height < p.base : p.kind === "canyon" || p.kind === "valley";
  // a step at level v shows as far as the ground there lets it
  const seen = (i: number, v: number) => (shown ? (lowers ? Math.max(v, shown[i]) : Math.min(v, shown[i])) : v);
  if (!step || p.base === undefined) {
    if (!shown) return height;
    let top = lowers ? 16 : 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) top = lowers ? Math.min(top, seen(i, height)) : Math.max(top, seen(i, height));
    return top;
  }
  const outside = new Uint8Array(W * H);
  for (let i = 0; i < mask.length; i++) outside[i] = mask[i] ? 0 : 1;
  const inward = distanceFrom(outside, W, H);
  const level = (i: number) => (mask[i] ? landformLevel(Math.min(16, height), Math.min(16, p.base!), step, inward[i]) : p.base!);
  let top = lowers ? 16 : 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    const v = seen(i, level(i));
    // what the build keeps of it: not above (below) every neighbour
    let near = lowers ? 16 : 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const n = nx >= 0 && ny >= 0 && nx < W && ny < H ? level(ny * W + nx) : p.base!;
      near = lowers ? Math.min(near, n) : Math.max(near, n);
    }
    top = lowers ? Math.min(top, Math.max(v, near)) : Math.max(top, Math.min(v, near));
  }
  return top;
}

// -------------------------------------------------------------------------------- set pieces

/** Plan a new set piece, or plan an existing one again (`id` of a feature on the map). An on-river
 *  fall also puts its step into its river's bed profile. */
export function planPiece(s: MapSession, kind: SetPieceKind, request: PlanRecord, id: string, origin: Feature["origin"] = "user"): PlannedEdit<SetPieceFeature> {
  const existing = s.features.find((f): f is SetPieceFeature => f.id === id && f.kind === "setPiece");
  if (existing && existing.params.kind !== kind) return fail("a set piece keeps its kind");
  const ctx = planContextOf(s, existing ? id : null);
  // an on-river fall is planned with its river as it stands (its own step included)
  if (existing && kind === "waterfall" && request.mode === "on-river") ctx.features = s.features;
  const r = planSetPiece(kind, request, ctx, { id, origin: existing?.origin ?? origin, role: existing?.role, locked: existing?.locked }, !!existing);
  if (!r.ok) return r;
  const f = r.feature;
  const ops: EditOp[] = [];
  if (existing) ops.push({ op: "updateFeature", params: { id, patch: { params: replacePatch(existing.params, f.params) as Record<string, unknown> } } });
  else ops.push({ op: "addFeature", params: { feature: f } });
  if (kind === "waterfall" && f.params.plan.mode === "on-river") {
    const river = s.features.find((g): g is RiverFeature => g.kind === "river" && g.id === f.params.plan.river);
    if (!river) return fail("its river is gone");
    const steps = river.params.bedProfile.steps.filter((st) => st.setPiece !== id);
    steps.push({ at: Number(f.params.plan.at), drop: Number(f.params.plan.drop), setPiece: id });
    steps.sort((a, b) => a.at - b.at);
    ops.push({ op: "updateFeature", params: { id: river.id, patch: { params: { bedProfile: { steps } } } } });
  }
  const { x: W, y: H } = s.size;
  const tiles = BUILDERS[kind]?.area?.(f, W, H, s.features) ?? [];
  return withObjectsOnNewGround(s, { ok: true, ops, feature: f, report: [...f.params.report], label: `${existing ? "Change" : "Add"} ${pieceName(kind)}`, tiles }, id);
}

// ------------------------------------------------------------------ objects on reshaped ground

/** Templates that stand on the ground as objects (not plants, ruins, slopes, sources or the start):
 *  what an edit that reshapes the ground must move or clear. */
const GROUND_OBJECTS = new Set([
  "UndergroundRuins", "SmallRelic", "MediumRelic", "LargeRelic", "GeothermalField", "UnstableCore", "Thorns", "NaturalDam", "Blockage",
  "NaturalOverhang2x1", "NaturalOverhang3x1", "NaturalOverhang4x1", "ReservePile", "ReserveTank", "ReserveWarehouse", "AncientAquiferDrill",
]);

/** What an edit that reshapes the ground (a set piece, a lake, a landform, a river) does to the map
 *  objects standing there (EDITOR_PLAN §3; D87, decisions-pending #47): an object whose ground
 *  still holds it moves to the new ground (single objects stand on it, so they follow it), and one
 *  it no longer holds (uneven ground, a river's channel, the new feature's body) is cleared, and the
 *  report says which. `ops` are the edit's operations; `edited` the features they plan (left alone).
 *  Returns the operations that clear objects, and the report's lines. */
export function objectsOnNewGround(s: MapSession, ops: readonly EditOp[], edited: ReadonlySet<string>): { ops: EditOp[]; report: string[] } {
  const { x: W, y: H } = s.size;
  const N = W * H;
  // the features after the edit
  let feats: Feature[] = clone(s.features as Feature[]);
  let touched = false;
  for (const op of ops) {
    if (op.op === "addFeature") {
      const i = op.params.index;
      if (i === undefined || i >= feats.length) feats.push(clone(op.params.feature));
      else feats.splice(i, 0, clone(op.params.feature));
      touched = true;
    } else if (op.op === "updateFeature") {
      feats = feats.map((f) => (f.id === op.params.id ? patchFeature(f, op.params.patch) : f));
      touched = true;
    } else if (op.op === "deleteFeature") {
      feats = feats.filter((f) => f.id !== op.params.id);
      touched = true;
    }
  }
  if (!touched) return { ops: [], report: [] };
  const before = s.built;
  const after = s.terrainWith(feats);
  const changed = new Uint8Array(N);
  let any = false;
  for (let i = 0; i < N; i++)
    if (before.heights[i] !== after.heights[i] || (after.channel[i] && !before.channel[i])) {
      changed[i] = 1;
      any = true;
    }
  // the bodies of the features the edit plans: a set piece's, a lake's basin, a river's channel
  const body = new Uint8Array(N);
  for (const f of feats) {
    if (!edited.has(f.id)) continue;
    if (f.kind === "setPiece") for (const i of BUILDERS[f.params.kind]?.clears?.(f, W, H, feats) ?? BUILDERS[f.params.kind]?.area?.(f, W, H, feats) ?? []) body[i] = 1;
    else if (f.kind === "lake") polygonMask(f.params.outline, W, H).forEach((v, i) => v && (body[i] = 1));
    else if (f.kind === "river") for (let i = 0; i < N; i++) if (after.channel[i]) body[i] = 1;
  }
  if (!any) for (let i = 0; i < N && !any; i++) if (body[i]) any = true;
  if (!any) return { ops: [], report: [] };
  const out: EditOp[] = [];
  const report: string[] = [];
  const hit = (tiles: readonly (readonly [number, number])[]) => tiles.some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && (changed[y * W + x] || body[y * W + x]));
  // map object features: their objects stand on the ground wherever it is, so they move with it
  const objectIds = new Set<string>();
  for (const f of feats) {
    if (f.kind !== "mapObject") continue;
    objectIds.add(f.id);
    if (edited.has(f.id)) continue;
    const tiles = objectTiles(f, W, H);
    if (!hit(tiles)) continue;
    const kind = f.params.kind;
    const name = OBJECT_NAMES[kind].toLowerCase();
    let why = "";
    let level = -1;
    for (const [x, y] of tiles) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (body[i] && kind !== "weir" && kind !== "plug") why = "the new feature covers its ground";
      else if (after.channel[i] && kind !== "weir" && kind !== "plug") why = "a river runs through its ground";
      else if (!isLine(kind)) {
        if (level < 0) level = after.heights[i];
        else if (after.heights[i] !== level) why = "its ground is no longer level";
      }
      if (why) break;
    }
    if (why) {
      out.push({ op: "deleteFeature", params: { id: f.id } });
      report.push(`clears the ${name}: ${why}`);
    } else if (tiles.some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && before.heights[y * W + x] !== after.heights[y * W + x])) {
      report.push(`the ${name} moves to the new ground`);
    }
  }
  // the imported map's own objects and objects placed by hand: the loader keeps them only on
  // ground at their level
  const gone: string[] = [];
  for (const e of after.entities) {
    if (!GROUND_OBJECTS.has(e.template) || objectIds.has(e.owner)) continue;
    const tiles = entityTiles(e);
    if (!hit(tiles)) continue;
    if (tiles.some(([x, y]) => x < 0 || y < 0 || x >= W || y >= H || after.heights[y * W + x] !== e.z || body[y * W + x])) gone.push(e.id);
  }
  if (gone.length) {
    const have = new Set(before.entities.map((e) => e.id));
    const ids = gone.filter((id) => have.has(id));
    if (ids.length) {
      out.push({ op: "deleteEntities", params: { entities: ids } });
      report.push(`clears ${ids.length === 1 ? "an object" : `${ids.length} objects`} left without level ground`);
    }
  }
  return { ops: out, report };
}

/** A planned edit with the objects on the ground it reshapes moved or cleared (see
 *  `objectsOnNewGround`). */
export function withObjectsOnNewGround<F extends Feature>(s: MapSession, r: PlannedEdit<F>, edited: string): PlannedEdit<F> {
  if (!r.ok) return r;
  const extra = objectsOnNewGround(s, r.ops, new Set([edited]));
  if (!extra.ops.length && !extra.report.length) return r;
  return { ...r, ops: [...r.ops, ...extra.ops], report: [...r.report, ...extra.report] };
}

export function pieceName(kind: SetPieceKind): string {
  return (
    { waterfall: "waterfall", damSite: "dam site", gorge: "gorge", terracedCliffs: "terraced cliffs", badwaterBasin: "badwater spring", plugSpillway: "plugged spillway", obstaclePayoff: "obstacle", secondDistrict: "second district site" } as Record<
      SetPieceKind,
      string
    >
  )[kind];
}

/** A merge patch (RFC 7396) that turns `from` into `to`: keys `to` lacks are set to null. */
export function replacePatch(from: unknown, to: unknown): unknown {
  const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!plain(from) || !plain(to)) return clone(to);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(from)) if (!(k in to)) out[k] = null;
  for (const k of Object.keys(to)) {
    if (JSON.stringify(from[k]) === JSON.stringify(to[k])) continue;
    out[k] = replacePatch(from[k], to[k]);
  }
  return out;
}

// --------------------------------------------------------------------------------------- moving

/** The `updateFeature` patch that moves a feature by (dx, dy) tiles without planning it again. A
 *  river keeps the ends that sit on the map edge on that edge (its sealed mouth stays a mouth); the
 *  start's bench takes the ground level at its new place. It no longer runs to a river's bank (the
 *  water rule, D153: the colony walks to the water over the map's own slopes), and a
 *  bank a project saved before kept is dropped. */
export function movePatch(f: Feature, dx: number, dy: number, W: number, H: number, heights: Uint8Array): OpParams["updateFeature"]["patch"] {
  const shift = (p: Point): Point => [p[0] + dx, p[1] + dy];
  const onEdge = (v: number, max: number) => v <= 0 || v >= max;
  switch (f.kind) {
    case "forest":
    case "berryPatch":
    case "ruinField":
      return { params: { area: f.params.area.map(([y, a, b]) => [y + dy, a + dx, b + dx]) as Runs } };
    case "start": {
      const [x, y] = shift(f.params.position);
      const benchLevel = Math.max(1, heights[y * W + x]);
      return { params: { position: [x, y], benchLevel, bank: null } };
    }
    case "landform":
      return { params: { outline: (f.params.outline ?? []).map(shift) } };
    case "lake":
      return { params: { outline: f.params.outline.map(shift), outlet: { at: shift(f.params.outlet.at) } } };
    case "river":
      return { params: { path: f.params.path.map(([x, y]) => [onEdge(x, W - 1) ? x : x + dx, onEdge(y, H - 1) ? y : y + dy]) } };
    default:
      return {};
  }
}

/** Move a feature by (dx, dy) tiles. Rivers and lakes drawn in the editor, and set pieces, are
 *  planned again at their new place (a river's bed and a lake's outlet follow the new ground; an
 *  on-river piece moves along its river). */
export function moveEdit(s: MapSession, id: string, dx: number, dy: number): PlannedEdit {
  return withObjectsOnNewGround(s, movePlan(s, id, dx, dy), id);
}

function movePlan(s: MapSession, id: string, dx: number, dy: number): PlannedEdit {
  const f = s.features.find((g) => g.id === id);
  if (!f) return fail("that feature is gone");
  const { x: W, y: H } = s.size;
  const label = `Move ${kindName(f)}`;
  if (f.kind === "river" && f.params.banks) {
    const onEdge = (v: number, max: number) => v <= 0 || v >= max;
    const points = f.params.path.map(([x, y]) => [onEdge(x, W - 1) ? x : x + dx, onEdge(y, H - 1) ? y : y + dy] as Point);
    const r = planRiver({ points, flow: f.params.flow, width: f.params.width, bedDepth: f.params.bedDepth }, planContextOf(s, id), id, f.origin);
    if (!r.ok) return r;
    return { ...r, ops: [{ op: "updateFeature", params: { id, patch: { params: replacePatch(f.params, r.feature.params) as Record<string, unknown> } } }, ...r.ops.slice(1)], label };
  }
  if (f.kind === "lake" && !f.params.river && f.params.outlet.path) {
    const outline = f.params.outline.map(([x, y]) => [x + dx, y + dy] as Point);
    const spring = "spring" in f.params.inflow ? f.params.inflow.spring : 0;
    const r = planLake({ outline, level: f.params.outlet.sill, floorDepth: f.params.floorDepth, spring }, planContextOf(s, id), id, f.origin);
    if (!r.ok) return r;
    return { ...r, ops: [{ op: "updateFeature", params: { id, patch: { params: replacePatch(f.params, r.feature.params) as Record<string, unknown> } } }, ...r.ops.slice(1)], label };
  }
  if (f.kind === "setPiece") {
    const req = movedRequest(s, f, dx, dy);
    if (!req) return fail("this set piece is part of the generated layout: it moves with its river");
    const r = planPiece(s, f.params.kind, req, id);
    return r.ok ? { ...r, label } : r;
  }
  const patch = movePatch(f, dx, dy, W, H, s.built.heights);
  const moved = { ...f, params: { ...f.params, ...(patch.params as object) } } as Feature;
  return { ok: true, ops: [{ op: "updateFeature", params: { id, patch } }], feature: moved, report: [], label, tiles: [] };
}

/** A set piece's request at a place (dx, dy) tiles away: along its river for on-river pieces. */
function movedRequest(s: MapSession, f: SetPieceFeature, dx: number, dy: number): PlanRecord | null {
  const plan = f.params.plan;
  const req = { ...f.params.request } as PlanRecord;
  const river = typeof plan.river === "string" ? s.features.find((g): g is RiverFeature => g.kind === "river" && g.id === plan.river) : undefined;
  const alongRiver = (at: number): number => {
    const { p } = pointAtArc(river!.params.path, at);
    const { x: W, y: H } = s.size;
    const field = pathField(river!.params.path, W, H);
    const x = Math.min(W - 1, Math.max(0, Math.round(p[0] + dx)));
    const y = Math.min(H - 1, Math.max(0, Math.round(p[1] + dy)));
    return r2(field.s[y * W + x]);
  };
  switch (f.params.kind) {
    case "waterfall":
      if (plan.mode === "on-river" && river) return { ...req, at: alongRiver(Number(plan.at)) };
      if (plan.mode === "standalone") {
        const lip = plan.lip as number[];
        return { ...req, lip: [lip[0] + dx, lip[1] + dy] };
      }
      return null;
    case "damSite":
      return river ? { ...req, at: alongRiver(Number(plan.at)) } : null;
    case "gorge":
      if (!river) return null;
      {
        const from = alongRiver(Number(plan.from));
        return { ...req, from, length: r2(Number(plan.to) - Number(plan.from)) };
      }
    case "terracedCliffs": {
      const at = plan.at as number[];
      return { ...req, at: [at[0] + dx, at[1] + dy] };
    }
    case "badwaterBasin":
      if (plan.mode !== "basin") return null;
      return { ...req, at: [Number(plan.x) + 1 + dx, Number(plan.y) + 1 + dy] };
    default:
      return null;
  }
}

/** A feature's plain name, as the player sees it. */
export function plainName(f: Feature): string {
  if (f.kind === "landform") return f.params.kind === "valley" ? "valley floor" : f.params.kind;
  if (f.kind === "lake") return f.params.planned ? "reservoir site" : "lake";
  return kindName(f);
}

function plural(n: string): string {
  return n.endsWith("s") ? n : n.endsWith("h") ? `${n}es` : `${n}s`;
}

export function kindName(f: Feature): string {
  switch (f.kind) {
    case "setPiece":
      return pieceName(f.params.kind);
    case "landform":
      return f.params.kind === "terraces" ? "terraces" : f.params.kind;
    case "berryPatch":
      return "berry patch";
    case "ruinField":
      return "ruin field";
    case "mapObject":
      return "map object";
    default:
      return f.kind;
  }
}

// -------------------------------------------------------------------------------------- deleting

/** Delete a feature. An on-river fall takes its step out of its river first; a feature others
 *  build on is refused with their names. */
export function deleteEdit(s: MapSession, id: string): PlannedEdit {
  const f = s.features.find((g) => g.id === id);
  if (!f) return fail("that feature is gone");
  const ops: EditOp[] = [];
  let features = s.features;
  if (f.kind === "setPiece" && f.params.plan.mode === "on-river") {
    const river = s.features.find((g): g is RiverFeature => g.kind === "river" && g.id === f.params.plan.river);
    if (river) {
      const steps = river.params.bedProfile.steps.filter((st) => st.setPiece !== id);
      ops.push({ op: "updateFeature", params: { id: river.id, patch: { params: { bedProfile: { steps } } } } });
      features = features.map((g) => (g.id === river.id ? { ...river, params: { ...river.params, bedProfile: { ...river.params.bedProfile, steps } } } : g));
    }
  }
  const deps = dependentsOf(features, id);
  if (deps.length) {
    // "the valley floor, the terraces and the dam site build on this river"
    const counts = new Map<string, number>();
    for (const d of deps) counts.set(plainName(d), (counts.get(plainName(d)) ?? 0) + 1);
    const names = [...counts].map(([n, k]) => (k > 1 ? `${k} ${plural(n)}` : `the ${n}`));
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    return fail(`${list} ${deps.length === 1 ? "builds" : "build"} on this ${plainName(f)}: delete ${deps.length === 1 ? "it" : "them"} first`);
  }
  ops.push({ op: "deleteFeature", params: { id } });
  return { ok: true, ops, feature: f, report: [], label: `Delete ${kindName(f)}`, tiles: [] };
}

// --------------------------------------------------------------------------------------- the start

/** Whether the start's district center can stand with its middle at (x, y) facing `o`: its 3×3 and
 *  the tile at its door dry and on the map, clear of rivers, pieces and objects. `flat` also asks
 *  for level ground (an imported map, which has no bench to level it). Returns why not, or null. */
export function startProblem(b: BuildResult, x: number, y: number, o: Orientation, flat: boolean, ignoreOwner: string | null, pieces: Uint8Array | null = null): string | null {
  const { W, H } = b;
  const corner = cornerFor(x, y, o);
  const [ex, ey] = startEntranceTile(corner[0], corner[1], o);
  const tiles: [number, number][] = [[ex, ey]];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push([x + dx, y + dy]);
  const level = b.heights[y * W + x];
  const objects = new Set<number>();
  for (const e of b.entities) {
    if (e.owner === ignoreOwner || e.template === "StartingLocation") continue;
    if (/^(Pine|Birch|Oak|Succulent|BlueberryBush|RuinColumnH\d)$/.test(e.template) && !e.raw) continue; // resources make room for the start
    objects.add(e.y * W + e.x);
  }
  for (const [tx, ty] of tiles) {
    if (tx < 1 || ty < 1 || tx > W - 2 || ty > H - 2) return "too close to the map edge";
    const i = ty * W + tx;
    if (b.channel[i]) return "in a river";
    if (b.water[i] > 0.05) return "under water";
    if (flat && b.heights[i] !== level) return "not on level ground";
    if (objects.has(i)) return "on an object";
    if (pieces?.[i]) return "on a set piece";
  }
  return null;
}

/** Tiles the set pieces of a document hold (their bodies and channels). */
export function pieceTiles(s: MapSession): Uint8Array {
  const { x: W, y: H } = s.size;
  const out = new Uint8Array(W * H);
  for (const f of s.features) {
    if (f.kind !== "setPiece") continue;
    const b = BUILDERS[f.params.kind];
    for (const i of b?.clears?.(f, W, H, s.features) ?? b?.area?.(f, W, H, s.features) ?? []) out[i] = 1;
  }
  return out;
}

/** The Coordinates of a StartingLocation whose middle is (x, y). */
export function cornerFor(x: number, y: number, o: Orientation): [number, number] {
  switch (o) {
    case "Cw0":
      return [x - 1, y - 1];
    case "Cw90":
      return [x - 1, y + 1];
    case "Cw180":
      return [x + 1, y + 1];
    case "Cw270":
      return [x + 1, y - 1];
  }
}

/** The operations that move the start to the nearest spot where it stands well (a fix for the
 *  start checks), or null when there is none within 24 tiles. */
export function moveStartNear(s: MapSession, fromX: number, fromY: number): EditOp[] | null {
  const b = s.built;
  const { W, H } = b;
  const feat = s.features.find((f): f is StartFeature => f.kind === "start");
  const ent = b.entities.find((e) => e.template === "StartingLocation");
  if (!feat && !ent) return null;
  const o: Orientation = feat ? feat.params.orientation : ent!.orientation;
  const pieces = pieceTiles(s);
  for (let r = 1; r <= 24; r++) {
    const ring: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([fromX + dx, fromY + dy]);
    ring.sort((a, b2) => (a[0] - fromX) ** 2 + (a[1] - fromY) ** 2 - ((b2[0] - fromX) ** 2 + (b2[1] - fromY) ** 2) || a[1] - b2[1] || a[0] - b2[0]);
    for (const [x, y] of ring) {
      if (x < 2 || y < 2 || x > W - 3 || y > H - 3) continue;
      if (feat) {
        const rr = feat.params.benchRadius;
        if (x - rr < 1 || y - rr < 1 || x + rr > W - 2 || y + rr > H - 2) continue;
        // the bench levels the ground: its disc must be dry and clear of rivers and pieces
        let ok = true;
        for (let yy = y - 2; yy <= y + 2 && ok; yy++) for (let xx = x - 2; xx <= x + 2 && ok; xx++) if (b.water[yy * W + xx] > 0.05 || b.channel[yy * W + xx]) ok = false;
        for (let yy = y - rr; yy <= y + rr && ok; yy++) for (let xx = x - rr; xx <= x + rr && ok; xx++) if (pieces[yy * W + xx]) ok = false;
        if (!ok || startProblem(b, x, y, o, false, feat.id, pieces)) continue;
        const benchLevel = Math.max(1, b.heights[y * W + x]);
        return [{ op: "updateFeature", params: { id: feat.id, patch: { params: { position: [x, y], benchLevel, bank: null } } } }];
      }
      if (startProblem(b, x, y, o, true, ent!.owner, pieces)) continue;
      const [cx, cy] = cornerFor(x, y, o);
      return [{ op: "moveEntity", params: { id: ent!.id, x: cx, y: cy } }];
    }
  }
  return null;
}

export type { Facing };
