// The three scenarios, driven through the app's own hooks (window.dgmEditor, window.dgm3d) and its UI, the way
// tests/e2e does: nothing is added to the app. Adapted from investigation/performance/{scenarios.mjs,run.mjs}.
// A scenario has a `prepare` (untimed: the map is open and settled; the warm-up) and a `timed` part (the page's
// recorder runs through it); both live here so a run is `prepare`, qualify the machine, `timed`.

import type { Page } from "@playwright/test";
import type { Scenario } from "./plan";

export const SEED = 4242;
export const THEME = "riverValley";
export const ORBIT_MS = 10_000;
const TURN_MS = 8_000;

export interface Spots {
  /** A water tile near the middle of the map, on the canvas. */
  river: [number, number];
  /** A sweep across it (both ends and every step on the canvas). */
  from: [number, number];
  to: [number, number];
}

export interface Extras {
  /** Wall time from an action's end to the water settled (ms), by step. */
  settleMs: Record<string, number>;
  /** Wall time of the force itself (click to the land final). */
  forceMs?: number;
  note?: string;
}

const tile = (page: Page, p: [number, number]) => page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), p);

/** Open the generated map in the editor and wait until it is idle. */
export async function openMap(page: Page, url: string, size: number, topDown: boolean): Promise<void> {
  await page.goto(`${url}/#s=${SEED}&z=${size}&d=n&t=${THEME}`);
  await page.getByText(/All \d+ checks passed/).waitFor({ timeout: 300_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 180_000 });
  await page.bringToFront();
  await page.getByRole("button", { name: "Top-down", exact: true }).waitFor();
  if (topDown) await page.getByRole("button", { name: "Top-down", exact: true }).click();
  await settle(page, false);
}

/** Wait for the editor, the water worker and the drawn water to be done (the harness's "idle"). Returns ms taken. */
export async function settle(page: Page, afterHistory: boolean): Promise<number> {
  const t0 = Date.now();
  await page.waitForFunction(() => !!window.dgmEditor && !window.dgmEditor.force() && !window.dgmEditor.pendingTerrain(), null, { timeout: 180_000 });
  await page.evaluate(() => window.dgmEditor!.idle());
  await page.evaluate(() =>
    Promise.race([window.dgmEditor!.worker.whenWaterSettles(), new Promise((_, no) => setTimeout(() => no(new Error("water did not settle within 180 s")), 180_000))]),
  );
  // the drawn water follows the worker's; its status text says "Water settled" except right after a history step
  await page
    .waitForFunction(
      (history) => {
        const r = window.dgm3d!.renderer as unknown as { waterQueue?: { size: number } };
        const bar = [...document.querySelectorAll(".water-bar")].some((e) => (e.textContent ?? "").includes("Water settled"));
        const checking = [...document.querySelectorAll(".checks-dot")].some((e) => /Checking|Settling/.test(e.getAttribute("title") ?? ""));
        return !r.waterQueue?.size && !checking && (history || bar);
      },
      afterHistory,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  const ms = Date.now() - t0;
  await page.waitForTimeout(600); // late presentation work stays inside the timed part
  return ms;
}

/** The river tile and a sweep across it, found in the page from the map's water. */
export async function findSpots(page: Page): Promise<Spots> {
  const spots = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const W = m.W;
    const H = m.H;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (m.surface.depth[y * W + x] <= 0) continue;
        const d = Math.hypot(x - W / 2, y - H / 2);
        if (d < bestD && onMap(x, y)) {
          bestD = d;
          best = [x, y];
        }
      }
    if (!best) return null;
    const [rx, ry] = best;
    const clamp = (v: number, hi: number) => Math.max(Math.round(hi * 0.12), Math.min(Math.round(hi * 0.88), Math.round(v)));
    const reach = Math.round(W * 0.3);
    const lines: [[number, number], [number, number]][] = [
      [[clamp(rx - reach, W), ry], [clamp(rx + reach, W), ry]],
      [[rx, clamp(ry - reach, H)], [rx, clamp(ry + reach, H)]],
      [[clamp(rx - reach, W), clamp(ry - reach, H)], [clamp(rx + reach, W), clamp(ry + reach, H)]],
    ];
    for (const [a, b] of lines) {
      let ok = true;
      for (let k = 0; k <= 16 && ok; k++) ok = onMap(a[0] + ((b[0] - a[0]) * k) / 16, a[1] + ((b[1] - a[1]) * k) / 16);
      if (ok) return { river: best, from: a, to: b };
    }
    return null;
  });
  if (!spots) throw new Error("no water tile with a clear sweep across it");
  return spots;
}

async function drag(page: Page, a: [number, number], b: [number, number]): Promise<void> {
  const from = await tile(page, a);
  const to = await tile(page, b);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 16; k++) {
    await page.mouse.move(from.x + ((to.x - from.x) * k) / 16, from.y + ((to.y - from.y) * k) / 16);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

const orbitFor = (page: Page, ms: number) =>
  page.evaluate(
    ([duration, turn]) =>
      new Promise<void>((done) => {
        const r = window.dgm3d!.renderer;
        const yaw0 = r.getView().yaw;
        let start = 0;
        const step = (now: number) => {
          if (!start) start = now;
          r.setView({ yaw: yaw0 + ((now - start) / turn) * Math.PI * 2 });
          if (now - start < duration) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [ms, TURN_MS] as const,
  );

async function chooseBrush(page: Page): Promise<void> {
  await page.keyboard.press("1");
  const row = page.getByRole("group", { name: "Raise options", exact: true });
  await row.waitFor();
  // Size at its largest at this map size (128 where the map allows)
  await row.getByRole("slider", { name: "Size", exact: true }).evaluate((e) => {
    const i = e as HTMLInputElement;
    i.value = i.max;
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function chooseCraterize(page: Page): Promise<void> {
  const slow = page.getByRole("button", { name: /^Slow forces/ });
  if ((await slow.count()) && (await slow.first().getAttribute("aria-pressed")) === "true") await slow.first().click(); // Fast
  const button = page.getByRole("group", { name: "Forces", exact: true }).getByRole("button", { name: "Craterize (8)", exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  const row = page.getByRole("group", { name: "Craterize options", exact: true });
  await row.waitFor();
  // one event at a time, then check it took (batched Power and Size events can replay stale options)
  await row.getByRole("slider", { name: "Power", exact: true }).evaluate((e) => {
    const i = e as HTMLInputElement;
    i.value = "100";
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('[aria-label="Craterize options"] input[aria-label="Power"]')?.getAttribute("value") === "100" || (document.querySelector('[aria-label="Craterize options"] input[aria-label="Power"]') as HTMLInputElement | null)?.value === "100");
}

async function clickTile(page: Page, p: [number, number]): Promise<void> {
  const c = await tile(page, p);
  await page.mouse.move(c.x + 3, c.y);
  await page.mouse.move(c.x, c.y);
  await page.mouse.click(c.x, c.y);
}

export interface Timed {
  extras: Extras;
}

export interface ScenarioDriver {
  /** Needs the top-down view (to aim at tiles). */
  topDown: boolean;
  prepare(page: Page, spots: Spots | null): Promise<void>;
  /** The timed part; the recorder is already running. */
  timed(page: Page, spots: Spots | null): Promise<Extras>;
}

const forceDone = (page: Page) => page.waitForFunction(() => !window.dgmEditor!.force() && !window.dgmEditor!.pendingTerrain(), null, { timeout: 180_000 });

export const DRIVERS: Record<Scenario, ScenarioDriver> = {
  orbit: {
    topDown: false,
    async prepare(page) {
      await orbitFor(page, 2000); // shaders, water and the camera path warm
    },
    async timed(page) {
      await orbitFor(page, ORBIT_MS);
      return { settleMs: {} };
    },
  },
  brush: {
    topDown: true,
    async prepare(page, spots) {
      await chooseBrush(page);
      await drag(page, spots!.from, spots!.to); // warm-up stroke, undone
      await settle(page, false);
      await page.keyboard.press("Control+z");
      await settle(page, true);
    },
    async timed(page, spots) {
      const settleMs: Record<string, number> = {};
      await drag(page, spots!.from, spots!.to);
      settleMs.stroke = await settle(page, false);
      await page.keyboard.press("Control+z");
      settleMs.undo = await settle(page, true);
      await page.keyboard.press("Control+y");
      settleMs.redo = await settle(page, true);
      return { settleMs };
    },
  },
  force: {
    topDown: true,
    async prepare(page, spots) {
      await chooseCraterize(page);
      await clickTile(page, spots!.river); // warm-up force, undone
      await forceDone(page);
      await settle(page, false);
      await page.keyboard.press("Control+z");
      await settle(page, true);
    },
    async timed(page, spots) {
      const settleMs: Record<string, number> = {};
      const t0 = Date.now();
      await clickTile(page, spots!.river);
      await forceDone(page);
      const forceMs = Date.now() - t0;
      settleMs.force = await settle(page, false);
      await page.keyboard.press("Control+z");
      settleMs.undo = await settle(page, true);
      return { settleMs, forceMs };
    },
  },
};
