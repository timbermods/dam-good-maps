// Real places (ROADMAP "Real places", PLAN §20 D136, D155, D174): the gallery's index, from each
// place's data (public/real-places/data/, written by tools/places-convert.ts) in the order
// tools/places/selection.json gives.
//
//   npm run places                         (writes public/real-places/index.json)
//   npm run places -- --check              (writes nothing; fails when the committed index differs)
//   npm run places -- --only glencoe       (builds and checks the places named, writes nothing)
//
// Every place's .timber is built with src/core/places (build, settle, resources, validate, write),
// in worker threads, and must pass the export profile and every check of the generate profile; the
// tool stops on any that does not. The index records each map's size and sha256, the way its card
// pictures face (view.ts), and, from the index before, which map its pictures show (imageFrom).
// The card pictures are drawn by tools/places-thumbs.ts; the site's .timber files are built at
// deploy time (tools/places-build.ts) and must match the index. Everything this writes is the same
// bytes on every run.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMainThread } from "node:worker_threads";
import { writeTimber } from "../src/core/format/timber";
import { buildPlace, decodePlaceFile, logFloorProblem, placeFileName, validatePlace, type PlaceIndex, type PlaceIndexEntry } from "../src/core/places/place";
import { placeView, type PlaceView } from "../src/core/places/view";
import { validateMap } from "../src/core/validate/checks";
import { defaultThreads, runPool, serve } from "./places/pool";
import { FAMILIES } from "./places/titles";

const OUT = "public/real-places";
const SELECTION = "tools/places/selection.json";

interface Built {
  id: string;
  bytes?: Uint8Array;
  view?: PlaceView;
  failing: string[];
  advisories: string[];
  ms: number;
}

serve<string, Built>(
  (path) => {
    const t = performance.now();
    const p = decodePlaceFile(new Uint8Array(readFileSync(path)));
    try {
      const built = buildPlace(p);
      const v = validatePlace(built);
      const strict = validateMap(built.file, { profile: "generate", designedFor: "normal", features: [], water: { model: built.model, settled: built.settle } });
      const bad = (checks: typeof v.report.checks) => checks.filter((c) => !c.ok && !c.advisory && c.applicable !== false && !c.approximate).map((c) => c.id);
      const failing = [...new Set([...bad(v.report.checks).map((id) => `export: ${id}`), ...bad(strict.report.checks)])];
      // the starting-logs floor (D224), until the validators carry it
      const floor = logFloorProblem(strict);
      if (floor) failing.push(floor);
      if (!v.report.passed && !failing.length) failing.push("export: not passed");
      if (!strict.report.passed && !failing.some((f) => !f.startsWith("export"))) failing.push("generate: not passed");
      const advisories = strict.report.checks.filter((c) => !c.ok && c.advisory && c.applicable !== false).map((c) => c.id);
      return { id: p.id, bytes: writeTimber(built.file), view: placeView(built.heights, p.W, p.H), failing, advisories, ms: performance.now() - t };
    } catch (e) {
      return { id: p.id, failing: [String(e instanceof Error ? e.message : e)], advisories: [], ms: performance.now() - t };
    }
  },
  (r) => (r.bytes ? [r.bytes.buffer as ArrayBuffer] : []),
);

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const only = arg("only")?.split(",") ?? null;
  const order = (JSON.parse(readFileSync(SELECTION, "utf8")) as { places: { id: string }[] }).places.map((p) => p.id);
  const onDisk = readdirSync(join(OUT, "data")).filter((f) => f.endsWith(".json.gz")).map((f) => f.replace(/\.json\.gz$/, ""));
  const stray = onDisk.filter((id) => !order.includes(id));
  const missing = order.filter((id) => !onDisk.includes(id));
  if (stray.length || missing.length) throw new Error(`the data and ${SELECTION} disagree: ${[...missing.map((id) => `${id} has no data`), ...stray.map((id) => `${id} is not in the selection`)].join(", ")}`);
  const ids = only ? order.filter((id) => only.includes(id)) : order;
  const old = existsSync(join(OUT, "index.json")) ? (JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")) as PlaceIndex) : null;
  const shown = new Map((old?.places ?? []).map((p) => [p.id, p.imageFrom]));

  const t0 = performance.now();
  const built = await runPool<string, Built>(new URL(import.meta.url), ids.map((id) => join(OUT, "data", `${id}.json.gz`)), Number(arg("threads") ?? defaultThreads()), (r) =>
    console.log(`${r.failing.length ? "FAIL" : "ok  "} ${(r.ms / 1000).toFixed(1).padStart(5)} s  ${r.id}${r.failing.length ? `: ${r.failing.join(", ")}` : ""}${r.advisories.length ? `  (advisory: ${r.advisories.join(", ")})` : ""}`),
  );
  const failures = built.filter((b) => b.failing.length);
  if (failures.length) {
    console.error(`${failures.length} place(s) failed a check: nothing written`);
    process.exit(1);
  }

  const entries: PlaceIndexEntry[] = built.map((b) => {
    const p = decodePlaceFile(new Uint8Array(readFileSync(join(OUT, "data", `${b.id}.json.gz`))));
    if (placeFileName(p) !== `${p.name}.timber`) throw new Error("file name");
    return {
      id: p.id,
      name: p.name,
      surveyName: p.surveyName,
      ...(p.sample ? { sample: p.sample } : {}),
      family: p.family,
      familyName: p.familyName,
      plays: p.plays,
      size: p.W,
      metres: p.metres,
      data: `data/${p.id}.json.gz`,
      image: `cards/${p.id}.webp`,
      topImage: `cards/${p.id}-top.webp`,
      view: b.view!,
      ...(shown.get(p.id) ? { imageFrom: shown.get(p.id) } : {}),
      file: `maps/${p.id}.timber`,
      bytes: b.bytes!.length,
      sha256: sha256(b.bytes!),
    };
  });
  const total = built.reduce((s, b) => s + b.bytes!.length, 0);
  console.log(`${entries.length} places built in ${Math.round((performance.now() - t0) / 1000)} s: ${(total / 1024 / 1024).toFixed(1)} MB of .timber files.`);
  const stale = entries.filter((e) => e.imageFrom !== e.sha256).length;
  if (stale) console.log(`${stale} place(s)' card pictures do not show the current map: run npm run places:thumbs`);
  if (only) {
    console.log("--only: nothing written");
    return;
  }

  // the families in the order the page lists them; the places in the selection's order (rounds of
  // one place per family, so neighbours differ)
  const families = [...new Set(entries.map((e) => e.family))].map((id) => ({ id, name: FAMILIES[id].name })).sort((a, b) => a.name.localeCompare(b.name));
  const index: PlaceIndex = { format: 1, count: entries.length, families, sizes: [...new Set(entries.map((e) => e.size))].sort((a, b) => a - b), places: entries };
  const json = JSON.stringify(index, null, 1) + "\n";
  if (check) {
    const now = existsSync(join(OUT, "index.json")) ? readFileSync(join(OUT, "index.json"), "utf8") : "";
    if (now !== json) {
      console.error(`${OUT}/index.json differs from a fresh run. Run npm run places.`);
      process.exit(1);
    }
    console.log(`${OUT}/index.json matches a fresh run`);
    return;
  }
  writeFileSync(join(OUT, "index.json"), json);
  // pictures of places gone
  for (const f of readdirSync(join(OUT, "cards"))) if (!entries.some((e) => e.image === `cards/${f}` || e.topImage === `cards/${f}`)) rmSync(join(OUT, "cards", f));
  console.log(`wrote ${OUT}/index.json`);
}

if (isMainThread)
  main().catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(1);
  });
