// How many attempts a spec takes, how long each took and why each failed: the measure for a map that is slow to make
// (D453). One JSON line per spec, and a table at the end.
//
//   npx tsx tools/attempts.ts --shapes 512x128,128x512 --themes riverValley,canyon --seeds 1-6,2144015272 [--easy]
//                             [--max <attempts>] [--stop <attempts>] [--out <file.jsonl>] [--pictures <dir>] [--live]
//
// Each line: theme, shape, seed, whether a map was made, attempts, seconds (this process's CPU time, so a busy machine
// reads the same; `wall` is the clock's), the settles, the first 12 hex digits of the file's sha256 (the same map, or
// another), and for every attempt its reason when it failed (a generator stage's, or the blocking checks' ids, with
// the first check's own sentence), the land it was on (drawn, kept, shown), its settles and the seconds each of its
// stages took. `--easy` presses Easy start. `--max` caps the attempts (no rescue rounds), for a quick look; `--stop`
// ends a spec after that many attempts, the same attempts a whole run makes (for a profile of one). `--live` prints
// each attempt as it ends. `--pictures` writes each kept map from above, north up (the soil's colours, the start a red
// square, ruins dark), as `<theme>-<size>-<seed>[-easy].png`, and the line then carries the start's check values.

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate, type GenerateResult } from "../src/core/gen/generate";
import { shadeTiles } from "../src/core/render/shade";
import { THEMES, defaultSettings, makeSpec, type MapSpec, type ThemeId } from "../src/core/spec/mapspec";
import { soilShade } from "./lib/bare";
import { encodePng } from "./png";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function parseSeeds(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) for (let k = Number(m[1]); k <= Number(m[2]); k++) out.push(k);
    else out.push(Number(part));
  }
  return out;
}

const shapes = arg("shapes", "512x128").split(",").map((s) => s.split("x").map(Number) as [number, number]);
const themes = arg("themes", THEMES.join(",")).split(",") as ThemeId[];
const seeds = parseSeeds(arg("seeds", "1"));
const easy = process.argv.includes("--easy");
const max = Number(arg("max", "0"));
const stop = Number(arg("stop", "0"));
const out = arg("out", "");
const live = process.argv.includes("--live");
const pictures = arg("pictures", "");
if (pictures) mkdirSync(pictures, { recursive: true });

/** The kept map from above, north up: the soil's colours, ruins dark, the start a red square with a white rim. */
function picture(r: GenerateResult, file: string): void {
  const { W, H } = r.built;
  const rgb = shadeTiles(r.built.heights, W, H, r.built.water);
  soilShade(r.built, rgb);
  const img = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
  const dot = (x: number, y: number, c: [number, number, number]) => {
    if (x >= 0 && y >= 0 && x < W && y < H) img.set(c, ((H - 1 - y) * W + x) * 3);
  };
  for (const e of r.built.entities) if (e.template.startsWith("RuinColumnH")) dot(e.x, e.y, [45, 40, 50]);
  const s = r.built.start;
  if (s) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) dot(s.x + dx, s.y + dy, Math.max(Math.abs(dx), Math.abs(dy)) === 3 ? [255, 255, 255] : [220, 30, 30]);
  writeFileSync(file, encodePng(img, W, H));
}

/** This process's CPU seconds so far: an attempt's cost whatever else the machine is running. */
function cpu(): number {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1e6;
}
const round1 = (v: number) => Math.round(v * 10) / 10;

const table: string[] = [];
for (const [x, y] of shapes)
  for (const theme of themes)
    for (const seed of seeds) {
      const size = { x, y };
      const settings = defaultSettings(theme, "normal", size);
      if (easy) settings.start.easyStart = true;
      const spec: MapSpec = { ...makeSpec({ seed, size, designedFor: "normal", theme }), settings };
      const t0 = performance.now();
      const c0 = cpu();
      let at = c0;
      let stageAt = c0;
      let stage = "";
      let stages: Record<string, number> = {};
      let settles = 0;
      const tries: { n: number; land: string; s: number; settles: number; stages: Record<string, number>; why: string[]; say?: string }[] = [];
      const endStage = () => {
        const now = cpu();
        if (stage) stages[stage] = round1((stages[stage] ?? 0) + now - stageAt);
        stageAt = now;
      };
      let row: Record<string, unknown>;
      try {
        const r = generate(spec, {
          ...(max ? { maxAttempts: max } : {}),
          onProgress: (p) => {
            endStage();
            stage = p.stage;
          },
          onAttempt: (a) => {
            endStage();
            stage = "";
            const now = cpu();
            // (a land drawn again before its water settled counts no settle; the round's count restarts in a rescue round)
            const total = a.result.info.settles;
            const spent = total >= settles ? total - settles : total;
            settles = total;
            const say = a.passed ? undefined : a.result.report.checks.find((c) => !c.ok && c.id === a.failed[0])?.message;
            tries.push({ n: tries.length + 1, land: a.land, s: round1(now - at), settles: spent, stages, why: a.passed ? [] : a.failed, ...(say ? { say } : {}) });
            stages = {};
            at = now;
            if (live) console.error(`${theme} ${x}x${y} ${seed}: attempt ${tries.length} (${a.land}) ${tries[tries.length - 1].s} s, ${spent} settles, ${a.passed ? "passed" : a.failed.join(", ")}${say ? ` (${say})` : ""} ${JSON.stringify(tries[tries.length - 1].stages)}`);
            if (stop && tries.length >= stop) throw new Error(`stopped after ${stop} attempts`);
          },
        });
        const st = r.built.start;
        let shown: Record<string, unknown> = {};
        if (pictures && r.report.passed) {
          const file = join(pictures, `${theme}-${x}x${y}-${seed}${easy ? "-easy" : ""}.png`);
          picture(r, file);
          shown = { picture: file, startChecks: Object.fromEntries(r.report.checks.filter((c) => c.id.startsWith("start.") && typeof c.value === "number").map((c) => [c.id.slice(6), c.value])) };
        }
        row = {
          theme, shape: `${x}x${y}`, seed, easy, ok: r.report.passed, attempts: r.attempts, s: round1(cpu() - c0), wall: round1((performance.now() - t0) / 1000),
          settles: tries.reduce((n, t) => n + t.settles, 0), genomes: r.info.genomes, start: st ? [st.x, st.y] : null, sha: createHash("sha256").update(r.bytes).digest("hex").slice(0, 12), ...(r.easyShort ? { easyShort: r.easyShort } : {}), ...shown, tries,
        };
      } catch (e) {
        row = { theme, shape: `${x}x${y}`, seed, easy, ok: false, crash: String(e), s: round1(cpu() - c0), wall: round1((performance.now() - t0) / 1000), tries };
      }
      const line = JSON.stringify(row);
      console.log(line);
      if (out) appendFileSync(out, line + "\n");
      const why = new Map<string, number>();
      for (const t of tries) for (const w of t.why.slice(0, 1)) why.set(w, (why.get(w) ?? 0) + 1);
      table.push(`| ${theme} | ${x}×${y} | ${seed} | ${row.ok ? "yes" : "no"} | ${row.attempts ?? "-"} | ${row.settles ?? "-"} | ${row.s} | ${[...why].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} ×${n}`).join(", ")} |`);
    }
console.log("\n| Theme | Size | Seed | Map | Attempts | Settles | Seconds | Refusals (first reason of each) |\n|---|---|---|---|---|---|---|");
for (const t of table) console.log(t);
