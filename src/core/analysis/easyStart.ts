// Easy start (D495): a start someone can play at once, for a relaxed game, with no doctoring. The rest of the
// map keeps its variety and drama; only the start is calm and generous. A plain core question (D342 (3)): what
// a map's start holds against each target, read on the map as a file holds it and its settled water, the way
// the checks read a map (the walk over the map's own ground and slopes, the D153 / D302 water rule, the game's
// soil). With Easy start on, the generator's checks turn each target into a row that blocks a map
// (`validate/checks.ts`), so it plans again; the generator also steers and shapes for them (gen/generate.ts,
// gen/settler.ts, gen/resources.ts).
//
// The targets, at 128² and up (smaller maps scale the distances by their side ÷ 128, `bandScale`, and below
// 96² the amounts by their area):
// 1. Room to build: 400+ tiles of level dry ground at the start's level within 14 tiles of its middle, joined to
//    it, the district center well inside (85% of the ground within 6 tiles of its middle on it, water left out).
// 2. Calm surroundings: within 8 tiles the dry ground stays within 2 levels of the start's (the banks of water
//    aside), and the colony walks out of it: 300+ tiles beyond 14 on foot.
// 3. Water at hand: clean water a pump draws (D153, D302) within 6 tiles' walk; a pump within 10 still draws it
//    after a Normal drought (9 days, the checks' drought model `droughtStorage`); badwater reaches none of it in
//    the first badtide (2 days on Normal, then a day of the water running on); no badwater source within 40
//    tiles.
// 4. Food and farmland: 40+ living berry bushes within 15 tiles' walk on soil that stays moist through a Normal
//    drought (no `plants.drought` warning for them); 150+ tiles of moist farmland within 20 tiles' walk.
// 5. Wood: 250+ logs of grown trees within 20 tiles' walk (Easy's Minimum starting wood).
// 6. Metal: ruins within 25 tiles' walk, reached on foot.
// 7. No hazards near: no thorns, unstable core or badtide drain within 30 tiles.
// 8. Readable at a glance: the start's water in the game's opening frame.

import { components } from "./regions";
import { PUMP_CLEAN, reachAt, startWaterShore, tileShoreWalk, walkDistance, walkWorld, WATER_BODY } from "./walk";
import { openingFrame } from "./opening";
import { entityTiles } from "../features/edits";
import { startMiddleTile, type Orientation } from "../format/footprints";
import { distanceFrom } from "../math/grid";
import { droughtStorage } from "../sim/drought";
import type { MapObject } from "../sim/model";
import type { CanonicalWater } from "../sim/prefill";
import { gameSoil } from "../sim/soil";
import { StartWaterDays } from "../sim/startWaterDay";
import { TICKS_PER_DAY, type WaterModel } from "../sim/water";
import { hazardDays, HazardRun } from "../sim/weather";
import { bandScale, WET } from "../validate/playability";

/** The targets at 128² and up (`easyTargets` scales them to a map). */
export const EASY_START = {
  /** Level dry ground at the start's level joined to it, within `roomRadius` of its middle. */
  room: 400,
  roomRadius: 14,
  /** The district center well inside it: this share of the ground within `insideRadius` on it. */
  insideRadius: 6,
  insideShare: 0.85,
  /** Within `calmRadius`, dry ground more than `calmLevels` from the start's level, banks aside: at most `calmSpare` tiles. */
  calmRadius: 8,
  calmLevels: 2,
  calmSpare: 4,
  /** Tiles the colony walks to beyond `roomRadius` (a way out of the start's area). */
  out: 300,
  /** Clean water a pump draws within this walk (D153, D302). */
  water: 6,
  /** A pump within this walk still draws the start's water after a Normal drought. */
  droughtWalk: 10,
  /** The first badtide on Normal (investigation/cycles: the badtide handicap 0.15 × its 8 days, 1.2, rounded away
   *  from zero), and the days its water runs on after it. */
  badtideDays: 2,
  badtideAfter: 1,
  /** No badwater source within this many tiles of the start's middle. */
  badwaterSource: 40,
  /** Living berry bushes within `bushesWithin` tiles' walk that stay moist through a Normal drought. */
  bushes: 40,
  bushesWithin: 15,
  /** Moist farmland within `farmlandWithin` tiles' walk (the checks' `start.farmland` reading). */
  farmland: 150,
  farmlandWithin: 20,
  /** Logs of grown trees within 20 tiles' walk (Easy's Minimum starting wood, D85). */
  wood: 250,
  /** A ruin column the colony walks beside within this walk. */
  ruins: 25,
  /** No thorns, unstable core or badtide drain within this many tiles of the start's middle. */
  hazards: 30,
} as const;

export type EasyTargets = { -readonly [K in keyof typeof EASY_START]: number };

/** The targets for a map of W × H (`relax` 1 as they are; less in a late rescue round, D471: every setting makes
 *  a map). Distances scale with the side under 128² (`bandScale`), amounts with the area under 96². */
export function easyTargets(W: number, H: number, relax = 1): EasyTargets {
  const s = bandScale(W, H);
  const a = Math.min(1, (W * H) / (96 * 96));
  const t = { ...EASY_START } as EasyTargets;
  t.room = Math.round(EASY_START.room * a * relax);
  t.out = Math.round(EASY_START.out * a * relax);
  t.bushes = Math.round(EASY_START.bushes * a * relax);
  t.farmland = Math.round(EASY_START.farmland * a * relax);
  t.wood = Math.round(EASY_START.wood * a * relax);
  t.badwaterSource = Math.round(EASY_START.badwaterSource * s * relax);
  t.hazards = Math.round(EASY_START.hazards * s * relax);
  t.roomRadius = Math.round(EASY_START.roomRadius * Math.max(s, 0.75));
  // (a relaxed round asks the water a little further)
  if (relax < 1) {
    t.water = EASY_START.water + 2;
    t.droughtWalk = EASY_START.droughtWalk + 4;
    t.ruins = EASY_START.ruins + 10;
    t.calmSpare = EASY_START.calmSpare * 3;
  }
  return t;
}

/** What Easy start reads of a map. */
export interface EasyStartInput {
  W: number;
  H: number;
  heights: Uint8Array;
  objects: readonly MapObject[];
  /** The settled water (the canonical settle the checks ran on) and its model. */
  water: Pick<CanonicalWater, "depth" | "contamination"> & { stack?: CanonicalWater["stack"] };
  model: WaterModel;
  /** The soil the checks read (their analysis): moisture and contamination per tile. */
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
  /** Logs of grown trees within 20 tiles' walk (the checks' `woodNear`). */
  woodNear: number;
  /** The badtide's run (the slow part): false leaves it out (the generator's reading of a map that failed anyway). */
  badtide?: boolean;
  /** The badtide's day as already read on this same start and water (the generator reads it once, on the start's
   *  first build, and its later builds plant only). */
  badtideDay?: number;
}

/** One target as measured: its row id, the value and the limit, whether it holds, a player's line. */
export interface EasyMeasure {
  id: string;
  ok: boolean;
  value: number;
  limit: number;
  message: string;
  where?: { tiles?: [number, number][] };
}

const DROUGHT_DAYS = hazardDays("normal", "drought");

/** The start's middle tile and level, from the map's StartingLocation; null without one. */
export function startOfObjects(objects: readonly MapObject[], heights: ArrayLike<number>, W: number): { x: number; y: number; level: number; orientation: Orientation } | null {
  const s = objects.find((o) => o.template === "StartingLocation");
  if (!s) return null;
  const [x, y] = startMiddleTile(s);
  return { x, y, level: heights[y * W + x], orientation: s.orientation };
}

/** The level dry ground joined to the start at its level within `radius` of (x, y) (4-connected, off the objects
 *  that block walking): the room to build (target 1). `level` is the start's. */
export function easyRoom(h: ArrayLike<number>, W: number, H: number, wet: (i: number) => boolean, blocked: Uint8Array | null, x: number, y: number, level: number, radius: number): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  const r2 = radius * radius;
  const at = y * W + x;
  if (h[at] !== level) return out;
  const q = [at];
  out[at] = 1;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    const cx = c % W;
    const cy = (c - cx) / W;
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if ((nx - x) * (nx - x) + (ny - y) * (ny - y) > r2) continue;
      const n = ny * W + nx;
      if (out[n] || h[n] !== level || wet(n) || blocked?.[n]) continue;
      out[n] = 1;
      q.push(n);
    }
  }
  return out;
}

/** The share of the ground (water left out: a shore is an open side) within `radius` of (x, y) on the map that
 *  `room` holds: how well inside it the start sits. */
export function insideShare(room: Uint8Array, W: number, H: number, x: number, y: number, radius: number, water: (i: number) => boolean = () => false): number {
  let all = 0;
  let on = 0;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || water(yy * W + xx)) continue;
      all++;
      if (room[yy * W + xx]) on++;
    }
  return all ? on / all : 0;
}

/** Dry tiles within `radius` of (x, y) standing more than `levels` from `level`, the banks of water (a tile
 *  beside one, or nearer than two tiles) aside: the cliffs and chasms at the start (target 2). */
export function cliffsNear(h: ArrayLike<number>, W: number, H: number, depth: ArrayLike<number>, x: number, y: number, level: number, radius: number, levels: number): number[] {
  const out: number[] = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (Math.abs(h[i] - level) <= levels) continue;
      let bank = false;
      for (let ey = -2; ey <= 2 && !bank; ey++)
        for (let ex = -2; ex <= 2 && !bank; ex++) {
          const ax = xx + ex;
          const ay = yy + ey;
          if (ax >= 0 && ay >= 0 && ax < W && ay < H && depth[ay * W + ax] > WET) bank = true;
        }
      if (!bank) out.push(i);
    }
  return out;
}

const xy = (i: number, W: number): [number, number] => [i % W, Math.floor(i / W)];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const round = (v: number) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v);

/** Each target of Easy start as the map holds it (`EASY_START`, scaled by `easyTargets`). A map without a start
 *  has none: an empty list. */
export function easyStartMeasures(m: EasyStartInput, t: EasyTargets = easyTargets(m.W, m.H), only: readonly string[] | null = null): EasyMeasure[] {
  const { W, H, heights: h, objects } = m;
  const N = W * H;
  const D = m.water.depth;
  const C = m.water.contamination;
  const st = startOfObjects(objects, h, W);
  if (!st) return [];
  const { x, y, level: L } = st;
  const out: EasyMeasure[] = [];
  const { blocked, links } = walkWorld(objects, W, H);
  const walk = walkDistance(h, W, H, blocked, links, { x, y });
  const reach = new Float64Array(N);
  for (let i = 0; i < N; i++) reach[i] = reachAt(walk, W, H, i);
  const wet = (i: number) => D[i] > WET;

  // 1. room to build, the start well inside it
  const room = easyRoom(h, W, H, wet, blocked, x, y, L, t.roomRadius);
  let roomN = 0;
  for (let i = 0; i < N; i++) roomN += room[i];
  const inside = insideShare(room, W, H, x, y, t.insideRadius, wet);
  out.push({
    id: "start.easy_room",
    ok: roomN >= t.room && inside >= t.insideShare,
    value: roomN,
    limit: t.room,
    message: `${plural(roomN, "tile")} of level ground round the start within ${t.roomRadius} tiles (at least ${t.room}), ${Math.round(100 * inside)}% of its middle ${t.insideRadius} tiles (at least ${Math.round(100 * t.insideShare)}%)`,
  });

  // 2. calm surroundings, and a way out
  const cliffs = cliffsNear(h, W, H, D, x, y, L, t.calmRadius, t.calmLevels);
  let beyond = 0;
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(walk[i]) || wet(i)) continue;
    const dx = (i % W) - x;
    const dy = Math.floor(i / W) - y;
    if (dx * dx + dy * dy > t.roomRadius * t.roomRadius) beyond++;
  }
  out.push({
    id: "start.easy_calm",
    ok: cliffs.length <= t.calmSpare && beyond >= t.out,
    value: cliffs.length,
    limit: t.calmSpare,
    message: cliffs.length > t.calmSpare ? `${plural(cliffs.length, "tile")} within ${t.calmRadius} tiles of the start stand more than ${t.calmLevels} levels from it` : beyond < t.out ? `The start's area leads on to only ${plural(beyond, "tile")} on foot (at least ${t.out})` : `The ground within ${t.calmRadius} tiles of the start stays within ${t.calmLevels} levels of it`,
    ...(cliffs.length ? { where: { tiles: cliffs.slice(0, 50).map((i) => xy(i, W)) } } : {}),
  });

  // 3. water at hand, through a drought and the first badtide
  const kept = droughtStorage(m.model, D, DROUGHT_DAYS);
  const served = startWaterShore(walk, h, W, H, D, C, m.model.emitters, kept, t.water);
  out.push({
    id: "start.easy_water",
    ok: served.distance <= t.water,
    value: round(served.distance),
    limit: t.water,
    message: Number.isFinite(served.distance) ? `Clean water a pump draws ${round(served.distance)} tiles' walk from the start (at most ${t.water})` : `No clean water a pump draws within ${t.water} tiles' walk of the start`,
  });
  // (the start's water: the bodies a pump within the walk draws from now, as the Drought view's line reads it)
  const body0 = components(Uint8Array.from(D, (d) => (d > WATER_BODY ? 1 : 0)), W, H).labels;
  const ours = new Set<number>();
  for (let i = 0; i < N; i++) if (body0[i] >= 0 && tileShoreWalk(walk, h, W, H, i, D[i], C[i] < PUMP_CLEAN) <= t.water) ours.add(body0[i]);
  let afterWalk = Infinity;
  for (let i = 0; i < N; i++) {
    if (body0[i] < 0 || !ours.has(body0[i])) continue;
    const w = tileShoreWalk(walk, h, W, H, i, kept[i], C[i] < PUMP_CLEAN);
    if (w < afterWalk) afterWalk = w;
  }
  out.push({
    id: "start.easy_drought",
    ok: afterWalk <= t.droughtWalk,
    value: round(afterWalk),
    limit: t.droughtWalk,
    message: Number.isFinite(afterWalk) ? `After a ${DROUGHT_DAYS}-day drought a pump ${round(afterWalk)} tiles' walk from the start still draws its water (at most ${t.droughtWalk})` : `A ${DROUGHT_DAYS}-day drought leaves the start no water a pump draws`,
  });
  // badwater sources: none within the distance of the start's middle
  const mid = new Uint8Array(N);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) mid[(y + dy) * W + x + dx] = 1;
  const sd = distanceFrom(mid, W, H);
  let nearestBad = Infinity;
  let badAt = -1;
  for (const e of m.model.emitters) {
    if (!(e.contamination > 0)) continue;
    for (const c of e.cells)
      if (c >= 0 && c < N && sd[c] < nearestBad) {
        nearestBad = sd[c];
        badAt = c;
      }
  }
  out.push({
    id: "start.easy_badwater",
    ok: nearestBad >= t.badwaterSource,
    value: round(nearestBad),
    limit: t.badwaterSource,
    message: Number.isFinite(nearestBad) ? `The nearest badwater source is ${round(nearestBad)} tiles from the start (at least ${t.badwaterSource})` : "No badwater source on the map",
    ...(badAt >= 0 && nearestBad < t.badwaterSource ? { where: { tiles: [xy(badAt, W)] } } : {}),
  });

  // 4. food that lasts a drought, and farmland
  const cd = new Float64Array(N);
  for (let i = 0; i < N; i++) if (kept[i] > 0) cd[i] = C[i];
  const dryMoist = gameSoil(W, H, h, kept, cd, objects).moisture;
  let bushes = 0;
  for (const o of objects) {
    if (o.template !== "BlueberryBush" || o.x < 0 || o.y < 0 || o.x >= W || o.y >= H) continue;
    const lnr = o.components?.LivingNaturalResource as { IsDead?: unknown } | undefined;
    if (lnr && lnr.IsDead === true) continue;
    const i = o.y * W + o.x;
    if (reach[i] > t.bushesWithin) continue;
    if (!(m.moisture[i] > 0) || D[i] > 0 || m.soilContamination[i] > 0 || !(dryMoist[i] > 0)) continue;
    bushes++;
  }
  out.push({
    id: "start.easy_food",
    ok: bushes >= t.bushes,
    value: bushes,
    limit: t.bushes,
    message: `${plural(bushes, "berry bush", "berry bushes")} within ${t.bushesWithin} tiles' walk stay moist through a ${DROUGHT_DAYS}-day drought (at least ${t.bushes})`,
  });
  let farmland = 0;
  for (let i = 0; i < N; i++) if (!wet(i) && reach[i] <= t.farmlandWithin && m.moisture[i] > 0 && !(m.soilContamination[i] > 0) && !blocked[i]) farmland++;
  out.push({
    id: "start.easy_farmland",
    ok: farmland >= t.farmland,
    value: farmland,
    limit: t.farmland,
    message: `${plural(farmland, "tile")} of moist farmland within ${t.farmlandWithin} tiles' walk of the start (at least ${t.farmland})`,
  });

  // 5. wood
  out.push({
    id: "start.easy_wood",
    ok: m.woodNear >= t.wood,
    value: Math.round(m.woodNear),
    limit: t.wood,
    message: `${plural(Math.round(m.woodNear), "log")} of grown trees within 20 tiles' walk of the start (at least ${t.wood})`,
  });

  // 6. metal: a ruin column the colony walks beside
  let ruinWalk = Infinity;
  for (const o of objects) {
    if (!o.template.startsWith("RuinColumnH") || o.x < 0 || o.y < 0 || o.x >= W || o.y >= H) continue;
    const r = reach[o.y * W + o.x];
    if (r < ruinWalk) ruinWalk = r;
  }
  out.push({
    id: "start.easy_metal",
    ok: ruinWalk <= t.ruins,
    value: round(ruinWalk),
    limit: t.ruins,
    message: Number.isFinite(ruinWalk) ? `Ruins ${round(ruinWalk)} tiles' walk from the start (at most ${t.ruins})` : `No ruins within the start's walk (at most ${t.ruins} tiles)`,
  });

  // 7. no hazards near
  const hazards: [number, number][] = [];
  for (const o of objects) {
    if (o.template !== "Thorns" && o.template !== "UnstableCore" && o.template !== "BadtideDrain") continue;
    for (const [tx, ty] of entityTiles(o))
      if (tx >= 0 && ty >= 0 && tx < W && ty < H && sd[ty * W + tx] < t.hazards) {
        hazards.push([tx, ty]);
        break;
      }
  }
  out.push({
    id: "start.easy_hazards",
    ok: hazards.length === 0,
    value: hazards.length,
    limit: 0,
    message: hazards.length ? `${plural(hazards.length, "hazard")} (thorns, an unstable core or a badtide drain) within ${t.hazards} tiles of the start` : `No thorns, unstable core or badtide drain within ${t.hazards} tiles of the start`,
    ...(hazards.length ? { where: { tiles: hazards } } : {}),
  });

  // 8. readable at a glance: the start's water in the game's opening frame
  const frame = openingFrame({ x, y, z: L, orientation: st.orientation }, W, H, { heights: h, zoom: L * 0.1 }).mask;
  const shore = served.tile;
  const seen = shore >= 0 && frame[shore] === 1;
  out.push({
    id: "start.easy_view",
    ok: seen,
    value: seen ? 1 : 0,
    limit: 1,
    message: seen ? "The start's water shows in the game's opening view" : "The start's water is out of the game's opening view",
  });
  // the first badtide, last and only where every other target holds: its run is the slow part, and a map that
  // misses another is planned again anyway
  const asked = only ? out.filter((o) => only.includes(o.id)) : out;
  if (m.badtide !== false && asked.every((o) => o.ok) && (!only || only.includes("start.easy_badtide"))) {
    const day = m.badtideDay ?? firstBadtideDay(m, { x, y }, t);
    out.push({
      id: "start.easy_badtide",
      ok: day === 0,
      value: day,
      limit: 0,
      message: day ? `Day ${day}: the first badtide's badwater reaches the start's water` : "The first badtide's badwater never reaches the start's water",
    });
  }
  return only ? out.filter((o) => only.includes(o.id)) : out;
}

/** The targets the land and its settled water decide, before anything is planted: the generator reads them on the
 *  start's first build and plans again at once when one misses (the badtide's run last). */
export const EASY_LAND = ["start.easy_room", "start.easy_calm", "start.easy_water", "start.easy_drought", "start.easy_badwater", "start.easy_badtide"] as const;

/** The day (1 on) badwater first stands on the start's water a pump within the walk draws, in the first
 *  badtide and the days its water runs on after it (`EASY_START.badtideDays`, `badtideAfter`); 0 when it never
 *  does. Read as the Badtide view's line reads it (`StartWaterDays`), on the game's own badtide run. */
export function firstBadtideDay(m: EasyStartInput, start: { x: number; y: number }, t: EasyTargets): number {
  const { W, H } = m;
  const day0 = { depth: m.water.depth, contamination: m.water.contamination };
  const days = new StartWaterDays("badtide", day0, { W, H, heights: m.heights, objects: m.objects, start, within: t.water });
  if (!days.has) return 0;
  const run = new HazardRun(m.model, { depth: Float64Array.from(m.water.depth), contamination: Float64Array.from(m.water.contamination), stack: m.water.stack ?? null }, "badtide", t.badtideDays);
  try {
    const step = TICKS_PER_DAY / 4;
    for (let d = 1; d <= t.badtideDays + t.badtideAfter; d++) {
      for (let k = 0; k < 4; k++) {
        if (d <= t.badtideDays) run.step(step);
        else run.after(step);
      }
      const w = run.water();
      days.see({ depth: w.depth, contamination: w.contamination });
      if (days.day) return days.day;
    }
  } finally {
    run.dispose();
  }
  return 0;
}
