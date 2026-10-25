// Objects go where the pointer aims, in caves and under overhangs (D491): the shelf aims at the ground seen (the voxel
// pick), names the level of a cave's floor in the placement, and the core decides. A water source, a seep and a relic
// on a tunnel's floor through its mouth and under the layer cut stand there, the ghost and its words saying so first;
// the start is kept on open ground with the core's one line; a picked relic drags along the floor and out of the cave;
// the water flows from the cave and the export carries the objects at the floor's level.
// The map is built here (a valley at 3, a plateau at 8 with a tunnel and a chamber under it): never an official map.

import { expect, test, type Page } from "@playwright/test";
import { readTimber } from "../../src/core/format/timber";
import { storedWater, surfaceOf } from "../../src/core/format/world";
import { Scene, build } from "../../tools/terrain3d-maps";
import { openEditor, waitForEditor } from "./open";

const W = 48;
const FLOOR = 3;

function caveMap(): Uint8Array {
  const s = new Scene(W, W, 8);
  // the valley, open ground at 3 down the west side
  s.columns(0, 0, 9, W - 1, FLOOR);
  // a tunnel from the valley into the plateau, and a chamber at its end: floor 3, air 3–6, the roof's top 8
  s.box(10, 21, 17, 24, FLOOR, 7, false);
  s.box(18, 16, 29, 29, FLOOR, 7, false);
  s.start(37, 37, 8);
  return build({ id: "place-in-caves", title: "Place in caves", tests: "", scene: s, days: 1, snapshots: [], checks: [], focus: [], samples: [], water: "none" }).bytes;
}

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const objects = (page: Page) =>
  page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    const out: string[] = [];
    for (let k = 0; k < e.count; k++) out.push(`${e.templates[e.template[k]]} ${e.x[k]},${e.y[k]},${e.z[k]}`);
    return out.sort();
  });
const applied = async (page: Page) => (await page.evaluate(() => window.dgmEditor!.info().history)).filter((h) => h.applied).length;

/** The layer cut at 6, looking down into the chamber. */
const underTheCut = (page: Page) =>
  page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    r.setSlice(6);
    r.setView({ mode: "orbit", yaw: 0.5, pitch: 1.0, distance: 34, target: [22, 3, -22] });
  });
/** No cut, from the valley into the tunnel's mouth. */
const intoTheMouth = (page: Page) =>
  page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    r.setSlice(null);
    r.setView({ mode: "orbit", yaw: -Math.PI / 2, pitch: 0.22, distance: 11, target: [15, 4.5, -22.5] });
  });

/** The point on the screen over (x, y)'s ground at `level`, checked to be what the pointer sees there. */
async function seen(page: Page, x: number, y: number, level: number): Promise<{ x: number; y: number }> {
  const p = await page.evaluate(
    ([a, b, z]) => {
      const r = window.dgm3d!.renderer;
      const q = r.project(a + 0.5, z, -(b + 0.5));
      const box = r.canvas.getBoundingClientRect();
      const c = { x: q.x + box.left, y: q.y + box.top };
      const h = r.pickSeen(c.x, c.y);
      return { ...c, hit: h ? [h.x, h.y, h.level] : null };
    },
    [x, y, level] as const,
  );
  expect(p.hit).toEqual([x, y, level]);
  return p;
}

/** Hover a spot with the shelf's object until its words are there; the words beside the pointer. */
async function hover(page: Page, p: { x: number; y: number }, words: string): Promise<void> {
  await page.mouse.move(p.x + 4, p.y);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await expect(page.locator(".shape-note")).toHaveText(words);
}

test("objects go where the pointer aims: on a cave's floor through its mouth and under the layer cut, the start kept on open ground, a relic dragged along the floor; the water flows from the cave and the file carries them at its level", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 860 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await page.getByLabel("Open a map or a project").setInputFiles({ name: "Place in caves.timber", mimeType: "application/zip", buffer: Buffer.from(caveMap()) });
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 120_000 });
  await waitForEditor(page);
  const shelf = page.getByRole("navigation", { name: "Place" });
  const start = ["StartingLocation 37,37,8"];

  // each on the floor, through the mouth and under the cut: "Place here", and placed there; then undone
  for (const [view, x, y] of [[intoTheMouth, 15, 22], [underTheCut, 24, 22]] as const) {
    await view(page);
    for (const [name, template] of [["Water source", "WaterSource"], ["Water seep", "WaterSeep"], ["Relic", "SmallRelic"]] as const) {
      await shelf.getByRole("button", { name: name === "Water source" ? /^Water source/ : name, exact: name !== "Water source" }).click();
      const p = await seen(page, x, y, FLOOR);
      await hover(page, p, "Place here");
      const before = await applied(page);
      await page.mouse.click(p.x, p.y);
      await idle(page);
      await expect.poll(() => applied(page)).toBe(before + 1);
      expect(await objects(page)).toEqual([...start, `${template} ${x},${y},${FLOOR}`].sort());
      await page.keyboard.press("Control+z");
      await idle(page);
      await page.keyboard.press("Escape");
    }
  }

  // the start stays on open ground (D491): refused on the floor with the core's line, and a click there moves nothing
  await shelf.getByRole("button", { name: "Start", exact: true }).click();
  const floor = await seen(page, 24, 22, FLOOR);
  await hover(page, floor, "the start needs open ground");
  const before = await applied(page);
  await page.mouse.click(floor.x, floor.y);
  await idle(page);
  expect(await applied(page)).toBe(before);
  await page.keyboard.press("Escape");

  // a source and a relic kept on the floor
  for (const [name, x, y] of [[/^Water source/, 24, 22], ["Relic", 26, 26]] as const) {
    await shelf.getByRole("button", { name, exact: typeof name === "string" }).click();
    const p = await seen(page, x, y, FLOOR);
    await hover(page, p, "Place here");
    await page.mouse.click(p.x, p.y);
    await idle(page);
    await page.keyboard.press("Escape");
  }
  expect(await objects(page)).toEqual([...start, `SmallRelic 26,26,${FLOOR}`, `WaterSource 24,22,${FLOOR}`].sort());

  // the relic picked with a click, then dragged along the floor: it stays on the floor
  const relic = await seen(page, 26, 26, FLOOR);
  await page.mouse.click(relic.x, relic.y);
  await idle(page);
  const to = await seen(page, 21, 26, FLOOR);
  await page.mouse.move(relic.x, relic.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await idle(page);
  await expect.poll(() => objects(page)).toEqual([...start, `SmallRelic 21,26,${FLOOR}`, `WaterSource 24,22,${FLOOR}`].sort());

  // the water flows from the cave, and the file carries the objects at the floor's level
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().waterPending), { timeout: 120_000 }).toBe(false);
  const file = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.exportTimber(true)).bytes));
  const world = readTimber(Uint8Array.from(file)).world;
  const at = (template: string) => {
    const e = world.entities.find((g) => g.Template === template) as { Components: { BlockObject: { Coordinates: { X: number; Y: number; Z: number } } } } | undefined;
    return e?.Components.BlockObject.Coordinates;
  };
  expect(at("WaterSource")).toEqual({ X: 24, Y: 22, Z: FLOOR });
  expect(at("SmallRelic")).toEqual({ X: 21, Y: 26, Z: FLOOR });
  const stored = storedWater(world.singletons, W, W);
  const top = surfaceOf(world);
  let cave = 0;
  let valley = 0;
  for (let k = 0; k < stored.tile.length; k++) {
    if (stored.depth[k] <= 0.05) continue;
    if (stored.floor[k] < top[stored.tile[k]]) cave++;
    else if (stored.tile[k] % W < 10) valley++;
  }
  expect(cave).toBeGreaterThan(50);
  expect(valley).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
