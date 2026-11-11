// A capture of a wall-with-one-gate map from the game's opening camera (docs/PREMISES.md §5.1), as
// tools/capture-opening.ts renders the generator's maps: the map made by `src/core/premise/gateMap.ts` (not offered on
// the page yet, so opened as a file through the page's "Open a map or a project"), the 3D view set to the camera a new
// game starts with, at the vista's zoom, only the 3D canvas captured as a jpg. Real Chrome, the site built from this
// checkout (run under `xvfb-run` where there is no display).
//
//   xvfb-run -a npx tsx tools/capture-gate.ts [--seed 1] [--size 192] [--zoom vista|opening] [--out docs/sheets/wall-gate-relief.jpg] [--quality 70] [--dist .scratch/capture-gate-dist]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import { openingCamera, VISTA_ZOOM } from "../src/core/analysis/opening";
import { ORIENTATIONS, startMiddleTile } from "../src/core/format/footprints";
import { writeTimber } from "../src/core/format/timber";
import { gateMap, startNumbers } from "../src/core/premise/gateMap";
import { makeSpec } from "../src/core/spec/mapspec";
import { waitForEditor } from "./wait-editor";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const SEED = Number(arg("seed", "1"));
const SIZE = Number(arg("size", "192"));
const ZOOM = arg("zoom", "vista");
const OUT = arg("out", "docs/sheets/wall-gate-relief.jpg");
const QUALITY = Number(arg("quality", "70"));
const PREBUILT = arg("dist", "");
const DIST = PREBUILT || ".scratch/capture-gate-dist";
const PORT = 4197;
const VIEWPORT = { width: 1280, height: 720 };

async function main(): Promise<void> {
  const spec = makeSpec({ seed: SEED, size: { x: SIZE, y: SIZE }, theme: "any", premise: "any" });
  const r = gateMap(spec);
  if ("reason" in r || !r.map) throw new Error("reason" in r ? r.reason : `no start: ${r.frame.reason}`);
  const five = startNumbers(r.map);
  console.log(`seed ${SEED} at ${SIZE}²: ${Object.entries(five).map(([id, c]) => `${id} ${c.value}`).join(", ")}; checks ${r.map.report.passed ? "pass" : "FAIL"}`);
  const timber = resolve(".scratch/capture-gate/wallGate.timber");
  mkdirSync(dirname(timber), { recursive: true });
  writeFileSync(timber, writeTimber(r.map.file));
  process.env.DGM_BASE = "/";
  if (!PREBUILT) {
    console.log("building the site…");
    await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  }
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("window.__name = (f) => f");
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley`);
    await waitForEditor(page, 300_000);
    await page.getByLabel("Open a map or a project").setInputFiles(timber);
    await page.waitForFunction(() => window.dgmEditor?.info().kind === "import" && !!window.dgm3d, null, { timeout: 300_000 });
    await page.evaluate(() => window.dgmEditor!.idle());
    const s = r.map.features.find((f) => f.kind === "start")!.params as { position: [number, number]; orientation: (typeof ORIENTATIONS)[number]; benchLevel: number };
    const [mx, my] = startMiddleTile({ x: s.position[0], y: s.position[1], orientation: s.orientation });
    const o = ORIENTATIONS.indexOf(s.orientation);
    await page.evaluate(() => {
      const cs = [...document.querySelectorAll("canvas")];
      const big = cs.reduce((m, c) => (c.clientWidth * c.clientHeight > m.clientWidth * m.clientHeight ? c : m), cs[0]);
      big.setAttribute("data-opening-view", "");
      const st = document.createElement("style");
      st.textContent = "body * { visibility: hidden !important } [data-opening-view] { visibility: visible !important }";
      document.head.append(st);
    });
    const cam = openingCamera({ x: mx, y: my, z: s.benchLevel, orientation: s.orientation }, ZOOM === "opening" ? undefined : VISTA_ZOOM);
    const view = { mode: "orbit", yaw: -((o * 90 + 35) * Math.PI) / 180, pitch: (60 * Math.PI) / 180, distance: cam.distance, target: [cam.target[0], cam.target[2], -cam.target[1]] };
    await page.evaluate((v) => {
      const rr = window.dgm3d!.renderer as unknown as { persp: { fov: number; updateProjectionMatrix(): void }; setView(v: unknown): void; setClock?: (t: number | null) => void };
      rr.persp.fov = 35;
      rr.persp.updateProjectionMatrix();
      rr.setClock?.(6);
      rr.setView(v);
    }, view);
    await page.waitForTimeout(3000);
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null)))));
    const box = (await page.locator("[data-opening-view]").boundingBox())!;
    const w = Math.min(box.width, (box.height * 16) / 9);
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, await page.screenshot({ type: "jpeg", quality: QUALITY, clip: { x: box.x + (box.width - w) / 2, y: box.y, width: w, height: box.height } }));
    console.log(`${OUT}  start ${mx},${my} z${s.benchLevel} ${s.orientation}`);
    await context.close();
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

void main();
