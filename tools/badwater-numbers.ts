// The badwater pits' numbers on generated maps (D536): for each theme and seed, the attempts the map took and why
// the failed ones failed, its pits and where each one's ditch ends (river, lake, another gully, the edge), whether its
// badwater reaches the ditch's mouth in the settled water ("delivers"), and the start's check numbers (every map
// verdict opens with the start). One JSON line a map, so a long run can be read while it goes and two checkouts compared.
//
//   npx tsx tools/badwater-numbers.ts [--root <checkout>] [--themes any,canyon,...] [--seeds 1-6] [--size 256] [--designed easy|normal|hard] [--out file.jsonl]
//   npx tsx tools/badwater-numbers.ts [--maps riverValley:1,any:4] [--png <dir>] ...
//   npx tsx tools/badwater-numbers.ts --tally base.jsonl branch.jsonl
//
// --root makes the maps with another checkout's generator (its `src/`, e.g. a `git archive` of dev under `.scratch/`),
// so a base and a branch are measured by the same script. --tally prints the comparison tables. --maps measures those
// maps instead of every theme and seed; --png also writes each whole map, north up, a tile a pixel, as <theme>-<seed>.png
// with its row in <theme>-<seed>.json (the ground shaded, water by its depth, badwater magenta by its share, the
// pits' sources yellow, the start a white ring), for a before | after sheet (`tools/badwater-pairs.py`).
// --designed sets Designed for (default normal), whose start rule is the badwater distance (D85).
// A ditch delivers when its last tile, or a tile beside it, holds settled water (over 0.05) with badwater in it (over 0.01).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { hypot, sqrt } from "../src/core/math/portable";
import { encodePng } from "./png";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const THEMES = ["any", "canyon", "delta", "highlands", "islands", "lakeBasin", "riverValley"];
/** Full badwater's colour on the --png pictures. */
const MAGENTA = [214, 60, 190];
const START_CHECKS = ["start.reach", "start.level_land", "start.food", "start.wood", "start.badwater", "start.water"];

interface Pit {
  at: [number, number];
  to: string;
  length: number;
  delivers: boolean;
}
interface Row {
  theme: string;
  seed: number;
  size: number;
  version: string;
  passed: boolean;
  attempts: number;
  failed: string[];
  asked: number;
  pits: Pit[];
  start: [number, number] | null;
  checks: Record<string, number | string | null>;
  /** The generator's fixes on the map (`info.fixes`), "badwater by a ditch" among them. */
  fixes: string[];
  ms: number;
}

function seedsOf(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const [a, b] = part.split("-").map(Number);
    for (let k = a; k <= (b ?? a); k++) out.push(k);
  }
  return out;
}

async function measure(): Promise<void> {
  const root = resolve(arg("root", "."));
  const at = (p: string) => pathToFileURL(resolve(root, p)).href;
  const { generate } = await import(at("src/core/gen/generate.ts"));
  const { makeSpec, GENERATOR_VERSION } = await import(at("src/core/spec/mapspec.ts"));
  const { badwaterBudget } = await import(at("src/core/resources/badwater.ts"));
  const { shadeTiles } = await import(at("src/core/render/shade.ts"));
  const size = Number(arg("size", "256"));
  const out = arg("out", "");
  if (out) writeFileSync(out, "");
  const pngDir = arg("png", "");
  if (pngDir) mkdirSync(pngDir, { recursive: true });
  const maps = arg("maps", "")
    ? arg("maps", "").split(",").map((m) => m.split(":") as [string, string]).map(([t, k]) => [t, Number(k)] as const)
    : arg("themes", THEMES.join(",")).split(",").flatMap((t) => seedsOf(arg("seeds", "1-6")).map((k) => [t, k] as const));
  for (const [theme, seed] of maps) {
    {
      const t = performance.now();
      const spec = makeSpec({ seed, theme, size: { x: size, y: size }, designedFor: arg("designed", "normal") });
      const r = generate(spec);
      const W = size;
      const b = r.built;
      const pits: Pit[] = [];
      for (const f of r.features) {
        if (f.kind !== "setPiece" || f.params?.kind !== "badwaterBasin") continue;
        const plan = f.params.plan as { x: number; y: number; outlet: number[]; outletTo?: string };
        const o = plan.outlet ?? [];
        let delivers = false;
        if (b && o.length >= 2) {
          const ex = o[o.length - 2];
          const ey = o[o.length - 1];
          for (let dy = -1; dy <= 1 && !delivers; dy++)
            for (let dx = -1; dx <= 1 && !delivers; dx++) {
              const x = ex + dx;
              const y = ey + dy;
              if (x < 0 || y < 0 || x >= W || y >= W) continue;
              const i = y * W + x;
              if (b.water[i] > 0.05 && b.contamination[i] > 0.01) delivers = true;
            }
        }
        pits.push({ at: [plan.x + 1, plan.y + 1], to: plan.outletTo ?? "?", length: o.length / 2, delivers });
      }
      const st = r.features.find((f: { kind: string }) => f.kind === "start");
      const checks: Record<string, number | string | null> = {};
      for (const id of START_CHECKS) {
        const c = r.report.checks.find((k: { id: string }) => k.id === id);
        checks[id] = c?.value ?? null;
      }
      const row: Row = {
        theme,
        seed,
        size,
        version: GENERATOR_VERSION,
        passed: r.report.passed,
        attempts: r.attempts,
        failed: r.failures.flatMap((f: { failed: string[] }) => f.failed),
        asked: badwaterBudget(size, size, r.spec.settings.hazards.badwater, r.spec.seed).sources,
        pits,
        start: st ? st.params.position : null,
        checks,
        fixes: r.info.fixes ?? [],
        ms: Math.round(performance.now() - t),
      };
      if (pngDir && b) {
        const H = W;
        const rgb = shadeTiles(b.heights, W, H, b.water);
        const img = new Uint8Array(W * H * 3);
        const put = (x: number, y: number, c: readonly number[]) => {
          if (x < 0 || y < 0 || x >= W || y >= H) return;
          const k = ((H - 1 - y) * W + x) * 3;
          img[k] = c[0];
          img[k + 1] = c[1];
          img[k + 2] = c[2];
        };
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const i = y * W + x;
            const t = b.water[i] > 0.05 ? sqrt(Math.min(1, Math.max(0, b.contamination[i]))) : 0;
            put(x, y, [0, 1, 2].map((k) => Math.round(rgb[i * 3 + k] * (1 - t) + MAGENTA[k] * t)));
          }
        for (const s of b.sources) if (s.template === "BadwaterSource") for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) put(s.x + dx, s.y + dy, Math.max(Math.abs(dx), Math.abs(dy)) === 2 ? [120, 60, 0] : [255, 205, 0]);
        if (b.start)
          for (let dy = -6; dy <= 6; dy++)
            for (let dx = -6; dx <= 6; dx++) {
              const d = hypot(dx, dy);
              if (d >= 4 && d <= 6) put(b.start.x + dx, b.start.y + dy, d < 5 ? [255, 255, 255] : [30, 30, 30]);
            }
        writeFileSync(join(pngDir, `${theme}-${seed}.png`), encodePng(img, W, H));
        writeFileSync(join(pngDir, `${theme}-${seed}.json`), JSON.stringify(row));
      }
      const line = JSON.stringify(row);
      console.log(line);
      if (out) appendFileSync(out, line + "\n");
    }
  }
}

function tally(baseFile: string, branchFile: string): void {
  const read = (f: string) => new Map(readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row).map((r) => [`${r.theme} ${r.seed}`, r]));
  const base = read(baseFile);
  const branch = read(branchFile);
  const keys = [...base.keys()].filter((k) => branch.has(k));
  const leaks = (r: Row) => r.failed.filter((f) => f === "a river's water leaves its course").length;
  const noPlace = (r: Row) => r.failed.filter((f) => f === "no place for badwater").length;
  const ends = (r: Row) => {
    const c: Record<string, number> = { river: 0, lake: 0, ditch: 0, edge: 0 };
    for (const p of r.pits) c[p.to] = (c[p.to] ?? 0) + 1;
    return c;
  };
  const sum = (m: Map<string, Row>, f: (r: Row) => number) => keys.reduce((s, k) => s + f(m.get(k)!), 0);
  let worst = { k: "", ratio: 0, a: 0, b: 0 };
  console.log("| map | attempts | leaks | no place | pits | ends river/lake/gully/edge | delivered | start | reach | level land | food | wood | badwater distance | walk to clean water |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const k of keys) {
    const a = base.get(k)!;
    const b = branch.get(k)!;
    const ratio = b.attempts / a.attempts;
    if (ratio > worst.ratio) worst = { k, ratio, a: a.attempts, b: b.attempts };
    const e = (r: Row) => {
      const c = ends(r);
      return `${c.river}/${c.lake}/${c.ditch}/${c.edge}`;
    };
    const d = (r: Row) => `${r.pits.filter((p) => p.delivers).length}/${r.pits.length}`;
    const n = (r: Row, id: string) => {
      const v = r.checks[id];
      return typeof v === "number" ? String(Math.round(v * 10) / 10) : String(v);
    };
    const pair = (id: string) => `${n(a, id)} → ${n(b, id)}`;
    console.log(
      `| ${k} | ${a.attempts} → ${b.attempts} | ${leaks(a)} → ${leaks(b)} | ${noPlace(a)} → ${noPlace(b)} | ${a.pits.length} → ${b.pits.length} | ${e(a)} → ${e(b)} | ${d(a)} → ${d(b)} | ${JSON.stringify(a.start)} → ${JSON.stringify(b.start)} | ${pair("start.reach")} | ${pair("start.level_land")} | ${pair("start.food")} | ${pair("start.wood")} | ${pair("start.badwater")} | ${pair("start.water")} |`,
    );
  }
  const notIslands = keys.filter((k) => !k.startsWith("islands"));
  const allEdge = (m: Map<string, Row>) => notIslands.filter((k) => m.get(k)!.pits.length > 0 && m.get(k)!.pits.every((p) => p.to === "edge")).length;
  const edgePits = (m: Map<string, Row>) => notIslands.reduce((s, k) => s + m.get(k)!.pits.filter((p) => p.to === "edge").length, 0);
  const pitsOut = (m: Map<string, Row>) => notIslands.reduce((s, k) => s + m.get(k)!.pits.length, 0);
  const failedMaps = (m: Map<string, Row>) => keys.filter((k) => !m.get(k)!.passed).length;
  console.log();
  console.log(`| ${keys.length} maps | base | branch |`);
  console.log("|---|---|---|");
  console.log(`| attempts | ${sum(base, (r) => r.attempts)} | ${sum(branch, (r) => r.attempts)} |`);
  console.log(`| worst branch / base | | ${worst.k}: ${worst.a} → ${worst.b} (${worst.ratio.toFixed(2)}) |`);
  console.log(`| leaks ("a river's water leaves its course") | ${sum(base, leaks)} | ${sum(branch, leaks)} |`);
  console.log(`| "no place for badwater" | ${sum(base, noPlace)} | ${sum(branch, noPlace)} |`);
  console.log(`| pits asked / on the maps | ${sum(base, (r) => r.asked)} / ${sum(base, (r) => r.pits.length)} | ${sum(branch, (r) => r.asked)} / ${sum(branch, (r) => r.pits.length)} |`);
  console.log(`| ditches delivering in the settle | ${sum(base, (r) => r.pits.filter((p) => p.delivers).length)} of ${sum(base, (r) => r.pits.length)} | ${sum(branch, (r) => r.pits.filter((p) => p.delivers).length)} of ${sum(branch, (r) => r.pits.length)} |`);
  console.log(`| pits at the edge, outside Islands | ${edgePits(base)} of ${pitsOut(base)} | ${edgePits(branch)} of ${pitsOut(branch)} |`);
  console.log(`| maps with every pit at the edge, outside Islands | ${allEdge(base)} of ${notIslands.length} | ${allEdge(branch)} of ${notIslands.length} |`);
  console.log(`| maps that failed | ${failedMaps(base)} | ${failedMaps(branch)} |`);
  const reasons = new Map<string, [number, number]>();
  for (const k of keys) {
    for (const f of base.get(k)!.failed) reasons.set(f, [(reasons.get(f)?.[0] ?? 0) + 1, reasons.get(f)?.[1] ?? 0]);
    for (const f of branch.get(k)!.failed) reasons.set(f, [reasons.get(f)?.[0] ?? 0, (reasons.get(f)?.[1] ?? 0) + 1]);
  }
  console.log();
  console.log("| refusal | base | branch |");
  console.log("|---|---|---|");
  for (const [f, [a, b]] of [...reasons].sort((x, y) => y[1][0] + y[1][1] - x[1][0] - x[1][1])) console.log(`| ${f} | ${a} | ${b} |`);
}

if (process.argv.includes("--tally")) {
  const i = process.argv.indexOf("--tally");
  tally(process.argv[i + 1], process.argv[i + 2]);
} else await measure();
