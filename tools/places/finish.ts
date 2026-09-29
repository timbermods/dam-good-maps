// A real place finished (Kyler, 2026-09-29, PLAN §20 D331; the forces-preview feedback's item 27):
// the steps after its land and water are converted (convert.ts). Real places keep the real land:
// nothing here changes it, gates a place or drops one, but for item 27's lip beside a river's head.
//
// 1. Item 27: where a river's head is at the map's edge (a row of sources on the boundary), the
//    edge tiles its water would reach beside the row stand a level above that water, so it flows
//    into the map, never straight off it (water/edgeLip.ts, as small as the lip allows). The one
//    place the conversion raises real tiles.
// 2. The start, by D331's preferences: a start whose wood, berries, water and first farmland are
//    reachable on foot without stairs, with enough level land for the first buildings (the moist
//    farmland and level land: analysis/startLand.ts; wood and berries: the validators' start.wood
//    and start.food, whose Normal 30 bushes cover an Iron Teeth start at every difficulty), each
//    start built in full with its objects. The conversion's start stays when it qualifies; else the
//    nearest that does, among the conversion's own candidates (convert.ts `starts`); where none
//    does, the conversion's start (its best) stands.
// 3. The objects (D331 (3)), placed when the place is built (places/place.ts, resources/plan.ts):
//    two mine sites the colony reaches, a badwater spring where one would rise (a hollow or side
//    valley, a level 3×3) clear of the start's water and first farmland, and berries near the start.
//    Each only where the land offers a natural spot; where none does, the place goes without.
//
// The absolutes hold throughout: every blocking check, the starting-logs floor (D245) and D300's
// water floor (water a pump reaches from the start).

import { components } from "../../src/core/analysis/regions";
import { sourcesInFlow } from "../../src/core/analysis/sources";
import { startLand, FARMLAND_NEAR, LEVEL_LAND_NORMAL } from "../../src/core/analysis/startLand";
import { pumpShoreDistance, walkDistance } from "../../src/core/analysis/walk";
import { buildPlace, decodeHeights, encodeHeights, logFloorProblem, PLACE_RULES, placeNotes, placeProblems, type BuiltPlace, type PlaceData } from "../../src/core/places/place";
import { waterModel } from "../../src/core/sim/model";
import { canonicalSettle, type CanonicalWater } from "../../src/core/sim/prefill";
import { gameSoil } from "../../src/core/sim/soil";
import { DIFFICULTY_RULES } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { edgeLip, LIP_REACH } from "../../src/core/water/edgeLip";
import { mapObject, noOutflow, sourceEntities, starts, waterCover, type Converted, type PlaceMeta } from "./convert";

/** Bump when the finish would come out differently: kept conversions are finished again. */
export const FINISH = 1;
/** Starts built and checked in full, at most, before the conversion's start stands. */
const BUILDS = 8;

/** What the finish did (convert.ts `Converted.finish`), for the progress log. */
export interface Finished {
  v: number;
  /** Edge tiles the lip raised (item 27); the springs downstream its water now reaches, which go
   *  (D171); and source groups whose water no longer drains after it. */
  lip: number;
  /** The lip's tiles, when it would have left no start meeting the absolutes and was not raised. */
  lipWithheld?: number;
  inFlow: number;
  pooled: number;
  /** How far the start moved (tiles, straight), and whether it meets D331's preferences. */
  moved: number;
  qualifies: boolean;
  /** D331's preferences the start misses, when none qualifies. */
  unmet: string[];
  /** The objects placed (D331 (3)). */
  mines: number;
  reachableMines: number;
  badwater: number;
  bushes: number;
  /** The start's farmland and level land within 20 tiles' walk (analysis/startLand.ts). */
  farmland: number;
  level: number;
}

const settle = (h: Uint8Array, size: number, sources: [number, number, number][]): CanonicalWater =>
  canonicalSettle(waterModel(size, size, h, sourceEntities(sources, h, size).map(mapObject)), { rules: PLACE_RULES.water });

/** Item 27's lip round every row of sources on the map's edge (step 1): a river coming in there.
 *  `springs` are sources that are not a river's head (the water floor's spring, D300, which may
 *  touch the edge): never lipped, never raised. Returns the tiles raised. */
export function edgeLips(h: Uint8Array, size: number, sources: [number, number, number][], water: CanonicalWater, springs: readonly [number, number][] = []): number {
  const W = size;
  const N = W * W;
  const onEdge = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return x === 0 || y === 0 || x === W - 1 || y === W - 1;
  };
  const keep = new Uint8Array(N);
  const edge = new Uint8Array(N);
  const spring = new Set(springs.map(([x, y]) => y * W + x));
  for (const [x, y] of sources) {
    keep[y * W + x] = 1;
    if (onEdge(y * W + x) && !spring.has(y * W + x)) edge[y * W + x] = 1;
  }
  // each row: the edge sources joined along the edge (a corner's too)
  const { labels, sizes } = components(edge, W, W, true);
  const rows: number[][] = sizes.map(() => []);
  for (let i = 0; i < N; i++) if (labels[i] >= 0) rows[labels[i]].push(i);
  const raised = new Set<number>();
  for (const row of rows) {
    // the head's water: its own and what it runs into, within the lip's reach (as the generator
    // measures it, gen/generate.ts on M9b)
    let surface = -Infinity;
    const seen = new Set<number>(row);
    const q = row.slice();
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      surface = Math.max(surface, h[c] + water.depth[c]);
      const x = c % W;
      const y = (c - x) / W;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        const n = ny * W + nx;
        if (seen.has(n) || !(water.depth[n] > 0.001)) continue;
        if (!row.some((r0) => Math.max(Math.abs((r0 % W) - nx), Math.abs(Math.floor(r0 / W) - ny)) <= LIP_REACH)) continue;
        seen.add(n);
        q.push(n);
      }
    }
    for (const i of edgeLip(h, W, W, { row, surface, keep }).raised) raised.add(i);
  }
  return raised.size;
}

/** Finish one converted place (see the file's header). A conversion that no start passes the
 *  absolutes on after the lip comes back not ok, with the reason. */
export function finishPlace(r: Converted, meta: PlaceMeta, opts: { lip?: boolean } = {}): Converted {
  const size = r.size;
  const W = size;
  let sources = r.sources!;
  const h = decodeHeights(r.heights!);
  const rules = DIFFICULTY_RULES.normal;
  const modelOf = () => {
    const objects = sourceEntities(sources, h, size).map(mapObject);
    return { objects, model: waterModel(size, size, h, objects) };
  };

  // 1. the lip, and the water settled on it
  let water = settle(h, size, sources);
  const before = noOutflow(modelOf().model, water.depth).size;
  const lip = opts.lip === false ? 0 : edgeLips(h, size, sources, water, r.spring?.row ?? []);
  // the head's water now runs into the map, as the real river does: a spring downstream that it
  // reaches is no longer where water begins (D171, as the conversion drops one, convert.ts), and
  // goes; the head's water feeds that river instead. A row on the edge always stays.
  let inFlow = 0;
  if (lip) {
    water = settle(h, size, sources);
    for (let round = 0; round < 3; round++) {
      const { objects, model } = modelOf();
      // (a group any of whose sources stands on the edge stays whole: a river coming in)
      const flagged = sourcesInFlow(model, objects, water.depth).inFlow;
      const mask = new Uint8Array(W * W);
      for (const k of flagged) mask[sources[k][1] * W + sources[k][0]] = 1;
      const { labels } = components(mask, W, W, true);
      const edged = new Set<number>();
      for (const k of flagged) {
        const [x, y] = sources[k];
        if (x === 0 || y === 0 || x === W - 1 || y === W - 1) edged.add(labels[y * W + x]);
      }
      const gone = new Set(flagged.filter((k) => !edged.has(labels[sources[k][1] * W + sources[k][0]])));
      if (!gone.size) break;
      inFlow += gone.size;
      sources = sources.filter((_, k) => !gone.has(k));
      water = settle(h, size, sources);
    }
  }
  const pooled = Math.max(0, noOutflow(modelOf().model, water.depth).size - before);
  const heights = encodeHeights(h);
  // (the water floor's spring, D300, as it stands: gone when the lip's water took its place)
  const springRow = r.spring?.row.filter(([x, y]) => sources.some(([sx, sy]) => sx === x && sy === y));
  const spring = r.spring && springRow?.length ? { ...r.spring, row: springRow } : undefined;

  // 2. the start
  const objects = sourceEntities(sources, h, size).map(mapObject);
  const soil = gameSoil(size, size, h, water.depth, water.contamination, objects, water.sat, PLACE_RULES.soil);
  const landOf = ([x, y]: [number, number]) => {
    const walk = walkDistance(h, W, W, null, [], { x: x + 1, y: y + 1 }, 24);
    const shore = pumpShoreDistance(walk, h, W, W, water.depth, water.contamination).distance;
    const land = startLand({ W, H: W, heights: h, walk, depth: water.depth, moisture: soil.moisture, soilContamination: soil.contamination });
    const unmet = [...(shore <= rules.waterWithin ? [] : ["water"]), ...(land.farmland >= FARMLAND_NEAR ? [] : ["farmland"]), ...(land.level >= LEVEL_LAND_NORMAL ? [] : ["level land"])];
    return { ...land, unmet, ok: !unmet.length };
  };
  const own = r.start!;
  const seen = new Set<number>();
  const cands: [number, number][] = [];
  for (const s of [own, ...starts(h, W, W, water, soil.moisture), ...starts(h, W, W, water, soil.moisture, true)]) {
    const k = s[1] * W + s[0];
    if (seen.has(k)) continue;
    seen.add(k);
    cands.push(s);
  }
  // (the conversion's start first, then the rest nearest it: a start moves no farther than it must)
  const far = (s: [number, number]) => Math.hypot(s[0] - own[0], s[1] - own[1]);
  cands.sort((a, b) => far(a) - far(b));
  const place = (start: [number, number]): PlaceData => ({ format: 2, ...meta, W: size, H: size, heights, sources, ...(spring ? { spring: { at: spring.at, why: spring.why, row: spring.row } } : {}), start });
  const check = (built: BuiltPlace) => {
    const v = validateMap(built.file, { profile: "generate", designedFor: "normal", features: [], water: { model: built.model, settled: built.settle }, waterRules: PLACE_RULES.water, soilRules: PLACE_RULES.soil });
    const { blocking, shortOf } = placeProblems(v.report.checks);
    if (logFloorProblem(built.logs)) blocking.push("start.log_floor");
    return { v, blocking, shortOf, absolutes: !blocking.length && !shortOf.includes("start.water") };
  };
  // built in full with its objects: the nearest start that qualifies on its land and, built, on its
  // wood and berries, meeting the absolutes; else the conversion's (its best stands); else the first
  // in its ranking that meets the absolutes
  type Tried = { s: [number, number]; built: BuiltPlace; c: ReturnType<typeof check>; qualifies: boolean };
  let got: Tried | null = null;
  let builds = 0;
  const attempt = (s: [number, number]): Tried => {
    builds++;
    const built = buildPlace(place(s), water);
    const c = check(built);
    if (process.env.DGM_FINISH_DEBUG) console.log("finish", r.row, s, c.blocking, c.shortOf);
    return { s, built, c, qualifies: c.absolutes && landOf(s).ok && !c.shortOf.includes("start.wood") && !c.shortOf.includes("start.food") };
  };
  let ownTry: Tried | null = null;
  for (const s of cands) {
    if (builds >= BUILDS) break;
    if (!landOf(s).ok) continue;
    const t = attempt(s);
    if (s === own) ownTry = t;
    if (t.qualifies) {
      got = t;
      break;
    }
  }
  if (!got) {
    for (const s of [own, ...cands.filter((q) => q !== own)]) {
      if (builds >= 2 * BUILDS) break;
      const t = s === own && ownTry ? ownTry : attempt(s);
      if (t.c.absolutes) {
        got = t;
        break;
      }
    }
  }
  if (got) {
    const { s, built, c } = got;
    const food = c.v.report.checks.find((q) => q.id === "start.food");
    const land = landOf(s);
    const unmet = [...land.unmet, ...(c.shortOf.includes("start.wood") ? ["wood"] : []), ...(c.shortOf.includes("start.food") ? ["berries"] : [])];
    const moved = Math.round(Math.hypot(s[0] - own[0], s[1] - own[1]));
    const finish: Finished = {
      v: FINISH,
      lip,
      inFlow,
      pooled,
      moved,
      qualifies: got.qualifies,
      unmet,
      mines: built.resources.mines.length,
      reachableMines: built.resources.mines.filter((m) => m.reachable).length,
      badwater: built.resources.badwater.length,
      bushes: Number(food?.value ?? 0),
      farmland: land.farmland,
      level: land.level,
    };
    const advisories = c.v.report.checks.filter((q) => !q.ok && q.advisory && q.applicable !== false).map((q) => q.id);
    return {
      ...r,
      heights,
      sources,
      spring,
      start: s,
      ...(lip ? { settled: water.settled, ticks: water.ticks, cover: waterCover(water.depth) } : {}),
      shortOf: c.shortOf,
      notes: placeNotes(c.v.report.checks),
      advisories,
      finish,
    };
  }
  // the absolutes come first (D331): where the lip leaves no start its water floor or the rest, the
  // place goes without the lip, and says so
  if (lip) {
    const without = finishPlace(r, meta, { lip: false });
    return without.finish ? { ...without, finish: { ...without.finish, lipWithheld: lip } } : without;
  }
  return { ...r, ok: false, reason: "finish: no start meets the absolutes" };
}
