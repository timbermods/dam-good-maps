// Real places (ROADMAP "Real places", PLAN §20 D136): maps made from real terrain by the landscape
// survey, offered as content to download or refine. They are never generator input (the product
// principle, D108): nothing under gen/ or features/ reads them.
//
// A place's data (tools/places-convert.ts writes it from the survey's elevation patches) holds its
// terrain, its water sources and its start: the land as it is, no edge walls or rims (D151, D152),
// and sources only where water begins (D171). `buildPlace` turns it into a .timber with the steps
// and code the generator's own maps go through: the sources and start as entities with ids hashed
// from the place, the canonical water settle, soil moisture and contamination on it (build.ts step
// 10), the resources and mine sites the shared baseline plans on that ground (resources/plan.ts,
// D167-D170: the late, cheap stage, so a change there needs no new conversion), the world with its
// settled singletons, metadata and thumbnail (gen/pack.ts), the validator (export profile), and
// writeTimber. It is a pure function of the data, so the file is the same bytes in Node and in every
// browser.

import { gunzipSync, strFromU8 } from "fflate";
import { entityJson, startingLocation, waterSource, type EntitySpec } from "../format/entities";
import { mapMetadata, writeTimber, type TimberFile } from "../format/timber";
import { GAME_VERSION, LAYERS, settledSimulationSingletons, voxelsFromHeights } from "../format/world";
import { entityId } from "../features/ids";
import { TIMESTAMP } from "../gen/pack";
import { hash32 } from "../math/hash";
import { planMapResources, type MapResources } from "../resources/plan";
import { startCentreOf } from "../resources/measure";
import { thumbnailJpeg } from "../render/shade";
import { soilContamination } from "../sim/contamination";
import { moistureBarrier, waterModel, type MapObject } from "../sim/model";
import { moisture } from "../sim/moisture";
import { canonicalSettle, type CanonicalWater } from "../sim/prefill";
import type { WaterModel } from "../sim/water";
import { DIFFICULTY_RULES, defaultSettings } from "../spec/mapspec";
import { validateMap, type Validation } from "../validate/checks";
import type { CheckResult } from "../validate/report";
import { CREDITS_URL, fileNotices } from "./attribution";
import logFloor from "../data/log-floor.json" with { type: "json" };
import { reachAt, walkDistance } from "../analysis/walk";
import { isSapling, treeLogs } from "../analysis/wood";
import { FOOTPRINTS, footprintTiles, slopeHighSide } from "../format/footprints";
import { WALK_BLOCKERS } from "../validate/playability";
import { plantForFloor, type FloorWood } from "./wood";
import type { PlaceView } from "./view";

export const PLACE_FORMAT = 2;

/** The starting-logs floor (Kyler, 2026-09-26, D224, amended by D227): every place has at least
 *  `LOG_FLOOR` logs within `LOG_FLOOR_WALK` tiles' walk of its start, at every difficulty
 *  (src/core/data/log-floor.json, computed from the game's own data for its version: 178 logs
 *  within 40 tiles for 1.1.2.4). A blocking rule for the places until M9a's validators carry it:
 *  tools/places-convert.ts chooses only starts that meet it, and tools/real-places.ts and the places
 *  tests refuse a place that does not. */
export const LOG_FLOOR: number = logFloor.floor;
export const LOG_FLOOR_WALK: number = logFloor.withinWalk;

/** The logs within `within` tiles' walk of the start (the floor's count, D224, D227): every grown
 *  tree, alive or dead, by its species' yield (a sapling's never), over the start requirements'
 *  walk: the map's own ground and its natural slopes, never stairs, round what blocks walking, from
 *  the district center (the validators' `start.wood` counts the same within 20). */
export function startLogs(heights: ArrayLike<number>, W: number, H: number, objects: readonly MapObject[], within = LOG_FLOOR_WALK): number {
  const blocked = new Uint8Array(W * H);
  const links: [number, number][] = [];
  for (const o of objects) {
    if (WALK_BLOCKERS.has(o.template) && FOOTPRINTS[o.template]) for (const [x, y] of footprintTiles(o.template, o)) if (x >= 0 && x < W && y >= 0 && y < H) blocked[y * W + x] = 1;
    if (o.template !== "Slope" || o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) continue;
    const [dx, dy] = slopeHighSide(o.orientation);
    const hx = o.x + dx;
    const hy = o.y + dy;
    if (hx >= 0 && hx < W && hy >= 0 && hy < H) links.push([o.y * W + o.x, hy * W + hx]);
  }
  const start = objects.find((o) => o.template === "StartingLocation");
  if (!start) return 0;
  const walk = walkDistance(heights, W, H, blocked, links, startCentreOf(start));
  let logs = 0;
  for (const o of objects) {
    const each = treeLogs(o.template, o.components);
    if (!each || isSapling(o.components) || o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) continue;
    if (reachAt(walk, W, H, o.y * W + o.x) <= within) logs += each;
  }
  return logs;
}

/** Why a map is below the starting-logs floor, or null. */
export function logFloorProblem(logs: number): string | null {
  return logs >= LOG_FLOOR ? null : `start.log_floor: ${logs} logs within ${LOG_FLOOR_WALK} tiles' walk of the start, under the floor of ${LOG_FLOOR} (D224, D227)`;
}

/** Real places are kept on their own land (Kyler, 2026-09-26, D245): only the absolutes gate a
 *  place. A check blocks when it fails and is not about playability: the file's load checks (it
 *  loads and plays exactly as the editor shows it), the design checks (one floor a tile, the height
 *  limit, sources only where water begins, D171) and the principles (no edge walls, D151); the
 *  starting-logs floor is the other absolute (`logFloorProblem`). Every playability check is
 *  information: a place short of one ships as it is. */
export function placeProblems(checks: readonly CheckResult[]): { blocking: string[]; shortOf: string[] } {
  const failing = checks.filter((c) => !c.ok && !c.advisory && c.applicable !== false && !c.approximate);
  return { blocking: failing.filter((c) => c.class !== "playability").map((c) => c.id), shortOf: failing.filter((c) => c.class === "playability").map((c) => c.id) };
}

/** A place's note (D245): only what would sink a player who goes straight to the game, in a few
 *  plain words. The everyday advisories (drought, reservoir, clean water in a badtide) get none. */
export const PLACE_NOTES: readonly (readonly [string, string])[] = [
  ["start.water", "No water a pump can reach from the start"],
  ["start.wood", "Too little wood near the start"],
  ["water.settles", "The water keeps moving"],
];

/** The notes a place's checks give (see `PLACE_NOTES`), in that order. */
export function placeNotes(checks: readonly CheckResult[]): string[] {
  const short = new Set(placeProblems(checks).shortOf);
  return PLACE_NOTES.filter(([id]) => short.has(id)).map(([, words]) => words);
}

/** One real place as the site stores it (public/real-places/data/<id>.json.gz). */
export interface PlaceData {
  format: 2;
  /** The landscape survey's patch and mapping it is made from (`<location>-<size>-<metres>-<mode>-16`,
   *  investigation/landscapes/), its own name for it, verbatim, and the part of the named place it
   *  sampled ("southwest"), when its name says. The survey row also seeds the place's resources. */
  survey: string;
  surveyName: string;
  sample?: string;
  /** A slug of the name: "grand-canyon". */
  id: string;
  /** "Grand Canyon": the map's title and its file name. */
  name: string;
  /** The place in a sentence, "Inspired by the land near …": "the Grand Canyon". */
  place: string;
  /** The landform family the survey sampled it for, and its name on the page. */
  family: string;
  familyName: string;
  /** One plain line on how it plays. */
  plays: string;
  /** Metres of real land per tile. */
  metres: number;
  /** The place's latitude and longitude, in degrees (the survey's anchor): which providers' notices
   *  the file carries (attribution.ts). */
  lat: number;
  lon: number;
  W: number;
  H: number;
  /** Surface height of every tile, one base-36 digit each, row-major from the south edge. */
  heights: string;
  /** Water sources, [x, y, strength]: only where water begins (D171), a row across a river's
   *  mouth on the map edge or a spring at a valley's head. */
  sources: [number, number, number][];
  /** Badwater sources, [x, y, strength] (D200), when the place has them. */
  badwater?: [number, number, number][];
  /** The start's corner tile (the StartingLocation's coordinates). */
  start: [number, number];
}

/** One place on the gallery page (public/real-places/index.json). */
export interface PlaceIndexEntry {
  id: string;
  name: string;
  /** The landscape survey's own name, verbatim: "Near Grand Canyon Colorado (southwest sample), 60 m per tile". */
  surveyName: string;
  /** The part of the named place the survey sampled ("southwest"), when its name says. */
  sample?: string;
  family: string;
  familyName: string;
  plays: string;
  size: number;
  metres: number;
  /** Paths relative to index.json: the place's data, its card pictures (the 3D overview, and the
   *  map from above), and its .timber (`maps/<id>.timber`, built at deploy time by
   *  tools/places-build.ts). */
  data: string;
  image: string;
  topImage: string;
  /** The direction the overview looks, and the top of both pictures (view.ts). */
  view: PlaceView;
  file: string;
  /** The sha256 of the .timber the card pictures show (tools/places-thumbs.ts renders them again
   *  when the map changes). */
  imageFrom?: string;
  /** What would sink a player who goes straight to the game (`placeNotes`, D245), when anything. */
  notes?: string[];
  /** The groves grown for the starting-logs floor (D229), when any: their trees, and how many of
   *  them stand dead on dry ground (pending #82). */
  floorTrees?: { trees: number; dead: number };
  /** The .timber's size in bytes and its sha256: every build of the place gives this file. */
  bytes: number;
  sha256: string;
}

export interface PlaceIndex {
  format: 1;
  count: number;
  /** Families in the order the page lists them. */
  families: { id: string; name: string }[];
  sizes: number[];
  places: PlaceIndexEntry[];
}

/** A place's data file: gzip JSON (or the JSON itself, when a server has already unpacked it). */
export function decodePlaceFile(bytes: Uint8Array): PlaceData {
  const text = strFromU8(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes);
  const p = JSON.parse(text) as PlaceData;
  if (p.format !== PLACE_FORMAT) throw new Error(`real place format ${String(p.format)} is not ${PLACE_FORMAT}`);
  return p;
}

/** Heights as the data stores them. */
export function encodeHeights(h: ArrayLike<number>): string {
  let s = "";
  for (let i = 0; i < h.length; i++) s += h[i].toString(36);
  return s;
}

export function decodeHeights(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = parseInt(s[i], 36);
  return out;
}

/** The .timber's file name: the game shows it as the map's name. */
export function placeFileName(p: Pick<PlaceData, "name">): string {
  return `${p.name}.timber`;
}

/** The map's in-game description (Kyler, 2026-09-25): its title, that it is not a replica, and a
 *  link to the credits page; then the provider notices whose terms need them in the file itself
 *  (attribution.ts, docs/real-places-credits.md). Plain text: the game's handling of other
 *  characters is not yet checked. */
export function placeDescription(p: PlaceData): string {
  const notices = fileNotices(p.lat, p.lon);
  return [
    p.name,
    `Inspired by the land near ${p.place}, at Timberborn's scale; not a replica.`,
    `Credits: ${CREDITS_URL}`,
    ...(notices.length ? [`Elevation data: ${notices.join("; ")}.`] : []),
  ].join("\n\n");
}

/** The places the quick checks build (tests/contract/places.test.ts, the browser tests): the first
 *  two at 96² and 128², and the first at 256². Every place is checked nightly and before a release. */
export function placeSample(index: Pick<PlaceIndex, "places" | "sizes">): PlaceIndexEntry[] {
  return index.sizes.flatMap((s) => index.places.filter((p) => p.size === s).slice(0, s < 256 ? 2 : 1));
}

/** The place's own objects as entities, in a fixed order: water sources, badwater sources, the
 *  start. Ids are hashed from the place, the template and the tile. */
export function placeEntities(p: PlaceData, heights: Uint8Array): EntitySpec[] {
  const W = p.W;
  const owner = `real-place:${p.id}`;
  const at = (i: number, template: string) => ({ id: entityId(owner, template, i), owner, x: i % W, y: Math.floor(i / W), z: heights[i] });
  const out: EntitySpec[] = [];
  for (const [x, y, strength] of p.sources) out.push(waterSource({ ...at(y * W + x, "WaterSource"), strength }));
  for (const [x, y, strength] of p.badwater ?? []) out.push(waterSource({ ...at(y * W + x, "BadwaterSource"), strength, bad: true }));
  out.push(startingLocation({ ...at(p.start[1] * W + p.start[0], "StartingLocation"), orientation: "Cw0" }));
  return out;
}

function mapObject(e: EntitySpec): MapObject {
  return { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, components: { ...(e.before ?? {}), ...e.components } };
}

export interface BuiltPlace {
  file: TimberFile;
  heights: Uint8Array;
  model: WaterModel;
  settle: CanonicalWater;
  resources: MapResources;
  /** The logs within the starting-logs floor's walk of the start (`startLogs`). */
  logs: number;
  /** The groves grown for the starting-logs floor, when the place fell short of it (D224, D229). */
  floorWood?: FloorWood;
}

/** The place's terrain, its own objects and their water model: what the settle runs on. */
export function placeGround(p: PlaceData): { heights: Uint8Array; entities: EntitySpec[]; objects: MapObject[]; model: WaterModel } {
  if (p.format !== PLACE_FORMAT) throw new Error(`real place format ${String(p.format)} is not ${PLACE_FORMAT}`);
  const { W, H } = p;
  const heights = decodeHeights(p.heights);
  if (heights.length !== W * H) throw new Error(`${p.id}: ${heights.length} heights for ${W}×${H}`);
  const entities = placeEntities(p, heights);
  const objects = entities.map(mapObject);
  return { heights, entities, objects, model: waterModel(W, H, heights, objects) };
}

/** Build the place's map: its terrain and own objects, the canonical settle (or `settled`, the
 *  settle of the same ground and objects, when the caller has it), soil, the resources on that
 *  ground, and the file. Resources and mine sites never move water, so the settle before them is
 *  the settle after. */
export function buildPlace(p: PlaceData, settled?: CanonicalWater): BuiltPlace {
  const { W, H } = p;
  const { heights, entities, objects, model } = placeGround(p);
  const settle = settled ?? canonicalSettle(model);
  const barrier = moistureBarrier(W, H, objects);
  const moist = moisture(heights, settle.depth, settle.contamination, W, H, barrier);
  const soil = soilContamination(heights, settle.depth, settle.contamination, W, H, barrier);
  // the resource baseline, as the generator would give a map of this size designed for Normal
  // (resources/plan.ts): starting wood and berries near the start with the generator's margins;
  // the starting-logs floor (D224, D227) counts farther out, and the planner plants toward it too
  const rules = DIFFICULTY_RULES.normal;
  const start = startCentreOf(objects.find((o) => o.template === "StartingLocation")!);
  const resources = planMapResources({
    W,
    H,
    heights,
    water: settle.depth,
    moisture: moist,
    soilContamination: soil,
    entities,
    start,
    settings: defaultSettings("riverValley", "normal", { x: W, y: H }).resources,
    seed: hash32("real-place", p.survey),
    nearStart: { wood: Math.ceil(1.35 * rules.woodWithin20), bushes: Math.max(rules.berriesTarget, Math.ceil(1.15 * rules.bushesWithin20)) },
    ruinsClear: rules.ruinsWithin + 7,
    owner: `real-place:${p.id}`,
  });
  // the starting-logs floor (D224, D227): a place short of it grows groves that read its own land
  // within the floor's walk (D229, wood.ts), for the logs it lacks and a tenth more
  let logs = startLogs(heights, W, H, [...objects, ...resources.entities.map(mapObject)]);
  let floorWood: FloorWood | null = null;
  if (logs < LOG_FLOOR) {
    floorWood = plantForFloor({
      W,
      H,
      heights,
      water: settle.depth,
      moisture: moist,
      soilContamination: soil,
      entities: [...entities, ...resources.entities],
      start,
      need: Math.ceil((LOG_FLOOR - logs) * 1.1),
      within: LOG_FLOOR_WALK,
      seed: hash32("real-place", p.survey),
      owner: `real-place:${p.id}/floor`,
    });
    logs = startLogs(heights, W, H, [...objects, ...resources.entities.map(mapObject), ...floorWood.entities.map(mapObject)]);
  }
  const file: TimberFile = {
    metadata: mapMetadata(W, H, placeDescription(p)),
    thumbnail: thumbnailJpeg(heights, W, H, settle.depth),
    versionTxt: GAME_VERSION + "\r\n",
    world: {
      gameVersion: GAME_VERSION,
      timestamp: TIMESTAMP,
      sizeX: W,
      sizeY: H,
      layers: LAYERS,
      voxels: voxelsFromHeights(heights, W, H),
      singletons: settledSimulationSingletons(W, H, { floor: heights, depth: settle.depth, contamination: settle.contamination, moisture: moist, soilContamination: soil, sat: settle.sat }),
      entities: [...entities, ...resources.entities, ...(floorWood?.entities ?? [])].map(entityJson),
    },
    extraFiles: [],
  };
  return { file, heights, model, settle, resources, logs, ...(floorWood ? { floorWood } : {}) };
}

/** Validate a built place as the editor validates a file it exports (the export profile), on its
 *  own settled water. */
export function validatePlace(b: BuiltPlace): Validation {
  return validateMap(b.file, { profile: "export", designedFor: "normal", features: [], water: { model: b.model, settled: b.settle } });
}

/** The place's .timber: built, validated and written. Throws when a load check fails (the file
 *  would not load), which the contract test rules out for every place. A principle the place breaks
 *  (the edge walls of the conversions before Real places 2, D151) is in `validation`: the rebuild
 *  must meet it, and the gallery keeps serving the maps it has until then. */
export function placeTimber(p: PlaceData): { bytes: Uint8Array; fileName: string; validation: Validation } {
  const built = buildPlace(p);
  const validation = validatePlace(built);
  const bad = validation.report.checks.filter((c) => !c.ok && !c.advisory && c.applicable !== false && !c.approximate && c.class === "load").map((c) => c.id);
  if (bad.length) throw new Error(`${p.name} did not pass the file checks: ${bad.join(", ")}`);
  return { bytes: writeTimber(built.file), fileName: placeFileName(p), validation };
}
