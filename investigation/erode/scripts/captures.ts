// Round 2 only: four crater views, small/giant wash after, and a low view along the giant wash.
// Also checks the real-time deadline, immediate re-entry, undo, Auto/pins and persistence.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { fileURLToPath } from "node:url";
import { ROUND2 } from "./round2";

const here = fileURLToPath(new URL("../", import.meta.url));
const port = await new Promise<number>(resolve => {
  const s = netServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
});
process.env.ERODE_PORT = String(port);
const { createServer } = await import("vite");
const server = await createServer({ configFile: here + "vite.config.ts", root: here, logLevel: "warn", cacheDir: here + "local/vite-cache" });
await server.listen();
const out = new URL("../captures/", import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => m.type() === "error" && errors.push(m.text()));
const ev = <T>(js: string) => page.evaluate(js) as Promise<T>;
const timings: Record<string, unknown>[] = [];
const shot = async (name: string) => {
  await page.waitForTimeout(100);
  await page.screenshot({ path: fileURLToPath(new URL(`round2-${name}.jpg`, out)), type: "jpeg", quality: 86 });
  console.log("capture", name);
};
const ready = async () => {
  await page.waitForFunction("window.erode.idle", undefined, { timeout: 30000 });
  const last = await ev<{ worn: number; dropped: number; finalMs: number; details?: Record<string, number> }>("window.erode.last");
  assert.equal(last.dropped, 0);
  assert.ok(last.finalMs <= 1100, `final terrain took ${last.finalMs} ms`);
  return last;
};
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("body[data-ready='1']", { timeout: 120000 });
  await ev(`Object.assign(window.erode.caseOf('crater-lip'), ${JSON.stringify(ROUND2[0])})`);
  await ev("window.erode.open('crater-lip')");
  await ev("document.body.classList.add('capture')");
  await shot("crater-before");
  await ev("window.erode.play(0, false)");
  timings.push({ case: "crater-sweep-100", ...await ready() });
  await ev("window.erode.quiet()");
  await shot("crater-after");
  await ev("window.erode.pose({ target: [118, 10, -103], yaw: -1.35, pitch: 0.04, distance: 16, fov: 64 })");
  await shot("crater-low");
  await ev(`Object.assign(window.erode.caseOf('crater-lip'), { points: ${JSON.stringify(ROUND2[3].points)} })`);
  await ev("window.erode.open('crater-lip')");
  await ev("window.erode.play(0, false)");
  timings.push({ case: "crater-click-100", ...await ready() });
  await ev("window.erode.quiet()");
  await shot("crater-click-after");
  for (const id of ["wash-small", "wash-giant"]) {
    await ev(`window.erode.open('${id}')`);
    await ev("window.erode.play(0, false)");
    timings.push({ case: id, ...await ready() });
    await ev("window.erode.quiet()");
    await shot(`${id}-after`);
    if (id === "wash-giant") {
      await ev("window.erode.pose(window.erode.caseOf('wash-giant').low)");
      await shot("wash-giant-low");
    }
  }
  // Seed 2 is the largest of the four checked Auto personalities at 100/100.
  await ev("window.erode.play(1, false)");
  timings.push({ case: "wash-giant-auto-seed-2", ...await ready() });
  await ev("document.body.classList.remove('capture')");
  await page.locator("#more").click();
  const used = await ev<{ winding: number }>("window.erode.last.details");
  await page.getByRole("button", { name: "Pin Winding", exact: true }).click();
  await page.locator("#another").click();
  const rerolled = await ready();
  assert.equal(rerolled.details!.winding, used.winding);
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  assert.equal(await page.locator("#more").getAttribute("aria-expanded"), "true");
  assert.equal(await page.getByRole("slider", { name: "Winding", exact: true }).inputValue(), String(used.winding));
  await page.getByRole("button", { name: "Reset to Auto Winding", exact: true }).click();
  for (const label of ["Winding", "Side gullies", "Dry falls", "Undercut banks"]) {
    await page.getByRole("slider", { name: label, exact: true }).evaluate((el: HTMLInputElement) => {
      el.value = "100"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await ev("window.erode.open('wash-giant')");
  await ev("window.erode.play(0, false)");
  timings.push({ case: "wash-giant-all-pinned-100", ...await ready() });
  assert.equal(await ev("window.erode.busy"), true, "effects should be allowed to linger");
  await page.locator("#another").click();
  assert.equal(await ev("window.erode.planning || window.erode.playing"), true);
  await ready();
  await page.locator("#undo").click();
  assert.equal(await ev("window.erode.undoDepth"), 0);
  await page.locator("#redo").click();
  assert.equal(await ev("window.erode.undoDepth"), 1);
  await page.locator("#another").click();
  await page.keyboard.press("Escape");
  assert.equal(await ev("window.erode.idle"), true);
  assert.equal(await ev("window.erode.undoDepth"), 0);
  assert.deepEqual(errors, []);
  writeFileSync(new URL("../checks/browser.json", import.meta.url), JSON.stringify({ result: "PASS",
    note: "128², installed Chrome, real-time animation; finalMs includes worker planning and final view update from the gesture end",
    cases: timings, controls: "PASS: Auto value pin, Try another, persisted pins/More, immediate next operation during lingering effects, Undo/Redo/Esc",
    pageErrors: errors }, null, 1) + "\n");
  console.log(JSON.stringify(timings));
} finally { await browser.close(); await server.close(); }
