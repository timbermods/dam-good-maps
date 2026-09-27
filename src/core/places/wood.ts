// The starting-logs floor on a real place (Kyler, 2026-09-26, D224, D227, D229): a place whose
// start has fewer than the floor's logs within its walk gets more trees, grown in groves that read
// the place's own land, never the same forest beside every start. `buildPlace` (place.ts) calls it
// after the resource baseline, and only for a place short of the floor.
//
// Every tile the start reaches within the floor's walk (the start requirements' walk: the map's
// ground and its natural slopes, round what blocks walking), free of objects and water, is read as
// one of these stands, each with its own trees:
// - the river bank: moist ground within 4 tiles of the water, on the start's side: birches;
// - across the water: ground near the water whose straight line to the start crosses it: a pine
//   forest on the far bank;
// - a plateau: flat ground (its 8 neighbours level with it) away from the water, where the start
//   stands high (in the top third of the map's levels) or two levels or more above it: oaks;
// - a side valley: ground most of whose surroundings (5 tiles round) stand higher, away from the
//   river: pines;
// - woodland: any other moist ground: the map's own mix.
// The stands the land offers are drawn in a seeded order, weighted by how much ground each has, and
// each gives a grove (grown as the baseline grows its groves, a blob thinned raggedly at its edge)
// sized for its share of the logs still wanting, seeded mostly 10–38 tiles out, kept apart from the
// other groves and from the trees already there; until the floor holds, or the ground runs out,
// when the last groves may grow on at the edge of the trees already there, as a forest spreads.
// Trees are grown (saplings do not count), alive on moist soil and dead on dry, as the baseline's.

import { reachAt, walkDistance } from "../analysis/walk";
import { TREE_LOGS, tree, type EntitySpec } from "../format/entities";
import { slopeHighSide } from "../format/footprints";
import { entityTiles } from "../features/edits";
import { entityId } from "../features/ids";
import { distanceFrom } from "../math/grid";
import { stream } from "../math/rng";
import { growGroveAt, type BaselineGround } from "../resources/baseline";
import { WALK_BLOCKERS, WET } from "../validate/playability";

export type Stand = "river bank" | "across the water" | "plateau" | "side valley" | "woodland";
type Species = "Pine" | "Birch" | "Oak";

/** Each stand's trees: a species a grove, drawn by these weights. */
const STAND_TREES: Record<Stand, Partial<Record<Species, number>>> = {
  "river bank": { Birch: 3, Pine: 1 },
  "across the water": { Pine: 3, Oak: 1 },
  plateau: { Oak: 1 },
  "side valley": { Pine: 1 },
  woodland: { Pine: 2, Birch: 1, Oak: 1 },
};
/** How much a stand is wanted over plain woodland (the land's own features first). */
const STAND_WEIGHT: Record<Stand, number> = {
  "river bank": 3,
  "across the water": 3,
  plateau: 3,
  "side valley": 3,
  woodland: 1,
};
const GROVE_MAX = 40;

export interface FloorInput {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  water: ArrayLike<number>;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
  /** Every entity on the map so far: the place's own and its resources. */
  entities: readonly EntitySpec[];
  /** The district center's tile. */
  start: { x: number; y: number };
  /** Logs still wanting within the walk, and the walk. */
  need: number;
  within: number;
  seed: number;
  owner: string;
}

export interface FloorWood {
  entities: EntitySpec[];
  /** The groves, in the order grown: their stand, species, trees and logs. */
  groves: { stand: Stand; species: Species; trees: number; logs: number }[];
  logs: number;
}

export function plantForFloor(inp: FloorInput): FloorWood {
  const { W, H, heights: h, water, moisture, soilContamination: soil, start } = inp;
  const N = W * H;
  const rng = stream(inp.seed, "places", "floor-wood");

  // what is taken, what blocks walking, the slopes, and the trees already there
  const taken = new Uint8Array(N);
  const blocked = new Uint8Array(N);
  const trees = new Uint8Array(N);
  const links: [number, number][] = [];
  for (const e of inp.entities) {
    for (const [x, y] of entityTiles(e)) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      taken[y * W + x] = 1;
      if (WALK_BLOCKERS.has(e.template)) blocked[y * W + x] = 1;
      if (TREE_LOGS[e.template] !== undefined || e.template === "BlueberryBush") trees[y * W + x] = 1;
    }
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && hx >= 0 && hy >= 0 && hx < W && hy < H) links.push([e.y * W + e.x, hy * W + hx]);
  }
  for (let y = start.y - 2; y <= start.y + 2; y++) for (let x = start.x - 2; x <= start.x + 2; x++) if (x >= 0 && y >= 0 && x < W && y < H) taken[y * W + x] = 1;
  const d = walkDistance(h, W, H, blocked, links, start);
  const reach = new Float64Array(N);
  for (let i = 0; i < N; i++) reach[i] = reachAt(d, W, H, i);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = water[i] > WET ? 1 : 0;
  const waterDist = distanceFrom(wet, W, H);
  // kept clear: a tile beside the trees and bushes already there
  const near = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!trees[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) near[(y + dy) * W + x + dx] = 1;
  }
  let edges = false;
  const free = (i: number) => !taken[i] && (edges || !near[i]) && !(water[i] > 0) && !(soil[i] > 0) && reach[i] <= inp.within;
  const moist = (i: number) => moisture[i] > 0 && !(water[i] > 0) && !(soil[i] > 0);

  // the land, read: each free tile's stand
  const level = h[start.y * W + start.x];
  const sorted = Float64Array.from(h).sort();
  const high = level >= sorted[Math.floor(N * (2 / 3))];
  const crosses = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    const steps = Math.ceil(Math.hypot(x - start.x, y - start.y) * 2);
    for (let k = 1; k < steps; k++) {
      const xx = Math.round(start.x + ((x - start.x) * k) / steps);
      const yy = Math.round(start.y + ((y - start.y) * k) / steps);
      if (wet[yy * W + xx]) return true;
    }
    return false;
  };
  const higherAround = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    let higher = 0;
    let all = 0;
    for (let dy = -5; dy <= 5; dy++)
      for (let dx = -5; dx <= 5; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 3) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        all++;
        if (h[yy * W + xx] > h[i]) higher++;
      }
    return all ? higher / all : 0;
  };
  const flat = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || h[(y + dy) * W + x + dx] !== h[i]) return false;
    return true;
  };
  const stand = new Array<Stand | null>(N).fill(null);
  const read = () => {
    for (let i = 0; i < N; i++) {
      if (!free(i) || stand[i]) continue;
      if (waterDist[i] <= 8 && crosses(i)) stand[i] = "across the water";
      else if (waterDist[i] <= 4 && moist(i)) stand[i] = "river bank";
      else if ((h[i] >= level + 2 || (high && waterDist[i] > 6)) && flat(i)) stand[i] = "plateau";
      else if (waterDist[i] > 4 && higherAround(i) >= 0.6) stand[i] = "side valley";
      else if (moist(i)) stand[i] = "woodland";
    }
  };
  read();

  // groves, stand by stand, until the logs are there
  const g: BaselineGround = {
    W,
    H,
    heights: h,
    water,
    moisture,
    soilContamination: soil,
    taken,
  };
  const clear = new Uint8Array(N);
  const out: EntitySpec[] = [];
  const groves: FloorWood["groves"] = [];
  let logs = 0;
  const planned = 2 + rng.int(0, 2);
  for (let k = 0; logs < inp.need && k < 16; k++) {
    // what each stand still has
    const count = new Map<Stand, number>();
    for (let i = 0; i < N; i++) if (stand[i] && !clear[i] && !taken[i]) count.set(stand[i]!, (count.get(stand[i]!) ?? 0) + 1);
    const stands = [...count.keys()].filter((s) => count.get(s)! >= 5).sort();
    if (!stands.length) {
      if (edges) break;
      // the stands are full: the last groves grow on at the edge of the trees already there
      edges = true;
      read();
      continue;
    }
    // a stand not used yet weighs more: a place's groves differ from each other
    const s = stands[rng.weighted(stands.map((t) => STAND_WEIGHT[t] * Math.sqrt(count.get(t)!) * (groves.some((q) => q.stand === t) ? 0.3 : 1)))];
    const kinds = Object.entries(STAND_TREES[s]) as [Species, number][];
    const species = kinds[rng.weighted(kinds.map(([, w]) => w))][0];
    // its share of the logs still wanting
    const share = Math.ceil((inp.need - logs) / Math.max(1, planned - groves.length));
    const n = Math.max(5, Math.min(GROVE_MAX, Math.ceil((share * 1.15) / TREE_LOGS[species])));
    const allowed = new Uint8Array(N);
    const weight = new Float64Array(N);
    let any = false;
    for (let i = 0; i < N; i++) {
      if (stand[i] !== s || clear[i] || taken[i]) continue;
      allowed[i] = 1;
      weight[i] = (moist(i) ? 3 : 1) * (reach[i] >= 10 && reach[i] <= inp.within - 2 ? 2 : 1);
      any = true;
    }
    if (!any) continue;
    let seedTile = -1;
    let r = rng.float() * weight.reduce((a, b) => a + b, 0);
    for (let i = 0; i < N && seedTile < 0; i++) if (weight[i] > 0 && (r -= weight[i]) <= 0) seedTile = i;
    if (seedTile < 0) continue;
    const grown = growGroveAt(g, rng, allowed, seedTile, n);
    if (!grown || grown.tiles.length < 3) {
      clear[seedTile] = 1;
      continue;
    }
    let got = 0;
    for (const i of grown.tiles) {
      const x = i % W;
      const y = (i - x) / W;
      out.push(
        tree({
          id: entityId(inp.owner, species, i),
          owner: inp.owner,
          x,
          y,
          z: h[i],
          species,
          dead: !moist(i),
        }),
      );
      got += TREE_LOGS[species];
    }
    for (const i of grown.area) taken[i] = 1;
    // the next grove keeps apart
    for (const i of grown.area) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) clear[(y + dy) * W + x + dx] = 1;
    }
    groves.push({ stand: s, species, trees: grown.tiles.length, logs: got });
    logs += got;
  }
  return { entities: out, groves, logs };
}
