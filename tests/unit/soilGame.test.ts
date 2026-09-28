// The game's own soil rules on a heightfield (PLAN §20 D298): the build and both validators take
// moisture and soil contamination from sim/soil3d.ts's "game" mode (sim/soil.ts `gameSoil`). This
// holds the heightfield half of the 3D branch's tests/unit/soil3d.test.ts (its cave half needs the
// stacked-column engine, which stays on that branch): "port" mode still gives sim/moisture.ts's and
// sim/contamination.ts's numbers bit for bit, game mode keeps its pinned output, and the Python
// validator's port (prototype/soil.py) gives the same numbers bit for bit.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { heightMasks, waterColumns } from "../../src/core/sim/columns";
import { soilContamination } from "../../src/core/sim/contamination";
import { moistureBarrier, waterModel, type MapObject } from "../../src/core/sim/model";
import { moisture } from "../../src/core/sim/moisture";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { columnSaturation, soil3d } from "../../src/core/sim/soil3d";
import { gameSoil } from "../../src/core/sim/soil";

/** Python with numpy, for the oracle's side (CI has it; a machine without it skips). */
const PY = (() => {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
})();

const object = (template: string, x: number, y: number, z: number, components: MapObject["components"] = {}): MapObject => ({ template, x, y, z, orientation: "Cw0", flipped: false, components });
const source = (x: number, y: number, z: number, strength: number, template = "WaterSource") => object(template, x, y, z, { WaterSource: { SpecifiedStrength: strength } });

/** A small valley (the 3D branch's tests/unit/stackMaps.ts `valley`): a stream from the west,
 *  draining off the east edge. */
function valley(W: number, H: number): Uint8Array {
  const h = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const across = Math.abs(y - H / 2);
      h[y * W + x] = Math.min(12, 3 + Math.floor(across / 2) + ((x * 7 + y * 3) % 5 === 0 ? 1 : 0) + (x < 4 ? 2 : 0) - (x > W - 6 ? 1 : 0));
    }
  return h;
}

/** The valley with a badwater source on a ledge, a Blockage in the stream (it raises its water's
 *  floor) and Thorns. */
function scene() {
  const W = 40;
  const H = 32;
  const h = valley(W, H);
  for (let y = H / 2 + 3; y < H / 2 + 6; y++) for (let x = 1; x < 4; x++) h[y * W + x] = 7;
  const objects = [source(2, H / 2, h[(H / 2) * W + 2], 3), source(1, H / 2 + 3, 7, 2, "BadwaterSource"), object("Blockage", 20, H / 2, h[(H / 2) * W + 20]), object("Thorns", 10, H / 2 + 2, h[(H / 2 + 2) * W + 10])];
  const model = waterModel(W, H, h, objects);
  // (the water as the 3D branch settled it, on the port's water rules: the soil's pins are its
  // values; the game's water rules, D311, move this scene's water, not the soil's rules)
  return { W, H, h, objects, model, water: canonicalSettle(model, { rules: "port" }) };
}

describe("the game's soil on a heightfield (D298)", () => {
  it("port mode gives today's moisture and contamination, bit for bit", () => {
    const { W, H, h, objects, water } = scene();
    const barrier = moistureBarrier(W, H, objects);
    const a = moisture(h, water.depth, water.contamination, W, H, barrier);
    const b = soilContamination(h, water.depth, water.contamination, W, H, barrier);
    const masks = heightMasks(W, H, h);
    const cols = waterColumns(masks, objects);
    expect(Array.from(columnSaturation(cols, water.depth))).toEqual(Array.from(water.sat));
    const s = soil3d(masks, cols, water, objects);
    let differ = 0;
    for (let i = 0; i < W * H; i++) if (a[i] !== s.moisture[i] || b[i] !== s.contamination[i]) differ++;
    expect(differ).toBe(0);
  });

  it("keeps game mode's output as pinned (the 3D branch's value), and gameSoil is that output", () => {
    const hash = (s: { moisture: Float64Array; contamination: Float64Array }) => createHash("sha256").update(new Uint8Array(s.moisture.buffer)).update(new Uint8Array(s.contamination.buffer)).digest("hex").slice(0, 16);
    const { W, H, h, objects, water } = scene();
    const masks = heightMasks(W, H, h);
    expect(hash(soil3d(masks, waterColumns(masks, objects), water, objects, "game"))).toBe("54248ee8ab705b8c");
    expect(hash(gameSoil(W, H, h, water.depth, water.contamination, objects, water.sat))).toBe("54248ee8ab705b8c");
    // the game's rules keep moisture from leaking through the badwater stream to the land beyond it
    const port = moisture(h, water.depth, water.contamination, W, H, moistureBarrier(W, H, objects));
    const game = gameSoil(W, H, h, water.depth, water.contamination, objects).moisture;
    let differ = 0;
    for (let i = 0; i < W * H; i++) if (port[i] !== game[i]) differ++;
    expect(differ).toBeGreaterThan(0);
  });

  it.skipIf(!PY)("the Python validator's port gives the same numbers, bit for bit", () => {
    const { W, H, h, objects, model, water } = scene();
    const s = gameSoil(W, H, h, water.depth, water.contamination, objects, water.sat);
    const thorns = objects.filter((o) => o.template === "Thorns").map((o) => [o.x, o.y]);
    const input = JSON.stringify({ W, H, h: Array.from(h), floor: Array.from(model.floor), depth: Array.from(water.depth), contamination: Array.from(water.contamination), sat: Array.from(water.sat), thorns });
    const script = [
      "import json, sys",
      "import numpy as np",
      "sys.path.insert(0, 'prototype')",
      "from soil import moisture_game, contamination_game",
      "d = json.load(sys.stdin)",
      "W, H = d['W'], d['H']",
      "sh = lambda k, t=float: np.array(d[k], dtype=t).reshape(H, W)",
      "h = sh('h', int); fl = sh('floor'); D = sh('depth'); C = sh('contamination'); sat = sh('sat', int)",
      "b = np.zeros((H, W), bool)",
      "for x, y in d['thorns']: b[y, x] = True",
      "M = moisture_game(h, fl, D, C, sat, b)",
      "S = contamination_game(h, fl, D, C, b)",
      "print(json.dumps({'m': M.ravel().tolist(), 's': S.ravel().tolist()}))",
    ].join("\n");
    const r = spawnSync(PY!, ["-B", "-c", script], { input, encoding: "utf8", maxBuffer: 64 << 20 });
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout) as { m: number[]; s: number[] };
    let differ = 0;
    for (let i = 0; i < W * H; i++) if (out.m[i] !== s.moisture[i] || out.s[i] !== s.contamination[i]) differ++;
    expect(differ).toBe(0);
  });
});
