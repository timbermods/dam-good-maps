// Only the requested downscaled before/after pair and one short GIF enter git.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { fileURLToPath } from "node:url";
import { encodeGif } from "./gif";

const here = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(here + "local", { recursive: true });
const port = await new Promise<number>(resolve => {
  const s = netServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
});
process.env.ERODE_PORT = String(port);
const { createServer } = await import("vite");
const server = await createServer({ configFile: here + "vite.config.ts", root: here, logLevel: "warn", cacheDir: here + "local/vite-cache" });
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors: string[] = [], rows: unknown[] = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => m.type() === "error" && errors.push(m.text()));
const ev = <T>(js: string) => page.evaluate(js) as Promise<T>;
const ready = async () => {
  await page.waitForFunction("window.erode.idle", undefined, { timeout: 30000 });
  const last = await ev<{ worn: number; dropped: number; finalMs: number }>("window.erode.last");
  assert.equal(last.dropped, 0); assert.ok(last.finalMs <= 2100, `land took ${last.finalMs} ms`);
  return last;
};
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("body[data-ready='1']", { timeout: 120000 });
  await ev("document.body.classList.add('capture'); window.erode.open('crater-long-sweep')");
  await page.mouse.move(0, 0); await page.waitForTimeout(150);
  const before = await ev<{ cols: number[]; things: unknown[]; pose: unknown }>("window.erode.snapshot()");
  await page.screenshot({ path: here + "captures/round8-before.jpg", type: "jpeg", quality: 85 });
  await ev("window.erode.play(0, false)"); rows.push({ case: "kyler-133-tiles-72-auto68", ...await ready() });
  const after = await ev<typeof before>("window.erode.snapshot()");
  assert.deepEqual(after.pose, before.pose, "Erode moved the camera");
  assert.equal(await ev("window.erode.undoDepth"), 1);
  await ev("window.erode.quiet()"); await page.waitForTimeout(100);
  await page.screenshot({ path: here + "captures/round8-after.jpg", type: "jpeg", quality: 85 });
  await ev("window.erode.undo()"); assert.deepEqual(await ev("window.erode.snapshot()"), before);
  await page.locator("#redo").evaluate((e: HTMLButtonElement) => e.click());
  assert.deepEqual(await ev("window.erode.snapshot()"), after);
  // Stress the real worker, mesher, relight, objects and animation at the largest settings.
  await page.setViewportSize({ width: 1280, height: 800 });
  await ev(`document.body.classList.remove('capture');
    window.round8Original = structuredClone(window.erode.caseOf('crater-long-sweep'));
    const c = window.erode.caseOf('crater-long-sweep');
    c.points = [...c.points, ...c.points.slice().reverse(), ...c.points]; c.power = c.size = 100;
    window.erode.open(c.id)`);
  for (let k = 0; k < 3; k++) {
    await ev("window.erode.open('crater-long-sweep');");
    await ev("window.erode.play(0, false)"); rows.push({ case: "longest-399-tiles-100-100", ...await ready() });
  }
  assert.equal(await ev("window.erode.busy"), true);
  await page.locator("#another").click(); await ready();
  assert.equal(await ev("window.erode.undoDepth"), 1);
  await page.locator("#another").click(); await page.keyboard.press("Escape");
  assert.equal(await ev("window.erode.idle"), true);
  assert.equal(await ev("window.erode.undoDepth"), 0);
  await ev("Object.assign(window.erode.caseOf('crater-long-sweep'), window.round8Original); document.body.classList.add('capture'); window.erode.open('crater-long-sweep')");
  await page.setViewportSize({ width: 640, height: 420 });
  await page.waitForTimeout(150); await page.mouse.move(0, 0);
  await ev("window.erode.manual(true); window.erode.step(1)");
  const frames: Uint8Array[] = [];
  const frame = async () => {
    const png = (await page.screenshot()).toString("base64");
    const pixels = await page.evaluate(async data => {
      const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
      const c = document.createElement("canvas"); c.width = 640; c.height = 420;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(0, 0, 640, 420).data);
    }, png);
    frames.push(Uint8Array.from(pixels));
  };
  await frame(); await ev("window.erode.play(0, false)");
  await page.waitForFunction("!window.erode.planning");
  for (let k = 0; k < 22; k++) { await ev("window.erode.step(80)"); await frame(); }
  const gif = encodeGif(640, 420, frames, 8);
  assert.ok(gif.length < 3_000_000); writeFileSync(here + "captures/round8-sweep.gif", gif);
  assert.deepEqual(errors, []);
  const result = { result: "PASS", note: "128², installed Chrome; gesture release through worker, animation and final view update; longest repeated three times",
    cases: rows, undoRedoEscTryAnother: "PASS", singleUndoStep: "PASS", objectsRestored: "PASS", cameraUnchanged: "PASS", gifBytes: gif.length, pageErrors: errors };
  writeFileSync(here + "checks/round8-browser.json", JSON.stringify(result, null, 1) + "\n");
  console.log(JSON.stringify(result));
} finally { await browser.close(); await server.close(); }
