// The height slice, "Visible layers" (PLAN §20 D207; Kyler, 2026-10-03): one control, ▾ [value] ▴, and nothing else.
// The value runs up to 22 (the game's highest terrain) then ∞ on every map; the first step down from ∞ goes straight
// to the map's highest ground; stepping up runs level by level to 22, then ∞; a click on the value shows the whole
// world; the control keeps one width whatever the value, so nothing beside it ever moves. (Alt+scroll and
// Alt+middle-click on the map step the renderer's own way: waterView.spec.ts.)

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("the height slice: first down from ∞ is the map's highest ground, up runs to 22 then ∞, a click on the value is ∞, one width throughout", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");

  const widget = page.getByRole("group", { name: "Visible layers" });
  const output = widget.locator("output");
  const lower = widget.getByRole("button", { name: "Lower the visible layer" });
  const raise = widget.getByRole("button", { name: "Raise the visible layer" });
  const slice = () => page.evaluate(() => window.dgm3d!.renderer.slice);
  const width = async () => (await widget.boundingBox())!.width;
  const same = (a: number, b: number, what: string) => expect(Math.abs(a - b), `${what}: ${a} against ${b}`).toBeLessThanOrEqual(0.5);

  // the old separate ∞ button is gone: the group holds the two arrows and the value, nothing else
  await expect(widget.getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Show (every layer|the whole world)$/ })).toHaveCount(0);

  // the whole world: ∞, nothing above it to raise
  await expect(output).toHaveText("∞");
  await expect(raise).toBeDisabled();
  await expect(output).toHaveAttribute("title", "Show the whole world");
  const wide = await width();

  // the first step down is the map's highest ground (the game's highest terrain, 22, at most)
  const top = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    return { ground: Math.max(...m.heights), hiding: window.dgm3d!.renderer.topHiding() + 1 };
  });
  expect(top.hiding).toBe(top.ground);
  expect(top.ground).toBeGreaterThan(10);
  const first = Math.min(22, top.ground);
  await lower.click();
  await expect(output).toHaveText(String(first));
  expect(await slice()).toBe(first);
  same(await width(), wide, `the width at the highest ground (${first}) against ∞`);

  // down to 9, one level a step; the width holds at 9
  for (let v = first - 1; v >= 9; v--) {
    await lower.click();
    await expect(output).toHaveText(String(v));
  }
  expect(await slice()).toBe(9);
  same(await width(), wide, "the width at 9 against ∞");

  // up, level by level, past the highest ground to 22, then ∞
  const seen: string[] = [];
  let at = "9";
  for (let guard = 0; guard < 30 && at !== "∞"; guard++) {
    const next = at === "22" ? "∞" : String(Number(at) + 1);
    await raise.click();
    await expect(output).toHaveText(next);
    seen.push(next);
    if (next === "22") same(await width(), wide, "the width at 22 against ∞");
    at = next;
  }
  expect(seen.slice(-2)).toEqual(["22", "∞"]);
  expect(seen).toEqual([...Array.from({ length: 13 }, (_, k) => String(10 + k)), "∞"]);
  expect(await slice()).toBeNull();
  same(await width(), wide, "the width back at ∞");
  await expect(raise).toBeDisabled();

  // a click on the value shows the whole world again, from any level
  await lower.click();
  await expect(output).toHaveText(String(first));
  await lower.click();
  await expect(output).toHaveText(String(first - 1));
  await output.click();
  await expect(output).toHaveText("∞");
  expect(await slice()).toBeNull();
  expect(errors).toEqual([]);
});
