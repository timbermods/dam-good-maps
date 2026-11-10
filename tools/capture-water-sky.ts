// The water's light as the game draws it (Q9 P15; fix/water-sky): dev against this checkout, Standard and High, the same
// map from the same cameras at the same moment: a lake from a low, grazing camera (where the sky's reflection shows
// most), a river, the opening camera, and pure badwater. What moved: the game's reflection probe by the reflected
// direction, its sun's GGX glint and its sun's colour on the highlight (waterPalette.ts WATER_LIGHT), in each look as
// the pixel judge chose.
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-water-sky.ts [--dev .scratch/judge-dev] [--out docs/sheets/water-sky.jpg] [--set WATER_GAME_LIGHT=1,...]
//
// `--set` draws this checkout with those shader switches (each with its High look's own) whatever it ships: the light
// held behind its constants (waterPalette.ts WATER_LIGHT), shown beside dev.
//
// Our own generated map only; the views are found in this checkout's map (page side) and used for both sites.

import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/water-sky.jpg";
const PORT = Number(arg("port") ?? 4997);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;
const MAP = "#s=4242&z=256&d=n&t=riverValley";
/** `--set A=1,B=1`: the switches this checkout's shots are drawn with (as the pixel judge's `--set`). */
const SETS: [string, string][] = (arg("set") ?? "")
  .split(",")
  .filter(Boolean)
  .flatMap((kv) => {
    const [d, v] = kv.split("=");
    return [d, `${d}_HIGH`].flatMap((n): [string, string][] => [
      [`#define ${n} 0`, `#define ${n} ${v}`],
      [`#define ${n} 1`, `#define ${n} ${v}`],
    ]);
  })
  .filter(([a, b]) => a !== b);
/** Page side: each set switch swapped in every shader's source before it compiles. */
const SET_JS = `(() => {
  const swaps = ${JSON.stringify(SETS)};
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const src = C.prototype.shaderSource;
    C.prototype.shaderSource = function (s, text) {
      for (const [a, b] of swaps) text = text.split(a).join(b);
      return src.call(this, s, text);
    };
  }
})();`;

/** Page side: the views. The lake: the most clean water round a point, seen from low (pitch 0.2, the editor's lowest
 *  is 0.18) across it, turned so the line of sight runs over water; the river: the most clean water in a channel (a
 *  quarter to a half of its 11 × 11 wet) round a point; the game's opening camera (60° down) over water; pure badwater (the deepest tile whose 7×7 is all wet and nearly all
 *  bad). */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const top = (i) => (wet(i) ? s.surface[i] : m.heights[i]);
  const at = (i) => [i % W + 0.5, top(i), -(Math.floor(i / W) + 0.5)];
  const views = {};
  const bestOf = (score, r0) => {
    let best = -1, bs = 0;
    for (let y = r0; y < H - r0; y += 2) for (let x = r0; x < W - r0; x += 2) {
      let sum = 0;
      for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) sum += score((y + dy) * W + x + dx, x + dx, y + dy);
      if (sum > bs) { bs = sum; best = y * W + x; }
    }
    return best;
  };
  const clean = (j) => (wet(j) && s.contamination[j] < 0.02 ? 1 : 0);
  let i = bestOf(clean, 10);
  if (i >= 0) {
    // (the turn whose low line of sight, from the eye down to the lake's middle, runs over the most clean water and
    // no ground above it: a grazing look across the lake)
    const pitch = 0.2, distance = 28, ix = i % W, iy = Math.floor(i / W);
    let bestYaw = yaw, bestOver = -1;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * 2 * Math.PI;
      let over = 0;
      for (let t = 0.05; t <= 1; t += 0.05) {
        const x = Math.round(ix + Math.sin(a) * Math.cos(pitch) * distance * t), y = Math.round(iy - Math.cos(a) * Math.cos(pitch) * distance * t);
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        const j = y * W + x;
        if (top(j) > top(i) + Math.sin(pitch) * distance * t) { over = -1; break; }
        over += clean(j);
      }
      if (over > bestOver) { bestOver = over; bestYaw = a; }
    }
    views.lake = { mode: "orbit", yaw: bestYaw, pitch, distance, target: at(i) };
  }
  // the opening camera, as the game's (core/analysis/opening.ts OPENING): 60° down, 32 × 1.3^4 away (zoom 4, between
  // the start's and the widest default), over the most clean water in a 33 × 33 round a point
  i = bestOf(clean, 16);
  if (i >= 0) views.opening = { mode: "orbit", yaw, pitch: Math.PI / 3, distance: 32 * 1.3 ** 4, target: at(i) };
  const share = new Float32Array(W * H);
  for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) {
    let n = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) n += wet((y + dy) * W + x + dx) ? 1 : 0;
    share[y * W + x] = n / 121;
  }
  i = bestOf((j) => (clean(j) && share[j] > 0.25 && share[j] < 0.5 ? 1 : 0), 6);
  if (i >= 0) views.river = { mode: "orbit", yaw, pitch: 0.6, distance: 24, target: at(i) };
  let best = -1, score = 0;
  for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
    const k = y * W + x;
    if (!wet(k) || s.contamination[k] < 0.95) continue;
    let ok = true;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) { const j = k + dy * W + dx; if (!wet(j) || s.contamination[j] < 0.9 || Math.abs(s.surface[j] - s.surface[k]) > 0.3) { ok = false; break; } }
    if (ok && s.depth[k] > score) { score = s.depth[k]; best = k; }
  }
  if (best >= 0) views.pure = { mode: "orbit", yaw, pitch: 0.95, distance: 14, target: at(best) };
  return views;
}`;

const SITES = [
  { key: "dev", label: "dev" },
  { key: "after", label: SETS.length ? "P15 (held)" : "this PR" },
] as const;
const SCENES = [
  { key: "lake", label: "A lake, grazing" },
  { key: "river", label: "A river" },
  { key: "opening", label: "The game's opening camera" },
  { key: "pure", label: "Pure badwater" },
] as const;

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "water-sky", s.key, ports[s.key]));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const errors: string[] = [];
    const pageFor = async (set: boolean) => {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
      if (set && SETS.length) await context.addInitScript(SET_JS);
      const p = await context.newPage();
      p.on("pageerror", (e) => errors.push(String(e)));
      p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      return p;
    };
    const tool = await browser.newPage();
    // the views, found in this checkout's site and used for both
    let page = await pageFor(true);
    await open(page, ports.after, MAP);
    const views = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW])})`)) as Record<string, View>;
    for (const s of SCENES) if (!views[s.key]) throw new Error(`no view found for ${s.key}`);
    console.log(JSON.stringify(views));
    const got = new Map<string, Buffer>();
    for (const s of SITES) {
      await page.context().close();
      page = await pageFor(s.key === "after");
      await open(page, ports[s.key], MAP);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        for (const v of SCENES) got.set(`${v.key}-${look}-${s.key}`, await shot(page, views[v.key], CLOCK));
      }
    }
    const images: Buffer[] = [];
    const labels: string[] = [];
    for (const v of SCENES)
      for (const look of ["standard", "high"] as const)
        for (const s of SITES) {
          images.push(got.get(`${v.key}-${look}-${s.key}`)!);
          labels.push(`${v.label}: ${look === "standard" ? "Standard" : "High"}, ${s.label}`);
        }
    await grid(tool, images, labels, 4, 0.3, resolve(OUT));
    if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
