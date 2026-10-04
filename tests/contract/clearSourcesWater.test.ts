// Item 15 (D322): a stroke that clears sources takes their water with them, at once and exactly as
// deleting a source does (D260). The stroke's own water (D197) ran on the old sources while it was
// painted; once the stroke and its clearing are applied, that water goes with its cause.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const SRC = "d3220000-0000-4000-8000-000000000015";

/** (the worker's loop yields through a message channel: wait by polling, not on a timer) */
async function wait(ms: number) {
  const until = performance.now() + ms;
  while (performance.now() < until) await new Promise((r) => setImmediate(r));
}

describe("Clear sources and the water (item 15)", () => {
  it("a Flatten stroke clearing a source: the stroke's water stops and the pit it filled drains", async () => {
    // (seed 1 on M9b's maps, D148: seed 3 has no dry flat spot 9 tiles from any water;
    // seed 8 for 0.8.1's maps, D148: badwater ditches now follow the land and seeds 1 to 7 have no such spot)
    await runGenerate(makeSpec({ seed: 8, theme: "riverValley", size: { x: W, y: W } }));
    ed.refine();
    const open = () => MapSession.open(decodeProject(ed.project().bytes));
    const b = open().built;
    // dry, flat ground far from any water
    let at: [number, number, number] | null = null;
    for (let y = 12; y < W - 12 && !at; y++)
      for (let x = 12; x < W - 12 && !at; x++) {
        const h0 = b.heights[y * W + x];
        if (h0 < 5) continue;
        let ok = true;
        for (let yy = y - 9; yy <= y + 9 && ok; yy++) for (let xx = x - 9; xx <= x + 9 && ok; xx++) if (b.water[yy * W + xx] > 0 || b.channel[yy * W + xx]) ok = false;
        for (let yy = y - 4; yy <= y + 4 && ok; yy++) for (let xx = x - 4; xx <= x + 4 && ok; xx++) if (b.heights[yy * W + xx] !== h0) ok = false;
        if (ok && b.entities.some((e) => Math.abs(e.x - x) <= 5 && Math.abs(e.y - y) <= 5)) ok = false;
        if (ok) at = [x, y, h0];
      }
    expect(at).not.toBeNull();
    const [x, y, h0] = at!;
    expect(ed.apply({ op: "placeEntity", params: { id: SRC, template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } } }).errors).toEqual([]);
    ed.settleWater();

    // a Flatten two levels down round the source: a pit
    const dabs: number[] = [];
    for (let k = 0; k < 8; k++) dabs.push(4 * x + 2, 4 * y + 2);
    const op: EditOp = { op: "brush", params: { tool: "flatten", target: h0 - 2, size: 4, strength: 10, dabs } };
    const shown = MapSession.open(decodeProject(ed.project().bytes));
    expect(shown.apply(op).errors).toEqual([]);
    const pit: number[] = [];
    for (let i = 0; i < W * W; i++) if (shown.built.heights[i] < b.heights[i]) pit.push(i);
    expect(pit.length).toBeGreaterThan(20);
    // the page paints it: the stroke's water runs on the source into the pit
    const rect = { x0: x - 5, y0: y - 5, x1: x + 5, y1: y + 5 };
    const ground = new Uint8Array(11 * 11);
    for (let yy = rect.y0; yy <= rect.y1; yy++) for (let xx = rect.x0; xx <= rect.x1; xx++) ground[(yy - rect.y0) * 11 + xx - rect.x0] = shown.built.heights[yy * W + xx];
    let drafts = 0;
    ed.listen((e) => {
      if (e.kind === "water" && e.draft) drafts++;
    });
    ed.draftStroke(rect, ground);
    await wait(1500);
    expect(drafts).toBeGreaterThan(0);

    // let go with Clear sources on: the stroke and the source, one step
    const u = ed.strokeClearing(op, "Flatten", [y * W + x]);
    expect(u.ok).toBe(true);
    expect(u.view.entities).toBeDefined();
    const drawn = u.view.entities!;
    let still = false;
    for (let k = 0; k < drawn.count; k++) if (drawn.templates[drawn.template[k]] === "WaterSource" && drawn.x[k] === x && drawn.y[k] === y) still = true;
    expect(still).toBe(false);
    drafts = 0;
    await wait(600);
    ed.listen(null);
    // the stroke's water stopped with it
    expect(drafts).toBe(0);
    // and the pit the source was filling drains: no water stands there once the water settles
    ed.settleWater();
    const water = ed.sessionView().view.water;
    const inPit = new Set(pit);
    let left = 0;
    for (let k = 0; k < water.count; k++) if (inPit.has(water.tile[k])) left += water.depth[k];
    expect(left).toBeLessThan(0.05);
  }, 120_000);
});
