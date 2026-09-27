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
import { CREDITS_URL, fileNotices } from "./attribution";
import logFloor from "../data/log-floor.json";
import type { PlaceView } from "./view";

export const PLACE_FORMAT = 2;

/** The starting-logs floor (Kyler, 2026-09-26, D224): every place has at least this many logs
 *  within 20 tiles' walk of its start, at every difficulty, counted as `start.wood` counts (grown
 *  trees by their species' yield, dead ones too; src/core/data/log-floor.json, computed from the
 *  game's own data for its version). A blocking rule for the places until M9a's validators carry
 *  it: tools/places-convert.ts chooses only starts that meet it, and tools/real-places.ts and the
 *  places tests refuse a place that does not. */
export const LOG_FLOOR: number = logFloor.floor;

/** The logs within 20 tiles' walk of a built place's start: `start.wood`'s count. */
export function startLogs(v: Validation): number {
  const c = v.report.checks.find((x) => x.id === "start.wood");
  return typeof c?.value === "number" ? c.value : 0;
}

/** Why a built place is below the starting-logs floor, or null. */
export function logFloorProblem(v: Validation): string | null {
  const logs = startLogs(v);
  return logs >= LOG_FLOOR ? null : `start.log_floor: ${logs} logs within 20 tiles' walk of the start, under the floor of ${LOG_FLOOR} (D224)`;
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
  // (resources/plan.ts): starting wood and berries near the start with the generator's margins,
  // the wood never under the starting-logs floor (D224), at every difficulty
  const rules = DIFFICULTY_RULES.normal;
  const resources = planMapResources({
    W,
    H,
    heights,
    water: settle.depth,
    moisture: moist,
    soilContamination: soil,
    entities,
    start: startCentreOf(objects.find((o) => o.template === "StartingLocation")!),
    settings: defaultSettings("riverValley", "normal", { x: W, y: H }).resources,
    seed: hash32("real-place", p.survey),
    nearStart: { wood: Math.ceil(1.35 * Math.max(rules.woodWithin20, LOG_FLOOR)), bushes: Math.max(rules.berriesTarget, Math.ceil(1.15 * rules.bushesWithin20)) },
    ruinsClear: rules.ruinsWithin + 7,
    owner: `real-place:${p.id}`,
  });
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
      entities: [...entities, ...resources.entities].map(entityJson),
    },
    extraFiles: [],
  };
  return { file, heights, model, settle, resources };
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
