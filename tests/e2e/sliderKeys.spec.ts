// A slider that was just dragged keeps only the keys that move it (the arrows, Home, End, Page Up and Down): undo, Esc and
// the tool keys still reach the page, as they do after a button or the map was clicked.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, topDown } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);

async function stroke(page: Page, a: [number, number], b: [number, number]) {
  const p = await client(page, ...a);
  const q = await client(page, ...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let k = 1; k <= 20; k++) await page.mouse.move(p.x + ((q.x - p.x) * k) / 20, p.y + ((q.y - p.y) * k) / 20);
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
}

/** Drag the bar's Size slider across part of its length, leaving the focus on it. */
async function dragSize(page: Page, tool: string) {
  const slider = page.getByRole("group", { name: `${tool} options` }).getByRole("slider", { name: "Size" });
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(slider).toBeFocused();
}

test("after a slider is dragged, Ctrl+Z undoes the last edit and Esc puts the tool away", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await topDown(page);
  const W = (await info(page)).W;
  const start = (await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] };
  const at: [number, number] = start.position[0] < W / 2 ? [70, 30] : [20, 30];
  const bar = page.getByRole("toolbar", { name: "Tools" });
  const raise = bar.getByRole("button", { name: "Raise brush (2)" });

  await page.keyboard.press("2");
  await expect(raise).toHaveAttribute("aria-pressed", "true");
  await stroke(page, at, [at[0] + 8, at[1]]);
  const applied = async () => (await info(page)).history.filter((h) => h.applied).length;
  expect(await applied()).toBe(1);

  // the slider has the focus: Ctrl+Z takes the stroke back
  await dragSize(page, "Raise");
  await page.keyboard.press("Control+z");
  await expect.poll(applied).toBe(0);

  // and Esc puts the tool away, the slider still focused
  await dragSize(page, "Raise");
  await page.keyboard.press("Escape");
  await expect(raise).toHaveAttribute("aria-pressed", "false");

  // a tool key picks its tool from the slider too
  await page.keyboard.press("2");
  await dragSize(page, "Raise");
  await page.keyboard.press("3");
  await expect(raise).toHaveAttribute("aria-pressed", "false");
});
