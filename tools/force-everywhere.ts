// Every force, everywhere (PLAN §20 D356): the full sweep of tests/contract/forceEverywhere.ts. Every
// theme at 128² and 256², each force used at random places and on each kind of ground (flat, water, a
// peak, a slope, the map's edge, beside the start) at low, mid and high Power, headless and on fixed
// seeds. Prints how often each use had a visible effect, and every use that did nothing or refused.
//
// Usage: npx tsx tools/force-everywhere.ts [--sizes 128,256] [--random 4] [--seed 5]

import { THEMES } from "../src/core/spec/mapspec";
import { describe, invisible, sweep, VISIBLE_TILES, type Outcome } from "../tests/contract/forceEverywhere";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SIZES = (arg("sizes") ?? "128,256").split(",").map(Number);
const RANDOM = Number(arg("random") ?? 4);
const SEED = Number(arg("seed") ?? 5);

const all: Outcome[] = [];
for (const size of SIZES)
  for (const theme of THEMES.filter((t) => t !== "any")) {
    const t0 = performance.now();
    const o = await sweep(theme, size, SEED, RANDOM);
    all.push(...o);
    console.error(`${theme} ${size}²: ${o.length} uses, ${invisible(o).length} with nothing visible (${Math.round((performance.now() - t0) / 1000)} s)`);
  }
const rows = new Map<string, { uses: number; visible: number }>();
for (const o of all) {
  const k = `${o.use} | ${o.place.ground} | Power ${o.power}`;
  const r = rows.get(k) ?? { uses: 0, visible: 0 };
  r.uses++;
  if (o.changed >= VISIBLE_TILES) r.visible++;
  rows.set(k, r);
}
console.log(`\nVisible: at least ${VISIBLE_TILES} tiles changed by a level or more. ${all.length} uses, ${invisible(all).length} with nothing visible.\n`);
for (const [k, r] of [...rows].sort()) if (r.visible < r.uses) console.log(`${k}: ${r.visible}/${r.uses} visible`);
console.log("\nEvery use with nothing visible:");
for (const o of invisible(all)) console.log(describe(o));
