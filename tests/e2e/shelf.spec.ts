// The shelf and Delete (PLAN §20 D184, D288), through the page. The shelf: a picked object's
// ghost follows the pointer, its footprint green where the game keeps it and red where the game
// would delete it, the reason beside the pointer; a click there is refused, and placed where it
// fits; R turns it; Esc puts it back; trees and bushes paint many with a drag; the start moves where
// it is clicked. Delete: pointed at an object it takes it; with a selection open it takes
// everything standing inside it, objects and sources, as one step; the ground never changes, and
// the start stays. There is no Remove tool. (ROADMAP M7's object checks, through the shelf.)

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);

async function openTopDown(page: Page, hash: string) {
  await openEditor(page, hash);
  await page.getByRole("button", { name: "Top-down" }).click();
}

async function client(page: Page, x: number, y: number) {
  return page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
}

async function clickTile(page: Page, x: number, y: number) {
  const p = await client(page, x, y);
  await page.mouse.click(p.x, p.y);
  await idle(page);
}

/** Hover a tile with an object from the shelf and wait for its footprint check. */
async function fitAt(page: Page, x: number, y: number, W: number): Promise<{ tiles: number[]; problem: string | null }> {
  const p = await client(page, x, y);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  const i = y * W + x;
  await page.waitForFunction((k) => !!window.dgmEditor!.fit()?.tiles.includes(k), i, { timeout: 10_000 });
  return (await page.evaluate(() => window.dgmEditor!.fit()))!;
}

/** Level, dry tiles with nothing standing round them, away from the start and the water, nearest
 *  the middle first. */
async function openGround(page: Page, r: number): Promise<[number, number][]> {
  const i = await info(page);
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  return page.evaluate(
    ([s0, s1, rr]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const W = m.W;
      const e = m.entities;
      const out: [number, number, number][] = [];
      for (let y = rr + 2; y < m.H - rr - 2; y += 2)
        for (let x = rr + 2; x < W - rr - 2; x += 2) {
          if (Math.hypot(x - s0, y - s1) < 16) continue;
          const h0 = m.heights[y * W + x];
          let ok = true;
          for (let dy = -rr; dy <= rr && ok; dy++) for (let dx = -rr; dx <= rr && ok; dx++) if (m.heights[(y + dy) * W + x + dx] !== h0 || m.surface.depth[(y + dy) * W + x + dx] > 0) ok = false;
          for (let k = 0; k < e.count && ok; k++) if (Math.abs(e.x[k] - x) <= rr + 1 && Math.abs(e.y[k] - y) <= rr + 1) ok = false;
          if (ok) out.push([x, y, Math.abs(x - W / 2) + Math.abs(y - m.H / 2)]);
        }
      out.sort((a, b) => a[2] - b[2]);
      return out.map(([x, y]) => [x, y] as [number, number]);
    },
    [start[0], start[1], r] as const,
  );
}

const trees = (page: Page, near: [number, number], r: number) =>
  page.evaluate(
    ([x, y, rr]) => {
      const e = window.dgm3d!.renderer.mapState()!.entities;
      let n = 0;
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "Pine" && Math.abs(e.x[k] - x) <= rr && Math.abs(e.y[k] - y) <= rr) n++;
      return n;
    },
    [near[0], near[1], r] as const,
  );

test("the shelf: a ghost red where the game would delete it and refused there, placed where it fits; R turns it; trees paint with a drag; the start moves", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // (seed 1 since M9a, D148: 0.7.0's 4242 has no level, dry, empty ground 7 and 9 wide away from its start)
  await openTopDown(page, "s=1&z=96&d=n&t=riverValley");
  const W = (await info(page)).W;
  const shelf = page.getByRole("navigation", { name: "Place" });
  const start = ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;

  // every object has its picture, drawn by the view
  await expect(shelf.getByRole("button", { name: "Relic", exact: true }).locator("img")).toHaveCount(1, { timeout: 15_000 });

  // a medium relic: on the start, red with the reason, and a click there places nothing
  await shelf.getByRole("button", { name: "Relic", exact: true }).click();
  await page.getByRole("group", { name: "Relic options" }).getByRole("combobox", { name: "Size" }).selectOption("medium");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const red = await fitAt(page, start[0], start[1], W);
  expect(red.problem).toMatch(/district center/);
  expect(red.tiles.length).toBe(6);
  // (the reason, in a quiet word beside the pointer)
  await expect(page.locator(".shape-note")).toHaveText("the start stands there");
  await clickTile(page, start[0], start[1]);
  expect(await labels(page)).toEqual([]);
  // (the refusal adds no second label: the reason stays, once, D323 item 32)
  await expect(page.locator(".shape-note")).toHaveText("the start stands there");

  // on level, dry ground: green, and a click places it at once, one step
  const spots = await openGround(page, 3);
  const [x, y] = spots[0];
  const green = await fitAt(page, x, y, W);
  expect(green.problem).toBeNull();
  // R turns it: a turned relic stands across the other way
  await page.keyboard.press("r");
  const turned = await fitAt(page, x, y, W);
  expect(turned.problem).toBeNull();
  await clickTile(page, x, y);
  expect(await labels(page)).toEqual(["Place medium relic"]);
  const placed = await page.evaluate(async ([a, b]) => (await window.dgmEditor!.worker.entitiesAt(a, b)).find((e) => e.template === "MediumRelic") ?? null, [x, y] as [number, number]);
  expect(placed).not.toBeNull();
  expect(placed!.orientation).toBe("Cw90");
  expect(await page.evaluate(() => window.dgmEditor!.instant())).toEqual([]);
  // Esc puts it back
  await page.keyboard.press("Escape");
  await expect(shelf.getByRole("button", { name: "Relic", exact: true })).toHaveAttribute("aria-pressed", "false");

  // pines: a drag paints a grove, one step
  const [gx, gy] = spots.find(([a, b]) => Math.hypot(a - x, b - y) > 12)!;
  await shelf.getByRole("button", { name: "Pine", exact: true }).click();
  const a = await client(page, gx - 3, gy);
  const b = await client(page, gx + 3, gy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await idle(page);
  const planted = await trees(page, [gx, gy], 5);
  expect(planted).toBeGreaterThanOrEqual(8);
  expect((await labels(page)).at(-1)).toMatch(/^Plant \d+ pines$/);
  // a click plants one
  const [ox, oy] = spots.find(([p, q]) => Math.hypot(p - x, q - y) > 12 && Math.hypot(p - gx, q - gy) > 12)!;
  await clickTile(page, ox, oy);
  expect((await labels(page)).at(-1)).toBe("Place pine");
  await page.keyboard.press("Escape");

  // the start: picked on the shelf, it moves where it is clicked, and goes back on the shelf
  await shelf.getByRole("button", { name: "Start", exact: true }).click();
  // (open ground nearest the start, clear of what was placed)
  const near = spots.filter(([p, q]) => Math.hypot(p - x, q - y) > 8 && Math.hypot(p - gx, q - gy) > 10 && Math.hypot(p - ox, q - oy) > 6).sort((p, q) => Math.hypot(p[0] - start[0], p[1] - start[1]) - Math.hypot(q[0] - start[0], q[1] - start[1]));
  expect(near.length).toBeGreaterThan(0);
  const [sx, sy] = near[0];
  const fit = await fitAt(page, sx, sy, W);
  expect(fit.problem).toBeNull();
  await clickTile(page, sx, sy);
  await expect.poll(async () => ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position).toEqual([sx, sy]);
  await expect(shelf.getByRole("button", { name: "Start", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("Delete (D288, D323 items 1 and 44): pointed at an object it takes it, the start too; on bare ground it takes the top level; Select and Delete take everything inside, one step; no Remove tool", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // (seed 1 since M9a, D148: 0.7.0's 4242 has no level, dry, empty ground 7 and 9 wide away from its start)
  await openTopDown(page, "s=1&z=96&d=n&t=riverValley");
  const start = ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const [gx, gy] = (await openGround(page, 4))[0];
  const bar = page.getByRole("toolbar", { name: "Tools" });
  // no Remove tool
  await expect(bar.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  // a grove, and a water source beside it
  const shelf = page.getByRole("navigation", { name: "Place" });
  await shelf.getByRole("button", { name: "Pine", exact: true }).click();
  const a = await client(page, gx - 3, gy);
  const b = await client(page, gx + 3, gy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await idle(page);
  await shelf.getByRole("button", { name: /^Water source/ }).click();
  const sp = await client(page, gx + 4, gy + 4);
  await page.mouse.move(sp.x + 3, sp.y);
  await page.mouse.click(sp.x, sp.y);
  await idle(page);
  await page.keyboard.press("Escape");
  const sourceThere = () =>
    page.evaluate(
      ([x, y]) => {
        const e = window.dgm3d!.renderer.mapState()!.entities;
        for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource" && e.x[k] === x && e.y[k] === y) return true;
        return false;
      },
      [gx + 4, gy + 4] as const,
    );
  await expect.poll(sourceThere).toBe(true);
  const n0 = await trees(page, [gx, gy], 5);
  expect(n0).toBeGreaterThan(3);
  const heights = () => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
  const h0 = await heights();

  // pointed at a pine, Delete takes it, one step
  const one = await page.evaluate(
    ([x, y]) => {
      const e = window.dgm3d!.renderer.mapState()!.entities;
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "Pine" && Math.abs(e.x[k] - x) <= 3 && Math.abs(e.y[k] - y) <= 1) return [e.x[k], e.y[k]] as [number, number];
      return null;
    },
    [gx - 1, gy] as const,
  );
  const op = await client(page, one![0], one![1]);
  await page.mouse.move(op.x + 3, op.y);
  await page.mouse.move(op.x, op.y);
  const steps = (await labels(page)).length;
  await page.keyboard.press("Delete");
  await idle(page);
  await expect.poll(async () => (await labels(page)).at(-1)).toBe("Remove a tree");
  expect((await labels(page)).length).toBe(steps + 1);
  expect(await trees(page, [gx, gy], 5)).toBe(n0 - 1);

  // Select, a rectangle round the grove and the source, then Delete: all of it, one step
  await bar.getByRole("button", { name: "Select (1)" }).click();
  const c = await client(page, gx - 5, gy - 5);
  const d = await client(page, gx + 5, gy + 5);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(d.x, d.y, { steps: 6 });
  await page.mouse.up();
  const row = page.getByRole("group", { name: "Selection" });
  await expect(row.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Clear objects" })).toHaveCount(0);
  const before = (await labels(page)).length;
  await page.keyboard.press("Delete");
  await idle(page);
  await expect.poll(async () => (await labels(page)).length).toBe(before + 1);
  expect((await labels(page)).at(-1)).toMatch(/^Remove \d+ objects$/);
  expect(await trees(page, [gx, gy], 5)).toBe(0);
  await expect.poll(sourceThere).toBe(false);
  // one undo brings them all back
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(sourceThere).toBe(true);
  expect(await trees(page, [gx, gy], 5)).toBe(n0 - 1);
  // the row's Delete opens a menu of what stands there, with counts; Everything does the same
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Delete" });
  await expect(menu.getByRole("menuitem", { name: /^Trees \(\d+\)$/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^Water sources \(1\)$/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Ground (one level)" })).toBeVisible();
  await menu.getByRole("menuitem", { name: /^Everything \(\d+\)$/ }).click();
  await idle(page);
  await expect.poll(sourceThere).toBe(false);
  // objects go, the ground stays
  expect(await heights()).toEqual(h0);
  // with nothing left standing there, Delete takes the ground's top level: one step, one undo
  await page.keyboard.press("Escape");
  const ground = await client(page, gx, gy);
  await page.mouse.move(ground.x + 3, ground.y);
  await page.mouse.move(ground.x, ground.y);
  const beforeGround = (await labels(page)).length;
  const W = (await info(page)).W;
  await page.keyboard.press("Delete");
  await idle(page);
  await expect.poll(async () => (await labels(page)).length).toBe(beforeGround + 1);
  expect((await labels(page)).at(-1)).toBe("Delete a level of ground");
  // exactly one tile, next to where the pointer was, one level lower
  await expect
    .poll(async () => {
      const h = await heights();
      const changed: number[] = [];
      for (let i = 0; i < h.length; i++) if (h[i] !== h0[i]) changed.push(i);
      return changed.length === 1 && h[changed[0]] === h0[changed[0]] - 1 && Math.abs((changed[0] % W) - gx) <= 1 && Math.abs(Math.floor(changed[0] / W) - gy) <= 1;
    })
    .toBe(true);
  await page.keyboard.press("Control+z");
  await idle(page);
  expect(await heights()).toEqual(h0);

  // the start is the player's like any object (item 44): pointed at, Delete takes it, one step
  const at = await client(page, start[0], start[1]);
  await page.mouse.move(at.x + 3, at.y);
  await page.mouse.move(at.x, at.y);
  const kept = (await labels(page)).length;
  await page.keyboard.press("Delete");
  await idle(page);
  await expect.poll(async () => (await labels(page)).length).toBe(kept + 1);
  expect((await labels(page)).at(-1)).toBe("Remove the start");
  expect((await info(page)).features.some((f) => f.kind === "start")).toBe(false);
  // the checks say so, and the save asks for one
  await page.getByRole("button", { name: /^Checks:/ }).click();
  await expect(page.getByRole("region", { name: "Checks" })).toContainText("No start");
  await page.getByRole("button", { name: /^Checks:/ }).click();
  await page.keyboard.press("Control+z");
  await idle(page);
  expect((await info(page)).features.some((f) => f.kind === "start")).toBe(true);
  // (the whole map: Select is in hand, then Ctrl+A, Delete: everything, the start with it)
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await idle(page);
  await expect.poll(async () => (await labels(page)).length).toBe(kept + 1);
  const left = await page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    const out: string[] = [];
    for (let k = 0; k < e.count; k++) out.push(e.templates[e.template[k]]);
    return out;
  });
  expect(left).toEqual([]);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------------------ D323: items 11, 12 and 32

test("a drag never opens a file; a file dropped from outside the page does, without asking (item 11)", async ({ page }) => {
  await openTopDown(page, "s=1&z=96&d=n&t=riverValley");
  // one edit, so that a wrongly opened file would replace an edited map
  const [x, y] = (await openGround(page, 1))[0];
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Pine", exact: true }).click();
  await clickTile(page, x, y);
  await page.keyboard.press("Escape");
  const dialog = page.getByRole("alertdialog");
  // a drag that began on the page (an icon, a link) carries a file of its own in Chrome
  await page.evaluate(() => {
    // (any picture on the page that is draggable: the browser starts a drag of it)
    const icon = document.createElement("img");
    icon.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    document.body.append(icon);
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "icon.png", { type: "image/png" }));
    icon.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    window.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    window.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    window.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
    icon.remove();
  });
  await expect(dialog).toHaveCount(0);
  // (nothing was opened: no error, and the map is the edited one)
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect((await info(page)).edits).toBe(1);
  // a file from outside: it is opened at once, nothing asked (this one is no map, so the page says it could not be opened)
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "Other.timber", { type: "application/octet-stream" }));
    window.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    window.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(page.getByRole("alert")).toContainText("Other.timber could not be opened");
  await expect(dialog).toHaveCount(0);
});

test("one label beside the pointer for what is picked, none when nothing is; Esc or a right-click puts it away (item 32)", async ({ page }) => {
  await openTopDown(page, "s=1&z=96&d=n&t=riverValley");
  const W = (await info(page)).W;
  const shelf = page.getByRole("navigation", { name: "Place" });
  const start = ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const note = page.locator(".shape-note");
  const [x, y] = (await openGround(page, 3))[0];
  const startButton = shelf.getByRole("button", { name: "Start", exact: true });

  // nothing picked: hovering the map shows no placement hint
  const at = await client(page, x, y);
  await page.mouse.move(at.x + 4, at.y);
  await page.mouse.move(at.x, at.y);
  await expect(note).toHaveCount(0);
  await expect(page.locator(".start-hint")).toHaveCount(0);
  expect(await page.evaluate(() => window.dgmEditor!.fit())).toBeNull();

  // the start, where it fits: one label
  await startButton.click();
  expect((await fitAt(page, x, y, W)).problem).toBeNull();
  await expect(note).toHaveCount(1);
  await expect(note).toHaveText("Move the start here");
  // an object where it can't stand: one plain reason, and a click there adds no second label
  await shelf.getByRole("button", { name: "Relic", exact: true }).click();
  await fitAt(page, start[0], start[1], W);
  await expect(note).toHaveText("the start stands there");
  await clickTile(page, start[0], start[1]);
  await expect(note).toHaveCount(1);
  await expect(note).toHaveText("the start stands there");
  // where it fits: "Place here"
  await fitAt(page, x, y, W);
  await expect(note).toHaveText("Place here");

  // Esc puts it away: no label, no ghost, and the map's hover shows nothing
  await page.keyboard.press("Escape");
  await expect(shelf.getByRole("button", { name: "Relic", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(note).toHaveCount(0);
  await page.mouse.move(at.x + 5, at.y + 2);
  await page.mouse.move(at.x, at.y);
  await idle(page);
  await expect(note).toHaveCount(0);
  expect(await page.evaluate(() => window.dgmEditor!.fit())).toBeNull();

  // a right-drag (the camera) keeps it; a right-click puts it away
  await startButton.click();
  await page.mouse.move(at.x + 5, at.y + 2);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(at.x + 30, at.y + 10, { steps: 4 });
  await page.mouse.up({ button: "right" });
  await expect(startButton).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(startButton).toHaveAttribute("aria-pressed", "false");
  await expect(note).toHaveCount(0);
});

test("drag from the shelf: the ghost follows the pointer, the drop places it, a drag that doesn't place ends placement (item 11)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openTopDown(page, "s=1&z=96&d=n&t=riverValley");
  const W = (await info(page)).W;
  const shelf = page.getByRole("navigation", { name: "Place" });
  const start = ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const spots = await openGround(page, 3);
  const press = async (name: string) => {
    const b = (await shelf.getByRole("button", { name, exact: true }).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
  };
  const pressed = (name: string) => shelf.getByRole("button", { name, exact: true });

  // a relic dragged out: the ghost follows the pointer over the map, and the drop places it, one step
  const [x, y] = spots[0];
  await press("Relic");
  const to = await client(page, x, y);
  await page.mouse.move(to.x + 60, to.y + 30, { steps: 8 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.waitForFunction((k) => !!window.dgmEditor!.fit()?.tiles.includes(k), y * W + x, { timeout: 10_000 });
  expect((await page.evaluate(() => window.dgmEditor!.fit()))!.problem).toBeNull();
  await page.mouse.up();
  await idle(page);
  expect(await labels(page)).toEqual(["Place small relic"]);
  // the object goes back on the shelf
  await expect(pressed("Relic")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".shape-note")).toHaveCount(0);

  // released on the header, nothing is placed, and placement is over
  await press("Relic");
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.move(400, 12, { steps: 6 });
  await page.mouse.up();
  await idle(page);
  expect(await labels(page)).toEqual(["Place small relic"]);
  await expect(pressed("Relic")).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(to.x + 8, to.y + 8);
  await page.mouse.move(to.x, to.y);
  await expect(page.locator(".shape-note")).toHaveCount(0);
  expect(await page.evaluate(() => window.dgmEditor!.fit())).toBeNull();

  // released where it can't stand: the reason for a moment, nothing placed, placement over
  await press("Relic");
  const on = await client(page, start[0], start[1]);
  await page.mouse.move(on.x + 40, on.y + 20, { steps: 6 });
  await page.mouse.move(on.x, on.y, { steps: 4 });
  await page.waitForFunction((k) => !!window.dgmEditor!.fit()?.tiles.includes(k), start[1] * W + start[0], { timeout: 10_000 });
  await page.mouse.up();
  await idle(page);
  expect(await labels(page)).toEqual(["Place small relic"]);
  await expect(pressed("Relic")).toHaveAttribute("aria-pressed", "false");

  // the start dragged out moves the map's one start, one step
  const [sx, sy] = spots.filter(([p, q]) => Math.hypot(p - x, q - y) > 8).sort((p, q) => Math.hypot(p[0] - start[0], p[1] - start[1]) - Math.hypot(q[0] - start[0], q[1] - start[1]))[0];
  await press("Start");
  const t = await client(page, sx, sy);
  await page.mouse.move(t.x + 50, t.y + 20, { steps: 8 });
  await page.mouse.move(t.x, t.y, { steps: 4 });
  await page.waitForFunction((k) => !!window.dgmEditor!.fit()?.tiles.includes(k), sy * W + sx, { timeout: 10_000 });
  await page.mouse.up();
  await idle(page);
  await expect.poll(async () => ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position).toEqual([sx, sy]);
  await expect(pressed("Start")).toHaveAttribute("aria-pressed", "false");
  // (a plain click still picks it, as before)
  await pressed("Start").click();
  await expect(pressed("Start")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("an edge wall on an edited map warns in the checks dot, never blocks Save, and Lower the wall is one undo step (item 12)", async ({ page }) => {
  await openTopDown(page, "s=1&z=96&d=n&t=riverValley");
  const W = (await info(page)).W;
  const cells: [number, number, number][] = [];
  for (let y = 0; y < W; y++) cells.push([y, 0, 1]);
  await page.evaluate((c) => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: c, level: 15 } }, "Raise a wall"), cells);
  await idle(page);
  const dot = page.getByRole("button", { name: /^Checks:/ });
  await expect(dot).toHaveAttribute("aria-label", /thing/, { timeout: 60_000 });
  await dot.click();
  const list = page.getByRole("region", { name: "Checks" });
  await expect(list).toContainText(/wall along the west edge/i);
  await expect(list.getByText("Fix these first")).toHaveCount(0);
  const n = (await labels(page)).length;
  await list.getByRole("button", { name: "Lower the wall" }).click();
  await idle(page);
  expect((await labels(page)).length).toBe(n + 1);
  expect((await labels(page)).at(-1)).toBe("Lower the wall");
  await expect(list).not.toContainText(/wall along/i, { timeout: 60_000 });
});
