// Renders from the game's opening camera (D493): each map opened in the editor, the 3D view set to the
// camera a new game starts with (analysis/opening.ts `openingCamera`: 60° down, turned to the start's
// orientation + 35°, centered on the district center), at the opening frame's zoom (the default zoom's
// widest, `VISTA_ZOOM`; `--zoom opening` for the game's very first frame), with the game camera's 35°
// field of view, at 16:9. Only the 3D canvas is captured.
//
//   npx tsx tools/capture-opening.ts --maps highlands:1,canyon:4 [--size 128] [--zoom vista,opening] [--dir docs/sheets/opening] [--quality 82]

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import { openingCamera, VISTA_ZOOM } from "../src/core/analysis/opening";
import { ORIENTATIONS, startMiddleTile } from "../src/core/format/footprints";
import { waitForEditor } from "./wait-editor";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const MAPS = arg("maps", "highlands:1").split(",").map((m) => {
  const [theme, seed] = m.split(":");
  return { theme, seed: Number(seed) };
});
const SIZE = Number(arg("size", "128"));
const ZOOMS = arg("zoom", "vista").split(",");
const DIR = arg("dir", ".scratch/opening");
const QUALITY = Number(arg("quality", "82"));
const PORT = 4193;
const DIST = ".scratch/capture-opening-dist";
const VIEWPORT = { width: 1280, height: 720 };

async function main(): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await context.newPage();
    for (const m of MAPS) {
      await page.goto("about:blank");
      await page.goto(`http://localhost:${PORT}/#s=${m.seed}&z=${SIZE}&d=n&t=${m.theme}`);
      await waitForEditor(page, 300_000);
      await page.evaluate(() => window.dgmEditor!.idle());
      const st = (await page.evaluate(() => {
        const e = (window.dgm3d!.renderer as unknown as { map: { entities: { count: number; templates: string[]; template: Uint16Array; x: Int16Array; y: Int16Array; z: Int16Array; orientation: Uint8Array } } }).map.entities;
        for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "StartingLocation") return { x: e.x[k], y: e.y[k], z: e.z[k], o: e.orientation[k] & 3 };
        return null;
      })) as { x: number; y: number; z: number; o: number } | null;
      if (!st) {
        console.log(`${m.theme} ${m.seed}: no start`);
        continue;
      }
      const orientation = ORIENTATIONS[st.o];
      const [mx, my] = startMiddleTile({ x: st.x, y: st.y, orientation });
      // only the 3D view: every other element hidden (the largest canvas is the view)
      await page.evaluate(() => {
        const cs = [...document.querySelectorAll("canvas")];
        const big = cs.reduce((m, c) => (c.clientWidth * c.clientHeight > m.clientWidth * m.clientHeight ? c : m), cs[0]);
        big.setAttribute("data-opening-view", "");
        const st = document.createElement("style");
        st.textContent = "body * { visibility: hidden !important } [data-opening-view] { visibility: visible !important }";
        document.head.append(st);
      });
      for (const ZOOM of ZOOMS) {
        const cam = openingCamera({ x: mx, y: my, z: st.z, orientation }, ZOOM === "opening" ? undefined : VISTA_ZOOM);
        // (the renderer's world: x, height, −y; its yaw turns the other way from the game's horizontal angle)
        const view = { mode: "orbit", yaw: -((st.o * 90 + 35) * Math.PI) / 180, pitch: (60 * Math.PI) / 180, distance: cam.distance, target: [cam.target[0], cam.target[2], -cam.target[1]] };
        await page.evaluate((v) => {
          const r = window.dgm3d!.renderer as unknown as { persp: { fov: number; updateProjectionMatrix(): void }; setView(v: unknown): void; setClock?: (t: number | null) => void };
          r.persp.fov = 35;
          r.persp.updateProjectionMatrix();
          r.setClock?.(6);
          r.setView(v);
        }, view);
        await page.waitForTimeout(2500);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
        // the canvas's middle at 16:9 (its height kept: the field of view is vertical)
        const box = (await page.locator("[data-opening-view]").boundingBox())!;
        const w = Math.min(box.width, (box.height * 16) / 9);
        const file = join(DIR, `${m.theme}-${SIZE}-${m.seed}-${ZOOM}.jpg`);
        writeFileSync(file, await page.screenshot({ type: "jpeg", quality: QUALITY, clip: { x: box.x + (box.width - w) / 2, y: box.y, width: w, height: box.height } }));
        console.log(`${file}  start ${mx},${my} z${st.z} ${orientation}`);
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

void main();
