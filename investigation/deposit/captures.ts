import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { CASES } from "./maps";
import { pathLength } from "../../src/core/forces/path";
import type {} from "./app";
import type { Settings, Intent } from "./deposit";
const url = process.env.DEPOSIT_URL ?? "http://127.0.0.1:5177";
mkdirSync("captures", { recursive: true }); mkdirSync("local/frames", { recursive: true }); mkdirSync("checks", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 854 }, deviceScaleFactor: 1 });
const errors: string[] = [];
const responses: string[] = [];
page.on("response", r => { if (r.status() >= 400 && !r.url().endsWith("favicon.ico")) responses.push(`${r.status()} ${r.url()}`); });
page.on("pageerror", e => errors.push(String(e)));
await page.goto(url); await page.waitForFunction(() => window.deposit?.ready());
await page.locator("#sound").uncheck();
const signature = () => page.evaluate(() => {
  const m = window.deposit.state().map;
  return JSON.stringify({ ...m, heights: [...m.heights], lava: [...m.lava], water: { depth: [...m.water.depth], contamination: [...m.water.contamination] } });
});
const timings: { case: string; plannedMs: number; finalMs: number; frames: number }[] = [];
async function jpeg(path: string): Promise<void> {
  const encoded = (await page.screenshot({ type: "png" })).toString("base64");
  const resized = await page.evaluate(async encoded => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: "image/png" }));
    const canvas = new OffscreenCanvas(960, 640), ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, 960, 640); bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: .76 });
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, encoded);
  writeFileSync(path, Buffer.from(resized, "base64"));
}
for (let index = 0; index < CASES.length; index++) {
  const c = CASES[index];
  await page.evaluate(i => window.deposit.choose(i), index);
  await jpeg(`captures/${c.id}-before.jpg`);
  const before = await signature();
  const cameraBefore = await page.evaluate(() => window.deposit.screen({x:64,y:64}));
  await page.locator("#example").click();
  await page.waitForFunction(() => !window.deposit.state().active && window.deposit.metrics.waterDone, { timeout: 30000 });
  const m = await page.evaluate(() => window.deposit.metrics);
  timings.push({ case: c.id, plannedMs: +m.plannedMs.toFixed(1), finalMs: +m.finalMs.toFixed(1), frames: m.renderedFrames });
  assert(m.settled, "water really converged");
  assert(m.finalMs < 2200, "Fast within about two seconds");
  assert.deepEqual(await page.evaluate(() => window.deposit.screen({x:64,y:64})), cameraBefore, "camera stays fixed");
  await jpeg(`captures/${c.id}-after.jpg`);
  await page.locator("#undo").click(); assert.equal(await signature(), before, "browser undo is exact");
}
// Actual freehand pointer: a band while drawing, cancelled by Escape without a map mutation.
await page.evaluate(() => window.deposit.choose(0));
const initial = await signature();
const stroke = [{ x: 88, y: 43 }, { x: 93, y: 57 }, { x: 93, y: 75 }, { x: 106, y: 92 }];
const screen = await page.evaluate(ps => ps.map(p => window.deposit.screen(p)), stroke);
await page.mouse.move(screen[0].x, screen[0].y); await page.mouse.down();
for (const point of screen.slice(1)) await page.mouse.move(point.x, point.y, { steps: 8 });
assert((await page.locator("#status").innerText()).includes("Draw the fan"));
await page.keyboard.press("Escape"); await page.mouse.up();
assert.equal(await signature(), initial, "Esc drawing cancels");
// A freehand stroke commits one step; undo during planning/playback cancels late worker messages.
await page.mouse.move(screen[0].x, screen[0].y); await page.mouse.down();
for (const point of screen.slice(1)) await page.mouse.move(point.x, point.y, { steps: 6 });
await page.mouse.up(); await page.locator("#undo").click();
await page.waitForTimeout(250);
assert.equal(await signature(), initial, "undo mid-force and no late mutation");
for (const watch of [false, true]) {
  await page.evaluate(watch => window.deposit.set({}, watch),watch);
  await page.locator("#example").click();
  await page.waitForFunction(() => window.deposit.metrics.renderedFrames > 0 && window.deposit.state().active);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.deposit.state().active);
  assert.equal(await page.evaluate(() => window.deposit.state().history), 1, "Esc skips, one undo step");
  await page.locator("#undo").click(); assert.equal(await signature(), initial);
}
// Completed Try another replaces the operation, rather than stacking both alternatives.
await page.evaluate(() => window.deposit.set({}, false));
await page.locator("#example").click(); await page.waitForFunction(() => window.deposit.metrics.waterDone);
const firstResult = await signature(), firstSeed = await page.evaluate(() => window.deposit.metrics.lastSeed);
await page.locator("#again").click(); await page.waitForFunction(() => window.deposit.metrics.waterDone);
assert.notEqual(await signature(), firstResult, "Try another yields different land");
assert.equal(await page.evaluate(() => window.deposit.metrics.lastSeed), firstSeed + 1);
assert.equal(await page.evaluate(() => window.deposit.state().history), 1);
await page.locator("#undo").click(); assert.equal(await signature(), initial);
// Keys expose the numbers; F + drag changes Size and braces change sediment supply.
await page.evaluate(() => window.deposit.set({ size: 22 }));
const power = await page.locator("#powerValue").innerText(); await page.keyboard.press("}");
assert.notEqual(await page.locator("#powerValue").innerText(), power);
await page.keyboard.down("f"); await page.mouse.move(440, 350); await page.mouse.down(); await page.mouse.move(480, 350, { steps: 5 }); await page.mouse.up(); await page.keyboard.up("f");
assert.equal(await page.evaluate(() => window.deposit.state().settings.size), 30);
await page.locator("#more").click(); await page.locator("#channels").selectOption("many");
assert.equal(await page.evaluate(() => window.deposit.state().settings.channels),"many");
await page.locator("#floor").fill("3"); await page.locator("#floor").dispatchEvent("change");
assert.equal(await page.evaluate(() => window.deposit.state().settings.floor), 3);
await page.locator("#floorDefault").click(); await page.locator("#channels").selectOption("auto"); await page.locator("#more").click();
// A long 128² serpentine, over 1,000 tiles, not just the relatively short sample curve.
await page.evaluate(() => window.deposit.choose(2));
const long = Array.from({ length: 20 }, (_, k) => ({ x: k % 2 ? 120 : 7, y: 6 + Math.floor(k / 2) * 12 }));
await page.evaluate(ps => { window.deposit.set({ power: 100, size: 64 }, false); void window.deposit.run({ path: ps }); }, long);
await page.waitForFunction(() => !window.deposit.state().active && window.deposit.metrics.waterDone, { timeout: 30000 });
const longest = await page.evaluate(() => window.deposit.metrics);
assert(longest.settled, "largest gesture water converged");
assert(longest.finalMs < 2200, "longest Deposit Fast");
// Exercise the actual worker past PreviewJob's original cap. A capped lake must keep flowing.
const regressions=JSON.parse(readFileSync("checks/water-regressions.json","utf8")) as {seed:number;s:Settings;intent:Intent}[];
const waterContinuation=[];
for(const f of regressions) {
  await page.evaluate(() => window.deposit.choose(2)); const before=await signature();
  await page.evaluate(f => {window.deposit.set({...f.s,seed:f.seed-1},false);void window.deposit.run(f.intent);},f);
  await page.waitForFunction(() => window.deposit.metrics.waterDone);
  const result=await page.evaluate(() => ({...window.deposit.metrics,ticks:window.deposit.state().waterTicks}));
  assert(result.settled && result.ticks>3072,"continued worker water really converges");
  assert(result.finalMs<2200,"slow water does not delay final land");
  const old=JSON.parse(before),after=JSON.parse(await signature());
  for(const e of old.entities.filter((e:{template:string})=>/Source|Seep/.test(e.template))) {
    const actual=after.entities.find((a:{id:string})=>a.id===e.id)!;
    assert.deepEqual(actual.components,e.components,"source strengths unchanged");
    assert.equal(actual.z-e.z,after.heights[e.y*128+e.x]-old.heights[e.y*128+e.x],"sources ride ground");
  }
  assert(await page.evaluate(() => {
    const m=window.deposit.state().map,e=m.entities.find(e=>e.template==='StartingLocation')!;
    for(let y=e.y;y<e.y+3;y++)for(let x=e.x;x<e.x+3;x++)if(m.heights[y*m.W+x]!==e.z||m.water.depth[y*m.W+x]>.05)return false;
    return true;
  }),"continued water leaves a valid start");
  waterContinuation.push({seed:f.seed,ticks:result.ticks,finalMs:+result.finalMs.toFixed(1)});
  await page.locator("#undo").click();assert.equal(await signature(),before,"undo after continued water");
}
// One small Watch GIF. Bulk frames stay ignored.
await page.evaluate(() => window.deposit.choose(2));
await page.evaluate(() => window.deposit.set({}, true));
const encoder = GIFEncoder();
async function gifFrame(delay: number): Promise<void> {
  const png = PNG.sync.read(await page.locator("#land").screenshot({ type: "png" }));
  const width = 520, height = Math.round(png.height * width / png.width), rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (Math.floor(y * png.height / height) * png.width + Math.floor(x * png.width / width)) * 4;
    rgba.set(png.data.subarray(i, i + 4), (y * width + x) * 4);
  }
  const palette = quantize(rgba, 48);
  encoder.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay, repeat: 0 });
}
await gifFrame(500); await page.locator("#example").click();
for (let k = 0; k < 24; k++) { await page.waitForTimeout(260); await gifFrame(260); }
await page.keyboard.press("Escape"); await page.waitForFunction(() => window.deposit.metrics.waterDone); await gifFrame(1200);
encoder.finish(); writeFileSync("captures/deposit.gif", encoder.bytes());
assert.deepEqual(errors, [], "no browser errors");
assert.deepEqual(responses, [], "no failed asset requests");
const result = { browser: "headless Microsoft Edge", viewport: "1280×854", captures: "960×640, downscaled", timings,
  longest: { points: 20, strokeLength: +pathLength(long).toFixed(1), reachCap: 112, plannedMs: +longest.plannedMs.toFixed(1), finalMs: +longest.finalMs.toFixed(1) },
  waterContinuation,
  checks: ["real pointer band", "Esc drawing", "undo mid-force", "Esc Fast and Watch finish", "one undo step", "byte-exact undo", "Try another replacement", "F size", "brace power", "Floor / Channels controls", "water convergence", "fixed camera", "water continuation in actual worker", "source strength / riding", "start after continued water"], errors };
writeFileSync("checks/browser.json", JSON.stringify(result, null, 2) + "\n"); console.log(result);
await browser.close();
