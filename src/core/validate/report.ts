// The validation report (PLAN §11.6, §19.5): every check yields {id, class, severity, ok, value,
// limit, message, where?, fix?}. `where` names the tiles, feature or entities involved; `fix` is a
// list of edit operations the editor offers as a one-click fix (EDITOR_PLAN §6), in the envelope
// the operations engine takes (core/doc/ops.ts), applied as one step with `MapSession.applyAll`. The
// checks that fill it run in Rust (rust/checks/src/report.rs writes it, with these rules).

import type { EditOp } from "../doc/ops";

/** `principle`: a principle Kyler has decided about how a map is built (D115 (2)), such as no edge
 *  walls (D151): it blocks the download in `generate` and the export in `export`, and is
 *  information on an import. */
export type CheckClass = "load" | "playability" | "design" | "principle";
export type Severity = "error" | "warning" | "info";
export type Profile = "generate" | "export" | "import";

/** One edit operation proposed as a fix, with a plain-language label for its button. */
export type FixOp = EditOp & { label: string };

export interface CheckResult {
  id: string;
  class: CheckClass;
  severity: Severity;
  ok: boolean;
  value?: number | string;
  limit?: number | string;
  message: string;
  /** Tiles ([x, y]), a feature or entities involved. */
  where?: { tiles?: [number, number][]; feature?: string; entities?: string[] };
  fix?: FixOp[];
  /** Advisory checks are reported in every profile and never block: plants.drought; from M8 the
   *  start targets and water.reservoir (D85); since D152 water.clean_exists and
   *  water.clean_reach (maps need not hold their water). */
  advisory?: boolean;
  /** Why the result is only approximate (PLAN §11, D87): the map's water is something a steady
   *  state cannot show (caves, sources that turn on later, aquifers, seeps, a start under a roof).
   *  An approximate check is reported, passes, and says why, with what it measured. */
  approximate?: string;
  /** False when the check does not apply to this map (no such feature, no start, ...): it is
   *  reported, passes, and says why. */
  applicable?: boolean;
}

export interface ValidationReport {
  profile: Profile;
  checks: CheckResult[];
  passed: boolean;
}

/** Severity of a result in a profile (PLAN §19.5): load problems are errors everywhere;
 *  playability and design problems must pass in `generate`, warn in `export`, and are reported in
 *  `import` (design as information); a principle must pass in `generate` and `export` and is
 *  information on an import. Advisory checks warn. */
export function severityOf(profile: Profile, cls: CheckClass, ok: boolean, advisory = false): Severity {
  if (ok) return "info";
  if (advisory) return "warning";
  if (cls === "load") return "error";
  if (profile === "generate") return "error";
  if (profile === "export") return cls === "principle" ? "error" : "warning";
  return cls === "design" || cls === "principle" ? "info" : "warning";
}

/** Whether a check fails: it does not pass, applies to the map and is not advisory (an approximate
 *  check passes, `Collector.approximate`). Whether that blocks depends on the profile (`blocks`). */
export function failing(r: CheckResult): boolean {
  return !r.ok && !r.advisory && r.applicable !== false;
}

/** Whether a result blocks the profile's action: the download in `generate`, the export in
 *  `export` (load problems and principles). Nothing blocks an import: the importer reports, and
 *  fixes what the game would. */
export function blocks(profile: Profile, r: CheckResult): boolean {
  if (!failing(r)) return false;
  if (profile === "generate") return true;
  if (profile === "export") return r.class === "load" || r.class === "principle";
  return false;
}

/** The map card's groups (PLAN §11.6). */
export type CheckGroup = "File" | "Terrain and objects" | "Water" | "Start and resources";

export function groupOf(id: string): CheckGroup {
  if (id.startsWith("file.")) return "File";
  if (id.startsWith("water.")) return "Water";
  if (id.startsWith("terrain.") || id.startsWith("entities.") || id.startsWith("slopes.") || id === "start.clear") return "Terrain and objects";
  return "Start and resources";
}
