// The start areas (PLAN §20 D229): a crop of 40 tiles round each start, north up, one tile a pixel,
// seeds 1–30 of a few themes and Any at 128², at Normal and at Hard, labelled with its theme, seed,
// difficulty and the groves the starting-logs floor added. The floor's added groves (D224, D227,
// D229: `forest/floor/<kind>/…`) are outlined orange; the start's own groves, planted for Minimum
// starting wood within 20 tiles' walk (`forest/start/…`), cyan; the start is red. A tool for eyes,
// not a gate: does meeting the floor make starts converge? Also prints how often wood was added,
// and where.
//
//   npx tsx tools/start-sheet.ts [--themes any,riverValley,canyon,highlands] [--seeds 1-30] [--size 128]
//                                [--difficulties normal,hard] [--out .scratch/sheets/start-areas.png] [--jobs 8]
//
// Each theme and difficulty is made in its own process (--part), several at a time.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "../src/core/gen/generate";
import { makeSpec, type Difficulty, type ThemeId } from "../src/core/spec/mapspec";
import { palettedPng, resourceTopDown } from "./resources-sheet";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const R = 40;
const SIDE = 2 * R + 1;
const ORANGE = [255, 138, 20] as const;
const CYAN = [70, 214, 255] as const;
const TAG: Record<string, string> = { any: "AN", riverValley: "RV", canyon: "CA", highlands: "HI", lakeBasin: "LB", delta: "DE", islands: "IS" };

interface Crop {
  theme: string;
  seed: number;
  difficulty: string;
  /** SIDE × SIDE RGB, base64. */
  rgb: string;
  floorGroves: number;
  floorKinds: string[];
  startGroves: number;
}

/** One theme at one difficulty: every seed's crop, written as JSON. */
function part(theme: ThemeId, difficulty: Difficulty, seeds: number[], size: number, out: string): void {
  const crops: Crop[] = [];
  for (const seed of seeds) {
    const r = generate(makeSpec({ seed, theme, size: { x: size, y: size }, designedFor: difficulty }));
    const W = size;
    const H = size;
    const st = r.features.find((f) => f.kind === "start");
    const [sx, sy] = st && st.kind === "start" ? st.params.position : [W >> 1, H >> 1];
    const pic = resourceTopDown(r.file, 1);
    const mark = (prefix: string) => {
      const m = new Uint8Array(W * H);
      let n = 0;
      const kinds: string[] = [];
      for (const f of r.features) {
        if (f.kind !== "forest" || !f.role?.startsWith(prefix)) continue;
        n++;
        kinds.push(f.role.split("/")[2]);
        for (const [y, a, b] of f.params.area) for (let x = a; x <= b; x++) m[y * W + x] = 1;
      }
      return { m, n, kinds };
    };
    const floor = mark("forest/floor/");
    const start = mark("forest/start/");
    const rgb = new Uint8Array(SIDE * SIDE * 3).fill(40);
    const edge = (m: Uint8Array, x: number, y: number) => m[y * W + x] && (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !m[y * W + x - 1] || !m[y * W + x + 1] || !m[(y - 1) * W + x] || !m[(y + 1) * W + x]);
    for (let cy = 0; cy < SIDE; cy++)
      for (let cx = 0; cx < SIDE; cx++) {
        const x = sx - R + cx;
        const y = sy + R - cy; // north up
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const k = (cy * SIDE + cx) * 3;
        const p = ((H - 1 - y) * pic.w + x) * 3;
        let c: ArrayLike<number> = pic.rgb.subarray(p, p + 3);
        if (edge(floor.m, x, y)) c = ORANGE;
        else if (edge(start.m, x, y)) c = CYAN;
        rgb.set(c, k);
      }
    crops.push({ theme, seed, difficulty, rgb: Buffer.from(rgb).toString("base64"), floorGroves: floor.n, floorKinds: floor.kinds, startGroves: start.n });
    console.log(`${theme} ${difficulty} ${seed}: ${r.report.passed ? "passed" : "FAILED"}, floor groves ${floor.n} (${floor.kinds.join(" ")}), start groves ${start.n}`);
  }
  writeFileSync(out, JSON.stringify(crops));
}

const FONT: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111",
  A: "010101111101101", C: "011100100100011", D: "110101101101110", E: "111100110100111", H: "101101111101101", I: "111010010010111",
  L: "100100100100111", N: "110101101101101", R: "110101110101101", S: "011100010001110", V: "101101101101010", "+": "000010111010000",
  " ": "000000000000000",
};

async function main(): Promise<void> {
  const themes = arg("themes", "any,riverValley,canyon,highlands").split(",") as ThemeId[];
  const difficulties = arg("difficulties", "normal,hard").split(",") as Difficulty[];
  const [a, b] = arg("seeds", "1-30").split("-").map(Number);
  const seeds = Array.from({ length: (b ?? a) - a + 1 }, (_, k) => a + k);
  const size = Number(arg("size", "128"));
  const out = arg("out", ".scratch/sheets/start-areas.png");
  const jobs = Number(arg("jobs", "8"));
  const tmp = resolve(".scratch", "start-sheet");
  mkdirSync(tmp, { recursive: true });
  const parts = themes.flatMap((t) => difficulties.map((d) => ({ t, d, file: join(tmp, `${t}-${d}.json`) })));
  const queue = [...parts];
  const run = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const job = p;
      await new Promise<void>((done, fail) => {
        const c = spawn(process.execPath, ["--import", "tsx", resolve(here, "start-sheet.ts"), "--part", `${job.t}:${job.d}`, "--seeds", `${seeds[0]}-${seeds.at(-1)}`, "--size", String(size), "--part-out", job.file], { stdio: ["ignore", "inherit", "inherit"] });
        c.on("exit", (code) => (code === 0 ? done() : fail(new Error(`${job.t} ${job.d} exited ${code}`))));
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, parts.length) }, run));
  // the sheet: a row block per theme and difficulty, ten crops a row
  const cols = 10;
  const pad = 3;
  const label = 8;
  const rowsPer = Math.ceil(seeds.length / cols);
  const Wimg = cols * (SIDE + pad) + pad;
  const Himg = parts.length * rowsPer * (SIDE + label + pad) + pad;
  const img = new Uint8Array(Wimg * Himg * 3);
  for (let i = 0; i < Wimg * Himg; i++) img.set([28, 26, 24], i * 3);
  const put = (x: number, y: number, c: ArrayLike<number>) => {
    if (x < 0 || y < 0 || x >= Wimg || y >= Himg) return;
    img.set([c[0], c[1], c[2]], (y * Wimg + x) * 3);
  };
  const text = (s: string, x0: number, y0: number, c: ArrayLike<number> = [250, 246, 236]) =>
    [...s].forEach((ch, k) => {
      const g = FONT[ch] ?? FONT[" "];
      for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r * 3 + q] === "1") put(x0 + k * 4 + q, y0 + r, c);
    });
  let added = 0;
  let total = 0;
  const kinds = new Map<string, number>();
  const lines: string[] = [];
  parts.forEach((p, pi) => {
    const crops = JSON.parse(readFileSync(p.file, "utf8")) as Crop[];
    let partAdded = 0;
    crops.forEach((c, k) => {
      total++;
      if (c.floorGroves) {
        added++;
        partAdded++;
      }
      for (const kd of c.floorKinds) kinds.set(kd, (kinds.get(kd) ?? 0) + 1);
      const x0 = pad + (k % cols) * (SIDE + pad);
      const y0 = pad + (pi * rowsPer + Math.floor(k / cols)) * (SIDE + label + pad);
      const rgb = Buffer.from(c.rgb, "base64");
      for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) put(x0 + x, y0 + label + y, rgb.subarray((y * SIDE + x) * 3, (y * SIDE + x) * 3 + 3));
      text(`${TAG[c.theme]} ${c.seed} ${c.difficulty === "hard" ? "H" : c.difficulty === "easy" ? "E" : "N"}${c.floorGroves ? ` +${c.floorGroves}` : ""}`, x0, y0 + 1, c.floorGroves ? ORANGE : [250, 246, 236]);
    });
    lines.push(`${p.t} ${p.d}: floor wood added on ${partAdded} of ${crops.length} maps`);
  });
  const png = palettedPng(img, Wimg, Himg);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(lines.join("\n"));
  console.log(`floor wood added on ${added} of ${total} maps; groves by kind: ${[...kinds].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`wrote ${out} (${Math.round(png.length / 1024)} KB, ${Wimg}×${Himg})`);
}

const partArg = arg("part", "");
if (partArg) {
  const [t, d] = partArg.split(":");
  const [a, b] = arg("seeds", "1-30").split("-").map(Number);
  part(t as ThemeId, d as Difficulty, Array.from({ length: (b ?? a) - a + 1 }, (_, k) => a + k), Number(arg("size", "128")), arg("part-out", ""));
} else if (process.argv[1] && /start-sheet\.ts$/.test(process.argv[1])) {
  if (!existsSync("package.json")) throw new Error("run from the repository's root");
  void main();
}
