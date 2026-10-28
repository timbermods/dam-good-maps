// What a finisher saw go wrong (usability judges, 2026-10-24): the checks' Show marks the problem on the map (D330); Markers
// labels the seeps, aquifers, drains, cores and reserves (D337); the seep's strength label shows whole (the page rule:
// nothing is cut off).

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
const applied = async (page: Page) => (await info(page)).history.filter((h) => h.applied).length;

/** The tiles the page marks with its highlight on the overlay (the legend's, the checks' Show): blue, alpha 120 inside and 230 at the edge. */
const marked = (page: Page) =>
  page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const d = r.overlayData();
    const m = r.mapState()!;
    const out: number[] = [];
    if (d) for (let i = 0; i < m.W * m.H; i++) if (d[i * 4] === 40 && d[i * 4 + 2] === 255 && d[i * 4 + 3] >= 120) out.push(i);
    return out;
  });

/** The top left tile of a square of `size` tiles of flat ground with no water, at least `start` tiles in from the edge and clear of the `skip` spots. */
const flatSpot = (page: Page, size: number, start: number, skip: number[][] = []) =>
  page.evaluate(
    ([n, from, others]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      for (let y = from; y < m.H - from; y++)
        for (let x = from; x < m.W - from; x++) {
          if ((others as number[][]).some(([a, b]) => Math.abs(a - x) < n + 6 && Math.abs(b - y) < n + 6)) continue;
          const z = m.heights[y * m.W + x];
          let ok = true;
          for (let dy = 0; dy < n && ok; dy++) for (let dx = 0; dx < n && ok; dx++) if (m.heights[(y + dy) * m.W + x + dx] !== z || m.surface.depth[(y + dy) * m.W + x + dx] > 0) ok = false;
          if (ok) return [x, y] as [number, number];
        }
      return null;
    },
    [size, start, skip] as const,
  );

/** Pick `item` from the shelf and click it down on a flat spot of `size` tiles clear of the `taken` ones (a spot with an object on it, a
 *  relic or a ruin, is passed over), once the page says it fits there; the spot is added to `taken`. */
async function place(page: Page, item: string, taken: number[][], size = 5): Promise<[number, number]> {
  for (let tries = 0; tries < 8; tries++) {
    const at = (await flatSpot(page, size, 8, taken))!;
    taken.push(at);
    const before = await applied(page);
    await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: item, exact: true }).click();
    const p = await client(page, at[0] + 1, at[1] + 1);
    await page.mouse.move(p.x + 5, p.y);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(500);
    if ((await page.evaluate(() => window.dgmEditor!.fit()?.problem ?? "none")) === "none") {
      await page.mouse.click(p.x, p.y);
      await expect.poll(() => applied(page)).toBe(before + 1);
      await idle(page);
    }
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Escape");
    if ((await applied(page)) === before + 1) return at;
  }
  throw new Error(`no room for ${item}`);
}

test("the checks' Show marks the tiles the problem names, and Esc takes the marks off", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await idle(page);
  // oaks on dry ground: "N living plants on soil that kills them"
  const dry = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const soil = m.soil!;
    let best: [number, number, number] | null = null;
    for (let y = 4; y < m.H - 4; y++)
      for (let x = 4; x < m.W - 4; x++) {
        let ok = true;
        for (let dy = -3; dy <= 3 && ok; dy++)
          for (let dx = -3; dx <= 3 && ok; dx++) {
            const i = (y + dy) * m.W + x + dx;
            if (m.surface.depth[i] > 0 || soil.moisture[i] > 0 || soil.contamination[i] > 0) ok = false;
          }
        if (!ok) continue;
        const d = Math.abs(x - m.W / 2) + Math.abs(y - m.H / 2);
        if (!best || d < best[2]) best = [x, y, d];
      }
    return best!;
  });
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Oak", exact: true }).click();
  const a = await client(page, dry[0] - 2, dry[1]);
  const b = await client(page, dry[0] + 2, dry[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await idle(page);

  const pill = page.getByRole("button", { name: /^Checks:/ });
  await expect(pill).toHaveAttribute("aria-label", /thing to look at/, { timeout: 120_000 });
  await pill.click();
  const row = page.getByRole("listitem").filter({ hasText: /living plants? on soil that kills/ });
  await expect(row).toBeVisible();
  const count = Number(/^(\d+)/.exec((await row.innerText()).trim())![1]);
  expect(count).toBeGreaterThan(1);
  expect(await marked(page)).toEqual([]);

  await row.getByRole("button", { name: "Show", exact: true }).click();
  // every plant the check counts is marked, not only the one the camera goes to
  await expect.poll(async () => (await marked(page)).length).toBe(count);
  expect(await page.evaluate(() => window.dgm3d!.renderer.highlighted)).toBe(true);

  // a camera drag (the right button) and the wheel leave them; there is no timer
  const view = await page.evaluate(() => window.dgm3d!.renderer.getView());
  await page.mouse.move(800, 450);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(860, 470, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.dgm3d!.renderer.getView())).not.toEqual(view);
  expect((await marked(page)).length).toBe(count);
  // and so does a press on the minimap, which moves the camera too
  await page.locator(".minimap canvas").first().click({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(500);
  expect((await marked(page)).length).toBe(count);

  // Esc, with the focus on the map, takes them off
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await marked(page)).length).toBe(0);
  expect(await page.evaluate(() => window.dgm3d!.renderer.highlighted)).toBe(false);
});

test("Markers labels the seeps, aquifers, drains and reserves, with a warning on the aquifer that gives no water", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  await idle(page);
  const taken: number[][] = [];
  for (const item of ["Badwater seep", "Aquifer", "Reserve pile"]) await place(page, item, taken);
  // off: the objects are there, their labels are not
  const labels = page.locator(".source-marker");
  await expect(labels.filter({ hasText: /Aquifer|Badwater seep|Reserve pile/ })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Markers", exact: true }).check();
  await expect(labels.filter({ hasText: "Badwater seep · 1 badwater/s" })).toHaveCount(1);
  await expect(labels.filter({ hasText: /^Reserve pile · 160 / })).toHaveCount(1);
  const aquifer = labels.filter({ hasText: "Aquifer · 1 water/s · no water until a powered drill stands on it" });
  await expect(aquifer).toHaveCount(1);
  // the aquifer's is the warning kind; the others are not
  await expect(aquifer).toHaveClass(/\bwarn\b/);
  await expect(labels.filter({ hasText: "Badwater seep" })).not.toHaveClass(/\bwarn\b/);
  // taken off, they go
  await page.getByRole("checkbox", { name: "Markers", exact: true }).uncheck();
  await expect(labels.filter({ hasText: /Aquifer|Badwater seep|Reserve pile/ })).toHaveCount(0);
});

test("Markers' notes never stand on one another, however crowded, and a crowd speaks as one label", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  await idle(page);
  const taken: number[][] = [];
  for (const item of ["Water seep", "Badwater seep", "Aquifer", "Badtide drain", "Reserve pile"]) await place(page, item, taken);
  await page.getByRole("checkbox", { name: "Markers", exact: true }).check();
  const overlaps = () =>
    page.locator(".source-marker").evaluateAll((els) => {
      const rs = els.map((e) => e.getBoundingClientRect());
      let n = 0;
      for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) if (rs[a].left < rs[b].right && rs[b].left < rs[a].right && rs[a].top < rs[b].bottom && rs[b].top < rs[a].bottom) n++;
      return n;
    });
  // zoomed right out and in (the wheel), top-down and in 3D
  for (const mode of ["top", "3d"]) {
    if (mode === "3d") await page.getByRole("button", { name: "Top-down" }).click();
    for (const delta of [800, -400, -400, -400]) {
      await page.mouse.move(800, 450);
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(700);
      expect(await overlaps(), `${mode} after ${delta}`).toBe(0);
    }
  }
});

test("a seep's strength label shows whole, even drained, beside the ×", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  await idle(page);
  const at = await place(page, "Water seep", [], 4);
  const p = await client(page, at[0] + 1, at[1] + 1);
  await page.mouse.click(p.x, p.y);
  const win = page.locator(".object-window");
  await expect(win).toBeVisible();
  const slider = win.getByRole("slider", { name: "Strength" });
  await slider.focus();
  // down to a drain (the step and the range are the game's editor's: 0.5, −8 to 32)
  for (let k = 0; k < 7; k++) await page.keyboard.press("ArrowLeft");
  const head = win.locator(".ow-head").first();
  await expect(head.locator(".ow-value")).toHaveText("drains 2.5 water/s");
  const boxes = await head.evaluate((h) => {
    const r = (e: Element | null) => (e ? e.getBoundingClientRect().toJSON() : null);
    const name = h.querySelector(".ow-name")!;
    return { head: r(h), name: r(name), value: r(h.querySelector(".ow-value")), close: r(h.querySelector(".ow-close")), clipped: name.scrollWidth > name.clientWidth };
  });
  expect(boxes.clipped).toBe(false);
  type Box = { left: number; right: number; top: number; bottom: number };
  const inside = (r: Box) => r.left >= boxes.head!.left - 1 && r.right <= boxes.head!.right + 1 && r.top >= boxes.head!.top - 1 && r.bottom <= boxes.head!.bottom + 1;
  const apart = (x: Box, y: Box) => x.right <= y.left + 0.5 || y.right <= x.left + 0.5 || x.bottom <= y.top + 0.5 || y.bottom <= x.top + 0.5;
  expect(inside(boxes.name!)).toBe(true);
  expect(inside(boxes.value!)).toBe(true);
  expect(apart(boxes.name!, boxes.value!)).toBe(true);
  expect(apart(boxes.value!, boxes.close!)).toBe(true);
  // the slider is under the words, not behind them
  const sl = (await slider.boundingBox())!;
  expect(sl.y).toBeGreaterThanOrEqual(boxes.head!.bottom - 1);
});
