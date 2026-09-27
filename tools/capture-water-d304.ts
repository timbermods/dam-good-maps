// D304 (PLAN §20): one before-and-after pair of editor captures, Standard and High, showing clean
// water's shades fitted closer to the game's own, beside the sampled game colours as swatches (no
// part of Kyler's screenshot: numbers and swatches only). A second sheet checks clean water and
// badwater stay distinct in greyscale and every colour-blindness simulation.
//
//   git archive --output=.scratch/before-water.tar HEAD index.html real-places src public vite.config.ts tsconfig.json package.json
//   mkdir -p .scratch/before-water && tar -xf .scratch/before-water.tar -C .scratch/before-water
//   (run this BEFORE the palette edit is committed, so "before" is the last commit and "after" is the working tree)
//   npx tsx tools/capture-water-d304.ts [--before .scratch/before-water] [--out docs/look/high]
//
// Lake Basin 3, 256², framed on where badwater meets clean water: it has shallow sheets near its
// banks and deep open pools, and badwater beside clean water for the distinctness check.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { badwaterBody, cleanWaterBody, waterBody, type Rgb } from "../src/render3d/waterPalette";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/before-water");
const OUT = arg("out") ?? "docs/look/high";
const PORT = Number(arg("port") ?? 4961);
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];
const FRAGMENT = "#s=3&z=256&d=n&t=lakeBasin";
const DEFAULT_YAW = -Math.PI / 6;
const DEFAULT_PITCH = (70 * Math.PI) / 180;

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/capture-water-d304-${label}`);
  console.log(`building the ${label} site…`);
  await build({ root, configFile: join(root, "vite.config.ts"), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

async function open(page: Page, port: number): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/${FRAGMENT}`);
  await page.getByText(/All \d+ checks passed/).first().waitFor({ timeout: 600_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout: 300_000 });
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  await page.evaluate(`window.dgm3d.renderer.setClock(${CLOCK})`);
  await page.addStyleTag({ content: "body * { visibility: hidden !important; } .view3d > canvas { visibility: visible !important; }" });
}

async function setLook(page: Page, look: "standard" | "high"): Promise<void> {
  const has = await page.evaluate("typeof window.dgm3d.renderer.setLookChoice === 'function'");
  if (!has) return;
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(look)}, false); })()`);
  await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 120_000 });
  await page.waitForTimeout(400);
}

/** A view where badwater meets clean water, with shallow sheets near the bank and a deep open pool
 *  (the same finder as capture-high.ts's "badwater" want). */
const FIND_JS = `([defaultYaw, defaultPitch]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  const wet = (i) => s.surface[i] === s.surface[i];
  let best = -1, bx = -1, by = -1;
  for (let y = 3; y < H - 3; y += 2) for (let x = 3; x < W - 3; x += 2) {
    let lo = 1, hi = 0, n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const i = (y + dy) * W + x + dx;
      if (!wet(i)) continue;
      n++; lo = Math.min(lo, s.contamination[i]); hi = Math.max(hi, s.contamination[i]);
    }
    const v = n > 20 ? hi - lo : 0;
    if (v > best) { best = v; bx = x; by = y; }
  }
  const h = m.heights;
  return { mode: "orbit", yaw: defaultYaw, pitch: 0.8, distance: 28, target: [bx + 0.5, h[Math.max(0, Math.min(H - 1, by)) * W + Math.max(0, Math.min(W - 1, bx))], -(by + 0.5)] };
}`;

async function shot(page: Page, v: unknown): Promise<Buffer> {
  await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(v)})`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(300);
  await page.evaluate("window.dgm3d.renderer.renderNow()");
  return page.locator(".view3d > canvas").screenshot({ type: "png" });
}

/** Composes a grid of screenshots (each labelled) plus a strip of colour swatches (numbers only,
 *  never a screenshot), and optionally a colour-blindness/greyscale transform per image. */
const COMPOSE_JS = `async ({ images, labels, cols, swatches, transform }) => {
  const imgs = await Promise.all(images.map(async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; }));
  const scale = 0.55;
  const w = Math.round(imgs[0].width * scale), h = Math.round(imgs[0].height * scale);
  const gap = 6, band = 26;
  const rows = Math.ceil(imgs.length / cols);
  const swatchH = swatches ? 78 : 0;
  const c = document.createElement("canvas");
  c.width = cols * w + (cols - 1) * gap;
  c.height = rows * (h + band) + (rows - 1) * gap + swatchH;
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
    const t = transform && transform[k];
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
  if (swatches) {
    const sw = 150, sh = 26, sgap = 40, col = sw + sgap;
    let sx = 10, sy = rows * (h + band) + (rows - 1) * gap + 22;
    g.font = "13px system-ui, sans-serif";
    for (const s of swatches) {
      g.fillStyle = "#f2f2f2";
      g.fillText(s.label, sx, sy - 6);
      g.fillStyle = s.hex;
      g.fillRect(sx, sy, sw, sh);
      g.strokeStyle = "#000";
      g.strokeRect(sx, sy, sw, sh);
      g.fillStyle = "#f2f2f2";
      g.fillText(s.hex, sx, sy + sh + 16);
      sx += col;
    }
  }
  return c.toDataURL("image/jpeg", 86).split(",")[1];
}`;

/** A grid of solid colour swatches (one row per sample, one column per simulation), so clean water
 *  and badwater's distinctness can be read directly off the shared palette's own numbers. */
const CHECKS_JS = `async ({ rows }) => {
  const sims = [["Colour", null], ["Greyscale", "grey"], ["Deuteranopia", "deuteranopia"], ["Protanopia", "protanopia"], ["Tritanopia", "tritanopia"]];
  const M = {
    grey: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
    protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  };
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const enc = (v) => { const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
  const apply = (hex, t) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    if (!t) return \`rgb(\${r},\${g},\${b})\`;
    const m = M[t];
    const lr = lin(r / 255), lg = lin(g / 255), lb = lin(b / 255);
    return \`rgb(\${enc(m[0]*lr+m[1]*lg+m[2]*lb)},\${enc(m[3]*lr+m[4]*lg+m[5]*lb)},\${enc(m[6]*lr+m[7]*lg+m[8]*lb)})\`;
  };
  const labelW = 210, cellW = 190, cellH = 56, headH = 24;
  const c = document.createElement("canvas");
  c.width = labelW + sims.length * cellW;
  c.height = headH + rows.length * cellH;
  const g = c.getContext("2d");
  g.fillStyle = "#1b1b1b";
  g.fillRect(0, 0, c.width, c.height);
  g.font = "13px system-ui, sans-serif";
  sims.forEach(([label], k) => {
    g.fillStyle = "#f2f2f2";
    g.fillText(label, labelW + k * cellW + 8, 17);
  });
  rows.forEach((row, ri) => {
    const y = headH + ri * cellH;
    g.fillStyle = "#f2f2f2";
    g.fillText(row.label, 8, y + cellH / 2 + 4);
    sims.forEach(([, t], k) => {
      g.fillStyle = apply(row.hex, t);
      g.fillRect(labelW + k * cellW + 4, y + 4, cellW - 8, cellH - 8);
    });
  });
  return c.toDataURL("image/jpeg", 90).split(",")[1];
}`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const before = await site(BEFORE, "before", PORT);
  const after = await site(resolve("."), "after", PORT + 1);
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
    const page = await context.newPage();
    const tool = await browser.newPage();
    await tool.goto(`http://localhost:${PORT}/`);

    const shots: Record<string, Buffer> = {};
    for (const [label, port] of [["before", PORT], ["after", PORT + 1]] as const) {
      await open(page, port);
      const v = await page.evaluate(`(${FIND_JS})(${JSON.stringify([DEFAULT_YAW, DEFAULT_PITCH])})`);
      await setLook(page, "standard");
      shots[`${label}-standard`] = await shot(page, v);
      await setLook(page, "high");
      shots[`${label}-high`] = await shot(page, v);
      (shots as unknown as Record<string, unknown>)[`${label}-view`] = v;
    }

    // the sampled game colours (docs/progress/high-look.md): mean sRGB of the shallow/middle/deep
    // samples, hex only (numbers), never a crop of the screenshot
    const swatches = [
      { label: "game: shallow (5 samples)", hex: "#325D6A" },
      { label: "game: middle (5 samples)", hex: "#305965" },
      { label: "game: deep (4 samples)", hex: "#264A58" },
    ];

    const mainImages = [shots["before-standard"], shots["after-standard"], shots["before-high"], shots["after-high"]];
    const mainLabels = ["Standard: before D304", "Standard: after D304", "High: before D304", "High: after D304"];
    const b64main = (await tool.evaluate(`(${COMPOSE_JS})(${JSON.stringify({ images: mainImages.map((b) => b.toString("base64")), labels: mainLabels, cols: 2, swatches })})`)) as string;
    writeFileSync(join(OUT, "d304-water.jpg"), Buffer.from(b64main, "base64"));
    console.log(`${join(OUT, "d304-water.jpg")}: ${Math.round(Buffer.from(b64main, "base64").length / 1024)} KB`);

    // greyscale and colour-blindness: clean water (the new D304 ramp) beside badwater, at the same
    // depths, computed straight from waterPalette.ts (not a screenshot: the actual on-screen mix of
    // shadow, ripples and glints varies, but the body colour these checks turn on is exactly this)
    const hex = (c: Rgb) => `#${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
    const rows: { label: string; hex: string }[] = [
      { label: "clean, shallow", hex: hex(cleanWaterBody(0.05)) },
      { label: "clean, a level deep", hex: hex(cleanWaterBody(1)) },
      { label: "clean, deep", hex: hex(cleanWaterBody(4)) },
      { label: "10% badwater, a level deep", hex: hex(waterBody(1, 0.1)) },
      { label: "50% badwater, a level deep", hex: hex(waterBody(1, 0.5)) },
      { label: "badwater, shallow", hex: hex(badwaterBody(0.1)) },
      { label: "badwater, deep", hex: hex(badwaterBody(3)) },
    ];
    const b64checks = (await tool.evaluate(`(${CHECKS_JS})(${JSON.stringify({ rows })})`)) as string;
    writeFileSync(join(OUT, "d304-water-checks.jpg"), Buffer.from(b64checks, "base64"));
    console.log(`${join(OUT, "d304-water-checks.jpg")}: ${Math.round(Buffer.from(b64checks, "base64").length / 1024)} KB`);
  } finally {
    if (browser) await browser.close();
    await Promise.all([before.close?.(), after.close?.()].map((p) => p?.catch(() => {})));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
