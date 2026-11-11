// Stage 6, life and resources by budget (docs/PREMISES.md §2.2 stage 6, §4.4 `wood`; D508 (3), D224, D167, D200): on
// the settled map, the generator's own planting (`gen/resources.ts` `planResources`: the start's wood and berries
// spread over its walk, the starting-logs floor, groves with clearings between, berry patches, ruin fields of scrap)
// run with the premise's budget, and the premise's own dress of the dry land: dead woods in clumps on the empty
// basins' old shores and beside the dry beds, succulents on the dry-for-good side only, and the mine sites
// (`gen/extras.ts` `planExtras`'s, D200). Nothing grows on a work's site, on the ground only a work's water would turn
// green, in a dry bed or basin, or on the start's sight line to its landmark; so the map looks as it plays: stands and
// open meadow on day 1's green, dead wood where water used to be.
//
// The plants' palette is the spec's (its species mix, grove size, Forests and Berries), whose preset is the theme's;
// a species mix left as the panel's own takes the theme's woods (`palette`, `style.ts`: PREMISES §1.5).

import type { BuildResult } from "../features/build";
import { featureId } from "../features/ids";
import type { Feature, ForestFeature, MapObjectFeature } from "../features/schema";
import { pickSeeds } from "../gen/blobs";
import { FOREST } from "../gen/calibrated";
import { planExtras } from "../gen/extras";
import { entityJson } from "../format/entities";
import { ORIENTATIONS, type Orientation } from "../format/footprints";
import { footprintAt, fitProblems } from "../features/objects";
import { mapObjects } from "../sim/model";
import { bandScale, colonyReach, FLOOD_MARGIN, MINE_REACH_LO, minesWanted, WET } from "../validate/playability";
import { planResources } from "../gen/resources";
import { distanceFrom, runsToTiles, tilesToRuns } from "../math/grid";
import { stream } from "../math/rng";
import { growGroveAt, type BaselineGround } from "../resources/baseline";
import { between, resourceBudget } from "../resources/budget";
import type { MapSpec } from "../spec/mapspec";
import type { Ladder } from "./ladder";
import type { PremisePlan } from "./types";
import type { StageWater } from "./water";

/** The premise's budget (PREMISES §2.2 stage 6, §4.4 `wood`): living trees per 10,000 tiles, the share of the moist
 *  ground under a tree at most, berry bushes per 10,000 tiles; the seed moves each within its range (as the official
 *  baseline's place does), the Forests and Berries settings scale it. */
export const LIFE = {
  living: [450, 700],
  moistCover: 0.16,
  berries: [185, 230],
  /** A clump of dead wood on an old shore or beside a dry bed, trees. */
  deadClump: [6, 14],
  /** A dry bed this long or more has a clump beside it (the bypass one for each 60 tiles). */
  deadBed: 15,
  /** A living stand the planting left short of the budget is planted again, trees; stands this far apart at least. */
  stand: [10, 30],
  standGap: 9,
  /** How far either side of the start's sight line to its landmark nothing grows, tiles. */
  sight: 1,
} as const;

/** What stage 6 planted, against its budget. */
export interface LifeReport {
  /** Trees standing on moist ground (living), dead ones and succulents (living on dry ground); the living and the
   *  succulents per 10,000 tiles. */
  living: number;
  dead: number;
  succulents: number;
  livingPer10k: number;
  /** The living trees over the moist, dry-footed ground. */
  cover: number;
  bushes: number;
  bushesPer10k: number;
  /** The budget asked: living trees and bushes. */
  want: { living: number; bushes: number };
  /** Dead wood on old shores and beside dry beds: clumps and trees. */
  shores: { clumps: number; trees: number };
  mineSites: number;
  /** What stage 6 took: its planting and the build again (the settle reused), ms. */
  ms: number;
}

export interface PremiseLife {
  features: Feature[];
  report: LifeReport;
  notes: string[];
}

/** The tiles nothing grows on: each work's site and a tile round it, the ground only a work's water would turn green
 *  or wet (its reach, with `green`), the dry beds and basins and the start's sight line to every lip tile of its
 *  landmark. */
function keepOff(plan: PremisePlan, w: StageWater, ladder: Ladder, green: boolean): Uint8Array {
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  const out = new Uint8Array(N);
  const ring = (i: number, k: number) => {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -k; dy <= k; dy++)
      for (let dx = -k; dx <= k; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) out[yy * W + xx] = 1;
      }
  };
  for (const s of ladder.works) {
    for (const i of s.tiles) ring(i, 1);
    if (green) for (const i of runsToTiles(s.reach, W)) out[i] = 1;
  }
  for (let i = 0; i < N; i++) {
    const b = r.lake[i] ? plan.bodies[r.lake[i] - 1] : null;
    const l = r.channel[i] ? plan.links[r.channel[i] - 1] : null;
    if ((b && b.dry) || (l && !l.wet)) out[i] = 1;
  }
  // the sight line: from the start's middle to each lip tile, `LIFE.sight` either side
  const { x: sx, y: sy } = plan.frame.start;
  for (const t of r.lips[plan.frame.landmark] ?? []) {
    const tx = t % W;
    const ty = (t - tx) / W;
    const n = Math.ceil(2 * Math.max(Math.abs(tx - sx), Math.abs(ty - sy)));
    for (let k = 0; k <= n; k++) ring(Math.round(ty + ((sy - ty) * k) / n) * W + Math.round(tx + ((sx - tx) * k) / n), LIFE.sight);
  }
  return out;
}

/** Stage 6 on a settled premise map (`built`, its first build): the generator's planting by the premise's budget, the
 *  dead woods on old shores and beside dry beds, succulents on the dry-for-good side and the mine sites, as features
 *  for one more build (its settle reused: nothing here moves water). */
export function premiseLife(spec: MapSpec, plan: PremisePlan, w: StageWater, ladder: Ladder, built: BuildResult, features: readonly Feature[], attempt: number, palette: MapSpec["settings"]["resources"]["speciesMix"] | null = null): PremiseLife {
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  const notes: string[] = [];
  const res = spec.settings.resources;
  // the budget: the official baseline's place for this seed, read into the premise's ranges
  const base = resourceBudget(W, H, { ...res, forestDensity: 100, berryBushes: 100 }, spec.seed);
  const wantLiving = Math.round((between(LIFE.living[0], LIFE.living[1], base.place.living) * N * res.forestDensity) / 1e6);
  const wantBushes = Math.round((between(LIFE.berries[0], LIFE.berries[1], base.place.bushes) * N * res.berryBushes) / 1e6);
  const mix = palette ?? res.speciesMix;
  // (succulents are the dry-for-good side's alone: planted below, out of the generator's mix)
  const succulentShare = mix.succulent / Math.max(1, mix.pine + mix.birch + mix.oak + mix.succulent);
  const lifeSpec: MapSpec = {
    ...spec,
    settings: {
      ...spec.settings,
      resources: {
        ...res,
        forestDensity: base.living > 0 ? Math.round((100 * wantLiving * (1 - succulentShare)) / base.living) : res.forestDensity,
        berryBushes: base.bushes > 0 ? Math.round((100 * wantBushes) / base.bushes) : res.berryBushes,
        speciesMix: { ...mix, succulent: 0 },
      },
    },
  };
  const protect = keepOff(plan, w, ladder, true);
  const planted = planResources(lifeSpec, built, 0, attempt, { protect, moistCover: LIFE.moistCover });
  const out: Feature[] = [...planted];

  // what the planting took, so the premise's own dress keeps off it
  const taken = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (built.occupied[i] || built.water[i] > 0) taken[i] = 1;
  for (const f of planted) if (f.kind === "forest" || f.kind === "berryPatch" || f.kind === "ruinField") for (const i of runsToTiles(f.params.area, W)) taken[i] = 1;
  const ground: BaselineGround = { W, H, heights: built.heights, water: built.water, moisture: built.moisture, soilContamination: built.soilContamination, taken };
  const rng = stream(spec.seed, "premise.life", attempt);
  const species = ["Pine", "Birch", "Oak"] as const;
  const weights = [mix.pine, mix.birch, mix.oak];
  const clump = (allowed: Uint8Array, role: string, n: number, sp: string, life: "dead" | "auto", at?: number): number => {
    let seed = at ?? -1;
    if (seed < 0) {
      const seeds: number[] = [];
      for (let i = 0; i < N; i++) if (allowed[i]) seeds.push(i);
      if (!seeds.length) return 0;
      seed = seeds[rng.int(0, seeds.length)];
    }
    const grown = growGroveAt(ground, rng, allowed, seed, n);
    if (!grown || grown.tiles.length < 3) return 0;
    for (const i of grown.area) {
      taken[i] = 1;
      allowed[i] = 0;
    }
    const tiles = [...grown.tiles].sort((a, b) => a - b);
    const f: ForestFeature = {
      id: featureId(spec.seed, "forest", role),
      kind: "forest",
      origin: "generated",
      role,
      locked: false,
      params: { area: tilesToRuns(tiles, W), density: 1, speciesMix: { [sp]: 1 }, groveSize: tiles.length, life, youngShare: life === "dead" ? 0 : FOREST.youngShare },
    };
    out.push(f);
    return tiles.length;
  };
  const moistFree = (i: number) => built.moisture[i] > 0 && !(built.water[i] > 0) && !(built.soilContamination[i] > 0);
  // dead woods on old shores (each empty basin's beach and bank) and beside dry beds (a clump a bed, the old channel
  // one for each 60 tiles of it), on dry ground the planting left
  const shores = { clumps: 0, trees: 0 };
  const near = (mask: Uint8Array, lo: number, hi: number) => {
    const d = distanceFrom(mask, W, H);
    const a = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (d[i] >= lo && d[i] <= hi && !taken[i] && !protect[i] && !(built.moisture[i] > 0)) a[i] = 1;
    return a;
  };
  if (weights.some((v) => v > 0)) {
    for (let k = 0; k < plan.bodies.length; k++) {
      const b = plan.bodies[k];
      if (!b.dry) continue;
      const mask = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (r.lake[i] === k + 1) mask[i] = 1;
      const n = clump(near(mask, 1, 4), `premise/deadwood/${b.id}`, rng.int(LIFE.deadClump[0], LIFE.deadClump[1] + 1), species[rng.weighted(weights)], "dead");
      if (n) [shores.clumps, shores.trees] = [shores.clumps + 1, shores.trees + n];
    }
    for (let k = 0; k < plan.links.length; k++) {
      const l = plan.links[k];
      if (l.wet || l.kind === "leat" || !l.path) continue;
      const mask = new Uint8Array(N);
      let len = 0;
      for (let i = 0; i < N; i++)
        if (r.channel[i] === k + 1) {
          mask[i] = 1;
          len = Math.max(len, r.along[i]);
        }
      if (len < LIFE.deadBed) continue;
      const clumps = l.kind === "bypass" ? Math.max(1, Math.floor(len / 60)) : 1;
      const allowed = near(mask, 1, 3);
      for (let c = 0; c < clumps; c++) {
        const n = clump(allowed, `premise/deadwood/${l.id}/${c}`, rng.int(LIFE.deadClump[0], LIFE.deadClump[1] + 1), species[rng.weighted(weights)], "dead");
        if (n) [shores.clumps, shores.trees] = [shores.clumps + 1, shores.trees + n];
      }
    }
  }
  // succulents: the dry-for-good side alone (nearer the old channel than any lake, no moisture), in a few stands
  let succulents = 0;
  const wantSucc = Math.round(wantLiving * succulentShare);
  if (wantSucc > 0) {
    const by = plan.links.findIndex((l) => l.kind === "bypass");
    const byMask = new Uint8Array(N);
    const lakeMask = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (r.channel[i] === by + 1) byMask[i] = 1;
      if (r.lake[i] && plan.bodies[r.lake[i] - 1].kind !== "basin") lakeMask[i] = 1;
    }
    const dBy = distanceFrom(byMask, W, H);
    const dLake = distanceFrom(lakeMask, W, H);
    const dry = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (dBy[i] >= 3 && dBy[i] < dLake[i] && !taken[i] && !protect[i] && !(built.moisture[i] > 0)) dry[i] = 1;
    for (let k = 0; k < 8 && succulents < wantSucc; k++) {
      const n = Math.min(wantSucc - succulents, rng.int(8, 20));
      if (n < 3) break;
      // (a succulent lives on dry ground: its stand is living)
      const got = clump(dry, `premise/succulents/${k}`, n, "Succulent", "auto");
      if (!got) break;
      succulents += got;
    }
  }
  // the living stands the planting left short of the budget (its groves leave room for the start's own, which
  // plants less): more stands on the moist ground left, apart, up to the cover's ceiling; birch by living water, pine
  // well back from it, oak between, as the mix allows
  let living = 0;
  let room = 0;
  for (let i = 0; i < N; i++) if (moistFree(i)) room++;
  for (const f of out) if (f.kind === "forest" && f.params.life !== "dead" && !("Succulent" in f.params.speciesMix)) for (const i of runsToTiles(f.params.area, W)) if (moistFree(i)) living++;
  const short = Math.min(wantLiving - succulents, Math.floor(LIFE.moistCover * room)) - living;
  if (short > 0 && weights.some((v) => v > 0)) {
    const wetMask = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (built.water[i] > 0) wetMask[i] = 1;
    const dWet = distanceFrom(wetMask, W, H);
    const open = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (moistFree(i) && !taken[i] && !protect[i]) open[i] = 1;
    const size = LIFE.stand;
    let got = 0;
    let k = 0;
    for (const at of pickSeeds(rng, open, W, Math.ceil((2 * short) / size[0]), LIFE.standGap)) {
      if (got >= short) break;
      if (!open[at]) continue;
      const place = dWet[at] <= 3 ? 1 : dWet[at] >= 9 ? 0 : 2;
      const sp = weights[place] > 0 ? species[place] : species[rng.weighted(weights)];
      const n = clump(open, `premise/stand/${k++}`, Math.min(short - got, rng.int(size[0], size[1] + 1)), sp, "auto", at);
      got += n;
      living += n;
    }
  }
  // the mine sites (D200): the generator's own, off the works' sites, the beds and basins and the sight line
  // (a mine site may stand on ground a work would green: it is farmland lost, never a work lost)
  const avoid = keepOff(plan, w, ladder, false);
  for (let i = 0; i < N; i++) if (r.lake[i] || r.channel[i]) avoid[i] = 1;
  const mines = reachedMines(spec, built, planExtras({ spec, base: built, features, avoid, candidate: 0, attempt }).filter((f) => f.params.kind === "mineSite"), avoid);
  out.push(...mines);

  // the counts, against the budget
  let dead = 0;
  let bushes = 0;
  for (const f of out) {
    if (f.kind === "berryPatch") bushes += runsToTiles(f.params.area, W).length;
    if (f.kind === "forest" && !("Succulent" in f.params.speciesMix)) for (const i of runsToTiles(f.params.area, W)) if (f.params.life === "dead" || !moistFree(i)) dead++;
  }
  const report: LifeReport = {
    living,
    dead,
    succulents,
    livingPer10k: Math.round((1e4 * (living + succulents)) / N),
    cover: Math.round((1000 * living) / Math.max(1, room)) / 1000,
    bushes,
    bushesPer10k: Math.round((1e4 * bushes) / N),
    want: { living: wantLiving, bushes: wantBushes },
    shores,
    mineSites: mines.length,
    ms: 0,
  };
  if (report.livingPer10k < LIFE.living[0]) notes.push(`${report.livingPer10k} living trees per 10,000 tiles (${LIFE.living[0]} to ${LIFE.living[1]} asked): ${report.cover >= LIFE.moistCover ? `the moist ground holds ${Math.round(LIFE.moistCover * 100)} % under trees at most` : "the moist ground left held no more stands"}`);
  return { features: out, report, notes };
}

/** The mine sites (D200, item 47): the generator's, each one the colony does not reach (`colonyReach`, the check's
 *  own reading) moved to level ground beside the start's reach, the farthest first, apart from the others. A lake
 *  stair's start often stands on a meadow walled by the stair's own steps, where the generator's picker, which wants
 *  a margin round each site, finds no room; a site needs only its own footprint level and dry. */
function reachedMines(spec: MapSpec, b: BuildResult, mines: MapObjectFeature[], avoid: Uint8Array): MapObjectFeature[] {
  const { W, H } = b;
  const N = W * H;
  const want = minesWanted(W, H);
  if (!b.start) return mines;
  const wet = Uint8Array.from(b.water, (d) => (d > WET ? 1 : 0));
  const objs = mapObjects({ entities: b.entities.map(entityJson) });
  const reach = colonyReach(W, H, b.heights, wet, objs, b.start);
  const tilesOf = (f: MapObjectFeature): [number, number][] => {
    const p = f.params.placement as { x: number; y: number; orientation: Orientation };
    return footprintAt("mineSite", p.x, p.y, p.orientation);
  };
  const beside = (tiles: readonly (readonly [number, number])[]): boolean => {
    const own = new Set(tiles.map(([x, y]) => y * W + x));
    for (const [x, y] of tiles)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && !own.has(yy * W + xx) && reach[yy * W + xx]) return true;
        }
    return false;
  };
  const kept = mines.filter((f) => beside(tilesOf(f)));
  if (kept.length >= Math.min(want, mines.length) && mines.length >= want) return mines;
  // the start's distance (its 3×3 middle, as the check measures), and the tiles a site may not take
  const startMask = new Uint8Array(N);
  for (let y = b.start.y - 1; y <= b.start.y + 1; y++) for (let x = b.start.x - 1; x <= b.start.x + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) startMask[y * W + x] = 1;
  const sd = distanceFrom(startMask, W, H);
  const lo = MINE_REACH_LO * bandScale(W, H) + 1;
  const blocked = avoid.slice();
  for (let i = 0; i < N; i++) if (wet[i]) blocked[i] = 1;
  const nearWet = distanceFrom(wet, W, H);
  const take = (tiles: readonly (readonly [number, number])[]) => {
    for (const [x, y] of tiles)
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) blocked[yy * W + xx] = 1;
        }
  };
  for (const f of kept) take(tilesOf(f));
  const out = kept.slice();
  // (candidates: each corner and facing whose footprint is level, dry, clear of water by the flood margin, off the
  // works and the beds, the band's distance out and beside the reach; the farthest first)
  const cands: { d: number; x: number; y: number; o: Orientation }[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!reach[i] || blocked[i] || sd[i] < lo) continue;
      for (const o of ORIENTATIONS) {
        const tiles = footprintAt("mineSite", x, y, o);
        let d = Infinity;
        let ok = true;
        for (const [tx, ty] of tiles) {
          if (tx < 0 || ty < 0 || tx >= W || ty >= H || blocked[ty * W + tx] || nearWet[ty * W + tx] <= FLOOD_MARGIN) {
            ok = false;
            break;
          }
          d = Math.min(d, sd[ty * W + tx]);
        }
        if (ok && d >= lo && !fitProblems("mineSite", tiles, { W, H, heights: b.heights, water: b.water, channel: b.channel, occupied: b.occupied }).length && beside(tiles)) cands.push({ d, x, y, o });
      }
    }
  cands.sort((a, c) => c.d - a.d || a.y - c.y || a.x - c.x);
  for (const c of cands) {
    if (out.length >= Math.max(want, mines.length)) break;
    const tiles = footprintAt("mineSite", c.x, c.y, c.o);
    if (tiles.some(([x, y]) => blocked[y * W + x])) continue;
    const role = `premise/mineSite/${out.length}`;
    out.push({ id: featureId(spec.seed, "mapObject", role), kind: "mapObject", origin: "generated", role, locked: false, params: { kind: "mineSite", placement: { x: c.x, y: c.y, orientation: c.o } } });
    take(tiles);
  }
  // (a site the colony cannot reach stays where the generator put it when the reach has no room for it: the check
  // `resources.mine_site` then fails the plan in one line, never silently)
  for (const f of mines) if (out.length < mines.length && !out.includes(f)) out.push(f);
  return out;
}
