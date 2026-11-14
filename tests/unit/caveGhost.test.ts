// The caves seen through the rock (caveGhost.ts; 3D view, "The caves through the rock"): which cells are air under a
// roof, their floors, steps, walls and mouths, on hand-made columns; the chunks an edit builds again; the pass the
// hidden marks are drawn in.

import { CustomBlending, GreaterDepth, Group, LessEqualDepth, Scene } from "three";
import { describe, expect, it } from "vitest";
import { caveChunksOf, caveFaces, CaveGhost, STEP, type Quads } from "../../src/render3d/caveGhost";

const mask = (...solid: number[]): number => solid.reduce((m, z) => m | (1 << z), 0);
const span = (lo: number, hi: number): number[] => Array.from({ length: hi - lo }, (_, k) => lo + k);

/** A W × H map of plain ground at `ground`, with `cols` (x, y, mask) set. */
function map(W: number, H: number, ground: number, cols: [number, number, number][]) {
  const masks = new Uint32Array(W * H).fill(mask(...span(0, ground)));
  const plain = masks[0];
  for (const [x, y, m] of cols) masks[y * W + x] = m;
  return caveFaces(W, H, (i) => masks[i] !== plain, (i) => masks[i]);
}

describe("caveFaces", () => {
  it("draws nothing on a map without terrain above terrain", () => {
    const f = map(6, 6, 4, []);
    expect(f).toMatchObject({ cells: 0, floors: 0, steps: 0, walls: 0, mouths: 0 });
    expect(f.fill.pos).toHaveLength(0);
    expect(f.edge.pos).toHaveLength(0);
    expect(f.line.pos).toHaveLength(0);
  });

  it("finds a closed pocket's floor and four walls, and no mouth", () => {
    // ground 0–7; one tile with air 2–3 under a roof 4–7, ringed by solid ground
    const f = map(5, 5, 8, [[2, 2, mask(0, 1, ...span(4, 8))]]);
    expect(f.cells).toBe(2);
    expect(f.floors).toBe(1);
    expect(f.walls).toBe(8);
    expect(f.mouths).toBe(0);
    // (a fill per floor and wall, at the layer's quads: four corners of three numbers each)
    expect(f.fill.pos).toHaveLength((1 + 8) * 12);
    expect(f.fill.col).toHaveLength((1 + 8) * 16);
  });

  it("finds an overhang's mouths where its air meets the open, and frames them", () => {
    // ground 0–3 everywhere; tile (2, 2) is a ledge 0–1 with air 2–3 under a roof 4–5: the ground round it stops at 4, so
    // air at 2–3 beside it is rock (walls), while the ledge (3, 2) lower at 2 leaves its layers 2–3 open (mouths)
    const f = map(5, 5, 4, [
      [2, 2, mask(0, 1, 4, 5)],
      [3, 2, mask(0, 1)],
    ]);
    expect(f.cells).toBe(2);
    expect(f.mouths).toBe(2);
    expect(f.walls).toBe(6);
    // the mouth two blocks high and one wide: framed below and above, and at both ends of each block
    const frames = 6;
    // the floor's outline: its east side opens to the ledge's floor at 2, which is no cave's floor; the other three sides
    // end at walls
    const outlines = 4;
    // (each a light line over its dark edge)
    expect(f.line.pos).toHaveLength((frames + outlines) * 12);
    expect(f.edge.pos).toHaveLength((frames + outlines) * 12);
  });

  it("keeps cells above a layer cut out (the masks as drawn)", () => {
    const col = mask(0, 1, ...span(4, 8));
    const cut = (1 << 3) - 1;
    const W = 5;
    const masks = new Uint32Array(W * W).fill(mask(...span(0, 8)));
    masks[2 * W + 2] = col;
    const f = caveFaces(W, W, (i) => i === 12, (i) => masks[i] & cut);
    // (under a cut at 3 the roof is gone: the air at 2 is open, no cave)
    expect(f.cells).toBe(0);
  });
});

/** The quads of `q` as their four corners. */
function corners(q: Quads): [number, number, number][][] {
  const out: [number, number, number][][] = [];
  for (let o = 0; o < q.pos.length; o += 12) out.push([0, 1, 2, 3].map((k) => [q.pos[o + 3 * k], q.pos[o + 3 * k + 1], q.pos[o + 3 * k + 2]] as [number, number, number]));
  return out;
}

/** A tunnel west to east along y = 2 in a 7 × 5 map of ground 0–7, closed at both ends: tiles x 1–2 with air from `lo`
 *  (its floor) up to `hiW` (exclusive), tiles x 3–5 with air from `lo + rise` up to `hiE`. */
function tunnel(lo: number, hiW: number, rise: number, hiE: number) {
  const solid = (from: number, to: number) => mask(...span(0, 8).filter((z) => z < from || z >= to));
  return map(7, 5, 8, [
    [1, 2, solid(lo, hiW)],
    [2, 2, solid(lo, hiW)],
    [3, 2, solid(lo + rise, hiE)],
    [4, 2, solid(lo + rise, hiE)],
    [5, 2, solid(lo + rise, hiE)],
  ]);
}

describe("caveFaces: a stepped tunnel is one passage", () => {
  it("draws the step's riser as the floor, outlined up its ends, and leaves the floors' outlines across it out", () => {
    // west air 2–3, east air 3–4: the floor steps up a layer at x = 3, and the west's air reaches the east's floor
    const f = tunnel(2, 4, 1, 5);
    expect(f.cells).toBe(10);
    expect(f.floors).toBe(5);
    expect(f.steps).toBe(1);
    // (the sides along the tunnel, its two ends, and the ceiling's own step above the east's air at 4)
    expect(f.walls).toBe(20 + 2 + 2 + 1);
    expect(f.mouths).toBe(0);
    const lines = corners(f.line);
    // the floors' outlines along both walls and at both ends (five floors, two sides each, and two ends), and the
    // riser's two ends: none of them along the step
    expect(lines).toHaveLength(5 * 2 + 2 + 2);
    const across = lines.filter((q) => q.every(([X, Y]) => Math.abs(X - 3) < 0.2 && Math.abs(Y - q[0][1]) < 1e-6));
    expect(across).toHaveLength(0);
    // the riser's ends stand up the step's corners, from the low floor (2) to the high one (3)
    const up = lines.filter((q) => Math.min(...q.map((c) => c[1])) === 2 && Math.max(...q.map((c) => c[1])) === 3);
    expect(up).toHaveLength(2);
    for (const q of up) for (const [X] of q) expect(Math.abs(X - 3)).toBeLessThan(0.2);
  });

  it("keeps a wall where the air does not go on up the step, or the rock rises more than a step", () => {
    // the west's air ends at 3 under its roof: it never reaches the east's floor at 3 (no air is invented)
    expect(tunnel(2, 3, 1, 5).steps).toBe(0);
    // a rise of STEP + 1 layers is a wall of the room
    expect(tunnel(1, 7, STEP + 1, 7).steps).toBe(0);
    // a rise of STEP layers is a step, its riser STEP faces high
    expect(tunnel(1, 7, STEP, 7).steps).toBe(STEP);
  });
});

/** A W × W map of ground 0–7 with roofs over air at 2–4 on a seeded fifth of its tiles. */
function scattered(W: number, seed: number): Uint32Array {
  const masks = new Uint32Array(W * W).fill(mask(...span(0, 8)));
  let s = seed;
  const rand = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32;
  for (let i = 0; i < W * W; i++) if (rand() < 0.2) masks[i] = mask(0, 1, ...span(2 + Math.floor(rand() * 3), 8).filter((z) => z > 4));
  return masks;
}

describe("CaveGhost", () => {
  it("builds again after an edit only the chunks the edit reaches, and draws what a whole build draws", () => {
    const W = 96;
    const plain = mask(...span(0, 8));
    const masks = scattered(W, 7);
    const listed = (i: number) => masks[i] !== plain;
    const maskAt = (i: number) => masks[i];
    const ghost = new CaveGhost(new Scene());
    ghost.update(W, W, listed, maskAt, null);
    expect(ghost.drawn.built).toBe(9);
    expect(ghost.drawn.cells).toBeGreaterThan(1000);
    // a stroke's frame: a 5 × 5 roof made over air at 2–4 inside one chunk, then one on the corner of four
    for (const rect of [
      { x0: 40, y0: 40, x1: 44, y1: 44 },
      { x0: 62, y0: 62, x1: 66, y1: 66 },
    ]) {
      for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) masks[y * W + x] = mask(0, 1, 5, 6);
      ghost.update(W, W, listed, maskAt, rect);
      expect(ghost.drawn.built).toBe(caveChunksOf(W, W, rect).length);
      const whole = new CaveGhost(new Scene());
      whole.update(W, W, listed, maskAt, null);
      expect(ghost.drawn).toMatchObject({ cells: whole.drawn.cells, mouths: whole.drawn.mouths, steps: whole.drawn.steps });
      for (const key of caveChunksOf(W, W, null)) {
        const a = ghost.chunk(key);
        const b = whole.chunk(key);
        expect(a?.fill.pos).toEqual(b?.fill.pos);
        expect(a?.edge.pos).toEqual(b?.edge.pos);
        expect(a?.line.pos).toEqual(b?.line.pos);
      }
    }
    expect(caveChunksOf(W, W, { x0: 40, y0: 40, x1: 44, y1: 44 })).toHaveLength(1);
    expect(caveChunksOf(W, W, { x0: 62, y0: 62, x1: 66, y1: 66 })).toHaveLength(4);
    // (a tile from a chunk's edge reaches the chunk beside it: a cell's faces read its neighbours')
    expect(caveChunksOf(W, W, { x0: 32, y0: 40, x1: 33, y1: 41 })).toHaveLength(2);
  });

  it("draws the hidden fills and lines before the objects, so a tree on a roof stands over them", () => {
    const scene = new Scene();
    const ghost = new CaveGhost(scene);
    const masks = new Uint32Array(25).fill(mask(...span(0, 8)));
    masks[12] = mask(0, 1, ...span(4, 8));
    ghost.update(5, 5, (i) => i === 12, (i) => masks[i], null);
    const depth = (m: { material: unknown }) => (m.material as { depthFunc: number }).depthFunc;
    const hidden = ghost.meshes.filter((m) => depth(m) === GreaterDepth);
    const seen = ghost.meshes.filter((m) => depth(m) === LessEqualDepth);
    expect(hidden).toHaveLength(2);
    expect(seen).toHaveLength(1);
    // three.js draws its opaque pass by group order, then render order: the objects stand in a group of order 1
    // (renderer.ts), the terrain's chunks at order 0 outside any; the hidden marks are in that pass, blended and outside
    // any group (after the terrain, before the objects), the lines in sight with the other aids after it
    for (const m of hidden) {
      expect(m.material).toMatchObject({ transparent: false, blending: CustomBlending, depthWrite: false });
      expect(m.parent).toBe(scene);
      expect(m.parent instanceof Group).toBe(false);
      expect(m.renderOrder).toBeGreaterThan(0);
    }
    for (const m of seen) expect(m.material).toMatchObject({ transparent: true, depthWrite: false });
    ghost.clear();
    expect(scene.children).toHaveLength(0);
  });
});
