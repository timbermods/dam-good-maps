// Real places (ROADMAP "Real places", PLAN §20 D136): maps made from real terrain by the landscape
// survey, offered as content to download or refine. They are never generator input (the product
// principle, D108): nothing under gen/ or features/ reads them.
//
// A place's data (tools/real-places.ts writes it from the survey's library) holds its heights, water
// sources, start and planted objects. `buildPlace` turns it into a .timber with the steps and code
// the generator's own maps go through: the objects as entities with ids hashed from the place, the
// canonical water settle, soil moisture and contamination on it (build.ts step 10), the world with
// its settled singletons, metadata and thumbnail (gen/pack.ts), the validator (export profile), and
// writeTimber. It is a pure function of the data, so the file is the same bytes in Node and in every
// browser.

import { gunzipSync, strFromU8 } from "fflate";
import { bush, entityJson, ruin, startingLocation, tree, waterSource, type EntitySpec, type TreeSpecies } from "../format/entities";
import { mapMetadata, writeTimber, type TimberFile } from "../format/timber";
import { GAME_VERSION, LAYERS, settledSimulationSingletons, voxelsFromHeights } from "../format/world";
import { entityId } from "../features/ids";
import { namedFile, TIMESTAMP } from "../gen/pack";
import { thumbnailJpeg } from "../render/shade";
import { soilContamination } from "../sim/contamination";
import { moistureBarrier, waterModel, type MapObject } from "../sim/model";
import { moisture } from "../sim/moisture";
import { canonicalSettle, type CanonicalWater } from "../sim/prefill";
import type { WaterModel } from "../sim/water";
import { validateMap, type Validation } from "../validate/checks";
import { CHANGES, ELEVATION_SOURCE, PROVIDER_NOTICES } from "./attribution";

export const PLACE_FORMAT = 1;

/** One real place as the site stores it (public/real-places/data/<id>.json.gz). */
export interface PlaceData {
  format: 1;
  /** A slug of the name: "near-yosemite-valley". */
  id: string;
  /** "Near Yosemite Valley": the map's name and its file name. */
  name: string;
  /** The place it is named after: "Yosemite Valley". */
  place: string;
  /** The landform family the survey sampled it for, and its name on the page. */
  family: string;
  familyName: string;
  /** One plain line on how it plays. */
  plays: string;
  /** Metres of real land per tile. */
  metres: number;
  W: number;
  H: number;
  /** Surface height of every tile, one base-36 digit each, row-major from the south edge. */
  heights: string;
  /** Water sources: [x, y, strength]. */
  sources: [number, number, number][];
  /** The start's corner tile (the StartingLocation's coordinates). */
  start: [number, number];
  /** Tiles of each kind of object, ascending, each as the gap from the previous tile index. */
  bushes: number[];
  pines: number[];
  birches: number[];
  oaks: number[];
  deadPines: number[];
  ruins: number[];
}

/** One place on the gallery page (public/real-places/index.json). */
export interface PlaceIndexEntry {
  id: string;
  name: string;
  family: string;
  familyName: string;
  plays: string;
  size: number;
  metres: number;
  /** Paths relative to index.json: the place's data and its card picture. */
  data: string;
  image: string;
  /** The .timber's size in bytes and its sha256: every build of the place gives this file. */
  bytes: number;
  sha256: string;
  /** The playability checks this place's own map fails, recorded when the tool builds it
   *  (`PLACE_FAULT_CHECKS`): what the gallery reads for a place's card note (D445). */
  faults: string[];
}

/** The checks tools/real-places.ts records per place in `faults`, as the generate profile gives them
 *  on the place's own build. The conversion-wide ones every place has (the edge wall, the missing
 *  mine site and badwater source, D151, D200) are not recorded. */
export const PLACE_FAULT_CHECKS = ["water.source_in_flow", "start.wood", "start.wood_floor", "start.water", "start.food", "plants.survive"] as const;

/** What every place as converted has, and what Real places 2 removes: not a reason to leave one out. */
export const CONVERSION_FAULT_CHECKS = ["terrain.edge_wall", "resources.mine_site", "resources.badwater_source"] as const;

/** The fault whose card note reads `NO_WATER_NOTE` (D445): the place's start reaches no water a source
 *  feeds. The place still shows in the gallery; Real places 2 fixes it, and the next run of the tool
 *  no longer records it. */
export const NO_WATER_FAULT = "start.water";

/** The card note for a place with `NO_WATER_FAULT` (D445). No other fault gets a note. */
export const NO_WATER_NOTE = "No reachable water";

/** The card note a place carries, from its recorded faults, or null. */
export const placeNote = (e: Pick<PlaceIndexEntry, "faults">): string | null => (e.faults.includes(NO_WATER_FAULT) ? NO_WATER_NOTE : null);

/** The index as the gallery page shows it (D445): every place, including those whose start reaches no
 *  fed water, which carry a note (`placeNote`). */
export function galleryIndex(index: PlaceIndex): PlaceIndex {
  return index;
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

/** Ascending tile indices as gaps, and back. */
export function encodeTiles(tiles: readonly number[]): number[] {
  const sorted = [...tiles].sort((a, b) => a - b);
  return sorted.map((t, k) => (k ? t - sorted[k - 1] : t));
}

export function decodeTiles(gaps: readonly number[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (let k = 0; k < gaps.length; k++) {
    t = k ? t + gaps[k] : gaps[k];
    out.push(t);
  }
  return out;
}

/** The .timber's file name: the game shows it as the map's name. */
export function placeFileName(p: Pick<PlaceData, "name">): string {
  return namedFile(p.name);
}

/** The map's in-game description: what it is, that it is not a replica, and its credits. */
export function placeDescription(p: PlaceData): string {
  return [
    `${p.familyName} · ${p.W}×${p.H} · ${p.metres} m per tile. ${p.plays}`,
    `Inspired by the land near ${p.place}, at Timberborn's scale; not a replica.`,
    `Made with Dam Good Maps from public elevation data: ${ELEVATION_SOURCE}. ${CHANGES} The data providers do not endorse this map.`,
    `Elevation data: ${PROVIDER_NOTICES.join("; ")}.`,
  ].join("\n\n");
}

/** The place's objects as entities, in a fixed order: sources, the start, bushes, living trees,
 *  ruins, dead trees. Ids are hashed from the place, the template and the tile. */
export function placeEntities(p: PlaceData, heights: Uint8Array): EntitySpec[] {
  const W = p.W;
  const owner = `real-place:${p.id}`;
  const at = (i: number, template: string) => ({ id: entityId(owner, template, i), owner, x: i % W, y: Math.floor(i / W), z: heights[i] });
  const out: EntitySpec[] = [];
  for (const [x, y, strength] of p.sources) out.push(waterSource({ ...at(y * W + x, "WaterSource"), strength }));
  out.push(startingLocation({ ...at(p.start[1] * W + p.start[0], "StartingLocation"), orientation: "Cw0" }));
  for (const i of decodeTiles(p.bushes)) out.push(bush({ ...at(i, "BlueberryBush"), ripe: true }));
  const trees: [TreeSpecies, number[]][] = [
    ["Pine", p.pines],
    ["Birch", p.birches],
    ["Oak", p.oaks],
  ];
  for (const [species, gaps] of trees) for (const i of decodeTiles(gaps)) out.push(tree({ ...at(i, species), species }));
  for (const i of decodeTiles(p.ruins)) out.push(ruin({ ...at(i, "RuinColumnH2"), height: 2, variant: "A", orientation: "Cw0" }));
  for (const i of decodeTiles(p.deadPines)) out.push(tree({ ...at(i, "DeadPine"), species: "Pine", dead: true }));
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
}

/** Build the place's map: its terrain and objects, the canonical settle, soil, and the file. */
export function buildPlace(p: PlaceData): BuiltPlace {
  if (p.format !== PLACE_FORMAT) throw new Error(`real place format ${String(p.format)} is not ${PLACE_FORMAT}`);
  const { W, H } = p;
  const heights = decodeHeights(p.heights);
  if (heights.length !== W * H) throw new Error(`${p.id}: ${heights.length} heights for ${W}×${H}`);
  const entities = placeEntities(p, heights);
  const objects = entities.map(mapObject);
  const model = waterModel(W, H, heights, objects);
  // (the places were converted under the port's water rules and are settled with them, so the
  // gallery's files stay as they were until Real places 2 converts them under the game's, D311)
  const settle = canonicalSettle(model, { rules: "port" });
  const barrier = moistureBarrier(W, H, objects);
  const moist = moisture(heights, settle.depth, settle.contamination, W, H, barrier);
  const soil = soilContamination(heights, settle.depth, settle.contamination, W, H, barrier);
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
      singletons: settledSimulationSingletons(W, H, { floor: heights, depth: settle.depth, contamination: settle.contamination, moisture: moist, soilContamination: soil, sat: settle.sat, out: settle.out }),
      entities: entities.map(entityJson),
    },
    extraFiles: [],
  };
  return { file, heights, model, settle };
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
