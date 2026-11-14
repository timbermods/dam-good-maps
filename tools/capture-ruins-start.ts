// Ruins and the start before and after (D178 as amended 2026-11-10, D496, D497; look/ruins-start): dev against this
// checkout, High, the same map from the same cameras, close and far. The ruins become the game's ruined concrete frames
// (RuinColumnA..E) at every distance, the start the district centre the game builds there.
//
//   git archive origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust | tar -x -C .scratch/judge-dev
//   npx tsx tools/capture-ruins-start.ts [--dev .scratch/judge-dev] [--out docs/sheets/ruins-start.jpg] [--soft]
//
// --soft draws in software (SwiftShader) with the page told it has a GPU (window.dgmLookTest, as look-high.spec.ts does),
// for a machine without one. Our own generated map only; the cameras are found in this checkout's map and used for both.

import { resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/ruins-start.jpg";
const PORT = Number(arg("port") ?? 4995);
const SOFT = process.argv.includes("--soft");
const MAP = arg("map") ?? "#s=4242&z=256&d=n&t=riverValley";
const CLOCK = 12.5;
const YAW = -Math.PI / 6;

/** Page side: the cameras. The ruins: round the most ruin columns within four tiles of one; the start: its
 *  StartingLocation. Close at the ruins' and start's own scale, far from the game's default zoom's distance. */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer, m = r.map, e = m.entities, W = m.W, H = m.H;
  const ruins = [], starts = [];
  for (let j = 0; j < e.count; j++) {
    const t = e.templates[e.template[j]];
    if (/^RuinColumn/.test(t)) ruins.push(j);
    else if (t === "StartingLocation") starts.push(j);
  }
  let best = -1, bn = 0;
  for (const a of ruins) {
    let n = 0;
    for (const b of ruins) if (Math.abs(e.x[a] - e.x[b]) <= 4 && Math.abs(e.y[a] - e.y[b]) <= 4) n++;
    if (n > bn) { bn = n; best = a; }
  }
  const at = (j, up) => [e.x[j] + 0.5, e.z[j] + up, -(e.y[j] + 0.5)];
  const views = {};
  if (best >= 0) {
    views.ruinsNear = { mode: "orbit", yaw, pitch: 0.5, distance: 16, target: at(best, 1.5) };
    views.ruinsFar = { mode: "orbit", yaw, pitch: 0.9, distance: 90, target: at(best, 1) };
  }
  if (starts.length) {
    views.startNear = { mode: "orbit", yaw, pitch: 0.55, distance: 14, target: at(starts[0], 1.5) };
    views.startFar = { mode: "orbit", yaw, pitch: 0.9, distance: 90, target: at(starts[0], 1) };
  }
  return { views, ruins: ruins.length, cluster: bn };
}`;

const SITES = [
  { key: "dev", label: "dev" },
  { key: "after", label: "this branch" },
] as const;
const SCENES = [
  { key: "ruinsNear", label: "Ruins, close" },
  { key: "ruinsFar", label: "Ruins, 90 away" },
  { key: "startNear", label: "The start, close" },
  { key: "startFar", label: "The start, 90 away" },
] as const;

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "ruins-start", s.key, ports[s.key]));
  }
  let browser: Browser | undefined;
  try {
    browser = SOFT
      ? await chromium.launch({ channel: "chromium", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
      : await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: "light" });
    if (SOFT) await ctx.addInitScript(() => ((window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, cost: 6 }));
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await open(page, ports.after, MAP);
    const found = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW])})`)) as { views: Record<string, View>; ruins: number; cluster: number };
    console.log(`${found.ruins} ruin columns, ${found.cluster} round the one framed`);
    for (const s of SCENES) if (!found.views[s.key]) throw new Error(`no view found for ${s.key}`);
    const got = new Map<string, Buffer>();
    for (const s of SITES) {
      await open(page, ports[s.key], MAP);
      await setLook(page, "high");
      console.log(`${s.key}: the ${await page.evaluate("window.dgm3d.renderer.look")} look`);
      for (const v of SCENES) got.set(`${v.key}-${s.key}`, await shot(page, found.views[v.key], CLOCK));
    }
    const images: Buffer[] = [];
    const labels: string[] = [];
    for (const v of SCENES)
      for (const s of SITES) {
        images.push(got.get(`${v.key}-${s.key}`)!);
        labels.push(`${v.label}: High, ${s.label}`);
      }
    const tool = await browser.newPage();
    await grid(tool, images, labels, 2, 0.32, resolve(OUT));
    if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
  } finally {
    await browser?.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
