// The view and the header (PLAN §20 D184, D205, D207, D330), through the page: the map's name and its line,
// the header's two icons, its one primary button and the File menu; the quiet dot and its list; the first run's three hints,
// each gone once done and never back; the minimap, its toggle and a click that moves the camera;
// camera bookmarks, kept with the project; the start's reach while the pointer is on it; the
// brushes working only the visible land under a cut.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, openFileMenu, waitForEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const view = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.getView());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

async function open(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
}

test("the header, the quiet dot, the first run's hints, the minimap and camera bookmarks", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await open(page);

  // the header: the open map's name and its line (seed and size), the Maps button on the left, shut
  await expect(page.locator(".editor-title h1")).toHaveText("River Valley");
  await expect(page.locator(".editor-title .muted")).toHaveText("Seed 4242 · 96×96");
  await expect(page.locator("header.editor-bar").getByRole("button", { name: "Maps", exact: true })).toHaveAttribute("aria-pressed", "false");

  // the header's right group: two icons, one primary button, and the File menu with the rest
  const edit = page.getByRole("toolbar", { name: "Edit" });
  await expect(edit.getByRole("button", { name: "Undo (Ctrl+Z)" })).toBeDisabled();
  await expect(edit.getByRole("button", { name: "Redo (Ctrl+Y)" })).toBeDisabled();
  await expect(edit.getByRole("button", { name: "Save to Timberborn" })).toHaveClass(/primary/);
  const menu = await openFileMenu(page);
  for (const item of ["Open…", "Save project", "Download .timber", "Clear everything", "History", "About"]) await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // the quiet dot: ready to play, its list under it, never a dialog
  const dot = page.getByRole("button", { name: /^Checks:/ });
  await expect(dot).toHaveAccessibleName(/^Checks: Ready to play/, { timeout: 60_000 });
  await dot.click();
  await expect(page.getByRole("region", { name: "Checks" })).toContainText(/All \d+ checks pass/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // the first run: three hints; placing a thing takes its line away, the × all of them, for good
  const hints = page.getByRole("status", { name: "First steps" });
  await expect(hints.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Pine", exact: true }).click();
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const e = m.entities;
    const taken = new Set<number>();
    for (let k = 0; k < e.count; k++) taken.add(e.y[k] * m.W + e.x[k]);
    for (let y = 20; y < m.H - 20; y++)
      for (let x = 20; x < m.W - 20; x++) {
        const i = y * m.W + x;
        if (!taken.has(i) && m.surface.depth[i] === 0 && m.heights[i] === m.heights[i + 1] && m.heights[i] === m.heights[i + m.W]) return [x, y] as [number, number];
      }
    return null;
  });
  const sp = await client(page, spot![0], spot![1]);
  await page.mouse.move(sp.x + 3, sp.y);
  await page.mouse.click(sp.x, sp.y);
  await idle(page);
  await expect(hints.getByRole("listitem")).toHaveCount(2);
  await expect(hints).not.toContainText("Place things");
  await hints.getByRole("button", { name: "No more hints" }).click();
  await expect(hints).toHaveCount(0);
  await page.keyboard.press("Escape");

  // the minimap: off on a small map, a view button turns it on; a click there moves the camera
  const minimap = page.getByRole("img", { name: /^Minimap/ });
  await expect(minimap).toHaveCount(0);
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Minimap" }).click();
  await expect(minimap).toBeVisible();
  const box = (await minimap.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
  const t = (await view(page)).target;
  // (a quarter across from the west, a quarter down from the north)
  expect(t[0]).toBeGreaterThan(96 * 0.15);
  expect(t[0]).toBeLessThan(96 * 0.35);
  expect(-t[2]).toBeGreaterThan(96 * 0.65);
  expect(-t[2]).toBeLessThan(96 * 0.85);

  // camera bookmarks: Ctrl+Shift+2 keeps this view, Shift+2 glides back to it
  await page.keyboard.press("Control+Shift+Digit2");
  await expect.poll(async () => (await info(page)).views.map((v) => v.slot)).toEqual([2]);
  await page.evaluate(() => window.dgm3d!.renderer.setView({ target: [70, 5, -20], yaw: 1.2, distance: 60 }));
  await page.keyboard.press("Shift+Digit2");
  await expect.poll(async () => (await view(page)).target[0], { timeout: 5000 }).toBeCloseTo(t[0], 3);
  expect((await view(page)).target[2]).toBeCloseTo(t[2], 3);
  // kept with the project: Your maps keeps them, and a reload of the address brings the open map back with them
  await page.waitForTimeout(2500);
  await page.reload();
  await waitForEditor(page);
  expect((await info(page)).views.map((v) => v.slot)).toEqual([2]);
  // the hints stay gone
  await expect(page.getByRole("status", { name: "First steps" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the start's reach shows while the pointer is on it; the brushes work only the visible land under a cut", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await open(page);
  await page.getByRole("button", { name: "Top-down" }).click();
  const i = await info(page);
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;

  // the start's reach: the three requirements, while the pointer is on it
  const p = await client(page, start[0], start[1]);
  await page.mouse.move(p.x + 40, p.y + 40);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  const reach = page.locator(".start-reach .start-indicators");
  await expect(reach).toContainText(/Starting wood: \d+ logs/, { timeout: 15_000 });
  await page.mouse.move(p.x + 200, p.y + 200, { steps: 3 });
  await expect(reach).toHaveCount(0, { timeout: 5000 });

  // under a cut, Raise leaves the ground above it alone and lifts the rest up to it at most
  const cut = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    return Math.max(...m.heights) - 3;
  });
  await page.evaluate((c) => window.dgm3d!.renderer.setSlice(c), cut);
  const pair = await page.evaluate(
    ([c, s0, s1]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const W = m.W;
      for (let y = 10; y < m.H - 10; y++)
        for (let x = 10; x < W - 10; x++) {
          if (Math.hypot(x - s0, y - s1) < 20) continue;
          const i = y * W + x;
          if (m.heights[i] > c && m.heights[i + 1] < c && m.surface.depth[i + 1] === 0) return [x, y] as [number, number];
        }
      return null;
    },
    [cut, start[0], start[1]] as const,
  );
  expect(pair).not.toBeNull();
  const [hx, hy] = pair!;
  const high = await page.evaluate(([x, y]) => window.dgm3d!.renderer.mapState()!.heights[y * window.dgm3d!.renderer.mapState()!.W + x], [hx, hy] as [number, number]);
  await page.keyboard.press("1");
  for (let k = 0; k < 3; k++) await page.keyboard.press("{");
  const q = await client(page, hx + 1, hy);
  await page.mouse.move(q.x, q.y);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  await idle(page);
  const after = await page.evaluate(([x, y]) => {
    const m = window.dgm3d!.renderer.mapState()!;
    return [m.heights[y * m.W + x], m.heights[y * m.W + x + 1]];
  }, [hx, hy] as [number, number]);
  expect(after[0]).toBe(high);
  expect(after[1]).toBeLessThanOrEqual(cut);
  expect(errors).toEqual([]);
});

test("D368 (5), D330: the top right is one tidy cluster: the compass in the corner, the level control beside it, Slow forces and Sound beneath, the Legend button under them, all on the cluster's edges, one height and one gap throughout", async ({ page }, testInfo) => {
  await open(page);
  await page.waitForTimeout(500);
  const box = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!;
  // (the cluster's own: one height and one gap for every piece, 10px from the view's top and right edges; the right
  // column's exact edges at every window size are pinned in layout.spec.ts)
  const HEIGHT = 44;
  const GAP = 8;
  const EDGE = 10;
  const measure = async () => {
    const view = await box(page.locator(".editor-view .view3d"));
    const compass = await box(page.locator(".view3d-corner .compass"));
    const level = await box(page.locator(".view3d-corner .corner-level"));
    const slow = await box(page.getByRole("button", { name: "Slow forces", exact: true }));
    const sound = await box(page.getByRole("button", { name: "Sound", exact: true }));
    const legend = await box(page.getByRole("button", { name: "Legend", exact: true }));
    return { view, compass, level, slow, sound, legend };
  };
  const near = (a: number, b: number, what: string) => expect(Math.abs(a - b), `${what}: ${a} against ${b}`).toBeLessThanOrEqual(1);
  // at rest (the whole world showing) and with a layer cut (the level control keeps its width)
  for (const state of ["at rest", "a layer cut"]) {
    if (state === "a layer cut") {
      await page.getByRole("button", { name: "Lower the visible layer" }).click();
      await expect(page.getByRole("group", { name: "Visible layers" }).locator("output")).not.toHaveText("∞");
    }
    const { view, compass, level, slow, sound, legend } = await measure();
    const right = (b: { x: number; width: number }) => b.x + b.width;
    const bottom = (b: { y: number; height: number }) => b.y + b.height;
    // the compass in the corner of the view
    near(view.x + view.width - right(compass), EDGE, `${state}: the compass's right margin`);
    near(compass.y - view.y, EDGE, `${state}: the compass's top margin`);
    // the level control beside it, on its line, one height, one gap
    near(level.y, compass.y, `${state}: the level control on the compass's line`);
    near(level.height, HEIGHT, `${state}: the level control's height`);
    near(compass.height, HEIGHT, `${state}: the compass's height`);
    near(compass.x - right(level), GAP, `${state}: the gap between the level control and the compass`);
    // Slow forces directly under the level control, exactly as wide; Sound directly under the compass
    near(slow.y - bottom(compass), GAP, `${state}: the gap beneath`);
    near(sound.y, slow.y, `${state}: Slow forces and Sound on one line`);
    near(slow.x, level.x, `${state}: Slow forces from the level control's left edge`);
    near(slow.width, level.width, `${state}: Slow forces as wide as the level control`);
    near(right(sound), right(compass), `${state}: Sound to the compass's right edge`);
    near(sound.width, compass.width, `${state}: Sound square under the compass`);
    near(sound.x - right(slow), GAP, `${state}: the gap between Slow forces and Sound`);
    for (const [name, b] of [
      ["Slow forces", slow],
      ["Sound", sound],
    ] as const)
      near(b.height, HEIGHT, `${state}: ${name}'s height`);
    // the Legend button under them, spanning the cluster
    near(legend.x, slow.x, `${state}: Legend from the cluster's left edge`);
    near(right(legend), right(sound), `${state}: Legend to the cluster's right edge`);
    near(legend.y - bottom(slow), GAP, `${state}: the gap above Legend`);
    near(legend.height, HEIGHT, `${state}: Legend's height`);
  }
  // (a picture for Kyler's eye: the cluster, at rest)
  await page.getByRole("group", { name: "Visible layers" }).locator("output").click();
  await expect(page.getByRole("group", { name: "Visible layers" }).locator("output")).toHaveText("∞");
  const { view } = await measure();
  await page.mouse.move(view.x + 200, view.y + 400);
  await page.screenshot({ path: testInfo.outputPath("top-right.png"), clip: { x: view.x + view.width - 420, y: view.y, width: 420, height: 160 } });
});
