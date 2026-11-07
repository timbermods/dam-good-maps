// File → Record a time-lapse… (D205, D285 (4)): a short history recorded at a small size gives a playable WebM whose
// frames are the plan's, every one of them, and whose length is their count at 30 a second (read from the file
// itself, never timed); the replay ends as the map itself; Cancel stops a recording and closes the dialog; a map
// with no edits says there is nothing to replay. The camera, the pacing and the look are chosen by eye (unit tests
// hold the plan and the camera: tests/unit/timelapse.test.ts).

import { expect, test, type Page } from "@playwright/test";
import { webmFacts } from "../../src/editor/timelapse/webm";
import { openEditor, openFileMenu } from "./open";

const MAP = "s=7&z=64&d=n&t=riverValley";

async function edit(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const e = window.dgmEditor!;
    const rows = (y0: number, y1: number, x0: number, x1: number) => Array.from({ length: y1 - y0 + 1 }, (_, k) => [y0 + k, x0, x1]);
    await e.edit({ op: "sculpt", params: { mode: "flatten", cells: rows(12, 18, 12, 20), level: 14 } } as never, "Raise a hill");
    await e.edit({ op: "placeEntity", params: { id: crypto.randomUUID(), template: "SmallRelic", x: 30, y: 30, orientation: "Cw0" } } as never, "Place a relic");
    await e.edit({ op: "sculpt", params: { mode: "lower", cells: rows(40, 44, 36, 44), amount: 2 } } as never, "Dig");
    await e.idle();
  });
}

async function record(page: Page): Promise<void> {
  const menu = await openFileMenu(page);
  await menu.getByRole("menuitem", { name: /Record a time-lapse/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("a short history records as a playable WebM of every planned frame", async ({ page }) => {
  await openEditor(page, MAP);
  await page.evaluate(() => (window.dgmLapseTest = { width: 320, height: 180 }));
  await edit(page);
  await record(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Download video" })).toBeVisible({ timeout: 150_000 });

  const made = await page.evaluate(async () => {
    const l = window.dgmLapse!;
    const b = new Uint8Array(await l.blob.arrayBuffer());
    let s = "";
    for (let k = 0; k < b.length; k += 0x8000) s += String.fromCharCode(...b.subarray(k, k + 0x8000));
    return { ...l, blob: undefined, base64: btoa(s) };
  });
  expect(made.same).toBe(true);
  expect(made.frames).toBe(made.planned);
  expect([made.width, made.height]).toEqual([320, 180]);
  const facts = webmFacts(new Uint8Array(Buffer.from(made.base64, "base64")));
  expect(facts.codec).toMatch(/^V_VP[89]$/);
  expect([facts.width, facts.height]).toEqual([320, 180]);
  expect(facts.frames).toBe(made.planned);
  expect(facts.keyFrames).toBeGreaterThanOrEqual(1);
  expect(facts.durationMs).toBeCloseTo((made.planned * 1000) / 30, 0);

  // the browser plays it: its length read from the file, and its last frame decoded
  const played = await page.evaluate(async () => {
    const v = document.querySelector<HTMLVideoElement>(".lapse-video")!;
    if (v.readyState < 1) await new Promise((done) => v.addEventListener("loadedmetadata", done, { once: true }));
    v.currentTime = Math.max(0, v.duration - 0.05);
    await new Promise((done) => v.addEventListener("seeked", done, { once: true }));
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, paused: v.paused };
  });
  expect(played.width).toBe(320);
  expect(played.height).toBe(180);
  expect(played.duration).toBeCloseTo(facts.durationMs / 1000, 1);
  // (nothing plays until the player presses play)
  expect(played.paused).toBe(true);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("Cancel stops a recording; a map with no edits has nothing to replay", async ({ page }) => {
  await openEditor(page, MAP);
  await record(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Nothing to replay yet");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  await page.evaluate(() => (window.dgmLapseTest = { width: 320, height: 180 }));
  await edit(page);
  await record(page);
  await expect(dialog).toContainText(/Replaying the map's history|Recording the time-lapse/);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  // (the map is as it was: its history untouched)
  expect(await page.evaluate(() => window.dgmEditor!.info().history.filter((h) => h.applied).length)).toBe(3);
  expect(await page.evaluate(() => window.dgmLapse)).toBeUndefined();
});
