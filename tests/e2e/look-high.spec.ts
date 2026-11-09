// The High look (Map look 2, PLAN §20 D284): on a computer with a GPU it is the default, the look's
// menu switches between it and Standard (remembered), each of its effects switches, the Standard
// look is the same after High as before it, and the automatic choice falls back to Standard when
// frames stay too slow (simulated here), remembering it; contamination's veins and High's water depth
// are checked as drawn (D334). CI draws in software, where the page would
// take the light look: the tests there treat it as a GPU (window.dgmLookTest), so the High shaders
// compile and run on CI too, and they shorten the fallback's waits and report every frame as quick
// (software frames are slow) until a test reports them slow.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, waitForEditor, topDown } from "./open";

// the automatic choice, not the Standard look the other tests hold (playwright.config.ts)
test.use({ storageState: { cookies: [], origins: [] } });

// (its tests run one after another on one worker, never two at once: each draws High, which on CI's software drawing
// costs 2 to 3 s a frame, and two of them side by side on the runner's four cores took the slow-frames test past its
// budget, run 40601987187. Any other spec beside it does the same (run 42592717654), so on CI this file has a runner to
// itself: playwright.config.ts's "alone" project, ci.yml's `browser-alone` job.)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, limits: { window: 8, strikes: 2, grace: 400 }, cost: 6 };
  });
});

async function open(page: Page, errors: string[]): Promise<void> {
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
}

const look = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.look);

/** The page has opened in High: the look is set once High's programs have compiled, in the background after the map
 *  opens (renderer.ts applyLook, highProgramsReady), so until then it still reads "standard" (D341: a race, never
 *  read once). */
const opensHigh = (page: Page) => expect.poll(() => look(page), { timeout: 60_000 }).toBe("high");

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
  await opensHigh(page);
  const button = page.getByRole("button", { name: "Look: High" });
  await expect(button).toBeVisible();
  await button.click();
  const menu = page.getByRole("group", { name: "Look" });
  await expect(menu).toContainText("Drawing High");
  await menu.getByRole("button", { name: /^Standard/ }).click();
  expect(await look(page)).toBe("standard");
  await expect(page.getByRole("button", { name: "Look: Standard" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("dgm.look"))).toBe("standard");
  await menu.getByRole("button", { name: /^High/ }).click();
  expect(await look(page)).toBe("high");
  await menu.getByRole("button", { name: /^Automatic/ }).click();
  expect(await look(page)).toBe("high");
  expect(await page.evaluate(() => localStorage.getItem("dgm.look"))).toBeNull();
  // a new page keeps the choice
  await menu.getByRole("button", { name: /^Standard/ }).click();
  await page.reload();
  await waitForEditor(page);
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
  // (the patterns are made in the bake worker after the view opens, flat at their means until then: made before the
  // first frame, so none lands between the frames compared)
  await page.evaluate(() => window.dgm3d!.renderer.patternsMade());
  // (the view settles its size first: the legend beside it lays out after the map. Watched in the page until neither
  // the canvas's box nor its pixels have changed for half a second: on a busy page (CI's software GL) a round trip to
  // the page can take a second or two, and a poll of two reads with a wait between them spent its 5 seconds on one try,
  // the size long since held)
  await page.evaluate(
    () =>
      new Promise<void>((held) => {
        const c = window.dgm3d!.renderer.canvas;
        let size = `${c.width}x${c.height}`;
        let since = performance.now();
        const moved = () => (since = performance.now());
        const box = new ResizeObserver(moved);
        box.observe(c);
        const frame = () => {
          if (`${c.width}x${c.height}` !== size) {
            size = `${c.width}x${c.height}`;
            moved();
          }
          if (performance.now() - since < 500) return void requestAnimationFrame(frame);
          box.disconnect();
          held();
        };
        requestAnimationFrame(frame);
      }),
  );
  // (the drought line comes in by itself once the worker has worked it out, a change between frames: wait for it, then
  // put it away. It is the same in both looks, and where its flat and upright strips overlap over the water, the GPU
  // (software GL and the RTX 2070 SUPER alike) blends it there once or twice between two redraws of one still frame,
  // with the draw order, the scene, the clock and the camera held: a few pixels up to 21 apart, back and forth. Its
  // own drawing is checked in droughtLine.spec.ts; the line has no tint on this map)
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.droughtLineShowing), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => window.dgm3d!.renderer.setDroughtLine(null));
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
  // (High was drawn between them: its own effects, its shadows, water and models, change the frame. Since the game's
  // sky is every look's (D497), the sky behind the map, most of the 0.2 this was held to, no longer differs; High's own
  // effects change about 0.057 of the channel values on this frame, RTX 2070 SUPER)
  expect(high.share).toBeGreaterThan(0.03);
  expect(errors).toEqual([]);
});

test("too slow frames fall back to High's lower-cost tier, then to Standard, remembered (simulated)", async ({ page }) => {
  // (some forty frames of High and two page loads: under three minutes on a runner to itself, 162 s on 2026-10-25, but
  // CI's software drawing makes it the slowest test here; the fallback reads the frames' simulated cost, not how long
  // the runner takes to draw them)
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await opensHigh(page);
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
  await waitForEditor(page);
  expect(await look(page)).toBe("standard");
  // choosing Automatic again gives High another try
  await page.getByRole("button", { name: "Look: Standard" }).click();
  await page.getByRole("group", { name: "Look" }).getByRole("button", { name: /^Standard/ }).click();
  await page.getByRole("group", { name: "Look" }).getByRole("button", { name: /^Automatic/ }).click();
  // (High comes once its programs have compiled in the background: 0.08 to 8.9 s here, so polled, D341)
  await opensHigh(page);
  expect(errors).toEqual([]);
});

test("the game's bloom is drawn only when something can pass its knee, and skipping it by day changes no pixel (D497 as amended 2026-11-08, D453)", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await opensHigh(page);
  for (const choice of ["high", "standard"] as const) {
    await page.evaluate((c) => window.dgm3d!.renderer.setLookChoice(c), choice);
    const day = await page.evaluate(() => {
      type Bloom = { up: { texture: unknown; width: number; height: number }[]; down: { width: number; height: number }[]; apply(gl: unknown): void };
      const r = window.dgm3d!.renderer as unknown as {
        blooms(): boolean;
        bloom: Bloom | null;
        gl: { getContext(): WebGL2RenderingContext; setRenderTarget(t: unknown): void };
        map: { entities: { count: number; templates: string[]; template: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>; z: ArrayLike<number> } };
        setView(v: unknown): void;
        setClock(h: number): void;
        renderNow(): void;
      };
      const g = r.gl.getContext();
      const read = () => {
        const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
        g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
        return px;
      };
      const canvas = () => {
        r.renderNow();
        return read();
      };
      const e = r.map.entities;
      let at: number[] = [48, 2, -48];
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "StartingLocation") at = [e.x[k] + 0.5, e.z[k], -(e.y[k] + 0.5)];
      // the start up close by day, its marker the brightest model there is
      r.setClock(12.5);
      r.setView({ mode: "orbit", yaw: -Math.PI / 6, pitch: 0.6, distance: 11, target: at });
      const skipped = r.blooms();
      // drawn anyway: what the game's passes make of it, and the canvas just before them and just after, in one frame
      // (two redraws of a still frame can differ by a level here and there, the bloom aside)
      const own = Object.getOwnPropertyDescriptor(r, "blooms");
      r.blooms = () => true;
      canvas();
      const b = r.bloom!;
      const apply = b.apply.bind(b);
      let without = new Uint8Array(0);
      let withIt = new Uint8Array(0);
      b.apply = (gl: unknown) => {
        without = read();
        apply(gl);
        withIt = read();
      };
      canvas();
      delete (b as { apply?: unknown }).apply;
      const top = (b.up.length > 1 ? b.up[0] : b.down[0]) as unknown as { width: number; height: number };
      r.gl.setRenderTarget(top);
      const lift = new Float32Array(top.width * top.height * 4);
      g.readPixels(0, 0, top.width, top.height, g.RGBA, g.FLOAT, lift);
      r.gl.setRenderTarget(null);
      if (own) Object.defineProperty(r, "blooms", own);
      else delete (r as { blooms?: unknown }).blooms;
      let differ = 0;
      for (let i = 0; i < without.length; i++) if (without[i] !== withIt[i]) differ++;
      let most = 0;
      for (let i = 0; i < lift.length; i += 4) most = Math.max(most, lift[i], lift[i + 1], lift[i + 2]);
      return { skipped, differ, most, read: without.length > 0 && withIt.length === without.length };
    });
    // by day nothing passes the knee: the passes are skipped, they would have made nothing, and the frame is the same
    // to the byte with them or without
    expect(day.skipped, choice).toBe(false);
    expect(day.read, choice).toBe(true);
    expect(day.most, choice).toBe(0);
    expect(day.differ, JSON.stringify({ choice, ...day })).toBe(0);
  }
  expect(errors).toEqual([]);
});

test("contamination draws the game's rusty veins over dry earth and over grass, the same at any level, and clears exactly, in Standard and High (D334, D154 as amended 2026-11-07)", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  // (the pattern is made in the bake worker after the view opens, flat at its mean until then)
  await page.evaluate(() => window.dgm3d!.renderer.patternsMade());
  for (const choice of ["standard", "high"] as const) {
    const result = await page.evaluate((c) => {
      const r = window.dgm3d!.renderer;
      r.setLookChoice(c, false);
      const s = r.mapState()!;
      const kept = s.soil!;
      const N = s.W * s.H;
      // close over the map's highest ground (dry land, never under water), where a tile spans many pixels and the
      // cracks show as cracks: from the opening view they are under a pixel wide and average to the pattern's mean,
      // as the game's do from afar (D154 as amended 2026-11-07)
      let top = 0;
      for (let i = 1; i < N; i++) if (s.heights[i] > s.heights[top]) top = i;
      const tx = top % s.W, ty = Math.floor(top / s.W);
      const view = { mode: "orbit" as const, yaw: 0.6, pitch: (60 * Math.PI) / 180, distance: 9, target: [tx + 0.5, s.heights[top], -(ty + 0.5)] as [number, number, number] };
      /** The frame at a held moment with every tile's soil set, read back. */
      const frame = (moisture: number, level: number) => {
        r.updateSoil({ moisture: new Uint8Array(N).fill(moisture), contamination: new Uint8Array(N).fill(level) });
        r.setClock(12.5);
        r.setView(view);
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
      // veins, never a fill over the whole soil, and the game's same pattern at any level over a fifth (128 and 255
      // alike: its weight is whole from the map value's fifth)
      expect(some.share, at).toBeGreaterThan(0.002);
      expect(most.share, at).toBeLessThan(0.35);
      expect(Math.abs(most.share - some.share), at).toBeLessThan(0.02);
      // rust: where the ground changed, it turned redder
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
  await openEditor(page, "s=5&z=128&d=n&t=lakeBasin");
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
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await topDown(page);
  await opensHigh(page);
  await page.keyboard.press("Shift+Digit3");
  await page.getByRole("group", { name: "Erupt options" }).getByRole("slider", { name: "Power" }).fill("70");
  // its lava is the test's subject, so Ridges and Flows are set by hand: on Auto the land and the seed draw them
  // (D309), and with Ridges off the heat on the ground is a faint disc, no lava at all (about 140 pixels; on 0.8.8's
  // Highlands the middle of this map drew that, which read as "no lava from high ground": the level was never
  // the cause)
  const row = page.getByRole("group", { name: "Erupt options" });
  for (const [detail, choice] of [["Ridges", "On"], ["Flows", "Heavy"]]) await row.getByRole("group", { name: detail, exact: true }).getByRole("button", { name: choice, exact: true }).click();
  // dry ground in the middle of the view, clear of the controls over the map, at level 6 or lower: the middle of
  // 0.8.8's map is its top bench, level 15, where the cone has seven levels of room and half the lava in frame
  const at = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const below = (document.querySelector(".view3d-corner")?.getBoundingClientRect().bottom ?? 120) + 20;
    const above = (document.querySelector(".tool-dock")?.getBoundingClientRect().top ?? 600) - 20;
    for (let d = 0; d < m.W / 3; d++)
      for (const [x, y] of [[m.W / 2 + d, m.H / 2 + d], [m.W / 2 - d, m.H / 2 + d], [m.W / 2 + d, m.H / 2 - d], [m.W / 2 - d, m.H / 2 - d]].map(([a, b]) => [Math.round(a), Math.round(b)])) {
        const p = window.dgmEditor!.tileToClient(x, y);
        if (m.heights[y * m.W + x] > 6 || m.surface.depth[y * m.W + x] > 0 || p.y < below || p.y > above || document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") continue;
        return { ...p, tile: [x, y] };
      }
    return null;
  });
  expect(at).not.toBeNull();
  // measured in the page at its last frame, its land final and its lava hottest (however slowly the
  // browser draws: software drawing on CI takes seconds to keep it, and the lava cools meanwhile)
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const w = window as unknown as { glow?: { cooling: number | null; hot: number; cold: number; look: string; bloomed: boolean } };
    let bloomed = false;
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
      // the lava once all of it has arrived (the shader's arrival, smoothstep(a·1.1, a·1.1 + 0.55) of the eruption's
      // age, is whole for every tile at 1.65 s), with its cooling as it is now, without the plume's smoke over it (the
      // poll below sees the plume). The moment it is kept is no fixed age of the eruption: its age then is however long
      // the browser took, and the count moved with it, through the lava still arriving, the ash settling over it from
      // 0.5 to 2.4 s and the smoke's puffs (in software drawing, 1,750 lava pixels at 0.8 s, 2,580 at 1.4 s, 1,995 at
      // 2.5 s; CI drew 1,661 and 1,798, dev's runs 41002468990 and 41009357513). Held at 1.65 s, software drawing counts
      // 2,361 to 2,363 every time, a GPU about 3,500
      const fx = (r as unknown as { forceFx: { heat(now: number): { age: number; cooling: number } | null; plume: { group: { visible: boolean } } } }).forceFx;
      const heat = fx.heat;
      fx.heat = (now) => {
        const h = heat.call(fx, now);
        return h && { age: 1.65, cooling: h.cooling };
      };
      fx.plume.group.visible = false;
      // (its lava passes the bloom's knee, so the bloom is drawn while it glows; the lava's own colour is counted
      // before it, as the bloom's glow over its hottest middle adds green there and turns some of it orange: a GPU
      // counts 1,435 to 2,096 with the bloom, about 2,680 without it. The bloom's own drawing: the test above)
      const gate = r as unknown as { blooms(): boolean };
      bloomed = gate.blooms();
      gate.blooms = () => false;
      const hot = lava();
      delete (gate as { blooms?: unknown }).blooms;
      fx.heat = heat;
      // against the same land with its moment gone
      r.clearForce();
      w.glow = { cooling: s?.cooling ?? null, hot, cold: lava(), look: r.look, bloomed };
    };
  });
  await page.mouse.click(at!.x, at!.y);
  // the plume shows while it works, in High
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.forceShowing?.erupt ?? null), { timeout: 15_000 }).not.toBeNull();
  expect(await look(page)).toBe("high");
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.force()), { timeout: 30_000 }).toBeNull();
  const glow = (await page.evaluate(() => (window as unknown as { glow?: { cooling: number | null; hot: number; cold: number; look: string; bloomed: boolean } }).glow))!;
  // (its lava passes the bloom's knee: the bloom is drawn while it glows, D497 as amended 2026-11-08)
  expect(glow.bloomed).toBe(true);
  expect(glow.cooling).not.toBeNull();
  expect(glow.cooling!).toBeLessThan(0.5);
  expect(glow.look).toBe("high");
  // (a few hundred such pixels elsewhere on the map without it; thousands more with its lava)
  expect(glow.hot - glow.cold, JSON.stringify({ ...glow, at })).toBeGreaterThan(2000);
  expect(glow.hot, JSON.stringify(glow)).toBeGreaterThan(5 * glow.cold);
  expect(errors).toEqual([]);
});

test("every basin source's highlight reads, under its own water too, in High as in Standard (D378, D249; Kyler, 2026-10-03), and the water over one the pointer's water comes from glows (D196), clean and bad alike", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  // (the drought line comes in by itself once the worker has worked it out, and where its strips overlap over water
  // the GPU blends it once or twice between redraws of one still frame (the Standard-after-High test above): wait for
  // it, then put it away, so the frames before and after the highlight compare only what this test is about)
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.droughtLineShowing), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => window.dgm3d!.renderer.setDroughtLine(null));
  // (the colours at a source, framed as the renderer frames a map alone: the page's insets move the camera)
  await page.evaluate(() => window.dgm3d!.renderer.setFrameInsets({ top: 0, left: 0, bottom: 0, right: 0 }));
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
    /** Every source on the map: its kind, its tile (as the page highlights it), its middle, and the top
     *  there (the water's surface over a source under its own water, else its ground). */
    const sources: { name: string; tile: number; middle: number; x: number; y: number; top: number; depth: number }[] = [];
    for (let k = 0; k < e.count; k++) {
      const name = e.templates[e.template[k]];
      if (name !== "WaterSource" && name !== "BadwaterSource") continue;
      let x = e.x[k];
      let y = e.y[k];
      if (name === "BadwaterSource") {
        const o = e.orientation[k];
        x += o === 0 || o === 1 ? 1 : -1;
        y += o === 0 || o === 3 ? 1 : -1;
      }
      const middle = y * m.W + x;
      const depth = m.surface.depth[middle] || 0;
      const top = depth > 0 && Number.isFinite(m.surface.surface[middle]) ? m.surface.surface[middle] : m.heights[middle] + 0.3;
      sources.push({ name, tile: e.y[k] * m.W + e.x[k], middle, x, y, top, depth });
    }
    /** Each kind's first source, for the glow. */
    const firsts = ["WaterSource", "BadwaterSource"].map((n) => sources.findIndex((s) => s.name === n));
    const out: Record<string, { red: number[]; glow: number[] }> = {};
    let back = 0;
    for (const look of ["standard", "high"] as const) {
      r.setLookChoice(look, false);
      r.setClock(12.5);
      // (the colours at a source, framed as the renderer frames a map alone: the page's insets move the camera,
      // and the editor notes them again whenever its controls change size, so they go here, just before framing)
      r.setFrameInsets({ top: 0, left: 0, bottom: 0, right: 0 });
      r.resetView();
      const f0 = readFrame();
      /** Round each source's middle on screen, at its top: the colour. */
      const at = (f: typeof f0) =>
        sources.map((s) => {
          const p = r.project(s.x + 0.5, s.top, -(s.y + 0.5));
          const cx = Math.round(p.x * f.k);
          const cy = f.H - 1 - Math.round(p.y * f.k);
          const rgb = [0, 0, 0];
          for (let dy = -3; dy <= 3; dy++)
            for (let dx = -3; dx <= 3; dx++) {
              const o = ((cy + dy) * f.W + cx + dx) * 4;
              for (let c = 0; c < 3; c++) rgb[c] += f.px[o + c] / 49;
            }
          return rgb;
        });
      const plain = at(f0);
      r.highlightObjects(sources.map((s) => s.tile));
      const red = at(readFrame());
      r.highlightObjects(null);
      r.setSourceGlow(firsts.map((k) => sources[k].middle));
      const glow = at(readFrame());
      r.setSourceGlow([]);
      const f1 = readFrame();
      for (let i = 0; i < f0.px.length; i++) back = Math.max(back, Math.abs(f0.px[i] - f1.px[i]));
      out[look] = {
        // how much redder than green each source turned
        red: sources.map((_, k) => red[k][0] - red[k][1] - (plain[k][0] - plain[k][1])),
        glow: firsts.map((k) => Math.max(...glow[k].map((v: number, c: number) => Math.abs(v - plain[k][c])))),
      };
    }
    return { sources: sources.map((s) => ({ name: s.name, x: s.x, y: s.y, depth: s.depth })), out, back, look: r.look };
  });
  const { standard, high } = result.out;
  expect(result.look).toBe("high");
  expect(result.sources.some((s) => s.depth > 0.5)).toBe(true);
  // every source turns a clear red, the one deepest under its own water included, in each look
  for (const [look, o] of [["standard", standard], ["high", high]] as const) {
    const worst = Math.min(...o.red);
    const k = o.red.indexOf(worst);
    expect(worst, `${look}: the worst, ${JSON.stringify(result.sources[k])}`).toBeGreaterThan(25);
  }
  expect(Math.min(...high.red)).toBeGreaterThan(Math.min(...standard.red) * 0.75);
  // the water over a source the pointer's water comes from glows, clean and bad, as in Standard
  for (const [k, name] of ["WaterSource", "BadwaterSource"].entries()) {
    expect(high.glow[k], name).toBeGreaterThan(3);
    expect(high.glow[k], name).toBeGreaterThan(standard.glow[k] * 0.6);
  }
  // and both go exactly (software drawing on CI may stray a little on a redraw)
  expect(result.back).toBeLessThanOrEqual(8);
  expect(errors).toEqual([]);
});

test("a source glowing while the objects are drawn again (a source placed) goes back to its own colour in High when the glow ends, as do the rest (D196)", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  expect(await look(page)).toBe("high");
  /** Every High source batch's instance colours, by its source's tile. */
  const colours = () =>
    page.evaluate(() => {
      const r = window.dgm3d!.renderer as unknown as { objects: { children: { name: string; instanceColor?: { array: Float32Array }; userData: { objects?: Int32Array } }[] }; mapState(): { W: number; entities: EntityLike } };
      type EntityLike = { x: Int32Array; y: Int32Array };
      const m = r.mapState();
      const out: Record<string, number[]> = {};
      for (const c of r.objects.children) {
        if (c.name !== "high.WaterSource" && c.name !== "high.BadwaterSource") continue;
        const own = c.userData.objects!;
        for (let i = 0; i < own.length; i++) if (own[i] >= 0) out[`${c.name} ${m.entities.x[own[i]]},${m.entities.y[own[i]]}`] = Array.from(c.instanceColor!.array.subarray(i * 3, i * 3 + 3), (v) => Math.round(v * 1000) / 1000);
      }
      return out;
    });
  const before = await colours();
  expect(Object.keys(before).some((k) => k.startsWith("high.WaterSource"))).toBe(true);
  // the first water source glows, as when the pointer is over its water
  const { middle, spot } = await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const m = r.mapState()!;
    const e = m.entities;
    let middle = -1;
    for (let k = 0; k < e.count && middle < 0; k++) if (e.templates[e.template[k]] === "WaterSource") middle = e.y[k] * m.W + e.x[k];
    // a dry, level tile with nothing on it, away from the edge, for a new source
    const taken = new Set<number>();
    for (let k = 0; k < e.count; k++) taken.add(e.y[k] * m.W + e.x[k]);
    let spot: [number, number] | null = null;
    for (let y = 8; y < m.H - 8 && !spot; y++)
      for (let x = 8; x < m.W - 8 && !spot; x++) {
        const i = y * m.W + x;
        const h = m.heights[i];
        if (taken.has(i) || (m.surface.depth[i] || 0) > 0) continue;
        if ([i - 1, i + 1, i - m.W, i + m.W].every((j) => m.heights[j] === h && !taken.has(j) && !(m.surface.depth[j] > 0))) spot = [x, y];
      }
    return { middle, spot };
  });
  expect(spot).not.toBeNull();
  await page.evaluate((i) => window.dgm3d!.renderer.setSourceGlow([i]), middle);
  const glowing = await colours();
  expect(glowing).not.toEqual(before);
  // a source placed while it glows: the objects are drawn again, High's batches built anew from them
  const count = await page.evaluate(() => window.dgm3d!.renderer.mapState()!.entities.count);
  await page.evaluate(
    ([x, y]) => window.dgmEditor!.edit({ op: "placeEntity", params: { id: "f0e1d2c3-0000-4000-8000-0000000000aa", template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } } } as never, "Place a water source"),
    spot!,
  );
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.mapState()!.entities.count), { timeout: 30_000 }).toBe(count + 1);
  // still glowing, once, on the source the glow is for
  expect(await colours()).toEqual(expect.objectContaining(Object.fromEntries(Object.entries(glowing))));
  await page.evaluate(() => window.dgm3d!.renderer.setSourceGlow([]));
  // every source back in its own colour, the new one in a source's own
  const after = await colours();
  expect(after).toEqual(expect.objectContaining(before));
  expect(after[`high.WaterSource ${spot![0]},${spot![1]}`]).toEqual(Object.values(before)[0]);
  expect(errors).toEqual([]);
});

test("High's visible seasons follow the game's timers: no plant dies of dryness in a normal drought's 9 days, a longer one withers them, a badtide kills on poisoned ground; in both looks; Day 0 does not; the plants whose ground dried are drawn dying until then (D250, D242 as amended)", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley&bw=0");
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.waterSettled()), { timeout: 60_000 }).toBe(true);
  await opensHigh(page);
  const withered = () => page.evaluate(() => window.dgm3d!.renderer.witheredPlants);
  const dying = () => page.evaluate(() => (window.dgm3d!.renderer as unknown as { dyingPlants: number }).dyingPlants);
  const bar = page.getByRole("toolbar", { name: "Water time" });
  const day = bar.locator(".day-label");
  const goTo = async (n: number) => {
    await day.dblclick();
    await bar.getByRole("textbox", { name: "Day" }).fill(String(n));
    await bar.getByRole("textbox", { name: "Day" }).press("Enter");
    await expect(day).toHaveText(`Day ${n}`);
    await expect(day).not.toHaveClass(/counting/, { timeout: 240_000 });
  };
  expect(await withered()).toBe(0);
  // (this map's living plants all stand on moist, clean ground on Day 0: none dying)
  expect(await dying()).toBe(0);

  // a normal drought's last day (9): the ground is dry, but no pine, birch or oak has been dry 14 days (1.1 x 13, 11, 15)
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(day).not.toHaveClass(/counting/, { timeout: 180_000 });
  await expect(day).toHaveText("Day 9");
  await page.waitForTimeout(1000);
  expect(await withered()).toBe(0);
  // ...yet every living plant on ground the drought dried is dying, as the game's #Dying model shows it
  await expect.poll(dying, { timeout: 30_000 }).toBeGreaterThan(20);
  // a longer one: by day 20 the plants that have stood dry for 1.1 x their days are dead, and stay dead going on
  await goTo(20);
  await expect.poll(withered, { timeout: 30_000 }).toBeGreaterThan(20);
  const dry20 = await withered();
  await goTo(24);
  // (the day comes first and its list follows, the day soil being worked out in a worker: wait for it, or dry24 is day 20's)
  await expect.poll(withered, { timeout: 30_000 }).toBeGreaterThan(dry20);
  // Standard draws the same plants withered (as the game does at any quality: D242 as amended 2026-10-29), its own objects
  // dead, and High again the same
  const dry24 = await withered();
  const drawnDead = () => page.evaluate(() => (window.dgm3d!.renderer as unknown as { witheredDrawn: number }).witheredDrawn);
  await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("standard", false));
  expect(await withered()).toBe(dry24);
  await expect.poll(drawnDead, { timeout: 30_000 }).toBe(dry24);
  await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("high", false));
  expect(await withered()).toBe(dry24);
  // back to day 9 and Day 0: nothing dead yet
  await goTo(9);
  await expect.poll(withered, { timeout: 30_000 }).toBe(0);
  await goTo(0);
  expect(await withered()).toBe(0);
  await expect.poll(dying, { timeout: 30_000 }).toBe(0);
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(bar.getByRole("button", { name: "Drought" })).toHaveAttribute("aria-pressed", "false");

  // a badtide: contamination that stays two days kills any plant, so the plants on poisoned ground are dead; Day 0 has none
  await bar.getByRole("button", { name: "Badtide" }).click();
  await expect(day).not.toHaveClass(/counting/, { timeout: 180_000 });
  await expect.poll(withered, { timeout: 30_000 }).toBeGreaterThan(20);
  await goTo(0);
  await expect.poll(withered, { timeout: 30_000 }).toBe(0);
  await bar.getByRole("button", { name: "Badtide" }).click();
  await expect(bar.getByRole("button", { name: "Badtide" })).toHaveAttribute("aria-pressed", "false");
  expect(await withered()).toBe(0);
  expect(errors).toEqual([]);
});

test("a held drought or badtide turns the haze to the game's fog colour for it, in both looks; Day 0 and no day the temperate fog (D250 as amended)", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley&bw=0");
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.waterSettled()), { timeout: 60_000 }).toBe(true);
  await opensHigh(page);
  // (the game's daytime fogs, Sun.blueprint: temperate, drought, badtide)
  const TEMPERATE = [0.447, 0.761, 0.824];
  const DROUGHT = [0.706, 0.549, 0.376];
  const BADTIDE = [0.698, 0.439, 0.349];
  const haze = async () => (await page.evaluate(() => window.dgm3d!.renderer.hazeNow)).map((v) => Math.round(v * 1000) / 1000);
  const bar = page.getByRole("toolbar", { name: "Water time" });
  const day = bar.locator(".day-label");
  expect(await haze()).toEqual(TEMPERATE);

  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(day).not.toHaveClass(/counting/, { timeout: 180_000 });
  await expect.poll(haze, { timeout: 30_000 }).toEqual(DROUGHT);
  // the same in Standard
  await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("standard", false));
  expect(await haze()).toEqual(DROUGHT);
  await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("high", false));
  expect(await haze()).toEqual(DROUGHT);
  // Day 0 is the map as it is
  await day.dblclick();
  await bar.getByRole("textbox", { name: "Day" }).fill("0");
  await bar.getByRole("textbox", { name: "Day" }).press("Enter");
  await expect(day).toHaveText("Day 0");
  await expect.poll(haze, { timeout: 30_000 }).toEqual(TEMPERATE);
  // and the badtide has its own
  await bar.getByRole("button", { name: "Badtide" }).click();
  await expect(day).not.toHaveClass(/counting/, { timeout: 180_000 });
  await expect.poll(haze, { timeout: 30_000 }).toEqual(BADTIDE);
  await bar.getByRole("button", { name: "Badtide" }).click();
  await expect(bar.getByRole("button", { name: "Badtide" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(haze, { timeout: 30_000 }).toEqual(TEMPERATE);
  // (every shader compiled and nothing threw)
  expect(errors).toEqual([]);
});

test("clean water and badwater a level and a half deep, by day, as drawn through the shipped shaders: badwater the darker in both looks (D496)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=5&z=128&d=n&t=lakeBasin");
  // two pools side by side on the same moist ground, 1.5 levels deep, one clean and one pure badwater (its floor
  // contaminated, as the game's would be), seen as the probe's start shots see their water (the pixel judge's fitted
  // cameras: about 53° down, about 100 away) in the day's light, through the shipped shaders, fog and finish
  const gaps = await page.evaluate(async () => {
    const r = window.dgm3d!.renderer;
    const W = 64;
    const H = 40;
    const heights = new Uint8Array(W * H).fill(4);
    const tile: number[] = [];
    const cont: number[] = [];
    const soilC = new Uint8Array(W * H);
    const pool = (x: number, y: number) => (y >= 8 && y < 32 && x >= 6 && x < 30 ? 0 : y >= 8 && y < 32 && x >= 34 && x < 58 ? 1 : -1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = pool(x, y);
        if (p < 0) continue;
        const i = y * W + x;
        heights[i] = 2;
        tile.push(i);
        cont.push(p);
        if (p) soilC[i] = 255;
      }
    const e = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0), strength: new Float32Array(0), ids: [] };
    (r as unknown as { setMap(m: unknown, keep: boolean): void }).setMap(
      {
        W,
        H,
        heights,
        columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) },
        entities: e,
        soil: { moisture: new Uint8Array(W * H).fill(200), contamination: soilC },
        water: { count: tile.length, tile: Int32Array.from(tile), floor: new Float32Array(tile.length).fill(2), depth: new Float32Array(tile.length).fill(1.5), contamination: Float32Array.from(cont) },
      },
      true,
    );
    const out: Record<string, { clean: number; bad: number }> = {};
    for (const look of ["standard", "high"] as const) {
      r.setLookChoice(look, false);
      if (look === "high") for (let k = 0; k < 600 && !r.highSettled; k++) await new Promise((res) => setTimeout(res, 100));
      r.setClock(12.5);
      r.setView({ mode: "orbit", yaw: 0, pitch: (53 * Math.PI) / 180, distance: 100, target: [W / 2, 3.5, -H / 2] });
      for (let k = 0; k < 3; k++) {
        r.renderNow();
        await new Promise((res) => requestAnimationFrame(() => res(null)));
      }
      r.renderNow();
      const g = (r as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext();
      const GW = g.drawingBufferWidth;
      const GH = g.drawingBufferHeight;
      const px = new Uint8Array(GW * GH * 4);
      g.readPixels(0, 0, GW, GH, g.RGBA, g.UNSIGNED_BYTE, px);
      const s = GW / r.canvas.clientWidth;
      const lstar = (o: number) => {
        const lin = [px[o], px[o + 1], px[o + 2]].map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
        const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
        return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y;
      };
      const sums = [0, 0];
      const ns = [0, 0];
      // (each pool's tiles three or more from its banks, so no ground shows at a bank)
      for (let y = 11; y < 29; y++)
        for (let x = 0; x < W; x++) {
          const p = pool(x, y);
          if (p < 0 || pool(x - 3, y) !== p || pool(x + 3, y) !== p) continue;
          const q = r.project(x + 0.5, 3.5, -(y + 0.5));
          if (!q.visible) continue;
          const cx = Math.round(q.x * s);
          const cy = GH - 1 - Math.round(q.y * s);
          if (cx < 2 || cy < 2 || cx >= GW - 2 || cy >= GH - 2) continue;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) (sums[p] += lstar(((cy + dy) * GW + cx + dx) * 4)), ns[p]++;
        }
      out[look] = { clean: sums[0] / ns[0], bad: sums[1] / ns[1] };
    }
    return out;
  });
  // the order, in both looks. The size of the gap is judged against the game's own frames, where the game drew the
  // same water (tools/water-pixel-judge.ts, "the gap by day"; waterPalette.ts WATER_LIGHT.gap): this scene the game
  // never drew, and its clean water over its moist bed reads darker than the shots' (about 28 against 31 to 33.5)
  console.log(`the gap by day, as drawn: ${JSON.stringify(gaps)}`);
  for (const look of ["standard", "high"] as const) expect(gaps[look].clean - gaps[look].bad).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
