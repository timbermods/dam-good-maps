// The great form on a generated map (D493's list of landmarks in the colony's view; land/greatForm.ts wears it): on
// Canyon and Any above 128², after the other forms, the tall cliff the opening view looks at is worn deep at its foot.
// The forms stage's machinery keeps it (gen/generate.ts): built and checked again, kept only where every check,
// intention and outcome the map had still holds and its roof reads as a shelter, else dropped and recorded (D138).

import type { BuildResult } from "../features/build";
import { entityTiles } from "../features/edits";
import type { Feature, StartFeature } from "../features/schema";
import { MAP_TREES } from "../format/entities";
import type { FormPlan } from "../land/forms3d";
import { wearGreat } from "../land/greatForm";
import { openingPicture } from "../analysis/picture";
import { roofDepths, shelters } from "../analysis/seeThrough";
import type { Rng } from "../math/rng";
import type { MapSpec } from "../spec/mapspec";
import { unsupportedVoxels } from "../terrain/support";
import { PLANT_CLEARANCE } from "../terrain/clearance";
import { plainMask } from "../terrain/runs";

/** The great form's seen opening, at least: px² of an 800 × 450 frame of the opening camera pulled back (the forms
 *  measure of 2026-11-20 on #236: no form of forms3d's rules reached it on 84 maps at 256²). */
export const GREAT_SEEN = 400;

/** Whether a map looks for the great form: Canyon and Any above 128² (planning's limit of 2026-11-21: Highlands waits
 *  for its own variety round), at any Verticality but 0. */
export function greatFormOn(spec: MapSpec): boolean {
  return (spec.theme === "canyon" || spec.theme === "any") && Math.min(spec.size.x, spec.size.y) > 128 && spec.settings.terrain.verticality > 0;
}

/** The great form worn on a built map whose terrain is `mask` (the other forms in it), or why none: the plan as the
 *  forms stage records it, and the terrain with it. */
export function growGreatOn(built: BuildResult, features: readonly Feature[], mask: Uint32Array, rng: Rng): { plan: FormPlan; mask: Uint32Array } | string {
  const { W, H } = built;
  const N = W * H;
  const st = built.start;
  const sf = features.find((f): f is StartFeature => f.kind === "start");
  if (!st || !sf) return "no start";
  // (nothing worn under an object, by the start, or within a tile of another form; a plant rides on the roof, as on
  // the forms', gen/forms3d.ts `growOn`: worn below, it stays, and a tree's crown hides what stands behind it)
  const off = new Uint8Array(N);
  const trees = new Uint8Array(N);
  const TREES = new Set<string>(MAP_TREES);
  for (const e of built.entities) {
    const plant = e.template in PLANT_CLEARANCE || e.template.startsWith("RuinColumn");
    if (!plant) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) off[y * W + x] = 1;
    if (TREES.has(e.template) && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H) trees[e.y * W + e.x] = 1;
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i] === plainMask(built.heights[i])) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) off[(y + dy) * W + x + dx] = 1;
    }
  for (let y = Math.max(0, st.y - 4); y <= Math.min(H - 1, st.y + 4); y++) for (let x = Math.max(0, st.x - 4); x <= Math.min(W - 1, st.x + 4); x++) off[y * W + x] = 1;
  const start = { x: st.x, y: st.y, z: st.z, orientation: sf.params.orientation };
  const got = wearGreat(
    { W, H, heights: built.heights, water: built.water, mask, off, trees, start },
    rng,
    (m) => unsupportedVoxels({ W, H, mask: m }),
    (m, tiles) => shelters(roofDepths(m, W, H, tiles)),
  );
  if (typeof got === "string") return got;
  const next = mask.slice();
  for (const [i, m] of got.change) next[i] = m;
  // (kept only where it reads as a landmark from the opening camera pulled back: its seen opening, the rays the
  // opening picture casts that meet rock still beneath its roof, at least `GREAT_SEEN` of an 800 × 450 frame; cast at
  // a quarter of the pixels, each counting four)
  const pic = openingPicture({ W, H, heights: built.heights, mask: next, water: built.water, contamination: built.contamination, stack: built.settle.stack ?? null, moisture: built.moisture, entities: built.entities }, start, { w: 400, h: 225 });
  const near = new Uint8Array(N);
  for (const i of got.tiles) {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) near[(y + dy) * W + x + dx] = 1;
  }
  let seen = 0;
  for (let p = 0; p < pic.under.length; p++) if (pic.under[p] === 1 && pic.tile[p] >= 0 && near[pic.tile[p]]) seen += 4;
  if (seen < GREAT_SEEN) return `${got.note}; its mouth shows ${seen} px² of the opening view pulled back, under ${GREAT_SEEN}`;
  return { plan: { id: "great-overhang", at: got.at, from: st.y * W + st.x, tiles: got.tiles, length: got.length, note: `${got.note}, ${seen} px² of it seen at zoom 6` }, mask: next };
}
