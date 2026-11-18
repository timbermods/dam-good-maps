// The High look itself (Map look 2, PLAN §20 D284): on a computer with a GPU it is the default, the look's menu switches
// between it and Standard (remembered), each of its effects switches, the Standard look is the same after High as before
// it, the automatic choice falls back to Standard when frames stay too slow (simulated here), remembering it, and the
// game's bloom is drawn only when something can pass its knee. What High draws, checked as drawn (contamination's veins,
// the water's depth, an eruption, the sources' highlights, the seasons, the haze), is look-high-scenes.spec.ts: the two
// were one file whose fourteen tests, a minute each on CI's software drawing, took 17 minutes of a browser shard and with
// the layout specs beside it ran that shard past its 30 (#236, 2026-11-18). A file stays whole in one shard
// (playwright.config.ts, ci.yml), so two files of five and nine tests let the shards share them. What the two share is
// look-high-shared.ts. Its maps are saved (`openSaved`): the page's own map of each fragment, as generator 0.10.26 made it.

import { expect, test } from "@playwright/test";
import { waitForEditor } from "./open";
import { frames, holdsAGpu, look, open, opensHigh } from "./look-high-shared";

// the automatic choice, not the Standard look the other tests hold (playwright.config.ts)
test.use({ storageState: { cookies: [], origins: [] } });

// (its tests run one after another on one worker, never two at once: each draws High, which on CI's software drawing
// costs 2 to 3 s a frame, and two of them side by side on the runner's four cores took the slow-frames test past its
// budget, run 40601987187. Any other spec beside it does the same (run 42592717654), so CI runs its browser shards on
// one worker each: playwright.config.ts, ci.yml.)

test.beforeEach(async ({ page }) => {
  await holdsAGpu(page);
});

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
  // (the patterns are made in a worker of their own after the view opens, flat at their means until then: made before the
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

test("the game's bloom is drawn only when something can pass its knee, and skipping it by day changes no pixel; a start's fire blooms, its source drawn round the start alone (D497 as amended 2026-11-08, D453, D496)", async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await opensHigh(page);
  for (const choice of ["high", "standard"] as const) {
    await page.evaluate((c) => window.dgm3d!.renderer.setLookChoice(c), choice);
    const day = await page.evaluate(() => {
      type Bloom = { up: { texture: unknown; width: number; height: number }[]; down: { width: number; height: number }[]; apply(gl: unknown): void };
      const r = window.dgm3d!.renderer as unknown as {
        blooms(): boolean;
        fireShows(): boolean;
        fireBox(cam: unknown): unknown;
        bloomRect(cam: unknown): unknown;
        camera(): { matrixWorld: { elements: number[] } };
        startLightsOn: number;
        bloom: Bloom | null;
        gl: { getContext(): WebGL2RenderingContext; setRenderTarget(t: unknown): void };
        map: { entities: { count: number; templates: string[]; template: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>; z: ArrayLike<number> } };
        setView(v: unknown): void;
        setClock(h: number): void;
        renderNow(): void;
        placeCamera(): void;
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
      const differ = (a: Uint8Array, b: Uint8Array, by = 0) => {
        let n = 0;
        for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > by) n++;
        return n;
      };
      // (a method of the view's, put back as it was)
      const swap = <K extends "blooms" | "fireBox" | "bloomRect">(k: K, f: (typeof r)[K]) => {
        const own = Object.getOwnPropertyDescriptor(r, k);
        r[k] = f;
        return () => {
          if (own) Object.defineProperty(r, k, own);
          else delete (r as Partial<typeof r>)[k];
        };
      };
      const e = r.map.entities;
      let at: number[] = [48, 2, -48];
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "StartingLocation") at = [e.x[k] + 0.5, e.z[k], -(e.y[k] + 0.5)];
      // the start up close by day, its marker the brightest model there is
      r.setClock(12.5);
      r.setView({ mode: "orbit", yaw: -Math.PI / 6, pitch: 0.6, distance: 11, target: at });
      // its fire and its light, which pass the knee, out: below
      const lights = r.startLightsOn;
      r.startLightsOn = 0;
      const noFire = swap("fireBox", () => null);
      const skipped = r.blooms();
      // drawn anyway: what the game's passes make of it, and the canvas just before them and just after, in one frame
      // (two redraws of a still frame can differ by a level here and there, the bloom aside)
      const forced = swap("blooms", () => true);
      (r as unknown as { fire: { mesh: { visible: boolean } } }).fire.mesh.visible = false;
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
      forced();
      noFire();
      (r as unknown as { fire: { mesh: { visible: boolean } } }).fire.mesh.visible = true;
      r.startLightsOn = lights;
      let most = 0;
      for (let i = 0; i < lift.length; i += 4) most = Math.max(most, lift[i], lift[i + 1], lift[i + 2]);
      // with its fire burning and its light on, its lantern in view (the start's middle 1 tile in from the entrance
      // corner, its bowl 3.2 up): the bloom is drawn, from a source drawn round the start alone, and the frame is what
      // the whole frame's source makes of it
      // (3.55 from the bowl, asked for: the frame these numbers were measured on. The view asked for 11, but on seed
      // 4242's land before generator 0.10.24 the rock behind held the camera at 3.55; 0.10.24's round forms (#1102, D148)
      // took that rock away, the camera stood at 11 and the lantern, a sixth as wide, lifted 71,716 bytes)
      r.setView({ mode: "orbit", yaw: -Math.PI / 6, pitch: 0.5, distance: 3.55, target: [at[0] - 1, at[1] + 3.2, at[2] - 1] });
      canvas();
      const fireBlooms = r.blooms();
      const boxed = canvas();
      const whole = swap("bloomRect", () => null);
      const full = canvas();
      whole();
      const off = swap("blooms", () => false);
      const none = canvas();
      off();
      // panned sideways until the bowl has left the frame: its glow still reaches over the frame's edge, so the bloom
      // is drawn while the start's box overlaps the frame, and not once it has gone. (The camera is placed at each step,
      // never drawn: whether a frame blooms is the camera's alone, and a High frame drawn at each of the 100 and more
      // steps took the test past 180 s on CI's software drawing, run 43676703173.)
      const right = r.camera().matrixWorld.elements.slice(0, 3);
      let edge: boolean | null = null;
      let gone: boolean | null = null;
      for (let s = 0; s < 30 && gone === null; s += 0.05) {
        r.setView({ mode: "orbit", yaw: -Math.PI / 6, pitch: 0.5, distance: 3.55, target: [at[0] - 1 - right[0] * s, at[1] + 3.2 - right[1] * s, at[2] - 1 - right[2] * s] });
        r.placeCamera();
        if (edge === null && !r.fireShows()) edge = r.blooms();
        if (edge !== null && !r.fireBox(r.camera())) gone = r.blooms();
      }
      return { skipped, differ: differ(without, withIt), most, read: without.length > 0 && withIt.length === without.length, fireBlooms, lifted: differ(none, boxed, 1), boxApart: differ(boxed, full, 1), edge, gone };
    });
    // by day nothing passes the knee but a start's fire and its light: without them the passes are skipped, they would
    // have made nothing, and the frame is the same to the byte with them or without
    expect(day.skipped, choice).toBe(false);
    expect(day.read, choice).toBe(true);
    expect(day.most, choice).toBe(0);
    expect(day.differ, JSON.stringify({ choice, ...day })).toBe(0);
    // with them the bloom is drawn and lifts the lantern (some 530,000 bytes of the frame by 2 levels or more), its
    // source drawn round the start alone as the whole frame's: they differ by no more than two redraws of the whole
    // frame do in High (8 to 12 bytes by 2 levels; a box that missed part of the source would lose thousands)
    expect(day.fireBlooms, choice).toBe(true);
    expect(day.lifted, choice).toBeGreaterThan(100_000);
    expect(day.boxApart, JSON.stringify({ choice, ...day })).toBeLessThan(64);
    expect(day.edge, choice).toBe(true);
    expect(day.gone, choice).toBe(false);
  }
  expect(errors).toEqual([]);
});
