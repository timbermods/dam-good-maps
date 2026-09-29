// One downscaled before/after comparison; intermediate screenshots stay in memory.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("../", import.meta.url));
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
  await ev("document.body.classList.add('capture'); window.erode.open('crater-wall-calibration')");
  await page.mouse.move(0, 0); await page.waitForTimeout(150);
  const before = await ev<{ cols: number[]; things: unknown[]; pose: unknown }>("window.erode.snapshot()");
  const images = [(await page.screenshot()).toString("base64")];
  await ev("window.erode.play(0, false)"); const low = await ready(); assert.equal(low.worn, 210);
  rows.push({ case: "wall-power-30-auto43", ...low });
  const after = await ev<typeof before>("window.erode.snapshot()");
  assert.deepEqual(after.pose, before.pose); assert.equal(await ev("window.erode.undoDepth"), 1);
  await ev("window.erode.quiet()"); await page.waitForTimeout(100); images.push((await page.screenshot()).toString("base64"));
  const comparison = await browser.newPage({ viewport: { width: 1200, height: 434 } });
  await comparison.setContent(`<style>*{box-sizing:border-box}body{margin:0;display:flex;background:#e9e6dd;color:#302e27;font:16px sans-serif}figure{margin:0;width:600px}figcaption{height:34px;padding:8px 12px}img{display:block;width:600px;height:400px}</style>` +
    images.map((image, i) => `<figure><figcaption>${i ? "After · 210 blocks worn" : "Before · Power 30 / Auto Size 43"}</figcaption><img src="data:image/png;base64,${image}"></figure>`).join(""));
  await comparison.locator("img").evaluateAll(async imgs => { await Promise.all(imgs.map(i => (i as HTMLImageElement).decode())); });
  await comparison.screenshot({ path: here + "captures/round9-wall.jpg", type: "jpeg", quality: 85 }); await comparison.close();
  await ev("window.erode.undo()"); assert.deepEqual(await ev("window.erode.snapshot()"), before);
  await page.locator("#redo").evaluate((e: HTMLButtonElement) => e.click()); assert.deepEqual(await ev("window.erode.snapshot()"), after);
  for (const [power, worn] of [[60, 443], [90, 747]]) {
    await ev(`window.erode.caseOf('crater-wall-calibration').power = ${power}; window.erode.open('crater-wall-calibration')`);
    await ev("window.erode.play(0, false)"); const result = await ready(); assert.equal(result.worn, worn); rows.push({ case: `wall-power-${power}`, ...result });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await ev("document.body.classList.remove('capture'); window.erode.open('crater-long-sweep')");
  await ev("window.erode.play(0, false)"); const long = await ready(); assert.equal(long.worn, 6597); rows.push({ case: "long-sweep-133-tiles", ...long });
  await ev("const c = window.erode.caseOf('crater-long-sweep'); c.points = [...c.points, ...c.points.slice().reverse(), ...c.points]; c.power = c.size = 100; window.erode.open(c.id)");
  await ev("window.erode.play(0, false)"); rows.push({ case: "longest-399-tiles-100-100", ...await ready() });
  await page.locator("#another").click(); await ready(); assert.equal(await ev("window.erode.undoDepth"), 1);
  await page.locator("#another").click(); await page.keyboard.press("Escape");
  assert.equal(await ev("window.erode.idle"), true); assert.equal(await ev("window.erode.undoDepth"), 0);
  assert.deepEqual(errors, []);
  const result = { result: "PASS", cases: rows, undoRedoEscTryAnother: "PASS", objectsRestored: "PASS", singleUndoStep: "PASS", cameraUnchanged: "PASS", pageErrors: errors };
  writeFileSync(here + "checks/round9-browser.json", JSON.stringify(result, null, 1) + "\n"); console.log(JSON.stringify(result));
} finally { await browser.close(); await server.close(); }
