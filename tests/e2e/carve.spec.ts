// Carve (PLAN §20 D194, D199, D289), through the page: its row is Power, Size, Keep river or Dry
// canyon and Try another path, nothing more; a click unleashes a river that runs visibly, a frame at
// a time, and keeps itself as one undo step when it ends (the ground as it was shown; no Stop); undo
// takes all of it back at once, Esc skips it to its end (D344, A4), while its row's hint says so; Try
// another path replaces the kept carve, and undoing it
// brings the first one back. A drag draws its path freehand (D321, item 41: the gesture is the mode):
// the line shows as it is drawn, nothing else on the land; on release the river carves along it, from
// the line's higher end to its lower, whichever way it was drawn.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.carve());

async function refine(page: Page, hash: string) {
  await openEditor(page, hash);
  await page.getByRole("button", { name: "Top-down" }).click();
}

async function clickTile(page: Page, x: number, y: number) {
  const p = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
  await page.mouse.click(p.x, p.y);
}

/** High dry ground well away from the start, near the middle, where the map (not a bar over it)
 *  takes the click, and 24 tiles either side of it too (Aim's end). */
async function highGround(page: Page): Promise<[number, number]> {
  const i = await info(page);
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  return page.evaluate(
    ([s0, s1]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const onMap = (x: number, y: number) => {
        const p = window.dgmEditor!.tileToClient(x, y);
        return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
      };
      let best: [number, number] = [0, 0];
      let score = -Infinity;
      for (let y = 16; y < m.H - 16; y += 2)
        for (let x = 30; x < m.W - 30; x += 2) {
          const i = y * m.W + x;
          if (m.surface.depth[i] > 0 || Math.hypot(x - s0, y - s1) < 20) continue;
          if (!onMap(x, y) || !onMap(x - 24, y) || !onMap(x + 24, y)) continue;
          const s = m.heights[i] * 4 - Math.hypot(x - m.W / 2, y - m.H / 2);
          if (s > score) {
            score = s;
            best = [x, y];
          }
        }
      return best;
    },
    [start[0], start[1]] as const,
  );
}

test("Carve: its row is Power, Size and its one choice; a click unleashes a river that keeps itself as one step, Ctrl+Z takes it back, Esc skips it to its end, Try another path replaces it", async ({ page }) => {
  await refine(page, "s=4242&z=96&d=n&t=highlands");
  // its row: Power, Size, Keep river or Dry canyon (D289), a mode is the gesture, and a More button
  // for its other settings (D309: wander, walls and depth, closed by default)
  const carve = page.getByRole("button", { name: "Carve (7)" });
  await expect(carve).toBeVisible();
  await carve.click();
  const row = page.getByRole("group", { name: "Carve options" });
  await expect(row).toBeVisible();
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power", "Size"]);
  expect(await row.getByRole("button").evaluateAll((els) => els.map((e) => e.textContent!.trim()))).toEqual(["Auto", "Keep river", "Dry canyon", "More"]);
  await expect(row.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Carve details" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Keep river" })).toHaveAttribute("aria-pressed", "true");
  // (a long river first, so Esc still finds it running on a slow machine: which tile is picked
  // depends on the rows over the map, and a short creek there can end before Esc arrives)
  await row.getByRole("slider", { name: "Power" }).fill("60");
  // the other forces beside it, in the forces group (D216, D219)
  for (const name of ["Craterize (8)", "Quake (9)", "Erupt (0)"]) await expect(page.getByRole("button", { name })).toBeVisible();

  const before = await heights(page);
  const n0 = (await labels(page)).length;
  const at = await highGround(page);
  // Ctrl+Z: the whole carve goes at once, and the history never had it; its row said so meanwhile.
  // (The key comes in the same page frame that sees the river cutting, so it finds the carve at work
  // on any machine, however quick Fast's showing is there: D341. Every other moment of a force's run
  // is forceEsc.test's.)
  const pressWhileCutting = async (key: { key: string; ctrlKey?: boolean }) => {
    await clickTile(page, at[0], at[1]);
    const seen = await page.waitForFunction(
      ([was, k]) => {
        const st = window.dgmEditor!.carve();
        if (!st || st.steps < 12) return false;
        const cut = window.dgm3d!.renderer.mapState()!.heights.some((h, i) => h !== was[i]);
        const row = document.querySelector('[aria-label="Carve at work"]');
        const hint = row?.querySelector(".force-keys")?.textContent ?? null;
        window.dispatchEvent(new KeyboardEvent("keydown", { ...k, bubbles: true, cancelable: true }));
        return { cut, row: !!row, hint };
      },
      [before, key] as const,
      { timeout: 20_000 },
    );
    expect(await seen.jsonValue()).toEqual({ cut: true, row: true, hint: "Esc to skip · Ctrl+Z to undo" });
    await expect.poll(() => status(page)).toBeNull();
    await idle(page);
  };
  await pressWhileCutting({ key: "z", ctrlKey: true });
  expect(await heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);
  // Esc: skipped to its end, the whole river kept as one step, as the worker keeps it; undo takes it back
  await pressWhileCutting({ key: "Escape" });
  expect((await labels(page)).length).toBe(n0 + 1);
  expect((await labels(page)).at(-1)).toBe("Carve a river");
  const skipped = await heights(page);
  expect(skipped).not.toEqual(before);
  expect(await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.terrainNow()).heights))).toEqual(skipped);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);

  // again, to its end: one undo step, the ground as the page showed it; its row while it works is
  // Pause and Revert, no Stop (a creek, so it ends by itself soon)
  await row.getByRole("slider", { name: "Power" }).fill("15");
  await clickTile(page, at[0], at[1]);
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.steps ?? 0) >= 4, null, { timeout: 20_000 });
  // the other tools wait while it works
  await expect(page.getByRole("button", { name: /^Raise brush/ })).toBeDisabled();
  await expect(page.getByRole("group", { name: "Carve at work" }).getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect.poll(() => status(page), { timeout: 90_000 }).toBeNull();
  await idle(page);
  const l = await labels(page);
  expect(l.length).toBe(n0 + 1);
  expect(l.at(-1)).toBe("Carve a river");
  const kept = await heights(page);
  expect(kept).not.toEqual(before);
  const worker = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.terrainNow()).heights));
  expect(worker).toEqual(kept);

  // Try another path: the same carve, another way, replacing the first
  const again = page.getByRole("button", { name: "Try another path" });
  await expect(again).toBeVisible();
  await again.click();
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.seed ?? 0) === 1, null, { timeout: 20_000 });
  await expect.poll(() => status(page), { timeout: 90_000 }).toBeNull();
  await idle(page);
  const labelsNow = await labels(page);
  expect(labelsNow.at(-1)).toBe("Try another path");
  expect(await heights(page)).not.toEqual(kept);
  // undo: the first carve back, exactly; again: the land before it
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(kept);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
});

test("Carve's More (D309): closed by default; its details on Auto; pinning one keeps it through Try another", async ({ page }) => {
  await refine(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Carve (7)" }).click();
  const row = page.getByRole("group", { name: "Carve options" });
  await expect(page.getByRole("group", { name: "Carve details" })).toHaveCount(0);
  await row.getByRole("button", { name: "More" }).click();
  const details = page.getByRole("group", { name: "Carve details" });
  await expect(details).toBeVisible();
  expect(await details.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Wander", "Canyon depth", "River depth", "Banks", "Floor"]);
  // River depth (D321 item 17) is 2 unless set, with Off beside it; it sits beside Canyon depth (item 25)
  await expect(details.getByRole("slider", { name: "River depth" })).toHaveValue("2");
  await expect(details.getByRole("button", { name: "River depth off" })).toHaveAttribute("aria-pressed", "false");
  await expect(details.getByRole("combobox", { name: "Walls" })).toBeVisible();
  // every detail starts on Auto (D309); the land and the seed lean and vary them, tested at
  // tests/contract/forceNature.test.ts
  for (const name of ["Wander follows the land", "Walls follows the land", "Canyon depth follows Power", "Banks follows the land"]) await expect(details.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");

  const at = await highGround(page);
  await row.getByRole("slider", { name: "Power" }).fill("15");
  await clickTile(page, at[0], at[1]);
  await expect.poll(() => status(page), { timeout: 90_000 }).toBeNull();
  await idle(page);
  // pin Wander to the value the run just drew (one click, D309 (3))
  const wander = await details.getByRole("slider", { name: "Wander" }).inputValue();
  await details.getByRole("button", { name: "Wander follows the land" }).click();
  await expect(details.getByRole("button", { name: "Wander follows the land" })).toHaveAttribute("aria-pressed", "false");
  await expect(details.getByRole("slider", { name: "Wander" })).toHaveValue(wander);

  // Try another: the pinned Wander never moves, even though it replaces the carve with another one
  await row.getByRole("button", { name: "Try another path" }).click();
  await expect.poll(() => status(page), { timeout: 90_000 }).toBeNull();
  await idle(page);
  expect((await labels(page)).at(-1)).toBe("Try another path");
  await expect(details.getByRole("slider", { name: "Wander" })).toHaveValue(wander);
  // More stays open across it (D309: it remembers whether it was left open)
  await expect(details).toBeVisible();
});

test("Carve: a drag draws its path, the line showing as it is drawn; on release the river carves along it from its higher end, whichever way it was drawn; undo while it runs takes it back", async ({ page }) => {
  await refine(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Carve (7)" }).click();
  const row = page.getByRole("group", { name: "Carve options" });
  await expect(row.getByRole("button", { name: "Aim" })).toHaveCount(0);
  await expect(row.getByText("Defy gravity")).toHaveCount(0);
  const at = await highGround(page);
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  const gesture = () => page.evaluate(() => window.dgmEditor!.gesture());
  // hovered: the small cursor, nothing drawn ahead
  const a = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), at);
  await page.mouse.move(a.x + 3, a.y);
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => (await gesture()).cursor).toEqual(at);
  // drawn toward the high ground (uphill: the water still runs from the higher end), bending on the way:
  // the line shows as it is drawn, and nothing runs yet
  const endX = at[0] > 48 ? at[0] - 24 : at[0] + 24;
  const bendY = at[1] > 48 ? at[1] - 10 : at[1] + 10;
  const tile = (x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
  const s0 = await tile(endX, at[1]);
  const s1 = await tile(Math.round((endX + at[0]) / 2), bendY);
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  await page.mouse.move(s1.x, s1.y, { steps: 10 });
  await page.mouse.move(a.x, a.y, { steps: 10 });
  const g = await gesture();
  expect(g.stroke).toBeGreaterThan(20);
  // (a band of its width along the line, D344 A3: half its Size either side, and no ring)
  const size = Number(await row.getByRole("slider", { name: "Size" }).inputValue());
  expect(g.band).toBeGreaterThan(size / 2 - 1);
  expect(g.band).toBeLessThan(size / 2 + 1);
  expect(g.ring).toBeNull();
  expect(await status(page)).toBeNull();
  // let go: it carves along the line, and the line goes as it starts
  await page.mouse.up();
  await expect.poll(async () => (await gesture()).stroke).toBeNull();
  await page.waitForFunction(() => !window.dgmEditor!.carve(), null, { timeout: 20_000 });
  await idle(page);
  expect((await labels(page)).at(-1)).toBe("Carve a river");
  expect((await labels(page)).length).toBe(n0 + 1);
  // (it ran from the high ground, the line's higher end, and bent through the middle of the line)
  const after = await heights(page);
  const W = (await info(page)).W;
  const cut = (x: number, y: number) => {
    let n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (after[(y + dy) * W + x + dx] < before[(y + dy) * W + x + dx]) n++;
    return n;
  };
  expect(cut(at[0], at[1])).toBeGreaterThan(0);
  expect(cut(Math.round((endX + at[0]) / 2), bendY)).toBeGreaterThan(0);
  // undo while it runs takes it back (Slow forces: long enough to catch it running)
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
  await page.getByRole("button", { name: "Slow forces", exact: true }).click();
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  await page.mouse.move(s1.x, s1.y, { steps: 10 });
  await page.mouse.move(a.x, a.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.steps ?? 0) >= 10, null, { timeout: 20_000 });
  await page.keyboard.press("Control+z");
  await expect.poll(() => status(page)).toBeNull();
  await idle(page);
  expect(await heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);
  await page.getByRole("button", { name: "Slow forces", exact: true }).click();
});
