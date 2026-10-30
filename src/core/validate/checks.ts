// Validation (PLAN §11, §19.5). Every check has an id (matching prototype/validate.py), a class and a
// severity; profiles decide what a class does (report.ts). The checks run in Rust (rust/checks, D465;
// their TypeScript is tag `ts-checks-final`), bound by rust.ts: the load class (§11.1–11.2: what the game
// would crash on, silently drop, or break at start), the design class (terrain.max_height,
// water.source_in_flow; terrain.single_floor on an imported map only), the principles terrain.edge_wall and
// terrain.dam_wall, and the playability class (playability.ts's rules) on the map's canonically settled
// water, with the two rows read off the floor graph (D122) and the air: walk.levels (information) and
// water.sealed_source (a warning). A check's class can depend on the map's kind: `slopes.connect` blocks on a
// generated map and only warns on an imported one (D482). A map the checks
// cannot read as the map it claims to be is refused with a one-line reason (D342): `validateMap` throws it.

import type { TimberFile } from "../format/timber";
import type { Feature } from "../features/schema";
import type { Mechanics } from "../analysis/mechanics";
import type { CanonicalWater } from "../sim/prefill";
import type { WaterModel } from "../sim/water";
import type { Difficulty, MapSpec } from "../spec/mapspec";
import type { PlayabilityAnalysis } from "./playability";
import type { CheckResult, Profile, ValidationReport } from "./report";
import { blocks, severityOf } from "./report";
import { validateInRust } from "./rust";
import { easyShortfall, easyStartMeasures, easyTargets } from "../analysis/easyStart";
import { surfaceOf } from "../format/world";
import { mapObjects } from "../sim/model";
import { seenThroughRoofs } from "../sim/stackWater";

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
   *  with the default settings (PLAN §19.5), and the theme a map made with Dam Good Maps names in its
   *  description (`generatedThemeOf`: Islands' water cap, D369). */
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
  /** What the build's support pass removed, in blocks of ground (D121; `BuildResult.dropped`):
   *  given for a generated map (the generator's checks and `MapSession.validate` pass it),
   *  `terrain.dropped` reports it, and a generated map must have none. */
  dropped?: number;
  /** Only the load and design classes (the M1 oracle's --load-only). */
  loadOnly?: boolean;
  /** The map's own water, as its wet tiles: by default the file's; an edited import passes the
   *  water of the map as it was opened (the approximate-water rule compares the settle with it). */
  storedWet?: Uint8Array | null;
  /** Easy start's rows (D495) on a generated map whose spec asks for it: `relax` scales its targets (1 as they
   *  are; a late rescue round's less, D471), and at 0 they are advisory; `badtide: false` leaves out the first
   *  badtide's run. */
  easyStart?: { relax: number; badtide?: boolean; badtideDay?: number };
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
  /** Easy start (D495), on a map a late rescue round checked against eased targets: what it left short of the full
   *  ones, one line for the page (`easyShortfall`); absent when every full target holds. */
  easyShort?: string;
}

/** Every check on `file`, and what they measured. Without `water`, the map's water is settled here
 *  (the heightfield water model on the top surface: on maps with caves or overhangs an approximation,
 *  as terrain.single_floor says). Throws the one-line reason of a map the checks refuse. */
export function validateMap(file: TimberFile, opts: ValidateOptions): Validation {
  const v = validateInRust(file, opts);
  // (not on a map made with Sources: None, D330: its water is the player's to place)
  if (opts.profile !== "generate" || opts.spec?.settings?.start?.easyStart !== true || opts.spec.settings.water.sources === "none" || !v.analysis || !v.model || !v.water) return v;
  return withEasyStart(file, opts, v);
}

/** Easy start's rows (D495, `analysis/easyStart.ts`) after the Rust checks' on a generated map whose spec asks
 *  for it: each target a playability row that blocks the map, so the generator plans again. They run in
 *  TypeScript on the checks' own water and soil (their analysis); only the generate profile reads them: what
 *  the generator guarantees, never a nag once the player edits the start. */
function withEasyStart(file: TimberFile, opts: ValidateOptions, v: Validation): Validation {
  const w = file.world;
  const W = w.sizeX;
  const H = w.sizeY;
  const relax = opts.easyStart?.relax ?? 1;
  const settled = v.water!;
  const water = settled.stack?.stacked ? { ...seenThroughRoofs(settled.stack), stack: settled.stack } : settled;
  const input = { W, H, heights: surfaceOf(w), objects: mapObjects(w), water, model: v.model!, moisture: v.analysis!.moisture, soilContamination: v.analysis!.soilContamination, woodNear: v.analysis!.woodNear, badtide: opts.easyStart?.badtide, badtideDay: opts.easyStart?.badtideDay };
  const measures = easyStartMeasures(input, easyTargets(W, H, relax > 0 ? relax : 0.8));
  const advisory = relax <= 0;
  const rows: CheckResult[] = measures.map((m) => ({
    id: m.id,
    class: "playability",
    severity: severityOf(opts.profile, "playability", m.ok, advisory),
    ok: m.ok,
    value: m.value,
    limit: m.limit,
    message: m.message,
    ...(advisory ? { advisory: true } : {}),
    ...(m.where ? { where: m.where } : {}),
  }));
  const passed = v.report.passed && !rows.some((r) => blocks(opts.profile, r));
  // (on a map that passes a late rescue round's eased targets: what it leaves short of the full ones, for the page
  // to say, the badtide's day as its own row read it)
  let easyShort: string | null = null;
  if (relax < 1 && passed) {
    const full = easyStartMeasures({ ...input, badtide: false }, easyTargets(W, H));
    const badtide = measures.find((m) => m.id === "start.easy_badtide");
    easyShort = easyShortfall(badtide ? [...full, badtide] : full);
  }
  return { ...v, report: { ...v.report, checks: [...v.report.checks, ...rows], passed }, ...(easyShort ? { easyShort } : {}) };
}

export function validateFile(file: TimberFile, opts: ValidateOptions): ValidationReport {
  return validateMap(file, opts).report;
}
