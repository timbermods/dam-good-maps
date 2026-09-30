// A built map as a native 1.1 .timber (FORMAT.md §8): voxels from the heights, simulation
// singletons pre-filled with the canonical settle (water, soil moisture and contamination, as
// official maps ship), entities, metadata, a 960×540 thumbnail. `pack(build(spec, features))` is
// the one path to file bytes (PLAN §19.7). `emptyWater` writes the same map with no water, for the
// in-game A/B check (PLAN §14.4, §18 B2).

import { entityJson } from "../format/entities";
import { mapMetadata, writeTimber, type TimberFile } from "../format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, settledSimulationSingletons, voxelsFromHeights, type WorldModel } from "../format/world";
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

/** The map's description in the game (map_metadata.json): what it is, its badwater choice (D200),
 *  and, on a map whose land rises above 16, that the game's map editor edits only up to 16 (D172).
 *  Without the built map it says what the settings say. */
export function description(spec: MapSpec, built?: Pick<BuildResult, "heights" | "entities">): string {
  const size = `${spec.size.x}×${spec.size.y}`;
  const kind = spec.theme === "any" ? "A map" : `${THEME_NAMES[spec.theme]}`;
  const out = [`${kind}, ${size}, designed for ${spec.designedFor}. Its land and rivers were shaped by uplift, erosion and flowing water.`];
  // the player's No badwater is recorded, so the map says so wherever it goes (D200)
  if (spec.settings.hazards.badwater === "off") out.push(NO_BADWATER_NOTE);
  else {
    const n = built ? built.entities.filter((e) => e.template === "BadwaterSource").length : 1;
    if (n) out.push(n > 1 ? "Badwater springs up in hollows away from the start." : "Badwater springs up in a hollow away from the start.");
  }
  let top = 0;
  if (built) for (const v of built.heights) if (v > top) top = v;
  if (top > 16) out.push(`The land rises to level ${top}: the game's map editor edits only up to level 16.`);
  out.push(`Made with Dam Good Maps ${GENERATOR_VERSION}, seed ${spec.seed}.`);
  return out.join(" ");
}

export interface PackOptions {
  /** Write no water, moisture or contamination: the game fills the rivers in about a day. */
  emptyWater?: boolean;
  /** Use this thumbnail instead of drawing one (checks that only read its size). */
  thumbnail?: Uint8Array;
}

export function toWorld(spec: MapSpec, built: BuildResult, opts: PackOptions = {}): WorldModel {
  const singletons = opts.emptyWater
    ? emptySimulationSingletons(built.W, built.H, 1)
    : settledSimulationSingletons(built.W, built.H, {
        floor: built.heights,
        depth: built.water,
        contamination: built.contamination,
        moisture: built.moisture,
        soilContamination: built.soilContamination,
        sat: built.settle.sat,
        out: built.settle.out,
      });
  return {
    gameVersion: GAME_VERSION,
    timestamp: TIMESTAMP,
    sizeX: built.W,
    sizeY: built.H,
    layers: LAYERS,
    voxels: voxelsFromHeights(built.heights, built.W, built.H),
    singletons,
    entities: built.entities.map(entityJson),
  };
}

export function toTimberFile(spec: MapSpec, built: BuildResult, opts: PackOptions = {}): TimberFile {
  return {
    metadata: mapMetadata(built.W, built.H, description(spec, built) + (opts.emptyWater ? " This copy starts without water." : "")),
    thumbnail: opts.thumbnail ?? thumbnailJpeg(built.heights, built.W, built.H, built.water),
    versionTxt: GAME_VERSION + "\r\n",
    world: toWorld(spec, built, opts),
    extraFiles: [],
  };
}

export function pack(spec: MapSpec, built: BuildResult, opts: PackOptions = {}): Uint8Array {
  return writeTimber(toTimberFile(spec, built, opts));
}
