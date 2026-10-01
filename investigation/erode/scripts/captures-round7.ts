// Three downscaled stills and one short collapse GIF; only small summaries enter git.
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
  const last = await ev<{ worn: number; dropped: number; finalMs: number; roof: string }>("window.erode.last");
  assert.equal(last.dropped, 0); assert.ok(last.finalMs <= 1100, `land took ${last.finalMs} ms`);
  return last;
};
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("body[data-ready='1']", { timeout: 120000 });
  await ev("document.body.classList.add('capture')");
  for (const id of ["roof-skylight", "roof-bridge", "roof-dome"]) {
    await ev(`window.erode.open('${id}')`);
    const before = await ev<{ cols: number[]; things: unknown[]; pose: unknown }>("window.erode.snapshot()");
    await ev("window.erode.play(0, false)");
    rows.push({ case: id, ...await ready() });
    const after = await ev<typeof before>("window.erode.snapshot()");
    assert.deepEqual(after.pose, before.pose, "Erode moved the camera");
    await ev("window.erode.quiet()");
    await page.screenshot({ path: here + `captures/round7-${id}.jpg`, type: "jpeg", quality: 85 });
    await ev("window.erode.undo()");
    assert.deepEqual(await ev("window.erode.snapshot()"), before, "undo missed terrain or objects");
    await page.locator("#redo").evaluate((e: HTMLButtonElement) => e.click());
    assert.deepEqual(await ev("window.erode.snapshot()"), after, "redo missed terrain or objects");
  }
  // Real pointer rays must reach the top and underside, retaining their face normal.
  for (const [id, x, y, z, expected] of [["roof-skylight", 63.5, 53.5, 12, "roof"], ["roof-dome", 64.5, 60.5, 10, "ceiling"]] as const) {
    await ev(`window.erode.open('${id}')`);
    const screen = await ev<{ x: number; y: number }>(`window.erode.screenOf(${x}, ${y}, ${z})`);
    await page.mouse.click(screen.x, screen.y);
    assert.equal((await ready()).roof, expected, "pointer chose the wrong rock face");
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await ev("document.body.classList.remove('capture'); window.erode.open('roof-bridge')");
  await ev("window.erode.play(0, false)"); await ready();
  assert.equal(await ev("window.erode.busy"), true);
  await page.locator("#another").click(); await ready();
  await page.locator("#another").click();
  await page.keyboard.press("Escape");
  assert.equal(await ev("window.erode.idle"), true);
  assert.equal(await ev("window.erode.undoDepth"), 0);
  // Manual clock keeps a short GIF reproducible. RGBA frames stay in memory, never in git.
  await ev("document.body.classList.add('capture'); window.erode.open('roof-bridge')");
  await page.setViewportSize({ width: 640, height: 420 });
  await page.waitForTimeout(150); // let resize finish before taking over the render clock
  await page.mouse.move(0, 0);
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
  assert.ok(gif.length < 3_000_000);
  writeFileSync(here + "captures/round7-collapse.gif", gif);
  assert.deepEqual(errors, []);
  const result = { result: "PASS", cases: rows, pointerTopAndCeiling: "PASS", undoRedoEscTryAnother: "PASS",
    objectsRestored: "PASS", cameraUnchanged: "PASS", gifBytes: gif.length, pageErrors: errors };
  writeFileSync(here + "checks/round7-browser.json", JSON.stringify(result, null, 1) + "\n");
  console.log(JSON.stringify(result));
} finally { await browser.close(); await server.close(); }
