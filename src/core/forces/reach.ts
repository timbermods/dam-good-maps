// How big a force is at its Power and Size (PLAN §20 D312): the radius of the faint ring the editor
// draws round the cursor, like a brush's ring. It shows how big, never what shape (D258): no
// predicted route, footprint or outline. Craterize: the crater's radius; Erupt: the volcano's (half
// its breadth); Carve: half its width (where it goes depends on the land). Quake has none: how far it
// reaches is its own decision, never drawn in advance (D368 (2)); the editor shows a small marker.

import { naturalWidth } from "./carve/character";
import type { CarveSettings } from "./carve/run";
import { naturalSize as craterSize, type CraterSettings } from "./craterize";
import { ERUPT_SIZE_MAX, ERUPT_SIZE_MIN, naturalBreadth, type EruptSettings } from "./erupt";

export type ReachOf =
  | { verb: "carve"; settings: Pick<CarveSettings, "power" | "width"> }
  | { verb: "craterize"; settings: Pick<CraterSettings, "power" | "size"> }
  | { verb: "erupt"; settings: EruptSettings };

/** The radius (tiles) of a force's size at its Power and Size. */
export function forceReach(f: ReachOf): number {
  switch (f.verb) {
    case "carve":
      return (f.settings.width ?? naturalWidth(f.settings.power)) / 2;
    case "craterize":
      return (f.settings.size ?? craterSize(f.settings.power)) / 2;
    case "erupt": {
      const s = f.settings;
      const breadth = s.size ?? Math.max(ERUPT_SIZE_MIN, Math.min(ERUPT_SIZE_MAX, Math.round(naturalBreadth(s) / 2) * 2));
      return breadth / 2;
    }
  }
}
