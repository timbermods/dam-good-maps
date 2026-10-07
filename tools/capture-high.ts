// The High look (Map look 2; PLAN §20 D284) for Kyler's eye (D115, D145): the same views in Standard
// and in High, side by side, on this machine's GPU, and a greyscale and a colour-blindness sheet of
// the High views; and the proof that Standard is unchanged: every view drawn in the Standard look by
// dev's site and by this checkout's, compared pixel for pixel.
//
//   git archive --output=.scratch/before.tar <the branch's base on dev> index.html real-places src public vite.config.ts tsconfig.json package.json
//   mkdir -p .scratch/before && tar -xf .scratch/before.tar -C .scratch/before
//   npx tsx tools/capture-high.ts [--before .scratch/before] [--port 4951] [--out docs/look/high] [--only a,b]
//   npx tsx tools/capture-high.ts --identity [--before .scratch/before]   (the Standard comparison only,
//     with dev's site drawn twice as the baseline: two page loads differ a little, as the water settles)
//
// Our own renders only: generated maps opened in the editor, each view found on the map (`FIND_JS`),
// the water held at one moment and the wind with it, the page's buttons hidden. The camera is placed
// for each capture; the product never moves it by itself (D265).

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/before");
const OUT = arg("out") ?? "docs/look/high";
const ONLY = arg("only")?.split(",");
const QUALITY = Number(arg("quality") ?? 82);
const PORT = Number(arg("port") ?? 4951);
/** Only the Standard comparison, with a baseline: dev's site drawn twice (two page loads) beside
 *  dev's against this checkout's. */
const IDENTITY = process.argv.includes("--identity");
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];
const DEFAULT_YAW = -Math.PI / 6;
const DEFAULT_PITCH = (70 * Math.PI) / 180;

type View = { mode: "top" | "orbit"; yaw: number; pitch: number; distance: number; target: [number, number, number] };
type Want = "whole" | "start" | "forest" | "edge" | "fall" | "badwater" | "cliff" | "ruins" | "top";

interface MapCase {
  id: string;
  name: string;
  fragment: string;
  views: Want[];
}

const MAPS: MapCase[] = [
  { id: "riverValley-4242-256", name: "River Valley 4242, 256²", fragment: "#s=4242&z=256&d=n&t=riverValley", views: ["whole", "start", "forest", "edge", "top"] },
  { id: "highlands-2-256", name: "Highlands 2, 256² (the most falls)", fragment: "#s=2&z=256&d=n&t=highlands", views: ["whole", "fall", "cliff"] },
  { id: "lakeBasin-3-256", name: "Lake Basin 3, 256² (badwater)", fragment: "#s=3&z=256&d=n&t=lakeBasin", views: ["badwater", "ruins"] },
  { id: "delta-5-128", name: "Delta 5, 128²", fragment: "#s=5&z=128&d=n&t=delta", views: ["whole", "forest"] },
];

const LABELS: Record<Want, string> = {
  whole: "the whole map, the default camera",
  start: "the start, close",
  forest: "the densest forest, close",
  edge: "the map's west edge, low",
  fall: "the tallest fall's landing",
  badwater: "where badwater meets clean water",
  cliff: "the tallest cliff, low",
  ruins: "ruins and landmarks, close",
  top: "top-down",
};

/** Page side: the views of a map, found on it. */
const FIND_JS = `([wants, defaultYaw, defaultPitch]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H, h = m.heights, e = m.entities;
  const wet = (i) => s.surface[i] === s.surface[i];
  let mean = 0; for (let i = 0; i < W * H; i++) mean += h[i]; mean /= W * H;
  const around = (x, y, d, pitch, yaw) => ({ mode: "orbit", yaw: yaw ?? defaultYaw, pitch: pitch ?? defaultPitch, distance: d, target: [x + 0.5, h[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))], -(y + 0.5)] });
  const out = {};
  for (const w of wants) {
    if (w === "whole") out[w] = { mode: "orbit", yaw: defaultYaw, pitch: defaultPitch, distance: Math.max(W, H) * 1.6, target: [W / 2, mean, -H / 2] };
    else if (w === "top") out[w] = { mode: "top", yaw: 0, pitch: defaultPitch, distance: Math.max(W, H) * 1.25, target: [W / 2, mean, -H / 2] };
    else if (w === "start") {
      let k = -1; for (let j = 0; j < e.count; j++) if (e.templates[e.template[j]] === "StartingLocation") k = j;
      out[w] = k >= 0 ? around(e.x[k] + 1, e.y[k] + 1, 26, 0.72) : null;
    } else if (w === "forest" || w === "ruins") {
      // the 16-tile square with the most trees (or ruins and landmarks)
      const n = new Float32Array(Math.ceil(W / 8) * Math.ceil(H / 8));
      const cw = Math.ceil(W / 8);
      for (let j = 0; j < e.count; j++) {
        const t = e.templates[e.template[j]];
        const hit = w === "forest" ? /^(Pine|Birch|Oak|BlueberryBush)$/.test(t) : /^(RuinColumn|UndergroundRuins|.*Relic$|GeothermalField|Thorns|Slope|NaturalDam|Blockage|WaterSource|BadwaterSource)/.test(t);
        if (hit) n[Math.floor(e.y[j] / 8) * cw + Math.floor(e.x[j] / 8)] += 1;
      }
      let best = 0, bi = -1;
      for (let i = 0; i < n.length; i++) { const x = i % cw, y = Math.floor(i / cw); const v = n[i] + (n[i + 1] ?? 0) + (n[i + cw] ?? 0) + (n[i + cw + 1] ?? 0); if (x < cw - 1 && y < Math.ceil(H / 8) - 1 && v > best) { best = v; bi = i; } }
      out[w] = bi >= 0 ? around((bi % cw) * 8 + 8, Math.floor(bi / cw) * 8 + 8, 30, 0.62) : null;
    } else if (w === "edge") {
      // the west edge (the sunny side) at its wettest or highest stretch, from low down and outside
      let best = -1, by = H / 2;
      for (let y = 8; y < H - 8; y++) { const i = y * W; const v = (wet(i) ? 20 : 0) + h[i]; if (v > best) { best = v; by = y; } }
      out[w] = { mode: "orbit", yaw: -Math.PI / 2 + 0.45, pitch: 0.22, distance: 30, target: [0, h[by * W] * 0.6, -(by + 0.5)] };
    } else if (w === "fall") {
      let best = -1, v = null;
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; if (!wet(i)) continue; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const j = (y + dy) * W + x + dx; if (!wet(j)) continue; const drop = s.surface[i] - s.surface[j]; if (drop > best) { best = drop; v = { mode: "orbit", yaw: Math.atan2(dx, -dy) - 0.5, pitch: 0.42, distance: Math.max(18, drop * 2.4 + 9), target: [x + 0.5 + dx * 1.2, s.surface[j] + drop * 0.3, -(y + 0.5 + dy * 1.2)] }; } } }
      out[w] = v;
    } else if (w === "badwater") {
      // a wet tile whose neighbourhood mixes clean and bad water the most
      let best = -1, bx = -1, by = -1;
      for (let y = 3; y < H - 3; y += 2) for (let x = 3; x < W - 3; x += 2) { let lo = 1, hi = 0, n = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const i = (y + dy) * W + x + dx; if (!wet(i)) continue; n++; lo = Math.min(lo, s.contamination[i]); hi = Math.max(hi, s.contamination[i]); } const v = n > 20 ? hi - lo : 0; if (v > best) { best = v; bx = x; by = y; } }
      out[w] = bx >= 0 ? around(bx, by, 28, 0.8) : null;
    } else if (w === "cliff") {
      let best = -1, bx = W / 2, by = H / 2, byaw = 0;
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const d = h[i] - h[(y + dy) * W + x + dx]; if (d > best) { best = d; bx = x + dx; by = y + dy; byaw = Math.atan2(dx, -dy); } } }
      out[w] = { mode: "orbit", yaw: byaw, pitch: 0.28, distance: 32, target: [bx + 0.5, h[by * W + bx] + best * 0.5, -(by + 0.5)] };
    }
  }
  return out;
}`;

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/capture-high-${label}`);
  console.log(`building the ${label} site…`);
  process.env.DGM_BASE = "/";
  await build({ root, configFile: join(root, "vite.config.ts"), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

async function open(page: Page, port: number, fragment: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/${fragment}`);
  await waitForEditor(page, 600_000);
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
  await page.addStyleTag({ content: "body * { visibility: hidden !important; } .view3d > canvas { visibility: visible !important; }" });
}

/** The look drawn: Standard, or High with every effect (the site before the High look has only
 *  Standard). */
async function setLook(page: Page, look: "standard" | "high"): Promise<void> {
  const has = await page.evaluate("typeof window.dgm3d.renderer.setLookChoice === 'function'");
  if (!has) return;
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(look)}, false); })()`);
  await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 120_000 });
  await page.waitForTimeout(400);
}

/** The frame at a view, as PNG bytes; its pixels read back are kept in the page (`__px`) for the
 *  comparison. */
async function shot(page: Page, v: View): Promise<{ png: Buffer; size: string }> {
  await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(v)})`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(300);
  // the frame read back as drawn (a digest of it goes to the comparison)
  const size = (await page.evaluate(`(() => {
    const r = window.dgm3d.renderer;
    r.renderNow();
    const g = r.gl.getContext();
    const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
    g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
    window.__px = px;
    return g.drawingBufferWidth + "x" + g.drawingBufferHeight;
  })()`)) as string;
  const png = await page.locator(".view3d > canvas").screenshot({ type: "png" });
  return { png, size };
}

/** Page side: side-by-side pairs and sheets, greyscale and the colour-blindness simulations (Machado,
 *  Oliveira and Fernandes 2009, severity 1, in linear RGB), as capture-waterfalls.ts. */
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

async function compose(tool: Page, images: Buffer[], labels: string[], cols: number, scale: number, transform: (string | null)[], file: string, most = 450_000): Promise<void> {
  let q = QUALITY;
  for (;;) {
    const b64 = (await tool.evaluate(`(${IMAGES_JS})(${JSON.stringify({ images: images.map((b) => b.toString("base64")), labels, cols, scale, quality: q, transform })})`)) as string;
    const buf = Buffer.from(b64, "base64");
    if (buf.length <= most || q <= 50) {
      writeFileSync(file, buf);
      console.log(`  ${file}: ${Math.round(buf.length / 1024)} KB (quality ${q})`);
      return;
    }
    q -= 5;
  }
}

/** Page side: this page's last read-back frame against the given one's (from the other site). */
const COMPARE_JS = `(other) => {
  const a = window.__px;
  const b = Uint8Array.from(atob(other), (c) => c.charCodeAt(0));
  if (a.length !== b.length) return { same: false, share: 1, max: 255, note: "sizes differ" };
  let n = 0, max = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > max) max = d; }
  return { same: n === 0, share: n / a.length, max };
}`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const after = await site(resolve("."), "after", PORT);
  const before = await site(BEFORE, "before", PORT + 1);
  let browser: Browser | null = null;
  const notes: string[] = [];
  const identity: { view: string; share: number; max: number; same: boolean }[] = [];
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    // the Standard look held to begin with (the after site would pick High by itself)
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const tool = await browser.newPage();
    await tool.goto(`http://localhost:${PORT}/`);
    const highShots: { label: string; png: Buffer; angled: boolean }[] = [];
    if (IDENTITY) {
      const read = async () => (await page.evaluate(`(() => { const a = window.__px; let s = ""; const step = 0x8000; for (let i = 0; i < a.length; i += step) s += String.fromCharCode.apply(null, Array.from(a.subarray(i, i + step))); return btoa(s); })()`)) as string;
      for (const m of MAPS) {
        if (ONLY && !ONLY.includes(m.id)) continue;
        console.log(m.name);
        await open(page, PORT + 1, m.fragment);
        const views = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([m.views, DEFAULT_YAW, DEFAULT_PITCH])})`)) as Record<Want, View | null>;
        const dev: Record<string, string> = {};
        for (const w of m.views) if (views[w]) (await shot(page, views[w]!), (dev[w] = await read()));
        for (const [label, port] of [["dev again", PORT + 1], ["this checkout", PORT]] as const) {
          await open(page, port, m.fragment);
          for (const w of m.views) {
            if (!views[w]) continue;
            await shot(page, views[w]!);
            const c = (await page.evaluate(`(${COMPARE_JS})(${JSON.stringify(dev[w])})`)) as { same: boolean; share: number; max: number };
            identity.push({ view: `${m.id} ${w}: dev against ${label}`, ...c });
          }
        }
      }
      writeFileSync(join(".scratch", "capture-high-identity.json"), JSON.stringify({ identity, errors }, null, 2) + "\n");
      for (const r of identity) console.log(`  ${r.view}: ${r.same ? "identical" : `${(r.share * 100).toFixed(4)}% of values differ, by at most ${r.max}`}`);
      return;
    }
    for (const m of MAPS) {
      if (ONLY && !ONLY.includes(m.id)) continue;
      console.log(m.name);
      await open(page, PORT, m.fragment);
      const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
      if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`the browser draws in software (${gpu})`);
      const views = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([m.views, DEFAULT_YAW, DEFAULT_PITCH])})`)) as Record<Want, View | null>;
      const std: Record<string, Buffer> = {};
      for (const w of m.views) {
        const v = views[w];
        if (!v) {
          notes.push(`${m.id}: no ${w} view found`);
          continue;
        }
        std[w] = (await shot(page, v)).png;
      }
      // the same views in High
      await setLook(page, "high");
      const high: Record<string, Buffer> = {};
      for (const w of m.views) if (views[w]) high[w] = (await shot(page, views[w]!)).png;
      const stats = await page.evaluate("window.dgm3d.renderer.highStats");
      notes.push(`${m.id}: ${JSON.stringify(stats)}`);
      // Standard again in this checkout, then in dev's site: pixel for pixel
      await setLook(page, "standard");
      const ours: Record<string, string> = {};
      for (const w of m.views) {
        if (!views[w]) continue;
        await shot(page, views[w]!);
        ours[w] = (await page.evaluate(`(() => { const a = window.__px; let s = ""; const step = 0x8000; for (let i = 0; i < a.length; i += step) s += String.fromCharCode.apply(null, Array.from(a.subarray(i, i + step))); return btoa(s); })()`)) as string;
      }
      await open(page, PORT + 1, m.fragment);
      for (const w of m.views) {
        if (!views[w]) continue;
        await shot(page, views[w]!);
        const c = (await page.evaluate(`(${COMPARE_JS})(${JSON.stringify(ours[w])})`)) as { same: boolean; share: number; max: number };
        identity.push({ view: `${m.id} ${w}`, ...c });
      }
      for (const w of m.views) {
        if (!views[w]) continue;
        await compose(tool, [std[w], high[w]], [`Standard: ${m.name}, ${LABELS[w]}`, `High: ${m.name}, ${LABELS[w]}`], 2, 0.75, [null, null], join(OUT, `${m.id}-${w}.jpg`));
        highShots.push({ label: `${m.id} ${w}`, png: high[w], angled: w !== "top" });
      }
    }
    // the sheets: every High view in greyscale; the angled ones in the three simulations
    await compose(tool, highShots.map((s) => s.png), highShots.map((s) => `Greyscale: ${s.label}`), 3, 0.34, highShots.map(() => "grey"), join(OUT, "greyscale.jpg"), 900_000);
    const angled = highShots.filter((s) => s.angled).slice(0, 8);
    const sims = ["deuteranopia", "protanopia", "tritanopia"];
    await compose(tool, angled.flatMap((s) => sims.map(() => s.png)), angled.flatMap((s) => sims.map((t) => `${t[0].toUpperCase()}${t.slice(1)}: ${s.label}`)), 3, 0.3, angled.flatMap(() => sims), join(OUT, "colour-blindness.jpg"), 1_400_000);
    mkdirSync(".scratch", { recursive: true });
    writeFileSync(join(".scratch", "capture-high.json"), JSON.stringify({ identity, notes, errors }, null, 2) + "\n");
    console.log("\nStandard, dev against this checkout:");
    for (const r of identity) console.log(`  ${r.view}: ${r.same ? "identical" : `${(r.share * 100).toFixed(4)}% of values differ, by at most ${r.max}`}`);
    for (const n of notes) console.log(n);
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
    for (const f of ["greyscale.jpg", "colour-blindness.jpg"]) console.log(`${f}: ${statSync(join(OUT, f)).size} bytes`);
  } finally {
    await browser?.close();
    await before.close();
    await after.close();
  }
}

await main();
