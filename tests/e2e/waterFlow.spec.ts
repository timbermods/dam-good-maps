// The water's journey after an edit (live editing, PLAN §20 D179 (2), D180 (8)): it plays over a
// few seconds, not all at once; pause holds it, skip jumps to the latest, replay plays it again; it
// ends exactly at the water the map has (the worker's, the export's); a drought drains the map and
// brings the water back, and a badtide turns the clean water to badwater and washes out, each ending
// at the map's water again.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, topDown } from "./open";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const wet = (page: Page) =>
  page.evaluate(() => {
    const d = window.dgm3d!.renderer.mapState()!.surface.depth;
    let n = 0;
    for (let i = 0; i < d.length; i++) if (d[i] > 0.05) n++;
    return n;
  });
/** The water on screen ends at the worker's (the exact settle can come a moment after the quick
 *  one on a slow machine: the journey then eases into it). */
async function endsAtMapWater(page: Page) {
  await expect
    .poll(
      async () => {
        const v = await volumes(page);
        return Math.abs(v.shown - v.worker) < 1e-3 * Math.max(1, v.worker);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
}

/** The water on screen and the worker's, as total depth (they must match once settled). */
const volumes = (page: Page) =>
  page.evaluate(async () => {
    const shown = window.dgm3d!.renderer.mapState()!.surface.depth;
    let a = 0;
    for (let i = 0; i < shown.length; i++) if (shown[i] > 0) a += shown[i];
    const w = (await window.dgmEditor!.worker.sessionView()).view.water;
    let b = 0;
    for (let k = 0; k < w.count; k++) b += w.depth[k];
    return { shown: a, worker: b };
  });

test("the water's journey plays over a few seconds, pauses, skips, replays, and ends at the map's water; a drought comes and goes", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await topDown(page);
  const bar = page.getByRole("toolbar", { name: "Water time" });
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.waterSettled()), { timeout: 30_000 }).toBe(true);
  const i = await page.evaluate(() => window.dgmEditor!.info());
  const W = i.W;
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;

  // a strong water source on high ground away from the start: its water spreads over seconds
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source", exact: true }).click();
  const want: [number, number] = [start[0] < W / 2 ? Math.round(W * 0.85) : Math.round(W * 0.15), Math.round(W * 0.9)];
  // (up from there if a bar over the map, the water bar's, covers it)
  const at = await page.evaluate(([x, y]) => {
    let yy = y;
    while (yy > 4) {
      const c = window.dgmEditor!.tileToClient(x, yy);
      if (document.elementFromPoint(c.x, c.y)?.tagName === "CANVAS") break;
      yy--;
    }
    return [x, yy] as [number, number];
  }, want);
  const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), at);
  const w0 = await wet(page);
  // every water the renderer is given, as its wet-tile count: the journey's own frames, not a count by the clock
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as Record<string, (w: unknown) => unknown>;
    const shown: number[] = [];
    (window as unknown as { dgmShown: number[] }).dgmShown = shown;
    for (const name of ["updateWater", "updateWaterSoon"]) {
      const original = r[name].bind(r);
      r[name] = (w) => {
        const out = original(w);
        const d = window.dgm3d!.renderer.mapState()!.surface.depth;
        let n = 0;
        for (let i = 0; i < d.length; i++) if (d[i] > 0.05) n++;
        shown.push(n);
        return out;
      };
    }
  });
  const frames = () => page.evaluate(() => (window as unknown as { dgmShown: number[] }).dgmShown);
  await page.mouse.click(p.x, p.y);
  await idle(page);
  // the row has no controls for the water's journey (Kyler, 2026-10-04): it plays into place by itself
  await expect(bar.getByRole("button")).toHaveText(["Drought", "Badtide", "◀", "▶"]);
  // it grows over the frames, not in one step: the page shows at least four different waters on its way
  await expect.poll(async () => new Set(await frames()).size, { timeout: 60_000 }).toBeGreaterThanOrEqual(4);
  expect(Math.max(...(await frames()))).toBeGreaterThan(w0);

  // it ends at the map's water: what the worker has, what the export gets
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.waterSettled()), { timeout: 60_000 }).toBe(true);
  await endsAtMapWater(page);
  // (and the canonical settle in place of the preview's: the journey ends on the preview's water, which the background
  // check's canonical settle replaces a moment later, its soil a few tiles different here (854 contaminated tiles
  // against 851). The hazards' Day 0 is the canonical map, so what is counted below is read from it, once its water
  // and soil are on screen: the worker's word that the canonical water is in place eases into it like any settled water.)
  await expect.poll(() => page.evaluate(() => !window.dgmEditor!.info().waterPending && window.dgmEditor!.waterSettled()), { timeout: 120_000 }).toBe(true);
  await endsAtMapWater(page);

  const settled = await wet(page);

  // a drought, held on a day (Kyler, 2026-10-04): its last day shows and stays, the water drained; ◀ steps a day back,
  // ▶ past the default length; a day typed into the box (double-clicked) shows, Esc cancels one; Drought again brings
  // the map's own water back
  const day = bar.locator(".day-label");
  await expect(day).toHaveText("Day –");
  // (with no hazard shown, a double-click does nothing)
  await day.dblclick();
  await expect(bar.getByRole("textbox", { name: "Day" })).toHaveCount(0);
  // (the buttons toggle, and their tooltips say so; the title waits in data-tip-held while a tooltip shows)
  const words = (name: string) => bar.getByRole("button", { name }).evaluate((el) => el.getAttribute("title") ?? el.getAttribute("data-tip-held"));
  expect(await words("Drought")).toBe("Show a drought's last day: the sources stop");
  expect(await words("Badtide")).toBe("Show a badtide's last day: clean sources turn bad");
  await expect(bar.locator(".day-length")).toHaveText("");
  await bar.getByRole("button", { name: "Drought" }).click();
  // (the box reads the day at once; its quiet fill runs until the day shows)
  await expect(day).toHaveText(/^Day \d+$/);
  await expect(day).not.toHaveClass(/counting/, { timeout: 120_000 });
  const last = Number((await day.textContent())!.replace(/\D/g, ""));
  expect(last).toBeGreaterThan(1);
  // (the hazard's length is said beside the day, and the button now puts the map's own water back)
  await expect(bar.locator(".day-length")).toHaveText(`of ${last}`);
  expect(await words("Drought")).toBe("Back to the map's own water");
  expect(await wet(page)).toBeLessThan(settled / 2);
  await page.waitForTimeout(1500);
  await expect(day).toHaveText(`Day ${last}`);
  await bar.getByRole("button", { name: "Day on" }).click();
  await expect(day).toHaveText(`Day ${last + 1}`);
  // (past the hazard's length the words say so: never "Day 10 of 9")
  await expect(bar.locator(".day-length")).toHaveText(`past ${last}`);
  // (the box keeps its place and size while the day is worked out: it stays inside its stepper)
  const working = await day.boundingBox();
  await expect(day).not.toHaveClass(/counting/, { timeout: 60_000 });
  expect(working).toEqual(await day.boundingBox());
  await bar.getByRole("button", { name: "Day back" }).click();
  await bar.getByRole("button", { name: "Day back" }).click();
  await expect(day).toHaveText(`Day ${last - 1}`);
  await expect(day).not.toHaveClass(/counting/, { timeout: 60_000 });
  // a typed day, in the box's own place and size
  const box = await day.boundingBox();
  await day.dblclick();
  const field = bar.getByRole("textbox", { name: "Day" });
  await expect(field).toBeFocused();
  const typed = await field.boundingBox();
  expect([typed!.x, typed!.y, typed!.width, typed!.height]).toEqual([box!.x, box!.y, box!.width, box!.height]);
  await field.fill("2");
  await field.press("Enter");
  await expect(day).toHaveText("Day 2");
  await expect(day).not.toHaveClass(/counting/, { timeout: 60_000 });
  await day.dblclick();
  await field.fill("5");
  await field.press("Escape");
  await expect(day).toHaveText("Day 2");
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(bar.getByRole("button", { name: "Drought" })).toHaveAttribute("aria-pressed", "false");
  await expect(day).toHaveText("Day –");
  await endsAtMapWater(page);

  // a badtide: the clean water turns to badwater, then washes out to the map's water
  const bad = () =>
    page.evaluate(() => {
      const s = window.dgm3d!.renderer.mapState()!.surface as unknown as { depth: Float32Array; contamination: Float32Array };
      let n = 0;
      for (let i = 0; i < s.depth.length; i++) if (s.depth[i] > 0.05 && s.contamination[i] > 0.5) n++;
      return n;
    });
  // (the ground the veins are drawn on: the soil the renderer holds, contaminated where the day's water poisons it)
  const poisoned = () =>
    page.evaluate(() => {
      const c = window.dgm3d!.renderer.mapState()!.soil!.contamination;
      let n = 0;
      for (let i = 0; i < c.length; i++) if (c[i] > 0) n++;
      return n;
    });
  const bad0 = await bad();
  const poisoned0 = await poisoned();
  await bar.getByRole("button", { name: "Badtide" }).click();
  await expect(day).toHaveText(/^Day \d+$/);
  await expect(day).not.toHaveClass(/counting/, { timeout: 180_000 });
  expect(await bad()).toBeGreaterThan(bad0 + 50);
  // the held day's soil is what is drawn (the Badtide view's veins, D133): more of the ground is contaminated than on
  // Day 0, and Day 0 shows the map's own ground again
  expect(await poisoned()).toBeGreaterThan(poisoned0 + 50);
  const lastBad = Number((await day.textContent())!.replace(/\D/g, ""));
  await bar.getByRole("button", { name: "Day back" }).click();
  await expect(day).toHaveText(`Day ${lastBad - 1}`);
  await expect(day).not.toHaveClass(/counting/, { timeout: 60_000 });
  await day.dblclick();
  await field.fill("0");
  await field.press("Enter");
  await expect(day).toHaveText("Day 0");
  await expect.poll(poisoned, { timeout: 60_000 }).toBe(poisoned0);
  await bar.getByRole("button", { name: "Badtide" }).click();
  await expect(bar.getByRole("button", { name: "Badtide" })).toHaveAttribute("aria-pressed", "false");
  await endsAtMapWater(page);
  expect(await poisoned()).toBe(poisoned0);
  expect(errors).toEqual([]);
});

test("an Unstable Core's moment shows under the water row while a hazard is held, and goes with it (D339)", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley&bw=0&uc=1");
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.waterSettled()), { timeout: 30_000 }).toBe(true);
  const bar = page.getByRole("toolbar", { name: "Water time" });
  const notes = bar.getByRole("note").locator("span");
  await expect(notes).toHaveCount(0);
  await bar.getByRole("button", { name: "Badtide" }).click();
  // (this map's two cores start their countdowns in cycles 6 and 7; a Normal cycle opens with 13 to 17 temperate days,
  // so the generator's 10.5 days put each 2 to 7 days before the hazard)
  await expect(notes).toHaveText([
    "Unstable core: goes off 2 to 7 days before cycle 6's drought or badtide",
    "Unstable core: goes off 2 to 7 days before cycle 7's drought or badtide",
  ]);
  // (the row never changes shape for it)
  const box = await bar.boundingBox();
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(notes.first()).toHaveText("Unstable core: goes off 2 to 7 days before cycle 6's drought or badtide");
  expect(await bar.boundingBox()).toEqual(box);
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(notes).toHaveCount(0);
  expect(errors).toEqual([]);
});
