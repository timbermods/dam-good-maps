// Waterfalls with shape and volume (PLAN §20 D201, D215): where water pours over a lip into lower
// water, it leaves the lip and arcs outward and down into the pool, further for stronger flow; a wide
// fall is one ribbon, closed only at its free ends, and a lip that turns a corner (an L-shaped lip, a
// staircase) is one sheet, with no gap where the sides meet; whitewater where it lands stays in its
// pool; a stepped cascade is a fall at every step, each with its own lip and splash; badwater falls
// take badwater's colours and stay apart from clean falls in greyscale and with colour blindness;
// the falls follow every water update. Rendering only: the map's bytes are pinned by
// tests/contract/look-mine-ruins.test.ts.

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { arcLength, arcPoint, END, FALL_MIN, FALL_SHAPE, FALL_SPLASH, FALL_STRIDE, fallEnds, fallPoint, fallReach, fallSplash, fallTemplate, fallThickness, firstCorner, lipOutflow, tangent } from "../../src/render3d/falls";
import { fallMaterial, sceneUniforms } from "../../src/render3d/materials";
import { surfaceWater, waterFromDepth, type SurfaceWater, type WaterView } from "../../src/render3d/model";
import { changedWaterChunks, FALL_IN_BITS, LIP_BITS, lowerByTile, meshWaterChunk, type WaterMeshData } from "../../src/render3d/waterMesh";
import { CLEAR_WATER, WATER, WATER_GLSL, type Rgb } from "../../src/render3d/waterPalette";
import { DT } from "../../src/core/sim/water";

/** A map of heights (rows from y = 0) with water `depth` deep on every tile where `wet` says. */
function scene(rows: number[][], wet: (x: number, y: number) => number, bad: (x: number, y: number) => number = () => 0): { W: number; H: number; heights: Uint8Array; view: WaterView; sw: SurfaceWater } {
  const H = rows.length;
  const W = rows[0].length;
  const heights = new Uint8Array(W * H);
  const depth: number[] = [];
  const cont: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      heights[y * W + x] = rows[y][x];
      depth.push(wet(x, y));
      cont.push(bad(x, y));
    }
  const view = waterFromDepth(heights, depth, cont);
  return { W, H, heights, view, sw: surfaceWater(W, H, view) };
}

function meshAll(s: ReturnType<typeof scene>): WaterMeshData[] {
  const out: WaterMeshData[] = [];
  for (let cy = 0; cy * 32 < s.H; cy++) for (let cx = 0; cx * 32 < s.W; cx++) out.push(meshWaterChunk(s.W, s.H, s.heights, s.sw, s.view, lowerByTile(s.sw, s.view), cx, cy));
  return out;
}

/** A fall instance, decoded. */
function decode(f: Float32Array) {
  const { side, ends, room } = fallEnds(f);
  return { corner: [f[0], -f[1]] as [number, number], side, ends, flow: [f[3], f[15]], top: [f[4], f[5]], land: [f[6], f[7]], reach: [f[8], f[9]], thickness: [f[10], f[11]], bad: [f[12], f[13]], room, raw: f };
}

/** Every fall of a scene, decoded. */
function falls(s: ReturnType<typeof scene>) {
  const list = [];
  for (const m of meshAll(s)) for (let k = 0; k < m.fallCount; k++) list.push(decode(m.falls.subarray(k * FALL_STRIDE, (k + 1) * FALL_STRIDE)));
  return list;
}

describe("a fall's arc", () => {
  const cases: [number, number, number, number][] = [
    // reach, top, land, thickness
    [0.12, 6.5, 3.5, 0.06],
    [0.5, 14.2, 3.2, 0.24],
    [1.1, 8.5, 3.3, 0.45],
    [0.3, 4.2, 3.2, 0.2],
  ];

  it("leaves the lip level, arcs outward and down, and lands in the pool at its reach", () => {
    for (const [reach, top, land, th] of cases) {
      const [o0, u0] = arcPoint(reach, top, land, th, 0);
      expect(o0).toBeCloseTo(FALL_SHAPE.off, 9);
      expect(u0).toBeCloseTo(top, 9);
      // level at the brink: it drops far less than it moves out over the first step
      const [o1, u1] = arcPoint(reach, top, land, th, 0.01);
      expect((top - u1) / (o1 - o0)).toBeLessThan(0.1 * (top - land) / reach);
      // outward and down all the way
      let prev = arcPoint(reach, top, land, th, 0);
      for (let k = 1; k <= 50; k++) {
        const p = arcPoint(reach, top, land, th, k / 50);
        expect(p[0]).toBeGreaterThan(prev[0]);
        expect(p[1]).toBeLessThan(prev[1]);
        prev = p;
      }
      // it lands on the pool, a reach out from the lip
      const [oe, ue] = arcPoint(reach, top, land, th, 1);
      expect(oe).toBeCloseTo(reach + FALL_SHAPE.off, 9);
      expect(ue).toBeCloseTo(land, 9);
      // its length is at least the drop and at most the drop plus the reach
      const L = arcLength(reach, top, land, 1);
      expect(L).toBeGreaterThanOrEqual(top - land - 1e-9);
      expect(L).toBeLessThanOrEqual(top - land + reach + 1e-9);
    }
  });

  it("has thickness: the inner face a lip's depth inside the outer, never behind the cliff or below the pool", () => {
    for (const [reach, top, land, th] of cases) {
      const [oi, ui] = arcPoint(reach, top, land, th, 0, true);
      expect(oi).toBeCloseTo(FALL_SHAPE.off, 9);
      expect(ui).toBeCloseTo(top - th, 9);
      for (let k = 0; k <= 40; k++) {
        const w = k / 40;
        const [o, u] = arcPoint(reach, top, land, th, w, true);
        const [oo, uo] = arcPoint(reach, top, land, th, w);
        expect(o).toBeGreaterThanOrEqual(FALL_SHAPE.off);
        expect(u).toBeGreaterThanOrEqual(land - 1e-9);
        // inside the outer face: nearer the cliff, or below it
        expect(o <= oo + 1e-9 && u <= uo + 1e-9).toBe(true);
        // no thicker than the lip's depth
        expect(Math.hypot(oo - o, uo - u)).toBeLessThanOrEqual(th + 1e-9);
      }
    }
    // the thickness is the lip's depth, within bounds, and never most of a small drop
    expect(fallThickness(0.24, 11)).toBeCloseTo(0.24, 9);
    expect(fallThickness(0.01, 3)).toBe(FALL_SHAPE.thickness[0]);
    expect(fallThickness(2, 3)).toBe(FALL_SHAPE.thickness[1]);
    expect(fallThickness(1, 0.4)).toBeCloseTo(FALL_SHAPE.ofDrop * 0.4, 9);
  });

  it("reaches further for stronger flow and taller falls, and stays in its pool", () => {
    const flows = [0.02, 0.06, 0.1, 0.3, 0.6, 1, 1.8, 4, 12];
    for (const room of [1, 2])
      for (const drop of [0.5, 2, 5, 11]) {
        const r = flows.map((q) => fallReach(q, drop, room));
        for (let k = 0; k < r.length; k++) {
          expect(r[k]).toBeGreaterThanOrEqual(FALL_SHAPE.least);
          expect(r[k]).toBeLessThan(FALL_SHAPE.limit * room);
          if (k && r[k - 1] > FALL_SHAPE.least) expect(r[k]).toBeGreaterThan(r[k - 1]);
        }
      }
    for (const q of [0.2, 0.8, 2]) expect(fallReach(q, 8)).toBeGreaterThan(fallReach(q, 2));
    // a strong wide river's fall leaves the cliff far behind; a trickle hardly leaves it
    expect(fallReach(1.8, 5, 2)).toBeGreaterThan(4 * fallReach(0.08, 5, 2));
    expect(fallReach(0.08, 5, 2)).toBeLessThan(0.25);
  });
});

describe("falls in the water mesh", () => {
  // west to east: a pool at 6 (0.5 deep) pours over its lip into a river at 3, three tiles wide,
  // between dry ground at 9 to the south and north
  const pool = () =>
    scene(
      [
        [9, 9, 9, 9, 9],
        [6, 6, 3, 3, 3],
        [6, 6, 3, 3, 3],
        [6, 6, 3, 3, 3],
        [9, 9, 9, 9, 9],
      ],
      (x, y) => (y >= 1 && y <= 3 ? 0.5 : 0),
    );

  it("pours from the lip with the simulation's flow over it, out of the side it faces", () => {
    const s = pool();
    const list = falls(s);
    expect(list.length).toBe(3);
    for (const f of list) {
      expect(f.side).toBe(0);
      expect(f.top).toEqual([6.5, 6.5]);
      expect(f.land).toEqual([3.5, 3.5]);
      // the lip empties over its one lower side each substep: its depth over the substep
      expect(f.flow[0]).toBeCloseTo(0.5 / DT, 6);
      expect(f.flow[1]).toBeCloseTo(0.5 / DT, 6);
      // the river goes on three tiles past the lip: the splash may spread over them all, the arc
      // over two
      expect(f.reach[0]).toBeCloseTo(fallReach(0.5 / DT, 3, 2), 6);
      expect(f.room).toEqual([3, 3]);
      // the lip edge: x = 2, one tile of it
      expect(f.corner[0]).toBe(2);
    }
    // the lip's tops are marked for the brink's foam, the landing's for the fall coming in
    const m = meshAll(s)[0];
    for (let q = 0; q < m.quads; q++) {
      if (m.normals[q * 12 + 1] <= 0) continue;
      const x = Math.min(m.positions[q * 12], m.positions[q * 12 + 3]);
      const flags = m.flags[q * 4];
      expect(!!(flags & LIP_BITS[0])).toBe(x === 1);
      expect(!!(flags & FALL_IN_BITS[1])).toBe(x === 2);
    }
  });

  it("shares the flow among the sides a lip pours over, as the simulation does, by their head", () => {
    // a corner tile at 6 with a drop of 3 to the east and of 1 to the south
    const s = scene(
      [
        [9, 5, 9],
        [6, 6, 3],
        [9, 9, 9],
      ],
      (x, y) => (y === 1 || (x === 1 && y === 0) ? 0.3 : 0),
    );
    const east = lipOutflow(s.W, s.H, s.heights, s.sw, 1, 1, 0);
    const south = lipOutflow(s.W, s.H, s.heights, s.sw, 1, 1, 3);
    expect(east + south).toBeCloseTo(0.3 / DT, 6);
    expect(east / south).toBeCloseTo((6.3 - 3.3) / (6.3 - 5.3), 6);
  });

  it("makes a wide fall one ribbon: lips side by side share their corners, and only its ends are free", () => {
    const list = falls(pool()).sort((a, b) => a.corner[1] - b.corner[1]);
    // the side's tangent runs from the first corner to the second, and each fall's second corner
    // is the next one's first
    const [tx, ty] = tangent(0);
    for (let k = 0; k + 1 < list.length; k++) {
      expect(list[k].corner[0] + tx).toBe(list[k + 1].corner[0]);
      expect(list[k].corner[1] + ty).toBe(list[k + 1].corner[1]);
      expect(list[k].reach[1]).toBe(list[k + 1].reach[0]);
      expect(list[k].thickness[1]).toBe(list[k + 1].thickness[0]);
      expect(list[k].land[1]).toBe(list[k + 1].land[0]);
    }
    expect(list.map((f) => f.ends)).toEqual([
      [END.free, END.joined],
      [END.joined, END.joined],
      [END.joined, END.free],
    ]);
    // a single tile's fall is free at both ends
    const one = falls(scene([[9, 9, 9], [6, 3, 3], [9, 9, 9]], (x, y) => (y === 1 ? 0.3 : 0)));
    expect(one.length).toBe(1);
    expect(one[0].ends).toEqual([END.free, END.free]);
    expect(firstCorner(0, 1, 0)).toEqual([1, 1]);
  });

  it("draws a stepped cascade as a fall at every step, each with its own lip, landing and splash", () => {
    // a channel stepping down 2 levels every 2 tiles, and one stepping down every tile
    for (const len of [2, 1]) {
      const steps = 5;
      const W = steps * len + 1;
      const row = Array.from({ length: W }, (_, x) => 2 + 2 * (steps - Math.min(steps, Math.floor(x / len))));
      const s = scene([row.map(() => 30), row, row.map(() => 30)], (x, y) => (y === 1 ? 0.25 : 0));
      const list = falls(s).sort((a, b) => a.corner[0] - b.corner[0]);
      expect(list.length).toBe(steps);
      list.forEach((f, k) => {
        // its lip is the end of a step, its landing the next step's water, 2 levels down
        expect(f.corner[0]).toBe((k + 1) * len);
        expect(f.top[0] - f.land[0]).toBeCloseTo(2, 5);
        if (k + 1 < list.length) expect(f.land[0]).toBeCloseTo(list[k + 1].top[0], 5);
        // its arc and its whitewater stay on its own step, short of the next lip (the last lands
        // at the map's edge)
        expect(f.room).toEqual(Array(2).fill(len === 2 && k + 1 < list.length ? 2 : 1));
        expect(f.reach[0]).toBeLessThan(f.room[0]);
        const w = fallSplash(f.flow[0], f.top[0] - f.land[0], f.reach[0], f.room[0]);
        expect(w.out).toBeLessThan(len);
        expect(f.reach[0] + w.ahead).toBeLessThan(len);
      });
      // each step's water is a lip at its end and takes a fall at its start
      const m = meshAll(s)[0];
      let lips = 0;
      let feet = 0;
      for (let q = 0; q < m.quads; q++) {
        if (m.normals[q * 12 + 1] <= 0) continue;
        if (m.flags[q * 4] & LIP_BITS[0]) lips++;
        if (m.flags[q * 4] & FALL_IN_BITS[1]) feet++;
      }
      expect(lips).toBe(steps);
      expect(feet).toBe(steps);
    }
  });

  it("leaves a small step between two waters a curtain, and only a drop of FALL_MIN or more a fall", () => {
    const s = scene([[9, 9, 9], [5, 5, 5], [9, 9, 9]], (x, y) => (y !== 1 ? 0 : x === 0 ? 0.55 : 0.4));
    expect(s.sw.surface[3] - s.sw.surface[4]).toBeLessThan(FALL_MIN);
    expect(falls(s).length).toBe(0);
  });

  it("follows the water: remeshing the changed chunks lists the same falls as meshing everything", () => {
    // a lip 40 tiles wide across the border of two chunks (x = 32), pouring north (+y); the lip's
    // water sinks on the tile two east of the border (x = 33), so the lip beside it (x = 32) now
    // also spills sideways, its fall weakens, and so does the corner it shares with the lip west of
    // the border (x = 31), in the other chunk
    const W = 64;
    const H = 6;
    const rows = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y === 0 || y === 5 || x < 12 || x >= 52 ? 20 : y <= 2 ? 8 : 4)));
    const a = scene(rows, (x, y) => (y >= 1 && y <= 4 && x >= 12 && x < 52 ? 0.3 : 0));
    const b = scene(rows, (x, y) => (y >= 1 && y <= 4 && x >= 12 && x < 52 ? (x === 33 && y === 2 ? 0.1 : 0.3) : 0));
    const changed = changedWaterChunks(W, H, a.sw, b.sw, 0, 0);
    expect([...changed].sort()).toEqual(["0,0", "1,0"]);
    const at = (s: ReturnType<typeof scene>, x: number) => falls(s).find((f) => f.corner[0] === x + 1)!;
    const flow = (f: ReturnType<typeof falls>[number]) => f.flow[0] + f.flow[1];
    expect(flow(at(b, 32))).toBeLessThan(flow(at(a, 32)));
    // (along a lip pouring north the tangent runs west: x = 31's first corner is the one it shares
    // with x = 32)
    expect(tangent(2)).toEqual([-1, 0]);
    expect(at(b, 31).reach[0]).toBeLessThan(at(a, 31).reach[0]);
    expect(at(b, 31).reach[1]).toBe(at(a, 31).reach[1]);
    const key = (f: ReturnType<typeof falls>[number]) => JSON.stringify([...f.raw]);
    const fresh = falls(b).map(key).sort();
    const kept = meshAll(a).map((m, cx) => (changed.has(`${cx},0`) ? meshWaterChunk(W, H, b.heights, b.sw, b.view, null, cx, 0) : m));
    const remeshed: string[] = [];
    for (const m of kept) for (let k = 0; k < m.fallCount; k++) remeshed.push(key(decode(m.falls.subarray(k * FALL_STRIDE, (k + 1) * FALL_STRIDE))));
    expect(remeshed.sort()).toEqual(fresh);
    // a lip gone dry leaves no fall behind
    const dry = scene(rows, (x, y) => (y >= 1 && y <= 4 && x >= 12 && x < 52 && !(x === 20 && y === 2) ? 0.3 : 0));
    expect(falls(dry).length).toBe(39);
    expect(falls(a).length).toBe(40);
  });
});

describe("a lip that turns a corner is one sheet (D215)", () => {
  /** A fall's edge at its end u: points down its outer face, then its inner face. */
  const edge = (f: Float32Array, u: 0 | 1, until = 1) => {
    const pts: [number, number, number][] = [];
    for (const inner of [false, true])
      for (let k = 0; k <= 24; k++) {
        const w = k / 24;
        const [out] = arcPoint(f[8 + u], f[4 + u], f[6 + u], f[10 + u], w, inner);
        if (out <= until) pts.push(fallPoint(f, u, w, inner));
      }
    return pts;
  };
  const expectSame = (a: [number, number, number][], b: [number, number, number][]) => {
    expect(a.length).toBeGreaterThan(4);
    expect(a.length).toBe(b.length);
    a.forEach((p, i) => p.forEach((v, c) => expect(v).toBeCloseTo(b[i][c], 6)));
  };
  /** The corner's values two lips share. */
  const expectShared = (a: ReturnType<typeof falls>[number], ua: 0 | 1, b: ReturnType<typeof falls>[number], ub: 0 | 1) => {
    for (const k of ["top", "land", "reach", "thickness", "bad", "flow", "room"] as const) expect(a[k][ua]).toBe(b[k][ub]);
  };

  it("meets round an outer corner (an L-shaped lip): the two sides' ribbons share the corner and meet on its diagonal, at every height", () => {
    // a pool at 6 whose corner tile (2, 2) pours south and east into a river at 3 wrapping round it
    const s = scene(
      [
        [3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3],
        [6, 6, 6, 3, 3],
        [6, 6, 6, 9, 9],
        [9, 9, 9, 9, 9],
      ],
      (x, y) => (y <= 1 || (y === 2 && x >= 3) ? 0.5 : y <= 3 && x <= 2 ? 0.4 : 0),
    );
    const list = falls(s);
    expect(list.length).toBe(4);
    const south = list.find((f) => f.side === 3 && f.corner[0] === 2)!;
    const east = list.find((f) => f.side === 0)!;
    expect(east.corner).toEqual([3, 2]);
    expect(south.ends).toEqual([END.joined, END.outward]);
    expect(east.ends).toEqual([END.outward, END.free]);
    expectShared(south, 1, east, 0);
    // the south ribbon runs on round the corner and the east one back round it: one edge, running
    // out along the corner's diagonal, so no gap opens between them as they arc out
    const a = edge(south.raw, 1);
    expectSame(a, edge(east.raw, 0));
    for (const [x, , z] of a) expect(x - 3).toBeCloseTo(2 + z, 6);
    // (as a free end each stood in from the corner, and the two drew apart as they fell: the V)
  });

  it("meets round an inner corner: the ribbons pouring into the same water stop short on its diagonal, and never cross", () => {
    // a pool at 6, L-shaped, round a river at 3: tile (0, 1) pours east and tile (1, 2) south into
    // the same river tile (1, 1)
    const s = scene(
      [
        [3, 3, 3, 9],
        [6, 3, 3, 9],
        [6, 6, 6, 9],
        [9, 9, 9, 9],
      ],
      (x, y) => (y === 3 || x === 3 ? 0 : (x === 0 && y >= 1) || y === 2 ? 0.4 : 0.5),
    );
    const list = falls(s);
    const east = list.find((f) => f.side === 0)!;
    const south = list.find((f) => f.side === 3 && f.corner[0] === 1)!;
    expect(east.corner).toEqual([1, 1]);
    expect(south.corner).toEqual([1, 2]);
    expect(east.ends[1]).toBe(END.inward);
    expect(south.ends[0]).toBe(END.inward);
    // (and the east lip's other end turns the outer corner of the same tile)
    expect(east.ends[0]).toBe(END.outward);
    expectShared(east, 1, south, 0);
    // one edge along the corner's diagonal, as far out as a ribbon may stop short
    const a = edge(east.raw, 1, END.inwardMost);
    expectSame(a, edge(south.raw, 0, END.inwardMost));
    for (const [x, , z] of a) expect(x - 1).toBeCloseTo(2 + z, 6);
  });

  it("makes a staircase lip (water crossing a cliff at a slant) one zigzag sheet, as wide where it lands as at the lip", () => {
    // a pool at 6 above a staircase edge (every tile with y > x), a river at 3 below it
    const N = 7;
    const rows = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (y > x ? 6 : 3)));
    const s = scene(rows, (x, y) => (y > x ? 0.4 : 0.5));
    const list = falls(s);
    // each tile of the staircase pours south and east
    expect(list.length).toBe(2 * (N - 1));
    const at = (x: number, side: number) => list.find((f) => f.side === side && (side === 3 ? f.corner[0] === x : f.corner[0] === x + 1))!;
    for (let x = 0; x < N - 1; x++) {
      const south = at(x, 3);
      const east = at(x, 0);
      // the south side turns out round the tile's corner into its east side
      expect(south.ends[1]).toBe(END.outward);
      expect(east.ends[0]).toBe(END.outward);
      expectSame(edge(south.raw, 1), edge(east.raw, 0));
      if (x + 1 < N - 1) {
        // and the east side turns in at the step, into the next tile's south side
        const next = at(x + 1, 3);
        expect(east.ends[1]).toBe(END.inward);
        expect(next.ends[0]).toBe(END.inward);
        expectSame(edge(east.raw, 1, END.inwardMost), edge(next.raw, 0, END.inwardMost));
        // one end runs on as far as the other stops short: each side keeps its width, a tile, as
        // the sheet moves out
        for (let k = 0; k <= 10; k++) {
          const w = k / 10;
          const [out] = arcPoint(east.reach[0], east.top[0], east.land[0], east.thickness[0], w);
          if (out > END.inwardMost || Math.abs(east.reach[0] - east.reach[1]) > 1e-9) continue;
          const p0 = fallPoint(east.raw, 0, w);
          const p1 = fallPoint(east.raw, 1, w);
          expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])).toBeCloseTo(1, 6);
        }
      }
    }
  });
});

describe("whitewater where a fall lands (D215)", () => {
  it("stays in its pool: the splash out past the impact line but not past its room, the crown on the pool, never behind the cliff nor most of the drop tall", () => {
    for (const room of [1, 2, 3])
      for (const drop of [0.35, 1, 2, 5, 11])
        for (const flow of [0.01, 0.05, 0.2, 0.8, 1.8, 6]) {
          const reach = fallReach(flow, drop, Math.min(room, 2));
          const w = fallSplash(flow, drop, reach, room);
          expect(w.back).toBeGreaterThan(0);
          expect(w.out).toBeLessThanOrEqual(room - FALL_SPLASH.edge + 1e-9);
          // (out past the impact line, where the pool has room)
          expect(w.out).toBeGreaterThanOrEqual(Math.min(reach + 0.1, room - FALL_SPLASH.edge) - 1e-9);
          expect(reach - w.behind).toBeGreaterThanOrEqual(w.back - 1e-9);
          // (a fall at the edge of its room: nothing ahead)
          expect(reach + w.ahead).toBeLessThanOrEqual(Math.max(reach, room - FALL_SPLASH.edge) + 1e-9);
          expect(w.tall).toBeLessThanOrEqual(FALL_SPLASH.crownOfDrop * drop + 1e-9);
          expect(w.tall).toBeGreaterThan(0);
        }
  });

  it("is more for stronger and taller falls, and more than the first round's (#53 before D215)", () => {
    for (const drop of [1, 3, 6]) {
      const flows = [0.02, 0.1, 0.4, 1, 2];
      const crown = flows.map((q) => fallSplash(q, drop, 0.5, 3).tall);
      for (let k = 1; k < crown.length; k++) expect(crown[k]).toBeGreaterThanOrEqual(crown[k - 1]);
    }
    for (const flow of [0.1, 0.8]) expect(fallSplash(flow, 6, 0.5, 3).spread).toBeGreaterThan(fallSplash(flow, 1, 0.5, 3).spread);
    for (const room of [1, 2, 3])
      for (const drop of [1, 3, 8])
        for (const flow of [0.05, 0.5, 1.8]) {
          const reach = fallReach(flow, drop, Math.min(room, 2));
          // the first round: 0.3 + 0.2 √flow + 0.05 · (the drop, to 6) out past the impact line, a
          // third of that back toward the cliff, within a room of at most 2 tiles
          const was = 0.3 + 0.2 * Math.sqrt(flow) + 0.05 * Math.min(drop, 6);
          const wasOut = Math.min(Math.min(room, 2) - 0.06, reach + was);
          const wasBack = Math.max(0.03, reach - 0.3 * was);
          const w = fallSplash(flow, drop, reach, room);
          expect(w.out).toBeGreaterThanOrEqual(wasOut);
          expect(w.out - w.back).toBeGreaterThan(wasOut - wasBack);
        }
  });
});

describe("a fall's colours", () => {
  const t = () => new DataTexture(new Uint8Array(4), 1, 1);

  it("come from the shared water palette only, in the Standard look and the Light look", () => {
    for (const lite of [false, true]) {
      const m = fallMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), lite);
      expect(m.fragmentShader).toContain(WATER_GLSL);
      // no colour of its own: every vec3 with numbers comes from the palette's GLSL
      const own = m.fragmentShader.replace(WATER_GLSL, "");
      const body = own.slice(own.indexOf("void main()", own.indexOf("vec3 finish(")));
      expect(body).not.toMatch(/vec3\(\s*-?\d/);
      for (const use of ["waterBlend(WATER_SHALLOW, badwaterBody(0.25), cont)", "mix(WATER_FOAM, BADWATER_FOAM, bad)", "badwaterShade(BADWATER_STREAK, 0.25)", "waterMurk(cont)"]) expect(m.fragmentShader).toContain(use);
      expect(m.transparent).toBe(true);
      expect(m.depthWrite).toBe(false);
    }
  });

  it("turn see-through with clear water (T, or round the brush), and a fall is cut at the slice, as the water is", () => {
    for (const lite of [false, true]) {
      const m = fallMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), lite);
      for (const use of ["clearWater", "clearAround", "CLEAR_FADE", "CLEAR_FALL", "CLEAR_BAD_OPACITY", "CLEAR_STRIPE"]) expect(m.fragmentShader).toContain(use);
      expect(m.fragmentShader).toMatch(/if \(vWorld\.y > slice \+ 0\.05\) discard;/);
    }
    // a clean fall keeps a faint veil, from the shared palette
    expect(WATER_GLSL).toContain(`#define CLEAR_FALL ${CLEAR_WATER.fall}`);
    expect(CLEAR_WATER.fall).toBeGreaterThan(0.1);
    expect(CLEAR_WATER.fall).toBeLessThan(0.5);
  });

  it("keep a badwater fall apart from a clean one in greyscale and with colour blindness", () => {
    // (the Machado, Oliveira and Fernandes 2009 simulations, severity 1, in linear light, as the
    // captures use; lightness as CIE L*)
    const sims: Record<string, number[]> = {
      none: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
      protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
      tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
    };
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lstar = (c: Rgb, m: number[]) => {
      const l = c.map(lin);
      const s = [0, 1, 2].map((r) => Math.max(0, m[r * 3] * l[0] + m[r * 3 + 1] * l[1] + m[r * 3 + 2] * l[2]));
      const y = 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
      return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
    };
    for (const m of Object.values(sims)) {
      // the body (clean water's light shallows against badwater's crimson) and the foam
      expect(lstar(WATER.shallow, m) - lstar(WATER.bad, m)).toBeGreaterThan(20);
      expect(lstar(WATER.foam, m) - lstar(WATER.badFoam, m)).toBeGreaterThan(15);
    }
  });
});

describe("the fall template", () => {
  // (D148: since D215 it also holds the crown of whitewater, 16 vertices more: the bound on its
  // vertices went from 130 to 140)
  it("is small and shared: a close-up ribbon with thickness and ends, a sheet from afar, a splash and a crown", () => {
    const { rib, index } = fallTemplate();
    const kinds = new Map<number, number>();
    for (let v = 0; v < rib.length / 4; v++) kinds.set(rib[v * 4 + 3], (kinds.get(rib[v * 4 + 3]) ?? 0) + 1);
    expect([...kinds.keys()].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    // the inner and outer faces (close up), the far sheet and the crown, each spanning the lip from
    // the brink (w = 0) to the pool (w = 1), or round the crown from its foot to its foot
    for (const kind of [0, 3, 5]) {
      const ws = [];
      for (let v = 0; v < rib.length / 4; v++) if (rib[v * 4 + 3] === kind) ws.push(rib[v * 4 + 1]);
      expect(Math.min(...ws)).toBe(0);
      expect(Math.max(...ws)).toBe(1);
    }
    expect(index.length / 3).toBeLessThan(120);
    expect(rib.length / 4).toBeLessThan(140);
    for (const i of index) expect(i).toBeLessThan(rib.length / 4);
  });
});
