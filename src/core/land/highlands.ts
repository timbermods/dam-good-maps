// Highlands' own shaping (M9b; D273 (2): high, rugged ground with plateaus and valleys among it).
// The shared drainage, rasterizer, settle and checks are unchanged; nothing is stamped (D348, D370).
//
// Height the eye sees (investigation/canyon-highlands-height, after the theme critique): from the
// editor's opening camera, pitched 70° down, a terrace of two or three blocks is a line; the land read
// as one flat slab with River Valley's. So from 128² up the land stands in tall terraces: benches four
// levels apart (three from 192² up) over at least four fifths of the land, the land leaning high (most
// of it on the upper benches, the river's valley the narrow lowest one, at 4, where a pump still reaches
// the river: the start keeps its shore, the 96² round's cause 4).
//
// Below 128² a Highlands map gets the water a 128² map draws (the 96² round). The clean flow
// follows the official density per area while the genome draws a 128² map's heads whatever the
// side, so at 96² up to four heads share 16% less water than at 128²: on half the maps no river
// reaches the hydrology's cutting flow (1.2), none is incised, the water stands at its benches'
// level and the land is not high over it. Full at 96², tapering to nothing at 128².
import { formScale, type Genome } from "./genome";
import { mapShape } from "./shape";
import * as portable from "../math/portable";
import { STAND, standsUp } from "./bold";

/** How far below 128² the map is: 0 at 128² and up, 1 at 96² and under. A long map is as small as a
 *  square map of its area (D488): judged by its narrow side, a 48×256 strip, a 128² map's area, had none
 *  of Canyon's gorge or Highlands' tall benches, and read as River Valley with a fat river. */
export function smallness(W: number, H: number): number {
  const side = mapShape(W, H).long ? portable.sqrt(W * H) : Math.min(W, H);
  return Math.min(1, Math.max(0, (128 - side) / 32));
}

export function shapeHighlands(g: Genome, W: number, H: number): void {
  if (g.theme !== "highlands") return;
  const k = smallness(W, H);
  if (k > 0) g.hydro.flowMul *= 1 + k / 3;
  // tall terraces, the land leaning high: full from 128² up, fading out toward 96² (there the
  // promise's plateau count and cliff share cannot be met with few tall benches: 9–12 of 20 against 16
  // whatever the step; local/exp-size.log), and benches three apart from 192² up (four left too
  // little cliff for the promise's line at 256²: 10 of 20 against 15). The lean stays at 0.65 and the
  // lowest bench at 4: a lean of 0.55 with the bench at 5 left Highlands 2 and 23 bare rock with a
  // thin river (8% and 6% of the land moist against 28%; local/exp-reg.log, Kyler's look at #261)
  const s = 1 - k;
  if (s <= 0) return;
  const side = Math.min(W, H);
  // (uplands round 4: from 256² up, where the landforms stand at the map's scale (`atMapScale`), Highlands is stacked
  // ring terraces: benches two apart, so its rings and its ringed forms' (`rings.ts`) stand behind two-level walls, as
  // half the steps of the game's Terraces, Nomads and Oasis do (its promise's plateaus and cliffs: with one-level rings
  // 88–90% of its steps were one level and no map kept the promise). Five apart quantized the forms into five-level
  // cliffs and left 72% of the land dead flat. Its tops roll, half again its grade's: as level as the tableland's own
  // (calm 1), the broad tableland stood dead flat, 70% of the land, docs/design/uplands.md)
  // (uplands round 6: above 128² Highlands stands up, `bold.ts` `STAND`: its floor gentle, so its mesas stand over it,
  // its grade's roll `STAND.floor.roll` its theme's; benches two apart from 192² up, as at 256². Rolled half again its
  // grade, round 4's floor was the many low plates of 0.10.49)
  const stand = standsUp(g.theme, W, H);
  const ringed = stand || formScale(W, H) >= 2;
  if (s >= 0.5) g.terrace.step = ringed ? 2 : Math.max(g.terrace.step, side > 128 ? 3 : 4);
  if (ringed) g.grade.calm = Math.min(g.grade.calm, 0.5);
  if (ringed) g.grade.roll *= stand ? STAND.floor.roll : 1.5;
  // (and its benches' risers walls, not flanks: the floor's steps two levels where they gather)
  if (stand) g.grade.riser = Math.min(g.grade.riser, STAND.floor.riser);
  if (stand) g.grade.drift = Math.min(g.grade.drift, STAND.floor.drift);
  // (and its main water enters by the upstream edge, so it runs through the valley in its middle; round 6b step 2: it
  // alone, so the green is the valley's)
  if (stand && !g.hydro.exactInflows && !g.hydro.noInflows) g.hydro.inflows = 1;
  // (round 6b: the valley's lake is its bowl's, held by its sill, `bold.ts`; no trough is dug for another, which ate
  // the bench beside it)
  if (stand) g.troughs = 0;
  // (and its rivers come down to the lake's level: cut at most two levels under the ground, the main river no deeper
  // than the others. Entrenched four to seven, as before, the main river reached the bowl under its lake's level, its
  // water backed up the course over its head at the edge, and the land was refused, `courses.ts` `drownedHeads`)
  if (stand) g.hydro.incise = Math.min(g.hydro.incise, STAND.lake.incise);
  if (stand) g.hanging = 0;
  // (round 6b step 2: green a pocket in dry land, the lake's rim and the river's, as the game's bold maps: few side
  // branches, `STAND.springs` at the most, and no spring drawn to carry the water's reach over the land (D504's reach
  // springs, `hydro.ts`): the rest of the floor is the player's to water)
  if (stand) g.hydro.springs = Math.min(g.hydro.springs, STAND.springs);
  if (stand) g.hydro.reachSprings = false;
  g.terrace.share = Math.max(g.terrace.share, stand ? 1 : 0.8 * s);
  g.hyps.lean = Math.min(g.hyps.lean, 1 - 0.35 * s);
  // (the lowest bench no lower than 4: a base drawn under it left the valley floor at 3, on the beds'
  // floor; the winning variant had it, local/exp-reg.log)
  g.base = Math.max(g.base, 4);
  g.relief = g.top - g.base;
}
