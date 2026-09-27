// Craterize, Erupt and Quake (PLAN §20 D202, D203, D206, D216, D219), through the page: each in the
// forces group with Carve, its options row starting with its mode switch; a click strikes or erupts,
// a painted fault quakes; each is kept as one undo step, exactly as it was shown (the worker's map is
// the page's), Esc takes it back at once, Try another replaces it and undo brings the first one back;
// every force refuses where the start sits, quietly ("Start here"). Keys 7, 8, 9, 0 pick them, X
// flips a quake's side, Esc puts a force away; with reduced motion the land is exactly the same.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const worker = (page: Page) => page.evaluate(async () => Array.from((await window.dgmEditor!.worker.terrainNow()).heights));
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.force());

async function refine(page: Page, hash = "s=4242&z=96&d=n&t=highlands") {
  await page.goto(`./#${hash}`);
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
}

const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

async function clickTile(page: Page, x: number, y: number) {
  const p = await client(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/** A stroke over the map from one tile to another, in small moves. */
async function paint(page: Page, from: [number, number], to: [number, number], opts: { release?: boolean } = {}) {
  const a = await client(page, from[0], from[1]);
  const b = await client(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 16; k++) {
    await page.mouse.move(a.x + ((b.x - a.x) * k) / 16, a.y + ((b.y - a.y) * k) / 16);
    await page.waitForTimeout(20);
  }
  if (opts.release !== false) await page.mouse.up();
}

/** The start's middle, and dry ground far from it where the map (not a bar over it) takes the
 *  clicks, with room round it: above and below too, since a force's row gains a line (Try another)
 *  once one is kept, and the view bar can wrap to a second row (D248), pushing the rows down over
 *  the map. */
async function places(page: Page): Promise<{ start: [number, number]; far: [number, number] }> {
  const i = await info(page);
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const far = await page.evaluate(
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
          if (m.surface.depth[y * m.W + x] > 0 || !onMap(x, y) || !onMap(x - 10, y) || !onMap(x + 10, y)) continue;
          if ([-12, -9, -6, -3, 3, 6, 9, 12].some((d) => !onMap(x, y + d))) continue;
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
  return { start, far };
}

async function settled(page: Page) {
  await expect.poll(() => status(page), { timeout: 30_000 }).toBeNull();
  await idle(page);
}

test("Craterize: a click strikes, kept as one step as shown; Esc takes it back; Try another replaces it; the start refuses it", async ({ page }) => {
  await refine(page);
  const bar = page.getByRole("toolbar", { name: "Tools" });
  const forces = bar.getByRole("group", { name: "Forces" });
  await expect(forces.getByRole("button")).toHaveText(["Carve", "Craterize", "Quake", "Erupt"]);
  await page.keyboard.press("8");
  await expect(forces.getByRole("button", { name: "Craterize (8)" })).toHaveAttribute("aria-pressed", "true");
  const row = page.getByRole("group", { name: "Craterize options" });
  await expect(row.locator("button").first()).toHaveText("Strike");
  await expect(row.locator("button").first()).toHaveAttribute("aria-pressed", "true");
  for (const name of ["Power", "Size"]) await expect(row.getByRole("slider", { name })).toBeVisible();
  for (const name of ["Walls", "Centre"]) await expect(row.getByRole("combobox", { name })).toBeVisible();
  await expect(row.getByRole("group", { name: "Debris" })).toBeVisible();
  await expect(row.getByText("Rays")).toBeVisible();
  // a smaller one, so the test map stays readable
  await row.getByRole("slider", { name: "Power" }).fill("30");

  const { start, far } = await places(page);
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  // Esc as it strikes: all of it goes, and the history never had it
  await clickTile(page, far[0], far[1]);
  await page.keyboard.press("Escape");
  await settled(page);
  expect(await heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);

  // struck: one step, the ground as the page showed it and as the worker keeps it
  await clickTile(page, far[0], far[1]);
  await expect(page.getByRole("group", { name: "Craterize at work" })).toBeVisible();
  // (the other tools wait while it works)
  await expect(bar.getByRole("button", { name: /^Raise brush/ })).toBeDisabled();
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Craterize");
  const kept = await heights(page);
  expect(kept).not.toEqual(before);
  expect(await worker(page)).toEqual(kept);

  // Try another: the same impact from the same land, another personality, replacing it
  await row.getByRole("button", { name: "Try another" }).click();
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Try another");
  const other = await heights(page);
  expect(other).not.toEqual(kept);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(kept);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);

  // on the start: red, "Start here", and nothing happens
  const s = await client(page, start[0], start[1]);
  await page.mouse.move(s.x, s.y);
  await expect(page.locator(".shape-note")).toHaveText("Start here");
  await page.mouse.click(s.x, s.y);
  await settled(page);
  expect(await heights(page)).toEqual(before);
  // Esc puts the force away
  await page.keyboard.press("Escape");
  await expect(forces.getByRole("button", { name: "Craterize (8)" })).toHaveAttribute("aria-pressed", "false");
});

test("Erupt: a vent on a click, a fissure painted; each one step; undo takes it back", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("0");
  const row = page.getByRole("group", { name: "Erupt options" });
  await expect(row.locator("button").first()).toHaveText("Vent");
  await expect(row.getByRole("combobox", { name: "Summit" })).toBeVisible();
  await expect(row.getByRole("group", { name: "Flows" })).toBeVisible();
  await row.getByRole("slider", { name: "Power" }).fill("30");
  const { far } = await places(page);
  const before = await heights(page);
  await clickTile(page, far[0], far[1]);
  await expect(page.getByRole("group", { name: "Erupt at work" })).toBeVisible();
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Erupt");
  const vent = await heights(page);
  expect(vent).not.toEqual(before);
  // the volcano rose: the ground at the vent is higher
  const W = (await info(page)).W;
  expect(vent[far[1] * W + far[0]]).toBeGreaterThan(before[far[1] * W + far[0]]);
  expect(await worker(page)).toEqual(vent);

  // a fissure, painted
  await row.getByRole("button", { name: "Fissure" }).click();
  // (on whichever side of the vent the map takes the pointer, clear of the bars over it)
  const onMap = (x: number, y: number) =>
    page.evaluate(([a, b]) => {
      const p = window.dgmEditor!.tileToClient(a, b);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    }, [x, y] as [number, number]);
  const dy = (await onMap(far[0] - 8, far[1] + 10)) && (await onMap(far[0] + 8, far[1] + 12)) ? 1 : -1;
  await paint(page, [far[0] - 8, far[1] + 10 * dy], [far[0] + 8, far[1] + 12 * dy]);
  await expect(page.getByRole("group", { name: "Erupt at work" })).toBeVisible();
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Erupt a fissure");
  expect(await worker(page)).toEqual(await heights(page));
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(vent);
});

test("Erupt near the ceiling (D226): it completes, keeps a peak, never a mesa; again on its summit it breaks out on the flank", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("0");
  const row = page.getByRole("group", { name: "Erupt options" });
  // a steep volcano with a peak, as Kyler made them
  await row.getByRole("combobox", { name: "Summit" }).selectOption("peak");
  const { far } = await places(page);
  const W = (await info(page)).W;
  const topAround = (h: number[], x: number, y: number, r: number) => {
    let peak = 0;
    let at = 0;
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) peak = Math.max(peak, h[yy * W + xx]);
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (h[yy * W + xx] === peak) at++;
    return { peak, at };
  };
  for (let k = 0; k < 2; k++) {
    const h = await heights(page);
    // the summit so far (the first time, where it is asked)
    let at: [number, number] = [far[0], far[1]];
    if (k) {
      let best = -1;
      for (let yy = far[1] - 6; yy <= far[1] + 6; yy++)
        for (let xx = far[0] - 6; xx <= far[0] + 6; xx++)
          if (h[yy * W + xx] > best) {
            best = h[yy * W + xx];
            at = [xx, yy];
          }
      // hovered, it says where it will go
      const p = await client(page, at[0], at[1]);
      await page.mouse.move(p.x + 3, p.y);
      await page.mouse.move(p.x, p.y);
      await expect(page.locator(".shape-note")).toContainText(/breaks out on the flank|grows broader/);
    }
    await clickTile(page, at[0], at[1]);
    await expect(page.getByRole("group", { name: "Erupt at work" })).toBeVisible();
    await settled(page);
    expect((await labels(page)).filter((l) => l === "Erupt").length).toBe(k + 1);
    const after = await heights(page);
    expect(await worker(page)).toEqual(after);
    // under the ceiling, and a peak: a few tiles at its top, not a plateau
    expect(Math.max(...after)).toBeLessThanOrEqual(16);
    const t = topAround(after, far[0], far[1], 8);
    expect(t.at, `eruption ${k + 1}`).toBeLessThanOrEqual(40);
  }
});

test("Quake: a painted Lift follows the stroke and is kept when let go; X flips the side; a Slide carries the land; a fault through the start is refused", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("9");
  const row = page.getByRole("group", { name: "Quake options" });
  await expect(row.locator("button").first()).toHaveText("Lift");
  const side = row.getByRole("group", { name: "Side that moves" });
  await expect(side.getByRole("button", { name: "Left" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("x");
  await expect(side.getByRole("button", { name: "Right" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("x");
  await row.getByRole("slider", { name: "Power" }).fill("20");

  const { start, far } = await places(page);
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  // a short fault away from the start: the land moves while it is painted, and is kept when let go
  const y = far[1];
  await paint(page, [far[0] - 10, y], [far[0] + 10, y], { release: false });
  await expect.poll(async () => (await status(page))?.painting ?? false).toBe(true);
  await expect.poll(async () => JSON.stringify(await heights(page)) !== JSON.stringify(before)).toBe(true);
  await page.mouse.up();
  await settled(page);
  expect((await labels(page)).slice(n0)).toEqual(["Quake: lift"]);
  const lifted = await heights(page);
  expect(await worker(page)).toEqual(lifted);

  // a Slide: its block carried along the fault, one step
  await row.getByRole("button", { name: "Slide" }).click();
  await paint(page, [far[0] - 10, y - 6], [far[0] + 10, y - 6]);
  await settled(page);
  const l = await labels(page);
  if (l.at(-1) !== "Quake: slide") {
    // (the start was on the side that slides: the other side, then)
    await page.keyboard.press("x");
    await paint(page, [far[0] - 10, y - 6], [far[0] + 10, y - 6]);
    await settled(page);
  }
  expect((await labels(page)).at(-1)).toBe("Quake: slide");
  expect(await worker(page)).toEqual(await heights(page));
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(lifted);

  // through the start: red, "Start here", and nothing happens
  await row.getByRole("button", { name: "Lift" }).click();
  await paint(page, [start[0] - 8, start[1]], [start[0] + 8, start[1]], { release: false });
  await expect(page.locator(".shape-note")).toContainText("Start here");
  await page.mouse.up();
  await settled(page);
  expect(await heights(page)).toEqual(lifted);
});

test("the forces with reduced motion: the same land, no camera moving", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await refine(page);
  const { far } = await places(page);
  const view = () => page.evaluate(() => window.dgm3d!.renderer.getView());
  await page.keyboard.press("8");
  await page.getByRole("group", { name: "Craterize options" }).getByRole("slider", { name: "Power" }).fill("30");
  const v0 = await view();
  await clickTile(page, far[0], far[1]);
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Craterize");
  expect(await view()).toEqual(v0);
  const reduced = await heights(page);
  // the same impact with motion welcome: the same land (the effects never change the result)
  await page.keyboard.press("Control+z");
  await idle(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await clickTile(page, far[0], far[1]);
  await settled(page);
  expect(await heights(page)).toEqual(reduced);
});
