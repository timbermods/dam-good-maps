// Captures of wall-with-one-gate maps (docs/PREMISES.md §5.1), as tools/capture-opening.ts renders the generator's maps:
// each map made by `src/core/premise/gateMap.ts` (not offered on the page yet, so opened as a file through the page's
// "Open a map or a project"), the 3D view set to a frame, only the 3D canvas captured. Frames: `opening`, the camera a
// new game starts with (at the opening zoom); `vista`, the same at the vista's zoom; `widest`, the whole map from near
// overhead (pitch 62°, turned as the opening camera is, so the valley is toward the viewer). Several seeds or frames are
// set out in one sheet, a panel each, labelled. Real Chrome, the site built from this checkout (run under `xvfb-run`
// where there is no display).
//
//   xvfb-run -a npx tsx tools/capture-gate.ts [--seeds 1,2] [--size 128] [--frames widest,opening] [--out docs/sheets/wall-gate-natural.jpg] [--quality 70] [--dist .scratch/capture-gate-dist]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { build, preview } from "vite";
import { openingCamera, VISTA_ZOOM } from "../src/core/analysis/opening";
import { ORIENTATIONS, startMiddleTile } from "../src/core/format/footprints";
import { writeTimber } from "../src/core/format/timber";
import { gateMap, startNumbers } from "../src/core/premise/gateMap";
import { makeSpec } from "../src/core/spec/mapspec";
import { waitForEditor } from "./wait-editor";
import { gateZones } from "../src/core/premise/gateLand";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const SEEDS = arg("seeds", arg("seed", "1")).split(",").map(Number);
const SIZE = Number(arg("size", "128"));
const FRAMES = arg("frames", arg("zoom", "widest,opening")).split(",") as Frame[];
const OUT = arg("out", "docs/sheets/wall-gate-natural.jpg");
const QUALITY = Number(arg("quality", "70"));
const PREBUILT = arg("dist", "");
const DIST = PREBUILT || ".scratch/capture-gate-dist";
const PORT = 4197;
const VIEWPORT = { width: 1280, height: 720 };
/** The widest frame: pitch from the horizontal, and the camera's distance per tile of the map's side. */
const WIDEST = { pitch: 62, distance: 1.3 } as const;

type Frame = "opening" | "vista" | "widest" | "range" | "scarp";
/** The view along the range: pitch from the horizontal, and the camera's distance per tile of the map's side. */
const ALONG = { pitch: 24, distance: 0.62 } as const;
/** The view from the valley's floor up at the scarp: pitch, and distance per tile of side. */
const SCARP_VIEW = { pitch: 10, distance: 0.32 } as const;

/** One map's frames, each a jpeg of the 3D canvas. */
async function shoot(browser: Browser, seed: number): Promise<{ label: string; jpg: Buffer }[]> {
  const spec = makeSpec({ seed, size: { x: SIZE, y: SIZE }, theme: "any", premise: "any" });
  const r = gateMap(spec);
  if ("reason" in r || !r.map) throw new Error("reason" in r ? r.reason : `no start: ${r.frame.reason}`);
  const five = startNumbers(r.map);
  console.log(`seed ${seed} at ${SIZE}²: ${Object.entries(five).map(([id, c]) => `${id} ${c.value}`).join(", ")}; checks ${r.map.report.passed ? "pass" : "FAIL"}`);
  const timber = resolve(`.scratch/capture-gate/wallGate-${seed}.timber`);
  mkdirSync(dirname(timber), { recursive: true });
  writeFileSync(timber, writeTimber(r.map.file));
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
  const out: { label: string; jpg: Buffer }[] = [];
  // (the game turns its first camera 35° clockwise from the start's orientation: every frame here is turned so)
  const yaw = -((o * 90 + 35) * Math.PI) / 180;
  for (const frame of FRAMES) {
    let view: unknown;
    if (frame === "widest") view = { mode: "orbit", yaw, pitch: (WIDEST.pitch * Math.PI) / 180, distance: WIDEST.distance * SIZE, target: [SIZE / 2, 8, -SIZE / 2] };
    else if (frame === "range" || frame === "scarp") {
      // (along the range from its valley side: the camera over the valley's foot, looking along the range's line,
      // turned a little toward it; target its middle, at the crest's height)
      const { zone } = gateZones(r.plan);
      let n = 0;
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < zone.length; i++) if (zone[i] === 1) [n, cx, cy] = [n + 1, cx + (i % SIZE), cy + Math.floor(i / SIZE)];
      [cx, cy] = [cx / n, cy / n];
      let sxx = 0;
      let sxy = 0;
      let syy = 0;
      for (let i = 0; i < zone.length; i++) {
        if (zone[i] !== 1) continue;
        const dx = (i % SIZE) - cx;
        const dy = Math.floor(i / SIZE) - cy;
        [sxx, sxy, syy] = [sxx + dx * dx, sxy + dx * dy, syy + dy * dy];
      }
      const along = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      if (frame === "range") view = { mode: "orbit", yaw: -along + Math.PI / 2 + 0.35, pitch: (ALONG.pitch * Math.PI) / 180, distance: ALONG.distance * SIZE, target: [cx, 14, -cy] };
      else view = { mode: "orbit", yaw: -along, pitch: (SCARP_VIEW.pitch * Math.PI) / 180, distance: SCARP_VIEW.distance * SIZE, target: [cx, 12, -cy] };
    }
    else {
      const cam = openingCamera({ x: mx, y: my, z: s.benchLevel, orientation: s.orientation }, frame === "vista" ? VISTA_ZOOM : undefined);
      view = { mode: "orbit", yaw, pitch: (60 * Math.PI) / 180, distance: cam.distance, target: [cam.target[0], cam.target[2], -cam.target[1]] };
    }
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
    out.push({ label: `seed ${seed} at ${SIZE}², ${frame === "widest" ? "the widest frame" : frame === "range" ? "along the range" : frame === "scarp" ? "up at the scarp from the valley" : frame === "vista" ? "the opening camera at the vista's zoom" : "the opening camera"}`, jpg: await page.screenshot({ type: "jpeg", quality: 90, clip: { x: box.x + (box.width - w) / 2, y: box.y, width: w, height: box.height } }) });
    console.log(`  ${frame}: start ${mx},${my} z${s.benchLevel} ${s.orientation}`);
  }
  await context.close();
  return out;
}

async function main(): Promise<void> {
  process.env.DGM_BASE = "/";
  if (!PREBUILT) {
    console.log("building the site…");
    await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  }
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    const panels: { label: string; jpg: Buffer }[] = [];
    for (const seed of SEEDS) panels.push(...(await shoot(browser, seed)));
    mkdirSync(dirname(OUT), { recursive: true });
    if (panels.length === 1) {
      const page = await browser.newPage({ viewport: VIEWPORT });
      await page.setContent(`<img src="data:image/jpeg;base64,${panels[0].jpg.toString("base64")}" style="display:block;width:100%">`);
      writeFileSync(OUT, await page.screenshot({ type: "jpeg", quality: QUALITY, fullPage: true }));
      await page.close();
    } else {
      // the sheet: a row a seed, a column a frame, each panel half the viewport's width, labelled
      const cols = FRAMES.length;
      const pw = Math.round(VIEWPORT.width / Math.max(2, cols));
      const html = `<body style="margin:0;background:#222;font:14px sans-serif;color:#eee"><div style="display:grid;grid-template-columns:repeat(${cols},${pw}px);gap:2px">${panels.map((p) => `<figure style="margin:0;position:relative"><img src="data:image/jpeg;base64,${p.jpg.toString("base64")}" style="display:block;width:${pw}px"><figcaption style="position:absolute;left:6px;top:4px;text-shadow:0 0 3px #000">${p.label}</figcaption></figure>`).join("")}</div></body>`;
      const page = await browser.newPage({ viewport: { width: cols * pw + (cols - 1) * 2, height: 400 } });
      await page.setContent(html);
      await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
      writeFileSync(OUT, await page.screenshot({ type: "jpeg", quality: QUALITY, fullPage: true }));
      await page.close();
    }
    console.log(OUT);
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

void main();
