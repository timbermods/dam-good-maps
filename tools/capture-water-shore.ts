// The game's still films drawn back from the shore, High's badwater by day and the sources' own pattern (Q9 V3, P7;
// fix/water-shore): dev against this checkout, Standard and High, the same map from the same cameras at the same
// moment: a still lake's shore close up (its films drawn back 0.15 tile, the ground they leave dry), pure badwater a
// level or two deep (High's bed under it now the Standard look's), a badwater source's water and a water seep's in a
// lake (the game's pattern streaming out from them). `--cost` measures instead what a frame costs in each (the view
// drawn and the GPU finished, 120 frames with the water's clock moving, the median and the 95th percentile, ms), close
// up over the seep and from the game's opening camera.
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-water-shore.ts [--dev .scratch/judge-dev] [--out docs/sheets/water-shore.jpg] [--cost]
//
// Our own generated map only; the views are found in this checkout's map (page side) and used for both sites; the seep
// is placed by the same edit on both.

import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/water-shore.jpg";
const PORT = Number(arg("port") ?? 4997);
const CLOCK = 12.5;
const YAW = -Math.PI / 6;
const MAP = arg("map") ?? "#s=2&z=128&d=n&t=highlands";
const COST = process.argv.includes("--cost");

/** Page side: the views and the seep's place. The shore: the most still clean films (under 0.05 deep) beside dry
 *  ground, close (6 away); badwater: the most pure badwater a level or two deep; a badwater source with water over its
 *  middle; the seep: a 2 × 2 of flat lake bed under clean, still water 0.2 to 0.7 deep. */
const FIND_JS = `([yaw]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0;
  const top = (i) => (wet(i) ? s.surface[i] : m.heights[i]);
  const at = (i) => [i % W + 0.5, top(i), -(Math.floor(i / W) + 0.5)];
  const bestOf = (score, r0) => {
    let best = -1, bs = 0;
    for (let y = r0; y < H - r0; y++) for (let x = r0; x < W - r0; x++) {
      let sum = 0;
      for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) sum += score((y + dy) * W + x + dx);
      if (sum > bs) { bs = sum; best = y * W + x; }
    }
    return best;
  };
  const dryBeside = (j) => [1, -1, W, -W].some((d) => !wet(j + d));
  const views = {};
  let i = bestOf((j) => (wet(j) && s.depth[j] < 0.05 && s.contamination[j] < 0.02 && dryBeside(j) ? 1 : 0), 2);
  if (i >= 0) views.shore = { mode: "orbit", yaw, pitch: 0.95, distance: 6, target: at(i) };
  i = bestOf((j) => (wet(j) && s.contamination[j] > 0.9 && s.depth[j] > 0.8 && s.depth[j] < 2.5 ? 1 : 0), 4);
  if (i >= 0) views.bad = { mode: "orbit", yaw, pitch: 0.8, distance: 22, target: at(i) };
  const e = m.entities;
  for (let k = 0; k < e.count; k++) {
    if (e.templates[e.template[k]] !== "BadwaterSource" || !(e.strength[k] > 0)) continue;
    const o = e.orientation[k];
    const x = e.x[k] + (o === 0 || o === 1 ? 1 : -1), y = e.y[k] + (o === 0 || o === 3 ? 1 : -1);
    const j = y * W + x;
    if (wet(j)) { views.source = { mode: "orbit", yaw, pitch: 1.0, distance: 9, target: at(j) }; break; }
  }
  let seep = null;
  const lake = (j) => wet(j) && s.contamination[j] < 0.02 && s.depth[j] > 0.2 && s.depth[j] < 0.7;
  for (let y = 4; y < H - 4 && !seep; y++) for (let x = 4; x < W - 4 && !seep; x++) {
    const js = [y * W + x, y * W + x + 1, (y + 1) * W + x, (y + 1) * W + x + 1];
    if (js.every(lake) && js.every((j) => m.heights[j] === m.heights[js[0]]) && e.x.every((ex, k) => Math.abs(ex - x) > 4 || Math.abs(e.y[k] - y) > 4)) seep = [x, y];
  }
  if (seep) views.seep = { mode: "orbit", yaw, pitch: 1.0, distance: 7, target: [seep[0] + 1, top(seep[1] * W + seep[0]), -(seep[1] + 1)] };
  let bad = 0, sources = 0;
  for (let j = 0; j < W * H; j++) if (wet(j) && s.contamination[j] > 0.5) bad++;
  for (let k = 0; k < e.count; k++) if (/Badwater|Seep/.test(e.templates[e.template[k]])) sources++;
  return { views, seep, bad, sources };
}`;

const SITES = [
  { key: "dev", label: "dev" },
  { key: "after", label: "this PR" },
] as const;
const SCENES = [
  { key: "shore", label: "A still lake's shore, close" },
  { key: "bad", label: "Badwater 1-2 deep, by day" },
  { key: "source", label: "A badwater source" },
  { key: "seep", label: "A water seep in a lake" },
] as const;

/** Page side: `n` frames, each drawn with the water's clock a thirtieth of a second on and the GPU waited for (a pixel
 *  read), timed; the median and the 95th percentile (ms). */
const COST_JS = `async ([n]) => {
  const r = window.dgm3d.renderer;
  const gl = r.gl.getContext();
  const px = new Uint8Array(4);
  const t = [];
  let clock = 20;
  for (let k = 0; k < n + 10; k++) {
    await new Promise((res) => requestAnimationFrame(res));
    const t0 = performance.now();
    r.setClock((clock += 1 / 30));
    r.renderNow();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (k >= 10) t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  return [t[Math.floor(t.length / 2)], t[Math.floor(t.length * 0.95)]];
}`;

/** Place the seep (the same edit on both sites) and wait for the editor to settle. */
async function placeSeep(page: Page, at: [number, number]): Promise<void> {
  await page.evaluate(
    ([x, y]) => window.dgmEditor!.edit({ op: "placeEntity", params: { id: crypto.randomUUID(), template: "WaterSeep", x, y, orientation: "Cw0" } } as never, "Place a seep"),
    at,
  );
  await page.evaluate("window.dgmEditor.idle()");
  await page.waitForTimeout(1500);
}

async function main() {
  const roots: Record<string, string> = { dev: DEV, after: resolve(".") };
  const servers: PreviewServer[] = [];
  const ports: Record<string, number> = {};
  for (const [k, s] of SITES.entries()) {
    ports[s.key] = PORT + k;
    servers.push(await site(roots[s.key], "water-shore", s.key, ports[s.key]));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const errors: string[] = [];
    const pageFor = async () => {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
      const p = await context.newPage();
      p.on("pageerror", (e) => errors.push(String(e)));
      p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      return p;
    };
    const tool = await browser.newPage();
    let page: Page = await pageFor();
    await open(page, ports.after, MAP);
    const found = (await page.evaluate(`(${FIND_JS})(${JSON.stringify([YAW])})`)) as { views: Record<string, View>; seep: [number, number] | null };
    const views = found.views;
    console.log(JSON.stringify(found));
    for (const s of SCENES) if (!views[s.key]) throw new Error(`no view found for ${s.key}`);
    const got = new Map<string, Buffer>();
    for (const s of SITES) {
      await page.context().close();
      page = await pageFor();
      await open(page, ports[s.key], MAP);
      await placeSeep(page, found.seep!);
      for (const look of ["standard", "high"] as const) {
        await setLook(page, look);
        if (COST) {
          for (const v of ["seep", "opening"] as const) {
            const view = v === "opening" ? { ...views.seep, pitch: Math.PI / 3, distance: 32 * 1.3 ** 4 } : views.seep;
            await page.evaluate(`window.dgm3d.renderer.setView(${JSON.stringify(view)})`);
            const [p50, p95] = (await page.evaluate(`(${COST_JS})([120])`)) as number[];
            console.log(`${s.key} ${look} ${v}: a frame ${p50.toFixed(2)} ms (95th percentile ${p95.toFixed(2)})`);
          }
          continue;
        }
        for (const v of SCENES) got.set(`${v.key}-${look}-${s.key}`, await shot(page, views[v.key], CLOCK));
      }
    }
    if (!COST) {
      const images: Buffer[] = [];
      const labels: string[] = [];
      for (const v of SCENES)
        for (const look of ["standard", "high"] as const)
          for (const s of SITES) {
            images.push(got.get(`${v.key}-${look}-${s.key}`)!);
            labels.push(`${v.label}: ${look === "standard" ? "Standard" : "High"}, ${s.label}`);
          }
      await grid(tool, images, labels, 4, 0.3, resolve(OUT));
    }
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
