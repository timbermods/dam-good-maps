// The foam in the Flow view alone (planning's ruling on #236, 2026-11-08, under D497): dev against this checkout, a fast
// river of River Valley 128² seed 2 close up and at the game's 55° pitch from 35 units, Standard and High with the
// Flow view off and on, the water's clock held; and the light look (a software browser) the same. It prints, for each
// look and view, the pixels this checkout's frame differs from dev's (Flow off: the foam gone; Flow on: none), their
// mean and largest L* change, the bake's time in the worker with the Flow view off and on, and the programs a first
// switch to the Flow view compiles.
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-foam-flow.ts [--dev .scratch/judge-dev] [--out docs/sheets/foam-flow.jpg] [--port 6791]

import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets/foam-flow.jpg";
const PORT = Number(arg("port") ?? 6791);
const CLOCK = 12.5;
const MAP = "#s=2&z=128&d=n&t=riverValley";
/** The game's camera pitch (55°). */
const PITCH = (55 * Math.PI) / 180;

/** Page side: the fastest narrow clean river (its 5×5 7 to 15 tiles wet, level), close up and from 35 units. */
const FIND_JS = `([pitch]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const at = (i) => [i % W + 0.5, s.surface[i], -(Math.floor(i / W) + 0.5)];
  const speed = (i) => { const o = s.outflow, k = s.top[i]; return o && k >= 0 ? Math.hypot(o[k * 4 + 3] - o[k * 4 + 1], o[k * 4 + 2] - o[k * 4]) : 0; };
  let best = -1, score = 0;
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
    const i = y * W + x;
    if (!wet(i) || s.contamination[i] > 0.02) continue;
    let n = 0, level = true;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * W + dx; if (wet(j)) { n++; if (Math.abs(s.surface[j] - s.surface[i]) > 0.3) level = false; } }
    const v = n >= 7 && n <= 15 && level ? speed(i) : 0;
    if (v > score) { score = v; best = i; }
  }
  if (best < 0) return null;
  // (the camera looking down the current)
  const k = s.top[best], o = s.outflow;
  const yaw = Math.atan2(o[k * 4 + 3] - o[k * 4 + 1], -(o[k * 4 + 2] - o[k * 4])) + 0.4;
  return { close: { mode: "orbit", yaw, pitch, distance: 16, target: at(best) }, wide: { mode: "orbit", yaw, pitch, distance: 35, target: at(best) } };
}`;

/** Page side: the pixels two PNGs differ by (any channel over 2 levels) and their L* change, mean and largest. */
const DIFF_JS = `async ([a, b]) => {
  const load = async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d"); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
  const p = await load(a), q = await load(b);
  const L = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const y = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y; };
  let n = 0, sum = 0, most = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])) <= 2) continue;
    const d = L(q[i], q[i + 1], q[i + 2]) - L(p[i], p[i + 1], p[i + 2]);
    n++; sum += d; most = Math.max(most, Math.abs(d));
  }
  return { pixels: n, share: n / (p.length / 4), meanL: n ? sum / n : 0, mostL: most };
}`;

type Look = "standard" | "high" | "light";

/** The Flow view on or off, its bake waited for. */
async function setFlow(page: Page, on: boolean): Promise<void> {
  await page.evaluate(`window.dgm3d.renderer.setFlow(${on})`);
  await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 60_000 });
  await page.waitForTimeout(400);
}

async function main() {
  const servers = [await site(DEV, "foam-flow", "dev", PORT), await site(resolve("."), "foam-flow", "after", PORT + 1)];
  const browsers: Browser[] = [];
  try {
    const gpu = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
    const soft = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    browsers.push(gpu, soft);
    const tool = await gpu.newPage();
    const errors: string[] = [];
    const page = async (b: Browser) => {
      const p = await (await b.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" })).newPage();
      p.on("pageerror", (e) => errors.push(String(e)));
      p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      return p;
    };
    const gp = await page(gpu);
    const sp = await page(soft);
    // the views, found once in this checkout's water
    await open(gp, PORT + 1, MAP);
    const views = (await gp.evaluate(`(${FIND_JS})(${JSON.stringify([PITCH])})`)) as Record<"close" | "wide", View> | null;
    if (!views) throw new Error("no fast river found");
    const got = new Map<string, Buffer>();
    const facts: Record<string, unknown> = {};
    for (const [k, port] of [["dev", PORT], ["after", PORT + 1]] as const) {
      for (const [p, looks] of [[gp, ["standard", "high"]], [sp, ["light"]]] as [Page, Look[]][]) {
        await open(p, port, MAP);
        // (the programs a first switch to the Flow view compiles, once the warm-up is done)
        if (looks[0] === "standard") {
          await p.waitForFunction("window.dgm3d.renderer.programsWarm", null, { timeout: 120_000 });
          await setFlow(p, false);
          const before = (await p.evaluate("window.dgm3d.renderer.gl.info.programs.length")) as number;
          const offMs = (await p.evaluate("window.dgm3d.renderer.motionStats?.ms ?? null")) as number | null;
          await setFlow(p, true);
          await p.evaluate("window.dgm3d.renderer.renderNow()");
          const after = (await p.evaluate("window.dgm3d.renderer.gl.info.programs.length")) as number;
          const on = (await p.evaluate("window.dgm3d.renderer.motionStats")) as { ms: number; lanes: number; wakes: number; seams: number; triangles: number } | null;
          facts[`${k} first Flow switch`] = { compiled: after - before, bakeMsFlowOff: offMs, bakeMsFlowOn: on?.ms ?? null, shapes: on };
          await setFlow(p, false);
        }
        for (const look of looks) {
          if (look !== "light") await setLook(p, look);
          else {
            const drawn = await p.evaluate("window.dgm3d.renderer.look");
            if (drawn !== "light") throw new Error(`the software browser draws ${drawn}, not the light look`);
          }
          for (const flow of [false, true]) {
            await setFlow(p, flow);
            for (const v of ["close", "wide"] as const) got.set(`${look}-${v}-${flow ? "on" : "off"}-${k}`, await shot(p, views[v], CLOCK));
          }
        }
      }
    }
    // the numbers: this checkout against dev, Flow off and on
    for (const look of ["standard", "high", "light"] as const)
      for (const v of ["close", "wide"] as const)
        for (const f of ["off", "on"] as const) {
          const a = got.get(`${look}-${v}-${f}-dev`)!.toString("base64");
          const b = got.get(`${look}-${v}-${f}-after`)!.toString("base64");
          facts[`${look} ${v} Flow ${f}: after vs dev`] = await tool.evaluate(`(${DIFF_JS})(${JSON.stringify([a, b])})`);
        }
    console.log(JSON.stringify(facts, null, 2));
    // the sheet: each look's close view, dev and this checkout, Flow off and on; the wide views below
    const images: Buffer[] = [];
    const labels: string[] = [];
    const name = { standard: "Standard", high: "High", light: "Light" };
    for (const v of ["close", "wide"] as const)
      for (const look of ["standard", "high", "light"] as const)
        for (const [f, k, label] of [["off", "dev", "dev, Flow off"], ["off", "after", "this PR, Flow off"], ["on", "after", "this PR, Flow on"]] as const) {
          images.push(got.get(`${look}-${v}-${f}-${k}`)!);
          labels.push(`${name[look]}, ${v === "close" ? "close up" : "35 units"}: ${label}`);
        }
    await grid(tool, images, labels, 3, 0.4, resolve(OUT));
    if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
  } finally {
    for (const b of browsers) await b.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
