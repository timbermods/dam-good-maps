// Touch in the 3D view (#1074, slice 1; render3d/touch.ts): real touch events, sent through Chrome's input pipeline
// (CDP `Input.dispatchTouchEvent`), at a phone's two sizes (three device pixels to a CSS pixel, the page shrunk to fit
// as a phone shows it) and on a desktop with a touch screen. One finger with nothing in hand pans the map with it; a
// tap reads the tile; a double tap zooms in on the spot; two fingers pinch about the ground under them (it stays under
// them), twist the view with them and, side by side, tilt it; one finger with a brush paints, the ring under it; a
// second finger during the stroke cancels it, nothing applied and no step; a two-finger tap undoes, a three-finger tap
// redoes; and the browser never zooms or scrolls the page. With something in hand that shows before it applies (slice 3:
// an object, a force, the Block tool, a shape, an object picked on the map), a press shows it a little above the finger,
// a drag moves it, the lift applies it, and nothing before; a refusal's reason shows beside it and the lift applies
// nothing; a second finger, or the finger lifted on Cancel, lets it go; and a double tap on an object picks it with the
// first tap and still zooms with the second. Slice 3b: a force's line and the Block tool's sweep are drawn by the drag (held
// still, the lift is their click), a force's ring is filled while a finger aims it, a picked object dragged where it can't
// go shows the reason before the lift, and a finger held still with nothing in hand draws a selection. The arithmetic is
// touch.test's.

import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { openEditor } from "./open";
import { toolInHand, toolPutAway } from "./helpers";
import { FINGER_LIFT, HOLD_MS } from "../../src/render3d/touch";

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
/** The view has stopped: no glide after a flick or a double tap is still moving it, and on a phone the slide for a sheet
 *  that opened or closed has come and gone (it starts a few frames after the sheet changes, usePhone.ts: a view read
 *  before it starts is moved by it after). */
async function still(page: Page) {
  await expect.poll(() => page.evaluate(() => !window.dgm3d!.renderer.touchGliding && window.dgmEditor!.roomSettled()), { timeout: 10_000 }).toBe(true);
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
    await this.taken();
  }

  async move(fingers: Record<number, P>): Promise<void> {
    await this.step(fingers);
    await this.taken();
  }

  /** A move sent, not waited for the page to take (`drag`'s steps). */
  private step(fingers: Record<number, P>): Promise<void> {
    for (const [id, p] of Object.entries(fingers)) this.on.set(Number(id), p);
    return this.send();
  }

  async up(...ids: number[]): Promise<void> {
    const lifted = ids.map((id) => ({ id, ...this.on.get(id)! }));
    for (const id of ids) this.on.delete(id);
    if (!this.on.size) await this.send();
    else {
      // (some lifted, some still down: the protocol lifts a finger only by its own touchEnd, which names it; a move
      // without it leaves it down)
      this.clock += 0.016;
      const touchPoints = lifted.map((p) => ({ id: p.id, x: (p.x - this.offset.x) * this.scale, y: (p.y - this.offset.y) * this.scale }));
      await this.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints, timestamp: this.clock });
    }
    await this.taken();
  }

  /** Wait until the page has taken what was sent: its pointers (`calibrate` watches them) are the fingers now down, each
   *  where its finger is, and the handlers of every event up to there have run. The protocol answers a send when the
   *  browser has the event, not when the page has run it: on a busy page the last move of a drag can reach it after a
   *  frame that began once the send was answered, and a read of the view, or a poll for a glide, made meanwhile finds the
   *  page before it. */
  private async taken(): Promise<void> {
    const want = [...this.on.values()];
    try {
      await this.page.waitForFunction(
        (want) => {
          const here = [...(window as unknown as { pointersNow: Map<number, P> }).pointersNow.values()];
          return here.length === want.length && want.every((q) => here.some((p) => Math.abs(p.x - q.x) < 3 && Math.abs(p.y - q.y) < 3));
        },
        want,
        { timeout: 30_000, polling: 20 },
      );
    } catch (e) {
      const here = await this.page.evaluate(() => [...(window as unknown as { pointersNow: Map<number, P> }).pointersNow.values()]);
      throw new Error(`the page never took the fingers: sent ${JSON.stringify(want)}, its pointers ${JSON.stringify(here)} (${String(e).split("\n")[0]})`);
    }
  }

  /** Move fingers from where they are to `to` in `steps` even steps, a frame apart on the fingers' clock, as a finger
   *  sends them: it doesn't wait for the page to take each one (where a frame takes a second, as on a slow runner
   *  drawing in software, the page reads the moves that came meanwhile together, as it does a phone's), and the page has
   *  them all when this returns (`taken`). */
  async drag(to: Record<number, P>, steps = 10): Promise<void> {
    const from = new Map([...this.on]);
    const sent: Promise<void>[] = [];
    for (let k = 1; k <= steps; k++) {
      const at: Record<number, P> = {};
      for (const [id, q] of Object.entries(to)) {
        const p = from.get(Number(id))!;
        at[Number(id)] = { x: p.x + ((q.x - p.x) * k) / steps, y: p.y + ((q.y - p.y) * k) / steps };
      }
      sent.push(this.step(at));
    }
    await Promise.all(sent);
    await this.taken();
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
      const w = window as unknown as { seen: P[]; pointersNow: Map<number, P> };
      w.seen = [];
      w.pointersNow = new Map();
      window.addEventListener("pointerdown", (e) => w.seen.push({ x: e.clientX, y: e.clientY }), { capture: true });
      // (where the page has each finger now: a finger's moves reach the page after the protocol has answered for them)
      for (const type of ["pointerdown", "pointermove"]) window.addEventListener(type, (e) => w.pointersNow.set((e as PointerEvent).pointerId, { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY }), { capture: true });
      for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, (e) => w.pointersNow.delete((e as PointerEvent).pointerId), { capture: true });
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


type Size = (typeof SIZES)[number];

/** The editor open on a 96² River Valley, its first hints closed, the view centred at a distance of 48 (the objects hidden
 *  with `hide`), and fingers on its touch screen, calibrated. `R`: the room the gestures take round a point (CSS px). */
async function setUp(page: Page, size: Size, hide: boolean) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  // (the first hints closed, as a tap on their close would; the page where it opens)
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('button[aria-label="No more hints"]')?.click();
    window.scrollTo(0, 0);
  });
  // (the camera's gestures on the land alone: what a finger lands on never changes a gesture, but a tap on an object picks
  // it, and the picked object is then what a one-finger press moves; the objects' own presses are the slice-3 test's)
  // (on a phone the toggle is in the Show sheet, #1074 slice 2: opened and closed by its button, as a player does)
  if (hide) {
    const showButton = page.locator(".phone-show-button");
    const onPhone = await showButton.isVisible();
    if (onPhone) {
      await showButton.tap();
      await expect(page.locator(".phone-show")).toBeVisible();
    }
    await page.getByRole("checkbox", { name: "Hide objects" }).click();
    if (onPhone) {
      await showButton.tap();
      await expect(page.locator(".phone-show")).toBeHidden();
    }
    await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.objectsHidden)).toBe(true);
  }
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
  const c = await roomy(page, R);
  await fingers.calibrate({ x: c.x - R / 2, y: c.y }, { x: c.x + R / 2, y: c.y });
  return { fingers, R, errors, zoomed, page0 };
}

/** A finger held still long enough to be no tap, and to start a selection with nothing in hand (render3d/touch.ts). */
const TAP_HOLD = HOLD_MS + 200;
/** Where a finger at `p` aims with something in hand: a little above it (render3d/touch.ts). */
const aimOf = (p: P): P => ({ x: p.x, y: p.y - FINGER_LIFT });
/** The editor's history's length, and its last step's label. */
const steps = async (page: Page) => (await info(page)).history.length;
const lastLabel = async (page: Page) => (await info(page)).history.at(-1)?.label ?? "";
/** Whether a finger's press with something in hand is on. */
const pressing = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.pressing);
/** The tile the view lit last (a press with something in hand lights the one it aims at). */
const lit = (page: Page) => page.evaluate(() => {
  const h = window.dgm3d!.renderer.hoverHit;
  return h ? { x: h.x, y: h.y } : null;
});
/** Every edit sent has been answered: nothing more is coming. */
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
/** The tiles of the map's objects of `template`. */
const objectsOf = (page: Page, template: string) =>
  page.evaluate((template) => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === template) out.push({ x: e.x[k], y: e.y[k] });
    return out;
  }, template);

/** Bring the dry, level patch with no object on it (7 tiles across) nearest the map's middle under `c`, at a distance
 *  of 48: what a finger puts there is never refused for the ground, so a step that doesn't come is the gesture's. */
async function onFlat(page: Page, c: P) {
  // (after any glide: a phone's view slides when a sheet or a tool changes, usePhone.ts)
  await still(page);
  const t = await page.evaluate((c) => {
    const r = window.dgm3d!.renderer;
    const { W, H, heights, surface, entities: e } = r.mapState()!;
    const taken = new Set<number>();
    for (let k = 0; k < e.count; k++) taken.add(e.y[k] * W + e.x[k]);
    let best: { x: number; y: number } | null = null;
    let far = Infinity;
    for (let y = 6; y < H - 6; y++)
      for (let x = 6; x < W - 6; x++) {
        const h = heights[y * W + x];
        let ok = true;
        for (let dy = -3; dy <= 3 && ok; dy++)
          for (let dx = -3; dx <= 3 && ok; dx++) {
            const i = (y + dy) * W + x + dx;
            if (heights[i] !== h || surface.depth[i] > 0 || taken.has(i)) ok = false;
          }
        const d = (x - W / 2) ** 2 + (y - H / 2) ** 2;
        if (ok && d < far) [far, best] = [d, { x, y }];
      }
    if (!best) return { none: true };
    r.setView({ distance: 48 });
    // (a pan moves the ground at the view's middle by the pixels asked; a tile above or below it, by about that: a few
    // pans bring it there)
    for (let k = 0; k < 6; k++) {
      const at = window.dgmEditor!.tileToClient(best.x, best.y);
      r.panPixels(c.x - at.x, c.y - at.y);
    }
    return best;
  }, c);
  expect("none" in t, "a dry, level patch").toBe(false);
  await still(page);
  expect(await tileAt(page, c)).toMatchObject(t!);
  return t as { x: number; y: number };
}

/** Pick an object from the shelf (on a phone, from the objects' sheet, which closes to one row). */
async function pickObject(page: Page, name: string) {
  const sheet = page.locator(".objects-button");
  if (await sheet.isVisible()) await sheet.tap();
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name, exact: true }).click();
  await toolInHand(page);
}

/** Put what is in hand away, and wait for the resting Select (and, on a phone, the view's slide for the sheet that
 *  closed, usePhone.ts, which starts on the next frame). */
async function putAway(page: Page) {
  await page.keyboard.press("Escape");
  await toolPutAway(page);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await still(page);
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor, isMobile: size.isMobile, hasTouch: true });

    test(`touch moves the camera, paints, cancels, undoes and redoes (${size.viewport.width}×${size.viewport.height})`, async ({ page }) => {
      const { fingers, R, errors, zoomed, page0 } = await setUp(page, size, true);
      let c = await roomy(page, R);

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

    test(`an object, picked or from the shelf, shows above the finger and goes in on the lift; a double tap on one zooms (${size.viewport.width}×${size.viewport.height})`, async ({ page }) => {
      const { fingers, R, errors, zoomed, page0 } = await setUp(page, size, false);
      const c = await roomy(page, R);
      const tileAt2 = async (p: P) => {
        const t = await tileAt(page, p);
        return t ? { x: t.x, y: t.y } : null;
      };

      // a relic from the shelf: the press shows it above the finger (the tile it aims at lit, not the finger's), the drag
      // moves it, nothing is placed before the lift, and the lift places it where it showed, one step
      await onFlat(page, c);
      await pickObject(page, "Relic");
      const before = await steps(page);
      const relics0 = await objectsOf(page, "SmallRelic");
      const a = { x: c.x - R / 3, y: c.y + FINGER_LIFT + R / 3 };
      const b = { x: c.x + R / 4, y: c.y + FINGER_LIFT };
      await fingers.down({ 1: a });
      expect(await pressing(page)).toBe(true);
      expect(await lit(page)).toEqual(await tileAt2(aimOf(a)));
      expect(await lit(page)).not.toEqual(await tileAt2(a));
      await expect(page.locator(".finger-aim")).toBeVisible();
      await fingers.drag({ 1: b });
      const there = await tileAt2(aimOf(b));
      expect(await lit(page)).toEqual(there);
      await idle(page);
      expect(await steps(page)).toBe(before);
      await fingers.up(1);
      expect(await pressing(page)).toBe(false);
      await expect(page.locator(".finger-aim")).toHaveCount(0);
      await expect.poll(() => steps(page)).toBe(before + 1);
      const placed = (await objectsOf(page, "SmallRelic")).filter((r) => !relics0.some((q) => q.x === r.x && q.y === r.y));
      expect(placed.length).toBe(1);
      const relic = placed[0];
      expect(Math.abs(relic.x - there!.x) <= 1 && Math.abs(relic.y - there!.y) <= 1, `the relic at ${JSON.stringify(relic)}, shown at ${JSON.stringify(there)}`).toBe(true);

      // a second there is refused: the core's reason beside the preview, clear of the finger, and the lift places nothing
      await fingers.pause(400);
      await fingers.down({ 1: b });
      const note = page.locator(".shape-note.warn");
      await expect(note).toBeVisible();
      const box = (await note.boundingBox())!;
      expect(b.x >= box.x && b.x <= box.x + box.width && b.y >= box.y && b.y <= box.y + box.height, `the reason ${JSON.stringify(box)} is under the finger at ${JSON.stringify(b)}`).toBe(false);
      await fingers.up(1);
      await idle(page);
      expect(await steps(page)).toBe(before + 1);

      // a second finger during the press lets it go: nothing placed, and the fingers move the camera
      await fingers.pause(400);
      const d0 = (await view(page)).distance;
      await fingers.down({ 1: a });
      await fingers.drag({ 1: { x: a.x + R / 3, y: a.y - R / 3 } });
      await fingers.down({ 2: { x: c.x, y: c.y - R / 2 } });
      expect(await pressing(page)).toBe(false);
      await fingers.drag({ 1: { x: a.x, y: a.y + R / 4 }, 2: { x: c.x + R / 4, y: c.y - R } });
      await fingers.up(1, 2);
      await still(page);
      await idle(page);
      expect(await steps(page)).toBe(before + 1);
      expect((await view(page)).distance).toBeLessThan(d0);
      await putAway(page);

      // a double tap on the relic (nothing in hand): the first tap picks it, and that stands; the second zooms
      await page.evaluate(() => window.dgm3d!.renderer.setView({ distance: 48 }));
      await still(page);
      const onRelic = () => page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [relic.x, relic.y] as const);
      const putDown = page.locator("button[aria-label='Put it down']");
      await fingers.pause(400);
      let on = await onRelic();
      let d1 = (await view(page)).distance;
      await fingers.tap(on);
      await fingers.tap(on);
      await still(page);
      expect((await view(page)).distance).toBeLessThan(d1 * 0.6);
      await expect(putDown).toHaveCount(1);
      // (and again with it picked: what a press with an object picked does is the lift's; a tap stays a tap)
      await page.evaluate(() => window.dgm3d!.renderer.setView({ distance: 48 }));
      await still(page);
      await fingers.pause(400);
      on = await onRelic();
      d1 = (await view(page)).distance;
      await fingers.tap(on);
      await fingers.tap(on);
      await still(page);
      expect((await view(page)).distance).toBeLessThan(d1 * 0.6);
      await expect(putDown).toHaveCount(1);
      await idle(page);
      expect(await steps(page)).toBe(before + 1);

      // the relic picked: a press anywhere shows it above the finger, and the lift moves it there, one step
      await onFlat(page, c);
      const f = { x: c.x + R / 2, y: c.y + FINGER_LIFT + R / 2 };
      const g = { x: c.x, y: c.y + FINGER_LIFT };
      await fingers.pause(400);
      await fingers.down({ 1: f });
      await fingers.drag({ 1: g });
      expect(await pressing(page)).toBe(true);
      const to = await tileAt2(aimOf(g));
      await idle(page);
      expect(await steps(page)).toBe(before + 1);
      await fingers.up(1);
      await expect.poll(() => steps(page)).toBe(before + 2);
      expect(await lastLabel(page)).toMatch(/^Move /);
      await expect.poll(async () => (await objectsOf(page, "SmallRelic")).some((r) => Math.abs(r.x - to!.x) <= 1 && Math.abs(r.y - to!.y) <= 1)).toBe(true);

      // still picked, dragged onto the start: the core's reason beside it before the lift, clear of the finger, and the
      // lift moves nothing (slice 3b, as a placement's refusal)
      const relics1 = await objectsOf(page, "SmallRelic");
      const start = (await objectsOf(page, "StartingLocation"))[0];
      await still(page);
      await page.evaluate(([x, y, cx, cy]) => {
        const r = window.dgm3d!.renderer;
        for (let k = 0; k < 6; k++) {
          const at = window.dgmEditor!.tileToClient(x, y);
          r.panPixels(cx - at.x, cy - at.y);
        }
      }, [start.x, start.y, c.x, c.y] as const);
      await fingers.pause(400);
      const onStart = { x: c.x, y: c.y + FINGER_LIFT };
      await fingers.down({ 1: { x: c.x + R / 2, y: onStart.y + R / 2 } });
      await fingers.drag({ 1: onStart });
      const why = page.locator(".shape-note.warn");
      await expect(why).toBeVisible();
      const wb = (await why.boundingBox())!;
      expect(onStart.x >= wb.x && onStart.x <= wb.x + wb.width && onStart.y >= wb.y && onStart.y <= wb.y + wb.height, `the reason ${JSON.stringify(wb)} is under the finger`).toBe(false);
      await fingers.up(1);
      await idle(page);
      expect(await steps(page)).toBe(before + 2);
      expect(await objectsOf(page, "SmallRelic")).toEqual(relics1);

      expect(await zoomed()).toEqual(page0);
      expect(errors).toEqual([]);
    });

    test(`a force, the Block tool and a shape show above the finger and apply on the lift; Cancel lets go (${size.viewport.width}×${size.viewport.height})`, async ({ page }) => {
      const { fingers, R, errors, zoomed, page0 } = await setUp(page, size, true);
      const c = await roomy(page, R);
      const tileAt2 = async (p: P) => {
        const t = await tileAt(page, p);
        return t ? { x: t.x, y: t.y } : null;
      };
      /** A press with what is in hand: down at `a`, dragged to `b` (the tile its aim reaches lit), lifted: nothing before
       *  the lift, one step after it. */
      const pressDragLift = async (a: P, b: P, label: RegExp) => {
        const before = await steps(page);
        await fingers.down({ 1: a });
        expect(await pressing(page)).toBe(true);
        await fingers.drag({ 1: b });
        await idle(page);
        expect(await steps(page)).toBe(before);
        await fingers.up(1);
        expect(await pressing(page)).toBe(false);
        await expect.poll(() => steps(page), { timeout: 60_000 }).toBe(before + 1);
        await expect.poll(() => page.evaluate(() => window.dgmEditor!.force()), { timeout: 60_000 }).toBeNull();
        expect(await lastLabel(page)).toMatch(label);
      };

      // a force (Craterize): its marker above the finger, its reach filled round it (slice 3b), struck where it showed on
      // the lift
      await onFlat(page, c);
      await page.keyboard.press("Shift+Digit2");
      await toolInHand(page);
      await still(page);
      const a = { x: c.x - R / 3, y: c.y + FINGER_LIFT + R / 3 };
      const b = { x: c.x + R / 4, y: c.y + FINGER_LIFT };
      await fingers.down({ 1: a });
      expect(await lit(page)).toEqual(await tileAt2(aimOf(a)));
      await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.ringFill)).toBe(true);
      const ring = (await page.evaluate(() => window.dgm3d!.renderer.forceRingState))!;
      expect(ring.r).toBeGreaterThan(5);
      expect(Math.hypot(ring.x - 0.5 - (await tileAt2(aimOf(a)))!.x, ring.y - 0.5 - (await tileAt2(aimOf(a)))!.y)).toBeLessThanOrEqual(1);
      await fingers.up(1);
      // (that was a tap: nothing struck, the marker left where it would strike)
      await idle(page);
      const s0 = await steps(page);
      expect(await page.evaluate(() => window.dgmEditor!.force())).toBeNull();
      await fingers.pause(400);
      await pressDragLift(a, b, /Crater/);
      expect(await steps(page)).toBe(s0 + 1);
      expect(await page.evaluate(() => window.dgm3d!.renderer.ringFill)).toBe(false);

      // Cancel: the finger slid onto it lights it, and lifted there nothing is applied
      const cancel = page.locator(".press-cancel");
      await fingers.pause(400);
      const s1 = await steps(page);
      await fingers.down({ 1: { x: c.x, y: c.y + R } });
      await expect(cancel).toBeVisible();
      const cb = (await cancel.boundingBox())!;
      const onCancel = { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 };
      await fingers.drag({ 1: onCancel });
      await expect(cancel).toHaveClass(/\bover\b/);
      // (and the block it would have added goes: nothing shows where nothing would go)
      expect(await lit(page)).toBeNull();
      await fingers.up(1);
      await expect(cancel).toHaveCount(0);
      await idle(page);
      expect(await steps(page)).toBe(s1);
      // (and a second finger tapping it: let go at once, the first finger then doing nothing until it lifts)
      await fingers.pause(400);
      await fingers.down({ 1: { x: c.x, y: c.y + R } });
      await expect(cancel).toBeVisible();
      await fingers.down({ 2: onCancel });
      await expect(cancel).toHaveCount(0);
      expect(await pressing(page)).toBe(false);
      await fingers.up(2);
      await fingers.drag({ 1: { x: c.x + R / 2, y: c.y + R / 2 } });
      await fingers.up(1);
      await idle(page);
      expect(await steps(page)).toBe(s1);
      await putAway(page);

      // the Block tool (slice 3b): dragged, a sweep of blocks from where the press aimed to where the lift is, one step;
      // held still and lifted, one block where it showed
      const flat = await onFlat(page, c);
      await page.keyboard.press("Digit7");
      await toolInHand(page);
      await still(page);
      // (the sweep across the level patch, a size-3 block's edge inside it at each end: past it the ground may be lower,
      // and blocks over air are refused, as with the mouse)
      const [w0, w1] = await page.evaluate(({ x, y }) => [window.dgmEditor!.tileToClient(x - 2, y), window.dgmEditor!.tileToClient(x + 2, y)], flat);
      await fingers.pause(400);
      let h0 = await heights(page);
      await pressDragLift({ x: w0.x, y: w0.y + FINGER_LIFT }, { x: w1.x, y: w1.y + FINGER_LIFT }, /block/i);
      await settled(page);
      const swept = (await heights(page)).filter((v, i) => v !== h0[i]).length;
      expect(swept).toBeGreaterThan(9);
      await fingers.pause(400);
      h0 = await heights(page);
      const sb = await steps(page);
      await fingers.down({ 1: a });
      await fingers.pause(TAP_HOLD);
      await fingers.up(1);
      await expect.poll(() => steps(page), { timeout: 60_000 }).toBe(sb + 1);
      expect(await lastLabel(page)).toMatch(/block/i);
      await settled(page);
      const one = (await heights(page)).filter((v, i) => v !== h0[i]).length;
      expect(one).toBeGreaterThan(0);
      expect(one).toBeLessThan(swept);
      await putAway(page);

      // a force's line (Carve): the drag draws its line from where the press aimed, the band showing, and the lift carves
      // along it, one step
      const plain = await onFlat(page, c);
      await page.keyboard.press("Shift+Digit1");
      await toolInHand(page);
      // (after the slide for Carve's sheet: drawn 6 tiles across the level patch, on the map whatever the view's scale)
      await still(page);
      const [k0, k1] = await page.evaluate(({ x, y }) => [window.dgmEditor!.tileToClient(x - 3, y + 1), window.dgmEditor!.tileToClient(x + 3, y - 1)], plain);
      await fingers.pause(400);
      const sc = await steps(page);
      await fingers.down({ 1: { x: k0.x, y: k0.y + FINGER_LIFT } });
      await fingers.drag({ 1: { x: k1.x, y: k1.y + FINGER_LIFT } });
      expect(await pressing(page)).toBe(true);
      await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.gesture())).stroke ?? 0).toBeGreaterThan(1);
      await idle(page);
      expect(await steps(page)).toBe(sc);
      await fingers.up(1);
      await expect.poll(() => steps(page), { timeout: 60_000 }).toBe(sc + 1);
      await expect.poll(() => page.evaluate(() => window.dgmEditor!.force()), { timeout: 60_000 }).toBeNull();
      expect(await lastLabel(page)).toMatch(/^Carve/);
      await putAway(page);

      // a shape (Raise's Ridge): its line drawn a little above the finger, raised on the lift
      await page.keyboard.press("Digit2");
      await toolInHand(page);
      const handle = page.locator(".sheet-handle");
      const sheet = await handle.isVisible();
      if (sheet) await handle.tap();
      await page.getByRole("group", { name: "Brush" }).getByRole("button", { name: "Ridge", exact: true }).click();
      if (sheet) await handle.tap();
      const level = await onFlat(page, c);
      // (a ridge needs a line 3 tiles long at least: drawn 4 across the level patch, whatever a tile's size on the screen)
      const [r0, r1] = await page.evaluate(({ x, y }) => [window.dgmEditor!.tileToClient(x - 2, y), window.dgmEditor!.tileToClient(x + 2, y)], level);
      await fingers.pause(400);
      await pressDragLift({ x: r0.x, y: r0.y + FINGER_LIFT }, { x: r1.x, y: r1.y + FINGER_LIFT }, /Ridge/i);
      // (the ridge's land drawn first: a tap the browser holds behind a busy page past its long press is no click)
      await settled(page);
      await idle(page);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      if (sheet) await handle.tap();
      await page.getByRole("group", { name: "Brush" }).getByRole("button", { name: "Round", exact: true }).click();
      if (sheet) await handle.tap();
      await putAway(page);

      // nothing in hand: a finger held still draws a selection a little above it (no selection open first), on its lift
      await fingers.pause(400);
      expect(await page.evaluate(() => window.dgmEditor!.selection().length)).toBe(0);
      // (corner to corner of 5 by 5 tiles of a level patch, whatever a tile's size and the grid's turn on the screen)
      const mid = await onFlat(page, c);
      const [q0, q1] = await page.evaluate(({ x, y }) => [window.dgmEditor!.tileToClient(x - 2, y - 2), window.dgmEditor!.tileToClient(x + 2, y + 2)], { x: mid.x, y: mid.y });
      await fingers.down({ 1: { x: q0.x, y: q0.y + FINGER_LIFT } });
      await fingers.pause(TAP_HOLD);
      expect(await pressing(page)).toBe(true);
      await fingers.drag({ 1: { x: q1.x, y: q1.y + FINGER_LIFT } });
      await fingers.up(1);
      await expect.poll(() => page.evaluate(() => window.dgmEditor!.selection().length)).toBeGreaterThan(8);
      await putAway(page);

      expect(await zoomed()).toEqual(page0);
      expect(errors).toEqual([]);
    });
  });
}
