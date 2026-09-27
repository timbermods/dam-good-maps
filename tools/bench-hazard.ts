// How long the editor's Drought and Badtide buttons take to show the worst day (PLAN §20 D267 (9)):
// the editor's worker code (worker/session.ts `showHazard`), run in Node on generated maps, from the
// click to the last day's water in hand. The browser's worker runs the same code.
//
//   npx tsx tools/bench-hazard.ts [size=256] [seeds=3] [theme=riverValley]

import { performance } from "node:perf_hooks";
import { runGenerate } from "../src/worker/api";
import { makeSpec } from "../src/core/spec/mapspec";
import * as ed from "../src/worker/session";

const size = Number(process.argv[2] ?? 256);
const seeds = Number(process.argv[3] ?? 3);
const theme = process.argv[4] ?? "riverValley";

// (the worker's yields are unref'd message ports: keep Node's loop alive between them)
const alive = setInterval(() => undefined, 1000);
const rows: string[] = [];
for (let seed = 1; seed <= seeds; seed++) {
  await runGenerate(makeSpec({ seed, size: { x: size, y: size }, theme } as Parameters<typeof makeSpec>[0]));
  ed.setEditorWaterMode("defer");
  ed.refine();
  const water = ed.sessionView().view.water.count;
  for (const [hazard, days] of [["drought", 9], ["badtide", 8]] as const) {
    const t0 = performance.now();
    const r = await ed.showHazard(hazard, days);
    const ms = performance.now() - t0;
    rows.push(`${size}² ${theme} seed ${seed}: ${hazard} ${days} days in ${(ms / 1000).toFixed(1)} s (${water} tiles of water; marker: ${r?.marker?.words ?? r?.note ?? "none"})`);
    console.log(rows.at(-1));
    ed.endHazard();
  }
}
clearInterval(alive);
