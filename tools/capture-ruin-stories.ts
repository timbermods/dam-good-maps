// Close renders of ruins placed with meaning (D488 (2), gen/ruinStories.ts): each story framed in
// the editor's 3D view, High look, composed into one image.
//
//   npx tsx tools/capture-ruin-stories.ts --maps canyon:2,riverValley:4,lakeBasin:1 [--out docs/sheets/ruins-meaning-close.jpg]
//
// Each map is generated here first (128², Normal) to find its stories' middles; the page then opens
// the same map by its share fragment and frames each story.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { generate } from "../src/core/gen/generate";
import { ruinStories } from "../src/core/gen/ruinStories";
import { decodeSpecFragment } from "../src/core/spec/mapspec";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg("out") ?? "docs/sheets/ruins-meaning-close.jpg";
const PORT = Number(arg("port") ?? 4981);
const VIEWPORT = { width: 1280, height: 800 };
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];
const MAPS = (arg("maps") ?? "canyon:2,lakeBasin:1").split(",").map((m) => {
  const [t, s] = m.split(":");
  return { theme: t, seed: Number(s) };
});

async function open(page: Page, fragment: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/${fragment}`);
  await waitForEditor(page, 600_000);
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  await page.evaluate("window.dgm3d.renderer.setClock(12.5)");
  await page.addStyleTag({ content: "body * { visibility: hidden !important; } .view3d > canvas { visibility: visible !important; }" });
  const has = await page.evaluate("typeof window.dgm3d.renderer.setLookChoice === 'function'");
  if (has) {
    await page.evaluate(`(() => { const r = window.dgm3d.renderer; for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true); r.setLookChoice("high", false); })()`);
    await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 120_000 });
    await page.waitForTimeout(400);
  }
}

async function shot(page: Page, v: unknown): Promise<Buffer> {
  await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(v)})`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(300);
  await page.evaluate("window.dgm3d.renderer.renderNow()");
  return page.locator(".view3d > canvas").screenshot({ type: "png" });
}

const COMPOSE_JS = `async ({ images, labels, cols }) => {
  const imgs = await Promise.all(images.map(async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; }));
  const scale = 0.5;
  const w = Math.round(imgs[0].width * scale), h = Math.round(imgs[0].height * scale);
  const gap = 6, band = 26;
  const rows = Math.ceil(imgs.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * w + (cols - 1) * gap;
  c.height = rows * (h + band) + (rows - 1) * gap;
  const g = c.getContext("2d");
  g.fillStyle = "#1b1b1b";
  g.fillRect(0, 0, c.width, c.height);
  imgs.forEach((img, k) => {
    const x = (k % cols) * (w + gap), y = Math.floor(k / cols) * (h + band + gap);
    g.drawImage(img, x, y + band, w, h);
    g.fillStyle = "#f2f2f2";
    g.font = "15px system-ui, sans-serif";
    g.fillText(labels[k], x + 8, y + 19);
  });
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}`;

async function main() {
  const targets: { fragment: string; label: string; x: number; y: number; z: number }[] = [];
  for (const m of MAPS) {
    const fragment = `#s=${m.seed}&z=128&d=n&t=${m.theme}`;
    const r = generate(decodeSpecFragment(fragment.slice(1))!.spec);
    const W = r.built.W;
    for (const s of ruinStories(r.features, W)) targets.push({ fragment, label: `${m.theme} ${m.seed}: ${s.kind === "dam" ? "ruined dam" : "drowned village"}`, x: s.x, y: s.y, z: r.built.heights[s.y * W + s.x] + r.built.water[s.y * W + s.x] });
  }
  if (!targets.length) throw new Error("no stories on these maps");
  const outDir = resolve(".scratch/capture-ruin-stories");
  await build({ root: resolve("."), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  const server = await preview({ root: resolve("."), base: "/", build: { outDir }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await context.newPage();
    const images: Buffer[] = [];
    const labels: string[] = [];
    let opened = "";
    for (const t of targets) {
      if (opened !== t.fragment) {
        await open(page, t.fragment);
        opened = t.fragment;
      }
      for (const [yaw, pitch, distance, tag] of [
        [0.6, 0.55, 34, "close"],
        [2.4, 0.95, 60, "above"],
      ] as const) {
        images.push(await shot(page, { mode: "orbit", yaw, pitch, distance, target: [t.x + 0.5, t.z, -(t.y + 0.5)] }));
        labels.push(`${t.label}, ${tag}`);
      }
    }
    const tool = await browser.newPage();
    await tool.goto(`http://localhost:${PORT}/`);
    const b64 = (await tool.evaluate(`(${COMPOSE_JS})(${JSON.stringify({ images: images.map((b) => b.toString("base64")), labels, cols: 2 })})`)) as string;
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, Buffer.from(b64, "base64"));
    console.log(`${OUT}: ${Math.round(Buffer.from(b64, "base64").length / 1024)} KB`);
  } finally {
    if (browser) await browser.close();
    await server.close?.().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
