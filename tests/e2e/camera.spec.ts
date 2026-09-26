// The camera keys (Timberborn's): held, WASD moves the camera every frame, easing in and gliding to
// a stop; Q and E turn it; Shift is faster; nothing moves while typing in a field.

import { expect, test, type Page } from "@playwright/test";

const view = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.getView());

test("held camera keys move the view every frame and glide to a stop; typing moves nothing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });

  // D held: the target moves in many small steps, not a few jumps
  const v0 = await view(page);
  const xs: number[] = [];
  await page.keyboard.down("d");
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(40);
    xs.push((await view(page)).target[0]);
  }
  await page.keyboard.up("d");
  // (a key's repeats would give one or two jumps; under a busy machine a frame can stretch, so
  // five of the twelve samples must differ)
  const distinct = new Set(xs.map((x) => x.toFixed(3))).size;
  expect(distinct).toBeGreaterThanOrEqual(5);
  // it glides to a stop, then stays
  await page.waitForTimeout(500);
  const stopped = await view(page);
  await page.waitForTimeout(200);
  expect((await view(page)).target).toEqual(stopped.target);
  expect(stopped.target).not.toEqual(v0.target);

  // Shift is faster (the same hold with and without it; a machine busy with another test can
  // stretch a frame and cut one hold short, so the pair is tried up to three times)
  const d = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[2] - q[2]);
  let ratio = 0;
  for (let k = 0; k < 3 && ratio <= 1.5; k++) {
    const a0 = (await view(page)).target;
    await page.keyboard.down("w");
    await page.waitForTimeout(400);
    await page.keyboard.up("w");
    await page.waitForTimeout(400);
    const a1 = (await view(page)).target;
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await page.waitForTimeout(400);
    await page.keyboard.up("s");
    await page.keyboard.up("Shift");
    await page.waitForTimeout(400);
    const a2 = (await view(page)).target;
    ratio = d(a1, a2) / Math.max(1e-6, d(a0, a1));
  }
  expect(ratio).toBeGreaterThan(1.5);

  // Q turns the 3D view
  const yaw = (await view(page)).yaw;
  await page.keyboard.down("q");
  await page.waitForTimeout(300);
  await page.keyboard.up("q");
  await page.waitForTimeout(300);
  expect((await view(page)).yaw).toBeGreaterThan(yaw);

  // typing in a field or choosing from a list moves nothing (a toggle just clicked does not hold the
  // keys: the camera moves on)
  await page.keyboard.press("3");
  const toggle = page.getByRole("group", { name: "Flatten options" }).getByLabel("Square");
  await toggle.focus();
  const t1 = (await view(page)).target;
  await page.keyboard.down("d");
  await page.waitForTimeout(300);
  await page.keyboard.up("d");
  await page.waitForTimeout(300);
  expect((await view(page)).target).not.toEqual(t1);
  const field = page.getByRole("group", { name: "Flatten options" }).getByRole("combobox", { name: "Flatten level" });
  await field.focus();
  const t0 = (await view(page)).target;
  await page.keyboard.down("d");
  await page.waitForTimeout(300);
  await page.keyboard.up("d");
  await page.waitForTimeout(300);
  expect((await view(page)).target).toEqual(t0);
  expect(errors).toEqual([]);
});
