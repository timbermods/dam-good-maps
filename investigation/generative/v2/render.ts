// Renders of the ten brief maps in the app's own 3D view (src/render3d, as on dev), 1600×900, from
// the view's default camera (the game's angle over the whole map), and a top-down view (the view's
// top mode). The site is built and served locally for the run only, and the installed Chrome draws
// it headed, so WebGL runs on the GPU (tools/capture-look.ts does the same). Each map is opened
// through the editor's file input, from its .timber file as a player would.
//
// They use the released clean look (Map look, map-look-done), the app's default.
//
//   npx tsx investigation/generative/v2/render.ts [--only 01,02]

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { arg } from "../lib/paths";

const PORT = 4193;
const DIST = ".scratch/render-v2-dist";
const W = 1600;
const H = 900;
const SRC = resolve(".scratch", "v2-projects");
const OUT = join("investigation", "generative", "renders", "v2");
const only = arg("only", "").split(",").filter(Boolean);

async function toJpeg(tool: Page, png: Buffer, quality: number): Promise<Buffer> {
  const b64 = (await tool.evaluate(
    async ([data, q]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d")!.drawImage(img, 0, 0);
      return c.toDataURL("image/jpeg", q as number).split(",")[1];
    },
    [png.toString("base64"), quality / 100] as const,
  )) as string;
  return Buffer.from(b64, "base64");
}

async function main(): Promise<void> {
  const maps = readdirSync(SRC).filter((f) => /^\d\d\.timber$/.test(f)).map((f) => f.slice(0, 2)).filter((n) => !only.length || only.includes(n));
  mkdirSync(OUT, { recursive: true });
  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: W + 200, height: H + 200 }, deviceScaleFactor: 1, colorScheme: "light" });
    const tool = await browser.newPage();
    await tool.goto(`http://localhost:${PORT}/`);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const nn of maps) {
      const path = join(SRC, `${nn}.timber`);
      if (!existsSync(path)) continue;
      await page.goto("about:blank");
      await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley`);
      await page.getByText(/checks passed|checks failed/).first().waitFor({ timeout: 180_000 });
      await page.getByLabel("Open a map or a project file in the editor").setInputFiles(path);
      await page.waitForFunction(() => !!(window as unknown as { dgmEditor?: unknown; dgm3d?: unknown }).dgmEditor && !!(window as unknown as { dgm3d?: unknown }).dgm3d, null, { timeout: 180_000 });
      // the view alone, 1600×900: the editor's panels hidden, its view filling the frame
      await page.addStyleTag({
        content: `.editor-view{position:fixed!important;left:0!important;top:0!important;width:${W}px!important;height:${H}px!important;z-index:9999!important;}
.view3d > :not(canvas), .editor-map > :not(.view3d){visibility:hidden!important;}`,
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      await page.evaluate(() => (window as unknown as { dgmEditor: { idle(): Promise<void> } }).dgmEditor.idle());
      await page.waitForTimeout(2500);
      await page.evaluate(() => (window as unknown as { dgmEditor: { idle(): Promise<void> } }).dgmEditor.idle());
      const r = () => (window as unknown as { dgm3d: { renderer: { resetView(): void; getView(): { distance: number }; setView(v: object): void; setClock?: (t: number) => void } } }).dgm3d.renderer;
      await page.evaluate(`(${r.toString()})().setClock?.(12.5)`);
      const canvas = page.locator(".editor-view canvas");
      // the default camera: the game's angle over the whole map
      await page.evaluate(`(() => { const x = (${r.toString()})(); x.resetView(); const v = x.getView(); x.setView({ distance: v.distance * 0.8 }); })()`);
      await page.waitForTimeout(600);
      writeFileSync(join(OUT, `${nn}-3d.jpg`), await toJpeg(tool, await canvas.screenshot({ type: "png" }), 80));
      // top-down, north up
      await page.evaluate(`(() => { const x = (${r.toString()})(); x.resetView(); const v = x.getView(); x.setView({ mode: "top", distance: v.distance * 0.66 }); })()`);
      await page.waitForTimeout(600);
      writeFileSync(join(OUT, `${nn}-top.jpg`), await toJpeg(tool, await canvas.screenshot({ type: "png" }), 80));
      console.log(`rendered ${nn}`);
    }
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

void main();
