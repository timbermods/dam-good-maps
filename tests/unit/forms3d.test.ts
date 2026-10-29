// The 3D forms' processes (D488, land/forms3d.ts) on small hand-made lands: each finds its place where
// the land offers one, keeps the game's support rule (nothing falls) and the surface it can keep, and
// the same land and draw give the same terrain.
import { describe, expect, it } from "vitest";
import { growForms, type FormsInput } from "../../src/core/land/forms3d";
import { stream } from "../../src/core/math/rng";
import { bottomRunTop, isPlainMask, surfaceOfMask } from "../../src/core/terrain/runs";
import { unsupportedVoxels } from "../../src/core/terrain/support";

const W = 48;
const H = 48;
const N = W * H;

function land(f: (x: number, y: number) => number, wet: (x: number, y: number) => number = () => 0, start: FormsInput["start"] = null): FormsInput {
  const heights = new Uint8Array(N);
  const water = new Float64Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      heights[y * W + x] = f(x, y);
      water[y * W + x] = wet(x, y);
    }
  const keep = new Uint8Array(N);
  if (start) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) keep[(start.y + dy) * W + start.x + dx] = 1;
  return { W, H, heights, water, contamination: new Float64Array(N), keep, plants: new Uint8Array(N), start, nearSource: new Uint8Array(N), rivers: [{ id: "r", path: [[10.5, 2], [10.5, 45]], badwater: false }], top: 16, vt: 50 };
}

function nothingFalls(mask: Uint32Array): boolean {
  return unsupportedVoxels({ W, H, mask }).every((v) => v === 0);
}

describe("3D forms on hand-made land (D488)", () => {
  it("a spring cave opens in the cliff beside a river, its pool under the rock, the surface kept", () => {
    // a river at x 9–11, a bank at x 12–13, a cliff from x 14
    const inp = land((x) => (x <= 11 ? 3 : x <= 13 ? 4 : 11), (x) => (x >= 9 && x <= 11 ? 0.5 : 0));
    const g = growForms(inp, { "spring-cave": 1 }, stream(1, "forms3d"));
    expect(g.forms.map((f) => f.id)).toEqual(["spring-cave"]);
    const cave = g.forms[0];
    expect(nothingFalls(g.mask)).toBe(true);
    for (let i = 0; i < N; i++) expect(surfaceOfMask(g.mask[i])).toBe(inp.heights[i]);
    // its spring stands on the pool's floor, a level under the cave's mouth, under a roof
    const spring = cave.spring!;
    expect(isPlainMask(g.mask[spring])).toBe(false);
    expect(bottomRunTop(g.mask[spring])).toBe(3);
    // its stream runs from the spring out over the bank to the river's water
    expect(cave.course![0]).toBe(spring);
    expect(inp.water[cave.course![cave.course!.length - 1]]).toBeGreaterThanOrEqual(0.1);
  });

  it("an overhang is worn into the cliff beside the start, over level ground at the start's floor", () => {
    const start = { x: 10, y: 24, z: 5 };
    const inp = land((x) => (x < 16 ? 5 : 10), () => 0, start);
    const g = growForms(inp, { "start-overhang": 1 }, stream(2, "forms3d"));
    expect(g.forms.map((f) => f.id)).toEqual(["start-overhang"]);
    expect(nothingFalls(g.mask)).toBe(true);
    for (const i of g.forms[0].tiles) {
      // the ground under the rock is the start's floor, the rock above it kept to the cliff's top
      expect(bottomRunTop(g.mask[i])).toBe(5);
      expect(surfaceOfMask(g.mask[i])).toBe(10);
      expect(i % W).toBeGreaterThanOrEqual(16);
    }
    expect(g.forms[0].tiles.length).toBeGreaterThanOrEqual(4);
    // worn, not a box: its hollow is not one height and one depth all along (its ends taper into the
    // face, its roof wanders), so it reads as rock, not a doorway
    const hollow = (i: number) => {
      let z = 5;
      while (!(g.mask[i] & (1 << z))) z++;
      return z - 5;
    };
    const tiles = g.forms[0].tiles;
    const rows = new Map<number, number>();
    for (const i of tiles) rows.set(Math.floor(i / W), (rows.get(Math.floor(i / W)) ?? 0) + 1);
    expect(new Set([...tiles.map(hollow)]).size + new Set(rows.values()).size).toBeGreaterThan(2);
  });

  it("an arch spans a narrow gorge at its rims' level, the river running under it", () => {
    // rims at 12, a gorge 7 wide at x 7–13 with the river in it
    const inp = land((x) => (x >= 7 && x <= 13 ? 3 : 12), (x) => (x >= 9 && x <= 11 ? 0.6 : 0));
    const g = growForms(inp, { "gorge-arch": 1 }, stream(3, "forms3d"));
    expect(g.forms.map((f) => f.id)).toEqual(["gorge-arch"]);
    expect(nothingFalls(g.mask)).toBe(true);
    const deck = g.forms[0].tiles;
    for (const i of deck) {
      // never above the rims; worn lower off its spine (its faces waisted, its feet flared lower)
      expect(surfaceOfMask(g.mask[i])).toBeLessThanOrEqual(12);
      // over air: the gorge's floor stays where it was, and the arch's underside 2 or more over the water
      expect(bottomRunTop(g.mask[i])).toBe(3);
      expect(isPlainMask(g.mask[i])).toBe(false);
      // over the river (0.6 deep on the floor at 3: its surface in the layer under 4), the rock's
      // underside stands 2 or more layers over the water: nothing solid from layer 3 to layer 5
      if (inp.water[i] > 0.1) for (let z = 3; z < 6; z++) expect(g.mask[i] & (1 << z)).toBe(0);
    }
    expect(deck.some((i) => inp.water[i] > 0.1)).toBe(true);
    // its spine: a row along the crossing, whole at the rims' level from one rim to the other
    const rows = new Map<number, number>();
    for (const i of deck) if (surfaceOfMask(g.mask[i]) === 12) rows.set(Math.floor(i / W), (rows.get(Math.floor(i / W)) ?? 0) + 1);
    expect(Math.max(...rows.values())).toBe(7);
    // and no plank: its tiles stand at more than one height
    expect(new Set(deck.map((i) => surfaceOfMask(g.mask[i]))).size).toBeGreaterThan(1);
  });

  it("the same land and draw give the same terrain; land with no place for a form keeps none", () => {
    const inp = land((x) => (x <= 11 ? 3 : x <= 13 ? 4 : 11), (x) => (x >= 9 && x <= 11 ? 0.5 : 0));
    const a = growForms(inp, { "spring-cave": 2, "gorge-arch": 1 }, stream(4, "forms3d"));
    const b = growForms(inp, { "spring-cave": 2, "gorge-arch": 1 }, stream(4, "forms3d"));
    expect(Array.from(a.mask)).toEqual(Array.from(b.mask));
    const flat = land(() => 4);
    const none = growForms(flat, { "spring-cave": 1, "start-overhang": 1, "gorge-arch": 1 }, stream(5, "forms3d"));
    expect(none.forms).toEqual([]);
    expect(none.missed.map((m) => m.id).sort()).toEqual(["gorge-arch", "spring-cave", "start-overhang"]);
  });
});
