// Saplings in the 3D view, before and after the growth reader's fix (D164): the page read a tree's
// Growable.GrowthProgress with Number(), which gives NaN for the parser's float, so no sapling was
// ever drawn young. This captures one map, opened in the editor through "Open a map", from two
// poses round its densest young grove, with the site built from this checkout.
//
//   npx tsx tools/capture-saplings.ts --label before|after --map <file.timber> [--out dir] [--port 4191]
//
// Run it in a checkout of dev for "before" and in this one for "after", on the same file: the
// poses come from the file alone, so the two runs match. It reads the file's saplings itself (not
// with the app's reader, which dev lacks).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import { readTimber } from "../src/core/format/timber";
import { surfaceOf } from "../src/core/format/world";
import { waitForEditor } from "./wait-editor";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const LABEL = arg("label", "after");
const MAP = arg("map", "");
const OUT = arg("out", "docs/map-look/saplings");
const PORT = Number(arg("port", "4191"));
const DIST = `.scratch/dist-saplings-${LABEL}`;

/** A float as the file stores it: a number, the parser's float ({value}), or {"Value": …}. */
function numberOf(v: unknown): number | null {
  if (v && typeof v === "object" && "Value" in (v as object)) v = (v as { Value: unknown }).Value;
  if (v && typeof v === "object" && "value" in (v as object)) v = (v as { value: unknown }).value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function main() {
  if (!MAP) throw new Error("--map <file.timber> is needed");
  const file = readTimber(new Uint8Array(readFileSync(MAP)));
  const w = file.world;
  const W = w.sizeX;
  const H = w.sizeY;
  const h = surfaceOf(w);
  const saplings: [number, number][] = [];
  for (const e of w.entities) {
    if (!["Pine", "Birch", "Oak"].includes(String(e.Template))) continue;
    const c = e.Components as Record<string, Record<string, unknown>>;
    const g = numberOf(c.Growable?.GrowthProgress);
    const bo = c.BlockObject as { Coordinates: { X: unknown; Y: unknown } };
    if (g !== null && g < 1) saplings.push([numberOf(bo.Coordinates.X) ?? 0, numberOf(bo.Coordinates.Y) ?? 0]);
  }
  // the densest young grove: the sapling with the most saplings within 6 tiles
  let best: [number, number] = [W >> 1, H >> 1];
  let most = -1;
  for (const [x, y] of saplings) {
    let n = 0;
    for (const [u, v] of saplings) if (Math.abs(u - x) <= 6 && Math.abs(v - y) <= 6) n++;
    if (n > most) {
      most = n;
      best = [x, y];
    }
  }
  console.log(`${saplings.length} saplings; the densest grove round (${best[0]}, ${best[1]}), ${most} within 6 tiles`);
  const [bx, by] = best;
  const target: [number, number, number] = [bx + 0.5, h[by * W + bx], -(by + 0.5)];
  const poses = [
    { id: "close", view: { mode: "orbit", yaw: -Math.PI / 6, pitch: (40 * Math.PI) / 180, distance: 16, target } },
    { id: "grove", view: { mode: "orbit", yaw: -Math.PI / 6, pitch: (55 * Math.PI) / 180, distance: 34, target } },
  ];
  process.env.DGM_BASE = "/";
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    // Standard held: this is D164, well before the High look existed, and "before" is run on a
    // checkout of dev with no High to pick from at all; a capable GPU would otherwise draw "after"
    // in High by itself (found auditing capture-badwater.ts's same gap, D304's investigation)
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley`);
    await waitForEditor(page, 180_000);
    await page.getByLabel("Open a map or project file").setInputFiles(MAP);
    await page.waitForFunction(() => (window as unknown as { dgmEditor?: { info(): { kind: string } } }).dgmEditor?.info().kind === "import", null, { timeout: 180_000 });
    await page.evaluate(() => (window as unknown as { dgmEditor: { idle(): Promise<void> } }).dgmEditor.idle());
    await page.waitForTimeout(2500);
    await page.keyboard.press("Escape");
    await page.addStyleTag({ content: ".view3d > :not(canvas), .editor-map > :not(.view3d) { visibility: hidden !important; }" });
    // the young flags the page holds for the map's trees
    const young = await page.evaluate(() => {
      const m = (window as unknown as { dgm3d: { renderer: { map: { entities: { count: number; flags: Uint8Array } } } } }).dgm3d.renderer.map.entities;
      let n = 0;
      for (let k = 0; k < m.count; k++) if (m.flags[k] & 4) n++;
      return n;
    });
    console.log(`${LABEL}: the page marks ${young} objects young`);
    mkdirSync(OUT, { recursive: true });
    const canvas = page.locator(".editor-view canvas");
    const stem = basename(MAP).replace(/\.timber$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    for (const p of poses) {
      await page.evaluate((v) => (window as unknown as { dgm3d: { renderer: { setView(v: unknown): void } } }).dgm3d.renderer.setView(v), p.view);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      await page.waitForTimeout(400);
      const f = join(OUT, `${stem}-${p.id}-${LABEL}.jpg`);
      writeFileSync(f, await canvas.screenshot({ type: "jpeg", quality: 85 }));
      console.log(`  ${f}`);
    }
    writeFileSync(join(OUT, `${stem}-${LABEL}.json`), JSON.stringify({ label: LABEL, map: basename(MAP), saplings: saplings.length, youngOnPage: young, grove: best, poses }, null, 1) + "\n");
  } finally {
    await browser.close();
    await server.close();
  }
}

void main();
