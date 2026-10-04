// The automatic water fix (PLAN §20 D330, the UI brief §5): the first map is editable as soon as its
// land exists and the water fills in live; when a check that needs settled water fails a moment
// later (the player's edits moved the river off the start, say), the generator side fixes it by
// itself, never by replacing the map under the player's hands. This is that fix, callable on any map
// as edited: it returns the operations to apply as one step (a spring by the start), or null when
// nothing needs fixing or no spring can fix it. "The page is the editor" applies them.
//
// What it fixes: the start's water checks that a spring can make true (`start.water`: clean water a
// pump reaches on foot; `start.food` and `start.farmland`: moist land and living berries by the start),
// and only when none of the checks it leaves alone gets worse. The spring is a row of sources by the
// rule for sources placed automatically (water/sourceGroups.ts, D314), in the lowest ground near the
// start that the colony walks to (a dry riverbed first, else a hollow; water/springSites.ts, the
// candidate rule the generator's spring by the start shares), tried in turn on a copy of the map and
// settled, the first that works kept.

import { reachAt, walkDistance, walkWorld } from "../analysis/walk";
import { hash32 } from "../math/hash";
import { failing, type CheckResult } from "../validate/report";
import { placeSourceGroup } from "../water/sourceGroups";
import { springCandidates } from "../water/springSites";
import { decodeProject } from "./document";
import type { EditOp } from "./ops";
import { MapSession } from "./session";

/** The checks a spring by the start can make pass. */
export const SPRING_FIXES = ["start.water", "start.food", "start.farmland"] as const;
/** The most places tried (each one settles a copy of the map). */
export const FIX_TRIES = 6;
/** The spring's strength, blocks a second shared by its row (the official maps' springs run 0.5–2). */
export const FIX_STRENGTH = [1.5, 3];

export interface WaterFix {
  ops: EditOp[];
  label: string;
  /** The checks it makes pass. */
  fixes: string[];
  /** Where the spring stands (its anchor). */
  at: [number, number];
}

/** The checks that fail and matter (advisory ones are information: a drought's berries may dry out). */
const failingIds = (checks: readonly CheckResult[]) => new Set(checks.filter(failing).map((c) => c.id));

/** The fix for the map as edited, or null (see the file's header). `s` is left as it was. */
export function waterFix(s: MapSession, opts: { tries?: number } = {}): WaterFix | null {
  const before = failingIds(s.validate("export").report.checks);
  const wanted = SPRING_FIXES.filter((id) => before.has(id));
  if (!wanted.length) return null;
  const b = s.built;
  const { W, H } = b;
  if (!b.start) return null;
  // the colony's walk from the start, over the map's own ground and slopes
  const { blocked, links } = walkWorld(b.entities, W, H);
  const walk = walkDistance(b.heights, W, H, blocked, links, b.start);
  const rule = s.effectiveSpec()?.settings.start.rules.waterWithin ?? 20;
  // candidate places (water/springSites.ts, the generator's rule too): within the rule's walk, off
  // the start's 5×5, in a riverbed or a hollow; the lowest and nearest first
  const picks = springCandidates({ W, H, heights: b.heights, water: b.water, occupied: b.occupied, channel: b.channel, start: b.start }, rule, opts.tries ?? FIX_TRIES, (i) => reachAt(walk, W, H, i));
  const doc = s.project();
  for (const i of picks)
    for (const strength of FIX_STRENGTH) {
      const x = i % W;
      const y = (i - x) / W;
      const g = placeSourceGroup({ kind: "water", x, y, strength, seed: hash32(b.seed, "water-fix", i) }, { W, H, heights: b.heights, occupied: b.occupied, depth: b.water });
      if (g.refused || !g.sources.length) continue;
      const ops: EditOp[] = g.sources.map((src, k) => ({
        op: "placeEntity",
        params: { id: fixId(b.seed, i, k), template: "WaterSource", x: src.x, y: src.y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: src.strength, CurrentStrength: src.strength } } },
      }));
      const trial = MapSession.open(decodeProject(doc));
      if (trial.applyAll(ops, "user", "Add a spring by the start").errors.length) continue;
      trial.settleCanonical();
      const after = failingIds(trial.validate("export").report.checks);
      const fixed = wanted.filter((id) => !after.has(id));
      // (it makes the start's water pass, and makes nothing else fail)
      if (!fixed.includes("start.water") && wanted.includes("start.water")) continue;
      if (!fixed.length || [...after].some((id) => !before.has(id))) continue;
      return { ops, label: "Add a spring by the start", fixes: fixed, at: [x, y] };
    }
  return null;
}

/** A stable id for the fix's sources (UUID-shaped, as the editor's entity ids are). */
function fixId(seed: number, tile: number, k: number): string {
  const h = (n: number) => (hash32(seed, "water-fix-id", tile, k, n) >>> 0).toString(16).padStart(8, "0");
  const a = h(0);
  const b = h(1);
  const c = h(2);
  const d = h(3);
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-8${c.slice(1, 4)}-${c.slice(4, 8)}${d}`;
}
