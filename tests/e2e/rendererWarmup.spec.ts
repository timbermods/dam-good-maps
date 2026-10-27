// The renderer warms while the first map loads (PLAN §20 D367, part 1): a renderer made ready with
// `prepareFirstFrame` draws a real map's first frame without compiling a single new program, in the
// High look and in Standard, and that frame is exactly the frame a renderer made cold draws: nothing of
// the warm-up's small map stays. (Software drawing on CI is treated as a GPU, as look-high.spec does,
// so the High look's programs are warmed and checked there too.)

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, limits: { window: 8, strikes: 2, grace: 400 }, cost: 6 };
  });
});

test("a warmed renderer draws the first map without compiling a program, the same frame as a cold one, in High and Standard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  for (const look of ["high", "standard"] as const) {
    const out = await page.evaluate(async (lk) => {
      type R = import("../../src/render3d").MapRenderer;
      const shown = window.dgm3d!.renderer;
      const m = (shown as unknown as { map: { W: number; H: number; heights: Uint8Array; water: unknown; entities: unknown; soil: unknown } }).map;
      const view = { W: m.W, H: m.H, heights: m.heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water: m.water, entities: m.entities, soil: m.soil ?? undefined } as Parameters<R["setMap"]>[0];
      const Make = shown.constructor as new (c: HTMLCanvasElement) => R;
      /** A renderer on its own canvas, the page's size of view, its look chosen. */
      const make = () => {
        const host = document.createElement("div");
        host.style.cssText = "position:fixed;left:0;top:0;width:640px;height:480px;opacity:0;pointer-events:none";
        const c = document.createElement("canvas");
        c.style.cssText = "width:100%;height:100%;display:block";
        host.append(c);
        document.body.append(host);
        const r = new Make(c);
        r.setLookChoice(lk, false);
        return { r, host };
      };
      /** The programs compiled so far, by their keys. */
      const programs = (r: R) => ((r as unknown as { gl: { info: { programs: { cacheKey: string; name: string }[] | null } } }).gl.info.programs ?? []).map((q) => q.cacheKey);
      const names = (r: R, keys: string[]) => ((r as unknown as { gl: { info: { programs: { cacheKey: string; name: string }[] | null } } }).gl.info.programs ?? []).filter((q) => keys.includes(q.cacheKey)).map((q) => q.name + " | " + q.cacheKey.slice(0, 300));
      const frame = (r: R) => {
        r.setClock(12.5);
        r.resetView();
        r.renderNow();
        const g = (r as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext();
        const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
        g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
        return px;
      };
      // warmed while the map loads, then given the map
      const warm = make();
      await warm.r.prepareFirstFrame();
      const before = programs(warm.r);
      const cueKey = () => {
        let k = "";
        const wr0 = warm.r as unknown as { gl: { properties: { get(m: unknown): { currentProgram?: { cacheKey: string } } } }; scene: { traverse(f: (o: { name: string; material?: unknown }) => void): void } };
        wr0.scene.traverse((o) => { if (o.name === "water.cues") k = wr0.gl.properties.get(o.material).currentProgram?.cacheKey ?? "none"; });
        return k;
      };
      const cueBefore = cueKey();
      warm.r.setMap(view);
      const after = programs(warm.r);
      const fresh = after.filter((k) => !before.includes(k));
      const cueAfter = cueKey();
      const newNames: string[] = [];
      const wr = warm.r as unknown as { gl: { properties: { get(m: unknown): { currentProgram?: { cacheKey: string } } } }; scene: { traverse(f: (o: { name: string; type: string; material?: unknown; parent?: { name: string } }) => void): void } };
      wr.scene.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const mt of mats) {
          const k = wr.gl.properties.get(mt).currentProgram?.cacheKey;
          if (k && fresh.includes(k)) newNames.push(`${o.type} ${o.name} in ${o.parent?.name ?? "?"} ${(mt as { type: string }).type}`);
        }
      });
      const a = frame(warm.r);
      // made cold, given the same map
      const cold = make();
      cold.r.setMap(view);
      const b = frame(cold.r);
      let differ = 0;
      let most = 0;
      for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d) differ++;
        most = Math.max(most, d);
      }
      const drawn = { warm: warm.r.look, cold: cold.r.look };
      for (const x of [warm, cold]) {
        x.r.dispose();
        x.host.remove();
      }
      return { cueBefore, cueAfter, newNames, before: before.length, fresh: after.filter((k) => !before.includes(k)).length, differ, most, size: a.length, drawn };
    }, look);
    expect(out.drawn, look).toEqual({ warm: look, cold: look });
    expect(out.before, look).toBeGreaterThan(0);
    // the real map's first frame compiled nothing the warm-up hadn't
    expect(out.fresh, look).toBe(0);
    // and it is the cold renderer's frame (within a redraw's own few levels)
    expect(out.most, look).toBeLessThanOrEqual(3);
  }
  expect(errors).toEqual([]);
});
