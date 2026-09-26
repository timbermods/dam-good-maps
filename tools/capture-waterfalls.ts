// Map look, waterfalls with shape and volume (PLAN §20 D201, D215): before and after captures of
// falls, side by side, at the view's default angle and at a low angle, and a greyscale and a
// colour-blindness sheet of the after views; and, with --bench, the frame time and the water's
// remesh time on 256² maps with many falls, before and after (information).
//
//   git archive --output=.scratch/before.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json
//   mkdir -p .scratch/before && tar -xf .scratch/before.tar -C .scratch/before
//   (and the same for the first round, #53 at b00b2fc, into .scratch/first)
//   npx tsx tools/capture-waterfalls.ts [--before .scratch/before] [--first .scratch/first] [--port 4195] [--out docs/look/waterfalls] [--quality 80] [--only gallery,maps]
//   npx tsx tools/capture-waterfalls.ts --bench [--before .scratch/before] [--seconds 6]
//   npx tsx tools/capture-waterfalls.ts --draft [maps] [--clear] [--slice N]
//
// Two kinds of scene, our own renders only:
// - the fall gallery: a small map made here, its water settled by the game's water rules (the
//   canonical settle), with a tall fall, a stepped cascade, a strong wide fall beside a thin weak
//   one, a badwater fall, an L-shaped lip and a staircase lip, all facing the default camera;
// - generated 256² maps, opened in the editor: the tallest fall of Highlands 4, the cascade of
//   Highlands 8, the strongest fall of Canyon 3, a badwater fall of Lake Basin 3, and the whole of
//   Highlands 2 (the generated map with the most falls) from afar. Each view is found on the map
//   (`FIND_JS`).
// The before site is built from --before (a copy of dev's site sources), the after site from this
// checkout; both open in the installed Chrome on the GPU (the Standard look), the same scene drawn
// from the same cameras at the same moment of the water's movement. With --first (a copy of the
// first round's sources, before D215), the views D215 is about (the corner lips, the landing, and
// the fall of Kyler's review, Highlands 4's) are also drawn by it, beside the after site's:
// d215-*.jpg.

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { gallery } from "./waterfall-gallery";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/before");
const OUT = arg("out") ?? "docs/look/waterfalls";
const QUALITY = Number(arg("quality") ?? 80);
const ONLY = arg("only")?.split(",");
const SECONDS = Number(arg("seconds") ?? 6);
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
/** The view's default camera: 30° east of north, 70° down (renderer.ts). */
const DEFAULT_YAW = -Math.PI / 6;
const DEFAULT_PITCH = (70 * Math.PI) / 180;
/** The low angle: 17° above the horizon. */
const LOW_PITCH = 0.3;
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];
/** The sites' ports: --port P serves the after site at P, the before site at P + 1 and the first
 *  round's at P + 2 (on a shared machine, each run its own). */
const PORT = Number(arg("port") ?? 4195);
const AFTER_PORT = PORT;
const BEFORE_PORT = PORT + 1;
const FIRST_PORT = PORT + 2;

type View = { mode: "top" | "orbit"; yaw: number; pitch: number; distance: number; target: [number, number, number] };

// ------------------------------------------------------------------------------ the fall gallery

/** Page side: the gallery drawn by the editor's renderer (its soil as the settle leaves it). */
const GALLERY_JS = `(g) => {
  const r = window.dgm3d.renderer;
  const N = g.W * g.H;
  const tile = [], floor = [], depth = [], cont = [];
  for (let i = 0; i < N; i++) if (g.depth[i] > 0.001) { tile.push(i); floor.push(g.heights[i]); depth.push(g.depth[i]); cont.push(g.contamination[i]); }
  const mb = (v) => v <= 0 ? 0 : Math.max(1, Math.min(255, Math.round(v * 16)));
  const e = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0) };
  r.setMap({ W: g.W, H: g.H, heights: Uint8Array.from(g.heights), columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, entities: e,
    soil: { moisture: Uint8Array.from(g.moisture.map(mb)), contamination: Uint8Array.from(g.soil.map((v) => v <= 0 ? 0 : Math.max(1, Math.min(255, Math.round(v * 255))))) },
    water: { count: tile.length, tile: Int32Array.from(tile), floor: Float32Array.from(floor), depth: Float32Array.from(depth), contamination: Float32Array.from(cont) } }, true);
  r.setClock(${CLOCK});
  return r.lastBuild;
}`;

interface Case {
  id: string;
  name: string;
  views: { key: string; label: string; view: View }[];
  /** Compared with the first round (D215) rather than with dev. */
  d215?: boolean;
}

/** The gallery's views: every fall faces south, toward the default camera. */
function galleryCases(): Case[] {
  /** The default angle, and a low one from the side, to see the arc. */
  const c = (id: string, name: string, target: [number, number, number], distance: number, low: [number, number, number], d215 = false): Case => ({
    id,
    name,
    d215,
    views: [
      { key: "default", label: "default angle", view: { mode: "orbit", yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, distance, target } },
      { key: "low", label: "low angle", view: { mode: "orbit", yaw: low[0], pitch: low[1], distance: low[2], target } },
    ],
  });
  return [
    c("gallery-tall", "a tall fall (11 levels)", [5.5, 8, -14.6], 30, [-1.15, 0.25, 28]),
    c("gallery-cascade", "a stepped cascade (five steps)", [13.5, 7, -18], 24, [-0.3, 0.42, 24]),
    c("gallery-strong-weak", "a strong wide fall (left) and a thin weak one (right)", [29.5, 5, -14.4], 26, [-0.9, 0.28, 26]),
    c("gallery-badwater", "a badwater fall", [41.5, 5, -14.6], 16, [-0.85, 0.3, 17]),
    c("gallery-l-lip", "an L-shaped lip", [52, 4.5, -15.4], 15, [0.6, 0.3, 16], true),
    c("gallery-staircase", "a staircase lip", [71, 4.8, -25.5], 20, [0.3, 0.3, 19], true),
    c("gallery-splash", "where the strong fall lands", [25, 2.6, -13.4], 11, [-0.45, 0.45, 11], true),
  ];
}

// ------------------------------------------------------------------------------ generated maps

interface MapCase {
  id: string;
  name: string;
  fragment: string;
  /** What to find on it: the tallest fall, the longest cascade, a badwater fall, the strongest fall,
 *  or the whole map. */
  find: "tallest" | "cascade" | "badwater" | "strong" | "whole";
  /** Also compared with the first round (D215). */
  d215?: boolean;
}

const MAPS: MapCase[] = [
  { id: "highlands-4-tall", name: "Highlands (4), 256×256: its tallest fall", fragment: "#s=4&z=256&d=n&t=highlands", find: "tallest", d215: true },
  { id: "highlands-8-cascade", name: "Highlands (8), 256×256: a cascade", fragment: "#s=8&z=256&d=n&t=highlands", find: "cascade" },
  { id: "canyon-3-strong", name: "Canyon (3), 256×256: its strongest fall", fragment: "#s=3&z=256&d=n&t=canyon", find: "strong" },
  { id: "lakeBasin-3-badwater", name: "Lake Basin (3), 256×256: badwater falls", fragment: "#s=3&z=256&d=n&t=lakeBasin", find: "badwater" },
  { id: "highlands-2-whole", name: "Highlands (2), 256×256, from afar", fragment: "#s=2&z=256&d=n&t=highlands", find: "whole" },
];

/** Page side: a fall on the map as the renderer holds it (the sides as the water mesher numbers
 *  them: east, west, north, south), and the views of it: at the default pitch and at a low one,
 *  each from the first direction with a clear line of sight over the ground (the default camera's
 *  if it has one, else turned to face the fall), preferring falls that can be seen at a low angle.
 *  For the whole map: from afar, and over the corner of the map with the most falls. */
const FIND_JS = `([what, defaultYaw, defaultPitch, lowPitch]) => {
  const m = window.dgm3d.renderer.map;
  const s = m.surface, W = m.W, H = m.H, hts = m.heights;
  const SX = [1, -1, 0, 0], SY = [0, 0, 1, -1];
  const wet = (i) => s.surface[i] === s.surface[i];
  const falls = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!wet(i)) continue;
    for (let k = 0; k < 4; k++) {
      const xx = x + SX[k], yy = y + SY[k];
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (!wet(j)) continue;
      const drop = s.surface[i] - s.surface[j];
      if (drop >= 0.3) falls.set(x + "," + y + "," + k, { x, y, k, drop, top: s.surface[i], land: s.surface[j], bad: s.contamination[i], depth: s.depth[i] });
    }
  }
  let mean = 0;
  for (let i = 0; i < W * H; i++) mean += hts[i];
  mean /= W * H;
  if (what === "whole") {
    // the 64-tile square with the most falls
    let bx = W / 2, by = H / 2, bn = -1;
    for (let y0 = 0; y0 + 64 <= H; y0 += 16) for (let x0 = 0; x0 + 64 <= W; x0 += 16) {
      let n = 0;
      for (const f of falls.values()) if (f.x >= x0 && f.x < x0 + 64 && f.y >= y0 && f.y < y0 + 64) n++;
      if (n > bn) { bn = n; bx = x0 + 32; by = y0 + 32; }
    }
    let t = 0, c = 0;
    for (let y = by - 32; y < by + 32; y++) for (let x = bx - 32; x < bx + 32; x++) { t += hts[y * W + x]; c++; }
    return { count: falls.size, best: null, views: [
      { key: "default", label: "the whole map, default angle", view: { mode: "orbit", yaw: defaultYaw, pitch: defaultPitch, distance: Math.max(W, H) * 1.6, target: [W / 2, mean, -H / 2] } },
      { key: "mid", label: "its " + bn + " falls nearest together, default angle", view: { mode: "orbit", yaw: defaultYaw, pitch: defaultPitch, distance: 96, target: [bx, t / c, -by] } },
    ] };
  }
  /** Whether the line from a target to a camera clears the ground (past the fall's own cliff). */
  const clear = (target, yaw, pitch, dist) => {
    const cp = Math.cos(pitch);
    const cam = [target[0] + Math.sin(yaw) * cp * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(yaw) * cp * dist];
    for (let q = 1.6 / dist; q <= 1; q += 0.25 / dist) {
      const X = target[0] + (cam[0] - target[0]) * q, Y = target[1] + (cam[1] - target[1]) * q, Z = target[2] + (cam[2] - target[2]) * q;
      const x = Math.floor(X), y = Math.floor(-Z);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (hts[y * W + x] > Y + 0.2) return false;
    }
    return true;
  };
  const viewsOf = (f) => {
    const ox = SX[f.k], oy = SY[f.k];
    const target = [f.x + 0.5 + ox * 0.8, f.land + 0.4 * (f.top - f.land), -(f.y + 0.5 + oy * 0.8)];
    const face = Math.atan2(ox, -oy);
    const d = Math.max(15, f.drop * 2.2 + 9);
    const turns = [0, -0.5, 0.5, -0.9, 0.9, -0.25, 0.25];
    let def = null;
    for (const yaw of [defaultYaw, ...turns.map((a) => face + a)]) if (!def && clear(target, yaw, defaultPitch, d)) def = yaw;
    let low = null;
    for (const pitch of [lowPitch, 0.42, 0.55]) for (const a of [-0.55, 0.55, -0.85, 0.85, -0.3, 0.3, 0]) if (!low && clear(target, face + a, pitch, d)) low = [face + a, pitch];
    return { def, low, target, d };
  };
  // facing the default camera (south, then east or west) counts for a little more
  const facing = [1.1, 1.1, 0.9, 1.2];
  let best = null, score = -1, bestViews = null;
  for (const f of falls.values()) {
    let v = 0;
    if (what === "tallest") v = f.drop;
    else if (what === "badwater") v = f.bad > 0.5 ? f.drop + f.depth : 0;
    else if (what === "strong") v = f.depth * Math.sqrt(f.drop);
    else if (what === "cascade") {
      let n = 1, cx = f.x + SX[f.k], cy = f.y + SY[f.k];
      for (let g = 0; g < 12; g++) {
        const here = falls.has(cx + "," + cy + "," + f.k);
        const on = !here && falls.has((cx + SX[f.k]) + "," + (cy + SY[f.k]) + "," + f.k);
        if (!here && !on) break;
        if (on) { cx += SX[f.k]; cy += SY[f.k]; }
        n++; cx += SX[f.k]; cy += SY[f.k];
      }
      v = n + f.drop * 0.1;
    }
    if (!(v > 0)) continue;
    v *= facing[f.k];
    if (v <= score) continue;
    const vs = viewsOf(f);
    if (vs.def === null || vs.low === null) v *= 0.5;
    if (v > score) { score = v; best = f; bestViews = vs; }
  }
  if (!best) return { count: falls.size, best: null, views: [] };
  const vs = bestViews;
  return { count: falls.size, best, views: [
    { key: "default", label: "default angle", view: { mode: "orbit", yaw: vs.def ?? defaultYaw, pitch: defaultPitch, distance: vs.d, target: vs.target } },
    { key: "low", label: "low angle", view: { mode: "orbit", yaw: vs.low ? vs.low[0] : Math.atan2(SX[best.k], -SY[best.k]) - 0.5, pitch: vs.low ? vs.low[1] : lowPitch, distance: vs.d, target: vs.target } },
  ] };
}`;

type Found = { count: number; best: { x: number; y: number; k: number; drop: number; top: number; land: number } | null; views: { key: string; label: string; view: View }[] };

const findOn = (page: Page, what: MapCase["find"]): Promise<Found> => page.evaluate(`(${FIND_JS})(${JSON.stringify([what, DEFAULT_YAW, DEFAULT_PITCH, LOW_PITCH])})`) as Promise<Found>;

// ------------------------------------------------------------------------------ the pages

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/capture-waterfalls-${label}`);
  console.log(`building the ${label} site…`);
  process.env.DGM_BASE = "/";
  await build({ root, configFile: join(root, "vite.config.ts"), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

async function open(page: Page, port: number, fragment: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/${fragment}`);
  await page.getByText(/All \d+ checks passed/).first().waitFor({ timeout: 300_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 180_000 });
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  // wait for the background check (it may replace the water once)
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
  // only the scene: the view's buttons, the inspector and the handles hidden (whatever holds the
  // view: the page's layout differs between builds)
  await page.addStyleTag({ content: "body * { visibility: hidden !important; } .view3d > canvas { visibility: visible !important; }" });
}

async function shot(page: Page, v: View): Promise<Buffer> {
  await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(v)})`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(250);
  return page.locator(".view3d > canvas").screenshot({ type: "png" });
}

/** Page-side image work: side-by-side pairs, sheets, and the colour transforms (Machado, Oliveira
 *  and Fernandes 2009, severity 1, in linear RGB; greyscale as luminance), as capture-badwater.ts. */
const IMAGES_JS = `async ({ images, labels, cols, scale, quality, transform }) => {
  const imgs = await Promise.all(images.map(async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; }));
  const w = Math.round(imgs[0].width * scale), h = Math.round(imgs[0].height * scale);
  const gap = 6, band = 28;
  const rows = Math.ceil(imgs.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * w + (cols - 1) * gap;
  c.height = rows * (h + band) + (rows - 1) * gap;
  const g = c.getContext("2d");
  g.fillStyle = "#1b1b1b";
  g.fillRect(0, 0, c.width, c.height);
  const M = {
    grey: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
    protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  };
  const table = new Float32Array(256);
  for (let k = 0; k < 256; k++) { const s = k / 255; table[k] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
  const enc = (v) => { const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
  imgs.forEach((img, k) => {
    const x = (k % cols) * (w + gap), y = Math.floor(k / cols) * (h + band + gap);
    g.drawImage(img, x, y + band, w, h);
    const t = transform[k];
    if (t) {
      const m = M[t];
      const d = g.getImageData(x, y + band, w, h);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const r = table[p[i]], gg = table[p[i + 1]], b = table[p[i + 2]];
        p[i] = enc(m[0] * r + m[1] * gg + m[2] * b);
        p[i + 1] = enc(m[3] * r + m[4] * gg + m[5] * b);
        p[i + 2] = enc(m[6] * r + m[7] * gg + m[8] * b);
      }
      g.putImageData(d, x, y + band);
    }
    g.fillStyle = "#f2f2f2";
    g.font = "16px system-ui, sans-serif";
    g.fillText(labels[k], x + 8, y + 19);
  });
  return c.toDataURL("image/jpeg", quality / 100).split(",")[1];
}`;

async function compose(tool: Page, images: Buffer[], labels: string[], cols: number, scale: number, transform: (string | null)[], file: string): Promise<void> {
  let q = QUALITY;
  for (;;) {
    const b64 = (await tool.evaluate(`(${IMAGES_JS})(${JSON.stringify({ images: images.map((b) => b.toString("base64")), labels, cols, scale, quality: q, transform })})`)) as string;
    const buf = Buffer.from(b64, "base64");
    if (buf.length <= 400_000 || q <= 50) {
      writeFileSync(file, buf);
      console.log(`  ${file}: ${Math.round(buf.length / 1024)} KB (quality ${q})`);
      return;
    }
    q -= 5;
  }
}

function checkGpu(renderer: string): void {
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(renderer)) throw new Error(`the browser draws in software (${renderer}): the captures need the GPU`);
}

// ------------------------------------------------------------------------------ the captures

async function main() {
  mkdirSync(OUT, { recursive: true });
  const before = await site(BEFORE, "before", BEFORE_PORT);
  const after = await site(resolve("."), "after", AFTER_PORT);
  const firstDir = arg("first");
  const first = firstDir ? await site(resolve(firstDir), "first", FIRST_PORT) : null;
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const tool = await browser.newPage();
    await tool.goto(`http://localhost:${AFTER_PORT}/`);
    const afterShots: { short: string; png: Buffer; angled: boolean }[] = [];
    const notes: string[] = [];
    const pair = async (id: string, name: string, key: string, label: string, b: Buffer, a: Buffer, d215 = false, sheets = true) => {
      if (d215) await compose(tool, [b, a], [`Before D215 (first round): ${name}, ${label}`, `After D215: ${name}, ${label}`], 2, 0.75, [null, null], join(OUT, `d215-${id.replace(/^gallery-/, "")}-${key}.jpg`));
      else await compose(tool, [b, a], [`Before (dev): ${name}, ${label}`, `After: ${name}, ${label}`], 2, 0.75, [null, null], join(OUT, `${id}-${key}.jpg`));
      // (the sheets are labelled by the pair's file name: the full labels do not fit)
      if (sheets) afterShots.push({ short: `${d215 ? "d215-" : ""}${id.replace(/^gallery-/, d215 ? "" : "gallery-")}-${key}`, png: a, angled: key === "default" });
    };
    if (!ONLY || ONLY.includes("gallery")) {
      const g = gallery();
      const cases = galleryCases().filter((c) => !c.d215 || first);
      const shots: Record<string, Buffer> = {};
      for (const [label, port] of [["after", AFTER_PORT], ["before", BEFORE_PORT], ["first", FIRST_PORT]] as const) {
        if (label === "first" && !first) continue;
        await open(page, port, "#s=1&z=96&d=n&t=riverValley");
        checkGpu((await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string);
        const b = (await page.evaluate(`(${GALLERY_JS})(${JSON.stringify(g)})`)) as { falls?: number; waterQuads: number };
        notes.push(`gallery (${label}): ${b.waterQuads} water quads${b.falls !== undefined ? `, ${b.falls} falls` : ""}`);
        for (const c of cases) {
          if (label === "before" && c.d215) continue;
          if (label === "first" && !c.d215) continue;
          for (const v of c.views) shots[`${label} ${c.id} ${v.key}`] = await shot(page, v.view);
        }
        if (label === "after") {
          // clear water (T, D196, D212): the falls turn to a faint veil
          const v = cases.find((c) => c.id === "gallery-strong-weak")!.views[0].view;
          await page.evaluate("window.dgm3d.renderer.setClearWater(true)");
          shots.clear = await shot(page, v);
          await page.evaluate("window.dgm3d.renderer.setClearWater(false)");
        }
      }
      for (const c of cases) for (const v of c.views) await pair(c.id, `Gallery, ${c.name}`, v.key, v.label, shots[`${c.d215 ? "first" : "before"} ${c.id} ${v.key}`], shots[`after ${c.id} ${v.key}`], c.d215);
      await compose(tool, [shots["after gallery-strong-weak default"], shots.clear], ["Clear water off: the gallery's strong, weak and badwater falls", "Clear water on (T): the same"], 2, 0.75, [null, null], join(OUT, "clear-water.jpg"));
    }
    if (!ONLY || ONLY.includes("maps")) {
      for (const m of MAPS) {
        console.log(m.name);
        await open(page, AFTER_PORT, m.fragment);
        checkGpu((await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string);
        const found = await findOn(page, m.find);
        if (!found.views.length) throw new Error(`${m.name}: no fall found`);
        const views = found.views;
        const b = found.best;
        notes.push(`${m.id}: ${found.count} fall faces${b ? `; the view's fall at tile (${b.x}, ${b.y}), side ${["east", "west", "north", "south"][b.k]}, ${b.drop.toFixed(2)} levels` : ""}`);
        const shotsAfter: Record<string, Buffer> = {};
        for (const v of views) shotsAfter[v.key] = await shot(page, v.view);
        await open(page, BEFORE_PORT, m.fragment);
        for (const v of views) await pair(m.id, m.name, v.key, v.label, await shot(page, v.view), shotsAfter[v.key]);
        if (m.d215 && first) {
          await open(page, FIRST_PORT, m.fragment);
          for (const v of views) await pair(m.id, m.name, v.key, v.label, await shot(page, v.view), shotsAfter[v.key], true, false);
        }
      }
    }
    // the sheets: every after view in greyscale; the default-angle after views in the three simulations
    await compose(tool, afterShots.map((s) => s.png), afterShots.map((s) => `Greyscale: ${s.short}`), 3, 0.34, afterShots.map(() => "grey"), join(OUT, "greyscale.jpg"));
    const angled = afterShots.filter((s) => s.angled);
    const sims = ["deuteranopia", "protanopia", "tritanopia"];
    await compose(
      tool,
      angled.flatMap((s) => sims.map(() => s.png)),
      angled.flatMap((s) => sims.map((t) => `${t[0].toUpperCase()}${t.slice(1)}: ${s.short}`)),
      3,
      0.34,
      angled.flatMap(() => sims),
      join(OUT, "colour-blindness.jpg"),
    );
    mkdirSync(".scratch", { recursive: true });
    writeFileSync(join(".scratch", "capture-waterfalls.txt"), notes.join("\n") + "\n");
    for (const n of notes) console.log(n);
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
    for (const f of ["greyscale.jpg", "colour-blindness.jpg"]) console.log(`${f}: ${statSync(join(OUT, f)).size} bytes`);
  } finally {
    await browser?.close();
    await before.close();
    await after.close();
    await first?.close();
  }
}

// ------------------------------------------------------------------------------ the bench

/** Page side: a 256² hillside of terraces, 3 levels apart every 5 tiles, under a sheet of water
 *  pouring over every terrace edge (not settled: a stress case for drawing falls). */
const TERRACES_JS = `() => {
  const r = window.dgm3d.renderer;
  const W = 256, H = 256, N = W * H;
  const heights = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = 2 + 3 * Math.floor(y / 21);
  const tile = [], floor = [], depth = [], cont = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if ((x >> 4) % 2 === 0) { tile.push(i); floor.push(heights[i]); depth.push(0.25 + 0.1 * ((x * 7 + y * 3) % 5) / 5); cont.push(x > 200 ? 1 : 0); } }
  const e = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0) };
  const view = { W, H, heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, entities: e, water: { count: tile.length, tile: Int32Array.from(tile), floor: Float32Array.from(floor), depth: Float32Array.from(depth), contamination: Float32Array.from(cont) } };
  window.__water = view.water;
  const b = r.setMap(view);
  return b;
}`;

/** Page side: the water's remesh time, for a change everywhere (every chunk) and for a change of
 *  one tile (its chunks), the median of several. */
const REMESH_JS = `() => {
  const r = window.dgm3d.renderer;
  const base = window.__water ?? r.map.water;
  const copy = (w, f) => ({ count: w.count, tile: w.tile.slice(), floor: w.floor.slice(), depth: Float32Array.from(w.depth, f), contamination: w.contamination.slice() });
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const all = [], one = [], chunks = [];
  let k = 0;
  for (let n = 0; n < 7; n++) {
    const v = copy(base, (d) => d + 0.001 * (1 + (n % 2)));
    const t0 = performance.now();
    chunks.push(r.updateWater(v));
    all.push(performance.now() - t0);
  }
  r.updateWater(base);
  const mid = base.count >> 1;
  for (let n = 0; n < 11; n++) {
    const v = copy(base, (d, i) => i === mid ? d + 0.01 * (1 + (n % 2)) : d);
    const t0 = performance.now();
    r.updateWater(v);
    one.push(performance.now() - t0);
  }
  r.updateWater(base);
  return { allMs: med(all), allChunks: chunks[0], oneMs: med(one) };
}`;

/** The machine's other GPU (as bench3d.ts finds it): its LUID for Chrome's --use-adapter-luid. */
async function otherGpu(): Promise<{ name: string; luid: string } | null> {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage();
  await p.goto("chrome://gpu");
  await p.waitForTimeout(1500);
  const text = (await p.evaluate(
    "(() => { const walk = (n) => { let s = ''; if (n.shadowRoot) s += walk(n.shadowRoot); n.childNodes.forEach((c) => { s += c.nodeType === 3 ? c.textContent + '\\n' : walk(c); }); return s; }; return walk(document.body); })()",
  )) as string;
  await b.close();
  for (const line of text.split("\n")) {
    const m = /VENDOR= 0x([0-9a-f]+), DEVICE=0x[0-9a-f]+ \[([^\]]+)\].*LUID=\{(\d+),(\d+)\}(.*)/i.exec(line);
    if (m && m[1] !== "1414" && !/ACTIVE/.test(m[5])) return { name: m[2], luid: `${m[3]},${m[4]}` };
  }
  return null;
}

/** --bench [--gpu other]: on the default GPU, or on the machine's other one with the page's CPU
 *  slowed 4× (a laptop's stand-in, as bench3d.ts's third configuration). */
async function bench(): Promise<void> {
  const before = await site(BEFORE, "before", BEFORE_PORT);
  const after = await site(resolve("."), "after", AFTER_PORT);
  const keepDrawing = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
  const other = arg("gpu") === "other" ? await otherGpu() : null;
  if (arg("gpu") === "other" && !other) throw new Error("no other GPU");
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: [...GPU_ARGS, ...keepDrawing, ...(other ? [`--use-adapter-luid=${other.luid}`] : [])] });
  const rows: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    if (other) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    for (const [label, port] of [["before", BEFORE_PORT], ["after", AFTER_PORT]] as const) {
      for (const scene of ["highlands-2", "terraces"] as const) {
        await open(page, port, "#s=2&z=256&d=n&t=highlands");
        const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
        checkGpu(gpu);
        await page.evaluate("window.dgm3d.renderer.setClock(null)");
        const build = scene === "terraces" ? await page.evaluate(`(${TERRACES_JS})()`) : await page.evaluate("window.dgm3d.renderer.lastBuild");
        const b = build as { ms: number; meshMs: number; waterQuads: number; falls?: number };
        const remesh = (await page.evaluate(`(${REMESH_JS})()`)) as { allMs: number; allChunks: number; oneMs: number };
        await page.evaluate("window.dgm3d.renderer.resetView()");
        await page.waitForTimeout(300);
        const far = (await page.evaluate(`window.dgm3d.renderer.benchOrbit(${SECONDS * 1000})`)) as Record<string, number | null>;
        const info = (await page.evaluate("window.dgm3d.renderer.info()")) as { triangles: number; calls: number };
        // close up: a quarter of the map's width away, over its middle
        await page.evaluate("(() => { const r = window.dgm3d.renderer; const v = r.getView(); r.setView({ distance: 48, target: [128, v.target[1], -128] }); })()");
        await page.waitForTimeout(300);
        const near = (await page.evaluate(`window.dgm3d.renderer.benchOrbit(${SECONDS * 1000})`)) as Record<string, number | null>;
        const fmt = (o: Record<string, number | null>) => `${(o.fps as number).toFixed(0)} fps, frames p50/p95 ${(o.p50 as number).toFixed(1)}/${(o.p95 as number).toFixed(1)} ms, render call ${(o.cpuP50 as number).toFixed(2)}/${(o.cpuP95 as number).toFixed(2)} ms${o.gpuP50 === null ? "" : `, GPU ${(o.gpuP50 as number).toFixed(2)}/${(o.gpuP95 as number).toFixed(2)} ms`}`;
        const row = `${label.padEnd(6)} ${scene.padEnd(11)} build ${b.ms.toFixed(0)} ms (meshing ${b.meshMs.toFixed(0)}), ${b.waterQuads} water quads${b.falls !== undefined ? `, ${b.falls} falls` : ""}, ${info.triangles.toLocaleString()} triangles; water remesh: all ${remesh.allChunks} chunks ${remesh.allMs.toFixed(1)} ms, one tile ${remesh.oneMs.toFixed(2)} ms; orbit whole map: ${fmt(far)}; close up: ${fmt(near)} [${gpu}]`;
        console.log(row);
        rows.push(row);
      }
    }
  } finally {
    await browser.close();
    await before.close();
    await after.close();
  }
  mkdirSync(".scratch", { recursive: true });
  writeFileSync(join(".scratch", `bench-waterfalls${other ? "-other" : ""}.txt`), rows.join("\n") + "\n");
}

/** --draft: the after site's gallery only, each view a PNG in .scratch/waterfalls-draft (for
 *  working on the look). --draft maps adds the generated maps' views. */
async function draft(): Promise<void> {
  const dir = ".scratch/waterfalls-draft";
  mkdirSync(dir, { recursive: true });
  const after = await site(resolve("."), "after", AFTER_PORT);
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    page.on("pageerror", (e) => console.log(`page error: ${e}`));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") console.log(`console: ${m.text().slice(0, 2000)}`);
    });
    await open(page, AFTER_PORT, "#s=1&z=96&d=n&t=riverValley");
    checkGpu((await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string);
    const b = await page.evaluate(`(${GALLERY_JS})(${JSON.stringify(gallery())})`);
    console.log(JSON.stringify(b));
    // --clear: clear water on (T); --slice N: the world sliced at layer N
    if (process.argv.includes("--clear")) await page.evaluate("window.dgm3d.renderer.setClearWater(true)");
    if (arg("slice")) await page.evaluate(`window.dgm3d.renderer.setSlice(${Number(arg("slice"))})`);
    for (const c of galleryCases()) for (const v of c.views) writeFileSync(join(dir, `${c.id}-${v.key}.png`), await shot(page, v.view));
    const extra = (arg("views") ?? "").split(",").filter(Boolean);
    for (const e of extra) {
      const [name, yaw, pitch, distance, x, y, z] = e.split(":");
      writeFileSync(join(dir, `${name}.png`), await shot(page, { mode: "orbit", yaw: Number(yaw), pitch: Number(pitch), distance: Number(distance), target: [Number(x), Number(y), Number(z)] }));
    }
    if (process.argv[process.argv.indexOf("--draft") + 1] === "maps")
      for (const m of MAPS) {
        await open(page, AFTER_PORT, m.fragment);
        const found = await findOn(page, m.find);
        console.log(m.id, found.count, JSON.stringify(found.best), JSON.stringify(found.views.map((v) => v.view)));
        for (const v of found.views) writeFileSync(join(dir, `${m.id}-${v.key}.png`), await shot(page, v.view));
      }
  } finally {
    await browser.close();
    await after.close();
  }
}

if (process.argv.includes("--bench")) await bench();
else if (process.argv.includes("--draft")) await draft();
else await main();
