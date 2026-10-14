// The opening camera as it is (pitched 70° down) and pitched 55° down, the same map in each: Canyon
// and Highlands seeds 1–30 at 128² from this checkout, for Kyler to judge whether the opening view
// should change (no camera code is changed: the second shot sets the view's pitch on the page and
// frames the map again, the renderer's own framing).
//
//   npx tsx investigation/canyon-highlands-height/capture-pitch.ts [--themes canyon,highlands] [--seeds 1-30]
//       [--out investigation/canyon-highlands-height/local/pitch] [--port 4197] [--pitch 55]
//
// Adapted from investigation/theme-critique/capture-3d.ts (PR #211): builds and serves this checkout,
// opens each map from its share link (the page is the editor, D330), lets the water settle and captures the
// 3D canvas twice. JPEGs <theme>-<seed>-70.jpg and <theme>-<seed>-55.jpg, plus index.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { THEMES, type ThemeId } from "../../src/core/spec/mapspec";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = resolve(arg("out", "investigation/canyon-highlands-height/local/pitch"));
const PORT = Number(arg("port", "4197"));
const QUALITY = Number(arg("quality", "70"));
const PITCH = Number(arg("pitch", "55"));
const THEME_LIST = arg("themes", THEMES.join(",")).split(",") as ThemeId[];
const [S0, S1] = arg("seeds", "1-30").split("-").map(Number);
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const DIST = ".scratch/pitch-dist";

interface Result {
  theme: ThemeId;
  seed: number;
  checks: string;
  files: string[] | null;
}

async function openMap(page: Page, theme: ThemeId, seed: number): Promise<{ checks: string; blocked: boolean }> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/#s=${seed}&z=128&d=n&t=${theme}`);
  // (the page is the editor, D330: the map opens in it from its share link; its checks show on the dot beside Save)
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 300_000 });
  const ready = await page.getByRole("button", { name: /^Checks: Ready to play/ }).first().waitFor({ timeout: 180_000 }).then(() => true, () => false);
  const checks = ready ? "Ready to play" : "not ready";
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  const close = page.getByRole("button", { name: /close|dismiss|×/i }).first();
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: "body * { visibility: hidden !important; } .editor-view canvas[aria-label^=\"3D view\"] { visibility: visible !important; }" });
  // (the map framed as the renderer frames a map alone: the page's insets, for its panels, move the camera)
  await page.evaluate("window.dgm3d.renderer.setFrameInsets({ top: 0, left: 0, bottom: 0, right: 0 })");
  await page.evaluate("window.dgmEditor.idle()");
  return { checks, blocked: false };
}

async function shoot(page: Page, tool: Page, file: string): Promise<void> {
  await page.evaluate("window.dgmEditor.idle()");
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
  await page.waitForTimeout(250);
  const canvas = page.locator(".editor-view canvas[aria-label^=\"3D view\"]");
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  const png = await canvas.screenshot({ type: "png", timeout: 30_000 });
  const jpeg = await tool.evaluate(
    async ([b64, q]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      c.getContext("2d")!.drawImage(img, 0, 0);
      const blob = await c.convertToBlob({ type: "image/jpeg", quality: (q as number) / 100 });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    },
    [png.toString("base64"), QUALITY] as const,
  );
  writeFileSync(file, Buffer.from(jpeg as unknown as string, "base64"));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const indexFile = join(OUT, "index.json");
  const results: Result[] = existsSync(indexFile) ? (JSON.parse(readFileSync(indexFile, "utf8")) as Result[]) : [];
  const done = new Set(results.map((r) => `${r.theme}/${r.seed}`));
  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const server: PreviewServer = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  let browser = await chromium.launch({ channel: "chrome", headless: false });
  let tool = await browser.newPage();
  try {
    for (const theme of THEME_LIST) {
      for (let seed = S0; seed <= S1; seed++) {
        if (done.has(`${theme}/${seed}`)) continue;
        if (!browser.isConnected()) {
          console.log("the browser is gone; relaunching");
          browser = await chromium.launch({ channel: "chrome", headless: false });
          tool = await browser.newPage();
        }
        const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
        const t0 = Date.now();
        try {
          const { checks, blocked } = await openMap(page, theme, seed);
          if (blocked) {
            console.log(`${theme} ${seed}: ${checks}; no capture`);
            results.push({ theme, seed, checks, files: null });
          } else {
            // the opening view, the renderer's own
            await page.evaluate("window.dgm3d.renderer.resetView()");
            const a = `${theme}-${seed}-70.jpg`;
            await shoot(page, tool, join(OUT, a));
            // the same view pitched down to PITCH degrees, the map framed again by the renderer's framing
            await page.evaluate(`(() => { const r = window.dgm3d.renderer; r.resetView(); r.view.pitch = ${PITCH} * Math.PI / 180; r.frameMap(); r.requestRender(); })()`);
            const b = `${theme}-${seed}-${PITCH}.jpg`;
            await shoot(page, tool, join(OUT, b));
            results.push({ theme, seed, checks, files: [a, b] });
            console.log(`${theme} ${seed}: ${a}, ${b} (${Math.round((Date.now() - t0) / 1000)} s)`);
          }
        } catch (e) {
          console.log(`${theme} ${seed}: FAILED ${String((e as Error).message).slice(0, 200)}`);
        }
        writeFileSync(indexFile, JSON.stringify(results, null, 1) + "\n");
        await page.close();
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    await server.close();
  }
  console.log(`wrote ${results.length} entries to ${indexFile}`);
}

void main();
