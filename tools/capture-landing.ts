// Close-ups of the lake stair's start shore and its landing (docs/PREMISES.md §2.2, "Ringed lakes"): each map opened
// on the page from its share link, the 3D view turned on the landing (`lakeStair.ts` `LANDING`, its tiles found here
// from the map's own plan) from a little above, at `--yaws` headings; one sheet of the panels, labelled. Headless
// Chromium (its software WebGL); the site built from this checkout.
//
//   npx tsx tools/capture-landing.ts [--maps 128:1,256:2] [--theme any] [--yaws 0,90,180,270] [--out docs/sheets/lake-stair-landing.jpg]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import { generatePremise } from "../src/core/premise/generate";
import { lakeStair } from "../src/core/premise/premises/lakeStair";
import { waterByNumber } from "../src/core/premise/water";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { encodePng } from "./png";
import { waitForEditor } from "./wait-editor";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const MAPS = arg("maps", "128:1,256:2").split(",").map((m) => m.split(":").map(Number) as [number, number]);
const THEME = arg("theme", "any") as ThemeId;
const YAWS = arg("yaws", "0").split(",").map(Number);
const OUT = arg("out", "docs/sheets/lake-stair-landing.jpg");
const DIST = arg("dist", ".scratch/capture-landing-dist");
const PORT = 4197;

/** The landing's tiles on a map: where the lake stair's own stage 1 differs from the shared one. */
function landingOf(size: number, seed: number): { tiles: [number, number][]; z: number; plan: string } {
  const r = generatePremise(makeSpec({ seed, size: { x: size, y: size }, theme: THEME, premise: "lakeStair" }));
  if ("reason" in r) throw new Error(r.reason);
  const plan = r.result.info.premise!.plan!;
  const a = waterByNumber(plan).raster;
  const b = lakeStair.water!(plan).raster;
  const tiles: [number, number][] = [];
  for (let i = 0; i < size * size; i++) if (a.heights[i] !== b.heights[i]) tiles.push([i % size, Math.floor(i / size)]);
  const k = plan.bodies.findIndex((x) => x.id === plan.stair?.startLake);
  return { tiles, z: plan.bodies[k].sill, plan: topDown(r.result.built.heights, r.result.built.settle.depth, size, tiles, r.result.built.start!) };
}

/** The ground and the lake's bed from straight above, round the landing: land shaded by height, water by its bed
 *  (darker deeper), the landing's tiles outlined red, the start's 3 × 3 white. A PNG as a data URL. */
function topDown(h: Uint8Array, depth: Float32Array | Float64Array, W: number, tiles: [number, number][], st: { x: number; y: number }): string {
  const S = 14;
  const cx = Math.round(tiles.reduce((s, t) => s + t[0], 0) / tiles.length);
  const cy = Math.round(tiles.reduce((s, t) => s + t[1], 0) / tiles.length);
  const w = 48;
  const hh = 27;
  const x0 = cx - w / 2;
  const y0 = cy - Math.floor(hh / 2);
  const land = new Set(tiles.map(([x, y]) => y * W + x));
  const rgb = new Uint8Array(w * S * hh * S * 3);
  for (let ty = 0; ty < hh; ty++)
    for (let tx = 0; tx < w; tx++) {
      const x = x0 + tx;
      const y = y0 + (hh - 1 - ty);
      const i = y * W + x;
      const inMap = x >= 0 && y >= 0 && x < W && y < W;
      let c: number[] = [0, 0, 0];
      if (inMap) {
        const z = h[i];
        if (depth[i] > 0.05) {
          const k = Math.min(1, (depth[i] - 0.2) / 2.5);
          c = [120 - 100 * k, 190 - 130 * k, 235 - 120 * k];
        } else c = [70 + 9 * z, 85 + 9 * z, 50 + 6 * z];
        if (Math.abs(x - st.x) <= 1 && Math.abs(y - st.y) <= 1) c = [250, 250, 250];
      }
      for (let a = 0; a < S; a++)
        for (let b = 0; b < S; b++) {
          let px = c;
          if (inMap && land.has(i) && (a < 2 || b < 2 || a >= S - 2 || b >= S - 2)) px = [230, 30, 30];
          // (a faint grid, a line between levels)
          else if (inMap && ((b === 0 && x > 0 && h[i - 1] !== h[i]) || (a === S - 1 && y > 0 && h[i - W] !== h[i]))) px = c.map((v) => v * 0.6);
          const o = ((ty * S + a) * w * S + tx * S + b) * 3;
          rgb[o] = px[0];
          rgb[o + 1] = px[1];
          rgb[o + 2] = px[2];
        }
    }
  return `data:image/png;base64,${Buffer.from(encodePng(rgb, w * S, hh * S)).toString("base64")}`;
}

async function main(): Promise<void> {
  process.env.DGM_BASE = "/";
  if (!arg("dist", "")) await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chromium" });
  const panels: { label: string; data: string }[] = [];
  try {
    for (const [size, seed] of MAPS) {
      const { tiles, z, plan: above } = landingOf(size, seed);
      const cx = tiles.reduce((s, t) => s + t[0], 0) / tiles.length + 0.5;
      const cy = tiles.reduce((s, t) => s + t[1], 0) / tiles.length + 0.5;
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, colorScheme: "light" });
      await context.addInitScript("window.__name = (f) => f");
      await context.addInitScript(`try { localStorage.setItem('dgm.look', 'standard'); localStorage.setItem('dgm.keptNote', '1'); } catch {}`);
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/#s=${seed}&z=${size}&d=n&t=${THEME}&p=lakeStair`);
      await waitForEditor(page, 600_000);
      await page.evaluate(() => window.dgmEditor!.idle());
      await page.evaluate(() => {
        const cs = [...document.querySelectorAll("canvas")];
        const big = cs.reduce((m, c) => (c.clientWidth * c.clientHeight > m.clientWidth * m.clientHeight ? c : m), cs[0]);
        big.setAttribute("data-view", "");
        const st = document.createElement("style");
        st.textContent = "body * { visibility: hidden !important } [data-view] { visibility: visible !important }";
        document.head.append(st);
      });
      for (const yaw of YAWS) {
        const view = { mode: "orbit", yaw: (yaw * Math.PI) / 180, pitch: (50 * Math.PI) / 180, distance: 34, target: [cx, z, -cy] };
        await page.evaluate((v) => {
          const r = window.dgm3d!.renderer as unknown as { persp: { fov: number; updateProjectionMatrix(): void }; setView(v: unknown): void; setClock?: (t: number | null) => void };
          r.persp.fov = 35;
          r.persp.updateProjectionMatrix();
          r.setClock?.(10);
          r.setView(v);
        }, view);
        await page.waitForTimeout(2500);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
        const box = (await page.locator("[data-view]").boundingBox())!;
        const w = Math.min(box.width, (box.height * 16) / 9);
        const shot = await page.screenshot({ type: "jpeg", quality: 85, clip: { x: box.x + (box.width - w) / 2, y: box.y, width: w, height: box.height } });
        panels.push({ label: `${THEME === "any" ? "Any" : THEME}, seed ${seed} at ${size}²: the start's shore in the page, the landing (${tiles.length} tiles) under the water by the start${YAWS.length > 1 ? `, yaw ${yaw}°` : ""}`, data: `data:image/jpeg;base64,${shot.toString("base64")}` });
      }
      panels.push({ label: `The same shore from above, the settled map: water shaded by its depth (deeper darker), the landing's tiles outlined red, the start white`, data: above });
      await context.close();
    }
    // one sheet: the panels side by side, two to a row, each labelled
    const page = await browser.newPage({ viewport: { width: 1600, height: 100 }, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0;background:#fff;font:15px system-ui,sans-serif"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px">${panels.map((p) => `<figure style="margin:0"><img style="width:100%;display:block" src="${p.data}"><figcaption style="padding:4px 2px">${p.label}</figcaption></figure>`).join("")}</div></body>`);
    await page.waitForTimeout(300);
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, await page.screenshot({ type: "jpeg", quality: 80, fullPage: true }));
    console.log(OUT);
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

void main();
