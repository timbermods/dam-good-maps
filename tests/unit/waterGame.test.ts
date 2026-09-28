// The game's water rules (PLAN §20 D293, D303, D308, D311): the TypeScript and prototype/watersim.py
// agree bit for bit under them too, on the golden fixtures' terrains and on small grids that hold
// the rules' corners (floor-0 map edges with their spill threshold, partial obstacles on floors
// above and below their neighbours, a seep switching, badwater switching, droughts). Python with
// numpy is needed (CI installs it; a machine without it skips).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { WaterSim, type Emitter } from "../../src/core/sim/water";

function python(): string | null {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
}
const PY = python();
if (!PY && process.env.CI) throw new Error("CI needs Python with numpy for the water rules' parity");

const GRIDS: [number, number][] = [[1, 1], [1, 9], [9, 1], [2, 2], [3, 7], [13, 11], [24, 20]];

// the same runs in Python, printed as JSON (its floats round-trip every bit of a double)
const SCRIPT = String.raw`
import gzip, json, sys
import numpy as np
sys.path.insert(0, "prototype")
from watersim import WaterSim, canonical_settle
out = {"grids": {}, "fixtures": {}}
for (W, H) in ${JSON.stringify(GRIDS)}:
    N = W * H
    floor = np.array([(i * 13 + 7) % 5 for i in range(N)], float).reshape(H, W)
    dam = np.array([0.65 if i % 7 == 0 else -1 for i in range(N)], float).reshape(H, W)
    depth = np.array([0 if i % 3 == 0 else 0.01 + (i % 9) / 3 for i in range(N)], float).reshape(H, W)
    cont = np.array([(i % 4) / 3 for i in range(N)], float).reshape(H, W)
    yx = lambda i: (i // W, i % W)
    srcs = [
        {"tiles": [yx(0)], "strength": 2, "contamination": 0, "depth_limit": (yx(0), 0.8, 0.72)},
        {"tiles": [yx(N - 1)], "strength": 1, "contamination": 1},
        {"tiles": [yx(W - 1), yx(N - W)], "strength": 0.5, "contamination": 0.5},
    ]
    sim = WaterSim(floor, srcs, dam=dam, depth=depth, contamination=cont, rules="game")
    for t in range(256):
        sim.sources[1]["contamination"] = 1 if t < 128 else 0
        sim.run(1, 1 if t < 64 else 0 if t < 128 else 0.35 if t < 192 else 1)
    out["grids"][f"{W}x{H}"] = {"D": sim.D.ravel().tolist(), "C": sim.C.ravel().tolist()}
fixtures = json.loads(gzip.decompress(open("tests/golden/water.json.gz", "rb").read()))["fixtures"]
for f in fixtures:
    W, H = f["W"], f["H"]
    floor = np.array(f["floor"], float).reshape(H, W)
    dam = None if f["dam"] is None else np.array(f["dam"], float).reshape(H, W)
    srcs = [{"tiles": [(c // W, c % W) for c in e["cells"]], "strength": e["strength"], "contamination": e["contamination"],
             **({"depth_limit": ((e["depthLimit"]["anchor"] // W, e["depthLimit"]["anchor"] % W), e["depthLimit"]["off"], e["depthLimit"]["on"])} if e.get("depthLimit") else {})}
            for e in f["emitters"]]
    sim = WaterSim(floor, srcs, dam=dam, rules="game")
    sim.run(975)
    csim, settled = canonical_settle(floor, srcs, dam, rules="game")
    out["fixtures"][f["name"]] = {"D": sim.D.ravel().tolist(), "canonical": csim.D.ravel().tolist(), "ticks": csim.ticks}
print(json.dumps(out))
`;

describe.skipIf(!PY)("the game's water rules: TypeScript and prototype/watersim.py bit for bit (D293)", () => {
  const r = PY ? spawnSync(PY, ["-c", SCRIPT], { encoding: "utf8", maxBuffer: 256 << 20 }) : null;
  const py = r && r.status === 0 ? (JSON.parse(r.stdout) as { grids: Record<string, { D: number[]; C: number[] }>; fixtures: Record<string, { D: number[]; canonical: number[]; ticks: number }> }) : null;
  /** The largest difference (0 when every value is the same double; a zero's sign aside). */
  const diff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
    let m = a.length === b.length ? 0 : Infinity;
    for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m;
  };

  it("the Python ran", () => {
    expect(r?.stderr ?? "").toBe("");
    expect(py).not.toBeNull();
  });

  it.each(GRIDS)("a %i×%i grid: edges, dams, a seep, badwater and droughts for 256 ticks", (W, H) => {
    const N = W * H;
    const floor = Float64Array.from({ length: N }, (_, i) => (i * 13 + 7) % 5);
    const dam = Float64Array.from({ length: N }, (_, i) => (i % 7 === 0 ? 0.65 : -1));
    const depth = Float64Array.from({ length: N }, (_, i) => (i % 3 === 0 ? 0 : 0.01 + (i % 9) / 3));
    const contamination = Float64Array.from({ length: N }, (_, i) => (i % 4) / 3);
    const emitters: Emitter[] = [
      { cells: [0], strength: 2, contamination: 0, depthLimit: { anchor: 0, off: 0.8, on: 0.72 } },
      { cells: [N - 1], strength: 1, contamination: 1 },
      { cells: [W - 1, N - W], strength: 0.5, contamination: 0.5 },
    ];
    const sim = new WaterSim({ W, H, floor, dam, emitters }, { depth, contamination }, { rules: "game" });
    for (let t = 0; t < 256; t++) {
      emitters[1].contamination = t < 128 ? 1 : 0;
      sim.run(1, t < 64 ? 1 : t < 128 ? 0 : t < 192 ? 0.35 : 1);
    }
    const p = py!.grids[`${W}x${H}`];
    expect(diff(sim.D, p.D)).toBe(0);
    expect(diff(sim.C, p.C)).toBe(0);
  });

  const golden = JSON.parse(strFromU8(gunzipSync(readFileSync("tests/golden/water.json.gz")))) as { fixtures: { name: string; W: number; H: number; floor: number[]; dam: number[] | null; emitters: Emitter[] }[] };
  it.each(golden.fixtures.map((f) => [f.name, f] as const))("%s: 975 ticks from empty, and the canonical settle", (name, f) => {
    const m = { W: f.W, H: f.H, floor: Float64Array.from(f.floor), dam: f.dam ? Float64Array.from(f.dam) : null, emitters: f.emitters };
    const sim = new WaterSim(m, undefined, { rules: "game" });
    sim.run(975);
    const c = canonicalSettle(m, { rules: "game" });
    const p = py!.fixtures[name];
    expect(diff(sim.D, p.D)).toBe(0);
    expect(c.ticks).toBe(p.ticks);
    expect(diff(c.depth, p.canonical)).toBe(0);
  });
});
