// Reproduction for milestone (MCP trial 3): a real place's stored water is not the water its sources keep. Opened, a
// place shows its file's own water (`showsStoredWater`); the first edit anywhere settles the whole map from its water
// model, which is what the file's model settles to with no edit at all. The page's worker opens a place through the
// same core call (core/places/open.ts) and the same session, so the page shows the same drop after an edit.
//
//   npx tsx investigation/mcp-trial/run-3/placeWater.ts near-mount-fuji near-aso-caldera near-glencoe

import { canonicalRun } from "../../../src/core/sim/prefill";
import { worldWaterModel } from "../../../src/core/sim/stackWater";
import { applyOps, shownWater } from "../../../mcp/src/maps";
import { openPlaceSession, placeOf } from "../../../mcp/src/places";

const wetOf = (d: ArrayLike<number>) => {
  let n = 0;
  for (let i = 0; i < d.length; i++) if (d[i] > 0.05) n++;
  return n;
};
for (const id of process.argv.slice(2)) {
  const s = openPlaceSession(placeOf(id)!);
  const opened = wetOf(shownWater(s).depth);
  const run = canonicalRun(worldWaterModel(s.openedFile().world), {});
  let w = run.advance(Infinity);
  while (!w) w = run.advance(Infinity);
  const settled = wetOf(w.depth);
  // a one-tile raise in the far corner (tile 2, H − 1), as the trial's
  const c = applyOps(s, [{ op: "brush", params: { tool: "raise", size: 1, strength: 1, dabs: [10, 4 * (s.size.y - 1) + 2] } }]);
  console.log(`${id} (${s.size.x}²): opened ${opened} wet tiles; its file's water model settled with no edit ${settled}; after a far-corner one-tile raise ${c.water.wetAfter}`);
}
