// Deep water from the top-down view before and after (#236 11-10, D497's fog; look/topdown-deep-water): dev against this
// checkout, High, the same maps from the same cameras. The top-down view takes the fog the angled view has at its zoom,
// so the deep sea, which the game's ramp and grade take to black, no longer reads pure black from the top; the angled
// view is drawn too, to show it unchanged.
//
//   git archive origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust | tar -x -C .scratch/judge-dev
//   npx tsx tools/capture-topdown-deep-water.ts [--dev .scratch/judge-dev] [--out docs/sheets/topdown-deep-water.jpg] [--soft]
//
// --soft draws in software (SwiftShader) with the page told it has a GPU (window.dgmLookTest, as look-high.spec.ts does),
// for a machine without one. Our own generated maps only; the cameras are framed in this checkout and used for both.

import { resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, site } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/topdown-deep-water.jpg";
const PORT = Number(arg("port") ?? 4993);
const SOFT = process.argv.includes("--soft");
const CLOCK = 12.5;

type Cam = { mode: "orbit" | "top"; yaw: number; pitch: number; distance: number; target: [number, number, number] };
const MAPS = [
  { key: "islands", hash: "#s=7&z=128&d=n&t=islands", label: "Islands 7" },
  { key: "lakes", hash: "#s=5&z=128&d=n&t=lakeBasin", label: "Lake Basin 5" },
] as const;

/** Page side: the cameras of a map: framed whole from the top and angled, and from the top zoomed in over its deepest
 *  clean water. */
const CAMS_JS = `(() => {
  const r = window.dgm3d.renderer, s = r.mapState();
  const cams = {};
  r.setMode("top"); r.resetView(); cams.top = r.getView();
  r.setMode("orbit"); r.resetView(); cams.angled = r.getView();
  let best = -1, bd = 0;
  for (let i = 0; i < s.W * s.H; i++) if (s.surface.contamination[i] <= 0.02 && s.surface.depth[i] > bd) { bd = s.surface.depth[i]; best = i; }
  const t = best >= 0 ? [best % s.W + 0.5, s.surface.surface[best], -(Math.floor(best / s.W) + 0.5)] : cams.top.target;
  cams.near = { ...cams.top, distance: 45, target: t };
  return cams;
})()`;

/** Page side: the median colour of the clean water three or more levels deep at each tile's middle, and how many of
 *  those tiles are black (the spec's measure, look-high.spec.ts). */
const DEEP_JS = `(() => {
  const r = window.dgm3d.renderer, g = r.gl.getContext();
  r.renderNow();
  const W = g.drawingBufferWidth, H = g.drawingBufferHeight, px = new Uint8Array(W * H * 4);
  g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
  const k = W / r.canvas.clientWidth, s = r.mapState(), seen = [];
  let black = 0;
  for (let y = 1; y < s.H - 1; y++) for (let x = 1; x < s.W - 1; x++) {
    const i = y * s.W + x;
    if (!(s.surface.depth[i] >= 3) || s.surface.contamination[i] > 0.02 || !Number.isFinite(s.surface.surface[i])) continue;
    const p = r.project(x + 0.5, s.surface.surface[i], -(y + 0.5));
    if (!p.visible) continue;
    const cx = Math.round(p.x * k), cy = H - 1 - Math.round(p.y * k);
    if (cx < 2 || cy < 2 || cx >= W - 2 || cy >= H - 2) continue;
    const o = (cy * W + cx) * 4;
    seen.push([px[o], px[o + 1], px[o + 2]]);
    if (px[o] + px[o + 1] + px[o + 2] < 6) black++;
  }
  const med = (c) => seen.map((v) => v[c]).sort((a, b) => a - b)[Math.floor(seen.length / 2)];
  return { n: seen.length, black, rgb: seen.length ? [med(0), med(1), med(2)] : null };
})()`;

const SITES = [
  { key: "dev", label: "dev" },
  { key: "after", label: "this branch" },
] as const;
const SCENES: { map: (typeof MAPS)[number]["key"]; cam: "top" | "near" | "angled"; label: string }[] = [
  { map: "islands", cam: "top", label: "Islands 7, top-down, whole" },
  { map: "islands", cam: "near", label: "Islands 7, top-down, zoomed in" },
  { map: "lakes", cam: "top", label: "Lake Basin 5, top-down, whole" },
  { map: "islands", cam: "angled", label: "Islands 7, angled, whole" },
];

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "topdown-deep", s.key, ports[s.key]));
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
    const cams: Record<string, Record<string, Cam>> = {};
    for (const m of MAPS) {
      await open(page, ports.after, m.hash);
      cams[m.key] = (await page.evaluate(CAMS_JS)) as Record<string, Cam>;
    }
    const got = new Map<string, Buffer>();
    for (const s of SITES)
      for (const m of MAPS) {
        await open(page, ports[s.key], m.hash);
        await setLook(page, "high");
        console.log(`${s.key} ${m.key}: the ${await page.evaluate("window.dgm3d.renderer.look")} look (${await page.evaluate("window.dgm3d.renderer.gpu().renderer")})`);
        for (const v of SCENES.filter((x) => x.map === m.key)) {
          const cam = cams[m.key][v.cam];
          await page.evaluate(`(() => { const r = window.dgm3d.renderer; r.setView(${JSON.stringify(cam)}); r.setClock(${CLOCK}); })()`);
          await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
          await page.waitForTimeout(300);
          console.log(`  ${v.cam}: deep clean water ${JSON.stringify(await page.evaluate(DEEP_JS))}`);
          await page.evaluate("window.dgm3d.renderer.renderNow()");
          // (a map framed whole fills the middle of the canvas: those frames are cut to it, at the canvas's shape)
          const clip = v.cam === "near" ? undefined : { x: 280, y: 70, width: 720, height: 450 };
          got.set(`${v.map}-${v.cam}-${s.key}`, await page.screenshot({ type: "png", clip }));
        }
      }
    const images: Buffer[] = [];
    const labels: string[] = [];
    for (const v of SCENES)
      for (const s of SITES) {
        images.push(got.get(`${v.map}-${v.cam}-${s.key}`)!);
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
