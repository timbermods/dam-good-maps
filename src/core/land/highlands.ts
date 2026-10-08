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
import type { Genome } from "./genome";

/** How far below 128² the map is: 0 at 128² and up, 1 at 96² and under. */
export function smallness(W: number, H: number): number {
  const side = Math.min(W, H);
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
  if (s >= 0.5) g.terrace.step = Math.max(g.terrace.step, side > 128 ? 3 : 4);
  g.terrace.share = Math.max(g.terrace.share, 0.8 * s);
  g.hyps.lean = Math.min(g.hyps.lean, 1 - 0.35 * s);
  // (the lowest bench no lower than 4: a base drawn under it left the valley floor at 3, on the beds'
  // floor; the winning variant had it, local/exp-reg.log)
  g.base = Math.max(g.base, 4);
  g.relief = g.top - g.base;
}
