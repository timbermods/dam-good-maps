// The Block tool on the page (3D step 3, D335): key 7 picks it; hovering a face shows what a click would add, the preview
// the core's `blockFalls` gives, nothing applied until the button is let go; a click adds onto the face, Shift removes,
// a drag paints in the plane of the first face and is one undo step; a drag that would leave ground the game drops
// shows the blocks that would fall and the reason beside the pointer, and is refused on release with the page's
// note; on an imported cave map a Shift-click removes blocks from a cave wall.

import { expect, test, type Page } from "@playwright/test";
import { writeTimber } from "../../src/core/format/timber";
import { caveFile } from "../contract/caveMap";
import { toolInHand } from "./helpers";
import { openEditor } from "./open";

type Side = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

const edits = (page: Page) => page.evaluate(() => window.dgmEditor!.info().edits);
const height = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgm3d!.renderer.heightAt(a, b), [x, y]);
const block = (page: Page) => page.evaluate(() => window.dgmEditor!.block());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());

/** The screen point of the middle of a block's face: the block at (x, y, layer) and which side. */
async function face(page: Page, x: number, y: number, layer: number, side: Side) {
  return page.evaluate(
    ([x, y, layer, side]) => {
      const o = { "+x": [1, 0.5, 0.5], "-x": [0, 0.5, 0.5], "+y": [0.5, 1, 0.5], "-y": [0.5, 0, 0.5], "+z": [0.5, 0.5, 1], "-z": [0.5, 0.5, 0] }[side as Side]!;
      const r = window.dgm3d!.renderer;
      const p = r.project(x + o[0], layer + o[2], -(y + o[1]));
      const box = r.canvas.getBoundingClientRect();
      return { x: p.x + box.left, y: p.y + box.top };
    },
    [x, y, layer, side] as const,
  );
}

/** Look at a point of the map from the south-east, close. */
async function look(page: Page, x: number, y: number, h: number, distance = 20) {
  await page.evaluate(([x, y, h, distance]) => window.dgm3d!.renderer.setView({ target: [x + 0.5, h, -(y + 0.5)], distance, yaw: 0.5, pitch: 0.7 }), [x, y, h, distance] as const);
}

/** A flat dry stretch of the map with nothing standing near it: its corner and its level. */
async function flatSpot(page: Page) {
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const { W, H, heights, surface, entities } = m;
    const busy = new Set<number>();
    for (let k = 0; k < entities.count; k++) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) busy.add((entities.y[k] + dy) * W + entities.x[k] + dx);
    for (let y = 4; y < H - 12; y++)
      for (let x = 4; x < W - 16; x++) {
        const h0 = heights[y * W + x];
        let ok = h0 > 1 && h0 < 15;
        for (let j = 0; j < 9 && ok; j++) for (let i = 0; i < 12 && ok; i++) {
          const k = (y + j) * W + x + i;
          if (heights[k] !== h0 || surface.depth[k] > 0.01 || busy.has(k)) ok = false;
        }
        if (ok) return { x, y, h: h0 };
      }
    return null;
  });
  expect(spot, "a flat dry stretch 12 × 9 clear of objects").not.toBeNull();
  return spot!;
}

/** Point at a face and wait for the preview to be about it. */
async function aim(page: Page, x: number, y: number, layer: number, side: Side) {
  const p = await face(page, x, y, layer, side);
  await page.mouse.move(p.x, p.y);
  await expect.poll(async () => (await block(page)).preview?.added.length ?? 0, { message: "the preview for the face under the pointer" }).toBeGreaterThan(0);
  return p;
}

/** A click on a face, and the edit it made is on the map. */
async function click(page: Page, x: number, y: number, layer: number, side: Side, shift = false) {
  const before = await edits(page);
  const p = await face(page, x, y, layer, side);
  await page.mouse.move(p.x, p.y);
  // (straight after the click before it: CI draws in software, a frame of the map holds the page for a few hundred
  // milliseconds while the last edit's water and soil are drawn, and the hover and its answer each wait their turn
  // between frames; on a GPU the preview answers in tens of milliseconds. What is asserted is unchanged.)
  await expect.poll(async () => (await block(page)).preview !== null, { timeout: 15_000 }).toBe(true);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await expect.poll(() => edits(page)).toBe(before + 1);
  await idle(page);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test("the Block tool: key 7 picks it, its settings and keys, Esc and the other tools put it away", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  const button = page.getByRole("button", { name: "Block tool (7)" });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("7");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await toolInHand(page);
  const settings = page.getByRole("group", { name: "Block options" });
  await expect(settings).toBeVisible();
  for (const name of ["Size", "Shape", "Action"]) await expect(settings.getByText(name, { exact: true })).toBeVisible();
  // { and } step the Size from 1 to 8, never past
  const size = (await block(page)).settings.size;
  await page.keyboard.press("}");
  expect((await block(page)).settings.size).toBe(size + 1);
  for (let k = 0; k < 12; k++) await page.keyboard.press("{");
  expect((await block(page)).settings.size).toBe(1);
  for (let k = 0; k < 12; k++) await page.keyboard.press("}");
  expect((await block(page)).settings.size).toBe(8);
  await settings.getByRole("button", { name: "Round" }).click();
  expect((await block(page)).settings.shape).toBe("round");
  await settings.getByRole("button", { name: "Remove" }).click();
  expect((await block(page)).settings.mode).toBe("remove");
  await settings.getByRole("button", { name: "Add" }).click();
  await settings.getByRole("button", { name: "Square" }).click();
  // another tool takes its place, and Esc puts it away
  await page.keyboard.press("2");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect((await block(page)).held).toBe(false);
  await page.keyboard.press("7");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(settings).toHaveCount(0);
});

test("a click adds a block onto the face, Shift removes it, a drag paints a plane in one step, and the preview is what is applied", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  const { x, y, h } = await flatSpot(page);
  await page.keyboard.press("7");
  await toolInHand(page);
  // Size 1: a click is one block
  for (let k = 0; k < 8; k++) await page.keyboard.press("{");
  const px = x + 4;
  const py = y + 4;
  await look(page, px, py, h);

  // hovering shows the one block the click would add, and changes nothing
  const edits0 = await edits(page);
  await aim(page, px, py, h - 1, "+z");
  const hover = (await block(page)).preview!;
  expect(hover.added).toEqual([[px, py, h]]);
  expect(hover.reason).toBeNull();
  expect(await edits(page)).toBe(edits0);
  expect(await height(page, px, py)).toBe(h);

  // the click adds it
  await click(page, px, py, h - 1, "+z");
  expect(await height(page, px, py)).toBe(h + 1);

  // Shift turns the same face's click into a remove: the Action shows it, the preview takes the block
  const p = await face(page, px, py, h, "+z");
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down("Shift");
  await expect(page.getByRole("group", { name: "Block options" }).getByRole("button", { name: "Remove" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await block(page)).preview?.removed.length ?? 0).toBe(1);
  expect((await block(page)).preview!.removed).toEqual([[px, py, h]]);
  await page.keyboard.up("Shift");
  await click(page, px, py, h, "+z", true);
  expect(await height(page, px, py)).toBe(h);

  // a drag along the plane of the first face adds a layer under it, and is one undo step
  const a = await face(page, px - 2, py, h - 1, "+z");
  const b = await face(page, px + 3, py, h - 1, "+z");
  const before = await edits(page);
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => (await block(page)).preview !== null).toBe(true);
  await page.mouse.down();
  for (let t = 1; t <= 8; t++) {
    await page.mouse.move(a.x + ((b.x - a.x) * t) / 8, a.y + ((b.y - a.y) * t) / 8);
    await page.waitForTimeout(30);
  }
  await expect.poll(async () => (await block(page)).preview?.added.length ?? 0).toBe(6);
  expect((await block(page)).dragging).toBe(true);
  // (nothing is applied until release)
  expect(await edits(page)).toBe(before);
  expect(await height(page, px + 1, py)).toBe(h);
  await page.mouse.up();
  await expect.poll(() => edits(page)).toBe(before + 1);
  await idle(page);
  for (let i = -2; i <= 3; i++) expect(await height(page, px + i, py), `x ${px + i}`).toBe(h + 1);
  expect(await height(page, px + 4, py)).toBe(h);
  expect(await height(page, px - 3, py)).toBe(h);
  // one undo takes the whole drag back
  await page.keyboard.press("z");
  await expect.poll(() => edits(page)).toBe(before);
  for (let i = -2; i <= 3; i++) expect(await height(page, px + i, py), `x ${px + i} after undo`).toBe(h);

  // Esc in the middle of a drag applies nothing
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => (await block(page)).preview !== null).toBe(true);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await idle(page);
  expect(await edits(page)).toBe(before);
  expect((await block(page)).held, "Esc cancelled the drag and kept the tool").toBe(true);
});

test("a drag out over air chains: each block goes where it touches the last, the preview shows the whole span, and one click-drag is one step", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  const { x, y, h } = await flatSpot(page);
  await page.keyboard.press("7");
  await toolInHand(page);
  for (let k = 0; k < 8; k++) await page.keyboard.press("{");
  const px = x + 4;
  const py = y + 4;
  await look(page, px, py, h + 2, 14);
  // a pillar one block high, then its east wall dragged up: the cells above the ground touch nothing but the span's own blocks
  await click(page, px, py, h - 1, "+z");
  const before = await edits(page);
  const a = await face(page, px, py, h, "+x");
  const b = await face(page, px, py, h + 3, "+x");
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => (await block(page)).preview?.added.length ?? 0).toBe(1);
  await page.mouse.down();
  for (let t = 1; t <= 8; t++) {
    await page.mouse.move(a.x + ((b.x - a.x) * t) / 8, a.y + ((b.y - a.y) * t) / 8);
    await page.waitForTimeout(30);
  }
  await expect.poll(async () => (await block(page)).preview?.added.length ?? 0, { message: "the span over the air is in the preview" }).toBeGreaterThanOrEqual(4);
  const shown = (await block(page)).preview!.added;
  expect(shown.every((c) => c[0] === px + 1 && c[1] === py)).toBe(true);
  await page.mouse.up();
  await expect.poll(() => edits(page)).toBe(before + 1);
  await idle(page);
  // what was drawn is what stands: the column beside the pillar rose to its top
  expect(await height(page, px + 1, py)).toBe(Math.max(...shown.map((c) => c[2])) + 1);
});

test("a block over a plant says so beside the blocks: the plant is removed, in words that are not a refusal", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  await page.keyboard.press("7");
  await toolInHand(page);
  for (let k = 0; k < 8; k++) await page.keyboard.press("{");
  // a tile where a block on the ground would stand in a plant's cell
  const spot = await page.evaluate(async () => {
    const m = window.dgm3d!.renderer.mapState()!;
    for (let k = 0; k < m.entities.count; k++) {
      const x = m.entities.x[k];
      const y = m.entities.y[k];
      const h = m.heights[y * m.W + x];
      if (h < 2 || m.surface.depth[y * m.W + x] > 0.01) continue;
      const f = await window.dgmEditor!.worker.blockFalls({ mode: "add", side: "+z", at: [[x, y, h - 1]], size: 1 });
      if (!f.reason && f.plantsRemoved > 0) return { x, y, h };
    }
    return null;
  });
  expect(spot, "a plant on dry ground").not.toBeNull();
  await look(page, spot!.x, spot!.y, spot!.h, 14);
  const p = await face(page, spot!.x, spot!.y, spot!.h - 1, "+z");
  await page.mouse.move(p.x, p.y);
  const note = page.locator(".shape-note.warn");
  await expect(note).toContainText(/plants? removed/);
  await expect(page.locator(".shape-note.error")).toHaveCount(0);
  expect((await block(page)).preview!.reason).toBeNull();
});

test("ground that would fall is shown before the press is let go, and the click is refused with the page's note", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  const { x, y, h } = await flatSpot(page);
  await page.keyboard.press("7");
  await toolInHand(page);
  for (let k = 0; k < 8; k++) await page.keyboard.press("{");
  const px = x + 2;
  const py = y + 4;
  await look(page, x + 5, py, h);
  // a pillar of four, then a shelf out from its top, a block at a time: each is held by the one before, three sideways
  for (let k = 0; k < 4; k++) await click(page, px, py, h - 1 + k, "+z");
  expect(await height(page, px, py)).toBe(h + 4);
  const top = h + 3;
  for (let k = 0; k < 3; k++) await click(page, px + k, py, top, "+x");
  // the fourth would hang more than 3 sideways from the pillar: the press shows what would fall and why
  const before = await edits(page);
  const a = await face(page, px + 3, py, top, "+x");
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => (await block(page)).preview?.falls.length ?? 0, { message: "the blocks that would fall" }).toBeGreaterThan(0);
  const shown = (await block(page)).preview!;
  expect(shown.reason).toMatch(/blocks? of ground would fall: nothing would hold (them|it) up/);
  // (the reason in red beside the blocks, never over them)
  const note = page.locator(".shape-note.error");
  await expect(note).toContainText("would fall");
  // (the renderer draws the kinds of block)
  const drawn = await page.evaluate(() => window.dgm3d!.renderer.blocksDrawn);
  expect(drawn.falls, "blocks drawn as falling").toBeGreaterThan(0);
  // the note clears the preview's cells on the screen
  const covers = await page.evaluate(
    ([cells]) => {
      const r = window.dgm3d!.renderer;
      const c = r.canvas.getBoundingClientRect();
      const n = document.querySelector(".shape-note.error")!.getBoundingClientRect();
      return (cells as [number, number, number][]).some(([x, y, z]) => {
        const p = r.project(x + 0.5, z + 0.5, -(y + 0.5));
        const sx = p.x + c.left;
        const sy = p.y + c.top;
        return sx > n.left && sx < n.right && sy > n.top && sy < n.bottom;
      });
    },
    [[...shown.added, ...shown.falls]] as const,
  );
  expect(covers, "the note sits over a block it describes").toBe(false);
  await page.mouse.down();
  await page.mouse.up();
  // refused with the page's usual note, nothing changed, the preview gone
  await expect(page.locator(".editor-message.error")).toContainText("would fall: nothing would hold");
  expect(await edits(page)).toBe(before);
  // (the pointer still on that face, the preview asks again; off the map it goes)
  await page.mouse.move(5, 300);
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.blocksDrawn.falls)).toBe(0);
});

test("on an imported cave map a Shift-click removes blocks from a cave wall: the blocks go, the surface stays, undo gives them back", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  await page.getByLabel("Open a map or a project").setInputFiles({ name: "cave.timber", mimeType: "application/zip", buffer: Buffer.from(writeTimber(caveFile())) });
  await expect.poll(() => page.evaluate(() => window.dgmEditor?.info().name)).toBe("cave");
  await page.waitForFunction(() => window.dgm3d!.renderer.size?.W === 40);
  await page.keyboard.press("7");
  await toolInHand(page);
  // the roof cut away, the cave open to the sky: the west wall of the cave at x = 14, layer 4
  await page.evaluate(() => window.dgm3d!.renderer.setSlice(6));
  await look(page, 17, 17, 4, 16);
  const tile = (x: number, y: number) => y * 40 + x;
  const solidBefore = await page.evaluate((i) => window.dgm3d!.renderer.hasTop(i, 3), tile(14, 17));
  expect(solidBefore, "the wall is solid at the cave's floor level").toBe(false);
  const params = { mode: "remove" as const, side: "+x" as const, at: [[14, 17, 4]] as [number, number, number][], size: 3 };
  const planned = await page.evaluate((p) => window.dgmEditor!.worker.blockFalls(p), params);
  expect(planned.removed.length).toBe(9);
  await page.keyboard.press("}");
  await page.keyboard.press("{");
  const before = await edits(page);
  await click(page, 14, 17, 4, "+x", true);
  expect(await edits(page)).toBe(before + 1);
  // the same click now has nothing left to take
  const again = await page.evaluate((p) => window.dgmEditor!.worker.blockFalls(p), params);
  expect(again.reason).toMatch(/has no block in layer 4 to point at/);
  // a hollow under the surface: the surface is where it was, the columns are the renderer's to draw
  expect(await height(page, 14, 17)).toBe(8);
  expect(await page.evaluate((i) => window.dgm3d!.renderer.hasTop(i, 3), tile(14, 17)), "the wall's column has a floor at layer 3 now").toBe(true);
  await page.keyboard.press("z");
  await expect.poll(() => edits(page)).toBe(before);
  expect(await page.evaluate((i) => window.dgm3d!.renderer.hasTop(i, 3), tile(14, 17))).toBe(false);
});

test("inside a selected area a quick click outside it changes nothing, its note is not wiped by a size flash, and a click inside works", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  const { x, y, h } = await flatSpot(page);
  const px = x + 2;
  const py = y + 3;
  // a 3 × 3 working area (Select's rectangle), then the Block tool at Size 3
  const corner = (tx: number, ty: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [tx, ty] as const);
  const a = await corner(px, py);
  const b = await corner(px + 2, py + 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.selection().length)).toBe(9);
  await page.keyboard.press("7");
  await toolInHand(page);
  for (let k = 0; k < 8; k++) await page.keyboard.press("{");
  await page.keyboard.press("}");
  await page.keyboard.press("}");
  expect((await block(page)).settings.size).toBe(3);
  await look(page, px + 1, py + 1, h);

  // a click outside, pressed the moment the pointer arrives: refused by the core's own reason, nothing raised
  const before = await edits(page);
  const out = await face(page, px + 6, py + 1, h - 1, "+z");
  await page.mouse.move(out.x, out.y);
  await page.mouse.down();
  await page.mouse.up();
  await idle(page);
  expect(await edits(page)).toBe(before);
  for (let i = 4; i <= 8; i++) expect(await height(page, px + i, py + 1), `x ${px + i}`).toBe(h);
  const note = page.locator(".shape-note.error");
  await expect(note).toContainText("outside the selection");
  const refused = (await block(page)).preview!;
  expect(refused.reason, "the core's own reason").toMatch(/^\(\d+, \d+\) is outside the selection$/);
  expect(refused.added.length + refused.removed.length, "nothing drawn for a refused click").toBe(0);

  // a size flash beside the pointer neither clears the note nor is cleared by it, and the note stays after the flash ends
  await page.keyboard.press("}");
  await expect(page.locator(".shape-note:not(.error)")).toContainText("size 4");
  await expect(note).toContainText("outside the selection");
  await page.keyboard.press("{");
  await page.waitForTimeout(1600);
  await expect(page.locator(".shape-note:not(.error)")).toHaveCount(0);
  await expect(note).toContainText("outside the selection");

  // inside the area the same tool works
  await click(page, px + 1, py + 1, h - 1, "+z");
  expect(await height(page, px + 1, py + 1)).toBe(h + 1);
});

test("under a layer cut a click takes what is below the cut and leaves the hidden blocks alone", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  await page.getByLabel("Open a map or a project").setInputFiles({ name: "cave.timber", mimeType: "application/zip", buffer: Buffer.from(writeTimber(caveFile())) });
  await expect.poll(() => page.evaluate(() => window.dgmEditor?.info().name)).toBe("cave");
  await page.waitForFunction(() => window.dgm3d!.renderer.size?.W === 40);
  await page.keyboard.press("7");
  await toolInHand(page);
  await page.evaluate(() => window.dgm3d!.renderer.setSlice(6));
  await look(page, 17, 17, 4, 16);
  // Size 3 on the wall at layer 5 reaches layer 6, which the cut hides: the preview holds the cells below it only
  const wall = await face(page, 14, 17, 5, "+x");
  await page.mouse.move(wall.x, wall.y);
  await page.keyboard.down("Shift");
  await expect.poll(async () => (await block(page)).preview?.removed.length ?? 0).toBeGreaterThan(0);
  const preview = (await block(page)).preview!;
  expect(preview.removed.every((c) => c[2] < 6), "nothing from the cut up is planned").toBe(true);
  await expect(page.locator(".shape-note.error")).toHaveCount(0);
  const before = await edits(page);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => edits(page)).toBe(before + 1);
  // (the block the cut hides is still there: one of its faces is open to a remove)
  const stands = await page.evaluate(async () => {
    for (const side of ["+x", "-x", "+y", "-y", "+z", "-z"] as const) {
      const f = await window.dgmEditor!.worker.blockFalls({ mode: "remove", side, at: [[14, 17, 6]], size: 1 });
      if (f.removed.length) return true;
    }
    return false;
  });
  expect(stands).toBe(true);
});
