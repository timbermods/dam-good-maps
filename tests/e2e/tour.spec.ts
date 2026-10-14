// The 20-second tour (PLAN §20 D377), through the page: offered, never forced (the first visit's one quiet hint, and the
// File menu); it plays on a temporary copy of the map, advertising the controls that can't be discovered by looking
// (F and the mouse to size, F and the wheel for Power, Shift+click for the opposite, Ctrl+click to take a level), the
// keys shown as they are pressed; the player's own map, its history, its view and its saved choices are exactly as they
// were when it ends or Esc ends it, at any moment; and the player's own input stays out while it plays.

import { expect, test, type Page } from "@playwright/test";
import { centreOn, openEditor, openFileMenu, waitForEditor } from "./open";

const SPEC = "s=4242&z=96&d=n&t=highlands";

/** The player's map as the page has it: its history (and what can be undone or redone), its land, its view, and the
 *  choices the browser keeps. */
async function state(page: Page) {
  return page.evaluate(() => {
    const i = window.dgmEditor!.info();
    const m = window.dgm3d!.renderer.mapState()!;
    let h = 2166136261;
    for (const v of m.heights) h = Math.imul(h ^ v, 16777619) >>> 0;
    return {
      version: i.version,
      edits: i.edits,
      history: i.history.map((e) => `${e.label}:${e.applied}`),
      canUndo: i.canUndo,
      canRedo: i.canRedo,
      lands: h,
      objects: m.entities.count,
      view: window.dgm3d!.renderer.getView(),
      prefs: ["dgm.brush", "dgm.forces", "dgm.firstRun"].map((k) => localStorage.getItem(k)),
    };
  });
}

/** A map with a history to keep: two edits, one of them undone (so there is something to redo too). */
async function withHistory(page: Page) {
  const raise = (x: number, level: number, label: string) => page.evaluate(([x, level, label]) => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[40, x, x]], level } } as never, label as string), [x, level, label] as const);
  await raise(40, 15, "Raise a tile");
  await raise(44, 16, "Raise another");
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await expect(page.getByRole("button", { name: "Redo (Ctrl+Y)" })).toBeEnabled();
}

/** The editor as the player sees and holds it: what is pressed (the tools, the Show row, History), the options row's words
 *  and values, the selection, the water row (a held Drought day), and what has the focus. */
async function uiSignature(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const named = (b: Element) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().replace(/\s+/g, " ");
    return {
      pressed: [...document.querySelectorAll("[aria-pressed]")].map((b) => `${named(b)}:${b.getAttribute("aria-pressed")}`),
      checked: [...document.querySelectorAll<HTMLInputElement>('.editor input[type="checkbox"]')].map((c) => `${c.closest("label")?.textContent?.trim() ?? c.getAttribute("aria-label")}:${c.checked}`),
      options: [...document.querySelectorAll(".tool-settings .set")].map((s) => `${s.textContent?.trim().replace(/\s+/g, " ")}|${[...s.querySelectorAll("input")].map((i) => i.value).join(",")}`),
      selection: window.dgmEditor!.selection().length,
      water: document.querySelector(".water-bar")?.textContent?.trim().replace(/\s+/g, " ") ?? "",
      focus: el === window.dgm3d!.renderer.canvas ? "map" : el ? `${el.tagName}:${named(el)}` : "",
    };
  });
}

/** Set the editor up the way a player might have it: a selection drawn, the Raise brush sized, Carve in hand with its Power
 *  set, See-through on, History open and a Drought day held, the focus on the map. */
async function setUpUi(page: Page) {
  const tl = await page.evaluate(() => window.dgmEditor!.tileToClient(44, 50));
  const br = await page.evaluate(() => window.dgmEditor!.tileToClient(56, 60));
  await page.mouse.move(tl.x, tl.y);
  await page.mouse.down();
  await page.mouse.move(br.x, br.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.selection().length)).toBeGreaterThan(20);
  await page.keyboard.press("Digit2");
  await page.keyboard.press("Shift+BracketRight");
  await page.keyboard.press("Shift+BracketRight");
  await page.keyboard.press("Shift+Digit1");
  await page.keyboard.press("BracketRight");
  await page.keyboard.press("BracketRight");
  await page.keyboard.press("BracketRight");
  await page.keyboard.press("t");
  await page.getByRole("button", { name: "History" }).click();
  await page.getByRole("button", { name: "Drought", exact: true }).click();
  await expect(page.locator(".water-bar")).toContainText(/Day \d/, { timeout: 120_000 });
  await page.evaluate(() => window.dgm3d!.renderer.canvas.focus());
}

/** Remember every caption and key the tour shows from here on. */
async function watchCaptions(page: Page) {
  await page.evaluate(() => {
    const seen = new Set<string>();
    (window as unknown as { tourSeen: Set<string> }).tourSeen = seen;
    const take = () => {
      for (const el of document.querySelectorAll(".tour-pill .tour-words, .tour-pill .tour-says kbd")) seen.add((el.textContent ?? "").trim());
    };
    new MutationObserver(take).observe(document.body, { subtree: true, childList: true, characterData: true });
    take();
  });
}
const seen = (page: Page) => page.evaluate(() => [...(window as unknown as { tourSeen: Set<string> }).tourSeen]);

/** Start the tour from the File menu, and wait until it is on. */
async function startFromMenu(page: Page) {
  const menu = await openFileMenu(page);
  await menu.getByRole("menuitem", { name: "Watch a 20-second tour" }).click();
  await expect(page.locator(".tour")).toBeAttached({ timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  // (quicker than it plays for a person: the forces' own time is on top)
  await page.addInitScript(() => {
    (window as unknown as { dgmTourPace: number }).dgmTourPace = 3;
  });
});

test("File → Watch a 20-second tour plays through on a copy: the keys are shown, and the map, its history, its view and the editor as the player has it are as they were", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openEditor(page, SPEC);
  await withHistory(page);
  // (the player's own choices of brush and force, set before: the tour sizes brushes and forces itself)
  await page.evaluate(() => localStorage.setItem("dgm.brush", JSON.stringify({ size: 9, strength: 7, modes: {}, sources: {} })));
  await setUpUi(page);
  const before = await state(page);
  expect(before.canUndo).toBe(true);
  expect(before.canRedo).toBe(true);
  const ui = await uiSignature(page);
  expect(ui.pressed.some((p) => /^Carve.*:true$/.test(p))).toBe(true);

  await startFromMenu(page);
  await watchCaptions(page);
  // the player's own pointer and keys stay out while it plays (a click on File opens nothing)
  await page.getByRole("button", { name: "File", exact: true }).click({ force: true });
  await expect(page.getByRole("menu", { name: "File" })).toHaveCount(0);
  await expect(page.locator(".tour")).toHaveCount(0, { timeout: 120_000 });
  await waitForEditor(page);

  // what it advertised: the keys and what they do
  const words = await seen(page);
  for (const w of ["F", "Shift", "Ctrl", "move to size", "scroll for power", "click to lower", "click to take its level", "Save to Timberborn"]) expect(words, `the tour showed ${w}`).toContain(w);
  // (Save to Timberborn was shown, never done: no file, no saving)
  await expect(page.getByRole("button", { name: "Save to Timberborn" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save to Timberborn" })).not.toHaveClass(/tour-lit/);

  // the player's map, exactly as it was
  expect(await state(page)).toEqual(before);
  // (and the editor itself: the tool in hand and its settings, the selection, what is open, the Drought day, the focus)
  await expect.poll(() => uiSignature(page), { timeout: 60_000 }).toEqual(ui);
  await expect(page.getByRole("button", { name: "Undo (Ctrl+Z)" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Redo (Ctrl+Y)" })).toBeEnabled();
  // and it works as before: redo brings the undone step back
  await page.getByRole("button", { name: "Redo (Ctrl+Y)" }).click();
  await expect.poll(async () => (await state(page)).history.every((h) => h.endsWith(":true"))).toBe(true);
  expect(errors).toEqual([]);
});

test("Esc ends the tour at any moment, and everything is as it was", async ({ page }) => {
  test.setTimeout(300_000);
  await openEditor(page, SPEC);
  await withHistory(page);
  await setUpUi(page);
  const before = await state(page);
  const ui = await uiSignature(page);

  await startFromMenu(page);
  await watchCaptions(page);
  // (well into it: the river has been carved and the crater struck on the copy)
  await expect.poll(async () => (await seen(page)).includes("click to strike"), { timeout: 120_000 }).toBe(true);
  expect(await page.evaluate(() => window.dgmEditor!.info().history.length)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour")).toHaveCount(0, { timeout: 30_000 });
  await waitForEditor(page);
  expect(await state(page)).toEqual(before);
  await expect.poll(() => uiSignature(page), { timeout: 60_000 }).toEqual(ui);

  // (it can be watched again, and Esc at its very start ends it too)
  await startFromMenu(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour")).toHaveCount(0, { timeout: 30_000 });
  await waitForEditor(page);
  expect(await state(page)).toEqual(before);
});

test("the first visit's hint offers the tour, and watching it leaves the hints as they were", async ({ page }) => {
  test.setTimeout(240_000);
  await openEditor(page, SPEC);
  const hints = page.getByRole("status", { name: "First steps" });
  await expect(hints.getByRole("listitem")).toHaveCount(3);
  const before = await state(page);
  expect(before.prefs[2]).toBeNull();

  await hints.getByRole("button", { name: "Watch a 20-second tour" }).click();
  await expect(page.locator(".tour")).toBeAttached({ timeout: 60_000 });
  // (what it paints is no one's first step: the tour's own hints are not shown, and none is marked done)
  await expect(page.getByRole("status", { name: "First steps" })).toHaveCount(0);
  await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.info().history.length)) > 0, { timeout: 120_000 }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour")).toHaveCount(0, { timeout: 30_000 });
  await waitForEditor(page);

  await expect(hints.getByRole("listitem")).toHaveCount(3);
  await expect(hints.getByRole("button", { name: "Watch a 20-second tour" })).toBeVisible();
  expect(await state(page)).toEqual(before);
});

test("a picked source with its changed strength, and the Select row's Level number, come back after the tour and after Esc", async ({ page }) => {
  test.setTimeout(300_000);
  // (as the sources spec picks one: markers on, seen from above)
  await page.addInitScript(() => localStorage.setItem("dgm.markers", "on"));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await openEditor(page, SPEC);
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.waitForTimeout(500);
  // a source on dry, level ground clear of every object and bar (as the sources spec finds one)
  const at = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const st = (window.dgmEditor!.info().features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    for (let y = 16; y < m.H - 16; y++)
      for (let x = 16; x < m.W - 16; x++) {
        if (Math.hypot(x - st[0], y - st[1]) < 16) continue;
        const h0 = m.heights[y * m.W + x];
        let ok = onMap(x, y) && onMap(x + 2, y);
        for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 5 && ok; dx++) if (m.heights[(y + dy) * m.W + x + dx] !== h0 || m.surface.depth[(y + dy) * m.W + x + dx] > 0) ok = false;
        for (let k = 0; k < m.entities.count && ok; k++) if (Math.abs(m.entities.x[k] - x) <= 7 && Math.abs(m.entities.y[k] - y) <= 7) ok = false;
        if (ok) return [x, y] as [number, number];
      }
    return null;
  });
  expect(at).not.toBeNull();
  await centreOn(page, at![0], at![1]);
  await page.evaluate(
    ([x, y]) => window.dgmEditor!.edit({ op: "placeEntity", params: { id: "00000000-0000-4000-8000-000000000001", template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } } } as never, "Place water source"),
    at!,
  );
  await page.evaluate(() => window.dgmEditor!.idle());
  const tile = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), at!);
  // Select's Level number: Ctrl+click on the land, then the source picked and its strength changed
  await page.keyboard.down("Control");
  await page.mouse.click(tile.x + 30, tile.y + 30);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.held())).level).not.toBeNull();
  await page.mouse.move(tile.x + 3, tile.y);
  await page.mouse.move(tile.x, tile.y);
  await page.mouse.click(tile.x, tile.y);
  const strength = page.getByRole("combobox", { name: "Strength" });
  await expect(strength).toBeVisible();
  await strength.selectOption({ index: 2 });
  await page.evaluate(() => window.dgmEditor!.idle());
  const held = await page.evaluate(() => window.dgmEditor!.held());
  expect(held.source).not.toBeNull();
  const shown = await strength.inputValue();
  const before = await state(page);

  for (const how of ["plays through", "Esc"]) {
    await startFromMenu(page);
    if (how === "Esc") {
      await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.info().history.length)) > 0, { timeout: 120_000 }).toBe(true);
      await page.keyboard.press("Escape");
    }
    await expect(page.locator(".tour")).toHaveCount(0, { timeout: 120_000 });
    await waitForEditor(page);
    expect(await state(page), how).toEqual(before);
    await expect.poll(() => page.evaluate(() => window.dgmEditor!.held()), { timeout: 60_000 }).toEqual(held);
    await expect(page.getByRole("combobox", { name: "Strength" })).toHaveValue(shown);
  }
});
