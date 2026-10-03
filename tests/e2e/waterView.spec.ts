// Water is never an object, and the ways to see it (PLAN §20 D196, D197, D212): clicking water
// picks nothing; the hover readout gives its depth, bed and badwater; T or Clear water make all of
// it see-through, and a brush over water clears the water round it (on dry land it stays as it
// is); Alt+scroll and Alt+click cut the world into layers; Shift+scroll sets a soft brush's strength; a source is
// always findable (its marker with a source picked on the shelf, and the sources feeding the water
// under the pointer); a selected source's Delete makes its water recede; clean or bad belongs to
// the source; the water flows on a stroke while it is painted, and its speed is the player's.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
// An edit's answer is quick, but the worker then settles the water and checks the map, and a click on a
// source asks that same worker which sources stand there: it is answered when the work in hand is done. On
// a free machine that is a fraction of a second; with software-rendered frames and four runs at once, the
// answer took from 0.1 s to 9 s, and about one in three passed the 5 s the check waits (D341). So the
// selecting clicks wait for the water and the checks, which is what the answer waits on (the dot reads
// "Checking" from the edit's answer until the check of that map has come). The page also shows an edit's
// step a little after the worker answered it: once in 44 runs it took over 5 s, so the step is waited for
// as long as the stroke's water below.
const lastStep = (page: Page, label: string) => expect.poll(async () => (await info(page)).history.at(-1)!.label, { message: `the last step is "${label}"`, timeout: 45_000 }).toBe(label);
const settled = async (page: Page) => {
  await idle(page);
  await page.evaluate(() => window.dgmEditor!.worker.whenWaterSettles());
  await expect(page.getByRole("button", { name: /^Checks: (Ready to play|\d+ things? to look at)/ })).toBeVisible({ timeout: 90_000 });
};
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);
const clear = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.clearWater);
const clearNear = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.clearNear);
const depthAt = (page: Page, tiles: number[]) => page.evaluate((ts) => ts.map((t) => window.dgm3d!.renderer.mapState()!.surface.depth[t] || 0), tiles);

test("water is never an object; clear water, layers, strength, sources findable and removable, water on a stroke", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  // (seed 33 since D333, D148: seed 15's river now has a tributary above its 60%; seed 15 since M9a:
  // 0.7.0's 4242 main river stands in pools, dry at 60% of its path; there one group of sources feeds
  // the water, where three rivers join on most maps)
  // (seed 8 at 20% of its river on M9b's maps, D148: the water joins up, so past the
  // first third of seed 8 three source groups feed a spot; at 0.1 to 0.3 of its path, one does)
  await openEditor(page, "s=8&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  const i = await info(page);
  const W = i.W;
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const path = (i.features.find((f) => f.kind === "river")!.params as { path: [number, number][] }).path;
  const mid = path[Math.floor(path.length * 0.2)];
  const m: [number, number] = [Math.round(mid[0]), Math.round(mid[1])];
  const mp = await client(page, ...m);

  // water is never an object: a click on it picks nothing
  await page.mouse.click(mp.x, mp.y);
  await expect(page.getByRole("group", { name: /selected/ })).toHaveCount(0);
  // the readout: its depth and its bed
  await page.mouse.move(mp.x + 3, mp.y);
  await page.mouse.move(mp.x, mp.y);
  await expect(page.locator(".readout")).toHaveText(/^Water [\d.]+ deep, bed level \d+/);
  // the sources it comes from show their marker while the pointer is over it
  await expect(page.locator(".source-marker.feeding")).toHaveCount(1);
  await expect(page.locator(".source-marker.feeding")).toHaveText(/water\/s/);

  // clear water (D212): T and the view button clear all of it; a brush clears only the water under
  // and right round it, and only while it is over water; on dry land the water stays as it is
  expect(await clear(page)).toBe(false);
  await page.keyboard.press("t");
  await expect.poll(() => clear(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Clear water" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Clear water" }).click();
  await expect.poll(() => clear(page)).toBe(false);
  await page.getByRole("button", { name: "Lower brush (2)" }).click();
  await page.mouse.move(mp.x + 2, mp.y);
  await page.mouse.move(mp.x, mp.y);
  await expect.poll(() => clearNear(page)).not.toBeNull();
  const near = (await clearNear(page))!;
  expect(Math.hypot(near.x - (m[0] + 0.5), near.y - (m[1] + 0.5))).toBeLessThan(1.5);
  expect(await clear(page)).toBe(false);
  const dry = await client(page, start[0], start[1]);
  await page.mouse.move(dry.x, dry.y, { steps: 4 });
  await expect.poll(() => clearNear(page)).toBeNull();
  expect(await clear(page)).toBe(false);
  await page.keyboard.press("Escape");
  // the shelf's ghost over water clears the water under it too (placing on a bed)
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source (6)" }).click();
  await page.mouse.move(mp.x + 2, mp.y);
  await page.mouse.move(mp.x, mp.y);
  await expect.poll(() => clearNear(page)).not.toBeNull();
  await page.keyboard.press("Escape");
  await expect.poll(() => clearNear(page)).toBeNull();

  // the game's layers (D196, D207): Alt+scroll cuts the world down, the first step to the highest
  // layer that hides anything; Alt+middle-click (the game's) or Alt+click picks a tile's layer,
  // and on a tile at the layer showing, shows it all; the widget says which, and steps and resets
  const top = await page.evaluate(() => Math.max(...window.dgm3d!.renderer.mapState()!.heights));
  const widget = page.getByRole("group", { name: "Visible layers" });
  await expect(widget.getByRole("status", { name: "Visible layer" }).or(widget.locator("output"))).toHaveText("∞");
  await page.mouse.move(mp.x, mp.y);
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, 120);
  await page.keyboard.up("Alt");
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(top - 2);
  await expect(widget.locator("output")).toHaveText(String(top - 2));
  const level = await page.evaluate(([a, b]) => window.dgm3d!.renderer.heightAt(a, b), m);
  await page.keyboard.down("Alt");
  await page.mouse.click(mp.x, mp.y, { button: "middle" });
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(level);
  await page.mouse.click(mp.x, mp.y);
  await page.keyboard.up("Alt");
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(null);
  await expect(widget.locator("output")).toHaveText("∞");
  // the widget (Kyler, 2026-10-03: ▾ value ▴ only): the first step down from the whole world goes to the map's highest
  // ground less one, as the game steps, then one lower, one up, and a click on the value is back to the whole world;
  // Esc never resets it
  await widget.getByRole("button", { name: "Lower the visible layer" }).click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(top - 1);
  await widget.getByRole("button", { name: "Lower the visible layer" }).click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(top - 2);
  await widget.getByRole("button", { name: "Raise the visible layer" }).click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(top - 1);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(top - 1);
  await widget.locator("output").click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(null);

  // a source picked on the shelf: every source shows its marker with its strength
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source (6)" }).click();
  await expect.poll(async () => page.locator(".source-marker").count()).toBeGreaterThan(0);
  // a new source on dry, empty, level ground (level 3 × 3: a badwater source stands on it below;
  // M9a's land is rarely level where the first dry tile is, D148)
  const spot = await page.evaluate(
    ([s0, s1]) => {
      const mm = window.dgm3d!.renderer.mapState()!;
      const e = mm.entities;
      for (let y = 10; y < mm.H - 10; y++)
        for (let x = 10; x < mm.W - 10; x++) {
          if (mm.surface.depth[y * mm.W + x] > 0 || Math.hypot(x - s0, y - s1) < 20) continue;
          let level = true;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (mm.heights[(y + dy) * mm.W + x + dx] !== mm.heights[y * mm.W + x]) level = false;
          if (!level) continue;
          let empty = true;
          for (let k = 0; k < e.count && empty; k++) if (Math.abs(e.x[k] - x) <= 3 && Math.abs(e.y[k] - y) <= 3) empty = false;
          if (empty) return [x, y] as [number, number];
        }
      return null;
    },
    [start[0], start[1]] as const,
  );
  expect(spot).not.toBeNull();
  const sp = await client(page, ...spot!);
  await page.mouse.click(sp.x, sp.y);
  await idle(page);
  await lastStep(page, "Place water source");
  await page.keyboard.press("Escape");
  await settled(page);
  // clean or bad belongs to the source: selected, it becomes a badwater source in one step
  await page.mouse.click(sp.x, sp.y);
  const insp = page.getByRole("group", { name: /Water source, selected/ });
  await expect(insp).toBeVisible();
  await insp.getByRole("combobox", { name: "Water" }).selectOption("bad");
  await idle(page);
  await lastStep(page, "Make a source badwater");
  await settled(page);
  // selected, Delete removes it and its water recedes
  await page.mouse.click(sp.x, sp.y);
  await expect(page.getByRole("group", { name: /Badwater source, selected/ })).toBeVisible();
  await page.keyboard.press("Delete");
  await idle(page);
  await lastStep(page, "Remove a badwater source");

  // the water's speed: normal by default, instant straight to the result
  const speed = page.getByRole("combobox", { name: "Water speed" });
  await expect(speed).toHaveValue("normal");
  await speed.selectOption("instant");
  await expect(speed).toHaveValue("instant");
  await speed.selectOption("normal");

  // the water flows on a stroke while it is painted (D197): a Lower stroke out of the river, and
  // water in its channel before the button comes up
  const x = start[0] < W / 2 ? Math.round(W * 0.78) : Math.round(W * 0.22);
  const on = path.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best));
  const from: [number, number] = [Math.round(on[0]), Math.round(on[1])];
  const dir = from[1] < W / 2 ? 1 : -1;
  const channel = Array.from({ length: 6 }, (_, k) => (from[1] + dir * (4 + k)) * W + from[0]);
  const before = await depthAt(page, channel);
  await page.getByRole("button", { name: "Lower brush (2)" }).click();
  const a = await client(page, ...from);
  const b = await client(page, from[0], from[1] + dir * 10);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  // (the water reaches the channel in a fraction of a second on a free machine; with software-rendered
  // frames on a busy one the page draws slowly: of about 200 such runs most took under half a second, and
  // three took 9 s, 10.1 s and 13.6 s, D341; the limit is long, the check is the same)
  await expect.poll(async () => (await depthAt(page, channel)).some((d, k) => d > before[k] + 0.02), { timeout: 45_000 }).toBe(true);
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  // Shift+scroll sets a soft brush's strength (Smooth's), and says it beside the pointer (a height
  // brush's target, D322: brushKit.spec)
  await page.keyboard.press("4");
  // (the strength is said for 1.2 s, then the brush's own words come back: what the note said is kept as
  // it changes, so a slow page or a slow poll can't miss it, D341)
  await page.evaluate(() => {
    const said: string[] = [];
    (window as unknown as { __said: string[] }).__said = said;
    new MutationObserver(() => {
      const t = document.querySelector(".shape-note")?.textContent;
      if (t && said.at(-1) !== t) said.push(t);
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __said: string[] }).__said.some((t) => /^strength \d+$/.test(t))), { message: "the note says the strength" }).toBe(true);
  expect(errors).toEqual([]);
});
