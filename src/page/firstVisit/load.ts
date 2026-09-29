// Loading a first-visit map on the page (docs/UI-BRIEF.md §7): the index, then one map's project
// file, which the page opens as it opens any project (the worker's `openProject`). Any failure
// returns null and the page generates live, as every later Generate does.

import { GENERATOR_VERSION } from "../../core/spec/mapspec";
import { FIRST_VISIT_DIR, pickFirstVisit, type FirstVisitIndex, type FirstVisitMap } from "../../core/library/firstVisit";

export const FIRST_VISIT_URL = `${import.meta.env.BASE_URL}${FIRST_VISIT_DIR}/`;

export async function loadFirstVisit(random: () => number = Math.random): Promise<{ map: FirstVisitMap; project: Uint8Array } | null> {
  try {
    const r = await fetch(`${FIRST_VISIT_URL}index.json`);
    if (!r.ok) return null;
    const map = pickFirstVisit((await r.json()) as FirstVisitIndex, GENERATOR_VERSION, random);
    if (!map) return null;
    const f = await fetch(`${FIRST_VISIT_URL}${map.file}`);
    if (!f.ok) return null;
    return { map, project: new Uint8Array(await f.arrayBuffer()) };
  } catch {
    return null;
  }
}
