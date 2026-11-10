// Craterize's crater before and after a change to its shape (showcase-craft gap 25: terraced walls read as a stadium):
// the same crater, made in the editor as a player makes it (Craterize picked, its walls, centre, debris and rays pinned,
// Power and Size set, one click), on three grounds of our own generated maps at 128²: level ground (Lake Basin 3),
// a plateau (Highlands 412906568, where Caldera Lake was made) and a hillside (River Valley 1), then a large crater on
// level ground and a crater with a peak on the plateau filled as a lake (the lake at the bowl's spill level).
// Each case is one row: the orbit view and the top-down view, dev's crater beside this checkout's.
//
//   git archive --output=.scratch/crater-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/crater-src && tar -xf .scratch/crater-dev.tar -C .scratch/crater-src
//   npx tsx tools/capture-craterize.ts [--dev .scratch/crater-src] [--out docs/sheets/craterize-rim.jpg] [--port 6781]
//
// The installed Chrome draws on the GPU, in Standard.

import { chromium, type Page } from "@playwright/test";
import type { PreviewServer } from "vite";
import { GPU_ARGS, VIEWPORT, grid, site, type View } from "./water-capture";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = arg("dev") ?? ".scratch/crater-src";
const OUT = arg("out") ?? "docs/sheets/craterize-rim.jpg";
const PORT = Number(arg("port") ?? 6781);

interface Ground {
  name: string;
  fragment: string;
  at: [number, number];
  power: number;
  size: number;
  centre: "auto" | "peak" | "ring";
  /** Filled as a lake from the bowl's lowest tile, at its spill level. */
  fill?: boolean;
  /** The orbit's turn and distance, and the top-down's. */
  yaw: number;
  distance: number;
  top: number;
}

const LEVEL = "#s=3&z=128&d=n&t=lakeBasin";
const PLATEAU = "#s=412906568&z=128&d=n&t=highlands";
const GROUNDS: Ground[] = [
  { name: "level ground", fragment: LEVEL, at: [28, 26], power: 55, size: 36, centre: "auto", yaw: 0.5, distance: 46, top: 50 },
  { name: "a plateau", fragment: PLATEAU, at: [84, 92], power: 55, size: 36, centre: "auto", yaw: 0.5, distance: 46, top: 50 },
  { name: "a hillside", fragment: "#s=1&z=128&d=n&t=riverValley", at: [24, 54], power: 55, size: 36, centre: "auto", yaw: 0.5, distance: 46, top: 50 },
  { name: "level ground", fragment: LEVEL, at: [64, 60], power: 85, size: 96, centre: "auto", yaw: 0.5, distance: 134, top: 158 },
  { name: "a plateau, filled", fragment: PLATEAU, at: [84, 92], power: 60, size: 44, centre: "peak", fill: true, yaw: 0.5, distance: 69, top: 80 },
];

async function openMap(page: Page, port: number, fragment: string, centre: Ground["centre"]): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/`);
  // the crater's details pinned, so both sites draw the same crater (D309)
  await page.evaluate((centre) => localStorage.setItem("dgm.forces", JSON.stringify({ craterize: { walls: "terraced", centre, debris: "light", rays: false } })), centre);
  await page.goto("about:blank");
  await page.goto(`http://localhost:${port}/${fragment}`);
  await waitForEditor(page, 600_000);
  await page.getByRole("button", { name: "No more hints" }).click({ timeout: 3000 }).catch(() => undefined);
  await page.evaluate("window.dgmEditor.idle()");
  const gpu = (await page.evaluate("window.dgm3d.renderer.gpu().renderer")) as string;
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) throw new Error(`the browser draws in software (${gpu}): the captures need the GPU`);
}

const ground = (page: Page, at: [number, number]) =>
  page.evaluate(([x, y]) => {
    const m = window.dgm3d!.renderer.mapState()!;
    return m.heights[y * m.W + x];
  }, at) as Promise<number>;

/** The crater, as a player makes it: Craterize picked (Shift+2), Power and Size set, one click. */
async function strike(page: Page, g: Ground): Promise<void> {
  const z = await ground(page, g.at);
  await page.evaluate(([x, y, h, d]) => window.dgm3d!.renderer.setView({ mode: "top", yaw: 0, pitch: Math.PI / 2, distance: d, target: [x + 0.5, h, -(y + 0.5)] }), [g.at[0], g.at[1], z, g.top] as [number, number, number, number]);
  await page.waitForTimeout(400);
  await page.keyboard.press("Shift+Digit2");
  const row = page.getByRole("group", { name: "Craterize options" });
  await row.waitFor();
  await row.getByRole("slider", { name: "Power" }).fill(String(g.power));
  await row.getByRole("slider", { name: "Size" }).fill(String(g.size));
  await page.mouse.move(5, 400);
  const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), g.at);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction("!!window.dgmEditor.force()", null, { timeout: 20_000 });
  await page.waitForFunction("!window.dgmEditor.force()", null, { timeout: 180_000 });
  await page.keyboard.press("Shift+Digit2");
  await page.evaluate("window.dgmEditor.idle()");
  if (g.fill) {
    // the lake, from the crater's lowest tile at the bowl's spill level: the least, over every way out to lower
    // ground past the crater or the map's edge, of the highest ground on the way (the planner's own measure)
    const level = await page.evaluate(async ([cx, cy, R]) => {
      const reach = Math.round(R * 0.7);
      const m = window.dgm3d!.renderer.mapState()!;
      const [W, H, h] = [m.W, m.H, m.heights];
      let start = cy * W + cx;
      for (let v = cy - reach; v <= cy + reach; v++)
        for (let u = cx - reach; u <= cx + reach; u++) if ((u - cx) ** 2 + (v - cy) ** 2 <= reach * reach && h[v * W + u] < h[start]) start = v * W + u;
      const best = new Array<number>(W * H).fill(Infinity);
      best[start] = h[start];
      const queue: [number, number][] = [[h[start], start]];
      let spill: number | null = null;
      while (spill == null && queue.length) {
        queue.sort((p, q) => p[0] - q[0]);
        const [l, i] = queue.shift()!;
        if (l > best[i]) continue;
        const [x, y] = [i % W, Math.floor(i / W)];
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || ((x - cx) ** 2 + (y - cy) ** 2 > (1.6 * R) ** 2 && h[i] < l)) spill = l;
        else
          for (const j of [i - 1, i + 1, i - W, i + W]) {
            const lj = Math.max(l, h[j]);
            if (lj < best[j]) [best[j], queue[queue.length]] = [lj, [lj, j]];
          }
      }
      if (spill != null) await window.dgmEditor!.worker.fillAt(start % W, Math.floor(start / W), spill);
      return spill;
    }, [g.at[0], g.at[1], g.size / 2] as [number, number, number]);
    if (level == null) throw new Error(`${g.name}: no level to fill the crater to`);
    await page.evaluate("window.dgmEditor.idle()");
    await page.waitForTimeout(3000);
  }
  // the canvas alone, the whole window (tools/water-capture.ts `open`)
  await page.addStyleTag({ content: `.view3d { position: fixed !important; left: 0 !important; top: 0 !important; width: ${VIEWPORT.width}px !important; height: ${VIEWPORT.height}px !important; z-index: 2147483647 !important; } .view3d > :not(canvas) { visibility: hidden !important; } .view3d > canvas { width: ${VIEWPORT.width}px !important; height: ${VIEWPORT.height}px !important; }` });
  await page.evaluate("window.dispatchEvent(new Event('resize'))");
  await page.waitForTimeout(500);
}

/** The view alone, the canvas the whole window, from a view. */
async function picture(page: Page, v: View | { mode: "top"; yaw: number; pitch: number; distance: number; target: [number, number, number] }): Promise<Buffer> {
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; r.setView(${JSON.stringify(v)}); r.setClock(12.5); })()`);
  await page.mouse.move(2, 2);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(500);
  await page.evaluate("window.dgm3d.renderer.renderNow()");
  return page.locator(".view3d > canvas").screenshot({ type: "png" });
}

async function main(): Promise<void> {
  const servers: PreviewServer[] = [await site(DEV, "crater-site", "dev", PORT), await site(".", "crater-site", "this", PORT + 1)];
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const images: Buffer[] = [];
    const labels: string[] = [];
    for (const g of GROUNDS) {
      const shots: Record<string, { orbit: Buffer; top: Buffer }> = {};
      for (const [k, label] of [[0, "dev"], [1, "this"]] as const) {
        await openMap(page, PORT + k, g.fragment, g.centre);
        await strike(page, g);
        const z = await ground(page, g.at);
        const target: [number, number, number] = [g.at[0] + 0.5, z, -(g.at[1] + 0.5)];
        shots[label] = {
          orbit: await picture(page, { mode: "orbit", yaw: g.yaw, pitch: (42 * Math.PI) / 180, distance: g.distance, target }),
          top: await picture(page, { mode: "top", yaw: 0, pitch: Math.PI / 2, distance: g.top, target }),
        };
        console.log(`${g.name}: ${label}`);
      }
      images.push(shots.dev.orbit, shots.this.orbit, shots.dev.top, shots.this.top);
      const what = `${g.centre === "auto" ? "" : `${g.centre}, `}Power ${g.power}, Size ${g.size}, on ${g.name}`;
      labels.push(`before: ${what}`, `after: ${what}`, "before, top-down", "after, top-down");
    }
    await grid(page, images, labels, 4, 0.4, OUT);
  } finally {
    await browser.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

await main();
