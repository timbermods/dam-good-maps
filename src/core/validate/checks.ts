// Validation (PLAN §11, §19.5). Every check has an id (matching prototype/validate.py), a class and a
// severity; profiles decide what a class does (report.ts). The checks run in Rust (rust/checks, D465;
// their TypeScript is tag `ts-checks-final`), bound by rust.ts: the load class (§11.1–11.2: what the game
// would crash on, silently drop, or break at start), the design class (terrain.max_height,
// terrain.single_floor, water.source_in_flow), the principles terrain.edge_wall and terrain.dam_wall, and
// the playability class (playability.ts's rules) on the map's canonically settled water. A map the checks
// cannot read as the map it claims to be is refused with a one-line reason (D342): `validateMap` throws it.

import type { TimberFile } from "../format/timber";
import type { Feature } from "../features/schema";
import type { Mechanics } from "../analysis/mechanics";
import type { CanonicalWater } from "../sim/prefill";
import type { WaterModel } from "../sim/water";
import type { Difficulty, MapSpec } from "../spec/mapspec";
import type { PlayabilityAnalysis } from "./playability";
import type { Profile, ValidationReport } from "./report";
import { validateInRust } from "./rust";

export type { CheckClass, CheckResult, Profile, Severity, ValidationReport } from "./report";
export { blocks } from "./report";

/** Components whose absence crashes the load (FORMAT.md §5): `entities.components` (rust/checks reads
 *  this table, tools/rust/checks-tables.ts), and what the editor's operations write (doc/ops.ts). */
export const REQUIRED: Record<string, string[]> = {
  WaterSource: ["WaterSource"], BadwaterSource: ["WaterSource"], Aquifer: ["WaterSource"], BadtideDrain: ["WaterSource"],
  WaterSeep: ["WaterSource", "WaterDepthStrengthModifier"], BadwaterSeep: ["WaterSource", "WaterDepthStrengthModifier"],
  UnstableCore: ["UnstableCore"], ReservePile: ["FixedStockpile"], ReserveTank: ["FixedStockpile"], ReserveWarehouse: ["FixedStockpile"],
};
for (let k = 1; k <= 8; k++) REQUIRED[`RuinColumnH${k}`] = ["RuinModels", "Yielder:Ruin"];

/** Width and height from a JPEG's SOF marker (`file.thumbnail` reads a thumbnail's size this way). */
export function jpegSize(b: Uint8Array): [number, number] | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    }
    i += 2 + len;
  }
  return null;
}

export interface ValidateOptions {
  profile: Profile;
  /** External files (imports) accept any 1.1.x version. */
  external?: boolean;
  /** Thresholds come from the spec; imported maps have none and use `designedFor` (default Normal)
   *  with the default settings (PLAN §19.5). */
  spec?: MapSpec | null;
  designedFor?: Difficulty;
  /** The features the map was built from, for the checks about planned lakes and basins. */
  features?: readonly Feature[] | null;
  /** The canonical settle already computed for exactly this terrain and these sources (the build's),
   *  so generation does not settle twice. */
  water?: { model: WaterModel; settled: CanonicalWater };
  /** The map is being edited (a session, D323): an edge wall is a warning with a fix, never a block. */
  editing?: boolean;
  /** The editor's: the mine sites already out of reach when the map was opened (`mineSitesCutAt`);
   *  given, `resources.mine_site` is advisory and also names what edits cut off since (D368 (10)). */
  mineCutAtOpen?: ReadonlySet<number>;
  /** Only the load and design classes (the M1 oracle's --load-only). */
  loadOnly?: boolean;
  /** The map's own water, as its wet tiles: by default the file's; an edited import passes the
   *  water of the map as it was opened (the approximate-water rule compares the settle with it). */
  storedWet?: Uint8Array | null;
}

export interface Validation {
  report: ValidationReport;
  /** What the playability checks measured (null with loadOnly). */
  analysis: PlayabilityAnalysis | null;
  model: WaterModel | null;
  water: CanonicalWater | null;
  /** What a steady state leaves out of this map's water (null with loadOnly). When it gives
   *  reasons, the water and start checks are approximate (PLAN §11, D87). */
  mechanics: Mechanics | null;
}

/** Every check on `file`, and what they measured. Without `water`, the map's water is settled here
 *  (the heightfield water model on the top surface: on maps with caves or overhangs an approximation,
 *  as terrain.single_floor says). Throws the one-line reason of a map the checks refuse. */
export function validateMap(file: TimberFile, opts: ValidateOptions): Validation {
  return validateInRust(file, opts);
}

export function validateFile(file: TimberFile, opts: ValidateOptions): ValidationReport {
  return validateMap(file, opts).report;
}
