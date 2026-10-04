// The renderer warms while the first map loads (PLAN §20 D367, part 1): a renderer made ready with
// `prepareFirstFrame` draws a real map's first frame without compiling a single new program, in the
// High look and in Standard, and that frame is exactly the frame a renderer made cold draws: nothing of
// the warm-up's small map stays. (Software drawing on CI is treated as a GPU, as look-high.spec does,
// so the High look's programs are warmed and checked there too.)

import { expect, test } from "@playwright/test";

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
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });
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

// TEMPORARY DIAGNOSTICS (removed before merge)
test("DIAG which draw varies", async ({ page }) => {
  test.setTimeout(1_200_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });
  const out = await page.evaluate(async () => {
    type R = import("../../src/render3d").MapRenderer;
    type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const log: Record<string, unknown> = {};
    const shown = window.dgm3d!.renderer;
    const m = (shown as unknown as Any).map;
    const view = { W: m.W, H: m.H, heights: m.heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water: m.water, entities: m.entities, soil: m.soil ?? undefined } as Parameters<R["setMap"]>[0];
    const Make = shown.constructor as new (c: HTMLCanvasElement) => R;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:640px;height:480px;opacity:0;pointer-events:none";
    const c = document.createElement("canvas");
    c.style.cssText = "width:100%;height:100%;display:block";
    host.append(c);
    document.body.append(host);
    const r = new Make(c);
    r.setLookChoice("high", false);
    r.setMap(view);
    const R_ = r as Any;
    const frame = () => {
      r.setClock(12.5);
      r.resetView();
      r.renderNow();
      const g = R_.gl.getContext() as WebGL2RenderingContext;
      const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
      g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
      return px;
    };
    const W = 640;
    /** Draw n times: each pixel channel's spread, its worst and where. */
    const spread = (n = 6) => {
      const lo = frame().slice();
      const hi = lo.slice();
      for (let k = 1; k < n; k++) {
        const f = frame();
        for (let i = 0; i < f.length; i++) { if (f[i] < lo[i]) lo[i] = f[i]; if (f[i] > hi[i]) hi[i] = f[i]; }
      }
      let most = 0, at = -1, n3 = 0;
      const spots: string[] = [];
      for (let i = 0; i < lo.length; i++) { const d = hi[i] - lo[i]; if (d > most) { most = d; at = i; } if (d > 3) { n3++; const p = i >> 2; if (spots.length < 12) spots.push(`${p % W},${Math.floor(p / W)}:${d}`); } }
      const p = at >> 2;
      return { most, at: [p % W, Math.floor(p / W)], n3, spots };
    };
    const s0 = spread(8);
    log.spread = s0;
    const [px, pyb] = s0.at;
    const py = 480 - 1 - pyb;
    const rect = c.getBoundingClientRect();
    r.rayAt(rect.left + px + 0.5, rect.top + py + 0.5);
    const hits: Any[] = [];
    R_.scene.traverse((o: Any) => { if (!(o.isMesh || o.isPoints || o.isLine)) return; try { hits.push(...R_.raycaster.intersectObject(o, false)); } catch { /* */ } });
    hits.sort((a, b) => a.distance - b.distance);
    log.hits = hits.slice(0, 12).map((h) => ({ name: h.object.name, type: h.object.type, mat: h.object.material?.type, vis: h.object.visible, d: +h.distance.toFixed(2), p: [h.point.x, h.point.y, h.point.z].map((v: number) => +v.toFixed(2)), n: h.face ? [h.face.normal.x, h.face.normal.y, h.face.normal.z].map((v: number) => +v.toFixed(2)) : null, inst: h.instanceId }));
    const all: Any[] = [];
    R_.scene.traverse((o: Any) => { if ((o.isMesh || o.isPoints || o.isLine) && o.visible) all.push(o); });
    log.objects = all.length;
    const isolate = (keep: Any) => { for (const o of all) o.visible = o === keep; };
    const restore = () => { for (const o of all) o.visible = true; };
    const res: string[] = [];
    let culprit: Any = null;
    for (const o of all) {
      isolate(o);
      const s = spread(5);
      if (s.most > 1) { res.push(`${o.name || o.type}#${all.indexOf(o)} ${o.material?.type}: ${s.most}@${s.at} n3=${s.n3}`); if (!culprit) culprit = o; }
    }
    restore();
    log.isolated = res;
    if (culprit) {
      isolate(culprit);
      const eff: Record<string, string> = {};
      for (const k of Object.keys(r.highEffects)) {
        r.setHighEffect(k as Any, false);
        const s = spread(6);
        eff[k] = `${s.most} n3=${s.n3}`;
        r.setHighEffect(k as Any, true);
      }
      log.culpritEffects = eff;
      const g = culprit.geometry;
      log.culprit = { name: culprit.name, attrs: Object.keys(g.attributes), count: g.attributes.position?.count, index: g.index?.count, bbox: (g.computeBoundingBox(), [g.boundingBox.min, g.boundingBox.max].map((v: Any) => [v.x, v.y, v.z].map((x: number) => +x.toFixed(2)))), transparent: culprit.material?.transparent, depthWrite: culprit.material?.depthWrite, side: culprit.material?.side, renderOrder: culprit.renderOrder };
      restore();
    }
    r.dispose();
    return log;
  });
  console.log("DIAG " + JSON.stringify(out));
});
