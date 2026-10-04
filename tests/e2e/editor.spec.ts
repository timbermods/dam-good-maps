// ROADMAP M4 acceptance, as D336 and D330 have it: the page opens a generated map in the editor at once;
// Generate over an edited map replaces it without asking and keeps it, edits and all, in Your maps, through the
// page itself. Also: the editor's tools, the start dragged on the map, undo and redo, the history, the export
// and the open map brought back on the next visit.

import { expect, test, type Page } from "@playwright/test";
import { centreOn, generateButton, openEditor, openFileMenu, openSection, waitForEditor } from "./open";

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

test("open → edit → Generate replaces the map without asking and Your maps keeps the edits → a reload brings the open map back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // (seed 4262 on M9b's maps, D148: the edited 4261 shows a geothermal field within 2 tiles of water, a
  // thing to look at; seed 4261 since D333, D148: on 4254's map the start moved two tiles west has little wood and
  // its plants dry out in a drought, which the quiet dot rightly counts; seed 4254 since batch 5,
  // 4244's berries drying out; seed 4244 since M9a: on 0.7.0's 4242 the start stood on a floodplain
  // a level above the river's outlet, and the spring below flooded it)
  // (a generated map's name is its own since M9b, from its standout, D278: the editor keeps it)
  // refine: the editor opens the generated map in 3D
  await openEditor(page, "s=4262&z=96&d=n&t=riverValley");
  await expect(page.getByRole("heading", { name: (await info(page)).name })).toBeVisible();
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
  await centreOn(page, lowered[0], lowered[1]);
  await page.getByRole("button", { name: "Lower brush (2)" }).click();
  // (from the tile itself: its target is a level below where the stroke starts, D322)
  await drag(page, lowered, [lowered[0] + 3, lowered[1]]);
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
  await centreOn(page, spring![0], spring![1]);
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
  // (west: the berries, wood and water this map has for its start stay within reach)
  await centreOn(page, before.position[0], before.position[1]);
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
  await (await openFileMenu(page)).getByRole("menuitem", { name: /^History/ }).click();
  await expect(page.getByRole("complementary", { name: "History" }).getByRole("button", { name: "Move start" })).toBeVisible();

  // saved from the editor (export profile): the quiet dot says it is ready to play, and the File menu's
  // Download .timber gives the file
  await expect(page.getByRole("button", { name: /^Checks: Ready to play/ })).toBeVisible({ timeout: 60_000 });
  const download = page.waitForEvent("download");
  await (await openFileMenu(page)).getByRole("menuitem", { name: "Download .timber" }).click();
  expect((await download).suggestedFilename()).toBe("dgm-river-valley-4262.timber");
  await expect(page.getByRole("status").filter({ hasText: /Move the file to/ })).toBeVisible();

  // Generate over the edited map asks nothing and makes a new map (edits never replay onto new land, D336);
  // the edited map stays in Your maps, and its row brings it back with its edits
  const madeBefore = await page.evaluate(() => window.dgm!.current!()!.made);
  await (await openSection(page, "Resources")).getByLabel("Grove size").selectOption("bigWoods");
  await generateButton(page).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, madeBefore, { timeout: 120_000 });
  await expect.poll(async () => (await info(page)).spec?.settings.resources.groveSize, { timeout: 60_000 }).toBe("bigWoods");
  expect((await info(page)).edits).toBe(0);
  // (the Resources section stays open in place across the new map; the new map joins Your maps a few seconds after it
  // opens, so its tile is waited for, not assumed)
  const yours = page.getByRole("region", { name: "Your maps" });
  await expect(yours.getByRole("button")).toHaveCount(2, { timeout: 30_000 });
  await yours.locator("button:not([aria-current])").click();
  // (the editor opens again for the map from Your maps: wait for it before asking it anything)
  await expect.poll(() => page.evaluate(() => window.dgmEditor?.info().edits ?? -1), { timeout: 60_000 }).toBe(3);
  await waitForEditor(page);

  // the edited map as it was, its edits all there
  i = await info(page);
  expect(i.spec!.settings.resources.groveSize).not.toBe("bigWoods");
  expect(i.history.map((h) => h.label)).toEqual([expect.stringMatching(/^Lower, \d+ tiles$/), "Place water source", "Move start"]);
  expect(i.edits).toBe(3);
  expect(i.orphans).toEqual([]);
  expect((i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position).toEqual(moved.position);
  expect(await page.evaluate(([a, b]) => window.dgm3d!.renderer.heightAt(a, b), lowered)).toBeLessThan(ground);
  expect(await springs()).toBe(1);

  // a reload of the address opens the open map with its edits, from Your maps, not a fresh generation
  await page.waitForTimeout(2500);
  await page.reload();
  await waitForEditor(page);
  const again = await info(page);
  expect(again.history.length).toBe(3); // a reopened document's history starts at its generation
  expect(again.edits).toBe(3);
  expect(await springs()).toBe(1);
  expect(errors).toEqual([]);
});

test("a click picks no generated feature, and never water (D184, D196)", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  // a click on the start picks nothing (it is dragged, or picked on the shelf), and nothing is
  // listed: the generator's features are its plan, not objects (D184)
  const start = (await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] };
  await centreOn(page, start.position[0], start.position[1]);
  const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), start.position);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole("group", { name: /selected/ })).toHaveCount(0);
  // water is never an object (D196): a click on the river picks nothing, and Delete then takes the
  // bed's top block, never an object (D323 item 1: under water, the ground's top block)
  const river = (await info(page)).features.find((f) => f.kind === "river")!.params as { path: [number, number][] };
  const w = river.path[Math.floor(river.path.length / 2)];
  await centreOn(page, Math.round(w[0]), Math.round(w[1]));
  const wp = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [Math.round(w[0]), Math.round(w[1])] as [number, number]);
  await page.mouse.click(wp.x, wp.y);
  await expect(page.getByRole("group", { name: /selected/ })).toHaveCount(0);
  await page.keyboard.press("Delete");
  await page.evaluate(() => window.dgmEditor!.idle());
  expect((await info(page)).edits).toBe(1);
  expect((await info(page)).history.at(-1)!.label).toBe("Delete a level of ground");
  // hover reads the tile in plain words (a tile of the start's own dry pad: (40, 40) is water on
  // D333's map, D148)
  const q = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [start.position[0] + 2, start.position[1]] as [number, number]);
  await page.mouse.move(q.x, q.y);
  await expect(page.locator(".readout")).toContainText(/height \d+/i);
});

test("the next visit, with no link in the address, opens the map left open, with its edits", async ({ page }) => {
  await openEditor(page, "s=4244&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("button", { name: "Lower brush (2)" }).click();
  await drag(page, [30, 40], [34, 40]);
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  expect((await info(page)).edits).toBe(1);
  const name = (await info(page)).name;
  await page.waitForTimeout(2500);
  await page.goto("about:blank");
  await page.goto("./");
  await waitForEditor(page);
  const again = await info(page);
  expect(again.edits).toBe(1);
  expect(again.name).toBe(name);
});
