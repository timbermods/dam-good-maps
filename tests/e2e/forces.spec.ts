// Craterize, Erupt and Quake (PLAN §20 D202, D203, D206, D216, D219), through the page: each in the
// forces group with Carve, its options row starting with its mode switch; a click strikes or erupts,
// a painted fault quakes; each is kept as one undo step, exactly as it was shown (the worker's map is
// the page's), Ctrl+Z takes it back at once and Esc skips it to its end (D344, A4), Try another
// replaces it and undo brings the first one back.
// A force is bound only by nature (D257): through the start it goes on, and the start is carried to
// level ground in the same step. Its gestures are clean (D258): no footprint, route or fit on the
// land, only one ring at the cursor (its size) and the line a drag draws (D321, items 13 and 41: a
// fault, a fissure, a travelling force's path; Craterize is click-only, D368 (7)). Keys 7, 8, 9, 0 pick them, V flips a quake's side, Esc puts a
// force away; with reduced motion the land is exactly the same.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, setWaterSpeed } from "./open";
import { FAST_MS, MIN_SHOW_MS, showMs, WATCH_FACTOR } from "../../src/editor/forceDriver";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const worker = (page: Page) => page.evaluate(async () => Array.from((await window.dgmEditor!.worker.terrainNow()).heights));
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.force());
const gesture = (page: Page) => page.evaluate(() => window.dgmEditor!.gesture());
/** The start's middle, now. */
const startAt = async (page: Page) => ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;

async function openTopDown(page: Page, hash = "s=4242&z=96&d=n&t=highlands") {
  await openEditor(page, hash);
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
      // (clear of the top row, and of the bar with its settings, which grow upward with the force picked: its More
      // takes further rows, and the first-run hints sit above them)
      const below = (document.querySelector(".view3d-corner")?.getBoundingClientRect().bottom ?? 120) + 20;
      const above = (document.querySelector(".tool-dock")?.getBoundingClientRect().top ?? 600) - 20;
      const onMap = (x: number, y: number) => {
        const p = window.dgmEditor!.tileToClient(x, y);
        return p.y > below && p.y < above && document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
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

test("Craterize: a click strikes, kept as one step as shown; Ctrl+Z takes it back, Esc skips it to its end; Try another replaces it; on the start it strikes and the start is carried", async ({ page }) => {
  await openTopDown(page);
  const bar = page.getByRole("toolbar", { name: "Tools" });
  const forces = page.getByRole("group", { name: "Forces" });
  await expect(forces.getByRole("button")).toHaveText(["Carve", "Craterize", "Erupt", "Rift", "Quake", "Deposit", "Glaciate"]);
  await page.keyboard.press("Shift+Digit2");
  await expect(forces.getByRole("button", { name: "Craterize (Shift+2)" })).toHaveAttribute("aria-pressed", "true");
  const row = page.getByRole("group", { name: "Craterize options" });
  // its settings, all shown (Kyler's option B, no More): Power, Size, then its walls, centre, debris and rays from
  // the land and the seed until pinned (D309), the Floor and Try another; the click or drag is the mode (D289)
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power", "Size", "Floor"]);
  for (const g of ["Walls", "Centre", "Debris", "Rays"]) await expect(row.getByRole("group", { name: g, exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "More" })).toHaveCount(0);
  await expect(row.getByRole("combobox")).toHaveCount(0);
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
  // Ctrl+Z as it strikes: all of it goes, and the history never had it
  await clickTile(page, far[0], far[1]);
  await page.keyboard.press("Control+z");
  await settled(page);
  expect(await heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);
  // Esc as it strikes: straight to its end, kept as one step (D344, A4); undo takes it back
  await clickTile(page, far[0], far[1]);
  await expect(page.getByRole("group", { name: "Craterize at work" }).getByRole("button", { name: "Revert" })).toHaveAttribute("data-keys", /Ctrl\+Z.*Esc skips to its end/);
  await page.keyboard.press("Escape");
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Craterize");
  expect(await heights(page)).not.toEqual(before);
  expect(await worker(page)).toEqual(await heights(page));
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
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
  await expect(forces.getByRole("button", { name: "Craterize (Shift+2)" })).toHaveAttribute("aria-pressed", "false");
});

test("clicked quickly (D378): the next force plays in full from its first moment, the last one's tail skipped to its end", async ({ page }) => {
  // (the effects play where the browser draws in software too, as on a GPU: CI's has none)
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true };
  });
  await openTopDown(page);
  const { far } = await places(page);
  const onMap = (x: number, y: number) =>
    page.evaluate(([a, b]) => {
      const p = window.dgmEditor!.tileToClient(a, b);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    }, [x, y] as [number, number]);
  const next: [number, number] = (await onMap(far[0] + 12, far[1])) ? [far[0] + 12, far[1]] : [far[0] - 12, far[1]];
  // what plays as each moment comes, the moment after it is shown
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const w = window as unknown as { moments: unknown[] };
    w.moments = [];
    const set = r.setForceMoment.bind(r);
    r.setForceMoment = (m) => {
      set(m);
      w.moments.push({ verb: m.verb, x: m.x, y: m.y, phase: m.phase, showing: r.forceShowing });
    };
  });
  const firstMoment = () =>
    page.evaluate(() => (window as unknown as { moments: { verb: string; x: number; y: number; phase: string; showing: Record<string, Record<string, number | null> | null> }[] }).moments[0]);
  const force = async (key: string, power: string, at: [number, number]) => {
    const row = page.getByRole("group", { name: `${key === "Shift+Digit2" ? "Craterize" : "Erupt"} options` });
    // (its key again would put it away)
    if (!(await row.isVisible())) await page.keyboard.press(key);
    await row.getByRole("slider", { name: "Power" }).fill(power);
    await page.evaluate(() => ((window as unknown as { moments: unknown[] }).moments = []));
    await clickTile(page, at[0], at[1]);
    await expect.poll(() => status(page), { timeout: 30_000 }).toBeNull();
  };
  for (const [a, b] of [["Shift+Digit2", "Shift+Digit2"], ["Shift+Digit2", "Shift+Digit3"], ["Shift+Digit3", "Shift+Digit3"]] as const) {
    await force(a, "30", far);
    // (kept: an eruption's lava still cools, however slowly the browser draws; a crater's dust may
    // already have settled where it keeps slowly, as software drawing on CI does: forcePlayback.test
    // holds that case on exact time)
    if (a === "Shift+Digit3") expect((await page.evaluate(() => window.dgm3d!.renderer.forceShowing))!.erupt).not.toBeNull();
    await force(b, "35", next);
    const m = await firstMoment();
    const verb = b === "Shift+Digit2" ? "craterize" : "erupt";
    expect(m.verb, `${a} then ${b}`).toBe(verb);
    // its own effect, where it is, from its start
    expect(m.showing[verb], `${a} then ${b}`).toMatchObject({ x: m.x, y: m.y });
    if (verb === "craterize" && m.phase === "incoming") expect(m.showing.craterize!.struck).toBeNull();
    if (verb === "erupt") expect(m.showing.erupt!.cooling).toBe(0);
    // the last one's gone
    for (const v of ["craterize", "erupt", "quake", "glaciate"]) if (v !== verb) expect(m.showing[v], `${a} then ${b}: ${v}`).toBeNull();
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await settled(page);
  }
});

test("Craterize's details (D309): always shown, each on Auto (choices and an Off and On); a pin survives Try another", async ({ page }) => {
  await openTopDown(page);
  await page.keyboard.press("Shift+Digit2");
  const row = page.getByRole("group", { name: "Craterize options" });
  const details = row;
  for (const g of ["Walls", "Centre"]) await expect(details.getByRole("group", { name: g, exact: true })).toBeVisible();
  expect(await details.getByRole("group", { name: "Debris" }).getByRole("button").allTextContents()).toEqual(["Light", "Heavy"]);
  expect(await details.getByRole("group", { name: "Rays" }).getByRole("button").allTextContents()).toEqual(["Off", "On"]);
  for (const name of ["Walls follows the land", "Centre follows the land", "Debris follows the land", "Rays follows the land"]) await expect(details.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");

  await row.getByRole("slider", { name: "Power" }).fill("30");
  const { far } = await places(page);
  await clickTile(page, far[0], far[1]);
  await settled(page);
  // pin Rays to whatever it just took (D309 (3)); Try another keeps that pin
  const raysOn = async () => (await details.getByRole("group", { name: "Rays" }).getByRole("button", { name: "On" }).getAttribute("aria-pressed")) === "true";
  const rays = await raysOn();
  await details.getByRole("button", { name: "Rays follows the land" }).click();
  await expect(details.getByRole("button", { name: "Rays follows the land" })).toHaveAttribute("aria-pressed", "false");
  await row.getByRole("button", { name: "Try another" }).click();
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Try another");
  expect(await raysOn()).toBe(rays);
});

test("Erupt: a click vents, a drag opens a fissure (D289: the gesture is the mode); each one step; undo takes it back", async ({ page }) => {
  await openTopDown(page);
  await page.keyboard.press("Shift+Digit3");
  const row = page.getByRole("group", { name: "Erupt options" });
  // its settings, all shown (no More): Power, Size, its shape, summit, flows and ridges from the land and the seed
  // until pinned (D309), the Floor and Try another
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power", "Size", "Floor"]);
  for (const g of ["Shape", "Summit", "Flows", "Ridges"]) await expect(row.getByRole("group", { name: g, exact: true })).toBeVisible();
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
  await openTopDown(page);
  await page.keyboard.press("Shift+Digit3");
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

test("Quake: a painted Lift follows the stroke and is kept when let go; V flips the side (X was its key before D323 item 16); a Slide carries the land; a fault through the start quakes, the start carried", async ({ page }) => {
  await openTopDown(page);
  await page.keyboard.press("Shift+Digit5");
  const row = page.getByRole("group", { name: "Quake options" });
  // its settings: its one choice, Lift or Slide, Power (its line sets its length), the Side that moves (V flips it),
  // its scarp from the land and the seed until pinned (D309), the Floor and Try another; no More
  await expect(row.getByRole("group", { name: "Mode" }).getByRole("button")).toHaveText(["Lift", "Slide"]);
  await expect(row.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Lift" })).toHaveAttribute("aria-pressed", "true");
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power", "Floor"]);
  const side = row.getByRole("group", { name: "Side" });
  await expect(side.getByRole("button", { name: "Left" })).toHaveAttribute("aria-pressed", "true");
  expect((await gesture(page)).side).toBe(1);
  await page.keyboard.press("v");
  expect((await gesture(page)).side).toBe(-1);
  // (Side shows what V set, and sets it too)
  await expect(side.getByRole("button", { name: "Right" })).toHaveAttribute("aria-pressed", "true");
  await side.getByRole("button", { name: "Left" }).click();
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

test("Craterize is click-only (D368 (7)): a drag draws no line and makes one crater, centred where the press began", async ({ page }) => {
  // (seed 4244 since 0.8.8's maps, the Canyon and Highlands height round, D148: on 4242 the far tile stands on
  // the top bench beside a fall of nine levels to the west, and the ground that gives way down it makes the
  // lowered tiles 41 wide for 28 tall, though still centred on the press)
  await openTopDown(page, "s=4244&z=96&d=n&t=highlands");
  await page.keyboard.press("Shift+Digit2");
  const row = page.getByRole("group", { name: "Craterize options" });
  await row.getByRole("slider", { name: "Power" }).fill("50");
  await row.getByRole("slider", { name: "Size" }).fill("16");
  const { far } = await places(page);
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  const a = await client(page, far[0] - 8, far[1]);
  const b = await client(page, far[0] + 8, far[1]);
  await page.mouse.move(a.x + 3, a.y);
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => (await gesture(page)).ring).not.toBeNull();
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.waitForTimeout(150);
  // no line, no outline: a crater is one impact
  expect((await gesture(page)).stroke).toBeNull();
  await page.mouse.up();
  await settled(page);
  expect((await labels(page)).slice(n0)).toEqual(["Craterize"]);
  // one crater, round and centred where the press began (a glancing blow would run east along the drag)
  const after = await heights(page);
  const W = Math.round(Math.sqrt(after.length));
  let n = 0;
  let sx = 0;
  let x0 = W;
  let x1 = 0;
  let y0 = W;
  let y1 = 0;
  for (let i = 0; i < after.length; i++) {
    if (before[i] - after[i] < 1) continue;
    const x = i % W;
    const y = Math.floor(i / W);
    n++;
    sx += x;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const where = JSON.stringify({ n, x: sx / n, x0, x1, y0, y1, from: far[0] - 8 });
  expect(n, where).toBeGreaterThan(9);
  expect(Math.abs(sx / n - (far[0] - 8)), where).toBeLessThanOrEqual(2);
  expect(x1 - x0, where).toBeLessThanOrEqual((y1 - y0) * 1.3 + 2);
});

test("the forces with reduced motion: the same land, no camera moving", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openTopDown(page);
  const { far } = await places(page);
  const view = () => page.evaluate(() => window.dgm3d!.renderer.getView());
  await page.keyboard.press("Shift+Digit2");
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
  await openTopDown(page);
  await expect(page.getByRole("toolbar", { name: "Water time" }).getByRole("button", { name: "Follow" })).toHaveCount(0);
  await page.keyboard.press("Shift+Digit1");
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
  await openTopDown(page);
  await page.keyboard.press("Shift+Digit2");
  await page.getByRole("group", { name: "Craterize options" }).getByRole("slider", { name: "Power" }).fill("30");
  const { far } = await places(page);
  const timed = async (speed: string) => {
    await setWaterSpeed(page, speed);
    await clickTile(page, far[0], far[1]);
    await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.forceTiming()))?.kept ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
    const t = (await page.evaluate(() => window.dgmEditor!.forceTiming()))!;
    await idle(page);
    await page.keyboard.press("Control+z");
    await idle(page);
    return t;
  };
  const slow = await timed("slower");
  const quick = await timed("instant");
  // the same impact at its own pace either way: the water's speed is about the water only (D341: the
  // pace as the page plans it, never a busy machine's wall clock)
  expect(quick.total).toBe(slow.total);
  for (const t of [slow, quick]) {
    expect(t.speed).toBe("fast");
    expect(Math.abs(t.show - showMs("craterize", t.total, "fast", t.worked))).toBeLessThanOrEqual(1);
  }
});

// Kyler's forces sitting, part 1 (PLAN §20 D312)
test("a force's size at the cursor (D312): a faint ring whose radius follows Power and Size, for every force with a Size; Quake only a small marker (D368 (2))", async ({ page }) => {
  await openTopDown(page);
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
    ["Shift+Digit2", "Craterize options", 40],
    ["Shift+Digit3", "Erupt options", 30],
    ["Shift+Digit1", "Carve options", 10],
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
  // Quake (D368 (2)): only a small marker at the pointer, never a circle of how far it could reach
  // (the force's own decision, never drawn in advance), at any Power
  await page.keyboard.press("Shift+Digit5");
  const row = page.getByRole("group", { name: "Quake options" });
  const drawn = () => page.evaluate(() => window.dgm3d!.renderer.forceRingState);
  for (const power of ["20", "90"]) {
    await row.getByRole("slider", { name: "Power" }).fill(power);
    await hover();
    await expect.poll(async () => (await gesture(page)).cursor, power).toEqual(far);
    expect((await gesture(page)).ring, power).toBeNull();
    await expect.poll(drawn, power).toMatchObject({ x: far[0] + 0.5, y: far[1] + 0.5, marker: true });
  }
});

test("Carve's drawn path (D321, item 41): the line shows as it is drawn; Esc drops it; let go, the river carves along it as one step", async ({ page }) => {
  await openTopDown(page);
  await page.keyboard.press("Shift+Digit1");
  await page.getByRole("group", { name: "Carve options" }).getByRole("slider", { name: "Power" }).fill("40");
  const { far } = await places(page);
  const dx = far[0] > 48 ? -1 : 1;
  const pts: [number, number][] = [far, [far[0] + 8 * dx, far[1] + 3], [far[0] + 16 * dx, far[1] - 2]];
  const draw = async (release: boolean) => {
    const a = await client(page, pts[0][0], pts[0][1]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) {
      const p = await client(page, x, y);
      await page.mouse.move(p.x, p.y, { steps: 8 });
    }
    if (release) await page.mouse.up();
  };
  await draw(false);
  await expect.poll(async () => (await gesture(page)).stroke ?? 0).toBeGreaterThan(10);
  // nothing runs while it's drawn; Esc drops the line
  expect(await status(page)).toBeNull();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await gesture(page)).stroke).toBeNull();
  await page.mouse.up();
  expect(await status(page)).toBeNull();
  // drawn and let go: it runs along it, one step, the page's land the worker's
  const n0 = (await labels(page)).length;
  await draw(true);
  await settled(page);
  expect((await labels(page)).length).toBe(n0 + 1);
  expect(await worker(page)).toEqual(await heights(page));
});

test("Erupt's terrain is final in about two seconds (D312); its effects may linger, the player acts at once", async ({ page }) => {
  await openTopDown(page);
  await page.keyboard.press("Shift+Digit3");
  await page.getByRole("group", { name: "Erupt options" }).getByRole("slider", { name: "Power" }).fill("70");
  const { far } = await places(page);
  const p = await client(page, far[0], far[1]);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.forceTiming()))?.kept ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
  expect(await status(page)).toBeNull();
  const t = (await page.evaluate(() => window.dgmEditor!.forceTiming()))!;
  const software = await page.evaluate(() => !!(window.dgm3d!.renderer as unknown as { software?: boolean }).software);
  console.log(`Erupt: worked out ${t.worked} ms, the terrain final ${t.final} ms after the click${software ? " (software rendering)" : ""}`);
  // about two seconds: its 28 stages at the eruption's own pace, planned to be final within Fast's two
  // seconds of the click (or just after a slow working-out). D341: the plan, checked here; the driver
  // keeps to it on exact time (forceDriver.test); a busy machine's frames only add to the wall clock
  expect(Math.abs(t.show - showMs("erupt", t.total, "fast", t.worked))).toBeLessThanOrEqual(1);
  expect(t.due).toBeLessThanOrEqual(Math.max(FAST_MS, t.worked + MIN_SHOW_MS) + 1);
  // at once: the tools answer (a brush picked)
  await page.keyboard.press("2");
  await expect(page.getByRole("button", { name: "Raise brush (2)" })).toHaveAttribute("aria-pressed", "true");
});
