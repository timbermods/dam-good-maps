// Falls as the game draws them (fix/falls-as-slopes; D154 as amended 2026-11-08): dev against this checkout, the lower
// tile's slope (fallSlope.ts, the game's CalculateHeights) in place of dev's vertical curtain. Our own generated maps,
// River Valley and Canyon at 128²: each map's tallest fall and its strongest, seen from the water below it at the game's
// opening pitch (60°) and from lower (35°), near enough to see the fall, in Standard and High, the water's clock held.
// The views are found in this checkout's map (page side) and used for both sites.
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-falls-slopes.ts [--dev .scratch/judge-dev] [--out docs/sheets] [--port 6771]
//   npx tsx tools/capture-falls-slopes.ts --light [...]      the light look (Chrome in software), one fall a map
//   npx tsx tools/capture-falls-slopes.ts --bench [--seconds 6] [--rounds 2]
//
// `--bench` (D453): on 256² maps with many falls (Highlands 2, Canyon 3), in High, headed on the GPU, dev and this
// checkout in turn: the build, the water's whole remesh on the page's thread (`updateWater(…, true)`, every chunk, the
// median of seven), and the frame time orbiting the whole map and close up (`benchOrbit`). Writes
// .scratch/bench-falls-slopes.txt.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const OUT = arg("out") ?? "docs/sheets";
const PORT = Number(arg("port") ?? 6771);
const SECONDS = Number(arg("seconds") ?? 6);
const ROUNDS = Number(arg("rounds") ?? 2);
const CLOCK = 12.5;
const LIGHT = process.argv.includes("--light");

const MAPS = [
  { key: "riverValley", label: "River Valley 2, 128²", fragment: "#s=2&z=128&d=n&t=riverValley" },
  { key: "canyon", label: "Canyon 1, 128²", fragment: "#s=1&z=128&d=n&t=canyon" },
] as const;
const PITCHES = [
  { key: "60", label: "60° (the game's opening)", pitch: (60 * Math.PI) / 180 },
  { key: "35", label: "35°", pitch: (35 * Math.PI) / 180 },
] as const;

/** Page side: the map's falls (a wet tile whose edge neighbour's water stands 0.3 or more under it), its tallest and
 *  its strongest (depth × √drop) at least eight tiles from it, each with a view from the water below it facing the fall,
 *  the first turn whose line of sight clears the ground. */
const FIND_JS = `([pitches]) => {
  const m = window.dgm3d.renderer.map;
  const s = m.surface, W = m.W, H = m.H, hts = m.heights;
  const SX = [1, -1, 0, 0], SY = [0, 0, 1, -1];
  const wet = (i) => s.surface[i] === s.surface[i];
  const falls = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!wet(i)) continue;
    for (let k = 0; k < 4; k++) {
      const j = (y + SY[k]) * W + x + SX[k];
      if (!wet(j)) continue;
      const drop = s.surface[i] - s.surface[j];
      if (drop >= 0.3) falls.push({ x, y, k, drop, top: s.surface[i], land: s.surface[j], depth: s.depth[i] });
    }
  }
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
  const views = (f) => {
    const ox = SX[f.k], oy = SY[f.k];
    const target = [f.x + 0.5 + ox * 0.8, f.land + 0.45 * (f.top - f.land), -(f.y + 0.5 + oy * 0.8)];
    const face = Math.atan2(ox, -oy);
    const d = Math.max(10, f.drop * 1.6 + 8);
    const out = [];
    for (const p of pitches) {
      let yaw = null;
      for (const a of [0, -0.4, 0.4, -0.8, 0.8, -1.2, 1.2]) if (yaw === null && clear(target, face + a, p, d)) yaw = face + a;
      if (yaw === null) return null;
      out.push({ mode: "orbit", yaw, pitch: p, distance: d, target });
    }
    return out;
  };
  const pick = (score, away) => {
    let best = null, bv = -1, bviews = null;
    for (const f of falls) {
      if (away && Math.hypot(f.x - away.x, f.y - away.y) < 8) continue;
      const v = score(f);
      if (v <= bv) continue;
      const vs = views(f);
      if (!vs) continue;
      best = f; bv = v; bviews = vs;
    }
    return best ? { fall: best, views: bviews } : null;
  };
  const tall = pick((f) => f.drop, null);
  const strong = pick((f) => f.depth * Math.sqrt(f.drop), tall && tall.fall);
  return { count: falls.length, tall, strong };
}`;

type Found = { count: number; tall: { fall: { drop: number; x: number; y: number }; views: View[] } | null; strong: { fall: { drop: number; x: number; y: number }; views: View[] } | null };

async function find(page: Page): Promise<Found> {
  return (await page.evaluate(`(${FIND_JS})(${JSON.stringify([PITCHES.map((p) => p.pitch)])})`)) as Found;
}

async function captures(): Promise<void> {
  const servers: PreviewServer[] = [await site(DEV, "falls-slopes", "dev", PORT + 1), await site(resolve("."), "falls-slopes", "after", PORT)];
  const ports = { dev: PORT + 1, after: PORT };
  const args = LIGHT ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : GPU_ARGS;
  const browser = await chromium.launch({ channel: "chrome", headless: true, args });
  const errors: string[] = [];
  try {
    const tool = await browser.newPage();
    for (const map of MAPS) {
      const page = await (await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" })).newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await open(page, ports.after, map.fragment);
      const found = await find(page);
      console.log(`${map.label}: ${found.count} falls; tallest ${found.tall?.fall.drop.toFixed(2)} at ${found.tall?.fall.x},${found.tall?.fall.y}; strongest ${found.strong?.fall.drop.toFixed(2)} at ${found.strong?.fall.x},${found.strong?.fall.y}`);
      const cases = [
        { key: "tall", label: `tallest fall (${found.tall?.fall.drop.toFixed(1)})`, f: found.tall },
        { key: "strong", label: `strongest fall (${found.strong?.fall.drop.toFixed(1)})`, f: found.strong },
      ].filter((c) => c.f) as { key: string; label: string; f: NonNullable<Found["tall"]> }[];
      const looks = LIGHT ? (["light"] as const) : (["standard", "high"] as const);
      const got = new Map<string, Buffer>();
      for (const site of ["dev", "after"] as const) {
        await open(page, ports[site], map.fragment);
        for (const look of looks) {
          if (look !== "light") await setLook(page, look);
          for (const c of LIGHT ? cases.slice(0, 1) : cases) for (const [n, p] of PITCHES.entries()) got.set(`${c.key}-${p.key}-${look}-${site}`, await shot(page, c.f.views[n], CLOCK));
        }
      }
      await page.context().close();
      const images: Buffer[] = [];
      const labels: string[] = [];
      for (const c of LIGHT ? cases.slice(0, 1) : cases)
        for (const p of PITCHES)
          for (const look of looks)
            for (const site of ["dev", "after"] as const) {
              images.push(got.get(`${c.key}-${p.key}-${look}-${site}`)!);
              labels.push(`${c.label}, ${p.label}: ${look === "standard" ? "Standard" : look === "high" ? "High" : "Light"}, ${site === "dev" ? "dev (a curtain)" : "this PR (a slope)"}`);
            }
      await grid(tool, images, labels, LIGHT ? 2 : 4, LIGHT ? 0.5 : 0.4, join(OUT, `falls-slopes-${map.key}${LIGHT ? "-light" : ""}.jpg`));
    }
    if (errors.length) console.log(`page errors:\n${[...new Set(errors)].join("\n")}`);
  } finally {
    await browser.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

/** Page side: the water's whole remesh on the page's thread, the median of seven (each a hair's change of every
 *  depth, so every chunk is drawn again). */
const REMESH_JS = `() => {
  const r = window.dgm3d.renderer;
  const base = r.map.water;
  const copy = (w, k) => ({ ...w, depth: Float32Array.from(w.depth, (d) => d + 0.0005 * k) });
  const t = [];
  for (let n = 1; n <= 7; n++) {
    const v = copy(base, n % 2 ? 1 : 2);
    const t0 = performance.now();
    r.updateWater(v, true);
    t.push(performance.now() - t0);
  }
  r.updateWater(base, true);
  t.sort((a, b) => a - b);
  return t[3];
}`;

async function bench(): Promise<void> {
  const servers: PreviewServer[] = [await site(DEV, "falls-slopes", "dev", PORT + 1), await site(resolve("."), "falls-slopes", "after", PORT)];
  const ports = { dev: PORT + 1, after: PORT };
  const keepDrawing = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: [...GPU_ARGS, ...keepDrawing] });
  const rows: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'high'); } catch {}");
    const page = await context.newPage();
    const fmt = (o: Record<string, number | null>) => `p50/p95 ${(o.p50 as number).toFixed(1)}/${(o.p95 as number).toFixed(1)} ms, render call ${(o.cpuP50 as number).toFixed(2)}/${(o.cpuP95 as number).toFixed(2)} ms${o.gpuP50 === null || o.gpuP50 === undefined ? "" : `, GPU ${(o.gpuP50 as number).toFixed(2)}/${(o.gpuP95 as number).toFixed(2)} ms`}`;
    for (let round = 0; round < ROUNDS; round++)
      for (const fragment of ["#s=2&z=256&d=n&t=highlands", "#s=3&z=256&d=n&t=canyon"])
        for (const label of ["dev", "after"] as const) {
          await open(page, ports[label], fragment);
          await setLook(page, "high");
          const look = (await page.evaluate("window.dgm3d.renderer.lookNow")) as string;
          await page.evaluate("window.dgm3d.renderer.setClock(null)");
          const b = (await page.evaluate("window.dgm3d.renderer.lastBuild")) as { ms: number; meshMs: number; waterQuads: number };
          const remesh = (await page.evaluate(`(${REMESH_JS})()`)) as number;
          await page.evaluate("window.dgm3d.renderer.resetView()");
          await page.waitForTimeout(500);
          const far = (await page.evaluate(`window.dgm3d.renderer.benchOrbit(${SECONDS * 1000})`)) as Record<string, number | null>;
          await page.evaluate("(() => { const r = window.dgm3d.renderer; const v = r.getView(); r.setView({ distance: 48, target: [128, v.target[1], -128] }); })()");
          await page.waitForTimeout(500);
          const near = (await page.evaluate(`window.dgm3d.renderer.benchOrbit(${SECONDS * 1000})`)) as Record<string, number | null>;
          const row = `${label.padEnd(5)} ${fragment.padEnd(28)} ${look}: build ${b.ms.toFixed(0)} ms (meshing ${b.meshMs.toFixed(0)}), ${b.waterQuads} water quads; water remesh (all chunks, page thread) ${remesh.toFixed(1)} ms; orbit whole map ${fmt(far)}; close up ${fmt(near)}`;
          console.log(row);
          rows.push(row);
        }
  } finally {
    await browser.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
  mkdirSync(".scratch", { recursive: true });
  writeFileSync(".scratch/bench-falls-slopes.txt", rows.join("\n") + "\n");
}

(process.argv.includes("--bench") ? bench() : captures()).catch((e) => {
  console.error(e);
  process.exit(1);
});
