// The start's water is never a sealed puddle (PLAN §11.4 `start.water`; Kyler's D302, amending D153).
// The DGM Probe found Canyon 128² seed 1 counting a sealed one-tile hole as the start's water, and a
// count over M9a's batches found starts whose only water within the rule's walk was such water (a
// few one-tile holes, small sealed ponds, an unfed pond a drought empties). Water counts when its body
// (4-connected, over 0.001 deep) is fed by a running source or lasts the rule's drought (9 days at
// Normal, 30 at Hard) with water a pump reaches still within the walk. The Python validator
// (prototype/analysis.py `start_water_shore`) gives the same answers.

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { pumpShoreDistance, startWaterShore, walkDistance } from "../../src/core/analysis/walk";
import { droughtStorage } from "../../src/core/sim/drought";
import { waterModel } from "../../src/core/sim/model";

/** Python with numpy, for the oracle's side (CI has it; a machine without it skips). */
const PY = (() => {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
})();

// Ground at level 3; the start at (5, 12); water in hollows cut into the ground, its surface below the
// shore's ground, so a pump on the shore reaches it. The walk limit is Normal's 20 tiles.
const W = 40;
const H = 24;
const START = { x: 5, y: 12 };
interface Hollow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  level: number;
  depth: number;
}
interface Case {
  name: string;
  hollows: Hollow[];
  emitters: { cells: number[]; strength: number }[];
  days: number;
  /** The walk to the water that counts (Infinity: none), and to a puddle nearer than it. */
  want: { distance: number; puddle: number };
}
const hole: Hollow = { x0: 10, y0: 12, x1: 10, y1: 12, level: 2, depth: 0.9 };
const pond: Hollow = { x0: 10, y0: 6, x1: 21, y1: 17, level: 2, depth: 0.7 };
const lake: Hollow = { x0: 10, y0: 6, x1: 21, y1: 17, level: 1, depth: 1.9 };
const shallowLake: Hollow = { ...lake, depth: 1.2 };
const river: Hollow = { x0: 25, y0: 0, x1: 27, y1: 23, level: 2, depth: 0.6 };
const CASES: Case[] = [
  // refused: water no source feeds that the drought empties
  { name: "a sealed one-tile hole", hollows: [hole], emitters: [], days: 9, want: { distance: Infinity, puddle: 3 } },
  { name: "a small sealed pond (3×3, 0.6 deep)", hollows: [{ x0: 10, y0: 11, x1: 12, y1: 13, level: 2, depth: 0.6 }], emitters: [], days: 9, want: { distance: Infinity, puddle: 3 } },
  { name: "a big unfed pond a Normal drought takes under 0.3 (12×12, 0.7 deep)", hollows: [pond], emitters: [], days: 9, want: { distance: Infinity, puddle: 3 } },
  { name: "a lake that lasts a Normal drought but not Hard's 30 days", hollows: [shallowLake], emitters: [], days: 30, want: { distance: Infinity, puddle: 3 } },
  // accepted: fed water, and a lake that lasts the drought
  { name: "the same one-tile hole fed by a source", hollows: [hole], emitters: [{ cells: [12 * W + 10], strength: 0.5 }], days: 9, want: { distance: 3, puddle: Infinity } },
  { name: "a lake that lasts a Normal drought (12×12, 1.9 deep)", hollows: [lake], emitters: [], days: 9, want: { distance: 3, puddle: Infinity } },
  { name: "the shallower lake at Normal (1.2 deep, 0.7 left)", hollows: [shallowLake], emitters: [], days: 9, want: { distance: 3, puddle: Infinity } },
  // a puddle nearer than fed water: the fed water counts, farther away
  { name: "a sealed hole beside the start and a fed river farther off", hollows: [hole, river], emitters: [{ cells: [26], strength: 2 }], days: 9, want: { distance: 18, puddle: 3 } },
];

function mapOf(c: Case) {
  const h = new Uint8Array(W * H).fill(3);
  const D = new Float64Array(W * H);
  for (const b of c.hollows)
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        h[y * W + x] = b.level;
        D[y * W + x] = b.depth;
      }
  const C = new Float64Array(W * H);
  const walk = walkDistance(h, W, H, null, [], START);
  const after = droughtStorage(waterModel(W, H, h, []), D, c.days);
  return { h, D, C, walk, after };
}

describe("the start's water is fed or lasts the drought, never a sealed puddle (D302)", () => {
  it.each(CASES)("$name", (c) => {
    const m = mapOf(c);
    const r = startWaterShore(m.walk, m.h, W, H, m.D, m.C, c.emitters, m.after, 20);
    expect({ distance: r.distance, puddle: r.puddle }).toEqual(c.want);
    // the rule before D302 counted every one of them
    expect(pumpShoreDistance(m.walk, m.h, W, H, m.D, m.C).distance).toBe(3);
  });

  it.skipIf(!PY)("the Python validator gives the same answers (prototype/analysis.py start_water_shore)", () => {
    const input = JSON.stringify(
      CASES.map((c) => {
        const m = mapOf(c);
        return { W, H, h: Array.from(m.h), D: Array.from(m.D), walk: Array.from(m.walk, (v) => (Number.isFinite(v) ? v : 1e9)), emitters: c.emitters, days: c.days };
      }),
    );
    const script = [
      "import json, sys",
      "sys.path.insert(0, 'prototype')",
      "import numpy as np",
      "from analysis import start_water_shore",
      "from watersim import drought_storage",
      "out = []",
      "for m in json.load(sys.stdin):",
      "    shape = (m['H'], m['W'])",
      "    h = np.array(m['h'], float).reshape(shape)",
      "    D = np.array(m['D'], float).reshape(shape)",
      "    walk = np.array(m['walk'], float).reshape(shape)",
      "    walk[walk > 1e8] = np.inf",
      "    srcs = [{'tiles': [divmod(i, m['W']) for i in e['cells']], 'strength': e['strength'], 'contamination': 0.0} for e in m['emitters']]",
      "    after = drought_storage(h.copy(), D, m['days'], srcs, None)",
      "    d, p, t = start_water_shore(walk, h, D, np.zeros(shape), srcs, after, 20)",
      "    out.append({'distance': None if d == float('inf') else d, 'puddle': None if p == float('inf') else p})",
      "print(json.dumps(out))",
    ].join("\n");
    const r = spawnSync(PY!, ["-B", "-c", script], { input, encoding: "utf8", maxBuffer: 64 << 20 });
    expect(r.status, r.stderr).toBe(0);
    const py = JSON.parse(r.stdout) as { distance: number | null; puddle: number | null }[];
    expect(py.map((p) => ({ distance: p.distance ?? Infinity, puddle: p.puddle ?? Infinity }))).toEqual(CASES.map((c) => c.want));
  });
});
