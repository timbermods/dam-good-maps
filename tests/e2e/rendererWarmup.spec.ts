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

// TEMPORARY DIAGNOSTICS (removed before merge): what the bake worker does on CI
test("DIAG bake worker", async ({ page }) => {
  const log: string[] = [];
  page.on("console", (m) => log.push(`page ${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e}`));
  page.on("worker", (w) => {
    log.push(`worker+ ${w.url()}`);
    w.on("console", (m) => log.push(`worker console ${m.type()}: ${m.text()}`));
    w.on("close", () => log.push(`worker- ${w.url()}`));
  });
  await page.addInitScript(() => {
    const W = window.Worker;
    const urls: string[] = [];
    (window as unknown as { dgmWorkerUrls: string[] }).dgmWorkerUrls = urls;
    (window as unknown as { Worker: unknown }).Worker = class extends W {
      constructor(u: string | URL, o?: WorkerOptions) {
        super(u, o);
        urls.push(String(u));
        const t0 = performance.now();
        let sent = 0;
        let got = 0;
        const post = this.postMessage.bind(this) as (m: unknown, t?: Transferable[]) => void;
        (this as unknown as { postMessage: unknown }).postMessage = (m: unknown, t?: Transferable[]) => {
          sent++;
          console.log(`DIAGW post ${String(u).split("/").pop()} #${sent} at ${Math.round(performance.now() - t0)}`);
          post(m, t);
        };
        this.addEventListener("message", () => {
          got++;
          console.log(`DIAGW reply ${String(u).split("/").pop()} #${got} at ${Math.round(performance.now() - t0)}`);
        });
        this.addEventListener("error", (e) => console.log(`DIAGW error ${String(u).split("/").pop()}: ${e.message} @${e.filename}:${e.lineno}:${e.colno}`));
        this.addEventListener("messageerror", () => console.log(`DIAGW messageerror ${String(u)}`));
      }
    };
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, limits: { window: 8, strikes: 2, grace: 400 }, cost: 6 };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });
  const out = await page.evaluate(async () => {
    type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const o: Record<string, unknown> = { ua: navigator.userAgent, cores: navigator.hardwareConcurrency };
    const st = (r: Any) => ({ worker: !!r.bakerOwn?.worker, inFlight: r.bakerOwn?.inFlight?.size, amb: r.high?.ambient?.ready, ambMs: r.high?.ambient?.ms, flow: r.waterMotion?.ready, flowMs: r.waterMotion?.ms, look: r.look });
    const shown = window.dgm3d!.renderer as Any;
    o.shown0 = st(shown);
    await new Promise((r) => setTimeout(r, 3000));
    o.shown3s = st(shown);
    const urls = (window as unknown as { dgmWorkerUrls: string[] }).dgmWorkerUrls;
    o.urls = urls;
    const bakeUrl = urls.find((u) => u.includes("bake"));
    if (bakeUrl) {
      const f = await fetch(bakeUrl);
      const text = await f.text();
      o.fetch = { status: f.status, type: f.headers.get("content-type"), length: text.length, head: text.slice(0, 300) };
      // a fresh worker of the same script, one tiny job
      o.direct = await new Promise((resolve) => {
        const w = new Worker(bakeUrl, { type: "module" });
        const t0 = performance.now();
        const timer = setTimeout(() => resolve({ timeout: true }), 10_000);
        w.onmessage = (e) => { clearTimeout(timer); resolve({ ms: Math.round(performance.now() - t0), kind: e.data.kind, error: e.data.error }); w.terminate(); };
        w.onerror = (e) => { clearTimeout(timer); resolve({ onerror: e.message, file: e.filename, line: e.lineno }); };
        w.postMessage({ id: 1, kind: "ambient", W: 2, H: 2, heights: new Uint8Array(4), canopies: { kind: new Uint8Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0) } });
      });
    }
    // a classic worker from a blob, as a control
    o.blob = await new Promise((resolve) => {
      const w = new Worker(URL.createObjectURL(new Blob(["onmessage = (e) => postMessage(e.data + 1)"], { type: "text/javascript" })));
      const timer = setTimeout(() => resolve({ timeout: true }), 10_000);
      w.onmessage = (e) => { clearTimeout(timer); resolve({ got: e.data }); w.terminate(); };
      w.postMessage(1);
    });
    // a module worker from a blob importing nothing
    o.blobModule = await new Promise((resolve) => {
      const w = new Worker(URL.createObjectURL(new Blob(["self.onmessage = (e) => self.postMessage(e.data + 1)"], { type: "text/javascript" })), { type: "module" });
      const timer = setTimeout(() => resolve({ timeout: true }), 10_000);
      w.onmessage = (e) => { clearTimeout(timer); resolve({ got: e.data }); w.terminate(); };
      w.onerror = (e) => { clearTimeout(timer); resolve({ onerror: e.message }); };
      w.postMessage(1);
    });
    // a renderer made here, as the warm-up test makes them
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:640px;height:480px;opacity:0;pointer-events:none";
    const c = document.createElement("canvas");
    host.append(c);
    document.body.append(host);
    const Make = shown.constructor as new (c: HTMLCanvasElement) => Any;
    const r = new Make(c);
    r.setLookChoice("high", false);
    await r.prepareFirstFrame();
    o.madePrepared = st(r);
    const m = shown.map;
    r.setMap({ W: m.W, H: m.H, heights: m.heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water: m.water, entities: m.entities, soil: m.soil ?? undefined });
    o.madeSet = st(r);
    await new Promise((res) => setTimeout(res, 5000));
    o.made5s = st(r);
    o.shownEnd = st(shown);
    r.dispose();
    host.remove();
    return o;
  });
  console.log("DIAG " + JSON.stringify(out));
  console.log("DIAGLOG\n" + log.filter((l) => !l.includes("GL Driver")).join("\n"));
});
