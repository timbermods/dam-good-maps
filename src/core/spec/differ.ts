// Whether the settings panel's spec differs from the shown map's (docs/UI-BRIEF.md §5, PLAN §20 D330):
// Generate shows a small dot when it does. A plain question over two specs (D342 (3)).

import { encodeSpecFragment, type MapSpec } from "./mapspec";

/** A spec's settings as the share link writes them, without what makes a sibling of the same
 *  settings (its variation and the intentions it keeps, M9b) or how the generator accepted it: the
 *  settings panel makes neither, so a sibling shown from the candidates strip has the panel's
 *  settings. */
export function settingsKey(spec: MapSpec): string {
  const s = { ...spec } as MapSpec & { variation?: number; intentions?: string[] };
  delete s.variation;
  delete s.intentions;
  delete s.accepted;
  return encodeSpecFragment(s);
}

/** Whether Generate shows its dot: the panel's settings differ from the shown map's. Only a
 *  generated map has settings to differ from; with a real place, an imported map or nothing shown,
 *  there is no dot. */
export function settingsDiffer(shown: MapSpec | null, panel: MapSpec): boolean {
  return shown !== null && settingsKey(shown) !== settingsKey(panel);
}
