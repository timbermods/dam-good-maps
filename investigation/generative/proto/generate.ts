// The prototype generator (docs/m9-design.md): genome → uplift field → erosion → levels → rivers
// from the drainage → the settler → hazards found in the terrain → map objects and resources (the
// product's own planners) → the build pipeline → the real validators in the `generate` profile, plus
// `water.storage_possible` (the workshop study's rule, Kyler's no-dam-ridge decision 2026-09-25).
// No dam-site ridge and no terrain is ever added to make a dam site: dam sites are only found.
//
// The terrain reaches the build as sculpt edits (one "flatten" per level) over the planned
// features, so the product's build, slopes, water settle, resources, writer and validators run
// unchanged (no src/ change). The real implementation replaces that stand-in with a base terrain
// layer rasterized from the genome (docs/m9-design.md, "The document model").

import { buildMap, SettleCache, type BuildResult } from "../../../src/core/features/build";
import { featureId } from "../../../src/core/features/ids";
import { objectTiles } from "../../../src/core/features/objects";
import type { Feature, MapObjectFeature, SetPieceFeature, StartFeature } from "../../../src/core/features/schema";
import type { SculptEdit } from "../../../src/core/features/raster/terrain";
import { planExtras } from "../../../src/core/gen/extras";
import { planResources } from "../../../src/core/gen/resources";
import { startWalkable } from "../../../src/core/gen/valley";
import type { GenerateResult } from "../../../src/core/gen/generate";
import { toTimberFile } from "../../../src/core/gen/pack";
import { mapMetadata, writeTimber } from "../../../src/core/format/timber";
import { tilesToRuns } from "../../../src/core/math/grid";
import { stream } from "../../../src/core/math/rng";
import { makeSpec, type Difficulty, type MapSpec, type ThemeId } from "../../../src/core/spec/mapspec";
import { validateMap, type Validation } from "../../../src/core/validate/checks";
import { blocks, type CheckResult } from "../../../src/core/validate/report";
import { erode } from "./erode";
import { upliftField } from "./field";
import { drawGenome, type Genome } from "./genome";
import { planBadwater } from "./hazards";
import { planHydro, type Hydro } from "./hydro";
import { cleanPitsAndSpikes, fillDryHollows, mergeSmallRegions } from "./levels";
import { snapLevels } from "./levels";
import { pickStart, type StartPick } from "./start";
import { storagePossible } from "./storage";
import { damWalls } from "../lib/ridge";
import { shoreWalkFrom } from "./start";

export const PROTO_VERSION = "0.7.0-proto.2";
export const MAX_ATTEMPTS = 12;

export interface ProtoInfo {
  genome: Genome;
  start: StartPick | null;
  hydro: { rivers: number; lakes: number; falls: number; flow: number; splits: number; deltas: number };
  badwater: string;
  stage: string;
  ms: Record<string, number>;
}

// (the product's GenerateResult as it was before M9a: M9a added its own info, field, intentions and timings)
export type ProtoResult = Omit<GenerateResult, "info" | "field" | "intentions" | "timings"> & Partial<Pick<GenerateResult, "field" | "intentions" | "timings">> & { recipe: string | null; genome: Genome; info: ProtoInfo; storage: CheckResult };

/** One flatten edit per level: the terrain as the build's step 6 applies it. */
export function sculptsOf(h: Uint8Array, W: number): SculptEdit[] {
  const by = new Map<number, number[]>();
  for (let i = 0; i < h.length; i++) (by.get(h[i]) ?? by.set(h[i], []).get(h[i])!).push(i);
  return [...by.keys()].sort((a, b) => a - b).map((lv) => ({ params: { mode: "flatten", level: lv, cells: tilesToRuns(by.get(lv)!, W) } }));
}

function specFor(theme: ThemeId, seed: number, size: number, difficulty: Difficulty, g: Genome, attempt: number): MapSpec {
  const spec = makeSpec({ seed, theme, size: { x: size, y: size }, designedFor: difficulty });
  spec.generatorVersion = PROTO_VERSION;
  spec.accepted = { attempt, candidate: 0 };
  const s = spec.settings;
  s.resources.forestDensity = g.resources.forest;
  s.resources.berryBushes = g.resources.bushes;
  s.resources.ruins = g.resources.ruins;
  s.resources.groveSize = g.resources.grove;
  s.hazards.thornBelts = g.hazards.thorns ? "some" : "off";
  s.hazards.badwater = g.hazards.badwater === "none" ? "off" : g.hazards.ratio < 0.5 ? "low" : g.hazards.ratio < 0.85 ? "normal" : "high";
  if (g.recipe) spec.premise = g.recipe;
  return spec;
}

interface Attempt {
  result: ProtoResult;
  passed: boolean;
}

export function generateProto(theme: ThemeId, seed: number, size: number, difficulty: Difficulty = "normal", opts: { maxAttempts?: number; variety?: number } = {}): ProtoResult {
  const failures: { attempt: number; failed: string[] }[] = [];
  let last: Attempt | null = null;
  const max = opts.maxAttempts ?? MAX_ATTEMPTS;
  for (let attempt = 0; attempt < max; attempt++) {
    const a = attemptOnce(theme, seed, size, difficulty, attempt, opts.variety ?? 70);
    a.result.attempts = attempt + 1;
    a.result.failures = failures;
    last = a;
    if (a.passed) return a.result;
    failures.push({ attempt, failed: a.result.report.checks.filter((c) => blocks("generate", c)).map((c) => c.id).concat(a.result.storage.ok ? [] : ["water.storage_possible"]).concat(a.result.info.stage !== "built" && a.result.info.stage !== "terrain changed in the build" ? [a.result.info.stage === "dam wall" ? "terrain.dam_wall" : a.result.info.stage] : []) });
  }
  return last!.result;
}

function attemptOnce(theme: ThemeId, seed: number, size: number, difficulty: Difficulty, attempt: number, variety: number): Attempt {
  const W = size;
  const H = size;
  const ms: Record<string, number> = {};
  let t = performance.now();
  const lap = (k: string) => {
    const n = performance.now();
    ms[k] = Math.round(n - t);
    t = n;
  };
  const g = drawGenome(theme, seed, W, H, attempt, variety);
  const spec = specFor(theme, seed, size, difficulty, g, attempt);
  const U = upliftField(g, seed, W, H);
  const E = erode(U, W, H, g.erosion.iterations, g.erosion.k, g.erosion.diffusion);
  const h = snapLevels(E, g, seed, W, H);
  lap("terrain");
  const hy = planHydro(E, h, g, seed, W, H, attempt);
  const keep = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) keep[i] = hy.water[i] === 1 || hy.water[i] === 2 ? 1 : 0;
  mergeSmallRegions(h, W, H, 4, keep);
  cleanPitsAndSpikes(h, W, H, keep);
  // the lakes keep their water; every other closed hollow is filled to its rim
  fillDryHollows(h, W, H, keep);
  lap("hydro");
  const cache = new SettleCache();
  const rivers: Feature[] = hy.rivers;
  const build = (features: readonly Feature[], stop: "water" | "resources" | null) =>
    buildMap({ W, H, seed, features, sculpts: sculptsOf(h, W) }, { settleCache: cache, ...(stop === "resources" ? { stopBeforeResources: true } : stop === "water" ? { stopBeforeWater: true } : {}) });
  const info: ProtoInfo = {
    genome: g,
    start: null,
    hydro: { rivers: hy.rivers.length, lakes: hy.lakes.length, falls: hy.falls.length, flow: hy.flowTotal, splits: hy.arms.filter((a) => a.kind === "split").length, deltas: hy.arms.filter((a) => a.kind === "mouth").length },
    badwater: "none",
    stage: "planned",
    ms,
  };
  const fail = (stage: string, b: BuildResult | null): Attempt => {
    info.stage = stage;
    const built = b ?? build(rivers, null);
    const file = toTimberFile(spec, built);
    const v = validateMap(file, { profile: "generate", spec, features: rivers, water: { model: built.waterModel, settled: built.settle } });
    return {
      passed: false,
      result: { spec, features: [...rivers], built, report: { ...v.report, passed: false }, analysis: v.analysis, bytes: new Uint8Array(), file, attempts: attempt + 1, failures: [], recipe: g.recipe, genome: g, info, storage: { id: "water.storage_possible", class: "playability", severity: "error", ok: false, message: stage } },
    };
  };
  if (!hy.rivers.length) return fail("no rivers", null);
  // the water as the rivers leave it, for the settler
  const b0 = build(rivers, "resources");
  lap("settle");
  const rng = stream(seed, "settler", attempt);
  const pick = pickStart(h, W, H, { depth: b0.water, contamination: b0.contamination, moisture: b0.moisture }, hy, g.settler, rng, spec.settings.start.rules.waterWithin);
  info.start = pick;
  if (!pick) return fail("no start", b0);
  if (pick.levelled) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) h[(pick.y + dy) * W + pick.x + dx] = pick.level;
    // a path levelled to the shore (the bench running to the bank, D97): 3 tiles wide
    if (pick.shore) {
      const [bx, by] = pick.shore;
      const steps = Math.ceil(Math.max(Math.abs(bx - pick.x), Math.abs(by - pick.y)) * 2);
      for (let k = 0; k <= steps; k++) {
        const px: number = pick.x + ((bx - pick.x) * k) / steps;
        const py: number = pick.y + ((by - pick.y) * k) / steps;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const j = Math.round(py + dy) * W + Math.round(px + dx);
            if (hy.water[j] === 1 || hy.water[j] === 2 || b0.water[j] > 0.001) continue;
            h[j] = pick.level;
          }
      }
    }
    cleanPitsAndSpikes(h, W, H, keep);
  }
  const start: StartFeature = {
    id: featureId(seed, "start", "start/main"),
    kind: "start",
    origin: "generated",
    role: "start/main",
    locked: false,
    params: { position: [pick.x, pick.y], orientation: pick.orientation, benchRadius: 2, benchLevel: pick.level, player: 0 },
  };
  let layout: Feature[] = [...rivers, start];
  let base = build(layout, "resources");
  lap("start");
  // hazards found in the terrain: badwater in a natural hollow, or a poisoned stream from an edge
  let bad = planBadwater(h, W, H, base, hy, g, spec, seed, attempt, { x: pick.x, y: pick.y });
  if (bad.features.length) {
    const before = h.slice();
    h.set(bad.heights);
    const withBad = [...layout.filter((f) => f.kind !== "start"), ...bad.features, start];
    const b2 = build(withBad, "resources");
    // the start's water must stay clean and in reach: otherwise this terrain has no safe place for it
    if (startWaterOk(b2, pick, spec.settings.start.rules.waterWithin)) {
      layout = withBad;
      base = b2;
    } else {
      h.set(before);
      bad = { kind: "none", features: [], avoid: new Uint8Array(W * H), heights: h };
    }
  }
  info.badwater = bad.kind;
  lap("hazards");
  // map objects on the built ground (relics, geothermal fields, mine sites, thorn belts)
  const walked = startWalkable(base);
  const objects = planExtras({ spec, base, features: layout, protect: null, avoid: bad.avoid, candidate: 0, attempt });
  if (objects.length) {
    let b2 = build([...layout, ...objects], "resources");
    const own = (f: MapObjectFeature) => objectTiles(f, W, H).length;
    const kept = objects.slice();
    const total = () => kept.reduce((a, f) => a + own(f), 0);
    while (kept.length && startWalkable(b2) < walked - total() - 40) {
      kept.sort((a, c) => (a.params.kind === "thornBelt" ? 0 : 1) - (c.params.kind === "thornBelt" ? 0 : 1) || own(c) - own(a));
      kept.shift();
      b2 = build([...layout, ...kept], "resources");
    }
    layout.push(...kept);
    base = b2;
  }
  lap("objects");
  const resources = planResources(spec, base, 0, attempt, { protect: bad.avoid, lockedMask: null }, []);
  const features = [...layout, ...resources];
  const built = build(features, null);
  lap("resources");
  // the built terrain is the planned one: the build's integrity pass changed nothing
  let same = true;
  for (let i = 0; i < W * H; i++) if (built.heights[i] !== h[i]) same = false;
  if (!same) info.stage = "terrain changed in the build";
  const file = toTimberFile(spec, built);
  file.metadata = mapMetadata(W, H, `${theme} prototype, seed ${seed}. Made with the Dam Good Maps M9 design prototype ${PROTO_VERSION}.`);
  const v: Validation = validateMap(file, { profile: "generate", spec, features, water: { model: built.waterModel, settled: built.settle } });
  lap("validate");
  const storage = storagePossible(h, W, H, built, v, spec);
  lap("storage");
  // the dam-wall check (lib/ridge.ts), a design check of the generate profile in M9a: land that
  // reads as a wall across a valley is rejected like any other failing check, and the seed tries
  // another genome
  const walls = v.report.passed && storage.ok ? damWalls(built.heights, W, H, built.water) : [];
  if (walls.length) info.stage = "dam wall";
  const passed = v.report.passed && storage.ok && !walls.length;
  if (info.stage === "planned") info.stage = "built";
  const bytes = passed ? writeTimber(file) : new Uint8Array();
  lap("write");
  return {
    passed,
    result: { spec, features, built, report: v.report, analysis: v.analysis, bytes, file, attempts: attempt + 1, failures: [], recipe: g.recipe, genome: g, info, storage },
  };
}

/** Whether the start still walks to clean pumpable water on its own level within the rule. */
function startWaterOk(b: BuildResult, pick: StartPick, rule: number): boolean {
  const d = shoreWalkFrom(b.heights, b.W, b.H, b.water, b.contamination, rule);
  let w = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) w = Math.min(w, d[(pick.y + dy) * b.W + pick.x + dx]);
  return w <= rule - 3;
}

export type { Hydro, SetPieceFeature };
