// What the generator worker returns to the page: everything the preview, the map card and the
// downloads need, with the big arrays as typed arrays (transferred, not copied).

import { encodeProject, projectFileName, generatedDocument } from "../core/doc/document";
import { startBench } from "../core/analysis/metrics";
import { isSapling, type WoodBySpecies } from "../core/analysis/wood";
import type { JsonObject } from "../core/format/json";
import type { BuildResult } from "../core/features/build";
import type { Feature } from "../core/features/schema";
import { writeTimber } from "../core/format/timber";
import { generate, type GenerateResult } from "../core/gen/generate";
import { fileName, mapName, description, toTimberFile } from "../core/gen/pack";
import type { MapSpec } from "../core/spec/mapspec";
import { rulesFor, type PlayabilityAnalysis } from "../core/validate/playability";
import type { CheckResult } from "../core/validate/report";

export interface PreviewEntity {
  template: string;
  x: number;
  y: number;
  z: number;
  orientation: string;
  owner: string;
  dead?: boolean;
  young?: boolean;
  /** A ruin's variant ("A" to "E"), which the 3D view draws. */
  variant?: string;
}

/** Key facts for the map card (PLAN §14.3). */
export interface MapFacts {
  cleanSources: number;
  cleanFlow: number;
  badwaterFlow: number;
  /** Badwater sources (one per basin). */
  badwaterSources: number;
  /** Share of the map under water (deeper than 0.05). */
  wetShare: number;
  /** The best dam site within 40 tiles of the start. */
  bestDam: { x: number; y: number; dir: [number, number]; length: number; height: number; volume: number; area: number } | null;
  /** Water natural pools keep through the worst drought, within 40 tiles of the start. */
  naturalStorage: number;
  /** Stored water the colony needs through the worst drought. */
  reservoirNeed: number;
  /** Tiles' walk from the start to a shore a pump works from (null: none). */
  waterDistance: number | null;
  /** Starting wood by species: the logs of the grown trees within 20 tiles' walk (D164); and the
   *  saplings' logs there, still growing. */
  woodBySpecies: WoodBySpecies | null;
  woodGrowing: number;
  /** The start's bench: tiles at the district center's level within 8 tiles (Start area is a
   *  preference, D211; null without a start). */
  startBench: number | null;
  settle: { ticks: number; settled: boolean };
}

export interface GenerateResponse {
  spec: MapSpec;
  features: Feature[];
  W: number;
  H: number;
  heights: Uint8Array;
  water: Float32Array;
  contamination: Float32Array;
  moisture: Float32Array;
  soilContamination: Float32Array;
  /** Land walkable from the start (1). */
  reach: Uint8Array;
  facts: MapFacts;
  entities: PreviewEntity[];
  checks: CheckResult[];
  passed: boolean;
  attempts: number;
  /** The file (empty when the map is an open editor document: its export goes through the
   *  editor's export check). */
  timber: Uint8Array;
  timberName: string;
  project: Uint8Array;
  projectName: string;
  name: string;
  premise: string;
  sha256: string;
  ms: number;
  /** The player's edits on this map (0 for a freshly generated map). */
  edits: number;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The last map generated here, for "Refine this map" and the download without water. */
let last: GenerateResult | null = null;

export function lastGenerated(): GenerateResult | null {
  return last;
}

/** Whether an entity's components mark it dead, or a sapling. The growth is read as the file
 *  stores it (analysis/wood.ts `isSapling`: the parser keeps a float as a JsonFloat, which
 *  `Number()` turned into NaN, so no sapling ever read as young). */
export function lifeOf(components: Record<string, unknown> | undefined): { dead?: true; young?: true } {
  if (!components) return {};
  const out: { dead?: true; young?: true } = {};
  const lnr = components.LivingNaturalResource as { IsDead?: unknown } | undefined;
  if (lnr && lnr.IsDead === true) out.dead = true;
  if (isSapling(components as JsonObject)) out.young = true;
  return out;
}

/** A ruin's variant (`RuinModels.VariantId`), for the 3D view's model. */
export function variantOf(components: Record<string, unknown> | undefined): { variant?: string } {
  const r = components?.RuinModels as { VariantId?: unknown } | undefined;
  return r && typeof r.VariantId === "string" ? { variant: r.VariantId } : {};
}

export interface ResponseInput {
  spec: MapSpec;
  features: Feature[];
  built: BuildResult;
  checks: CheckResult[];
  passed: boolean;
  analysis: PlayabilityAnalysis | null;
  attempts: number;
  ms: number;
  timber: Uint8Array;
  project: Uint8Array;
  edits: number;
}

/** The page's view of a built map (a fresh generation, or an editor document's current map). */
export async function responseOf(r: ResponseInput): Promise<GenerateResponse> {
  const b = r.built;
  const a = r.analysis;
  const N = b.W * b.H;
  let wet = 0;
  for (let i = 0; i < N; i++) if (b.water[i] > 0.05) wet++;
  const clean = b.sources.filter((s) => s.template === "WaterSource");
  const bad = b.sources.filter((s) => s.template === "BadwaterSource");
  const sum = (xs: { strength: number }[]) => Math.round(xs.reduce((s, x) => s + x.strength, 0) * 100) / 100;
  const facts: MapFacts = {
    cleanSources: clean.length,
    cleanFlow: sum(clean),
    badwaterFlow: sum(bad),
    badwaterSources: bad.length,
    wetShare: wet / N,
    bestDam: a?.bestDam ?? null,
    naturalStorage: a ? Math.round(a.naturalStorage) : 0,
    reservoirNeed: Math.round(rulesFor(r.spec).reservoirNeed),
    waterDistance: a && Number.isFinite(a.waterDistance) ? Math.round(a.waterDistance * 10) / 10 : null,
    woodBySpecies: a ? { ...a.woodBySpecies } : null,
    woodGrowing: a ? a.woodGrowing : 0,
    startBench: b.start ? startBench(b.heights, b.W, b.H, b.start) : null,
    settle: { ticks: b.settle.ticks, settled: b.settle.settled },
  };
  return {
    spec: r.spec,
    features: r.features,
    W: b.W,
    H: b.H,
    heights: b.heights.slice(), // copies: the transfer detaches them, and the worker keeps the map
    water: Float32Array.from(b.water),
    contamination: Float32Array.from(b.contamination),
    moisture: Float32Array.from(b.moisture),
    soilContamination: Float32Array.from(b.soilContamination),
    reach: a ? a.reach.slice() : new Uint8Array(N),
    facts,
    entities: b.entities.map((e) => {
      const comps = e.raw ? (e.raw.Components as Record<string, unknown>) : { ...(e.before ?? {}), ...e.components };
      return { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, owner: e.owner, ...lifeOf(comps), ...variantOf(comps) };
    }),
    checks: r.checks,
    passed: r.passed,
    attempts: r.attempts,
    timber: r.timber,
    timberName: fileName(r.spec),
    project: r.project,
    projectName: projectFileName(r.spec),
    name: mapName(r.spec),
    premise: description(r.spec),
    sha256: r.timber.length ? await sha256(r.timber) : "",
    ms: r.ms,
    edits: r.edits,
  };
}

/** What the page hears while a map is made (ROADMAP M9a: generating shows its progress): each
 *  attempt's stage, and its first look, the land and the water the hydrology planned (channels 1,
 *  lakes 2, floors 3), before the water is settled. */
export type GenProgress = { kind: "stage"; attempt: number; stage: string } | { kind: "land"; attempt: number; W: number; H: number; heights: Uint8Array; water: Uint8Array };

export async function runGenerate(spec: MapSpec, onProgress?: (p: GenProgress) => void): Promise<GenerateResponse> {
  const t0 = performance.now();
  const r = generate(
    spec,
    onProgress
      ? {
          onProgress: (p) => onProgress({ kind: "stage", attempt: p.attempt, stage: p.stage }),
          onLand: (l) => onProgress({ kind: "land", attempt: l.attempt, W: spec.size.x, H: spec.size.y, heights: l.heights, water: l.water }),
        }
      : {},
  );
  const ms = Math.round(performance.now() - t0);
  last = r;
  const project = encodeProject(generatedDocument(r));
  return responseOf({
    spec: r.spec,
    features: r.features,
    built: r.built,
    checks: r.report.checks,
    passed: r.report.passed,
    analysis: r.analysis,
    attempts: r.attempts,
    ms,
    timber: r.bytes,
    project,
    edits: 0,
  });
}

/** The last map again, without pre-filled water (PLAN §14.4, in-game check B2). */
export function emptyWaterFile(): { bytes: Uint8Array; name: string } | null {
  if (!last || !last.report.passed) return null;
  const bytes = writeTimber(toTimberFile(last.spec, last.built, { emptyWater: true }));
  return { bytes, name: fileName(last.spec).replace(/\.timber$/, " (empty water).timber") };
}
