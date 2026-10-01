// Kyler's forces sitting, batch A (PLAN §20 D344), through the page. A1: F and the mouse size a force's
// ring on the map, [ and ] step its Size and { and } its Power, exactly as a brush's, the number
// beside the pointer, a Size set by hand off Auto. A2: Power and Size always read as numbers, "Auto
// (68)" on Auto. A3 (amended by D361 (2)): a drawn gesture shows as its stroke along the line, with no
// ring: Carve's and Glaciate's band their width, a fault's or a fissure's a narrow line. A4:
// Esc while a line is still being drawn cancels it and nothing starts; a painted Lift being drawn goes
// back at once. (Esc and undo at every moment of a force at work are forceEsc.test's.)

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.force());
const gesture = (page: Page) => page.evaluate(() => window.dgmEditor!.gesture());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
const note = (page: Page) => page.locator(".shape-note");

async function refine(page: Page, hash = "s=4242&z=96&d=n&t=highlands") {
  await page.goto(`./#${hash}`);
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
}

/** Dry ground far from the start where the map (not a bar over it) takes the pointer, with 14 tiles
 *  of map each side of it. */
async function spot(page: Page): Promise<[number, number]> {
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
      for (let y = 20; y < m.H - 20; y += 2)
        for (let x = 20; x < m.W - 20; x += 2) {
          if (m.surface.depth[y * m.W + x] > 0) continue;
          if (![[0, 0], [-14, 0], [14, 0], [0, -14], [0, 14], [14, 14], [-14, -14]].every(([dx, dy]) => onMap(x + dx, y + dy))) continue;
          const s = Math.hypot(x - s0, y - s1) - Math.hypot(x - m.W / 2, y - m.H / 2) * 0.5;
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

test("A1, A2: F and the mouse size a force's ring on the map (Esc puts it back), [ ] and { } step Size and Power, the number beside the pointer; both always numbers, Auto as \"Auto (n)\"", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("8");
  const row = page.getByRole("group", { name: "Craterize options" });
  const size = row.locator(".size-control output");
  const power = row.locator(".slider-field").filter({ hasText: "Power" }).locator("output");
  // numbers: Power's, and Size's on Auto as "Auto (n)"
  await expect(power).toHaveText(/^\d+$/);
  await expect(size).toHaveText(/^Auto \(\d+\)$/);
  const at = await spot(page);
  const p = await client(page, at[0], at[1]);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y);
  await expect.poll(async () => (await gesture(page)).ring).not.toBeNull();

  // F held: the ring stays where it was, its size the pointer's distance, beside the pointer
  await page.keyboard.down("f");
  const q = await client(page, at[0] + 10, at[1]);
  await page.mouse.move(q.x, q.y, { steps: 8 });
  await expect(note(page)).toHaveText(/^size (18|20|22)$/);
  const set = Number((await note(page).textContent())!.replace("size ", ""));
  await page.keyboard.up("f");
  await expect(note(page)).toHaveCount(0);
  // set by hand: off Auto, the number in the row, the ring its half
  await expect(size).toHaveText(String(set));
  await expect(row.getByRole("button", { name: "Size follows Power" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await gesture(page)).ring).toBe(set / 2);
  // again, and Esc: put back
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.keyboard.down("f");
  const r = await client(page, at[0] + 4, at[1]);
  await page.mouse.move(r.x, r.y, { steps: 6 });
  await expect(note(page)).toHaveText(/^size \d+$/);
  await page.keyboard.press("Escape");
  await page.keyboard.up("f");
  await expect(size).toHaveText(String(set));
  // nothing struck meanwhile
  expect(await status(page)).toBeNull();
  expect((await info(page)).history.filter((h) => h.applied).at(-1)?.label ?? "").not.toBe("Craterize");

  // ] and [: the Size a step up and down; } and {: Power by five; each beside the pointer
  await page.keyboard.press("]");
  await expect(note(page)).toHaveText(`size ${set + 2}`);
  await expect(size).toHaveText(String(set + 2));
  const p0 = Number(await power.textContent());
  await page.keyboard.press("}");
  await expect(note(page)).toHaveText(`power ${Math.min(100, p0 + 5)}`);
  await expect(power).toHaveText(String(Math.min(100, p0 + 5)));
  await page.keyboard.press("{");
  await expect(power).toHaveText(String(p0));
  // back to Auto: "Auto (n)"
  await row.getByRole("button", { name: "Size follows Power" }).click();
  await expect(size).toHaveText(/^Auto \(\d+\)$/);

  // Carve's Size is its width: F sizes it too
  await page.keyboard.press("7");
  const carve = page.getByRole("group", { name: "Carve options" });
  await expect(carve.locator(".size-control output")).toHaveText(/^Auto \([\d.]+\)$/);
  await expect(carve.locator(".slider-field").filter({ hasText: "Power" }).locator("output")).toHaveText(/^\d+$/);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y);
  await expect.poll(async () => (await gesture(page)).ring).not.toBeNull();
  await page.keyboard.down("f");
  const c = await client(page, at[0] + 5, at[1]);
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await expect(note(page)).toHaveText(/^size (9|10|11)$/);
  await page.keyboard.up("f");
  await expect(carve.locator(".size-control output")).toHaveText(/^(9|10|11)$/);
});

test("A3, A4: every drawn gesture is a band of its width along the line with no ring, and Esc while it is drawn cancels it, nothing starting; a painted Lift goes back at once", async ({ page }) => {
  await refine(page);
  const at = await spot(page);
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  const draw = async () => {
    const a = await client(page, at[0] - 12, at[1] - 4);
    const b = await client(page, at[0], at[1] + 6);
    const c = await client(page, at[0] + 12, at[1] - 2);
    // (the force's pointer tool is on the map once its ring shows under the pointer: pressed sooner,
    // on a slow machine, the press would turn the camera)
    await page.mouse.move(a.x + 3, a.y);
    await page.mouse.move(a.x, a.y);
    await expect.poll(async () => (await gesture(page)).ring).not.toBeNull();
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.move(c.x, c.y, { steps: 10 });
  };
  // Carve, Glaciate, Quake's Slide fault and Erupt's fissure: a band, no ring; Esc drops it
  for (const [key, name, mode] of [
    ["7", "Carve", null],
    ["-", "Glaciate", null],
    ["9", "Quake", "Slide"],
    ["0", "Erupt", null],
  ] as const) {
    await page.keyboard.press(key);
    if (mode) await page.getByRole("group", { name: `${name} options` }).getByRole("button", { name: mode }).click();
    await draw();
    await expect.poll(async () => (await gesture(page)).stroke ?? 0, { message: name }).toBeGreaterThan(20);
    const g = await gesture(page);
    // (the preview is the stroke, D361 (2): Carve's and Glaciate's width, their Size; a fault or a
    // fissure its own narrow line, never its reach or the ground inside it)
    if (name === "Quake" || name === "Erupt") expect(g.band, name).toBe(1);
    else expect(g.band, name).toBeGreaterThan(1);
    expect(g.ring, name).toBeNull();
    expect(await status(page), name).toBeNull();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await gesture(page)).stroke, { message: name }).toBeNull();
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect(await status(page), name).toBeNull();
    await idle(page);
    expect((await labels(page)).length, name).toBe(n0);
    // (the force still picked: Esc dropped only the line)
    await expect(page.getByRole("button", { name: new RegExp(`^${name} \\(`) })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press(key);
  }
  expect(await heights(page)).toEqual(before);

  // a painted Lift, drawn: Esc takes it back at once, and letting go keeps nothing
  await page.keyboard.press("9");
  await page.getByRole("group", { name: "Quake options" }).getByRole("button", { name: "Lift" }).click();
  await draw();
  await expect.poll(() => status(page)).not.toBeNull();
  await expect(page.getByRole("group", { name: "Quake at work" }).locator(".force-keys")).toHaveText("Esc to cancel");
  await page.keyboard.press("Escape");
  await expect.poll(() => status(page)).toBeNull();
  await page.mouse.up();
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);
  // (and the next Lift paints as ever)
  await draw();
  await expect.poll(() => status(page)).not.toBeNull();
  await page.mouse.up();
  await expect.poll(() => status(page), { timeout: 30_000 }).toBeNull();
  await idle(page);
  expect((await labels(page)).length).toBe(n0 + 1);
});

test("D361 (1): Power acts on every mode: } while a Lift is painted lifts it higher at once, and Try another takes the row's Power as it is now", async ({ page }) => {
  await refine(page);
  const at = await spot(page);
  const before = await heights(page);
  await page.keyboard.press("9");
  const row = page.getByRole("group", { name: "Quake options" });
  await row.getByRole("slider", { name: "Power" }).fill("0");
  const a = await client(page, at[0] - 12, at[1]);
  const b = await client(page, at[0] + 12, at[1] + 2);
  await page.mouse.move(a.x + 3, a.y);
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => (await gesture(page)).ring).not.toBeNull();
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 16 });
  await expect.poll(() => status(page)).not.toBeNull();
  const rise = async () => {
    const h = await heights(page);
    return h.reduce((m, v, i) => Math.max(m, v - before[i]), 0);
  };
  await expect.poll(rise).toBeGreaterThan(0);
  const low = await rise();
  for (let k = 0; k < 20; k++) await page.keyboard.press("}");
  await expect.poll(rise, { timeout: 10_000 }).toBeGreaterThan(low + 3);
  await page.mouse.up();
  await expect.poll(() => status(page), { timeout: 30_000 }).toBeNull();
  await idle(page);
  expect(await rise()).toBeGreaterThan(low + 3);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);

  // Craterize at Power 10, then Try another at Power 90: a stronger impact
  await page.keyboard.press("8");
  const crater = page.getByRole("group", { name: "Craterize options" });
  await crater.getByRole("slider", { name: "Power" }).fill("10");
  const p = await client(page, at[0], at[1]);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => status(page), { timeout: 30_000 }).toBeNull();
  await idle(page);
  const moved = async () => (await heights(page)).reduce((n, v, i) => n + Math.abs(v - before[i]), 0);
  const weak = await moved();
  await crater.getByRole("slider", { name: "Power" }).fill("90");
  await crater.getByRole("button", { name: "Try another" }).click();
  await expect.poll(() => status(page), { timeout: 30_000 }).toBeNull();
  await idle(page);
  expect(await moved()).toBeGreaterThan(weak * 3);
});
