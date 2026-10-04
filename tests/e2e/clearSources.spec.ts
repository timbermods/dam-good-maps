// Item 15 (D322): a brush that clears sources updates the view and the water at once, exactly as
// deleting a source does: the source's disc goes, the water simulation stops running it, and its
// water drains away (D260).

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";
import { startHintUp, toolInHand } from "./helpers";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
/** The water sources the view draws. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    const out: [number, number][] = [];
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource") out.push([e.x[k], e.y[k]]);
    return out;
  });
/** The water the view shows round a tile (the sum of depths in a square of radius r). */
const waterNear = (page: Page, x: number, y: number, r: number) =>
  page.evaluate(
    ([cx, cy, rr]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      let sum = 0;
      for (let yy = cy - rr; yy <= cy + rr; yy++) for (let xx = cx - rr; xx <= cx + rr; xx++) sum += m.surface.depth[yy * m.W + xx] || 0;
      return sum;
    },
    [x, y, r] as [number, number, number],
  );

async function stroke(page: Page, x: number, y: number) {
  const p = await client(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let k = 0; k < 10; k++) {
    await page.mouse.move(p.x + (k % 2 ? 3 : -3), p.y);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await idle(page);
}

test("a stroke that clears sources takes their discs and their water at once (item 15)", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openEditor(page, "s=35&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  // (the water at its normal pace: the stroke's own water flows while it is painted, D197)

  // flat, dry, empty ground far from the start and from water
  const spot = await page.evaluate(() => {
    const i = window.dgmEditor!.info();
    const st = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
    const m = window.dgm3d!.renderer.mapState()!;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    for (let y = 14; y < m.H - 14; y++)
      for (let x = 14; x < m.W - 14; x++) {
        if (Math.hypot(x - st[0], y - st[1]) < 16) continue;
        const h0 = m.heights[y * m.W + x];
        if (h0 < 4) continue;
        let ok = true;
        for (let yy = y - 6; yy <= y + 6 && ok; yy++) for (let xx = x - 6; xx <= x + 6 && ok; xx++) if (m.surface.depth[yy * m.W + xx] > 0 || !onMap(xx, yy)) ok = false;
        for (let yy = y - 2; yy <= y + 2 && ok; yy++) for (let xx = x - 2; xx <= x + 2 && ok; xx++) if (m.heights[yy * m.W + xx] !== h0) ok = false;
        for (let k = 0; k < m.entities.count && ok; k++) if (Math.abs(m.entities.x[k] - x) <= 3 && Math.abs(m.entities.y[k] - y) <= 3) ok = false;
        if (ok) return [x, y, h0] as [number, number, number];
      }
    return null;
  });
  expect(spot).not.toBeNull();
  const [x, y] = spot!;
  // level ground round it first: a Flatten from there
  await page.keyboard.press("3");
  await toolInHand(page);
  await page.getByRole("group", { name: "Flatten options" }).getByRole("slider", { name: "Size" }).fill("6");
  await stroke(page, x, y);
  await page.keyboard.press("Escape");
  // (a Flatten stroke leaves a "Move the start here" tag on this ground once the page is idle: picking the
  // source from the shelf takes it away, so wait for it, or a late one sits under the strokes below)
  await startHintUp(page);

  for (const brush of [{ key: "3", name: "Flatten" }, { key: "4", name: "Smooth" }]) {
    // a source there, and its water
    await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: /^Water source/ }).click();
    await toolInHand(page);
    const p = await client(page, x, y);
    await page.mouse.move(p.x + 3, p.y);
    await page.mouse.click(p.x, p.y);
    await idle(page);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await drawn(page)).some(([a, b]) => a === x && b === y)).toBe(true);
    await expect.poll(() => waterNear(page, x, y, 2), { timeout: 30_000 }).toBeGreaterThan(0.2);

    // the brush, clearing sources, over flat ground: a Flatten at the ground's own level and a
    // Smooth change no ground, yet the sources they pressed go (Kyler saw them stay, item 15)
    await page.keyboard.press(brush.key);
    await toolInHand(page);
    const row = page.getByRole("group", { name: `${brush.name} options` });
    await row.getByRole("group", { name: "Sources" }).getByRole("button", { name: "Clear" }).click();
    await row.getByRole("slider", { name: "Size" }).fill("2");
    const n0 = (await page.evaluate(() => window.dgmEditor!.info())).history.filter((e) => e.applied).length;
    await stroke(page, x, y);
    const labels = (await page.evaluate(() => window.dgmEditor!.info())).history.filter((e) => e.applied).map((e) => e.label);
    expect(labels).toHaveLength(n0 + 1);
    expect(labels.at(-1)).toBe(`${brush.name}, a source cleared`);
    expect(await page.evaluate(() => window.dgmEditor!.sourceGlow().length)).toBe(0);
    await expect.poll(async () => (await drawn(page)).some(([a, b]) => a === x && b === y), { timeout: 5_000 }).toBe(false);
    // the water it fed drains away (D260): the view shows none round it once it settles
    await expect.poll(() => waterNear(page, x, y, 4), { timeout: 30_000 }).toBeLessThan(0.05);
    await row.getByRole("group", { name: "Sources" }).getByRole("button", { name: "Ride" }).click();
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

