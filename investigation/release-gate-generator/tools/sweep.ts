// The sweep: generate theme × size × seed through the public entry points and measure each map
// against the decisions. Results go to local/sweep-<size>.jsonl (gitignored).
//   npx tsx investigation/release-gate-generator/tools/sweep.ts <sizeX>[x<sizeY>] <seedFrom>-<seedTo> [theme,theme] [extra fragment]
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { generate } from "../../../src/core/gen/generate";
import { MapSession } from "../../../src/core/doc/session";
import { decodeProject, encodeProject, generatedDocument } from "../../../src/core/doc/document";
import { readTimber } from "../../../src/core/format/timber";
import { storedWater, surfaceOf } from "../../../src/core/format/world";
import { mapObjects, waterModel } from "../../../src/core/sim/model";
import { canonicalSettle } from "../../../src/core/sim/prefill";
import { decodeSpecFragment, THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { validateMap } from "../../../src/core/validate/checks";
import { minesWanted } from "../../../src/core/validate/playability";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const [sizeArg, seedArg, themeArg, extra] = process.argv.slice(2);
const size = sizeArg ?? "96";
const [sf, st] = (seedArg ?? "1-5").split("-").map(Number);
const themes = (themeArg ? themeArg.split(",") : [...THEMES]) as ThemeId[];
mkdirSync("investigation/release-gate-generator/local", { recursive: true });
const out = `investigation/release-gate-generator/local/sweep-${size}${extra ? "-" + extra.replace(/[^a-z0-9]+/gi, "_") : ""}.jsonl`;

/** Wet components (depth > 0) of the stored water with no source entity on any of their tiles. */
function unfedComponents(W: number, H: number, depth: ArrayLike<number>, sources: Set<number>): { count: number; tiles: number; biggest: number; at: number } {
  const N = W * H;
  const seen = new Uint8Array(N);
  let count = 0, tiles = 0, biggest = 0, at = -1;
  for (let s = 0; s < N; s++) {
    if (seen[s] || !(depth[s] > 0)) continue;
    const stack = [s];
    seen[s] = 1;
    let fed = false, n = 0;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      if (sources.has(i)) fed = true;
      const x = i % W, y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!seen[j] && depth[j] > 0) { seen[j] = 1; stack.push(j); }
      }
    }
    if (!fed) { count++; tiles += n; if (n > biggest) { biggest = n; at = s; } }
  }
  return { count, tiles, biggest, at };
}

for (const theme of themes)
  for (let seed = sf; seed <= st; seed++) {
    const frag = `s=${seed}&t=${theme}&z=${size}${extra ? "&" + extra : ""}`;
    const t0 = Date.now();
    const row: Record<string, unknown> = { theme, size, seed, frag };
    try {
      const d = decodeSpecFragment(frag)!;
      row.problems = d.problems;
      let shown: Uint8Array | null = null;
      const r = generate(d.spec, { onLand: (l) => { if (!shown) shown = l.heights.slice(); } });
      row.ms = Date.now() - t0;
      row.passed = r.report.passed;
      row.attempts = r.attempts;
      row.fails = r.report.checks.filter((c) => !c.ok).map((c) => c.id);
      row.sha = sha(r.bytes);
      row.name = r.name;
      row.outcomesMet = r.outcomes?.met;
      row.fixes = r.info.fixes ?? [];
      const h = r.built.heights;
      let top = 0;
      for (const v of h) if (v > top) top = v;
      row.top = top;
      row.ht = d.spec.settings.terrain.highestTerrain;
      // the first land shown is the map (D348), but for the worn way out
      const worn = new Set(r.info.worn?.cut ?? []);
      let shownDiff = -1;
      if (shown) { shownDiff = 0; for (let i = 0; i < h.length; i++) if (h[i] !== shown[i] && !worn.has(i)) shownDiff++; }
      row.shownDiff = shownDiff;
      row.levers = r.analysis?.levers ?? null;
      // the file, read back
      const file = readTimber(r.bytes);
      const w = file.world;
      const W = w.sizeX, H = w.sizeY;
      const surface = surfaceOf(w);
      let diffH = 0;
      for (let i = 0; i < W * H; i++) if (surface[i] !== h[i]) diffH++;
      row.fileHeightsDiffer = diffH;
      const objects = mapObjects(w);
      row.badwater = objects.filter((o) => o.template === "BadwaterSource").length;
      row.waterSources = objects.filter((o) => o.template === "WaterSource").length;
      row.mines = objects.filter((o) => o.template === "UndergroundRuins").length;
      row.minesWanted = minesWanted(W, H);
      row.starts = objects.filter((o) => o.template === "StartingLocation").length;
      const species: Record<string, number> = {};
      for (const o of objects) if (/^(Pine|Birch|Oak|Succulent|BlueberryBush)$/.test(o.template)) species[o.template] = (species[o.template] ?? 0) + 1;
      row.species = species;
      const templates: Record<string, number> = {};
      for (const o of objects) templates[o.template] = (templates[o.template] ?? 0) + 1;
      row.templates = templates;
      row.hydro = r.info.hydro;
      row.edgeRivers = r.features.filter((f) => f.kind === "river" && "edge" in (f as { params: { entry: object } }).params.entry).length;
      row.lakeFeatures = r.features.filter((f) => f.kind === "lake").length;
      // the stored water against the canonical settle of the file's own land and sources
      const sparse = storedWater(w.singletons, W, H);
      const storedDepth = new Float64Array(W * H);
      for (let k = 0; k < sparse.tile.length; k++) storedDepth[sparse.tile[k]] += sparse.depth[k];
      const again = canonicalSettle(waterModel(W, H, surface, objects));
      let diffW = 0, maxDiff = 0, wet = 0, minBed = 99;
      for (let i = 0; i < W * H; i++) {
        const a = storedDepth[i], b = again.depth[i];
        if (a > 0.001 || b > 0.001) { if (Math.abs(a - b) > 0.01) diffW++; if (Math.abs(a - b) > maxDiff) maxDiff = Math.abs(a - b); }
        if (a > 0.05) { wet++; if (surface[i] < minBed) minBed = surface[i]; }
      }
      row.waterMismatch = diffW;
      row.waterMaxDiff = Math.round(maxDiff * 1000) / 1000;
      row.wetShare = Math.round((wet / (W * H)) * 1000) / 1000;
      row.minBed = minBed;
      const sources = new Set<number>();
      for (const o of objects) if (o.template === "WaterSource" || o.template === "BadwaterSource") sources.add(o.y * W + o.x);
      row.unfed = unfedComponents(W, H, storedDepth, sources);
      // the file re-validated on its own: the same verdicts as the generator reported
      const v = validateMap(file, { profile: "generate", spec: d.spec, features: r.features });
      const verdict = (cs: { id: string; ok: boolean; applicable?: boolean; approximate?: string }[]) => cs.map((c) => `${c.id}:${c.applicable === false ? "na" : c.approximate ? "approx" : c.ok ? "ok" : "FAIL"}`);
      const a = verdict(r.report.checks), b = verdict(v.report.checks);
      row.revalidateDiff = a.filter((x, k) => x !== b[k]).map((x, k) => `${x} vs ${b[a.indexOf(x)]}`);
      row.revalidatePassed = v.report.passed;
      row.description = file.metadata?.MapDescription;
      // the editor's export of the generated map, and of its project saved and reopened: the same bytes
      const session = MapSession.fromGenerated(r, r.file);
      row.exportSame = sha(session.exportTimber().bytes) === row.sha;
      const reopened = MapSession.open(decodeProject(encodeProject(generatedDocument(r))));
      row.reopenSame = sha(reopened.exportTimber().bytes) === row.sha;
      // a second generation in the same process: the same bytes
      if (seed === sf) row.sameAgain = sha(generate(d.spec).bytes) === row.sha;
    } catch (e) {
      row.error = (e as Error).stack?.split("\n").slice(0, 3).join(" | ");
    }
    appendFileSync(out, JSON.stringify(row) + "\n");
    const flag = row.error ? "THROW" : !row.passed ? "FAIL" : (row.waterMismatch as number) > 0 || (row.unfed as { count: number }).count > 0 || (row.revalidateDiff as string[]).length || (row.top as number) > (row.ht as number) || (row.fileHeightsDiffer as number) > 0 || (row.shownDiff as number) !== 0 || row.exportSame === false || row.reopenSame === false ? "ODD" : "ok";
    console.log(`${flag} ${theme} ${size} ${seed} ${row.ms}ms att=${row.attempts} top=${row.top}/${row.ht} shownDiff=${row.shownDiff} metal=${(row.levers as {metal:number}|null)?.metal} bw=${row.badwater} mines=${row.mines} minBed=${row.minBed} wet=${row.wetShare} unfed=${JSON.stringify(row.unfed)} wmis=${row.waterMismatch}/${row.waterMaxDiff} reval=${JSON.stringify(row.revalidateDiff)} export=${row.exportSame}/${row.reopenSame} fails=${JSON.stringify(row.fails)}${row.error ? " " + row.error : ""}`);
  }
