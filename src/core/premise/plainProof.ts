// The poisoned floodplain's two proofs (docs/design/poisoned-floodplain.md §7 "proof", §9 row 4): on its settled map,
// the turn's dam and then the river in's weir built as a player builds them, each one operation on the map's session
// (`doc/session.ts`, the ground raised to the work's level as the editor's sculpt raises it), and the water and soil
// the core settles on it read: `turn.proved` and `riverIn.proved`. Offline over seeds (the heavy test,
// `tools/plain-works.ts`); kept apart from `plainWorks.ts` so the generator's mode never loads the session.

import { generatedDocument } from "../doc/document";
import { MapSession } from "../doc/session";
import type { BuildResult } from "../features/build";
import { startMiddleTile } from "../format/footprints";
import { tilesToRuns } from "../math/grid";
import type { MapSpec } from "../spec/mapspec";
import { floorTiles, settledBands, WET, type PlainMap } from "./plainMap";
import { PLAIN_IDS, plainOf } from "./premises/poisonedPlain";

const I = PLAIN_IDS;
/** The start's ground the river in must leave dry: its middle tile and `START_KEEP` round it. */
const START_KEEP = 3;
/** The Dry Fork's edge as the settled water reaches it: the map's edge within this share of the side of its line's
 *  end (its valley's lower end can be a hollow that spills to the edge beside the line's own way, seed 10 at 256², or
 *  round a corner, seed 8 at 192²). */
const FORK_EDGE = 0.25;

/** One state of the settled map: the floor's bands by the game's soil and its red water. */
export interface PlainState {
  bands: ReturnType<typeof settledBands>;
  /** Tiles of the valley's floor under water at contamination 0.5 or more. */
  red: number;
}

/** The two proofs (§7 "proof"), each on the settled map's session with the works built as operations. */
export interface PlainProof {
  before: PlainState;
  turn: PlainState & {
    /** Red water left on the Red Fall's lip, red water at the Dry Fork's edge, new water where the turn's water must
     *  not run (the valley's floor, the start's ground, the map's edge away from the Dry Fork's end), the dam's tiles. The
     *  gulch's pond behind the dam and the Dry Fork's valley take what water their ground holds: a hollow beside the
     *  fork's line filling is the fork's own water, not a leak. */
    lip: number;
    fork: number;
    leaks: number;
    tiles: number;
    ok: boolean;
  };
  riverIn: PlainState & {
    /** New water on the start's ground, new water on the plain (a sheet over it), the weir's tiles. */
    start: number;
    plain: number;
    tiles: number;
    ok: boolean;
  };
  /** The settles' time, ms. */
  ms: number;
}

/** `riverIn.proved`'s least share of the floor green (§7). */
export const RIVER_IN_GREEN = 0.7;

function stateOf(on: Uint8Array, b: Pick<BuildResult, "water" | "contamination" | "moisture" | "soilContamination">): PlainState {
  let red = 0;
  for (let i = 0; i < on.length; i++) if (on[i] && b.water[i] >= WET && b.contamination[i] >= 0.5) red++;
  return { bands: settledBands(on, b), red };
}

/** The map edge a tile stands on (0 north, 1 east, 2 south, 3 west), -1 off the edge. */
function edgeOf(i: number, W: number, H: number): number {
  const x = i % W;
  const y = (i - x) / W;
  return y === 0 ? 0 : x === W - 1 ? 1 : y === H - 1 ? 2 : x === 0 ? 3 : -1;
}

/** The two proofs on a settled map (§7 "proof"): the turn's dam built on its session as one operation (the ground
 *  raised to its level, as a player's dam stands) and the water and soil the core settles on it; then the river in's
 *  weir as a second. `turn.proved`: no red water on the valley's floor, none over the Red Fall's lip, red water at the
 *  Dry Fork's edge, no new water on the valley's floor, the start's ground or the map's edge away from the Dry Fork's end. `riverIn.proved`: the floor's green `RIVER_IN_GREEN`
 *  or more with both works, the start's ground dry. Null where a work has no site. `file`, when given, is handed the
 *  session's .timber file after each work (the sheet's frames, `tools/capture-plain.ts --works`). */
export function plainProof(spec: MapSpec, m: PlainMap, file?: (bytes: Uint8Array) => void): PlainProof | null {
  const { plan, water } = m.land;
  const { W, H } = plan;
  const N = W * H;
  const turn = m.ladder.works.find((x) => x.id === "turn");
  const inn = m.ladder.works.find((x) => x.id === "riverIn");
  if (!turn?.tiles.length || !inn?.tiles.length || turn.level === undefined || inn.level === undefined) return null;
  const t0 = performance.now();
  const b0 = m.map.built;
  const on = floorTiles(plan, m.land.relief.floor);
  const before = stateOf(on, b0);
  const s: MapSpec = { ...JSON.parse(JSON.stringify(spec)), accepted: { attempt: m.attempt, candidate: 0 } };
  const ses = MapSession.open(generatedDocument({ spec: s, features: m.map.features, built: b0, file: m.map.file, field: m.map.field }));
  const build = (tiles: number[], level: number) => {
    const raise = tiles.filter((i) => ses.built.heights[i] < level);
    const r = ses.apply({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(raise, W), level, exact: true } });
    if (r.errors?.length) throw new Error(`the works' operation was refused: ${r.errors.join("; ")}`);
  };
  // the turn
  build(turn.tiles, turn.level);
  const b1 = ses.built;
  if (file) file(ses.exportTimber().bytes);
  const lips = water.raster.lips[I.redFall] ?? [];
  const [sx, sy] = startMiddleTile(m.land.frame.start);
  const onStart = (i: number) => Math.abs((i % W) - sx) <= START_KEEP && Math.abs(Math.floor(i / W) - sy) <= START_KEEP;
  const p = plainOf(plan)!;
  const fe = p.fork.path[p.fork.path.length - 1];
  const forkEdge = (i: number) => edgeOf(i, W, H) >= 0 && Math.hypot((i % W) + 0.5 - fe[0], Math.floor(i / W) + 0.5 - fe[1]) <= FORK_EDGE * W;
  let lip = 0;
  let fork = 0;
  let leaks = 0;
  for (const i of lips) if (b1.water[i] >= WET) lip++;
  for (let i = 0; i < N; i++) {
    if (forkEdge(i) && b1.water[i] >= WET && b1.contamination[i] >= 0.5) fork++;
    if (!(b1.water[i] >= WET) || b0.water[i] >= WET) continue;
    if (on[i] || onStart(i) || (edgeOf(i, W, H) >= 0 && !forkEdge(i))) leaks++;
  }
  const st1 = stateOf(on, b1);
  // the river in
  build(inn.tiles, inn.level);
  const b2 = ses.built;
  if (file) file(ses.exportTimber().bytes);
  let start = 0;
  let plain = 0;
  for (let i = 0; i < N; i++) {
    if (!(b2.water[i] >= WET) || b1.water[i] >= WET) continue;
    if (onStart(i)) start++;
    if (m.land.relief.floor[i] === 1) plain++;
  }
  const st2 = stateOf(on, b2);
  return {
    before,
    turn: { ...st1, lip, fork, leaks, tiles: turn.tiles.length, ok: st1.red === 0 && lip === 0 && fork > 0 && leaks === 0 },
    riverIn: { ...st2, start, plain, tiles: inn.tiles.length, ok: st2.bands.green >= RIVER_IN_GREEN && start === 0 },
    ms: Math.round(performance.now() - t0),
  };
}
