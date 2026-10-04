// The forces' own cost (PLAN §20 D321, item 29): for each force's largest case (Power 100, its largest
// size) at 128² and 256², the worker's time from the gesture to the final land, run back to back with
// no pacing (the least time Fast can take), its steps, its slowest step, and the keep. Information for
// the Fast pace, never a failure.
//
// Usage: npx tsx tools/bench-forces.ts [--sizes 128,256] [--theme highlands] [--seed 3]

import { DEFAULTS as CARVE_DEFAULTS } from "../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../src/core/forces/craterize";
import { ERUPT_DEFAULTS, ERUPT_SIZE_MAX } from "../src/core/forces/erupt";
import { GLACIATE_DEFAULTS, GLACIATE_SIZE_MAX } from "../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../src/core/forces/quake";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { MapSession } from "../src/core/doc/session";
import { decodeProject } from "../src/core/doc/document";
import { cos, hypot, sin } from "../src/core/math/portable";
import { runGenerate } from "../src/worker/api";
import * as ed from "../src/worker/session";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SIZES = (arg("sizes") ?? "128,256").split(",").map(Number);
const THEME = (arg("theme") ?? "highlands") as ThemeId;
const SEED = Number(arg("seed") ?? 3);

interface Row {
  size: number;
  force: string;
  steps: number;
  startMs: number;
  runMs: number;
  slowestStepMs: number;
  keepMs: number;
  totalMs: number;
}

function time(req: ed.ForceRequest, label: string, size: number): Row | null {
  const t0 = performance.now();
  const r = ed.forceStart(req);
  const t1 = performance.now();
  if (!r.ok) {
    console.log(`${size} ${label}: refused (${r.errors[0]})`);
    return null;
  }
  let steps = 0;
  let slowest = 0;
  for (;;) {
    const a = performance.now();
    const f = ed.forceAdvance(1);
    slowest = Math.max(slowest, performance.now() - a);
    steps++;
    if (!f || f.done || steps > 5000) break;
  }
  const t2 = performance.now();
  ed.forceStop();
  const t3 = performance.now();
  ed.undo();
  const round = (v: number) => Math.round(v);
  return { size, force: label, steps, startMs: round(t1 - t0), runMs: round(t2 - t1), slowestStepMs: round(slowest), keepMs: round(t3 - t2), totalMs: round(t3 - t0) };
}

const rows: Row[] = [];
for (const W of SIZES) {
  await runGenerate(makeSpec({ seed: SEED, theme: THEME, size: { x: W, y: W } }));
  ed.refine();
  const s = MapSession.open(decodeProject(ed.project().bytes));
  const st = s.built.start!;
  // the highest dry ground away from the start
  let at: [number, number] = [Math.floor(W / 4), Math.floor(W / 4)];
  let best = -1;
  for (let y = 8; y < W - 8; y += 2)
    for (let x = 8; x < W - 8; x += 2) {
      if (hypot(x - st.x, y - st.y) < W / 5 || s.built.water[y * W + x] > 0) continue;
      if (s.built.heights[y * W + x] > best) {
        best = s.built.heights[y * W + x];
        at = [x, y];
      }
    }
  const mid: [number, number] = [Math.floor(W / 2), Math.floor(W / 2)];
  const far: [number, number] = [W - 1 - at[0], W - 1 - at[1]];
  const cases: [string, ed.ForceRequest][] = [
    ["carve", { verb: "carve", settings: { ...CARVE_DEFAULTS, power: 100, width: 24 }, origin: at, cut: null }],
    ["carve aimed", { verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", power: 100, width: 24 }, origin: at, end: far, cut: null }],
    ["craterize", { verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 100, size: 180 }, origin: mid, cut: null }],
    ["erupt", { verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 100, size: ERUPT_SIZE_MAX, flows: "heavy" }, origin: mid, cut: null }],
    // (a fissure's breadth is its drawn shape's, D344 A6: a long line at the largest Size, and a small loop)
    ["erupt fissure", { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "fissure", power: 100, size: ERUPT_SIZE_MAX, flows: "heavy" }, origin: [4, Math.round(W * 0.3)], path: [{ x: 4, y: W * 0.3 }, { x: W - 5, y: W * 0.7 }], cut: null, natural: true }],
    ["erupt fissure, small loop", { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "fissure", power: 100, size: ERUPT_SIZE_MAX, flows: "heavy" }, origin: [mid[0] + 5, mid[1]], path: Array.from({ length: 25 }, (_, k) => ({ x: mid[0] + 5 * cos((k / 24) * Math.PI * 2), y: mid[1] + 5 * sin((k / 24) * Math.PI * 2) })), cut: null, natural: true }],
    ["quake lift", { verb: "quake", settings: { ...QUAKE_DEFAULTS, power: 100 }, path: [{ x: 4, y: W * 0.3 }, { x: W - 5, y: W * 0.7 }], side: 1, cut: null }],
    ["quake slide", { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 100 }, path: [{ x: 4, y: W * 0.3 }, { x: W - 5, y: W * 0.7 }], side: 1, cut: null }],
    ["glaciate", { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power: 100, size: GLACIATE_SIZE_MAX }, origin: at, cut: null }],
  ];
  for (const [label, req] of cases) {
    const row = time(req, label, W);
    if (row) rows.push(row);
  }
}
console.table(rows);
