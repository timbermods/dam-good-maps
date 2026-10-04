// The top bar and the brush kit (PLAN §20 D183, D184, D204, D205, D212, D322): Raise … Naturalize |
// Select | the forces, and a row with only the picked tool's options (the sources are on the
// shelf); the height brushes' target level as the game's editor has it (D322, item 37: beside the
// pointer, following the ground until Shift+scroll or the row sets it, exact with hard edges, Esc
// lets it follow again; no Precise); the mode and the sources choice in every brush's row (items 2
// and 31); square, straight lines with their length, level lines (a view switch beside Height
// colours, with any tool: D248), Flatten in steps (no Ramped edges, D322), "the start fits here" after
// a Flatten stroke, Smooth with no walkable option (D247); hold F to size the brush, its size beside
// the pointer, kept when F is let go; the sounds' switch; the Select tool (M, or Ctrl+drag) with its
// size and its actions.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);
const heightAt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgm3d!.renderer.heightAt(a, b), [x, y] as const);
const lastStroke = (page: Page) => page.evaluate(() => window.dgmEditor!.lastStroke());
/** The ring is on tile (x, y): the page has taken the pointer's move (F sizes the ring from there;
 *  where the browser draws in software, a move can land a frame later than the key). */
const ringOn = (page: Page, x: number, y: number) =>
  expect.poll(() => page.evaluate(() => { const c = window.dgm3d!.renderer.brushCursorState; return c ? [Math.floor(c.x), Math.floor(c.y)] : null; })).toEqual([x, y]);
/** The words beside the pointer once they stop changing (the last of a move's frames drawn). */
async function steadyNote(page: Page): Promise<string> {
  const read = () => page.locator(".shape-note").textContent();
  let last = await read();
  for (;;) {
    await page.waitForTimeout(200);
    const now = await read();
    if (now === last) return now ?? "";
    last = now;
  }
}
const settle = (page: Page) => page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });

/** Flat, dry, empty ground away from the start: a tile with `r` tiles of it all round. */
async function flatDry(page: Page, start: [number, number], r: number, not: [number, number][] = []) {
  return page.evaluate(
    ([s0, s1, rr, avoid]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const w = m.W;
      // (where the map shows, clear of the controls over it, with room above the bar for a tool's settings)
      const dock = document.querySelector(".tool-dock")!.getBoundingClientRect().top - 80;
      const shows = (x: number, y: number) => {
        const p = window.dgmEditor!.tileToClient(x, y);
        return p.y < dock && document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
      };
      for (let y = rr + 2; y < m.H - rr - 2; y++)
        for (let x = rr + 2; x < w - rr - 2; x++) {
          if (Math.hypot(x - s0, y - s1) < 16 || avoid.some(([ax, ay]) => Math.hypot(x - ax, y - ay) < 2 * rr + 4)) continue;
          const h0 = m.heights[y * w + x];
          if (h0 < 4) continue;
          let ok = true;
          for (let dy = -rr; dy <= rr && ok; dy++) for (let dx = -rr; dx <= rr && ok; dx++) if (m.heights[(y + dy) * w + x + dx] !== h0 || m.surface.depth[(y + dy) * w + x + dx] > 0) ok = false;
          for (let k = 0; k < m.entities.count && ok; k++) if (Math.abs(m.entities.x[k] - x) <= rr + 2 && Math.abs(m.entities.y[k] - y) <= rr + 2) ok = false;
          if (ok && [[0, 0], [-rr - 2, -rr - 2], [rr + 2, -rr - 2], [-rr - 2, rr + 2], [rr + 2, rr + 2]].every(([dx, dy]) => shows(x + dx, y + dy))) return [x, y] as [number, number];
        }
      return null;
    },
    [start[0], start[1], r, not] as const,
  );
}

test("the bar and the brush kit: options, the target level, straight lines, terraces, Smooth with no walkable option, Lines in the Show column, Select", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  // (seed 34 since batch 5, seed 35 since D252's start planting, D148: the test needs four stretches
  // of flat, dry, empty ground at level 4 or above for the pits, the stroke, the plateau and the
  // Select tool, and a mine site standing unturned; seed 24, used since M9a's first maps, had room for
  // only two, and 0.7.0's 4242 for none. Seed 34 on M9b's maps: its two flat pits once filled with
  // water from nowhere a few seconds after the stroke, D385, fixed by #177; the seed that caught it
  // stays)
  await openEditor(page, "s=34&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  const i = await info(page);
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;

  // the bar: Select, the five brushes and the forces (no Remove, D288), and above it only the held tool's
  // settings; the objects menu in Layout 2's order: the start, then the sources (Kyler, 2026-10-03)
  const bar = page.getByRole("toolbar", { name: "Tools" });
  for (const name of ["Raise brush (1)", "Lower brush (2)", "Flatten brush (3)", "Smooth brush (4)", "Naturalize brush (5)", "Select (M)"]) await expect(bar.getByRole("button", { name })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: /Source/ })).toHaveCount(0);
  const shelfWords = await page.getByRole("navigation", { name: "Place" }).getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(shelfWords.slice(0, 8)).toEqual(["Start", "Water source (6)", "Badwater source", "Natural dam", "Pine", "Birch", "Oak", "Berry bush"]);
  await expect(page.getByRole("group", { name: /options/ })).toHaveCount(0);
  // the forces, all five ready (D216, D219, D291), in the bar after the tools
  const forces = page.getByRole("group", { name: "Forces" });
  for (const name of ["Carve (7)", "Craterize (8)", "Quake (9)", "Erupt (0)", "Glaciate (-)"]) await expect(forces.getByRole("button", { name })).toBeVisible();
  // F and R do nothing with no brush or object out: the old camera zoom on R and F is gone (D212;
  // F sizes the brush, R turns the shelf's object)
  const distance = () => page.evaluate(() => window.dgm3d!.renderer.getView().distance);
  const d0 = await distance();
  await page.keyboard.press("f");
  await page.keyboard.press("r");
  await page.waitForTimeout(150);
  expect(await distance()).toBe(d0);
  // the sounds: on by default (clearly audible since D226), an off switch, the volume beside it (D212)
  const soundButton = page.getByRole("button", { name: "Sound", exact: true });
  await expect(soundButton).toHaveAttribute("aria-pressed", "true");
  await soundButton.hover();
  await expect(page.getByRole("slider", { name: "Sound volume" })).toBeVisible();
  await soundButton.click();
  await expect(soundButton).toHaveAttribute("aria-pressed", "false");
  await soundButton.click();
  // the shelf's Water source (6): its strength in the row; a brush puts it back
  await page.keyboard.press("6");
  await expect(page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source (6)" })).toHaveAttribute("aria-pressed", "true");
  const sourceRow = page.getByRole("group", { name: "Water source options" });
  await expect(sourceRow.getByRole("slider")).toBeVisible();
  await page.keyboard.press("2");
  await expect(sourceRow).toHaveCount(0);
  const lowerRow = page.getByRole("group", { name: "Lower options" });
  for (const t of ["Square", "Straight lines"]) await expect(lowerRow.getByLabel(t)).not.toBeChecked();
  // no Precise and no Stop at (D322); Both and Ride by default (items 2 and 31)
  for (const t of ["Precise", "Stop at", "Clear sources"]) await expect(lowerRow.getByLabel(t, { exact: true })).toHaveCount(0);
  await expect(lowerRow.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Both" })).toHaveAttribute("aria-pressed", "true");
  await expect(lowerRow.getByRole("group", { name: "Sources" }).getByRole("button", { name: "Ride" })).toHaveAttribute("aria-pressed", "true");
  await expect(lowerRow.getByLabel("In steps")).toHaveCount(0);
  await expect(lowerRow.getByLabel("Level lines")).toHaveCount(0);

  // level lines: a view switch, Lines, right under Heights in the Show column (D248), the same with a brush out or none
  const view = page.getByRole("group", { name: "Show" });
  const levelLines = view.getByRole("checkbox", { name: "Lines" });
  await expect(levelLines).toHaveAttribute("aria-checked", "false");
  const viewWords = (await view.getByRole("checkbox").allTextContents()).map((t) => t.trim());
  expect(viewWords.indexOf("Lines")).toBe(viewWords.indexOf("Heights") + 1);
  await levelLines.click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.levelLines)).toBe(true);
  // the brush put away: level lines stay
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Lower options" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.levelLines)).toBe(true);
  await levelLines.click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.levelLines)).toBe(false);
  await page.keyboard.press("2");
  await expect(lowerRow).toBeVisible();

  // the target (D322, item 37): beside the pointer, a level below the ground while it follows it;
  // Shift+scroll sets it; a click cuts exactly to it with hard edges; holding adds nothing
  const pit = (await flatDry(page, start, 3))!;
  expect(pit).not.toBeNull();
  const h0 = await heightAt(page, ...pit);
  await lowerRow.getByLabel("Square").check();
  const pp = await client(page, ...pit);
  // (the keys go to the map, not to the toggle just used)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(pp.x + 2, pp.y);
  await page.mouse.move(pp.x, pp.y);
  const note = page.locator(".shape-note");
  await expect(note).toHaveText(`down to ${h0 - 1}`);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Shift");
  await expect(note).toHaveText(`down to ${h0 - 2}`);
  await expect(lowerRow.getByRole("combobox", { name: "Target level" })).toHaveValue(String(h0 - 2));
  // a small brush: 3 × 3 tiles ({ steps the size down: 5, 4, 3, 2)
  for (let k = 0; k < 3; k++) await page.keyboard.press("{");
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await settle(page);
  await idle(page);
  expect(await heightAt(page, ...pit)).toBe(h0 - 2);
  let st = (await lastStroke(page))!;
  expect(st.target).toBe(h0 - 2);
  expect(st.precise).toBeUndefined();
  expect(st.shape).toBe("square");
  // (held still, no dab more than the press)
  expect(st.dabs.length).toBe(2);
  expect((await info(page)).history.at(-1)!.label).toMatch(/^Lower, \d+ tiles$/);
  // vertical walls: the pit's edge at the target, the ground right beside it untouched
  expect(await heightAt(page, pit[0] + 1, pit[1] + 1)).toBe(h0 - 2);
  expect(await heightAt(page, pit[0] + 2, pit[1])).toBe(h0);
  // Esc: the target follows the ground again (the brush stays out); Free past the list's end
  await page.keyboard.press("Escape");
  await expect(lowerRow.getByRole("combobox", { name: "Target level" })).toHaveValue("follow");
  await lowerRow.getByRole("combobox", { name: "Target level" }).selectOption("free");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(pp.x + 2, pp.y);
  await expect(note).toHaveText("Free");
  await page.keyboard.press("Escape");
  for (let k = 0; k < 3; k++) await page.keyboard.press("}");
  await lowerRow.getByLabel("Square").uncheck();

  // straight lines: the stroke is one straight line, its length beside the pointer (D183)
  await lowerRow.getByLabel("Straight lines").check();
  const a = (await flatDry(page, start, 2, [pit]))!;
  const pa = await client(page, a[0], a[1]);
  const pb = await client(page, a[0] + 8, a[1]);
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pa.x + 30, pa.y + 25, { steps: 4 });
  await page.mouse.move(pb.x, pb.y, { steps: 4 });
  await expect(page.locator(".shape-note")).toHaveText(/^\d+ tiles?$/);
  await page.mouse.up();
  await settle(page);
  st = (await lastStroke(page))!;
  const ys = new Set<number>();
  for (let k = 1; k < st.dabs.length; k += 2) ys.add(Math.floor(st.dabs[k] / 4));
  expect(ys.size).toBeLessThanOrEqual(2);
  await lowerRow.getByLabel("Straight lines").uncheck();

  // Flatten in steps: in the stroke's operation
  await page.keyboard.press("3");
  const flatRow = page.getByRole("group", { name: "Flatten options" });
  await flatRow.getByLabel("In steps").check();
  // benches every 3 levels from a level just below this ground: the click takes it down to one
  const hb = await heightAt(page, a[0], a[1] + 6);
  await flatRow.getByRole("combobox", { name: "Steps apart" }).selectOption("3");
  await flatRow.getByRole("combobox", { name: "Target level" }).selectOption(String(hb - 1));
  const b = await client(page, a[0], a[1] + 6);
  await page.mouse.click(b.x, b.y);
  await settle(page);
  expect((await lastStroke(page))!.steps).toBe(3);
  expect(await heightAt(page, a[0], a[1] + 6)).toBe(hb - 1);
  // no Ramped edges (D322: a walkable edge is the shelf's Slope); a level up from the ground: a
  // plateau the start fits on
  await flatRow.getByLabel("In steps").uncheck();
  await expect(flatRow.getByRole("combobox", { name: "Edges" })).toHaveCount(0);
  const f = (await flatDry(page, start, 4, [pit, a]))!;
  expect(f).not.toBeNull();
  const hf = await heightAt(page, ...f);
  await flatRow.getByRole("combobox", { name: "Target level" }).selectOption(String(hf + 1));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const pf = await client(page, ...f);
  await page.mouse.move(pf.x, pf.y);
  for (let k = 0; k < 2; k++) await page.keyboard.press("}");
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await settle(page);
  st = (await lastStroke(page))!;
  expect(st.edges).toBeUndefined();
  expect(st.target).toBe(hf + 1);
  expect(await heightAt(page, ...f)).toBe(hf + 1);
  // the start fits there: a quiet hint, found in the background; a click moves the start there
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.startHint()), { timeout: 15_000 }).not.toBeNull();
  const hint = (await page.evaluate(() => window.dgmEditor!.startHint()))!;
  console.log(`start hint: found in ${hint.ms} ms (${hint.strong ? "the requirements hold" : "it fits"})`);
  expect(Math.hypot(hint.x - f[0], hint.y - f[1])).toBeLessThanOrEqual(5);
  await page.locator(".start-hint").click();
  await idle(page);
  await expect.poll(async () => ((await info(page)).features.find((g) => g.kind === "start")!.params as { position: [number, number] }).position).toEqual([hint.x, hint.y]);
  for (let k = 0; k < 2; k++) await page.keyboard.press("{");
  await flatRow.getByRole("combobox", { name: "Target level" }).selectOption("follow");

  // hold F and move the mouse: the ring's size follows, a click sets it (D205)
  const s0 = await client(page, ...f);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(s0.x + 2, s0.y);
  await page.mouse.move(s0.x, s0.y);
  await ringOn(page, ...f);
  const steps0 = (await info(page)).history.length;
  await page.keyboard.down("f");
  const s1 = await client(page, f[0] + 7, f[1]);
  await page.mouse.move(s1.x, s1.y, { steps: 5 });
  const sizedWords = await steadyNote(page);
  expect(sizedWords).toMatch(/^size (6\.5|7|7\.5)$/);
  const sized = Number(sizedWords.split(" ")[1]);
  await page.mouse.click(s1.x, s1.y);
  await page.keyboard.up("f");
  // (the click set the size: it painted nothing)
  await idle(page);
  expect((await info(page)).history.length).toBe(steps0);
  // again, and F let go keeps it (D322, item 37)
  await page.mouse.move(s0.x + 2, s0.y);
  await page.mouse.move(s0.x, s0.y);
  await ringOn(page, ...f);
  await page.keyboard.down("f");
  const s2 = await client(page, f[0] + 4, f[1]);
  await page.mouse.move(s2.x, s2.y, { steps: 5 });
  const keptWords = await steadyNote(page);
  expect(keptWords).toMatch(/^size (3\.5|4|4\.5)$/);
  const kept = Number(keptWords.split(" ")[1]);
  await page.keyboard.up("f");
  await expect(page.getByRole("group", { name: "Flatten options" }).getByRole("slider", { name: "Size" })).toHaveValue(String(kept));
  await page.mouse.move(s0.x + 2, s0.y);
  await page.mouse.move(s0.x, s0.y);
  await ringOn(page, ...f);
  await page.keyboard.down("f");
  await page.mouse.move(s1.x, s1.y, { steps: 5 });
  expect(await steadyNote(page)).toBe(`size ${sized}`);
  await page.keyboard.up("f");
  await expect(page.getByRole("group", { name: "Flatten options" }).getByRole("slider", { name: "Size" })).toHaveValue(String(sized));

  // objects ride the ground (D204): a Flatten whose rim crosses a mine site leaves its footprint
  // level, never on a step, so the game keeps it
  const mine = (await page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "UndergroundRuins") return [e.x[k], e.y[k], e.z[k]] as [number, number, number];
    return null;
  }))!;
  expect(mine).not.toBeNull();
  await flatRow.getByRole("combobox", { name: "Target level" }).selectOption(String(Math.max(0, mine[2] - 2)));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // (below the rows over the map, which are three now: D323 item 9)
  // (a stroke that runs up to the mine site's west edge and holds there: its rim crosses the site
  // however fast the machine paints)
  // (the mine site to the middle of the view, clear of the rows over the map: the map is centred now)
  await page.evaluate(([x, y]) => {
    const r = window.dgm3d!.renderer;
    r.setView({ target: [x + 0.5, r.getView().target[1], -(y + 0.5)] });
  }, [mine[0], mine[1]]);
  await page.waitForTimeout(300);
  const pm = await client(page, Math.max(2, mine[0] - 7), mine[1] - 4);
  const pe = await client(page, Math.max(2, mine[0] - 2), mine[1] - 4);
  await page.mouse.move(pm.x, pm.y);
  await page.mouse.down();
  await page.mouse.move(pe.x, pe.y, { steps: 8 });
  await page.waitForTimeout(2000);
  await page.mouse.up();
  await settle(page);
  await idle(page);
  st = (await lastStroke(page))!;
  expect(st.keep?.length ?? 0).toBeGreaterThan(0);
  expect((await page.evaluate(() => window.dgmEditor!.instant())).filter((c) => /floating|buried/i.test(c.message))).toEqual([]);
  await flatRow.getByRole("combobox", { name: "Target level" }).selectOption("follow");
  // (the map framed again, as it was)
  await page.evaluate(() => window.dgm3d!.renderer.frameMap());

  await page.keyboard.press("4");
  // Smooth has no walkable option (D247: the shelf's Slope puts a slope where wanted) and no target;
  // its stroke over the pit's walls carries none
  const smoothRow = page.getByRole("group", { name: "Smooth options" });
  await expect(smoothRow).toBeVisible();
  // (only the toggles all five brushes share: Square and Straight lines; its mode and sources)
  await expect(smoothRow.getByRole("checkbox")).toHaveCount(2);
  await expect(smoothRow.getByRole("group", { name: "Sources" }).getByRole("button")).toHaveText(["Ride", "Keep", "Clear"]);
  await expect(smoothRow.getByRole("group", { name: "Mode" }).getByRole("button")).toHaveText(["Ground", "Water", "Both"]);
  await expect(smoothRow.getByRole("combobox", { name: "Target level" })).toHaveCount(0);
  await expect(smoothRow.getByLabel(/walkable/i)).toHaveCount(0);
  await page.mouse.click(pp.x, pp.y);
  await settle(page);
  expect((await lastStroke(page))!.walkable).toBeUndefined();
  expect((await lastStroke(page))!.size).toBe(sized);

  // the Select tool: M, a rectangle with its size, raise it one level a click (D323 item 6), one step
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  const sel = page.getByRole("group", { name: "Selection" });
  await expect(sel).toBeVisible();
  const c0 = (await flatDry(page, start, 3, [pit, a, f]))!;
  const q0 = await client(page, c0[0] - 3, c0[1] - 2);
  const q1 = await client(page, c0[0] + 2, c0[1] + 2);
  await page.mouse.move(q0.x, q0.y);
  await page.mouse.down();
  await page.mouse.move(q1.x, q1.y, { steps: 5 });
  await expect(page.locator(".shape-note")).toHaveText("6 × 5 tiles");
  await page.mouse.up();
  await expect(sel.getByRole("status")).toHaveText("6 × 5 tiles");
  const before = await heightAt(page, ...c0);
  await sel.getByRole("button", { name: "Up 1", exact: true }).click();
  await idle(page);
  expect((await info(page)).history.at(-1)!.label).toBe("Raise 30 tiles by 1");
  await expect.poll(() => heightAt(page, ...c0)).toBe(before + 1);
  // Shift adds, and Esc clears it (Select stays in hand)
  await page.keyboard.down("Shift");
  const q2 = await client(page, c0[0] + 3, c0[1]);
  await page.mouse.click(q2.x, q2.y);
  await page.keyboard.up("Shift");
  await expect(sel.getByRole("status")).toHaveText("7 × 5 tiles (31)");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.dgmEditor!.selection())).toEqual([]);
  await expect(page.getByRole("button", { name: "Select (M)" })).toHaveAttribute("aria-pressed", "true");

  // Ctrl+drag with a brush out selects too: the brush stays out, and the Select row is a chip
  // beside it (D259: one row at a time)
  await page.keyboard.press("1");
  await page.keyboard.down("Control");
  await page.mouse.move(q0.x, q0.y);
  await page.mouse.down();
  await page.mouse.move(q1.x, q1.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(page.locator(".select-chip")).toHaveText("Working inside 6 × 5 · Esc to clear");
  await expect(page.getByRole("group", { name: "Selection" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Raise brush/ })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
