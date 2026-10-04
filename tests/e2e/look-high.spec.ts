// The High look (Map look 2, PLAN §20 D284): on a computer with a GPU it is the default, the look's
// menu switches between it and Standard (remembered), each of its effects switches, the Standard
// look is the same after High as before it, and the automatic choice falls back to Standard when
// frames stay too slow (simulated here), remembering it; contamination's veins and High's water depth
// are checked as drawn (D334). CI draws in software, where the page would
// take the light look: the tests there treat it as a GPU (window.dgmLookTest), so the High shaders
// compile and run on CI too, and they shorten the fallback's waits and report every frame as quick
// (software frames are slow) until a test reports them slow.

import { expect, test, type Page } from "@playwright/test";

// the automatic choice, not the Standard look the other tests hold (playwright.config.ts)
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, limits: { window: 8, strikes: 2, grace: 400 }, cost: 6 };
  });
});

async function open(page: Page, errors: string[]): Promise<void> {
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });
}

const look = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.look);

/** Draw `n` frames now (each counts toward the automatic choice). */
const frames = (page: Page, n: number) =>
  page.evaluate(async (k) => {
    for (let i = 0; i < k; i++) {
      window.dgm3d!.renderer.renderNow();
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, n);

test("High is the default where it can be drawn, and the look's menu switches it, remembered", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  expect(await look(page)).toBe("high");
  const button = page.getByRole("button", { name: "Look: High" });
  await expect(button).toBeVisible();
  await button.click();
  const menu = page.getByRole("group", { name: "Look" });
  await expect(menu).toContainText("Drawing High");
  await menu.getByRole("radio", { name: /^Standard/ }).check();
  expect(await look(page)).toBe("standard");
  await expect(page.getByRole("button", { name: "Look: Standard" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("dgm.look"))).toBe("standard");
  await menu.getByRole("radio", { name: /^High/ }).check();
  expect(await look(page)).toBe("high");
  await menu.getByRole("radio", { name: /^Automatic/ }).check();
  expect(await look(page)).toBe("high");
  expect(await page.evaluate(() => localStorage.getItem("dgm.look"))).toBeNull();
  // a new page keeps the choice
  await menu.getByRole("radio", { name: /^Standard/ }).check();
  await page.reload();
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });
  expect(await look(page)).toBe("standard");
  // (no shader failed to compile, nothing threw)
  expect(errors).toEqual([]);
});

test("each High effect switches (the menu, its parts), and the switches are remembered", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole("button", { name: "Look: High" }).click();
  const menu = page.getByRole("group", { name: "Look" });
  // the menu switches High's four parts (#38's water and soft shadows here)
  const part = menu.getByRole("checkbox", { name: "Water and soft shadows" });
  await expect(part).toBeChecked();
  await part.uncheck();
  const now = await page.evaluate(() => window.dgm3d!.renderer.highEffectsNow);
  expect([now?.water, now?.shadows, now?.sunlight]).toEqual([false, false, true]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dgm.look.off") ?? "[]"))).toEqual(["water", "shadows"]);
  await part.check();
  // every effect off and on again draws without an error
  const keys = await page.evaluate(() => Object.keys(window.dgm3d!.renderer.highEffects));
  for (const k of keys) await page.evaluate((key) => window.dgm3d!.renderer.setHighEffect(key as never, false), k);
  await frames(page, 2);
  expect(Object.values((await page.evaluate(() => window.dgm3d!.renderer.highEffectsNow))!).some(Boolean)).toBe(false);
  for (const k of keys) await page.evaluate((key) => window.dgm3d!.renderer.setHighEffect(key as never, true), k);
  await frames(page, 2);
  expect(await page.evaluate(() => localStorage.getItem("dgm.look.off"))).toBeNull();
  expect(errors).toEqual([]);
});

/** How far a redraw of the same still frame can stray in a colour value (seen up to 3, on the water). */
const NOISE = 3;

test("the Standard look is the same after High as before it", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  /** The frame at a held moment, read back; against the first one kept: how many channel values
   *  differ, and by how much at most. */
  const still = (key: string) =>
    page.evaluate((k) => {
      const r = window.dgm3d!.renderer;
      r.setClock(12.5);
      r.resetView();
      r.renderNow();
      const g = (r as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext();
      const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
      g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
      const w = window as unknown as { firstShot?: Uint8Array };
      if (!w.firstShot) w.firstShot = px;
      let n = 0;
      let max = 0;
      for (let i = 0; i < px.length; i++) {
        const d = Math.abs(px[i] - w.firstShot[i]);
        if (d) n++;
        if (d > max) max = d;
      }
      return { key: k, share: n / px.length, max, size: `${g.drawingBufferWidth}x${g.drawingBufferHeight}` };
    }, key);
  await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("standard"));
  // (the view settles its size first: the legend beside it lays out after the map)
  const size = () => page.evaluate(() => `${window.dgm3d!.renderer.canvas.width}x${window.dgm3d!.renderer.canvas.height}`);
  await expect.poll(async () => {
    const a = await size();
    await page.waitForTimeout(500);
    return a === (await size());
  }).toBe(true);
  await still("before");
  const again = await still("again");
  await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("high"));
  const high = await still("high");
  await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("standard"));
  const after = await still("after");
  expect(after.size).toBe(again.size);
  // the same frame after High as before it, within a redraw's own noise: the same still frame drawn
  // twice can differ on the water by a few levels (dev's build too), so each pair is held to that,
  // never to the other pair's noise (a quiet first pair would fail a noisier second one)
  for (const s of [again, after]) expect(s.max, s.key).toBeLessThanOrEqual(NOISE);
  expect(high.share).toBeGreaterThan(0.2);
  expect(errors).toEqual([]);
});

test("too slow frames fall back to High's lower-cost tier, then to Standard, remembered (simulated)", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  expect(await look(page)).toBe("high");
  await page.waitForTimeout(500);
  // quick frames: High stays
  await page.evaluate(() => window.dgm3d!.renderer.simulateFrameCost(6));
  await frames(page, 20);
  expect(await look(page)).toBe("high");
  // slow frames, sustained: the lower-cost tier (without the soft shadows), then Standard
  const seen = await page.evaluate(async () => {
    const r = window.dgm3d!.renderer;
    r.simulateFrameCost(45);
    const out: { look: string; shadows?: boolean }[] = [{ look: r.look }];
    for (let k = 0; k < 400 && r.look !== "standard"; k++) {
      r.renderNow();
      await new Promise((done) => setTimeout(done, 25));
      if (out[out.length - 1].look !== r.look) out.push({ look: r.look, shadows: r.highEffectsNow?.shadows });
    }
    return out;
  });
  expect(seen.map((s) => s.look)).toEqual(["high", "lower", "standard"]);
  expect(seen[1].shadows).toBe(false);
  await page.getByRole("button", { name: "Look: Standard" }).click();
  await expect(page.getByRole("group", { name: "Look" })).toContainText("High was too slow on this computer");
  // the next page starts in Standard on this computer
  await page.reload();
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });
  expect(await look(page)).toBe("standard");
  // choosing Automatic again gives High another try
  await page.getByRole("button", { name: "Look: Standard" }).click();
  await page.getByRole("group", { name: "Look" }).getByRole("radio", { name: /^Standard/ }).check();
  await page.getByRole("group", { name: "Look" }).getByRole("radio", { name: /^Automatic/ }).check();
  expect(await look(page)).toBe("high");
  expect(errors).toEqual([]);
});

test("contamination draws the game's orange-red veins over dry earth and over grass, more with more, and clears exactly, in Standard and High (D334)", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  for (const choice of ["standard", "high"] as const) {
    const result = await page.evaluate((c) => {
      const r = window.dgm3d!.renderer;
      r.setLookChoice(c, false);
      const s = r.mapState()!;
      const kept = s.soil!;
      const N = s.W * s.H;
      /** The frame at a held moment with every tile's soil set, read back. */
      const frame = (moisture: number, level: number) => {
        r.updateSoil({ moisture: new Uint8Array(N).fill(moisture), contamination: new Uint8Array(N).fill(level) });
        r.setClock(12.5);
        r.resetView();
        r.renderNow();
        const g = (r as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext();
        const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
        g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
        return px;
      };
      /** Against the clean frame: the share of pixels that changed by more than 8 in a channel,
       *  how much redder than green they turned on average, and the largest change. */
      const compare = (base: Uint8Array, px: Uint8Array) => {
        let changed = 0;
        let redder = 0;
        let max = 0;
        for (let i = 0; i < px.length; i += 4) {
          const d = Math.max(Math.abs(px[i] - base[i]), Math.abs(px[i + 1] - base[i + 1]), Math.abs(px[i + 2] - base[i + 2]));
          max = Math.max(max, d);
          if (d > 8) {
            changed++;
            redder += px[i] - px[i + 1] - (base[i] - base[i + 1]);
          }
        }
        return { share: changed / (px.length / 4), redder: changed ? redder / changed : 0, max };
      };
      const out: Record<string, ReturnType<typeof compare>[]> = {};
      for (const [soil, moisture] of [["dry", 0], ["grass", 150]] as const) {
        const clean = frame(moisture, 0);
        // (the same clean frame drawn again: how far a redraw alone strays, as software drawing can)
        const again = compare(clean, frame(moisture, 0));
        out[soil] = [compare(clean, frame(moisture, 128)), compare(clean, frame(moisture, 255)), compare(clean, frame(moisture, 0)), again];
      }
      r.updateSoil(kept);
      return out;
    }, choice);
    for (const [soil, [some, most, cleared, again]] of Object.entries(result)) {
      const at = `${choice}, ${soil}`;
      // sparse veins, never a tint over the whole soil, more of them the more contaminated
      expect(some.share, at).toBeGreaterThan(0.002);
      expect(most.share, at).toBeGreaterThanOrEqual(some.share);
      expect(most.share, at).toBeLessThan(0.35);
      // orange-red: where the ground changed, it turned redder
      expect(some.redder, at).toBeGreaterThan(10);
      expect(most.redder, at).toBeGreaterThan(10);
      // cleared, the clean ground comes back: no more pixels changed than a redraw of it alone, and
      // none by a vein's worth (software drawing on CI puts a few values up to 6 apart after the
      // contaminated frames; a vein changes many by far more)
      expect(cleared.share, at).toBeLessThanOrEqual(Math.max(again.share, 1e-4));
      expect(cleared.max, at).toBeLessThanOrEqual(Math.max(again.max, 8));
    }
  }
  expect(errors).toEqual([]);
});

test("High's water is darker deep than shallow, at one camera and light (D334: the order, not a gap)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  // (seed 5 on M9b's maps, D148: seed 3's lake basin is nowhere 2 deep, its deepest water 1.8; seed 5 shows
  // about a thousand tiles of each in view)
  await page.goto("./#s=5&z=128&d=n&t=lakeBasin");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });
  const depths = await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    r.setLookChoice("high", false);
    r.setClock(12.5);
    r.resetView();
    r.renderNow();
    const g = (r as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext();
    const W = g.drawingBufferWidth;
    const H = g.drawingBufferHeight;
    const px = new Uint8Array(W * H * 4);
    g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
    const k = W / r.canvas.clientWidth;
    const s = r.mapState()!;
    const shallow: number[] = [];
    const deep: number[] = [];
    for (let y = 1; y < s.H - 1; y++)
      for (let x = 1; x < s.W - 1; x++) {
        const i = y * s.W + x;
        const d = s.surface.depth[i];
        if (!(d > 0) || s.surface.contamination[i] > 0.02 || !Number.isFinite(s.surface.surface[i])) continue;
        const group = d >= 0.15 && d <= 0.6 ? shallow : d >= 2 ? deep : null;
        if (!group) continue;
        const p = r.project(x + 0.5, s.surface.surface[i], -(y + 0.5));
        if (!p.visible) continue;
        const cx = Math.round(p.x * k);
        const cy = H - 1 - Math.round(p.y * k);
        if (cx < 2 || cy < 2 || cx >= W - 2 || cy >= H - 2) continue;
        const l: number[] = [];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const o = ((cy + dy) * W + cx + dx) * 4;
            l.push(0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]);
          }
        group.push(l.sort((a, b) => a - b)[4]);
      }
    const median = (v: number[]) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
    return { shallow: shallow.length, deep: deep.length, shallowLuma: median(shallow), deepLuma: median(deep) };
  });
  expect(depths.shallow).toBeGreaterThan(10);
  expect(depths.deep).toBeGreaterThan(10);
  expect(depths.deepLuma).toBeLessThan(depths.shallowLuma);
  expect(errors).toEqual([]);
});

test("an eruption in High (D378): its plume rises, its lava glows on High's ground, and High stays drawn", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=highlands");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  expect(await look(page)).toBe("high");
  await page.keyboard.press("0");
  await page.getByRole("group", { name: "Erupt options" }).getByRole("slider", { name: "Power" }).fill("70");
  // dry ground in the middle of the view, clear of the rows over the map
  const at = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const below = (document.querySelector(".brush-bar-wrap")?.getBoundingClientRect().bottom ?? 200) + 110;
    for (let d = 0; d < m.W / 3; d++)
      for (const [x, y] of [[m.W / 2 + d, m.H / 2 + d], [m.W / 2 - d, m.H / 2 + d], [m.W / 2 + d, m.H / 2 - d], [m.W / 2 - d, m.H / 2 - d]].map(([a, b]) => [Math.round(a), Math.round(b)])) {
        const p = window.dgmEditor!.tileToClient(x, y);
        if (m.surface.depth[y * m.W + x] > 0 || p.y < below || document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") continue;
        return p;
      }
    return null;
  });
  expect(at).not.toBeNull();
  // measured in the page at its last frame, its land final and its lava hottest (however slowly the
  // browser draws: software drawing on CI takes seconds to keep it, and the lava cools meanwhile)
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const w = window as unknown as { glow?: { cooling: number | null; hot: number; cold: number; look: string } };
    /** How many pixels of the frame drawn now are lava's colour: a strong orange-red, which High's
     *  ground never is by itself. */
    const lava = () => {
      r.renderNow();
      const g = (r as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext();
      const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
      g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 150 && px[i] > 2.2 * px[i + 1] && px[i] > 3 * px[i + 2]) n++;
      return n;
    };
    const set = r.setForceMoment.bind(r);
    r.setForceMoment = (m) => {
      set(m);
      if (m.verb !== "erupt" || m.phase !== "done" || w.glow) return;
      const s = r.forceShowing?.erupt ?? null;
      const hot = lava();
      // against the same land with its moment gone
      r.clearForce();
      w.glow = { cooling: s?.cooling ?? null, hot, cold: lava(), look: r.look };
    };
  });
  await page.mouse.click(at!.x, at!.y);
  // the plume shows while it works, in High
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.forceShowing?.erupt ?? null), { timeout: 15_000 }).not.toBeNull();
  expect(await look(page)).toBe("high");
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.force()), { timeout: 30_000 }).toBeNull();
  const glow = (await page.evaluate(() => (window as unknown as { glow?: { cooling: number | null; hot: number; cold: number; look: string } }).glow))!;
  expect(glow.cooling).not.toBeNull();
  expect(glow.cooling!).toBeLessThan(0.5);
  expect(glow.look).toBe("high");
  // (a few hundred such pixels elsewhere on the map without it; thousands more with its lava)
  expect(glow.hot - glow.cold, JSON.stringify(glow)).toBeGreaterThan(2000);
  expect(glow.hot, JSON.stringify(glow)).toBeGreaterThan(5 * glow.cold);
  expect(errors).toEqual([]);
});

test("High's basin sources highlight as Standard's do (D378): a source turns a clear red (D249), and the water over one the pointer's water comes from glows (D196), clean and bad alike", async ({ page }) => {
  // An expected failure, naming the bug it found: a source's highlight is unreadable when it sits under its own
  // water (seed 4242's first clean source, generator 0.8.0: red 3.7 in Standard, 3.2 in High, against 25). Kyler's
  // decision: it must read under water, in both looks; fix/basin-highlight fixes it and removes this.
  test.fail(true, "a source's highlight is unreadable under its own water (Standard 3.7, High 3.2, against 25)");
  const errors: string[] = [];
  await open(page, errors);
  const result = await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    /** The frame drawn now, read back, and how many device pixels a CSS pixel is. */
    const readFrame = () => {
      r.renderNow();
      const g = (r as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext();
      const W = g.drawingBufferWidth;
      const H = g.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
      return { px, W, H, k: W / r.canvas.clientWidth };
    };
    const m = r.mapState()!;
    const e = m.entities;
    /** Each kind's first source: its tile (as the page highlights it), its middle, and whether its
     *  basin shows above the water there. */
    const sources: Record<string, { tile: number; middle: number; x: number; y: number; dry: boolean }> = {};
    for (let k = 0; k < e.count; k++) {
      const name = e.templates[e.template[k]];
      if ((name !== "WaterSource" && name !== "BadwaterSource") || sources[name]) continue;
      let x = e.x[k];
      let y = e.y[k];
      if (name === "BadwaterSource") {
        const o = e.orientation[k];
        x += o === 0 || o === 1 ? 1 : -1;
        y += o === 0 || o === 3 ? 1 : -1;
      }
      sources[name] = { tile: e.y[k] * m.W + e.x[k], middle: y * m.W + x, x, y, dry: !(m.surface.depth[y * m.W + x] > 0.25) };
    }
    const out: Record<string, Record<string, { red: number; glow: number }>> = {};
    let back = 0;
    for (const look of ["standard", "high"] as const) {
      r.setLookChoice(look, false);
      r.setClock(12.5);
      r.resetView();
      const f0 = readFrame();
      /** Round each source's middle on screen: how much redder than green, and the colour itself. */
      const at = (f: typeof f0) =>
        Object.fromEntries(
          Object.entries(sources).map(([name, s]) => {
            const p = r.project(s.x + 0.5, m.heights[s.middle] + 0.3, -(s.y + 0.5));
            const cx = Math.round(p.x * f.k);
            const cy = f.H - 1 - Math.round(p.y * f.k);
            const rgb = [0, 0, 0];
            for (let dy = -3; dy <= 3; dy++)
              for (let dx = -3; dx <= 3; dx++) {
                const o = ((cy + dy) * f.W + cx + dx) * 4;
                for (let c = 0; c < 3; c++) rgb[c] += f.px[o + c] / 49;
              }
            return [name, rgb];
          }),
        );
      const plain = at(f0);
      r.highlightObjects(Object.values(sources).map((s) => s.tile));
      const red = at(readFrame());
      r.highlightObjects(null);
      r.setSourceGlow(Object.values(sources).map((s) => s.middle));
      const glow = at(readFrame());
      r.setSourceGlow([]);
      const f1 = readFrame();
      for (let i = 0; i < f0.px.length; i++) back = Math.max(back, Math.abs(f0.px[i] - f1.px[i]));
      out[look] = Object.fromEntries(
        Object.keys(sources).map((name) => {
          const [a, b] = [plain[name], red[name]];
          return [name, { red: b[0] - b[1] - (a[0] - a[1]), glow: Math.max(...glow[name].map((v: number, c: number) => Math.abs(v - a[c]))) }];
        }),
      );
    }
    return { sources: Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, s.dry])), out, back, look: r.look };
  });
  const { standard, high } = result.out;
  expect(result.look).toBe("high");
  // a source turns a clear red where its basin shows (a bad source under its own pool barely does, in
  // either look: the badwater over it hides it)
  expect(high.WaterSource.red).toBeGreaterThan(25);
  expect(high.WaterSource.red).toBeGreaterThan(standard.WaterSource.red * 0.75);
  // the water over a source the pointer's water comes from glows, clean and bad, as in Standard
  for (const name of ["WaterSource", "BadwaterSource"]) {
    expect(high[name].glow, name).toBeGreaterThan(3);
    expect(high[name].glow, name).toBeGreaterThan(standard[name].glow * 0.6);
  }
  // and both go exactly (software drawing on CI may stray a little on a redraw)
  expect(result.back).toBeLessThanOrEqual(8);
  expect(errors).toEqual([]);
});
