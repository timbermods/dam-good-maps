// Contaminated ground and badwater by day (D154, D334, D496 as amended 2026-11-07; fix/ground-veins): dev against this
// checkout, Standard and High, the same map from the same cameras: contaminated dry earth close up, where contaminated
// ground meets grass, a wide view on a held Badtide day, and pure badwater by day. What moved: the veins are the game's
// pattern (a dense network of thin rusty cracks, no glow) where dev drew sparse glowing red fissures; badwater and
// clean water take the water's own diffuse share and the reflection's head-on part where the game's formula draws them.
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-ground-veins.ts [--dev .scratch/judge-dev] [--out docs/sheets/ground-veins.jpg]
//
// Our own generated map only; the views are found in this checkout's map (page side) and used for both sites.

import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/ground-veins.jpg";
const PORT = Number(arg("port") ?? 4993);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;
const MAP = "#s=4242&z=256&d=n&t=riverValley";

/** Page side: the views. Contaminated dry ground (the most contaminated dry tiles round a point, level, no water within
 *  eight tiles); where contaminated ground meets grass (both near, none wet); pure badwater (the deepest tile whose 7×7
 *  is all wet and nearly all bad); and, on a held Badtide day, the widest spread of contaminated ground. */
const FIND_JS = `([yaw, which]) => {
  const r = window.dgm3d.renderer;
  const m = r.mapState(), W = m.W, H = m.H, h = m.heights, soil = m.soil, s = m.surface;
  // (the water is by column: a tile's surface column is top[i], -1 where dry)
  const col = (i) => s.top[i];
  const wet = (i) => col(i) >= 0 && s.depth[col(i)] > 0.05;
  const at = (i, y) => [i % W + 0.5, y, -(Math.floor(i / W) + 0.5)];
  const views = {};
  const scan = (R, score, step = 1) => {
    let best = -1, bs = -1;
    for (let y = R + 2; y < H - R - 2; y += step) for (let x = R + 2; x < W - R - 2; x += step) {
      const v = score(x, y, R);
      if (v > bs) { bs = v; best = y * W + x; }
    }
    return best;
  };
  const count = (x, y, R, f) => { let n = 0; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (f((y + dy) * W + x + dx)) n++; return n; };
  const flat = (x, y, R) => count(x, y, R, (i) => h[i] !== h[y * W + x]) === 0;
  if (which === "own") {
    // (the close views are found on the day the map opens, and drawn on it)
    const dryBad = (i) => !wet(i) && soil.contamination[i] > 0 && soil.moisture[i] === 0;
    const d = scan(3, (x, y, R) => (flat(x, y, R) && count(x, y, R + 5, wet) === 0 ? count(x, y, R, dryBad) : -1));
    if (d >= 0) views.dry = { mode: "orbit", yaw, pitch: 0.95, distance: 9, target: at(d, h[d]) };
    const bad = (i) => !wet(i) && soil.contamination[i] > 0;
    const grass = (i) => !wet(i) && soil.contamination[i] === 0 && soil.moisture[i] > 30;
    const k = scan(3, (x, y, R) => (flat(x, y, R) && count(x, y, R, wet) === 0 ? Math.min(count(x, y, R, bad), count(x, y, R, grass)) : -1));
    if (k >= 0) views.grass = { mode: "orbit", yaw, pitch: 0.95, distance: 11, target: at(k, h[k]) };
  }
  // pure badwater: the most tiles of badwater (nine tenths bad or more) round a point, on the day the map opens or, if
  // it has little, on the held Badtide day
  if (which === "own" || !views.pure) {
    const pure = (i) => wet(i) && s.contamination[col(i)] >= 0.9;
    const k = scan(4, (x, y, R) => (pure(y * W + x) ? count(x, y, R, pure) : -1), 2);
    if (k >= 0 && count(k % W, Math.floor(k / W), 4, pure) >= 40) views.pure = { mode: "orbit", yaw, pitch: 0.95, distance: 18, target: at(k, s.surface[col(k)]), held: which !== "own" };
  }
  if (which !== "own") {
    const k = scan(10, (x, y, R) => count(x, y, R, (i) => !wet(i) && soil.contamination[i] > 0), 3);
    if (k >= 0) views.wide = { mode: "orbit", yaw, pitch: 0.85, distance: 48, target: at(k, h[k]) };
  }
  return views;
}`;

/** Hold a Badtide (the Water time bar's button, under the canvas laid over the page: found among hidden elements,
 *  pressed by its event), until its day is drawn. */
async function holdBadtide(page: Page): Promise<void> {
  const bar = page.getByRole("toolbar", { name: "Water time", includeHidden: true });
  await bar.getByRole("button", { name: "Badtide", exact: true, includeHidden: true }).dispatchEvent("click");
  await page.waitForTimeout(800);
  await page.waitForFunction(() => !document.querySelector(".day-fill"), null, { timeout: 900_000 });
  await page.waitForTimeout(2500);
}

const SITES = [
  { key: "dev", label: "dev" },
  { key: "after", label: "this PR" },
] as const;
const SCENES = [
  { key: "dry", label: "Contaminated dry earth" },
  { key: "grass", label: "Contamination meeting grass" },
  { key: "wide", label: "A held Badtide, wide" },
  { key: "pure", label: "Badwater by day" },
] as const;

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "ground-veins", s.key, ports[s.key]));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const tool = await browser.newPage();
    await open(page, ports.after, MAP);
    const views = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW, "own"])})`)) as Record<string, View>;
    await holdBadtide(page);
    // (the held day's views; pure badwater's only if the opening day had too little of it)
    const held = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW, "held"])})`)) as Record<string, View>;
    views.wide = held.wide;
    views.pure ??= held.pure;
    const pureHeld = !!(views.pure as View & { held?: boolean } | undefined)?.held;
    for (const s of SCENES) if (!views[s.key]) throw new Error(`no view found for ${s.key}`);
    const got = new Map<string, Buffer>();
    for (const s of SITES) {
      for (const look of ["standard", "high"] as const) {
        await open(page, ports[s.key], MAP);
        await setLook(page, look);
        for (const v of SCENES) if (v.key !== "wide" && !(v.key === "pure" && pureHeld)) got.set(`${v.key}-${look}-${s.key}`, await shot(page, views[v.key], CLOCK));
        await holdBadtide(page);
        await setLook(page, look);
        got.set(`wide-${look}-${s.key}`, await shot(page, views.wide, CLOCK));
        if (pureHeld) got.set(`pure-${look}-${s.key}`, await shot(page, views.pure, CLOCK));
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
