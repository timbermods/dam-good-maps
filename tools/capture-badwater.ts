// Map look, badwater blends into clean water (PLAN §20 D177): before and after captures of where
// badwater meets clean water, from above and from the view's default angle, side by side, and a
// greyscale and a colour-blindness sheet of the after views; on River Valley 4242, also the tint
// views, centred in the middle of the water partly bad.
//
//   git archive --output=.scratch/before.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json
//   mkdir -p .scratch/before && tar -xf .scratch/before.tar -C .scratch/before
//   npx tsx tools/capture-badwater.ts [--before .scratch/before] [--out docs/look/badwater-blend] [--quality 80]
//   npx tsx tools/capture-badwater.ts --measure
//
// The before site is built from --before (a copy of dev's site sources), the after site from this
// checkout; both are opened in the installed Chrome (drawing on the GPU: the view's full look, not
// the light look of software rendering), the same map in each opened in the editor, and drawn from
// the same cameras at the same moment of the water's movement. Each map's view is centred where
// its badwater meets clean water: the water tiles with the most change of badwater share round
// them, with clean water and badwater both near. Our own generated maps only.
//
// --measure measures the water's colours on screen instead, with the method and against the
// targets of the shared water palette (waterPalette.ts WATER_CALIBRATION, as #38's colour check):
// the site's own renderer on the GPU, its canvas the method's size, a bed of water one badwater
// share and depth all over. It prints each target's bands, measured and wanted, and a table of
// shares and depths; it fails when a target misses.

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { WATER_CALIBRATION } from "../src/render3d/waterPalette";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/before");
const OUT = arg("out") ?? "docs/look/badwater-blend";
const QUALITY = Number(arg("quality") ?? 80);
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
/** The view's default camera: 30° east of north, 70° down (renderer.ts). */
const DEFAULT_YAW = -Math.PI / 6;
const DEFAULT_PITCH = (70 * Math.PI) / 180;

interface MapCase {
  id: string;
  name: string;
  fragment: string;
  /** Camera distance: from above (the top view's scale) and at the default angle. */
  top: number;
  angled: number;
  /** Also the tint views: the middle of the water partly bad, near where it meets clean water. */
  tint?: boolean;
}

const MAPS: MapCase[] = [
  { id: "riverValley-4242-256", name: "River Valley (4242), 256×256", fragment: "#s=4242&z=256&d=n&t=riverValley", top: 50, angled: 46, tint: true },
  { id: "delta-4242-256", name: "Delta (4242), 256×256", fragment: "#s=4242&z=256&d=n&t=delta", top: 50, angled: 46 },
  { id: "riverValley-5-128", name: "River Valley (5), 128×128", fragment: "#s=5&z=128&d=n&t=riverValley", top: 40, angled: 38 },
  { id: "delta-5-128", name: "Delta (5), 128×128", fragment: "#s=5&z=128&d=n&t=delta", top: 40, angled: 38 },
];

type View = { mode: "top" | "orbit"; yaw: number; pitch: number; distance: number; target: [number, number, number] };

/** Where the map's badwater meets clean water (page side: a string, so no bundler helpers). */
const FRONT_JS = `() => {
  const m = window.dgm3d.renderer.map;
  const s = m.surface;
  const W = m.W, H = m.H;
  const c = s.contamination, sf = s.surface, dep = s.depth;
  const wet = (i) => sf[i] === sf[i] && dep[i] > 0.1;
  const front = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!wet(i)) continue;
      for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < H ? i + W : -1]) {
        if (j < 0 || !wet(j) || Math.abs(sf[j] - sf[i]) > 0.35) continue;
        const d = Math.abs(c[j] - c[i]);
        front[i] += d;
        front[j] += d;
      }
    }
  let best = -1, score = 0;
  for (let y = 8; y < H - 8; y += 2)
    for (let x = 8; x < W - 8; x += 2) {
      if (!wet(y * W + x)) continue;
      let sum = 0, clean = false, bad = false;
      for (let dy = -10; dy <= 10; dy++)
        for (let dx = -10; dx <= 10; dx++) {
          const j = (y + dy) * W + x + dx;
          if (y + dy < 0 || y + dy >= H || x + dx < 0 || x + dx >= W || !wet(j)) continue;
          if (Math.abs(dx) <= 6 && Math.abs(dy) <= 6) sum += front[j];
          if (c[j] < 0.05) clean = true;
          if (c[j] > 0.6) bad = true;
        }
      if (clean && bad && sum > score) { score = sum; best = y * W + x; }
    }
  if (best < 0) return null;
  const x = best % W, y = Math.floor(best / W);
  return { tile: [x, y], target: [x + 0.5, sf[best], -(y + 0.5)], score };
}`;

/** The middle of the map's water partly bad (35–50% bad, and no clean water or
 *  badwater within 4 tiles), nearest the given tile (page side). */
const TINT_JS = `([tx, ty]) => {
  const m = window.dgm3d.renderer.map;
  const s = m.surface;
  const W = m.W, H = m.H;
  const c = s.contamination, sf = s.surface, dep = s.depth;
  const wet = (i) => sf[i] === sf[i] && dep[i] > 0.1;
  let best = -1, dist = Infinity;
  for (let y = 4; y < H - 4; y++)
    for (let x = 4; x < W - 4; x++) {
      const i = y * W + x;
      if (!wet(i) || c[i] < 0.35 || c[i] > 0.5) continue;
      let ok = true;
      for (let dy = -4; dy <= 4 && ok; dy++)
        for (let dx = -4; dx <= 4 && ok; dx++) {
          const j = i + dx + dy * W;
          if (wet(j) && Math.abs(sf[j] - sf[i]) < 0.35 && (c[j] < 0.15 || c[j] > 0.7)) ok = false;
        }
      const d = Math.hypot(x - tx, y - ty);
      if (ok && d < dist) { dist = d; best = i; }
    }
  if (best < 0) return null;
  const x = best % W, y = Math.floor(best / W);
  return { tile: [x, y], share: c[best], target: [x + 0.5, sf[best], -(y + 0.5)] };
}`;

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/capture-badwater-${label}`);
  console.log(`building the ${label} site…`);
  process.env.DGM_BASE = "/";
  await build({ root, configFile: join(root, "vite.config.ts"), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

async function open(page: Page, port: number, m: MapCase): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/${m.fragment}`);
  await page.getByText(/All \d+ checks passed/).first().waitFor({ timeout: 240_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 180_000 });
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  // wait for the background check (it may replace the water once)
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
  // only the scene: the view's buttons, the inspector and the handles hidden
  await page.addStyleTag({ content: ".view3d > :not(canvas), .editor-map > :not(.view3d) { visibility: hidden !important; }" });
}

async function shot(page: Page, v: View): Promise<Buffer> {
  await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(v)})`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(250);
  return page.locator(".editor-view canvas").screenshot({ type: "png" });
}

/** Page-side image work: side-by-side pairs, sheets, and the colour transforms (Machado, Oliveira
 *  and Fernandes 2009, severity 1, in linear RGB; greyscale as luminance), as capture-look.ts. */
const IMAGES_JS = `async ({ kind, images, labels, cols, scale, quality, transform }) => {
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

/** Page side: a uniform bed of water in the editor's renderer (its soil as contaminated as the
 *  water), measured as the calibration's method says: each band's mean over the central patch. */
const MEASURE_JS = `([share, depth, pitch, floor, m]) => {
  const r = window.dgm3d.renderer;
  const W = m.bed, N = W * W;
  const tile = new Int32Array(N);
  for (let i = 0; i < N; i++) tile[i] = i;
  const e = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0) };
  r.setMap({ W, H: W, heights: new Uint8Array(N).fill(floor), columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, entities: e,
    soil: { moisture: new Uint8Array(N), contamination: new Uint8Array(N).fill(Math.round(share * 255)) },
    water: { count: N, tile, floor: new Float32Array(N).fill(floor), depth: new Float32Array(N).fill(depth), contamination: new Float32Array(N).fill(share) } }, true);
  r.setClock(m.time);
  r.setView({ mode: "orbit", target: [W / 2, floor + depth, -W / 2], distance: m.distance, yaw: m.yaw, pitch });
  r.renderNow();
  const gl = r.gl.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const p = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, p);
  const px = [];
  const [pw, ph] = m.patch;
  for (let y = (h >> 1) - (ph >> 1); y < (h >> 1) + (ph >> 1); y++)
    for (let x = (w >> 1) - (pw >> 1); x < (w >> 1) + (pw >> 1); x++) { const i = (y * w + x) * 4; px.push([p[i], p[i + 1], p[i + 2]]); }
  px.sort((a, b) => a[0] + 2 * a[1] + a[2] - (b[0] + 2 * b[1] + b[2]));
  const bands = {};
  for (const [name, [lo, hi]] of Object.entries(m.bands)) {
    const s = px.slice(Math.floor(px.length * lo), Math.floor(px.length * hi));
    bands[name] = [0, 1, 2].map((c) => s.reduce((t, q) => t + q[c], 0) / s.length);
  }
  return { bands, size: [w, h], renderer: r.gpu().renderer };
}`;

async function measure() {
  const M = WATER_CALIBRATION.method;
  const after = await site(resolve("."), "after", 4194);
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  let missed = 0;
  try {
    // the calibration's targets are the Standard look's (badwater from #38's approval before the
    // High look existed; clean water from D304's own approval): held here, or a GPU capable of the
    // High look would pick it by itself and measure the wrong look entirely (found investigating
    // the badwater targets' drift, PLAN §20 D304's addition)
    const context = await browser.newContext({ viewport: { width: M.viewport[0], height: M.viewport[1] }, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
    const page = await context.newPage();
    await open(page, 4194, { id: "", name: "", fragment: "#s=1&z=96&d=n&t=riverValley", top: 0, angled: 0 });
    // the view's canvas the method's size, over the whole page
    await page.addStyleTag({ content: `.editor-view canvas { position: fixed !important; left: 0 !important; top: 0 !important; width: ${M.viewport[0]}px !important; height: ${M.viewport[1]}px !important; z-index: 9999 !important; }` });
    await page.waitForTimeout(300);
    const hex = (c: readonly number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lstar = (c: readonly number[]) => {
      const y = 0.2126 * lin(c[0] / 255) + 0.7152 * lin(c[1] / 255) + 0.0722 * lin(c[2] / 255);
      return (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y).toFixed(1);
    };
    const run = async (share: number, depth: number, pitch: number) => {
      const r = (await page.evaluate(`(${MEASURE_JS})(${JSON.stringify([share, depth, pitch, WATER_CALIBRATION.floor(depth), M])})`)) as { bands: Record<string, number[]>; size: [number, number]; renderer: string };
      if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(r.renderer)) throw new Error(`the browser draws in software (${r.renderer})`);
      if (r.size[0] !== M.viewport[0] || r.size[1] !== M.viewport[1]) throw new Error(`the canvas is ${r.size.join(" × ")}, not ${M.viewport.join(" × ")}`);
      return r.bands;
    };
    console.log("targets (method: waterPalette.ts WATER_CALIBRATION):");
    for (const t of WATER_CALIBRATION.targets) {
      const bands = await run(t.share, t.depth, t.pitch);
      for (const [band, want] of Object.entries(t.bands)) {
        const got = bands[band];
        const err = Math.max(...got.map((v, c) => Math.abs(Math.round(v) - want[c])));
        const ok = err <= M.tolerance;
        if (!ok) missed++;
        console.log(`  ${t.name}, ${band}: ${hex(got)} (L* ${lstar(got)}), wanted ${hex(want)}: ${ok ? "within" : "off by"} ${err}`);
      }
    }
    console.log("shares and depths, 70° down (body band; lightest band):");
    for (const share of [0, 0.1, 0.25, 0.5, 0.75, 1])
      for (const depth of [0.25, 0.8, 1.25, 4.25]) {
        const b = await run(share, depth, 1.22);
        console.log(`  share ${share}, ${depth} deep: ${hex(b.body)} (L* ${lstar(b.body)}); ${hex(b.streak)} (L* ${lstar(b.streak)})`);
      }
  } finally {
    await browser.close();
    await after.close();
  }
  if (missed) throw new Error(`${missed} calibrated colours missed their targets`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const before = await site(BEFORE, "before", 4193);
  const after = await site(resolve("."), "after", 4194);
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
    // Standard held: the "before" site has no High look, but the "after" one might pick it by
    // itself on a capable GPU, and this capture is of the Standard look's badwater blend (D177)
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const tool = await browser.newPage();
    await tool.goto(`http://localhost:4194/`);
    const afterShots: { m: MapCase; view: string; png: Buffer }[] = [];
    const notes: string[] = [];
    for (const m of MAPS) {
      console.log(`${m.name}`);
      await open(page, 4194, m);
      const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
      if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`the browser draws in software (${gpu}): the captures need the GPU`);
      const front = (await page.evaluate(`(${FRONT_JS})()`)) as { tile: [number, number]; target: [number, number, number] } | null;
      if (!front) throw new Error(`${m.name}: no badwater meets clean water`);
      notes.push(`${m.id}: centred on tile (${front.tile.join(", ")}); ${gpu}`);
      const views: Record<string, View> = {
        top: { mode: "top", yaw: 0, pitch: DEFAULT_PITCH, distance: m.top, target: front.target },
        angled: { mode: "orbit", yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, distance: m.angled, target: front.target },
      };
      type Tint = { tile: [number, number]; share: number; target: [number, number, number] };
      const tint = m.tint ? ((await page.evaluate(`(${TINT_JS})(${JSON.stringify(front.tile)})`)) as Tint | null) : null;
      if (m.tint) {
        if (!tint) throw new Error(`${m.name}: no stretch of water partly bad`);
        notes.push(`${m.id}: the tint views centred on tile (${tint.tile.join(", ")}), ${Math.round(tint.share * 100)}% bad`);
        views["tint-top"] = { mode: "top", yaw: 0, pitch: DEFAULT_PITCH, distance: m.top * 0.7, target: tint.target };
        views["tint-angled"] = { mode: "orbit", yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, distance: m.angled * 0.7, target: tint.target };
      }
      const shotsAfter: Record<string, Buffer> = {};
      for (const [k, v] of Object.entries(views)) shotsAfter[k] = await shot(page, v);
      await open(page, 4193, m);
      for (const [k, v] of Object.entries(views)) {
        const b = await shot(page, v);
        const where = k.endsWith("top") ? "from above" : "at the default angle";
        const what = k.startsWith("tint") ? `${m.name}, water ${Math.round(tint!.share * 100)}% bad, ${where}` : `${m.name}, ${where}`;
        const file = k.startsWith("tint") ? `tint-${m.id}-${k.slice(5)}.jpg` : `${m.id}-${k}.jpg`;
        await compose(tool, [b, shotsAfter[k]], [`Before (dev): ${what}`, `After: ${what}`], 2, 0.75, [null, null], join(OUT, file));
        if (!k.startsWith("tint")) afterShots.push({ m, view: k, png: shotsAfter[k] });
      }
    }
    // the sheets: every after view in greyscale; the angled after views in the three simulations
    const grey = afterShots;
    await compose(tool, grey.map((s) => s.png), grey.map((s) => `Greyscale: ${s.m.name}, ${s.view === "top" ? "from above" : "default angle"}`), 2, 0.5, grey.map(() => "grey"), join(OUT, "greyscale.jpg"));
    const angled = afterShots.filter((s) => s.view === "angled");
    const sims = ["deuteranopia", "protanopia", "tritanopia"];
    await compose(
      tool,
      angled.flatMap((s) => sims.map(() => s.png)),
      angled.flatMap((s) => sims.map((t) => `${t[0].toUpperCase()}${t.slice(1)}: ${s.m.name}`)),
      3,
      0.42,
      angled.flatMap(() => sims),
      join(OUT, "colour-blindness.jpg"),
    );
    writeFileSync(join(".scratch", "capture-badwater.txt"), notes.join("\n") + "\n");
    for (const n of notes) console.log(n);
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
    for (const f of ["greyscale.jpg", "colour-blindness.jpg"]) console.log(`${f}: ${statSync(join(OUT, f)).size} bytes`);
  } finally {
    await browser?.close();
    await before.close();
    await after.close();
  }
}

if (process.argv.includes("--measure")) await measure();
else await main();
