// Craterize, Erupt and Quake (PLAN §20 D202, D203, D206, D216, D219), through the page: each in the
// forces group with Carve, its options row starting with its mode switch; a click strikes or erupts,
// a painted fault quakes; each is kept as one undo step, exactly as it was shown (the worker's map is
// the page's), Esc takes it back at once, Try another replaces it and undo brings the first one back.
// A force is bound only by nature (D257): through the start it goes on, and the start is carried to
// level ground in the same step. Its gestures are clean (D258): no footprint, route or fit on the
// land, only a small cursor where a click acts, a thin arrow while Aim drags, and the stroke a
// fault or a fissure is painted with. Keys 7, 8, 9, 0 pick them, X flips a quake's side, Esc puts a
// force away; with reduced motion the land is exactly the same.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const worker = (page: Page) => page.evaluate(async () => Array.from((await window.dgmEditor!.worker.terrainNow()).heights));
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.force());
const gesture = (page: Page) => page.evaluate(() => window.dgmEditor!.gesture());
/** The start's middle, now. */
const startAt = async (page: Page) => ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;

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

test("Craterize: a click strikes, kept as one step as shown; Esc takes it back; Try another replaces it; on the start it strikes and the start is carried", async ({ page }) => {
  await refine(page);
  const bar = page.getByRole("toolbar", { name: "Tools" });
  const forces = bar.getByRole("group", { name: "Forces" });
  await expect(forces.getByRole("button")).toHaveText(["Carve", "Craterize", "Quake", "Erupt", "Glaciate"]);
  await page.keyboard.press("8");
  await expect(forces.getByRole("button", { name: "Craterize (8)" })).toHaveAttribute("aria-pressed", "true");
  const row = page.getByRole("group", { name: "Craterize options" });
  // its row: Power and Size, and a More button (D289: the click or drag is the mode; its walls,
  // centre, debris and rays come from the land and the seed, behind More, D309)
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power", "Size"]);
  expect(await row.getByRole("button").evaluateAll((els) => els.map((e) => e.textContent!.trim()))).toEqual(["Auto", "More"]);
  await expect(row.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Craterize details" })).toHaveCount(0);
  // a smaller one, so the test map stays readable
  await row.getByRole("slider", { name: "Power" }).fill("30");

  const { start, far } = await places(page);
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  // hovered: only the small cursor where it will strike, no crater's outline (D258)
  const h = await client(page, far[0], far[1]);
  await page.mouse.move(h.x + 3, h.y);
  await page.mouse.move(h.x, h.y);
  await expect.poll(async () => (await gesture(page)).cursor).toEqual(far);
  expect((await gesture(page)).stroke).toBeNull();
  await expect(page.locator(".shape-note")).toHaveCount(0);
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

  // on the start: it strikes all the same (D257), one step, and the start stands on level ground
  // after it: carried off broken ground, or riding a bowl its ground stayed level in (generator
  // 0.7.0's start here: a crater of 30 or 70 leaves its 3 × 3 level, one of 50 breaks it); undo
  // brings both back
  await row.getByRole("slider", { name: "Power" }).fill("50");
  const s = await client(page, start[0], start[1]);
  await page.mouse.move(s.x + 3, s.y);
  await page.mouse.move(s.x, s.y);
  await expect(page.locator(".shape-note")).toHaveCount(0);
  await page.mouse.click(s.x, s.y);
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Craterize");
  expect(await heights(page)).not.toEqual(before);
  const moved = await startAt(page);
  const hs = await heights(page);
  const W = (await info(page)).W;
  const under: number[] = [];
  for (let y = moved[1] - 1; y <= moved[1] + 1; y++) for (let x = moved[0] - 1; x <= moved[0] + 1; x++) under.push(hs[y * W + x]);
  expect(new Set(under).size, `the start's ground at (${moved})`).toBe(1);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
  expect(await startAt(page)).toEqual(start);
  // Esc puts the force away
  await page.keyboard.press("Escape");
  await expect(forces.getByRole("button", { name: "Craterize (8)" })).toHaveAttribute("aria-pressed", "false");
});

test("Craterize's More (D309): closed by default, its details on Auto (select, segmented and toggle controls); a pin survives Try another", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("8");
  const row = page.getByRole("group", { name: "Craterize options" });
  await row.getByRole("button", { name: "More" }).click();
  const details = page.getByRole("group", { name: "Craterize details" });
  await expect(details).toBeVisible();
  await expect(details.getByRole("combobox", { name: "Walls" })).toBeVisible();
  await expect(details.getByRole("combobox", { name: "Centre" })).toBeVisible();
  expect(await details.getByRole("group", { name: "Debris" }).getByRole("button").allTextContents()).toEqual(["Light debris", "Heavy debris"]);
  await expect(details.getByRole("checkbox", { name: "Rays" })).toBeVisible();
  for (const name of ["Walls follows the land", "Centre follows the land", "Debris follows the land", "Rays follows the land"]) await expect(details.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");

  await row.getByRole("slider", { name: "Power" }).fill("30");
  const { far } = await places(page);
  await clickTile(page, far[0], far[1]);
  await settled(page);
  // pin Rays to whatever it just took (D309 (3)); Try another keeps that pin
  const rays = await details.getByRole("checkbox", { name: "Rays" }).isChecked();
  await details.getByRole("button", { name: "Rays follows the land" }).click();
  await expect(details.getByRole("button", { name: "Rays follows the land" })).toHaveAttribute("aria-pressed", "false");
  await row.getByRole("button", { name: "Try another" }).click();
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Try another");
  expect(await details.getByRole("checkbox", { name: "Rays" }).isChecked()).toBe(rays);
});

test("Erupt: a click vents, a drag opens a fissure (D289: the gesture is the mode); each one step; undo takes it back", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("0");
  const row = page.getByRole("group", { name: "Erupt options" });
  // its row: Power and Size, and a More button (its shape, summit, flows and ridges from the land and
  // the seed, behind More, D309)
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power", "Size"]);
  expect(await row.getByRole("button").evaluateAll((els) => els.map((e) => e.textContent!.trim()))).toEqual(["Auto", "More"]);
  await expect(row.getByRole("combobox")).toHaveCount(0);
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

  // a fissure: a drag, painted
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

test("Erupt near the ceiling (D226): it completes under it; again on its summit it rises on the flank, with no preview on the land (D258)", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("0");
  // (its summit is the land's and the seed's now, D289)
  const { far } = await places(page);
  const W = (await info(page)).W;
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
      // hovered: only the cursor, no cone, no line to the flank and no words (D258), as it can rise
      // somewhere near
      const p = await client(page, at[0], at[1]);
      await page.mouse.move(p.x + 3, p.y);
      await page.mouse.move(p.x, p.y);
      await expect.poll(async () => (await gesture(page)).cursor).toEqual(at);
      expect((await gesture(page)).stroke).toBeNull();
      await page.waitForTimeout(200);
      await expect(page.locator(".shape-note")).toHaveCount(0);
    }
    await clickTile(page, at[0], at[1]);
    await expect(page.getByRole("group", { name: "Erupt at work" })).toBeVisible();
    await settled(page);
    expect((await labels(page)).filter((l) => l === "Erupt").length).toBe(k + 1);
    const after = await heights(page);
    expect(await worker(page)).toEqual(after);
    // under the editor's one ceiling, 22 on every map (D244; its summit is the land's and the seed's
    // now, D289: a crater or a caldera may crown it, so the peak's own count is the contract test's,
    // eruptHeadroom.test, with each summit set)
    expect(Math.max(...after)).toBeLessThanOrEqual(22);
    expect(after).not.toEqual(h);
  }
});

test("Quake: a painted Lift follows the stroke and is kept when let go; X flips the side; a Slide carries the land; a fault through the start quakes, the start carried", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("9");
  const row = page.getByRole("group", { name: "Quake options" });
  // its row: its one choice, Lift or Slide, then Power (its line sets its length), and a More button
  // (D289: its scarp from the land and the seed, behind More, D309; X flips the side that moves)
  expect(await row.getByRole("button").evaluateAll((els) => els.map((e) => e.textContent!.trim()))).toEqual(["Lift", "Slide", "More"]);
  await expect(row.locator("button").first()).toHaveAttribute("aria-pressed", "true");
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power"]);
  await expect(row.getByRole("group", { name: "Side that moves" })).toHaveCount(0);
  expect((await gesture(page)).side).toBe(1);
  await page.keyboard.press("x");
  expect((await gesture(page)).side).toBe(-1);
  await page.keyboard.press("x");
  expect((await gesture(page)).side).toBe(1);
  await row.getByRole("slider", { name: "Power" }).fill("20");

  const { start, far } = await places(page);
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  // a short fault away from the start: the land moves while it is painted, and is kept when let go
  const y = far[1];
  await paint(page, [far[0] - 10, y], [far[0] + 10, y], { release: false });
  // the fault is drawn as it is painted (the gesture itself), nothing else
  expect((await gesture(page)).stroke).toBeGreaterThan(0);
  expect((await gesture(page)).cursor).toBeNull();
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
  expect((await labels(page)).at(-1)).toBe("Quake: slide");
  expect(await worker(page)).toEqual(await heights(page));
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(lifted);

  // through the start: it quakes all the same (D257), one step, and the start stands on level
  // ground (carried there when its own broke)
  await row.getByRole("button", { name: "Lift" }).click();
  await paint(page, [start[0] - 8, start[1]], [start[0] + 8, start[1]]);
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Quake: lift");
  expect(await heights(page)).not.toEqual(lifted);
  expect(await worker(page)).toEqual(await heights(page));
});

test("Craterize's drag aims it (D258, D289): only a thin arrow, no crater's outline; let go, a glancing blow", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("8");
  const row = page.getByRole("group", { name: "Craterize options" });
  await row.getByRole("slider", { name: "Power" }).fill("30");
  const { far } = await places(page);
  const a = await client(page, far[0], far[1]);
  const b = await client(page, far[0] + 10, far[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  const g = await gesture(page);
  expect(g.arrow?.from).toEqual(far);
  expect(g.stroke).toBeNull();
  expect(g.cursor).toBeNull();
  await expect(page.locator(".aim-arrow")).toBeVisible();
  await expect(page.locator(".shape-note")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".aim-arrow")).toHaveCount(0);
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Craterize");
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
  // the same impact with motion welcome: the same land (the effects never change the result), and
  // the camera still never moves by itself: no shake, no follow (D265)
  await page.keyboard.press("Control+z");
  await idle(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const views = new Set<string>();
  await clickTile(page, far[0], far[1]);
  for (let k = 0; k < 40 && (await status(page)); k++) {
    views.add(JSON.stringify(await view()));
    await page.waitForTimeout(40);
  }
  await settled(page);
  views.add(JSON.stringify(await view()));
  expect([...views]).toEqual([JSON.stringify(v0)]);
  expect(await heights(page)).toEqual(reduced);
});

test("the camera moves only when the player moves it (D265): no Follow anywhere, and a carve leaves the view where it was", async ({ page }) => {
  await refine(page);
  await expect(page.getByRole("toolbar", { name: "Water time" }).getByRole("button", { name: "Follow" })).toHaveCount(0);
  await page.keyboard.press("7");
  const row = page.getByRole("group", { name: "Carve options" });
  await expect(row.getByLabel("Follow", { exact: true })).toHaveCount(0);
  await row.getByRole("slider", { name: "Power" }).fill("50");
  const { far } = await places(page);
  const view = () => page.evaluate(() => JSON.stringify(window.dgm3d!.renderer.getView()));
  const v0 = await view();
  await clickTile(page, far[0], far[1]);
  const views = new Set<string>();
  for (let k = 0; k < 60 && (await status(page)); k++) {
    views.add(await view());
    await page.waitForTimeout(50);
  }
  // (it keeps itself when it ends: no Stop, D289)
  await expect.poll(() => status(page), { timeout: 90_000 }).toBeNull();
  await idle(page);
  views.add(await view());
  expect([...views]).toEqual([v0]);
});

test("a force keeps its own pace whatever the water's speed (D266)", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("8");
  await page.getByRole("group", { name: "Craterize options" }).getByRole("slider", { name: "Power" }).fill("30");
  const { far } = await places(page);
  const timed = async (speed: string) => {
    await page.getByRole("combobox", { name: "Water speed" }).selectOption(speed);
    const t0 = Date.now();
    await clickTile(page, far[0], far[1]);
    await expect.poll(() => status(page), { timeout: 30_000, intervals: [20] }).toBeNull();
    const ms = Date.now() - t0;
    await idle(page);
    await page.keyboard.press("Control+z");
    await idle(page);
    return ms;
  };
  const slow = await timed("slower");
  const quick = await timed("instant");
  // the same moment either way (the water's speed is about the water only)
  expect(quick / slow).toBeGreaterThan(0.6);
  expect(quick / slow).toBeLessThan(1.6);
});

// Kyler's forces sitting, part 1 (PLAN §20 D312)
test("a force's size at the cursor (D312): a faint ring whose radius follows Power and Size, for every force", async ({ page }) => {
  await refine(page);
  const { far } = await places(page);
  const hover = async () => {
    const p = await client(page, far[0], far[1]);
    await page.mouse.move(p.x + 4, p.y);
    await page.mouse.move(p.x, p.y);
  };
  const ring = async () => {
    await expect.poll(async () => (await gesture(page)).ring).not.toBeNull();
    return (await gesture(page)).ring!;
  };
  for (const [key, name, size] of [
    ["8", "Craterize options", 40],
    ["0", "Erupt options", 30],
    ["7", "Carve options", 10],
  ] as const) {
    await page.keyboard.press(key);
    const row = page.getByRole("group", { name });
    await row.getByRole("slider", { name: "Power" }).fill("20");
    await hover();
    const low = await ring();
    await row.getByRole("slider", { name: "Power" }).fill("90");
    await expect.poll(async () => (await gesture(page)).ring).toBeGreaterThan(low);
    // Size set by hand: the ring is half of it, whatever Power says
    await row.getByRole("slider", { name: "Size" }).fill(String(size));
    await expect.poll(async () => (await gesture(page)).ring, name).toBe(size / 2);
    await row.getByRole("button", { name: "Size follows Power" }).click();
    // no footprint or outline of the result: only the ring and the small cursor
    expect((await gesture(page)).stroke).toBeNull();
  }
  // Quake: its reach round the pointer, no cursor (the fault is painted)
  await page.keyboard.press("9");
  const row = page.getByRole("group", { name: "Quake options" });
  await row.getByRole("slider", { name: "Power" }).fill("20");
  await hover();
  const q = await ring();
  await row.getByRole("slider", { name: "Power" }).fill("90");
  await expect.poll(async () => (await gesture(page)).ring).toBeGreaterThan(q);
  expect((await gesture(page)).cursor).toBeNull();
});

test("Carve's waypoints (D312): Shift+click drops them, Backspace takes the last off, Esc drops all; a plain click launches through them", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("7");
  await page.getByRole("group", { name: "Carve options" }).getByRole("slider", { name: "Power" }).fill("40");
  const { far } = await places(page);
  const dx = far[0] > 48 ? -1 : 1;
  const pts: [number, number][] = [far, [far[0] + 8 * dx, far[1] + 3], [far[0] + 16 * dx, far[1] - 2]];
  const shiftClick = async (x: number, y: number) => {
    const p = await client(page, x, y);
    await page.mouse.move(p.x, p.y);
    await page.keyboard.down("Shift");
    await page.mouse.click(p.x, p.y);
    await page.keyboard.up("Shift");
  };
  for (const [x, y] of pts) await shiftClick(x, y);
  await expect.poll(async () => (await gesture(page)).waypoints).toEqual(pts);
  // nothing runs while they're dropped
  expect(await status(page)).toBeNull();
  await page.keyboard.press("Backspace");
  await expect.poll(async () => (await gesture(page)).waypoints).toEqual(pts.slice(0, 2));
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await gesture(page)).waypoints).toEqual([]);
  expect(await status(page)).toBeNull();
  // again, and a plain click at the end: it runs through them, one step
  const n0 = (await labels(page)).length;
  for (const [x, y] of pts.slice(0, 2)) await shiftClick(x, y);
  await clickTile(page, pts[2][0], pts[2][1]);
  await expect.poll(async () => (await gesture(page)).waypoints).toEqual([]);
  await settled(page);
  expect((await labels(page)).length).toBe(n0 + 1);
  expect(await worker(page)).toEqual(await heights(page));
  // Enter launches too, the last waypoint its end
  await page.keyboard.press("Control+z");
  await idle(page);
  for (const [x, y] of pts) await shiftClick(x, y);
  await page.keyboard.press("Enter");
  await settled(page);
  expect((await labels(page)).length).toBe(n0 + 1);
});

test("Erupt's terrain is final in about two seconds (D312); its effects may linger, the player acts at once", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("0");
  await page.getByRole("group", { name: "Erupt options" }).getByRole("slider", { name: "Power" }).fill("70");
  const { far } = await places(page);
  const p = await client(page, far[0], far[1]);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y);
  const t0 = Date.now();
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => status(page)).not.toBeNull();
  await expect.poll(() => status(page), { timeout: 10_000, intervals: [50] }).toBeNull();
  const ms = Date.now() - t0;
  const software = await page.evaluate(() => !!(window.dgm3d!.renderer as unknown as { software?: boolean }).software);
  console.log(`Erupt: the terrain final ${ms} ms after the click${software ? " (software rendering)" : ""}`);
  // about two seconds on a GPU (a busy machine's frames add a little); where the browser draws in
  // software (CI), each frame of the eruption costs the page far more: there the paced part is
  // checked (its stages at the eruption's pace, forceDriver.test) and the wall clock only bounded
  expect(ms).toBeLessThan(software ? 8000 : 3000);
  // at once: the tools answer (a brush picked)
  await page.keyboard.press("1");
  await expect(page.getByRole("button", { name: "Raise brush (1)" })).toHaveAttribute("aria-pressed", "true");
});
