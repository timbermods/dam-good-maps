// ROADMAP M4 acceptance: generate → refine → back to settings → regenerate → refine keeps the
// player's edits, through the page itself. Also: the editor's tools, the start dragged on the map,
// undo and redo, the history, export from both screens, and the autosave after a reload.

import { expect, test, type Page } from "@playwright/test";

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), from);
  const b = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  await page.evaluate(() => window.dgmEditor!.idle());
}

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());

test("generate → refine → back to settings → regenerate → refine keeps the player's edits", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });

  // refine: the editor opens the generated map in 3D
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "River Valley" })).toBeVisible();
  expect((await page.evaluate(() => window.dgm3d!.renderer.info())).triangles).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Top-down" }).click();

  // the player's own edits: a stroke of the Lower brush, and a water source (the brush kit and the
  // water, D182, D184)
  let i = await info(page);
  const W = i.W;
  const start0 = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const x = start0[0] < W / 2 ? Math.round(W * 0.78) : Math.round(W * 0.22);
  const lowered: [number, number] = [x, 12];
  const ground = await page.evaluate(([a, b]) => window.dgm3d!.renderer.heightAt(a, b), lowered);
  await page.getByRole("button", { name: "Lower brush (2)" }).click();
  await drag(page, [lowered[0] - 3, lowered[1]], [lowered[0] + 3, lowered[1]]);
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  await page.keyboard.press("Escape");
  // a spring on dry, empty ground beside the river, its water running straight in: away from the
  // start and from the relics, mine sites and geothermal fields, which must stay off water
  const spring = await page.evaluate(
    ([s0, s1]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const e = m.entities;
      const extras: [number, number][] = [];
      for (let k = 0; k < e.count; k++) if (/Relic|Geothermal|Mine|Underground/i.test(e.templates[e.template[k]])) extras.push([e.x[k], e.y[k]]);
      for (let y = 4; y < m.H - 4; y++)
        for (let x2 = 4; x2 < m.W - 4; x2++) {
          const i = y * m.W + x2;
          if (m.surface.depth[i] > 0 || Math.hypot(x2 - s0, y - s1) < 20 || extras.some(([ex, ey]) => Math.hypot(ex - x2, ey - y) < 16)) continue;
          let wet = false;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (m.surface.depth[(y + dy) * m.W + x2 + dx] > 0.2) wet = true;
          if (!wet) continue;
          let empty = true;
          for (let k = 0; k < e.count && empty; k++) if (Math.abs(e.x[k] - x2) <= 2 && Math.abs(e.y[k] - y) <= 2) empty = false;
          if (empty && m.heights[i] <= m.heights[i - 1] + 1 && m.heights[i] <= m.heights[i + 1] + 1) return [x2, y] as [number, number];
        }
      return null;
    },
    [start0[0], start0[1]] as const,
  );
  expect(spring).not.toBeNull();
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source (6)" }).click();
  const sp = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), spring!);
  await page.mouse.click(sp.x, sp.y);
  await page.evaluate(() => window.dgmEditor!.idle());
  // (Esc puts the water source back on the shelf)
  await page.keyboard.press("Escape");
  i = await info(page);
  expect(i.history.map((h) => h.label)).toEqual([expect.stringMatching(/^Lower, \d+ tiles$/), "Place water source"]);
  const springs = () => page.evaluate(async ([a, b]) => (await window.dgmEditor!.worker.entitiesAt(a, b)).filter((e) => e.template === "WaterSource").length, spring!);
  expect(await springs()).toBe(1);

  // an edit of what the generator made: drag the start two tiles on the map
  const before = i.features.find((f) => f.kind === "start")!.params as { position: [number, number] };
  // (west: the berry bushes this map plants for its start stay within reach; two tiles east, 12
  // of them fall outside the 20 tiles start.food counts, and export would warn)
  await drag(page, before.position, [before.position[0] - 2, before.position[1]]);
  await expect.poll(async () => (await info(page)).history.length, { timeout: 30_000 }).toBe(3);
  await page.evaluate(() => window.dgmEditor!.idle());
  i = await info(page);
  const moved = i.features.find((f) => f.kind === "start")!.params as { position: [number, number] };
  expect(moved.position).toEqual([before.position[0] - 2, before.position[1]]);

  // undo and redo, and the history list
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await page.evaluate(() => window.dgmEditor!.idle());
  expect((await info(page)).history.map((h) => h.applied)).toEqual([true, true, false]);
  await page.getByRole("button", { name: "Redo (Ctrl+Y)" }).click();
  await page.evaluate(() => window.dgmEditor!.idle());
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: /^History/ }).click();
  await expect(page.getByRole("complementary", { name: "History" }).getByRole("button", { name: "Move start" })).toBeVisible();

  // saved from the editor (export profile): the quiet dot says it is ready to play, and the menu's
  // Download .timber gives the file
  await expect(page.getByRole("button", { name: /^Checks: Ready to play/ })).toBeVisible({ timeout: 60_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Download .timber" }).click();
  expect((await download).suggestedFilename()).toBe("River Valley (4242).timber");
  await expect(page.getByRole("status").filter({ hasText: /Move the file to/ })).toBeVisible();

  // back to settings: the card shows the edited map; change a setting and generate again
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Back to settings" }).click();
  await expect(page.getByRole("button", { name: "Generate, keeping my edits" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Your 3 edits stay/)).toBeVisible();
  await page.getByLabel("Designed for").selectOption("hard");
  await page.getByRole("button", { name: "Generate, keeping my edits" }).click();
  await expect(page.getByText(/seed 4242 · designed for hard/)).toBeVisible({ timeout: 120_000 });
  // export from the settings page too
  await page.getByRole("button", { name: /^Export River Valley/ }).click();
  await expect(page.getByRole("dialog").getByText(/checks pass|Warnings/)).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");

  // refine again: the edits are all there, and the regeneration is one more step in the history
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor, null, { timeout: 60_000 });
  i = await info(page);
  expect(i.spec!.designedFor).toBe("hard");
  expect(i.history.map((h) => h.label)).toEqual([expect.stringMatching(/^Lower, \d+ tiles$/), "Place water source", "Move start", "Change settings and regenerate"]);
  expect(i.edits).toBe(3);
  expect(i.orphans).toEqual([]);
  expect((i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position).toEqual(moved.position);
  // the lowered ground stays so on the new map, and the spring is there
  expect(await page.evaluate(([a, b]) => window.dgm3d!.renderer.heightAt(a, b), lowered)).toBeLessThan(ground);
  expect(await springs()).toBe(1);

  // the autosave: a reload in the editor opens the same map with its edits
  await page.waitForTimeout(2500);
  await page.reload();
  await page.waitForFunction(() => !!window.dgmEditor, null, { timeout: 60_000 });
  const again = await info(page);
  expect(again.history.length).toBe(3); // a reopened document's history starts at its generation
  expect(again.edits).toBe(3);
  expect(await springs()).toBe(1);
  expect(errors).toEqual([]);
});

test("a click picks no generated feature, and never water (D184, D196)", async ({ page }) => {
  await page.goto("./#s=77&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  // a click on the start picks nothing (it is dragged, or picked on the shelf), and nothing is
  // listed: the generator's features are its plan, not objects (D184)
  const start = (await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] };
  const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), start.position);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole("group", { name: /selected/ })).toHaveCount(0);
  // water is never an object (D196): a click on the river picks nothing, and Delete then removes
  // nothing
  const river = (await info(page)).features.find((f) => f.kind === "river")!.params as { path: [number, number][] };
  const w = river.path[Math.floor(river.path.length / 2)];
  const wp = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [Math.round(w[0]), Math.round(w[1])] as [number, number]);
  await page.mouse.click(wp.x, wp.y);
  await expect(page.getByRole("group", { name: /selected/ })).toHaveCount(0);
  await page.keyboard.press("Delete");
  await page.evaluate(() => window.dgmEditor!.idle());
  expect((await info(page)).edits).toBe(0);
  // hover reads the tile in plain words
  const q = await page.evaluate(() => window.dgmEditor!.tileToClient(40, 40));
  await page.mouse.move(q.x, q.y);
  await expect(page.locator(".readout")).toContainText(/height \d+/i);
});
