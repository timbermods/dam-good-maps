// Kyler's contamination outline: with **Markers** on, a thin outline where contaminated ground
// ends, so the exact edge shows on demand; the clean view keeps its gradual fade. The outline is
// traced from the terrain's tile data (so it follows every soil and water update), with the hover
// text's rule for contaminated soil (any contamination at all), on the side that shows.

import { describe, expect, it } from "vitest";
import { contaminationEdges, sceneUniforms, terrainMaterial, overlayTexture } from "../../src/render3d/materials";
import { soilNibbles } from "../../src/render3d/light";
import { CONTAMINATION_OUTLINE, objectLegend } from "../../src/render3d/palette";

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Tile data (light.ts `tileData`'s layout) for a W × H map: contamination bytes, and which tiles
 *  have water over them. */
function tiles(W: number, H: number, contamination: number[], wet: number[] = []): Uint8Array {
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = 5;
    out[i * 4 + 1] = soilNibbles(0, contamination[i] ?? 0);
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = wet.includes(i) ? 20 : 0;
  }
  return out;
}

const E = 1;
const Wst = 2;
const N = 4;
const S = 8;

describe("the contamination outline", () => {
  it("traces where contaminated ground ends, on the contaminated side, never along the map's edge", () => {
    // 5 × 4, a contaminated 2 × 2 block at (1..2, 1..2) and one at the map's west edge (0, 3)
    const W = 5;
    const H = 4;
    const c = new Array(W * H).fill(0);
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2], [0, 3]]) c[y * W + x] = 120;
    const e = contaminationEdges(W, H, tiles(W, H, c));
    const at = (x: number, y: number) => e[(y * W + x) * 4];
    expect(at(1, 1)).toBe(Wst | S);
    expect(at(2, 1)).toBe(E | S);
    expect(at(1, 2)).toBe(Wst | N);
    expect(at(2, 2)).toBe(E | N);
    // (0, 3): its east neighbour is clean, its south is (0, 2), clean; nothing toward the map's
    // edges (west, north)
    expect(at(0, 3)).toBe(E | S);
    // clean tiles carry no outline while the contaminated side shows
    expect(at(0, 1)).toBe(0);
    expect(at(3, 2)).toBe(0);
    expect(at(1, 0)).toBe(0);
  });

  it("uses the hover text's rule: any contamination at all is contaminated ground", () => {
    const e = contaminationEdges(2, 1, tiles(2, 1, [1, 0]));
    expect(e[0]).toBe(E);
    expect(contaminationEdges(2, 1, tiles(2, 1, [0, 0]))[0]).toBe(0);
  });

  it("is drawn on the clean side where the contaminated ground is under water", () => {
    // (0, 0) contaminated under water, (1, 0) clean and dry, (2, 0) contaminated and dry: the
    // edge by the water is drawn on (1, 0), the other on (2, 0) itself
    const e = contaminationEdges(3, 1, tiles(3, 1, [200, 0, 200], [0]));
    expect(e[0]).toBe(0);
    expect(e[4]).toBe(Wst);
    expect(e[8]).toBe(Wst);
  });

  it("follows the soil: new tile data, a new outline", () => {
    const W = 3;
    const t = tiles(W, 1, [0, 0, 0]);
    const into = new Uint8Array(W * 4);
    expect([...contaminationEdges(W, 1, t, into)].filter((v, k) => k % 4 === 0)).toEqual([0, 0, 0]);
    t[2 * 4 + 1] = soilNibbles(0, 90);
    contaminationEdges(W, 1, t, into);
    expect(into[2 * 4]).toBe(Wst);
  });

  it("shows only with Markers, as a light line between dark edges, and the legend says so", () => {
    const t = () => overlayTexture(1, 1);
    const shader = terrainMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), 0, 1).fragmentShader;
    expect(shader).toContain("markers > 0.5 && n.y > 0.5");
    expect(shader).toContain("contamEdges");
    expect(lum(CONTAMINATION_OUTLINE.light) - lum(CONTAMINATION_OUTLINE.dark)).toBeGreaterThan(0.7);
    const entry = objectLegend().find((l) => l.label === "Contamination edge");
    expect(entry?.markers).toBe(true);
  });
});
