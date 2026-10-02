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
  // (a GPU may draw the same frame twice a level apart in a value or two: no more than that)
  expect(after.share).toBeLessThanOrEqual(Math.max(again.share, 1e-5));
  expect(after.max).toBeLessThanOrEqual(Math.max(again.max, 1));
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
