import { BED_FLOOR, type Genome } from "./genome";
import { EDITOR_LEVEL, VT_TALL, THEME_PRESETS, type Settings } from "../spec/mapspec";

/** Apply after the base raise. The control owns the available span, not a pre-floor top. */
export function verticalityRange(g: Genome, s: Settings): void {
  const v = s.terrain.verticality / 100;
  const ceiling = Math.min(s.terrain.highestTerrain, s.terrain.verticality >= VT_TALL ? 22 : EDITOR_LEVEL);
  g.vt = s.terrain.verticality;
  g.tall = ceiling > EDITOR_LEVEL;
  const low = Math.max(BED_FLOOR + 1, g.base);
  g.base = low;
  const reliefScale = (50 + s.terrain.relief) / (50 + THEME_PRESETS[g.theme].relief);
  g.top = Math.min(ceiling, low + (3 + v * (ceiling - low - 3)) * reliefScale);
  g.relief = g.top - g.base;
  g.terrace.step = 1 + Math.round(2 * v);
  g.terrace.share *= 0.1 + 0.9 * v;
  g.hydro.incise *= v;
  g.hanging *= v;
  g.knick *= v;
  g.ramps = Math.max(g.ramps, 1 - 0.25 * v);
}
