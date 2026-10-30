// Erode (ROADMAP "Terrain above terrain" 3, D281), through the page: its button in the forces group (Shift+8), its row
// Power, Size (Auto), the Floor and Try another; a click wears the rock there, kept as one undo step exactly as
// shown, and one Ctrl+Z takes all of it back.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, topDown } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
// (each step's label, less the sources a force's Sources: Clear took, D474: contract/forceClearSources checks that part)
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label.replace(/, (a source|\d+ sources) cleared/, ""));
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.force());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
/** The map as the worker holds it: its surface, and the tiles that have rock over a hollow. */
const land = (page: Page) =>
  page.evaluate(async () => {
    const t = await window.dgmEditor!.worker.terrainNow();
    return { heights: Array.from(t.heights), hollow: Array.from(t.terrain.columns) };
  });

async function settled(page: Page) {
  await expect.poll(() => status(page), { timeout: 60_000 }).toBeNull();
  await idle(page);
}

/** Ground the map (not a bar over it) takes the clicks at, with room round it: the highest, as the other forces' tests pick. */
async function high(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    let best: [number, number] = [m.W >> 1, m.H >> 1];
    let top = -1;
    for (let y = 18; y < m.H - 18; y += 2)
      for (let x = 18; x < m.W - 18; x += 2) {
        const h = m.heights[y * m.W + x];
        if (h <= top || m.surface.depth[y * m.W + x] > 0 || !onMap(x, y) || !onMap(x - 12, y) || !onMap(x + 12, y) || !onMap(x, y - 12) || !onMap(x, y + 12)) continue;
        top = h;
        best = [x, y];
      }
    return best;
  });
}

test("Erode's row is Power, Size (Auto), the Floor and Try another, Try another ready once one is kept", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await topDown(page);
  await expect(page.getByRole("group", { name: "Forces" }).getByRole("button", { name: "Erode (Shift+8)" })).toBeVisible();
  await page.keyboard.press("Shift+Digit8");
  const row = page.getByRole("group", { name: "Erode options" });
  await expect(row).toBeVisible();
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power", "Size", "Floor"]);
  await expect(row.getByRole("button", { name: "Size follows Power" })).toBeVisible();
  // (it never wears a source's tile: no Sources)
  await expect(row.getByRole("group", { name: "Sources" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "More" })).toHaveCount(0);
  const again = row.getByRole("button", { name: "Try another" });
  await expect(again).toBeDisabled();
  // Try another is always in its place (EDITOR_PLAN §3): the second row's end, level with the Floor and under the bar's last cell
  {
    const [floor, try1, last, power] = await Promise.all([
      row.getByRole("slider", { name: "Floor" }).boundingBox(),
      again.boundingBox(),
      page.getByRole("group", { name: "Forces" }).getByRole("button", { name: /^Erode/ }).boundingBox(),
      row.getByRole("slider", { name: "Power" }).boundingBox(),
    ]);
    expect(try1!.y).toBeGreaterThan(power!.y + power!.height);
    expect(Math.abs(try1!.y + try1!.height / 2 - (floor!.y + floor!.height / 2))).toBeLessThan(20);
    expect(Math.abs(try1!.x + try1!.width - (last!.x + last!.width))).toBeLessThanOrEqual(1);
  }
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
  await settled(page);
  await expect(again).toBeEnabled();
});

test("the first Erode on a page compiles no program in its frames: its dust's and stones' are compiled ahead (D453)", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await topDown(page);
  type R = { programsWarm: boolean; programs: { background: boolean }; gl: { info: { programs: unknown[] | null } } };
  // (where the browser draws in software or can't compile in the background nothing is compiled ahead: programs.ts)
  const background = await page.evaluate(() => (window.dgm3d!.renderer as unknown as R).programs.background);
  test.skip(!background, "programs are compiled in the background only on a GPU with KHR_parallel_shader_compile");
  await page.waitForFunction(() => (window.dgm3d!.renderer as unknown as R).programsWarm, null, { timeout: 120_000 });
  await page.keyboard.press("Shift+Digit8");
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  // every frame from the click on: the programs it compiled
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as R & { dgmCompiled?: number };
    const w = window as unknown as { dgmCompiled: number; dgmWatch: boolean };
    w.dgmCompiled = 0;
    w.dgmWatch = true;
    let last = r.gl.info.programs?.length ?? 0;
    const tick = () => {
      const n = r.gl.info.programs?.length ?? 0;
      w.dgmCompiled += Math.max(0, n - last);
      last = n;
      if (w.dgmWatch) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => status(page)).not.toBeNull();
  await settled(page);
  const compiled = await page.evaluate(() => {
    const w = window as unknown as { dgmCompiled: number; dgmWatch: boolean };
    w.dgmWatch = false;
    return w.dgmCompiled;
  });
  expect(compiled, "programs compiled by the first Erode's frames").toBe(0);
});

test("a click wears the land there, kept as one step; one Ctrl+Z restores the map exactly", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await topDown(page);
  await page.keyboard.press("Shift+Digit8");
  const row = page.getByRole("group", { name: "Erode options" });
  // a strong one, so there is something to see wherever the click lands
  await row.getByRole("slider", { name: "Power" }).focus();
  await page.keyboard.press("End");
  const before = await land(page);
  const n0 = (await labels(page)).length;
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => status(page)).not.toBeNull();
  await settled(page);
  // (D356: it plays out over many steps, never all at once. How many of them a machine draws is its own luck: the player
  // skips steps when its frames run late, by design, and forceDriver.test holds every frame in order on a fake clock. So
  // what is checked is the player's own record of the showing: many steps planned, and the land final only after the
  // time the showing was planned to take)
  const t = (await page.evaluate(() => window.dgmEditor!.forceTiming()))!;
  expect(t.total, "the showing has many steps").toBeGreaterThan(3);
  expect(t.show, "and takes time").toBeGreaterThanOrEqual(450);
  expect(t.final - t.worked, "its land is final only after the showing").toBeGreaterThanOrEqual(t.show - 50);
  const worn = await land(page);
  expect(worn.hollow.length > 0 || worn.heights.some((h, i) => h !== before.heights[i]), "the map changed").toBe(true);
  expect((await labels(page)).length).toBe(n0 + 1);
  expect((await labels(page)).at(-1)).toBe("Erode");
  // one undo step takes all of it back
  await page.keyboard.press("Control+z");
  await idle(page);
  expect((await labels(page)).length).toBe(n0);
  expect(await land(page)).toEqual(before);
});

test("Try another and Tab between rolls: the view holds exactly the shown roll's hollows, none of another's", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await topDown(page);
  await page.keyboard.press("Shift+Digit8");
  const row = page.getByRole("group", { name: "Erode options" });
  await row.getByRole("slider", { name: "Power" }).focus();
  await page.keyboard.press("End");
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => status(page)).not.toBeNull();
  await settled(page);
  const shown = () => page.evaluate(() => Array.from((window.dgm3d!.renderer as unknown as { map: { source: { columns: Map<number, unknown> } } }).map.source.columns.keys()).sort((a, b) => a - b));
  const first = await shown();
  expect(first.length).toBeGreaterThan(0);
  // (the hollows on screen as the second try begins: the series' start, never the first try's)
  await page.evaluate(() => {
    const w = window as unknown as { dgmFirst: number | null };
    w.dgmFirst = null;
    const id = setInterval(() => {
      if (window.dgmEditor!.force()) {
        w.dgmFirst = (window.dgm3d!.renderer as unknown as { map: { source: { columns: Map<number, unknown> } } }).map.source.columns.size;
        clearInterval(id);
      }
    }, 2);
  });
  await row.getByRole("button", { name: "Try another" }).click();
  await expect.poll(() => status(page)).not.toBeNull();
  await settled(page);
  expect(await page.evaluate(() => (window as unknown as { dgmFirst: number | null }).dgmFirst), "the first try's hollows are gone as the second begins").toBeLessThan(first.length);
  expect((await labels(page)).at(-1)).toBe("Erode, roll 2");
  const hollow = async () => (await land(page)).hollow.sort((a, b) => a - b);
  const second = await hollow();
  expect(second, "the second roll is another wear").not.toEqual(first);
  expect(await shown()).toEqual(second);
  // Tab between the two rolls: each shows exactly its own hollows, none of the other's (D488)
  await page.keyboard.press("Shift+Tab");
  await expect.poll(async () => (await labels(page)).at(-1)).toBe("Erode, roll 1");
  await idle(page);
  const firstAgain = await hollow();
  expect(firstAgain).toEqual(first);
  expect(await shown()).toEqual(first);
  await page.keyboard.press("Tab");
  await expect.poll(async () => (await labels(page)).at(-1)).toBe("Erode, roll 2");
  await idle(page);
  expect(await hollow()).toEqual(second);
  expect(await shown()).toEqual(second);
});
