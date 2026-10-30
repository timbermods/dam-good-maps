// Seeing the land behind objects, the page's side (render3d/objectFade.ts is the renderer's, objectFade.spec.ts its
// test; an editing aid in its own channel, D496/D497's rule). With a brush in hand and the pointer on the land, hovering
// or painting, the objects round the pointer's tile fade as far as the brush reaches: the renderer's region follows the
// pointer tile by tile, is told only when the tile or the reach changes (D453), and clears when the pointer leaves the
// land, when another tool is picked and when Esc puts the brush down. Holding H hides every object and letting go brings
// them back; the window losing focus lets go of it; the Show row's "Hide objects" keeps them hidden until clicked again.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, topDown } from "./open";
import { toolInHand, toolPutAway } from "./helpers";

const fade = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.objectFade);
const hidden = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.objectsHidden);
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);
/** How many times the page has told the renderer where to fade, since the count began. */
const fadeCalls = (page: Page) => page.evaluate(() => (window as unknown as { fadeCalls: number }).fadeCalls);

/** A grown tree in the middle of the view with a tree-free tile 6 east of it, both on the canvas. */
async function treeInView(page: Page): Promise<{ tree: [number, number]; away: [number, number] }> {
  const found = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const e = m.entities;
    const shows = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      const dock = document.querySelector(".tool-dock")!.getBoundingClientRect().top - 80;
      return p.y > 120 && p.y < dock && document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    const busy = new Set<number>();
    for (let k = 0; k < e.count; k++) busy.add(e.y[k] * m.W + e.x[k]);
    let best: [number, number] | null = null;
    let near = Infinity;
    for (let k = 0; k < e.count; k++) {
      if (!/^(Pine|Birch|Oak)$/.test(e.templates[e.template[k]])) continue;
      const x = e.x[k];
      const y = e.y[k];
      if (x < 8 || y < 8 || x > m.W - 16 || y > m.H - 8 || busy.has(y * m.W + x + 6) || !shows(x, y) || !shows(x + 6, y)) continue;
      const d = Math.hypot(x - m.W / 2, y - m.H / 2);
      if (d < near) {
        near = d;
        best = [x, y];
      }
    }
    return best;
  });
  expect(found, "a tree in view with free ground beside it").not.toBeNull();
  return { tree: found!, away: [found![0] + 6, found![1]] };
}

test("a brush fades the objects round the pointer, following it tile by tile, and the fade goes with the brush", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=34&z=96&d=n&t=riverValley");
  await topDown(page);
  const { tree, away } = await treeInView(page);
  // (counting what the page tells the renderer)
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const w = window as unknown as { fadeCalls: number };
    w.fadeCalls = 0;
    const set = r.setObjectFade.bind(r);
    r.setObjectFade = (region) => {
      w.fadeCalls++;
      set(region);
    };
  });

  // Select in hand: no fade over the tree
  const onTree = await client(page, tree[0], tree[1]);
  await page.mouse.move(onTree.x - 3, onTree.y - 3);
  await page.mouse.move(onTree.x, onTree.y);
  await page.waitForTimeout(300);
  expect(await fade(page), "Select fades nothing").toBeNull();

  // Raise over the tree: the region is the pointer's tile, as far as the brush reaches
  await page.keyboard.press("2");
  await toolInHand(page);
  await page.mouse.move(onTree.x + 1, onTree.y);
  await expect.poll(() => fade(page)).toEqual({ x: tree[0] + 0.5, y: tree[1] + 0.5, radius: 5 });
  // (moving within the tile tells the renderer nothing new)
  const calls = await fadeCalls(page);
  for (const d of [-2, 2, -1, 1]) await page.mouse.move(onTree.x + d, onTree.y + d);
  await page.waitForTimeout(200);
  const within = await fade(page);
  if (within!.x === tree[0] + 0.5 && within!.y === tree[1] + 0.5) expect(await fadeCalls(page), "the renderer is told only when the tile changes").toBe(calls);

  // it follows the pointer, and the brush's size
  const off = await client(page, away[0], away[1]);
  await page.mouse.move(off.x, off.y);
  await expect.poll(() => fade(page)).toEqual({ x: away[0] + 0.5, y: away[1] + 0.5, radius: 5 });
  await page.keyboard.press("}");
  await expect.poll(() => fade(page).then((f) => f?.radius)).toBeGreaterThan(5);
  await page.keyboard.press("{");
  await expect.poll(() => fade(page).then((f) => f?.radius)).toBe(5);

  // while painting too: a stroke from the free tile over the tree
  await page.mouse.down();
  await page.mouse.move((off.x + onTree.x) / 2, onTree.y, { steps: 4 });
  await page.mouse.move(onTree.x, onTree.y, { steps: 4 });
  await expect.poll(() => fade(page).then((f) => f && [Math.floor(f.x), Math.floor(f.y)])).toEqual(tree);
  await page.mouse.up();
  await page.keyboard.press("z");

  // another brush keeps it; Select clears it
  await page.keyboard.press("4");
  await page.mouse.move(onTree.x + 1, onTree.y + 1);
  await expect.poll(() => fade(page)).not.toBeNull();
  await page.keyboard.press("1");
  await toolPutAway(page);
  await expect.poll(() => fade(page), { message: "another tool clears the fade" }).toBeNull();

  // the pointer off the land clears it
  await page.keyboard.press("2");
  await toolInHand(page);
  await page.mouse.move(onTree.x, onTree.y + 1);
  await expect.poll(() => fade(page)).not.toBeNull();
  const header = await page.locator("header").first().boundingBox();
  await page.mouse.move(header!.x + header!.width / 2, header!.y + header!.height / 2);
  await expect.poll(() => fade(page), { message: "the pointer off the land clears the fade" }).toBeNull();

  // Esc puts the brush down, and the fade with it
  await page.mouse.move(onTree.x, onTree.y);
  await expect.poll(() => fade(page)).not.toBeNull();
  await page.keyboard.press("Escape");
  await toolPutAway(page);
  await expect.poll(() => fade(page), { message: "Esc clears the fade" }).toBeNull();
  expect(errors).toEqual([]);
});

test("holding H hides every object until it is let go; the Show row's Hide objects keeps them hidden", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=34&z=96&d=n&t=riverValley");
  const toggle = page.getByRole("checkbox", { name: "Hide objects" });
  await expect(toggle).toHaveAttribute("title", "See the land behind objects");
  await expect(toggle).toHaveAttribute("data-keys", "H");
  expect(await hidden(page)).toBe(false);

  // held: hidden, and the toggle says so; let go: back
  await page.keyboard.down("h");
  await expect.poll(() => hidden(page)).toBe(true);
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.keyboard.up("h");
  await expect.poll(() => hidden(page)).toBe(false);
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // the window losing focus while it is held lets go of it: it never sticks
  await page.keyboard.down("h");
  await expect.poll(() => hidden(page)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => hidden(page)).toBe(false);
  await page.keyboard.up("h");

  // a click keeps them hidden; holding and letting go of H leaves them hidden; a second click brings them back
  await toggle.click();
  await expect.poll(() => hidden(page)).toBe(true);
  await page.mouse.move(700, 450);
  await page.keyboard.down("h");
  await page.keyboard.up("h");
  await page.waitForTimeout(200);
  expect(await hidden(page)).toBe(true);
  await toggle.click();
  await expect.poll(() => hidden(page)).toBe(false);

  // typing in a field keeps its H
  await page.getByRole("button", { name: "Map Generator", exact: true }).click();
  const name = page.locator("#map-name");
  await name.click();
  await page.keyboard.down("h");
  await page.waitForTimeout(200);
  expect(await hidden(page), "H typed in a field hides nothing").toBe(false);
  await page.keyboard.up("h");
});
