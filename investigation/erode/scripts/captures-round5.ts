// Only the four requested Round 5 captures; time the full worker + terrain update at 128².
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
  await page.screenshot({ path: fileURLToPath(new URL(`../captures/round5-${name}.jpg`, import.meta.url)), type: "jpeg", quality: 86 });
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
  for (const [id, name, pose] of [
    ["wash-terraces-down", "terraces", { target: [60.5, 15.5, -65.5], yaw: -1.0564, pitch: 0.112, distance: 26.59, fov: 64 }],
    ["wash-rise", "rise", { target: [87.5, 12.5, -73.5], yaw: -0.9505, pitch: 0.1745, distance: 18.71, fov: 64 }],
  ] as const) {
    await ev(`Object.assign(window.erode.caseOf('${id}'), { power: 100, size: 100 }); window.erode.open('${id}')`);
    await ev("document.body.classList.add('capture')");
    await ev("window.erode.play(0, false)");
    timings.push({ case: id, ...await ready() });
    await ev("window.erode.quiet()");
    await shot(`${name}-after`);
    await ev(`window.erode.pose(${JSON.stringify(pose)})`);
    await shot(`${name}-low`);
    await ev("document.body.classList.remove('capture')");
    await ev("window.erode.play(1, false)");
    timings.push({ case: `${id}-seed-2`, ...await ready() });
    assert.equal(await ev("window.erode.busy"), true);
    await page.locator("#another").click();
    assert.equal(await ev("window.erode.planning || window.erode.playing"), true);
    await ready();
  }
  assert.deepEqual(errors, []);
  writeFileSync(new URL("../checks/round5-browser.json", import.meta.url), JSON.stringify({ result: "PASS",
    note: "128², installed Chrome; finalMs includes worker planning and final view update from gesture end",
    cases: timings, immediateNextGesture: "PASS", pageErrors: errors }, null, 1) + "\n");
  console.log(JSON.stringify(timings));
} finally { await browser.close(); await server.close(); }
