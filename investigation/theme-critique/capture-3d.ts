// Theme critique: every theme's seeds 1–30 at 128² from the editor's default (opening) camera
// (adapted from investigation/m9b-review/capture-3d.ts; the picks are the whole range, not random).
//
//   npx tsx investigation/theme-critique/capture-3d.ts [--themes any,canyon] [--seeds 1-30]
//       [--out investigation/theme-critique/local/3d] [--port 4199] [--quality 70]
//
// Builds and serves this checkout, opens each map from its share link, presses "Refine this map",
// lets the water settle and captures the 3D canvas at renderer.resetView()'s camera, never moved.
// JPEGs plus index.json (name, description, checks line, whether the start was on screen).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { THEMES, type ThemeId } from "../../src/core/spec/mapspec";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = resolve(arg("out", "investigation/theme-critique/local/3d"));
const PORT = Number(arg("port", "4199"));
const QUALITY = Number(arg("quality", "70"));
const THEME_LIST = (arg("themes", THEMES.join(",")).split(",") as ThemeId[]);
const [S0, S1] = arg("seeds", "1-30").split("-").map(Number);
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const DIST = ".scratch/critique-3d-dist";

interface Result {
  theme: ThemeId;
  seed: number;
  name: string;
  description: string;
  checks: string;
  blocked?: string;
  file: string | null;
  startVisible: boolean | null;
}

async function openMap(page: Page, theme: ThemeId, seed: number): Promise<{ name: string; description: string; checks: string; blocked?: string }> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/#s=${seed}&z=128&d=n&t=${theme}`);
  const summary = page.getByText(/checks (passed|failed)/).first();
  await summary.waitFor({ timeout: 300_000 });
  const checks = ((await summary.textContent()) ?? "").trim();
  const name = ((await page.locator(".card header h2").textContent()) ?? "").trim();
  const description = ((await page.locator(".card .premise").textContent()) ?? "").trim();
  if (/failed/.test(checks)) {
    const blocked = ((await page.locator(".card details.report").innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    return { name, description, checks, blocked };
  }
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 120_000 });
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  const close = page.getByRole("button", { name: /close|dismiss|×/i }).first();
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => undefined);
  await page.waitForTimeout(2500);
  // only the map: the editor's buttons, hints and panels hidden (as tools/capture-high.ts does)
  await page.addStyleTag({ content: "body * { visibility: hidden !important; } .editor-view canvas { visibility: visible !important; }" });
  await page.evaluate("window.dgmEditor.idle()");
  return { name, description, checks };
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
          // the browser went away (a crash, or a page that hung): start another and carry on
          console.log("the browser is gone; relaunching");
          browser = await chromium.launch({ channel: "chrome", headless: false });
          tool = await browser.newPage();
        }
        const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
        const t0 = Date.now();
        try {
          const words = await openMap(page, theme, seed);
          if (words.blocked !== undefined) {
            console.log(`${theme} ${seed}: ${words.checks}; no 3D capture`);
            results.push({ theme, seed, ...words, file: null, startVisible: null });
          } else {
            await page.evaluate("window.dgm3d.renderer.resetView()");
            const start = (await page.evaluate("(() => { const f = window.dgmEditor.info().features.find((g) => g.kind === 'start'); return f ? { x: f.params.position[0], y: f.params.position[1] } : null; })()")) as { x: number; y: number } | null;
            const file = `${theme}-${seed}.jpg`;
            await shoot(page, tool, join(OUT, file));
            let startVisible: boolean | null = null;
            if (start) {
              const box = (await page.locator(".editor-view canvas[aria-label^=\"3D view\"]").boundingBox())!;
              const p = (await page.evaluate(`window.dgmEditor.tileToClient(${start.x}, ${start.y})`)) as { x: number; y: number };
              startVisible = p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
            }
            results.push({ theme, seed, ...words, file, startVisible });
            console.log(`${theme} ${seed}: ${file} (${Math.round((Date.now() - t0) / 1000)} s)${startVisible === false ? ", start off screen" : ""}`);
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
