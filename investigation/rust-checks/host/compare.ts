// The comparison (INTEGRATION.md): every check's verdict, value and message, and the analysis the page reads,
// the TypeScript's byte for byte, in Node's WebAssembly and natively.
//
//   npx tsx host/compare.ts [--workers 4] [--seeds 20] [--only official|generated]
//
// The corpus: the official maps (local/official, extracted from the game by extract_builtin_maps.py), and for
// every theme the generated maps of seeds 1–20 at 96² and 128², plus the 256² maps CI's oracle checks (seeds
// 1, 5, 9, 10, 14, 18, 19, theme by the oracle's rule). Each map is validated as the product validates it:
// a generated map in the generate profile (the generator's call), the editor's export profile (editing, with
// its mine sites cut at open), load only, and as an imported file; an official map in the import profile at
// Normal and at Hard, the export profile, and load only. Each case runs the TypeScript (validateMap), then the
// Wasm, then (per worker, at its end) the native binary over the same inputs. Everything generated stays in
// local/ (D195); the summary is local/result.json and RESULT.json.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { oracle, ORACLE } from "./oracle";
import { dumpInputs, encode, readOutputs, Refuse, type Outputs } from "./encode";
import { RustChecks, STATUS } from "./bridge";

const HERE = resolve(import.meta.dirname, "..");
const LOCAL = join(HERE, "local");
const WASM = join(LOCAL, "target", "wasm32-unknown-unknown", "release", "rust_checks.wasm");
const NATIVE = join(LOCAL, "target", "release", process.platform === "win32" ? "rust-checks.exe" : "rust-checks");

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const seeds = Number(arg("seeds", "20"));
const only = arg("only", "");
const CI_256 = [1, 5, 9, 10, 14, 18, 19];

interface Item {
  name: string;
  kind: "generated" | "official";
  theme?: string;
  size?: number;
  seed?: number;
  path?: string;
}

async function corpus(): Promise<Item[]> {
  const { AVAILABLE_THEMES } = await import(oracle("src/core/spec/mapspec.ts"));
  const themes = AVAILABLE_THEMES as string[];
  const out: Item[] = [];
  if (only !== "generated") {
    const dir = join(LOCAL, "official");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".timber")).sort()) out.push({ name: `official/${f}`, kind: "official", path: join(dir, f) });
  }
  if (only !== "official") {
    for (const theme of themes) for (const size of [96, 128]) for (let seed = 1; seed <= seeds; seed++) out.push({ name: `${theme}/${size}/${seed}`, kind: "generated", theme, size, seed });
    for (const seed of CI_256) {
      const theme = themes[Math.floor((seed - 1) / 3) % themes.length];
      out.push({ name: `${theme}/256/${seed}`, kind: "generated", theme, size: 256, seed });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------ comparing

/** Whether JSON.stringify keeps every value (no -0, NaN, ±Infinity, undefined): then equal text is equal data. */
function lossless(v: unknown): boolean {
  return deepIs(v, JSON.parse(JSON.stringify(v)));
}
function deepIs(a: any, b: any): boolean {
  if (typeof a === "number" || typeof b === "number") return Object.is(a, b);
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b;
  if (ArrayBuffer.isView(a)) return false; // typed arrays are compared as bytes, never through JSON
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepIs(a[k], b[k]));
}
const bytesOf = (a: ArrayBufferView | null) => (a ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength) : new Uint8Array(0));
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const text = (b: Uint8Array) => new TextDecoder().decode(b);

/** The analysis the page reads beside its typed layers, in the Rust's key order. */
function analysisDoc(v: any): string {
  const a = v.analysis;
  return JSON.stringify({
    analysis: {
      treesNear: a.treesNear,
      bushesNear: a.bushesNear,
      walkReach: a.walkReach,
      levers: a.levers,
      woodNear: a.woodNear,
      woodBySpecies: a.woodBySpecies,
      woodGrowing: a.woodGrowing,
      damSites: a.damSites,
      bestDam: a.bestDam,
      naturalStorage: a.naturalStorage,
      storage: a.storage,
    },
    mechanics: v.mechanics,
  });
}

interface CaseResult {
  name: string;
  checks: number;
  /** What differs, empty when nothing does. */
  diff: string[];
  refused?: string;
  expected?: string[];
}

function compareCase(name: string, ts: any, o: Outputs): CaseResult {
  const diff: string[] = [];
  if (o.status !== STATUS.ok) return { name, checks: 0, diff: [`status ${o.status}: ${text(o.out[7])}`], refused: text(o.out[7]) };
  const tsReport = JSON.stringify(ts.report);
  const rsReport = text(o.out[0]);
  if (!lossless(ts.report)) diff.push("the TypeScript report does not survive JSON (compare by value)");
  if (tsReport !== rsReport) {
    const a = ts.report.checks.map((c: any) => JSON.stringify(c));
    const r = JSON.parse(rsReport);
    const b = (r.checks ?? []).map((c: any) => JSON.stringify(c));
    for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) diff.push(`check ${k}: TS ${a[k]?.slice(0, 400)} | Rust ${b[k]?.slice(0, 400)}`);
    if (JSON.stringify(ts.report.passed) !== JSON.stringify(r.passed)) diff.push(`passed: TS ${ts.report.passed}, Rust ${r.passed}`);
    if (!diff.length) diff.push("report text differs");
  }
  if (ts.analysis) {
    const a = ts.analysis;
    const pairs: [string, Uint8Array, Uint8Array][] = [
      ["moisture", bytesOf(a.moisture), o.out[2]],
      ["soilContamination", bytesOf(a.soilContamination), o.out[3]],
      ["reach", bytesOf(a.reach), o.out[4]],
      ["startDistance", bytesOf(a.startDistance), o.out[5]],
      ["waterDistance", bytesOf(new Float64Array([a.waterDistance])), o.out[6]],
    ];
    for (const [k, x, y] of pairs) if (!sameBytes(x, y)) diff.push(`analysis.${k} bytes differ`);
    const doc = analysisDoc(ts);
    if (!lossless(JSON.parse(doc)) || !lossless({ m: ts.mechanics })) diff.push("the TypeScript analysis does not survive JSON");
    if (doc !== text(o.out[1])) diff.push(`analysis: TS ${doc.slice(0, 600)} | Rust ${text(o.out[1]).slice(0, 600)}`);
  } else if (o.out[1].length) diff.push("Rust gave an analysis where the TypeScript gave none");
  return { name, checks: ts.report.checks.length, diff };
}

/** A few edits of a small generated map that reach the branches a finished map rarely does: no start and two
 *  starts, an edge wall (with the editor's fix), Sources: None, Easy and Hard, an unmigrated file, duplicate
 *  ids and a bad orientation (load only: the full checks leave that to the TypeScript). */
function variants(r: any, water: any): [string, any, any][] {
  const base = { profile: "generate", spec: r.spec, features: r.features, water };
  const withWorld = (world: any) => ({ ...r.file, world: { ...r.file.world, ...world } });
  const ents = r.file.world.entities as any[];
  const start = ents.find((e) => e.Template === "StartingLocation");
  const w = r.file.world;
  const plane = w.sizeX * w.sizeY;
  const walled = w.voxels.slice();
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < w.sizeX; x++) {
      const i = y * w.sizeX + x;
      let top = 0;
      for (let z = 0; z < w.layers; z++) if (walled[z * plane + i]) top = z + 1;
      for (let z = top; z < Math.min(top + 3, 22); z++) walled[z * plane + i] = 1;
    }
  const spec = (f: (s: any) => void) => {
    const s = structuredClone(r.spec);
    f(s);
    return s;
  };
  const noSources = ents.filter((e) => !["WaterSource", "BadwaterSource", "BadwaterSeep"].includes(e.Template));
  const turned = ents.map((e, k) => (k === ents.indexOf(start) + 1 && e.Components?.BlockObject ? { ...e, Components: { ...e.Components, BlockObject: { ...e.Components.BlockObject, Orientation: "North" } } } : e));
  return [
    ["no-start", withWorld({ entities: ents.filter((e) => e !== start) }), base],
    ["two-starts", withWorld({ entities: [...ents, { ...start, Id: "00000000-0000-4000-8000-000000000001" }] }), base],
    ["wall", withWorld({ voxels: walled }), base],
    ["wall-edit", withWorld({ voxels: walled }), { ...base, profile: "export", editing: true, external: false }],
    ["sources-none", withWorld({ entities: noSources }), { ...base, spec: spec((s) => (s.settings.water.sources = "none")) }],
    ["no-badwater", r.file, { ...base, spec: spec((s) => (s.settings.hazards.badwater = "off")) }],
    ["easy", r.file, { ...base, spec: spec((s) => (s.designedFor = "easy")) }],
    ["hard", r.file, { ...base, spec: spec((s) => (s.designedFor = "hard")) }],
    ["unmigrated", withWorld({ singletons: { ...w.singletons, WaterSimulationMigrator: { IsMigrated: false } } }), base],
    ["dup-ids", withWorld({ entities: ents.map((e, k) => (k === 1 ? { ...e, Id: ents[0].Id } : e)) }), base],
    ["bad-orientation", withWorld({ entities: turned }), { ...base, loadOnly: true }],
  ];
}

// ------------------------------------------------------------------------------------------- one worker

async function worker(shard: number, shards: number): Promise<void> {
  const { readTimber } = await import(oracle("src/core/format/timber.ts"));
  const { makeSpec } = await import(oracle("src/core/spec/mapspec.ts"));
  const { generate } = await import(oracle("src/core/gen/generate.ts"));
  const { validateMap } = await import(oracle("src/core/validate/checks.ts"));
  const { mineSitesCutAt, WET } = await import(oracle("src/core/validate/playability.ts"));
  const { mapObjects, waterModel } = await import(oracle("src/core/sim/model.ts"));
  const { canonicalSettle } = await import(oracle("src/core/sim/prefill.ts"));
  const { surfaceOf } = await import(oracle("src/core/format/world.ts"));
  const rust = await RustChecks.load(new Uint8Array(readFileSync(WASM)));
  const items = (await corpus()).filter((_, i) => i % shards === shard);
  const dir = join(LOCAL, "run", String(shard));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const results: CaseResult[] = [];
  const failed: string[] = [];
  let maps = 0;
  for (const item of items) {
    let cases: [string, any, any][] = [];
    try {
      if (item.kind === "generated") {
        const spec = makeSpec({ seed: item.seed, size: { x: item.size, y: item.size }, designedFor: "normal", theme: item.theme });
        const r = generate(spec);
        if (!r.file || !r.built) {
          failed.push(`${item.name}: the generator gave no map`);
          continue;
        }
        const water = { model: r.built.waterModel, settled: r.built.settle };
        const w = r.file.world;
        const wet = new Uint8Array(w.sizeX * w.sizeY);
        for (let i = 0; i < wet.length; i++) wet[i] = r.built.settle.depth[i] > WET ? 1 : 0;
        const cut = mineSitesCutAt(mapObjects(w), surfaceOf(w), wet, w.sizeX, w.sizeY);
        cases = [
          ["generate", r.file, { profile: "generate", spec: r.spec, features: r.features, water }],
          ["edit", r.file, { profile: "export", external: false, editing: true, mineCutAtOpen: cut, spec: r.spec, designedFor: "normal", features: r.features, water }],
          ["load", r.file, { profile: "export", external: false, editing: true, spec: r.spec, designedFor: "normal", features: r.features, loadOnly: true }],
          ["import", r.file, { profile: "import", designedFor: "normal", water }],
        ];
        if (item.size === 96 && item.seed! <= 3) cases.push(...variants(r, water));
      } else {
        const file = readTimber(new Uint8Array(readFileSync(item.path!)));
        const w = file.world;
        // (one settle for every case of the map: validateMap without `water` computes exactly this)
        const model = waterModel(w.sizeX, w.sizeY, surfaceOf(w), mapObjects(w));
        const water = { model, settled: canonicalSettle(model) };
        cases = [
          ["import", file, { profile: "import", designedFor: "normal", water }],
          ["import-hard", file, { profile: "import", designedFor: "hard", water }],
          ["export", file, { profile: "export", designedFor: "normal", water }],
          ["load", file, { profile: "import", loadOnly: true }],
        ];
      }
    } catch (e) {
      failed.push(`${item.name}: ${(e as Error).stack ?? e}`);
      continue;
    }
    maps++;
    for (const [label, file, opts] of cases) {
      const name = `${item.name}/${label}`;
      let ts: any;
      try {
        ts = validateMap(file, opts);
      } catch (e) {
        results.push({ name, checks: 0, diff: [`the TypeScript threw: ${(e as Error).message}`] });
        continue;
      }
      let enc;
      try {
        enc = encode(file, opts);
      } catch (e) {
        results.push({ name, checks: 0, diff: [`the encoder ${e instanceof Refuse ? "refused" : "threw"}: ${(e as Error).message}`], refused: (e as Error).message });
        continue;
      }
      const o = rust.run(enc.inputs);
      const res = compareCase(name, ts, o);
      const safe = name.replace(/[^A-Za-z0-9_.-]+/g, "_");
      const input = join(dir, `${safe}.in`);
      writeFileSync(input, dumpInputs(enc.inputs));
      // (the native outputs must be the Wasm's byte for byte, which are the TypeScript's when `diff` is empty)
      res.expected = [String(o.status), ...o.out.map(sha)];
      if (res.diff.length) {
        mkdirSync(join(LOCAL, "fail"), { recursive: true });
        writeFileSync(join(LOCAL, "fail", `${safe}.in`), dumpInputs(enc.inputs));
        console.error(`DIFF ${name}\n  ${res.diff.slice(0, 6).join("\n  ")}`);
      }
      results.push(res);
    }
    console.error(`[${shard}] ${item.name}: ${cases.length} cases`);
  }
  // the native binary over the same inputs
  const manifest = results.filter((r) => r.expected).map((r) => {
    const safe = r.name.replace(/[^A-Za-z0-9_.-]+/g, "_");
    return `${join(dir, `${safe}.in`)}\t${join(dir, `${safe}.out`)}`;
  });
  writeFileSync(join(dir, "manifest.txt"), manifest.join("\n"));
  const run = spawnSync(NATIVE, [join(dir, "manifest.txt")], { encoding: "utf8" });
  const native: string[] = [];
  if (run.status !== 0) native.push(`the native binary exited ${run.status}: ${run.stderr}`);
  for (const r of results.filter((x) => x.expected)) {
    const safe = r.name.replace(/[^A-Za-z0-9_.-]+/g, "_");
    const out = join(dir, `${safe}.out`);
    if (!existsSync(out)) {
      native.push(`${r.name}: no native output`);
      continue;
    }
    const o = readOutputs(new Uint8Array(readFileSync(out)));
    const got = [String(o.status), ...o.out.map(sha)];
    if (got.join() !== r.expected!.join()) native.push(`${r.name}: native outputs differ from the Wasm's (${got.map((g, k) => (g === r.expected![k] ? "=" : k)).join(" ")})`);
  }
  rmSync(dir, { recursive: true, force: true });
  const summary = {
    shard,
    maps,
    cases: results.length,
    checks: results.reduce((a, r) => a + r.checks, 0),
    nativeCases: manifest.length,
    differ: results.filter((r) => r.diff.length).map((r) => ({ name: r.name, diff: r.diff.slice(0, 4) })),
    refused: results.filter((r) => r.refused).map((r) => `${r.name}: ${r.refused}`),
    native,
    failed,
  };
  writeFileSync(join(LOCAL, `shard-${shard}.json`), JSON.stringify(summary, null, 1));
}

// ------------------------------------------------------------------------------------------- the parent

async function main(): Promise<void> {
  const shardArg = process.argv.indexOf("--shard");
  if (shardArg >= 0) return worker(Number(process.argv[shardArg + 1]), Number(arg("shards", "1")));
  const workers = Number(arg("workers", "4"));
  for (const f of [WASM, NATIVE]) if (!existsSync(f)) throw new Error(`${f} is missing: build first (INTEGRATION.md)`);
  const extra = process.argv.slice(2).filter((a, i, all) => !["--workers"].includes(a) && all[i - 1] !== "--workers");
  await Promise.all(
    Array.from({ length: workers }, (_, k) =>
      new Promise<void>((done, fail) => {
        const p = spawn(process.execPath, [...process.execArgv, import.meta.filename, "--shard", String(k), "--shards", String(workers), ...extra], { stdio: ["ignore", "inherit", "inherit"] });
        p.on("exit", (code) => (code === 0 ? done() : fail(new Error(`worker ${k} exited ${code}`))));
      }),
    ),
  );
  const parts = Array.from({ length: workers }, (_, k) => JSON.parse(readFileSync(join(LOCAL, `shard-${k}.json`), "utf8")));
  const sum = (k: string) => parts.reduce((a, p) => a + p[k], 0);
  const all = (k: string) => parts.flatMap((p) => p[k]);
  const git = (args: string[], cwd: string) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();
  const result = {
    oracle: git(["rev-parse", "HEAD"], ORACLE),
    wasm: sha(new Uint8Array(readFileSync(WASM))),
    native: sha(new Uint8Array(readFileSync(NATIVE))),
    corpus: { seeds, only: only || "all" },
    maps: sum("maps"),
    cases: sum("cases"),
    checks: sum("checks"),
    nativeCases: sum("nativeCases"),
    differ: all("differ").length,
    refused: all("refused").length,
    nativeDiffer: all("native").length,
    failed: all("failed").length,
  };
  writeFileSync(join(LOCAL, "result.json"), JSON.stringify({ ...result, details: { differ: all("differ"), refused: all("refused"), native: all("native"), failed: all("failed") } }, null, 1));
  if (!only && seeds === 20) writeFileSync(join(HERE, "RESULT.json"), JSON.stringify(result, null, 1) + "\n");
  console.log(JSON.stringify(result, null, 1));
  if (result.differ || result.refused || result.nativeDiffer || result.failed) process.exit(1);
}

// (run only as the entry point, never when imported)
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) await main();
