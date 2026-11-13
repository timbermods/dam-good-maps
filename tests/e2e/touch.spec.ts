// Touch in the 3D view (#1074, slice 1; render3d/touch.ts): real touch events, sent through Chrome's input pipeline
// (CDP `Input.dispatchTouchEvent`), at a phone's two sizes (three device pixels to a CSS pixel, the page shrunk to fit
// as a phone shows it) and on a desktop with a touch screen. One finger with nothing in hand pans the map with it; a
// tap reads the tile; a double tap zooms in on the spot; two fingers pinch about the ground under them (it stays under
// them), twist the view with them and, side by side, tilt it; one finger with a brush paints, the ring under it; a
// second finger during the stroke cancels it, nothing applied and no step; a two-finger tap undoes, a three-finger tap
// redoes; and the browser never zooms or scrolls the page. The arithmetic is touch.test's.

import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { openEditor } from "./open";
import { toolInHand, toolPutAway } from "./helpers";

interface P {
  x: number;
  y: number;
}

const SIZES = [
  { name: "phone upright", viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true },
  { name: "phone on its side", viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true },
  { name: "desktop with a touch screen", viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, isMobile: false },
];

const view = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.getView());
const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const settled = (page: Page) => page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
/** The tile under a point of the page (client coordinates). */
const tileAt = (page: Page, p: P) => page.evaluate(([x, y]) => window.dgm3d!.renderer.pick(x, y), [p.x, p.y] as const);
/** How far apart two points of the ground are, in tiles (across the map: east and south). */
const tiles = (a: { point: [number, number, number] } | null, b: { point: [number, number, number] } | null) => (a && b ? Math.hypot(a.point[0] - b.point[0], a.point[2] - b.point[2]) : Infinity);
/** The view has stopped: no glide after a flick or a double tap is still moving it. */
async function still(page: Page) {
  await expect.poll(() => page.evaluate(() => !window.dgm3d!.renderer.touchGliding), { timeout: 10_000 }).toBe(true);
  let last = JSON.stringify(await view(page));
  await expect
    .poll(async () => {
      const now = JSON.stringify(await view(page));
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

/** Fingers on the touch screen. Points are client coordinates (CSS pixels of the page); `scale` and `offset` turn them
 *  into the screen's (a phone shrinks the page to fit: its visual viewport is scaled). Each event carries its own time,
 *  a frame after the one before (`pause` waits longer), so a tap's length and a double tap's gap are the spec's, not
 *  how busy the machine drawing a phone's three device pixels is. */
class Fingers {
  private on = new Map<number, P>();
  private clock = Date.now() / 1000;
  scale = 1;
  offset = { x: 0, y: 0 };
  constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
  ) {}

  /** Sends the fingers as they are now (all of it before the first await: sends not awaited one by one go in order). */
  private async send(): Promise<void> {
    const pts = [...this.on].map(([id, p]) => ({ id, x: (p.x - this.offset.x) * this.scale, y: (p.y - this.offset.y) * this.scale, radiusX: 4, radiusY: 4, force: 1 }));
    // (the protocol's points are every finger still down: one gone is a finger lifted)
    this.clock += 0.016;
    const timestamp = this.clock;
    const type = !pts.length ? "touchEnd" : this.fresh ? "touchStart" : "touchMove";
    this.fresh = false;
    await this.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts, timestamp });
  }
  private fresh = false;

  async down(fingers: Record<number, P>): Promise<void> {
    for (const [id, p] of Object.entries(fingers)) this.on.set(Number(id), p);
    this.fresh = true;
    await this.send();
  }

  async move(fingers: Record<number, P>): Promise<void> {
    for (const [id, p] of Object.entries(fingers)) this.on.set(Number(id), p);
    await this.send();
  }

  async up(...ids: number[]): Promise<void> {
    for (const id of ids) this.on.delete(id);
    await this.send();
  }

  /** Move fingers from where they are to `to` in `steps` even steps, a frame apart on the fingers' clock, as a finger
   *  sends them: it doesn't wait for the page to take each one (where a frame takes a second, as on a slow runner
   *  drawing in software, the page reads the moves that came meanwhile together, as it does a phone's), and the page has
   *  them all when this returns (a frame begins with its input). */
  async drag(to: Record<number, P>, steps = 10): Promise<void> {
    const from = new Map([...this.on]);
    const sent: Promise<void>[] = [];
    for (let k = 1; k <= steps; k++) {
      const at: Record<number, P> = {};
      for (const [id, q] of Object.entries(to)) {
        const p = from.get(Number(id))!;
        at[Number(id)] = { x: p.x + ((q.x - p.x) * k) / steps, y: p.y + ((q.y - p.y) * k) / steps };
      }
      sent.push(this.move(at));
    }
    await Promise.all(sent);
    await this.page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }

  /** Lift every finger and wait `ms`, on the fingers' clock and the page's. */
  async pause(ms: number): Promise<void> {
    this.clock += ms / 1000;
    await this.page.waitForTimeout(ms);
  }

  async tap(...points: P[]): Promise<void> {
    await this.down(Object.fromEntries(points.map((p, i) => [i + 1, p])));
    await this.up(...points.map((_, i) => i + 1));
  }

  /** Learn how the screen's points map to the page's: a finger's press is seen where it lands. */
  async calibrate(a: P, b: P): Promise<void> {
    await this.page.evaluate(() => {
      const w = window as unknown as { seen: P[] };
      w.seen = [];
      window.addEventListener("pointerdown", (e) => w.seen.push({ x: e.clientX, y: e.clientY }), { capture: true });
    });
    const vv = await this.page.evaluate(() => ({ scale: window.visualViewport!.scale, x: window.visualViewport!.offsetLeft, y: window.visualViewport!.offsetTop }));
    this.scale = vv.scale;
    this.offset = { x: vv.x, y: vv.y };
    for (const p of [a, b]) {
      await this.tap(p);
      // (no double tap)
      await this.pause(400);
    }
    const seen = await this.page.evaluate(() => (window as unknown as { seen: P[] }).seen);
    expect(seen.length).toBe(2);
    for (const [k, p] of [a, b].entries()) {
      expect(Math.abs(seen[k].x - p.x)).toBeLessThan(2);
      expect(Math.abs(seen[k].y - p.y)).toBeLessThan(2);
    }
    await still(this.page);
  }
}

/** A place on the 3D view with room round it: the point and every point `r` away (and the corners between) are the
 *  canvas itself (no control over it) and show the map. */
async function roomy(page: Page, r: number): Promise<P> {
  // (a phone on its side in today's layout has no such place: the rows over the view cover all of it but slivers, which
  // the phone layouts change, #1074 slice 2; there the controls over the view are hidden, so the fingers reach it)
  if (!(await spot(page, r)))
    await page.addStyleTag({ content: ".view3d > :not(canvas), .view3d-frame > :not(.view3d) { visibility: hidden !important; }" });
  const p = await spot(page, r);
  expect(p, `room of ${r}px on the view`).not.toBeNull();
  return p!;
}

async function spot(page: Page, r: number): Promise<P | null> {
  return page.evaluate((r) => {
    const c = window.dgm3d!.renderer.canvas;
    const box = c.getBoundingClientRect();
    const x0 = Math.max(box.left, 0);
    const y0 = Math.max(box.top, 0);
    const x1 = Math.min(box.right, document.documentElement.clientWidth);
    const y1 = Math.min(box.bottom, document.documentElement.clientHeight);
    const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    const ok = (x: number, y: number) => document.elementFromPoint(x, y) === c && !!window.dgm3d!.renderer.pick(x, y);
    const around = [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => [i * r, j * r] as const));
    const tries: { x: number; y: number }[] = [];
    for (let y = y0 + r + 4; y <= y1 - r - 4; y += 12) for (let x = x0 + r + 4; x <= x1 - r - 4; x += 12) tries.push({ x, y });
    tries.sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y));
    return tries.find((t) => around.every(([dx, dy]) => ok(t.x + dx, t.y + dy))) ?? null;
  }, r);
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor, isMobile: size.isMobile, hasTouch: true });

    test(`touch moves the camera, paints, cancels, undoes and redoes (${size.viewport.width}×${size.viewport.height})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
      // (the first hints closed, as a tap on their close would; the page where it opens, and the map filling the part of
      // the view a phone shows: in today's layout most of a phone's view is under the controls, #1074 slice 2)
      await page.evaluate(() => {
        document.querySelector<HTMLButtonElement>('button[aria-label="No more hints"]')?.click();
        window.scrollTo(0, 0);
      });
      await page.evaluate(() => {
        const r = window.dgm3d!.renderer;
        const m = r.mapState()!;
        r.setView({ target: [m.W / 2, r.getView().target[1], -m.H / 2], distance: 48 });
        const box = r.canvas.getBoundingClientRect();
        const x = (Math.max(box.left, 0) + Math.min(box.right, document.documentElement.clientWidth)) / 2;
        const y = (Math.max(box.top, 0) + Math.min(box.bottom, document.documentElement.clientHeight)) / 2;
        const at = r.tileToClient(Math.floor(m.W / 2), Math.floor(m.H / 2));
        r.panPixels(x - at.x, y - at.y);
      });
      const zoomed = () => page.evaluate(() => ({ scale: window.visualViewport!.scale, x: window.scrollX, y: window.scrollY }));
      const page0 = await zoomed();

      const cdp = await page.context().newCDPSession(page);
      // (DGM_E2E_CPU_THROTTLE=4 runs it as a slow runner or a slow phone does: every gesture times itself from its events)
      const throttle = Number(process.env.DGM_E2E_CPU_THROTTLE ?? 0);
      if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      const fingers = new Fingers(page, cdp);
      const R = Math.min(90, Math.floor(Math.min(size.viewport.width, size.viewport.height) / 7));
      let c = await roomy(page, R);
      await fingers.calibrate({ x: c.x - R / 2, y: c.y }, { x: c.x + R / 2, y: c.y });

      // one finger, nothing in hand: the map moves with it (the ground under it at the press is near it at the end)
      const v0 = await view(page);
      const a = { x: c.x - R / 2, y: c.y - R / 2 };
      const b = { x: c.x + R / 2, y: c.y + R / 3 };
      const underA = await tileAt(page, a);
      const underB = await tileAt(page, b);
      await fingers.down({ 1: a });
      await fingers.drag({ 1: b });
      expect(tiles(await tileAt(page, b), underA)).toBeLessThan(tiles(underB, underA) / 3);
      await fingers.up(1);
      await still(page);
      expect((await view(page)).target).not.toEqual(v0.target);
      expect((await view(page)).yaw).toBe(v0.yaw);

      // a pinch apart zooms in about the ground under the fingers' middle, which stays under it (each gesture from the
      // same distance, not wherever the glide after the one before ended: a flick's glide is as long as the machine is
      // slow, and how near the ground the camera is changes how a finger's ground follows it)
      await page.evaluate(() => window.dgm3d!.renderer.setView({ distance: 48 }));
      c = await roomy(page, R);
      let under = await tileAt(page, c);
      let d0 = (await view(page)).distance;
      await fingers.down({ 1: { x: c.x - R / 3, y: c.y }, 2: { x: c.x + R / 3, y: c.y } });
      await fingers.drag({ 1: { x: c.x - R, y: c.y }, 2: { x: c.x + R, y: c.y } });
      expect((await view(page)).distance).toBeLessThan(d0 * 0.6);
      expect(tiles(await tileAt(page, c), under)).toBeLessThanOrEqual(1);
      await fingers.up(1, 2);
      await still(page);

      // a twist turns the view with the fingers (clockwise, clockwise), about the ground under their middle
      await page.evaluate(() => window.dgm3d!.renderer.setView({ distance: 48 }));
      c = await roomy(page, R);
      under = await tileAt(page, c);
      const yaw0 = (await view(page)).yaw;
      const turn = Math.PI / 6;
      const at = (s: number) => ({ x: c.x + s * R * Math.cos(turn), y: c.y + s * R * Math.sin(turn) });
      const ground = await tileAt(page, { x: c.x + R, y: c.y });
      await fingers.down({ 1: { x: c.x - R, y: c.y }, 2: { x: c.x + R, y: c.y } });
      await fingers.drag({ 1: at(-1), 2: at(1) });
      expect((await view(page)).yaw - yaw0).toBeCloseTo(turn, 1);
      expect(tiles(await tileAt(page, c), under)).toBeLessThanOrEqual(1);
      // (the ground under a finger went round with it: nearer it than to where it was)
      const went = await tileAt(page, at(1));
      expect(tiles(went, ground)).toBeLessThan(tiles(await tileAt(page, { x: c.x + R, y: c.y }), ground));
      await fingers.up(1, 2);
      await still(page);

      // two fingers side by side dragged up together tilt the view toward the horizon (down: toward straight down)
      await page.evaluate(() => window.dgm3d!.renderer.setView({ distance: 48 }));
      c = await roomy(page, R);
      const p0 = (await view(page)).pitch;
      const up = p0 > 0.6 ? -1 : 1;
      await fingers.down({ 1: { x: c.x - R, y: c.y }, 2: { x: c.x + R, y: c.y } });
      await fingers.drag({ 1: { x: c.x - R, y: c.y + up * R * 0.8 }, 2: { x: c.x + R, y: c.y + up * R * 0.8 } });
      await fingers.up(1, 2);
      await still(page);
      expect(((await view(page)).pitch - p0) * up).toBeGreaterThan(0.15);

      // a tap reads the tile (the readout stays once the finger is gone); a double tap zooms in on the spot (from a
      // distance the zoom's limit leaves room below)
      await page.evaluate(() => window.dgm3d!.renderer.setView({ distance: 48 }));
      c = await roomy(page, R);
      await fingers.tap(c);
      await expect(page.locator(".readout").first()).toContainText(/Height|Water/);
      await fingers.pause(400);
      await expect(page.locator(".readout").first()).toContainText(/Height|Water/);
      under = await tileAt(page, c);
      d0 = (await view(page)).distance;
      await fingers.tap(c);
      await fingers.tap(c);
      await still(page);
      expect((await view(page)).distance).toBeLessThan(d0 * 0.6);
      expect(tiles(await tileAt(page, c), under)).toBeLessThanOrEqual(1);

      // one finger with a brush paints, the ring under it while it is down; one step
      await page.keyboard.press("2");
      await toolInHand(page);
      c = await roomy(page, R);
      const before = await heights(page);
      const steps = (await info(page)).history.length;
      await fingers.down({ 1: { x: c.x - R / 2, y: c.y } });
      await fingers.drag({ 1: { x: c.x + R / 2, y: c.y } });
      expect(await page.evaluate(() => window.dgm3d!.renderer.brushCursorState)).not.toBeNull();
      await fingers.up(1);
      await settled(page);
      const painted = await heights(page);
      expect(painted).not.toEqual(before);
      let i = await info(page);
      expect(i.history.length).toBe(steps + 1);
      expect(i.history.at(-1)!.label).toMatch(/^Raise /);
      expect(await page.evaluate(() => window.dgm3d!.renderer.brushCursorState)).toBeNull();

      // a second finger during a stroke cancels it, nothing applied and no step, and moves the camera
      const v1 = await view(page);
      await fingers.down({ 1: { x: c.x - R / 2, y: c.y + R / 2 } });
      await fingers.drag({ 1: { x: c.x + R / 2, y: c.y + R / 2 } });
      expect(await heights(page)).not.toEqual(painted);
      await fingers.down({ 2: { x: c.x - R / 2, y: c.y - R / 2 } });
      await fingers.drag({ 1: { x: c.x + R, y: c.y + R }, 2: { x: c.x - R, y: c.y - R } });
      await fingers.up(1, 2);
      await still(page);
      await settled(page);
      expect(await heights(page)).toEqual(painted);
      expect((await info(page)).history.length).toBe(steps + 1);
      expect((await view(page)).distance).toBeLessThan(v1.distance);

      // a two-finger tap undoes one step; a three-finger tap redoes it (the brush still in hand)
      await fingers.pause(400);
      await fingers.tap({ x: c.x - R / 2, y: c.y }, { x: c.x + R / 2, y: c.y });
      await settled(page);
      expect(await heights(page)).toEqual(before);
      i = await info(page);
      expect(i.history.length).toBe(steps + 1);
      expect(i.history.at(-1)!.applied).toBe(false);
      await fingers.tap({ x: c.x - R / 2, y: c.y }, { x: c.x, y: c.y + R / 2 }, { x: c.x + R / 2, y: c.y });
      await settled(page);
      expect(await heights(page)).toEqual(painted);
      expect((await info(page)).history.at(-1)!.applied).toBe(true);
      await page.keyboard.press("Escape");
      await toolPutAway(page);

      // the browser never zoomed or scrolled the page
      expect(await zoomed()).toEqual(page0);
      expect(errors).toEqual([]);
    });
  });
}
