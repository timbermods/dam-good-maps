// The current of water under water (3D view, part 4's limit, now built): a river in a tunnel under a trench on the
// hill's top that flows the other way. The view's outflows are each column's own (the file's per column for an unedited
// import, the stacked settle's after an edit: sim/stackWater.ts `columnFlows`), so the tunnel's water moves east by its
// own outflows in the cave current's volume (caveCurrent.ts) while the trench above it moves west in the flow texture,
// and the tunnel's fall pours its own column's outflow, not an estimate from its depth.

import { describe, expect, it } from "vitest";
import { writeTimber, type TimberFile } from "../../src/core/format/timber";
import { entityJson, waterSource } from "../../src/core/format/entities";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
import { canonicalStackRun } from "../../src/core/sim/stackWater";
import { caveCurrentCell } from "../../src/render3d/caveCurrent";
import { outflowGrid } from "../../src/render3d/current";
import { FALL_STRIDE } from "../../src/render3d/falls";
import { runBake } from "../../src/render3d/high/bake";
import { chunkCount } from "../../src/render3d/mesh";
import { columnMap, surfaceWater, type MapView, type WaterView } from "../../src/render3d/model";
import { meshWaterChunk } from "../../src/render3d/waterMesh";
import { waterLayers } from "../../src/render3d/waterLayers";
import { apply, collabSession, openTimber, settleWater } from "../../src/worker/session";

const W = 32;
const H = 12;
const N = W * H;
/** The tunnel's rows, its floor (4 west of x 16, then 3: a step where it falls) and roof (6); the trench above it, its
 *  floor at 7, from the west edge to x 27. */
const ROWS = [5, 6];
const TUNNEL_X0 = 4;
const tunnelFloor = (x: number) => (x < 16 ? 4 : 3);
const TRENCH_X1 = 27;

function voxels(): Uint8Array {
  const v = voxelsFromHeights(new Uint8Array(N).fill(8), W, H);
  for (const y of ROWS) {
    for (let x = TUNNEL_X0; x < W; x++) for (let z = tunnelFloor(x); z < 6; z++) v[z * N + y * W + x] = 0;
    for (let x = 0; x <= TRENCH_X1; x++) v[7 * N + y * W + x] = 0;
  }
  return v;
}

/** The file: with the water stored (the tunnel's flowing east at `east`, the trench's west at `west`, each column's own
 *  outflows), or dry with a source at each one's head. */
function file(stored: { east: number; west: number } | null): Uint8Array {
  const levels = 2;
  const singletons = emptySimulationSingletons(W, H, levels);
  const entities = [];
  if (stored) {
    const cols = new Array(levels * N).fill("0");
    const flows = new Array(levels * N).fill("0");
    for (const y of ROWS)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const tunnel = x >= TUNNEL_X0;
        if (tunnel) {
          const d = x < 16 ? 0.5 : 0.6;
          cols[i] = `${d}:0:0:${tunnelFloor(x)}:${d}`;
          flows[i] = `0:0:0:${i + 1}|${stored.east}`;
        }
        if (x <= TRENCH_X1) {
          const k = (tunnel ? N : 0) + i;
          cols[k] = `0.5:0:0:7:0.5`;
          flows[k] = `0:${i - 1}|${stored.west}:0:0`;
        }
      }
    (singletons.WaterMapNew as Record<string, unknown>).WaterColumns = { Array: cols.join(" ") };
    (singletons.WaterMapNew as Record<string, unknown>).ColumnOutflows = { Array: flows.join(" ") };
  } else {
    let n = 0;
    const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    for (const y of ROWS) {
      entities.push(entityJson(waterSource({ id: id(), owner: "import", x: TUNNEL_X0, y, z: tunnelFloor(TUNNEL_X0), strength: 0.5 })));
      entities.push(entityJson(waterSource({ id: id(), owner: "import", x: TRENCH_X1, y, z: 7, strength: 0.5 })));
    }
  }
  const f: TimberFile = {
    metadata: {},
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-10-25 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: voxels(), singletons, entities },
    extraFiles: [],
  };
  return writeTimber(f);
}

const at = (view: WaterView, x: number, y: number, floor: number) => [...view.tile].findIndex((t, k) => t === y * W + x && view.floor[k] === floor);
const flowOf = (view: WaterView, k: number) => [...view.outflow!.subarray(k * 4, k * 4 + 4)];

/** The water's bake as the renderer asks for it with water per column (motion.ts), and the cave current's volume. */
function bake(v: MapView) {
  const sw = surfaceWater(W, H, v.water);
  const r = runBake({ id: 1, kind: "flow", W, H, heights: v.heights, sw: { ...sw, outflow: null, lower: [] }, out: outflowGrid(W, H, sw), layered: { view: v.water, columns: { ...v.columns, key: 1 } } });
  if (r.kind !== "flow") throw new Error("not a flow bake");
  return r;
}

describe("water under water flows by its own column (3D view, part 4)", () => {
  it("an unedited import: every column's outflows its own, the tunnel's current east under the trench's west, its fall its own outflow", () => {
    const v = openTimber(file({ east: 0.4, west: 0.3 }), "tunnel.timber").view;
    // the view: each column its own outflows (the file's per column), never its roof's
    for (const y of ROWS)
      for (let x = TUNNEL_X0; x <= TRENCH_X1; x++) {
        expect(flowOf(v.water, at(v.water, x, y, tunnelFloor(x))), `tunnel ${x},${y}`).toEqual([0, 0, 0, Math.fround(0.4)]);
        expect(flowOf(v.water, at(v.water, x, y, 7)), `trench ${x},${y}`).toEqual([0, Math.fround(0.3), 0, 0]);
      }
    // the bake: the flow texture holds the trench's current (west), the volume the tunnel's own (east) at its level
    const r = bake(v);
    expect(r.cave, "a volume where water stands under water").not.toBeNull();
    const cave = r.cave!;
    for (const x of [8, 12, 20, 24]) {
      const i = 5 * W + x;
      expect(r.flow[i * 4], `the flow texture at ${x}: west`).toBeLessThan(128);
      const surface = tunnelFloor(x) + (x < 16 ? 0.5 : 0.6);
      const c = caveCurrentCell(W, H, cave, x + 0.5, 5.5, surface - 0.005);
      expect(cave.data[c * 4 + 3], `the tunnel at ${x}: its own`).toBe(255);
      expect(cave.data[c * 4], `the tunnel at ${x}: east`).toBeGreaterThan(128);
      expect(Math.abs(cave.data[c * 4 + 1] - 128)).toBeLessThanOrEqual(1);
      // the trench's own level holds the flow texture's value, not marked as the volume's own
      const t = caveCurrentCell(W, H, cave, x + 0.5, 5.5, 7.495);
      if (t >= 0) expect(cave.data[t * 4 + 3]).toBe(0);
    }
    // the tunnel's fall at its step (x 15 → 16) pours its column's own outflow
    const sw = surfaceWater(W, H, v.water);
    const layers = waterLayers(W, H, v.heights, columnMap(v.columns), v.water, sw);
    const { nx, ny } = chunkCount(W, H);
    const flows: number[] = [];
    for (let cy = 0; cy < ny; cy++)
      for (let cx = 0; cx < nx; cx++) {
        const m = meshWaterChunk(W, H, layers, cx, cy);
        for (let k = 0; k < m.fallCount; k++) {
          const f = m.falls.subarray(k * FALL_STRIDE, (k + 1) * FALL_STRIDE);
          if ((f[2] & 3) === 0 && f[0] === 16) flows.push(f[3], f[15]);
        }
      }
    expect(flows.length, "the tunnel's fall").toBeGreaterThan(0);
    for (const f of flows) expect(f).toBeCloseTo(0.4, 5);
  });

  it("an edited map: the stacked settle's outflows on every column, the tunnel's east and the trench's west", () => {
    const opened = openTimber(file(null), "tunnel.timber").view;
    // an edit off the water, then the canonical settle on every column (D120)
    const u = apply({ op: "brush", params: { tool: "raise", size: 1, strength: 5, shape: "area", target: 10, dabs: [28, 1, 29, 2] } } as Parameters<typeof apply>[0]);
    expect(u.errors).toEqual([]);
    const after = settleWater() as Partial<MapView>;
    const water = after.water!;
    const st = collabSession()!.built.settle.stack!;
    expect(st.flows, "the settle's outflows per column").toBeDefined();
    expect(water.outflow, "the view's").toBeDefined();
    for (const x of [8, 12, 20]) {
      const i = 5 * W + x;
      const tunnel = at(water, x, 5, tunnelFloor(x));
      const trench = at(water, x, 5, 7);
      expect(tunnel).toBeGreaterThanOrEqual(0);
      expect(trench).toBeGreaterThanOrEqual(0);
      const [, tw, , te] = flowOf(water, tunnel);
      const [, rw, , re] = flowOf(water, trench);
      expect(te, `tunnel ${x} east`).toBeGreaterThan(tw + 0.01);
      expect(rw, `trench ${x} west`).toBeGreaterThan(re + 0.01);
      // the view's are the settle's own, column by column
      const slot = (q: number) => q * N + i;
      expect(flowOf(water, tunnel)).toEqual([...st.flows!.subarray(slot(0) * 4, slot(0) * 4 + 4)]);
      expect(flowOf(water, trench)).toEqual([...st.flows!.subarray(slot(1) * 4, slot(1) * 4 + 4)]);
    }
    // and the current as drawn: east in the tunnel, west on the trench
    const r = bake({ W, H, heights: after.heights ?? collabSession()!.built.heights, columns: opened.columns, water } as MapView);
    const c = caveCurrentCell(W, H, r.cave!, 10.5, 5.5, tunnelFloor(10) + water.depth[at(water, 10, 5, tunnelFloor(10))] - 0.005);
    expect(r.cave!.data[c * 4 + 3]).toBe(255);
    expect(r.cave!.data[c * 4]).toBeGreaterThan(128);
    expect(r.flow[(5 * W + 10) * 4]).toBeLessThan(128);
  });

  it("the settle's outflows are each column's flows summed by their way (one thread)", () => {
    const v = voxels();
    const mask = new Uint32Array(N);
    for (let i = 0; i < N; i++) for (let z = 0; z < LAYERS; z++) if (v[z * N + i]) mask[i] |= 1 << z;
    const objects: number[] = [];
    for (const y of ROWS) objects.push(7, TUNNEL_X0, y, tunnelFloor(TUNNEL_X0), 0, 0, 0, 0.5, 7, TRENCH_X1, y, 7, 0, 0, 0, 0.5);
    const run = canonicalStackRun(W, H, { mask, objects: Float64Array.from(objects) });
    let s = run.advance(1e6);
    while (!s) s = run.advance(1e6);
    expect(s.flows!.length).toBe(4 * s.L * N);
    const i = 5 * W + 10;
    expect(s.flows![i * 4 + 3]).toBeGreaterThan(0.01);
    expect(s.flows![(N + i) * 4 + 1]).toBeGreaterThan(0.01);
  });
});
