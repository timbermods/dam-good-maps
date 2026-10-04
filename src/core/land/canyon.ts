// Canyon's own shaping (M9b; D273 (2): a river cut deep between cliffs for a real stretch). The
// shared drainage, rasterizer, settle and checks are unchanged; nothing is stamped (D348, D370).
//
// A gorge the eye sees (investigation/canyon-highlands-height, after the theme critique): from 128²
// up the land is a plateau standing 8 or more over the map's floor (6 at 256², the land leaning
// high), and the big rivers cut 7 or more below the ground beside them, down to the beds' floor (3,
// item 47), so the main river runs between walls of five to ten blocks for most of its course instead
// of the two or three the old land left it (the bed never goes under the floor, so on land at 4 the
// walls were one level whatever the incision). At 96² the plateau fades out: it left no start.
// The water gathers in few rivers: at most two springs beside the inflow (four at 256²), so the
// main river carries the cutting flow (1.2) on every map; a small lake (a basin where the genome
// drew none, no lake over 4% of the map), since the start's shore is the plateau's lake, not the
// gorge (the 96² round's cause 4); and the floor beside the channel kept within 3, so the walls
// stand close.
//
// Below 128² the incision is a level deeper (the 96² round: a short course needs a bigger share of
// it between walls), and the height round fades out: at 96² the map is the 96² round's.
import type { Genome } from "./genome";
import { randomPart } from "./genome";
import { stream } from "../math/rng";
import { smallness } from "./highlands";
import * as portable from "../math/portable";

export function shapeCanyon(g: Genome, W: number, H: number, seed: number, attempt: number): void {
  if (g.theme !== "canyon") return;
  const k = smallness(W, H);
  const side = Math.min(W, H);
  const areaK = (W * H) / (128 * 128);
  // the 96² round: few springs, the incision a level deeper on a small map
  g.hydro.springs = Math.min(g.hydro.springs, Math.round(2 * Math.max(1, portable.sqrt(areaK))));
  g.hydro.incise += k;
  // the height round, from 128² up (fading out toward 96², where a plateau left no start on most
  // lands and maps failing an absolute, cause 4; local/exp-size.log): the plateau 8 at 128², 6 from
  // 256² up with the land leaning high (8 lost water-readability on a fifth of the maps there)
  const s = 1 - k;
  if (s <= 0) return;
  const big = Math.min(1, Math.max(0, (side - 128) / 128));
  g.hydro.incise = Math.max(g.hydro.incise, 7);
  g.hydro.floor = Math.min(g.hydro.floor, 3);
  g.base = Math.max(g.base, 4 + 4 * s - 2 * big);
  if (big > 0) g.hyps.lean = Math.min(g.hyps.lean, 1.3 - 0.6 * big);
  g.relief = g.top - g.base;
  // the plateau's lake, the start's shore, is a tarn: a basin where the genome drew none, and no lake
  // over 4% of the map (the budget's 20% drowned the upper half of Canyon 27's gorge; local/exp-reg.log,
  // Kyler's look at #261). The spring lake keeps the genome's own chance.
  if (!g.parts.some((p) => p.kind === "basin")) g.parts.push(randomPart(stream(seed, "canyon-lake", attempt), "basin", W, H, g.variety, 1 + (0.6 * g.vt) / 100));
  g.hydro.lakeBudget = Math.min(g.hydro.lakeBudget, 0.04);
}
