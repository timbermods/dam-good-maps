// M9a review set, part 3 (PLAN §20 D252 (2)): 14 random maps in 3D (two per theme, including Any),
// each rendered in the editor's default (opening) camera with the start visible, labelled with
// theme and seed. The 14 (theme, seed) picks are drawn once with a fixed, recorded random seed
// (mulberry32) from 1-1000, in THEMES order, two draws per theme, and never rerolled.
//
//   npx tsx investigation/m9a-review/capture-3d.ts [--rng 20260927] [--out investigation/m9a-review] [--port 4198]
//
// Builds and serves this checkout (as `npm run try` does), opens each map generated from its share
// link in the editor ("Refine this map"), lets it settle, and captures the ".editor-view canvas" at
// its default camera (renderer.resetView()'s target and distance — the view the editor opens with,
// never moved). Whether the start is on screen is checked with window.dgmEditor.tileToClient against
// the canvas's bounding box; when it is not, a second capture ("-start") is made framing the start
// (an orbit view centred on it) instead of moving the default camera. JPEGs, quality 80, each under
// 250 KB; picks.json records the picks and which maps needed the second capture.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { THEMES, THEME_NAMES, type ThemeId } from "../../src/core/spec/mapspec";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = resolve(arg("out", "investigation/m9a-review"));
const PORT = Number(arg("port", "4198"));
const RNG_SEED = Number(arg("rng", "20260927"));
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const DIST = ".scratch/capture-3d-dist";

/** mulberry32: a small, fixed, recorded PRNG (not the generator's own — this only picks seeds). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pick {
  theme: ThemeId;
  seed: number;
}

function pickSeeds(): Pick[] {
  const rng = mulberry32(RNG_SEED);
  const picks: Pick[] = [];
  for (const theme of THEMES) for (let k = 0; k < 2; k++) picks.push({ theme, seed: 1 + Math.floor(rng() * 1000) });
  return picks;
}

interface Result extends Pick {
  file: string;
  startVisible: boolean;
  startFile: string | null;
}

async function openMap(page: Page, theme: ThemeId, seed: number): Promise<void> {
  const fragment = `#s=${seed}&z=128&d=n&t=${theme}`;
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/${fragment}`);
  await page.getByText(/All \d+ checks passed/).first().waitFor({ timeout: 180_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 120_000 });
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  const close = page.getByRole("button", { name: /close|dismiss|×/i }).first();
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
}

async function settle(page: Page): Promise<void> {
  await page.evaluate("window.dgmEditor.idle()");
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
}

async function shoot(page: Page, tool: Page, file: string): Promise<void> {
  // an element screenshot captures only the canvas's own rendered bitmap, not any sibling
  // buttons/legend that sit over it, so nothing needs hiding first
  await settle(page);
  await page.waitForTimeout(250);
  const canvas = page.locator(".editor-view canvas");
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
    [png.toString("base64"), 80] as const,
  );
  writeFileSync(file, Buffer.from(jpeg as unknown as string, "base64"));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const picks = pickSeeds();
  console.log(`rng seed ${RNG_SEED}: ${picks.map((p) => `${p.theme}/${p.seed}`).join(", ")}`);

  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const server: PreviewServer = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const results: Result[] = [];
  try {
    const tool = await browser.newPage();
    for (const { theme, seed } of picks) {
      const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
      console.log(`${theme} ${seed}: opening`);
      await openMap(page, theme, seed);
      // the editor's opening camera (renderer.resetView() ran when the map loaded; asked again to
      // be sure nothing else moved it)
      await page.evaluate("window.dgm3d.renderer.resetView()");
      const start = (await page.evaluate("(() => { const f = window.dgmEditor.info().features.find((g) => g.kind === 'start'); return f ? { x: f.params.position[0], y: f.params.position[1] } : null; })()")) as { x: number; y: number } | null;
      const file = join(OUT, `3d-${theme}-${seed}.jpg`);
      await shoot(page, tool, file);
      let startVisible = true;
      let startFile: string | null = null;
      if (start) {
        const box = (await page.locator(".editor-view canvas").boundingBox())!;
        const p = (await page.evaluate(`window.dgmEditor.tileToClient(${start.x}, ${start.y})`)) as { x: number; y: number };
        startVisible = p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
        if (!startVisible) {
          console.log(`  ${theme} ${seed}: the start is off screen in the default view; framing it separately`);
          await page.evaluate(`window.dgm3d.renderer.setView({ mode: "orbit", yaw: -Math.PI / 6, pitch: (55 * Math.PI) / 180, distance: 42, target: [${start.x} + 0.5, 0, -(${start.y} + 0.5)] })`);
          // the target's height: read back the map's own heights at the start tile
          await page.evaluate(`(() => { const r = window.dgm3d.renderer; const v = r.getView(); const m = r.mapState ? r.mapState() : null; if (m) v.target[1] = m.heights[${start.y} * m.W + ${start.x}]; r.setView(v); })()`);
          startFile = join(OUT, `3d-${theme}-${seed}-start.jpg`);
          await shoot(page, tool, startFile);
        }
      } else {
        console.log(`  ${theme} ${seed}: no start feature found`);
      }
      results.push({ theme, seed, file: file.slice(OUT.length + 1), startVisible, startFile: startFile ? startFile.slice(OUT.length + 1) : null });
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  writeFileSync(join(OUT, "picks.json"), JSON.stringify({ rngSeed: RNG_SEED, picks: results }, null, 1) + "\n");
  console.log(`wrote ${results.length} captures and picks.json`);
  const offscreen = results.filter((r) => !r.startVisible);
  console.log(offscreen.length ? `off screen in the default view: ${offscreen.map((r) => `${r.theme}/${r.seed}`).join(", ")}` : "the start was on screen in every default view");
}

void main();
