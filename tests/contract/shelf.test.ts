// The left shelf and Remove in the editor's worker (PLAN §20 D184): trees painted by a drag are
// planted where they can grow, as one step that undoes and replays; Remove takes what its filters
// name on the tiles, never the start, never the ground; the start moves and turns in one step; an
// object placed by hand makes its checks the edit's own.

import { describe, expect, it } from "vitest";
import { removeKindOf } from "../../src/core/features/objects";
import { footprintTiles, type Orientation } from "../../src/core/format/footprints";
import { ORIENTATION_NAMES } from "../../src/render3d/model";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { paintTiles } from "../../src/editor/shelfItems";

const W = 96;

/** Open ground: level, dry tiles with nothing on them round (x, y), away from the start. */
function openSpot(r: number): [number, number] {
  const v = ed.sessionView();
  const info = ed.sessionView().info;
  const start = (info.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const e = v.view.entities;
  // every object's footprint
  const taken = new Uint8Array(W * W);
  for (let k = 0; k < e.count; k++) {
    const template = e.templates[e.template[k]];
    for (const [tx, ty] of footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: false })) if (tx >= 0 && ty >= 0 && tx < W && ty < W) taken[ty * W + tx] = 1;
  }
  const depth = new Float32Array(W * W);
  for (let k = 0; k < v.view.water.count; k++) depth[v.view.water.tile[k]] = v.view.water.depth[k];
  for (let y = r + 2; y < W - r - 2; y++)
    for (let x = r + 2; x < W - r - 2; x++) {
      if (Math.hypot(x - start[0], y - start[1]) < 16) continue;
      const h0 = v.view.heights[y * W + x];
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r && ok; dx++) if (v.view.heights[(y + dy) * W + x + dx] !== h0 || depth[(y + dy) * W + x + dx] > 0 || taken[(y + dy) * W + x + dx]) ok = false;
      if (ok) return [x, y];
    }
  throw new Error("no open ground");
}

const pines = (x: number, y: number, r: number) => {
  const e = ed.sessionView().view.entities;
  let n = 0;
  for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "Pine" && Math.abs(e.x[k] - x) <= r && Math.abs(e.y[k] - y) <= r) n++;
  return n;
};

describe("the shelf and Remove in the worker (D184)", () => {
  it("a painted grove plants where trees grow, one step; Remove takes it by its filters; the ground and the start stay", async () => {
    await runGenerate(makeSpec({ seed: 4242, theme: "riverValley", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const [x, y] = openSpot(4);
    // the drag's tiles: dense in the middle, ragged at the edge, the same for the same seed
    const tiles = [...new Set([...paintTiles(x - 2, y, 2, 0.8, 7, W, W), ...paintTiles(x + 2, y, 2, 0.8, 7, W, W)])];
    expect(paintTiles(x - 2, y, 2, 0.8, 7, W, W)).toEqual(paintTiles(x - 2, y, 2, 0.8, 7, W, W));
    expect(tiles.length).toBeGreaterThan(8);
    const heights = ed.sessionView().view.heights.slice();
    const u = ed.plantAt("Pine", tiles);
    expect(u.ok).toBe(true);
    expect(u.planted.length).toBe(tiles.length);
    expect(pines(x, y, 5)).toBe(tiles.length);
    const info = ed.sessionView().info;
    expect(info.history.at(-1)!.label).toBe(`Plant ${tiles.length} pines`);
    // nothing grows where something stands already, or under water
    expect(ed.plantAt("Pine", tiles).ok).toBe(false);
    // one step: undo takes the grove, redo brings it back
    ed.undo();
    expect(pines(x, y, 5)).toBe(0);
    ed.redo();
    expect(pines(x, y, 5)).toBe(tiles.length);

    // Remove: bushes only takes no tree; trees takes them all, as one step; the ground stays
    const box: number[] = [];
    for (let yy = y - 5; yy <= y + 5; yy++) for (let xx = x - 5; xx <= x + 5; xx++) box.push(yy * W + xx);
    expect(ed.removeAt(box, ["bushes"]).ok).toBe(false);
    const r = ed.removeAt(box, ["trees"]);
    expect(r.ok).toBe(true);
    expect(r.removed.length).toBe(tiles.length);
    expect(ed.sessionView().info.history.at(-1)!.label).toBe(`Remove ${tiles.length} trees`);
    expect(pines(x, y, 5)).toBe(0);
    expect(Array.from(ed.sessionView().view.heights)).toEqual(Array.from(heights));

    // the start stays, whatever the filters
    const start = (ed.sessionView().info.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
    const at = [start[1] * W + start[0]];
    const kept = ed.removeAt(at, ["trees", "bushes", "ruins", "objects", "slopes", "sources"]);
    expect(kept.ok).toBe(false);
    expect(kept.errors[0]).toMatch(/the start stays/);
    expect(removeKindOf("StartingLocation")).toBeNull();
    expect(removeKindOf("RuinColumnH5")).toBe("ruins");
    expect(removeKindOf("BlueberryBush")).toBe("bushes");
    expect(removeKindOf("MediumRelic")).toBe("objects");
  });

  it("the start moves and turns in one step; an object on its door is the edit's problem, with the move as its fix", async () => {
    await runGenerate(makeSpec({ seed: 77, theme: "riverValley", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const f = ed.sessionView().info.features.find((g) => g.kind === "start")!;
    const p = f.params as { position: [number, number]; orientation: string };
    const turned = p.orientation === "Cw0" ? "Cw90" : "Cw0";
    const u = ed.moveStartTo(p.position[0], p.position[1], turned);
    expect(u.ok).toBe(true);
    const now = ed.sessionView().info;
    expect(now.history.at(-1)!.label).toBe("Turn the start");
    expect((now.features.find((g) => g.kind === "start")!.params as { orientation: string }).orientation).toBe(turned);
    // thorns on the door: the start's entrance check fails, it belongs to the edit, and it offers
    // the move
    expect(ed.instantCheck().items.filter((c) => c.here && c.class === "load")).toEqual([]);
    const probe = ed.apply({ op: "placeEntity", params: { id: "7a1b2c3d-3333-4333-8333-444455556666", template: "Thorns", ...doorOf(p.position, turned), orientation: "Cw0" } });
    expect(probe.ok).toBe(true);
    const items = ed.instantCheck().items.filter((c) => c.here && c.class === "load");
    expect(items.map((c) => c.id)).toContain("start.entrance");
    expect(items.find((c) => c.id === "start.entrance")!.fix?.[0]?.label).toBe("Move the start to the nearest good spot");
  });
});

/** The tile in front of a start's door at centre (x, y). */
function doorOf([x, y]: [number, number], o: string): { x: number; y: number } {
  // (the district center's door: its footprint's front, a tile out; Cw0 faces south)
  switch (o) {
    case "Cw0":
      return { x, y: y - 2 };
    case "Cw90":
      return { x: x - 2, y };
    case "Cw180":
      return { x, y: y + 2 };
    default:
      return { x: x + 2, y };
  }
}
