// Water per column in the water mesh workers (3D view, part 4): on a map with water under a roof, a frame of moving
// water is dealt and meshed in the workers; a change of land after it (a stroke beside a cave's pool) that leaves the
// water as it is still has the pool's chunk drawn again on the new land, never left on the old one.

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test.use({ storageState: { cookies: [], origins: [] } });

test("a cave's pool is drawn again on the new land after a stroke beside it, when the workers last drew it on the old", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const out = await page.evaluate(async () => {
    type R = import("../../src/render3d").MapRenderer;
    const shown = window.dgm3d!.renderer;
    const Make = shown.constructor as new (c: HTMLCanvasElement) => R;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:640px;height:480px;opacity:0;pointer-events:none";
    const c = document.createElement("canvas");
    c.style.cssText = "width:100%;height:100%;display:block";
    host.append(c);
    document.body.append(host);
    const r = new Make(c);
    r.setLookChoice("standard", false);
    // 12² of ground at level 6, a 3 × 3 block with a cave (rock 0–1, air 2–4, a roof 5–7) and a pool on its floor
    const W = 12;
    const heights = new Uint8Array(W * W).fill(6);
    const tiles: number[] = [];
    for (let y = 4; y < 7; y++) for (let x = 4; x < 7; x++) tiles.push(y * W + x);
    const voxels = new Uint8Array(tiles.length * 23);
    tiles.forEach((i, k) => {
      heights[i] = 8;
      for (const z of [0, 1, 5, 6, 7]) voxels[k * 23 + z] = 1;
    });
    const pool = (d: number) => ({ count: tiles.length, tile: Int32Array.from(tiles), floor: Float32Array.from(tiles, () => 2), depth: Float32Array.from(tiles, () => d), contamination: new Float32Array(tiles.length) });
    const entities = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0), strength: new Float32Array(0), ids: [] };
    r.setMap({ W, H: W, heights, columns: { tiles: Int32Array.from(tiles), voxels }, water: pool(0.8), entities } as unknown as Parameters<R["setMap"]>[0]);
    type Mesh = { geometry: { drawRange: { count: number } } };
    const internals = r as unknown as { waterQueue: Set<string>; waterReady: object | null; mesherOwn: { busy: boolean; working: boolean } | null; drawnWater: Map<string, number>; water: Map<string, Mesh> };
    const settle = async () => {
      for (let k = 0; k < 200; k++) {
        r.renderNow();
        if (!internals.waterQueue.size && !internals.waterReady && !internals.mesherOwn?.busy) return;
        await new Promise((ok) => setTimeout(ok, 20));
      }
    };
    // a frame of moving water: dealt and meshed in the workers
    r.updateWaterSoon(pool(0.9) as unknown as Parameters<R["updateWaterSoon"]>[0]);
    await settle();
    const workers = !!internals.mesherOwn?.working;
    const before = { version: internals.drawnWater.get("0,0") ?? -1, indices: internals.water.get("0,0")?.geometry.drawRange.count ?? 0 };
    // a stroke beside the cave, west of its pool: the tile at (3, 5) lowered from 6 to 2, the cave's floor level, so the
    // pool, which met rock there, now meets open ground at its own level; its water unchanged
    const lowered = heights.slice();
    lowered[5 * W + 3] = 2;
    r.updateTerrain(lowered);
    await settle();
    const after = { version: internals.drawnWater.get("0,0") ?? -1, indices: internals.water.get("0,0")?.geometry.drawRange.count ?? 0 };
    r.dispose();
    host.remove();
    return { workers, before, after };
  });
  expect(out.workers, "the water mesh workers ran").toBe(true);
  expect(out.after.version, "the pool's chunk drawn again").toBeGreaterThan(out.before.version);
  expect(out.after.indices, "on the new land: the pool's side down to the lowered ground").toBeGreaterThan(out.before.indices);
  expect(errors).toEqual([]);
});
