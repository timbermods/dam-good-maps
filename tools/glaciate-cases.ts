// Glaciate's floor water on the investigation's cases (PLAN §20 D246, D292): each of round 4's 24
// cases (investigation/glaciate/tests/cases.ts: the heroes, the six random heads, the three modest
// ones, Power, Try another, both Aims, the start, the flat and the spring cases), planned by the
// adopted planner (the floor's water finished), settled as the game settles it, and measured as round 4
// measured them (information, never a gate: D292). Prints a table.
//
//   npx tsx tools/glaciate-cases.ts [--only hero-canyon] [--json out.json]
//
// Separate wet passages: the most disjoint wet runs on any section across the floor (goal 1; it counts
// a winding river crossed twice as two). Side passages: the runs that don't touch the main river.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotMap, type FullForceMap } from "../src/core/forces/force";
import { GLACIATE_DEFAULTS } from "../src/core/forces/glaciate/model";
import { measureGlaciate } from "./lib/glaciate";
import { makePlan } from "./lib/glaciate";
import { modelOf } from "../src/core/forces/runs";
import { canonicalSettle } from "../src/core/sim/prefill";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ONLY = arg("only");
const JSON_OUT = arg("json");

// (the investigation's case list reads its fixtures from its own folder)
const root = process.cwd();
process.chdir(join(root, "investigation/glaciate"));
const { cases } = await import("../investigation/glaciate/tests/cases");
const { fixture } = await import("../investigation/glaciate/tests/fixtures");

interface Row {
  id: string;
  wet: number;
  passages: number;
  side: number;
  falls: number;
  joinMax: number;
  reached?: string;
}

const rows: Row[] = [];
for (const c of cases) {
  if (ONLY && c.id !== ONLY) continue;
  const m = fixture(c.map) as unknown as FullForceMap;
  const settings = { ...GLACIATE_DEFAULTS, ...(c.settings ?? {}) };
  const intent = { origin: c.y * m.W + c.x, ...(c.end ? { end: c.end[1] * m.W + c.end[0] } : {}) };
  const one = (): Row => {
    const p = makePlan(snapshotMap(m), settings, intent);
    const w = canonicalSettle({ ...modelOf(p.map), ...(p.retained.tiles.length ? { retained: [p.retained] } : {}) });
    const q = measureGlaciate(p, w);
    const side = Math.max(0, ...q.sections.map((s) => s.runs.filter((r) => !r.some((i) => p.stream[i] === 1)).length));
    if (process.argv.includes("--floods")) {
      let pre = 0, can = 0;
      for (let i = 0; i < w.depth.length; i++) if (p.mask[i] === 1 && !p.stream[i]) { if (p.map.water.depth[i] > 0.001) pre++; if (w.depth[i] > 0.001) can++; }
      console.log(`   ${c.id}: dry-floor water prefill ${pre} settled ${can}`);
    }
    return { id: c.id, wet: q.wetShare, passages: q.passages, side, falls: q.falls.length, joinMax: Math.max(0, ...p.joins.map((j) => j.length)), reached: `${p.finished.style} ${p.finished.reached}/${p.finished.visits} floods ${p.finished.floods}` };
  };
  const r = one();
  rows.push(r);
  const f = (x: Row) => `${(x.wet * 100).toFixed(1).padStart(5)}% ${String(x.passages).padStart(2)} ${String(x.side).padStart(2)} ${String(x.falls).padStart(3)} ${x.joinMax.toFixed(0).padStart(4)}`;
  console.log(`${c.id.padEnd(16)} | ${f(r)} ${r.reached}`);
}
process.chdir(root);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
