// Exercise the actual More control, persistence and worker; no new captures this round.
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
const floor = page.getByRole("slider", { name: "Floor", exact: true });
const run = async () => {
  await page.waitForFunction("window.erode.idle");
  const last = await ev<{ worn: number; dropped: number; finalMs: number }>("window.erode.last");
  assert.equal(last.dropped, 0);
  assert.ok(last.finalMs <= 1100, `final land took ${last.finalMs} ms`);
  return last;
};
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("body[data-ready='1']", { timeout: 120000 });
  await page.locator("#more").click();
  assert.equal(await floor.inputValue(), "1");
  assert.equal(await floor.getAttribute("min"), "1");
  assert.equal(await floor.getAttribute("max"), "22");
  await page.getByRole("button", { name: "Pin Floor", exact: true }).click();
  assert.equal(await ev("localStorage.getItem('erode-floor')"), "1");
  await page.getByRole("button", { name: "Reset to default Floor", exact: true }).click();
  await ev("window.erode.open('wash-giant')");
  await ev("window.erode.play(0, false)");
  const original = await run();
  await floor.fill("10");
  assert.equal(await ev("localStorage.getItem('erode-floor')"), "10");
  await page.reload();
  await page.waitForSelector("body[data-ready='1']", { timeout: 120000 });
  assert.equal(await floor.inputValue(), "10");
  assert.equal(await page.getByRole("button", { name: "Reset to default Floor", exact: true }).count(), 1);
  await ev("window.erode.open('wash-giant');");
  await ev("window.erode.play(0, false)");
  const shallow = await run();
  assert.ok(shallow.worn > 0 && shallow.worn < original.worn, "Floor did not shallow the worker's wash");
  await page.locator("#another").click();
  await run();
  assert.equal(await floor.inputValue(), "10");
  await floor.fill("22");
  await ev("window.erode.open('wash-giant')");
  await ev("window.erode.play(0, false)");
  await page.waitForFunction("window.erode.idle");
  assert.equal(await ev("window.erode.undoDepth"), 0, "ceiling Floor still carved");
  await page.getByRole("button", { name: "Reset to default Floor", exact: true }).click();
  assert.equal(await floor.inputValue(), "1");
  assert.equal(await ev("localStorage.getItem('erode-floor')"), null);
  await ev("window.erode.play(0, false)");
  assert.equal((await run()).worn, original.worn);
  assert.deepEqual(errors, []);
  const result = { result: "PASS", floorRange: "1–22", default: 1, pinReloadReset: "PASS", tryAnotherKeepsFloor: "PASS",
    ceilingKeepsAllGround: "PASS", original, shallow, pageErrors: errors };
  writeFileSync(new URL("../checks/round6-browser.json", import.meta.url), JSON.stringify(result, null, 1) + "\n");
  console.log(JSON.stringify(result));
} finally { await browser.close(); await server.close(); }
