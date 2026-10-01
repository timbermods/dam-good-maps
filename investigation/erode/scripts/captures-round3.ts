// Only the four Round 3 views; also time the largest checked Auto wash at 128².
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => m.type() === "error" && errors.push(m.text()));
const ev = <T>(js: string) => page.evaluate(js) as Promise<T>;
const timings: Record<string, unknown>[] = [];
const shot = async (name: string) => {
  await page.waitForTimeout(100);
  await page.screenshot({ path: fileURLToPath(new URL(`../captures/round3-${name}.jpg`, import.meta.url)), type: "jpeg", quality: 86 });
};
const ready = async () => {
  await page.waitForFunction("window.erode.idle", undefined, { timeout: 30000 });
  const last = await ev<{ worn: number; dropped: number; finalMs: number }>("window.erode.last");
  assert.equal(last.dropped, 0);
  assert.ok(last.finalMs <= 1100, `final terrain took ${last.finalMs} ms`);
  return last;
};
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("body[data-ready='1']", { timeout: 120000 });
  await ev("document.body.classList.add('capture')");
  for (const [id, name] of [["wash-giant", "wash"], ["tall-arch", "arch"]]) {
    await ev(`window.erode.open('${id}')`);
    await ev("window.erode.play(0, false)");
    timings.push({ case: id, ...await ready() });
    await ev("window.erode.quiet()");
    await shot(`${name}-after`);
    await ev(name === "wash"
      ? "window.erode.pose({ target: [70, 8.5, -62], yaw: -1.1, pitch: 0.05, distance: 18, fov: 68 })"
      : "window.erode.pose({ target: [29.5, 10.5, -87.5], yaw: 0, pitch: 0.04, distance: 10, fov: 60 })");
    await shot(`${name}-${name === "arch" ? "through" : "low"}`);
  }
  await ev("window.erode.open('wash-giant')");
  await ev("document.body.classList.remove('capture')");
  await ev("window.erode.play(1, false)");
  timings.push({ case: "wash-giant-auto-seed-2", ...await ready() });
  assert.equal(await ev("window.erode.busy"), true, "effects may linger after final land");
  await page.locator("#another").click();
  assert.equal(await ev("window.erode.planning || window.erode.playing"), true);
  await ready();
  assert.deepEqual(errors, []);
  writeFileSync(new URL("../checks/round3-browser.json", import.meta.url), JSON.stringify({ result: "PASS",
    note: "128², installed Chrome, real-time animation; finalMs includes worker planning and final view update from the gesture end",
    cases: timings, immediateNextGesture: "PASS", pageErrors: errors }, null, 1) + "\n");
  console.log(JSON.stringify(timings));
} finally { await browser.close(); await server.close(); }
