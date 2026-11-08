// How much of a generated map's land the game draws bare (D504): the share of its dry land tiles whose
// soil holds no moisture (the game's desert texture over the whole top, palette.ts `DESERT`) and that
// no plant stands on, overall, in its worst 64² block, and the side of its largest square of bare
// tiles; with each map's generate seconds.
//
//   npx tsx tools/bare-share.ts [--themes riverValley,canyon] [--seeds 1-4] [--size 256] [--jobs 4] [--json out.json] [--pictures dir]
//
// --pictures writes each map top-down as contact-sheet.ts --soil draws it (north up, the start in red), with an
// index.json tools/contact-sheet.py lays out.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n: string, f: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};

interface Row {
  theme: string;
  seed: number;
  passed: boolean;
  bare: number;
  worstBlock: number;
  largestSquare: number;
  water: number;
  sec: number;
  error?: string;
}

async function main(): Promise<void> {
  const themes = arg("themes", "riverValley,lakeBasin,canyon,highlands,islands,delta,any").split(",");
  const [a, b] = arg("seeds", "1-4").split("-").map(Number);
  const size = Number(arg("size", "256"));
  const jobs: { theme: string; seed: number }[] = [];
  for (const theme of themes) for (let seed = a; seed <= (b ?? a); seed++) jobs.push({ theme, seed });
  const u = (p: string) => JSON.stringify(pathToFileURL(join(ROOT, p)).href);
  const file = join(ROOT, ".scratch", `.dgm-bare-${process.pid}.mjs`);
  mkdirSync(dirname(file), { recursive: true });
  if (arg("pictures", "")) mkdirSync(arg("pictures", ""), { recursive: true });
  writeFileSync(
    file,
    `import { parentPort } from "node:worker_threads";
import { generate } from ${u("src/core/gen/generate.ts")};
import * as mapspec from ${u("src/core/spec/mapspec.ts")};
import { bareTiles, soilShade } from ${u("tools/lib/bare.ts")};
import { shadeTiles } from ${u("src/core/render/shade.ts")};
import { encodePng } from ${u("tools/png.ts")};
import { writeFileSync } from "node:fs";
const pictures = ${JSON.stringify(arg("pictures", "") ? resolve(arg("pictures", "")) : "")};
parentPort.on("message", (j) => {
  if (!j) process.exit(0);
  const t0 = performance.now();
  try {
    const r = generate(mapspec.makeSpec({ seed: j.seed, theme: j.theme, size: { x: ${size}, y: ${size} } }));
    const sec = (performance.now() - t0) / 1000;
    const m = bareTiles(r.built);
    if (pictures) {
      const b = r.built, W = b.W, H = b.H;
      const rgb = shadeTiles(b.heights, W, H, b.water);
      soilShade(b, rgb);
      if (b.start) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = b.start.x + dx, y = b.start.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const rim = Math.max(Math.abs(dx), Math.abs(dy)) === 4;
        rgb.set(rim ? [255, 255, 255] : [220, 30, 30], (y * W + x) * 3);
      }
      const img = new Uint8Array(W * H * 3);
      for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
      writeFileSync(pictures + "/" + j.theme + "-" + j.seed + ".png", encodePng(img, W, H));
    }
    parentPort.postMessage({ ...j, passed: r.report.passed, bare: m.share, worstBlock: m.worstBlock, largestSquare: m.largestSquare, water: m.water, sec });
  } catch (e) { parentPort.postMessage({ ...j, passed: false, bare: 0, worstBlock: 0, largestSquare: 0, water: 0, sec: 0, error: String(e && e.stack || e) }); }
});`,
  );
  const n = Math.max(1, Math.min(Number(arg("jobs", "4")), jobs.length));
  const out: Row[] = [];
  let next = 0;
  try {
    await new Promise<void>((ok, fail) => {
      let live = n;
      for (let w = 0; w < n; w++) {
        const worker = new Worker(file);
        const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
        worker.on("message", (m: Row) => {
          out.push(m);
          process.stderr.write(`\r${out.length}/${jobs.length}   `);
          feed();
        });
        worker.on("error", fail);
        worker.on("exit", () => {
          if (--live === 0) ok();
        });
        feed();
      }
    });
  } finally {
    rmSync(file, { force: true });
  }
  process.stderr.write("\n");
  out.sort((p, q) => themes.indexOf(p.theme) - themes.indexOf(q.theme) || p.seed - q.seed);
  const pc = (v: number) => `${Math.round(v * 100)}%`.padStart(4);
  console.log(`size ${size}: theme seed  bare  worst64  largestSq  water  sec`);
  for (const r of out) console.log(`${r.theme.padEnd(12)} ${String(r.seed).padStart(3)}  ${pc(r.bare)}  ${pc(r.worstBlock)}  ${String(r.largestSquare).padStart(5)}  ${pc(r.water)}  ${r.sec.toFixed(1).padStart(5)}${r.passed ? "" : " FAILED"}${r.error ? " " + r.error.split("\n")[0] : ""}`);
  for (const t of themes) {
    const rs = out.filter((r) => r.theme === t);
    const avg = (f: (r: Row) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
    console.log(`${t.padEnd(12)} mean  ${pc(avg((r) => r.bare))}  ${pc(avg((r) => r.worstBlock))}  ${avg((r) => r.largestSquare).toFixed(0).padStart(5)}  ${pc(avg((r) => r.water))}  ${avg((r) => r.sec).toFixed(1).padStart(5)}`);
  }
  const avg = (f: (r: Row) => number) => out.reduce((s, r) => s + f(r), 0) / out.length;
  console.log(`all          mean  ${pc(avg((r) => r.bare))}  ${pc(avg((r) => r.worstBlock))}  ${avg((r) => r.largestSquare).toFixed(0).padStart(5)}  ${pc(avg((r) => r.water))}  ${avg((r) => r.sec).toFixed(1).padStart(5)}`);
  const pics = arg("pictures", "");
  if (pics) writeFileSync(join(pics, "index.json"), JSON.stringify({ size, maps: out.map((r) => ({ theme: r.theme, seed: r.seed, file: `${r.theme}-${r.seed}.png`, passed: r.passed, label: `bare ${Math.round(r.bare * 100)}%` })) }, null, 1));
  const json = arg("json", "");
  if (json) writeFileSync(json, JSON.stringify(out, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
