// Kyler's review of the forces (PLAN §20 D226), through the page: Power and size are separate in
// every force (Carve's Width and Depth, Craterize's Size, Erupt's Size: each follows Power, Auto
// pressed, until its slider sets it by hand; Auto puts it back); every brush's options row shows its
// size, a number and a slider, as well as hold F; the shelf reads Water source, Badwater source,
// Start, Pine, then the rest.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

async function refine(page: Page) {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Top-down" }).click();
}

test("the shelf's order; every brush's size in its row, up to half the map (D322); each force's size follows Power until it is set by hand (D226)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page);

  // the shelf: Water source, Badwater source, Start, Pine, then the rest
  const names = await page.getByRole("navigation", { name: "Place" }).getByRole("button").allTextContents();
  expect(names.slice(0, 5).map((n) => n.trim())).toEqual(["Water source", "Badwater source", "Start", "Pine", "Birch"]);

  // every brush's row: its size, a number and a slider
  for (const [key, name] of [
    ["1", "Raise"],
    ["2", "Lower"],
    ["3", "Flatten"],
    ["4", "Smooth"],
    ["5", "Naturalize"],
  ] as const) {
    await page.keyboard.press(key);
    const row = page.getByRole("group", { name: `${name} options` });
    await expect(row.getByRole("slider", { name: "Size" })).toBeVisible();
    await expect(row.locator(".size-control output")).toHaveText(/^\d+(\.5)?$/);
  }
  // set on Lower's slider, a stroke is that size
  await page.keyboard.press("2");
  const lower = page.getByRole("group", { name: "Lower options" });
  await lower.getByRole("slider", { name: "Size" }).fill("8");
  await expect(lower.locator(".size-control output")).toHaveText("8");
  const i = await page.evaluate(() => window.dgmEditor!.info());
  const a = await client(page, Math.round(i.W * 0.3), Math.round(i.H * 0.3));
  const b = await client(page, Math.round(i.W * 0.3) + 6, Math.round(i.H * 0.3));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await idle(page);
  expect((await page.evaluate(() => window.dgmEditor!.lastStroke()))!.size).toBe(8);
  // the largest brush reaches half the map's width (D322, item 42): a Flatten of the whole map in
  // one click from its middle, square
  await page.keyboard.press("3");
  const flat = page.getByRole("group", { name: "Flatten options" });
  const big = String(Math.ceil(Math.max(i.W, i.H) / 2));
  await expect(flat.getByRole("slider", { name: "Size" })).toHaveAttribute("max", big);
  await flat.getByRole("slider", { name: "Size" }).fill(big);
  await flat.getByLabel("Square").check();
  await flat.getByRole("combobox", { name: "Target level" }).selectOption("6");
  const mid = await client(page, Math.floor(i.W / 2), Math.floor(i.H / 2));
  await page.mouse.click(mid.x, mid.y);
  await idle(page);
  expect((await page.evaluate(() => window.dgmEditor!.lastStroke()))!.size).toBe(Number(big));
  const hs = await page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
  expect(hs.filter((h) => h === 6).length).toBeGreaterThan(hs.length * 0.95);
  await page.keyboard.press("Control+z");
  await idle(page);
  await flat.getByLabel("Square").uncheck();
  await flat.getByRole("slider", { name: "Size" }).fill("5");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("2");

  // each force's size: following Power (Auto pressed); the slider sets it by hand; Auto puts it back
  for (const [key, rowName, sizes] of [
    ["7", "Carve options", ["Size"]],
    ["8", "Craterize options", ["Size"]],
    ["0", "Erupt options", ["Size"]],
  ] as const) {
    await page.keyboard.press(key);
    const row = page.getByRole("group", { name: rowName });
    for (const size of sizes) {
      const auto = row.getByRole("button", { name: `${size} follows Power` });
      const slider = row.getByRole("slider", { name: size });
      await expect(auto).toHaveAttribute("aria-pressed", "true");
      const was = await slider.inputValue();
      // (Power moves a size that follows it)
      await row.getByRole("slider", { name: "Power" }).fill("100");
      await expect(slider).not.toHaveValue(was);
      await row.getByRole("slider", { name: "Power" }).fill("50");
      const max = Number(await slider.getAttribute("max"));
      const min = Number(await slider.getAttribute("min"));
      const step = Number(await slider.getAttribute("step"));
      const set = String(min + Math.round((max - min) / 3 / step) * step);
      await slider.fill(set);
      await expect(auto).toHaveAttribute("aria-pressed", "false");
      await expect(slider).toHaveValue(set);
      // set by hand, Power leaves it alone
      await row.getByRole("slider", { name: "Power" }).fill("90");
      await expect(slider).toHaveValue(set);
      await auto.click();
      await expect(auto).toHaveAttribute("aria-pressed", "true");
    }
    await page.keyboard.press(key);
  }
  expect(errors).toEqual([]);
});
