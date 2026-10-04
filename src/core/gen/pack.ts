// A built map as a native 1.1 .timber (FORMAT.md §8): voxels from the heights, simulation
// singletons pre-filled with the canonical settle (water, soil moisture and contamination, as
// official maps ship), entities, metadata, a 960×540 thumbnail. `worldOf` is the one path to a
// file's world (PLAN §19.7): a generated map (`pack(build(spec, features))`, `toTimberFile`), a real
// place (places/place.ts `buildPlace`) and an opened map's export (doc/session.ts `exportFile`) all
// write theirs through it, and `timberFileOf` wraps a new map's world in its file. `emptyWater`
// writes the same map with no water, for the in-game A/B check (PLAN §14.4, §18 B2).

import { entityJson, type EntitySpec } from "../format/entities";
import type { JsonObject } from "../format/json";
import { mapMetadata, writeTimber, type TimberFile } from "../format/timber";
import { EDITOR_MAX_HEIGHT, emptySimulationSingletons, GAME_VERSION, generatedTallSentence, LAYERS, mixedSimulationSingletons, settledSimulationSingletons, voxelsFromHeights, type SettledState, type WorldModel } from "../format/world";
import { thumbnailJpeg } from "../render/shade";
import { NO_BADWATER_NOTE } from "../resources/badwater";
import type { BuildResult } from "../features/build";
import { GENERATOR_VERSION, THEME_NAMES, type MapSpec } from "../spec/mapspec";

/** Written into world.json; never read by the game (FORMAT.md §4.1). Fixed so files reproduce. */
export const TIMESTAMP = "2026-01-01 00:00:00";

/** The map's name in the game's map list: its theme's, or "Dam Good Map" for Any. */
export function mapName(spec: MapSpec): string {
  return spec.theme === "any" ? "Dam Good Map" : THEME_NAMES[spec.theme];
}

/** A word made safe for a file name: lowercase letters and digits, single dashes between (D345, B10). */
export function fileSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The name a saved map gets (D345, B10): `dgm-<theme>-<seed>.timber`, the theme the map has (Any for a
 *  Surprise me map) and the seed as typed when it is a word (made file-safe), else its number. */
export function fileName(spec: MapSpec, seedWord?: string): string {
  const word = seedWord ? fileSlug(seedWord) : "";
  return `dgm-${fileSlug(THEME_NAMES[spec.theme])}-${word || spec.seed}.timber`;
}

/** The name a saved map gets when it is not a generated one (a real place, an opened file): `dgm-` and
 *  its name made file-safe, unless it starts with `dgm-` already (D345, B10). */
export function namedFile(name: string): string {
  const slug = fileSlug(name) || "map";
  return `${slug.startsWith("dgm-") ? slug : `dgm-${slug}`}.timber`;
}

/** A map made with Sources: None (D330): its description says where its water went. */
export const NO_SOURCES_NOTE = "No water sources: its valleys and basins are dry, for you to place the sources.";

/** The map's description in the game (map_metadata.json): what it is, its badwater choice (D200),
 *  and, on a map whose land rises above 16, that the game's map editor edits only up to 16 (D172).
 *  Without the built map it says what the settings say. */
export function description(spec: MapSpec, built?: Pick<BuildResult, "heights" | "entities">): string {
  const size = `${spec.size.x}×${spec.size.y}`;
  const kind = spec.theme === "any" ? "A map" : `${THEME_NAMES[spec.theme]}`;
  const out = [`${kind}, ${size}, designed for ${spec.designedFor}. Its land and rivers were shaped by uplift, erosion and flowing water.`];
  // the player's No badwater is recorded, so the map says so wherever it goes (D200); a map made
  // with Sources: None says its water is the player's to place (D330)
  if (spec.settings.water.sources === "none") out.push(NO_SOURCES_NOTE);
  else if (spec.settings.hazards.badwater === "off") out.push(NO_BADWATER_NOTE);
  else {
    const n = built ? built.entities.filter((e) => e.template === "BadwaterSource").length : 1;
    if (n) out.push(n > 1 ? "Badwater springs up in hollows away from the start." : "Badwater springs up in a hollow away from the start.");
  }
  let top = 0;
  if (built) for (const v of built.heights) if (v > top) top = v;
  if (top > EDITOR_MAX_HEIGHT) out.push(generatedTallSentence(top));
  out.push(`Made with Dam Good Maps ${GENERATOR_VERSION}, seed ${spec.seed}.`);
  return out.join(" ");
}

export interface PackOptions {
  /** Write no water, moisture or contamination: the game fills the rivers in about a day. */
  emptyWater?: boolean;
  /** Use this thumbnail instead of drawing one (checks that only read its size). */
  thumbnail?: Uint8Array;
}

/** The settled water and soil a file stores, all from one settle: its depth, badwater share and
 *  cluster saturation, the soil moisture and contamination on that water, and its outflows. The
 *  outflows must be given (`undefined` only where the settle kept none): a file without them makes
 *  the game rebuild the flow from rest. */
export type FileWater = SettledState & { out: ArrayLike<number> | undefined };

/** A build's settled water and soil, as its file stores them. */
export function builtWater(built: BuildResult): FileWater {
  return {
    floor: built.heights,
    depth: built.water,
    contamination: built.contamination,
    moisture: built.moisture,
    soilContamination: built.soilContamination,
    sat: built.settle.sat,
    out: built.settle.out,
  };
}

/** An opened map's file, which an export rewrites (doc/session.ts): its world as opened, its voxels
 *  with the edited ground, and the tiles under roofs (caves, tunnels, overhangs), where the
 *  heightfield's water cannot go and the file's own stays. */
export interface OpenedWorld {
  world: WorldModel;
  voxels: Uint8Array;
  roofed?: ReadonlySet<number> | null;
}

/** The singletons an opened file's export rewrites with the settled water: every other singleton
 *  stays as the file has it. */
const WATER_SINGLETONS = ["WaterEvaporationMap", "WaterSimulationMigrator", "WaterMapNew", "SoilMoistureSimulator", "SoilContaminationSimulator"];

/** The one path to a file's world (PLAN §19.7): a heightfield map's ground, its objects, and its
 *  settled water and soil (`water`, from one settle: `FileWater`).
 *  - A new map (generated, a real place) is written whole: the game version, the fixed timestamp,
 *    voxels from the heights, the settled singletons (none written when `water` is null: the game
 *    fills the rivers itself) and the entities.
 *  - An opened map (`opened`) keeps everything it holds but its ground, its objects and, unless
 *    `water` is null, its water and soil: the heightfield's settled water everywhere, the file's own
 *    under roofs (world.ts `mixedSimulationSingletons`); with `water` null its own water stays. */
export function worldOf(W: number, H: number, heights: Uint8Array, entities: readonly EntitySpec[], water: FileWater | null, opened?: OpenedWorld): WorldModel {
  if (opened) {
    const w = opened.world;
    let singletons = w.singletons;
    if (water) {
      const roofed = opened.roofed?.size ? opened.roofed : null;
      const s = roofed ? mixedSimulationSingletons(w.singletons, W, H, water, roofed) : settledSimulationSingletons(W, H, water);
      const out: JsonObject = {};
      for (const k in w.singletons) out[k] = WATER_SINGLETONS.includes(k) ? s[k] : w.singletons[k];
      for (const k of WATER_SINGLETONS) if (!(k in out)) out[k] = s[k];
      singletons = out;
    }
    return { ...w, voxels: opened.voxels, singletons, entities: entities.map(entityJson) };
  }
  return {
    gameVersion: GAME_VERSION,
    timestamp: TIMESTAMP,
    sizeX: W,
    sizeY: H,
    layers: LAYERS,
    voxels: voxelsFromHeights(heights, W, H),
    singletons: water ? settledSimulationSingletons(W, H, water) : emptySimulationSingletons(W, H, 1),
    entities: entities.map(entityJson),
  };
}

/** A new map's file around its world (`worldOf`): its metadata with `description`, and its thumbnail
 *  of the ground and `water` (or the one given). */
export function timberFileOf(world: WorldModel, heights: Uint8Array, description: string, water: ArrayLike<number> | null, thumbnail?: Uint8Array): TimberFile {
  const { sizeX: W, sizeY: H } = world;
  return {
    metadata: mapMetadata(W, H, description),
    thumbnail: thumbnail ?? thumbnailJpeg(heights, W, H, water),
    versionTxt: GAME_VERSION + "\r\n",
    world,
    extraFiles: [],
  };
}

export function toWorld(spec: MapSpec, built: BuildResult, opts: PackOptions = {}): WorldModel {
  return worldOf(built.W, built.H, built.heights, built.entities, opts.emptyWater ? null : builtWater(built));
}

export function toTimberFile(spec: MapSpec, built: BuildResult, opts: PackOptions = {}): TimberFile {
  return timberFileOf(toWorld(spec, built, opts), built.heights, description(spec, built) + (opts.emptyWater ? " This copy starts without water." : ""), built.water, opts.thumbnail);
}

export function pack(spec: MapSpec, built: BuildResult, opts: PackOptions = {}): Uint8Array {
  return writeTimber(toTimberFile(spec, built, opts));
}
