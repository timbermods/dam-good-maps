// D305 (PLAN §20): one before-and-after pair of editor captures, Standard and High, at a low,
// tilted angle with ruins near and far, showing the far version's fix (the near skeleton's own
// muted colour and a lattice, not a bright orange solid block).
//
//   git archive --output=.scratch/before-ruins.tar HEAD index.html real-places src public vite.config.ts tsconfig.json package.json
//   mkdir -p .scratch/before-ruins && tar -xf .scratch/before-ruins.tar -C .scratch/before-ruins
//   (run this BEFORE the ruin edit is committed, so "before" is the last commit and "after" is the working tree)
//   npx tsx tools/capture-ruins-d305.ts [--before .scratch/before-ruins] [--out docs/look/high]
//
// River Valley 4242, 256², at its own ruin density: two shots at the same low, tilted angle, one
// close on a ruin (its skeleton, unchanged by D305) and one pulled back on another past the switch
// distance (its far block, D305's fix), side by side.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BEFORE = resolve(arg("before") ?? ".scratch/before-ruins");
const OUT = arg("out") ?? "docs/look/high";
const PORT = Number(arg("port") ?? 4971);
const VIEWPORT = { width: 1280, height: 800 };
const CLOCK = 12.5;
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];
const FRAGMENT = "#s=4242&z=256&d=n&t=riverValley";

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/capture-ruins-d305-${label}`);
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

/** Two low, tilted views at the same pitch: close on one ruin (its skeleton fills the frame) and
 *  pulled back on the ruin farthest from it (well past the switch distance, about 122 units at
 *  this camera's 40 degree vertical field of view and 9 px/unit switch point, RUIN_NEAR_PX), so it
 *  reads as its far block, framed alone (no other ruin close enough to clutter the shot). */
const FIND_JS = `() => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H, h = m.heights, e = m.entities;
  const ruins = [];
  for (let j = 0; j < e.count; j++) if (/^RuinColumn/.test(e.templates[e.template[j]])) ruins.push({ x: e.x[j], y: e.y[j] });
  if (ruins.length < 2) return null;
  let a = ruins[0], b = ruins[0], best = 0;
  for (const p of ruins) for (const q of ruins) { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d > best) { best = d; a = p; b = q; } }
  const dist = Math.sqrt(best);
  const ground = (x, y) => h[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))];
  const near = { mode: "orbit", yaw: 0.4, pitch: 0.24, distance: 10, target: [a.x + 0.5, ground(a.x, a.y) + 1.1, -(a.y + 0.5)] };
  const far = { mode: "orbit", yaw: 0.4, pitch: 0.24, distance: 140, target: [b.x + 0.5, ground(b.x, b.y) + 1.1, -(b.y + 0.5)] };
  return { near, far, debug: { count: ruins.length, a, b, dist } };
}`;

async function shot(page: Page, v: unknown): Promise<Buffer> {
  await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(v)})`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(300);
  await page.evaluate("window.dgm3d.renderer.renderNow()");
  return page.locator(".view3d > canvas").screenshot({ type: "png" });
}

const COMPOSE_JS = `async ({ images, labels, cols }) => {
  const imgs = await Promise.all(images.map(async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; }));
  const scale = 0.55;
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
    g.font = "16px system-ui, sans-serif";
    g.fillText(labels[k], x + 8, y + 19);
  });
  return c.toDataURL("image/jpeg", 86).split(",")[1];
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
      const v = (await page.evaluate(`(${FIND_JS})()`)) as { near: unknown; far: unknown; debug: unknown } | null;
      if (!v) throw new Error(`fewer than two ruins found on ${FRAGMENT}`);
      console.log(label, v.debug);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        shots[`${label}-${look}-near`] = await shot(page, v.near);
        shots[`${label}-${look}-far`] = await shot(page, v.far);
      }
    }

    const images = [
      shots["before-standard-near"], shots["before-standard-far"], shots["after-standard-near"], shots["after-standard-far"],
      shots["before-high-near"], shots["before-high-far"], shots["after-high-near"], shots["after-high-far"],
    ];
    const labels = [
      "Standard, near: before D305", "Standard, far: before D305", "Standard, near: after D305", "Standard, far: after D305",
      "High, near: before D305", "High, far: before D305", "High, near: after D305", "High, far: after D305",
    ];
    const b64 = (await tool.evaluate(`(${COMPOSE_JS})(${JSON.stringify({ images: images.map((b) => b.toString("base64")), labels, cols: 4 })})`)) as string;
    writeFileSync(join(OUT, "d305-ruins.jpg"), Buffer.from(b64, "base64"));
    console.log(`${join(OUT, "d305-ruins.jpg")}: ${Math.round(Buffer.from(b64, "base64").length / 1024)} KB`);
  } finally {
    if (browser) await browser.close();
    await Promise.all([before.close?.(), after.close?.()].map((p) => p?.catch(() => {})));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
