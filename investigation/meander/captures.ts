import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { CASES } from "./maps";
import { pathLength } from "../../src/core/forces/path";
import type {} from "./app";
const url = process.env.MEANDER_URL ?? "http://127.0.0.1:5178";
mkdirSync("captures", { recursive: true });
mkdirSync("local/frames", { recursive: true });
mkdirSync("checks", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on("pageerror", e => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => window.meander?.ready());
await page.locator("#sound").uncheck();
const signature = () => page.evaluate(() => {
  const m = window.meander.state().map;
  return JSON.stringify({ ...m, heights: [...m.heights], lava: [...m.lava], water: { depth: [...m.water.depth], contamination: [...m.water.contamination] } });
});
const timings: {
  case: string;
  plannedMs: number;
  finalMs: number;
  frames: number;
  stats: unknown;
}[] = [];
for (let index = 0; index < CASES.length; index++) {
  const c = CASES[index];
  await page.evaluate(i => window.meander.choose(i), index);
  await page.screenshot({ path: `captures/${c.id}-before.jpg`, type: "jpeg", quality: 76 });
  const before = await signature();
  await page.locator("#example").click();
  await page.waitForFunction(() => !window.meander.state().active && window.meander.metrics.settled, { timeout: 30000 });
  const m = await page.evaluate(() => window.meander.metrics);
  timings.push({ case: c.id, plannedMs: +m.plannedMs.toFixed(1), finalMs: +m.finalMs.toFixed(1), frames: m.renderedFrames, stats: m.lastStats });
  assert(m.finalMs < 2200, "Fast within about two seconds");
  await page.screenshot({ path: `captures/${c.id}-after.jpg`, type: "jpeg", quality: 76 });
  await page.locator("#undo").click();
  assert.equal(await signature(), before, "browser undo is exact");
}
// Actual freehand pointer: a band while drawing, cancelled by Escape without a map mutation.
await page.evaluate(() => window.meander.choose(0));
const initial = await signature();
const stroke = await page.evaluate(() => window.meander.route().slice(-14, -7));
const screen = await page.evaluate(ps => ps.map(p => window.meander.screen(p)), stroke);
await page.mouse.move(screen[0].x, screen[0].y);
await page.mouse.down();
for (const point of screen.slice(1)) {
  await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.waitForTimeout(30);
}
assert((await page.locator("#status").innerText()).includes("Age this river"));
await page.keyboard.press("Escape");
await page.mouse.up();
assert.equal(await signature(), initial, "Esc drawing cancels");
// A freehand stroke commits one step; undo during planning/playback cancels late worker messages.
await page.mouse.move(screen[0].x, screen[0].y);
await page.mouse.down();
for (const point of screen.slice(1)) {
  await page.mouse.move(point.x, point.y, { steps: 6 });
  await page.waitForTimeout(30);
}
await page.mouse.up();
await page.locator("#undo").click();
await page.waitForTimeout(250);
assert.equal(await signature(), initial, "undo mid-force and no late mutation");
await page.evaluate(() => window.meander.set({}, true));
await page.locator("#example").click();
await page.waitForFunction(() => window.meander.metrics.renderedFrames > 0 && window.meander.state().active);
await page.keyboard.press("Escape");
await page.waitForFunction(() => !window.meander.state().active);
assert.equal(await page.evaluate(() => window.meander.state().history), 1, "Esc skips, one undo step");
await page.locator("#undo").click();
assert.equal(await signature(), initial);
// Completed Try another replaces the operation, rather than stacking both alternatives.
await page.evaluate(() => window.meander.set({}, false));
await page.locator("#example").click();
await page.waitForFunction(() => window.meander.metrics.settled);
const firstResult = await signature(), firstSeed = await page.evaluate(() => window.meander.metrics.lastSeed);
await page.locator("#again").click();
await page.waitForFunction(() => window.meander.metrics.settled);
assert.notEqual(await signature(), firstResult, "Try another yields different land");
assert.equal(await page.evaluate(() => window.meander.metrics.lastSeed), firstSeed + 1);
assert.equal(await page.evaluate(() => window.meander.state().history), 1);
await page.locator("#undo").click();
assert.equal(await signature(), initial);
// Keys expose the numbers; F + drag changes width and braces change drop.
const power = await page.locator("#powerValue").innerText();
await page.keyboard.press("}");
assert.notEqual(await page.locator("#powerValue").innerText(), power);
await page.evaluate(() => window.meander.set({ size: 20 }));
await page.keyboard.down("f");
await page.mouse.move(440, 350);
await page.mouse.down();
await page.mouse.move(480, 350, { steps: 5 });
await page.mouse.up();
await page.keyboard.up("f");
assert.equal(await page.evaluate(() => window.meander.state().settings.size), 28);
await page.locator("#more").click();
await page.locator("#bends").selectOption("broad");
await page.locator("#floor").fill("3");
await page.locator("#floor").dispatchEvent("change");
assert.equal(await page.evaluate(() => window.meander.state().settings.floor), 3);
await page.locator("#floorDefault").click();
await page.locator("#bends").selectOption("auto");
await page.locator("#more").click();
// The largest valid gesture: the whole existing river, at maximum Power and click Size.
await page.evaluate(() => window.meander.choose(2));
const long = await page.evaluate(() => window.meander.route().slice(4, -4));
await page.evaluate(ps => { window.meander.set({ power: 100, size: 64 }, false); void window.meander.run({ path: ps }); }, long);
await page.waitForFunction(() => !window.meander.state().active && window.meander.metrics.settled, { timeout: 30000 });
const longest = await page.evaluate(() => window.meander.metrics);
assert(longest.finalMs < 2400, "longest Meander Fast");
// One small Watch GIF; all of migration and the cutoff are recorded. Bulk frames stay ignored.
await page.evaluate(() => window.meander.choose(2));
await page.evaluate(() => window.meander.set({}, true));
const encoder = GIFEncoder();
async function gifFrame(delay: number): Promise<void> {
  const png = PNG.sync.read(await page.locator("#land").screenshot({ type: "png" }));
  const width = 600, height = Math.round(png.height * width / png.width), rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (Math.floor(y * png.height / height) * png.width + Math.floor(x * png.width / width)) * 4;
      rgba.set(png.data.subarray(i, i + 4), (y * width + x) * 4);
    }
  const palette = quantize(rgba, 64);
  encoder.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay, repeat: 0 });
}
await gifFrame(500);
await page.locator("#example").click();
for (let k = 0; k < 22; k++) {
  await page.waitForTimeout(350);
  await gifFrame(300);
}
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.meander.metrics.settled);
await gifFrame(1200);
assert.equal(await page.evaluate(() => window.meander.metrics.lastStats?.oxbows), 1, 'GIF shows an actual cutoff');
encoder.finish();
writeFileSync("captures/meander.gif", encoder.bytes());
assert.deepEqual(errors, [], "no browser errors");
const result = { browser: "headless Microsoft Edge", viewport: "960×640", timings,
  longest: { points: long.length, lengthTiles: +pathLength(long).toFixed(1), plannedMs: +longest.plannedMs.toFixed(1), finalMs: +longest.finalMs.toFixed(1) },
  checks: ["real pointer band", "Esc drawing", "undo mid-force", "Esc Watch finish", "one undo step", "byte-exact undo", "Try another replacement", "F size", "brace power", "Floor / Bends controls", "water settled"], errors };
writeFileSync("checks/browser.json", JSON.stringify(result, null, 2) + "\n");
console.log(result);
await browser.close();
