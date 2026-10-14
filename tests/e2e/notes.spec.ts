// The editor's notes and messages: a refusal's note goes with the player's next action (only a save that failed
// stays), no keys are written in visible words (they live in tooltips), the first hint fits its lines, and every ×
// that closes a hint, a note, History or an object's window is one 24px icon button.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
/** An edit the core refuses, so the editor shows its refusal as an error note. */
const refused = (page: Page) => page.evaluate(() => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[40, 40, 40]], level: 999 } } as never, "Too high"));

test("a refusal's note goes with the next press, key, tool or view change; the first hints fit their lines; no keys are written in words", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const note = page.locator(".editor-message.error");
  const hints = page.getByRole("status", { name: "First steps" });

  // the first hints: each line is one line (no "drag." alone on a second), and none names a key
  await expect(hints.getByRole("listitem")).toHaveCount(3);
  const lines = await hints.getByRole("listitem").evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) })));
  for (const l of lines) expect(l.h).toBeLessThan(l.lh * 1.5);
  await expect(hints).not.toContainText(/\b(Esc|Ctrl|Shift|Alt)\b/);
  // the busy "Working…" note is gone: the checks pill already says it
  await expect(page.locator(".working")).toHaveCount(0);

  // a note stays until the player's next action: a key
  await refused(page);
  await expect(note).toHaveCount(1);
  await expect(note).not.toContainText(/\b(Esc|Ctrl|Shift|Alt)\b/);
  await page.keyboard.press("Digit3");
  await expect(note).toHaveCount(0);

  // a press on the map; the camera's drags (right, middle) leave the note, so a player can look around to see why
  await refused(page);
  await expect(note).toHaveCount(1);
  const c = await page.evaluate(() => window.dgmEditor!.tileToClient(30, 30));
  await page.mouse.move(c.x, c.y);
  for (const button of ["right", "middle"] as const) {
    await page.mouse.down({ button });
    await page.mouse.move(c.x + 20, c.y + 10);
    await page.mouse.up({ button });
    await expect(note).toHaveCount(1);
  }
  await page.mouse.click(c.x, c.y);
  await expect(note).toHaveCount(0);

  // the view changed (a layer toggle), and the note's own ×
  await refused(page);
  await expect(note).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Heights", exact: true }).click();
  await expect(note).toHaveCount(0);
  await refused(page);
  await note.getByRole("button", { name: "Dismiss" }).click();
  await expect(note).toHaveCount(0);

  // the 3D view says how the camera is moved, as it is (middle-drag turns, right-drag moves)
  expect(await page.locator(".editor-view canvas").first().getAttribute("aria-label")).toContain("Middle-drag to turn, right-drag to move");
  await idle(page);
});

test("every × that closes a hint, a note, History or an object's window is one 24px button, lit on hover", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const size = (loc: ReturnType<Page["locator"]>) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  const bg = (loc: ReturnType<Page["locator"]>) => loc.evaluate((e) => getComputedStyle(e).backgroundColor);
  const close = async (loc: ReturnType<Page["locator"]>) => {
    await expect(loc).toBeVisible();
    expect(await size(loc)).toEqual([24, 24]);
    await page.mouse.move(0, 0);
    const rest = await bg(loc);
    await loc.hover();
    await expect.poll(() => bg(loc)).not.toBe(rest);
    await page.mouse.move(0, 0);
  };

  await close(page.getByRole("status", { name: "First steps" }).getByRole("button", { name: "No more hints" }));
  await refused(page);
  await close(page.locator(".editor-message.error").getByRole("button", { name: "Dismiss" }));
  await page.locator(".editor-message.error").getByRole("button", { name: "Dismiss" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await close(page.getByRole("complementary", { name: "History" }).getByRole("button", { name: "Close the history" }));
  await page.getByRole("complementary", { name: "History" }).getByRole("button", { name: "Close the history" }).click();
  // an object picked on the map (a water source): its window's × puts it down
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const e = m.entities;
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource") return [e.x[k], e.y[k]] as [number, number];
    return null;
  });
  const sp = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), spot!);
  await page.mouse.move(sp.x + 2, sp.y);
  await page.mouse.click(sp.x, sp.y);
  await close(page.getByRole("button", { name: "Put it down" }));
});
