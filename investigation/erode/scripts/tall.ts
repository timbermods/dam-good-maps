// A tall map's land (heights above 16): the design version 2 prototype at Verticality 85, unlocked,
// the land as planned before the build (generative/v2/unlocked.ts; the product's build still clips
// at 16 until M9a lifts it, D172). The same steps as glaciate's tall fixture.
import { cleanPitsAndSpikes, fillDryHollows, mergeSmallRegions } from "../../generative/proto/levels";
import { fieldV2 } from "../../generative/v2/field";
import { drawGenomeV2 } from "../../generative/v2/genome";
import { planHydro } from "../../generative/v2/hydro";
import { naturalRamps, relaxEdges, snapLevelsV2 } from "../../generative/v2/levels";

export function tallLand(seed: number, theme: "highlands" | "canyon" = "highlands", W = 128): { heights: Uint8Array; channel: Uint8Array } {
  const g = drawGenomeV2(theme, seed, W, W, 0, { vt: 85, unlocked: true });
  const F = fieldV2(g, seed, W, W);
  const h = snapLevelsV2(F.E, g, seed, W, W);
  relaxEdges(h, W, W);
  const hy = planHydro(F.E, h, g, seed, W, W, 0);
  relaxEdges(h, W, W);
  const keep = Uint8Array.from(hy.water, (v) => (v === 1 || v === 2 ? 1 : 0));
  mergeSmallRegions(h, W, W, 4, keep);
  cleanPitsAndSpikes(h, W, W, keep);
  fillDryHollows(h, W, W, keep);
  naturalRamps(h, W, W, keep, new Uint8Array(W * W), g, seed, 0);
  return { heights: h, channel: keep };
}
