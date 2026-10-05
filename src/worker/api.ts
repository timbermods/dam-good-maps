// What the generator worker returns to the page: everything the preview, the map card and the
// downloads need, with the big arrays as typed arrays (transferred, not copied).

import { encodeProject, projectFileName, generatedDocument } from "../core/doc/document";
import { isSapling } from "../core/analysis/wood";
import { componentsOf } from "../core/format/entities";
import type { JsonObject } from "../core/format/json";
import type { BuildResult } from "../core/features/build";
import type { Feature } from "../core/features/schema";
import { writeTimber } from "../core/format/timber";
import { generate, type GenerateResult } from "../core/gen/generate";
import { findVersion, missesOf, notifies, versionNote, worthSearching, type Misses } from "../core/gen/versions";
import { fileName, mapName, description, toTimberFile } from "../core/gen/pack";
import type { MapSpec } from "../core/spec/mapspec";
import type { PlayabilityAnalysis } from "../core/validate/playability";
import { mapFacts, type MapFacts } from "../core/validate/facts";
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

// (the map card's facts are the core's: validate/facts.ts)
export type { MapFacts };

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
  /** The intentions a generated map was steered toward (Another like this keeps them, D278). */
  intentions: string[];
  /** D329: the outcomes a generated map missed, when a background search for a version meeting
   *  them all is worth starting, and the note that version gets ("A version with its sea is ready"),
   *  or null when it is kept quietly (D333 (5): only a missed theme promise notifies). */
  version?: { misses: Misses; note: string | null } | null;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The last map generated here, for opening it in the editor and the download without water. */
let last: GenerateResult | null = null;
/** The seed of the last map as it was typed, when it was a word (its saved file is named with it). */
let lastSeedWord: string | undefined;
export function lastGeneratedSeedWord(): string | undefined {
  return lastSeedWord;
}

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
  /** A generated map's own name and how it plays (D278 (1b)); else the theme's name and the map's
   *  description. */
  name?: string;
  premise?: string;
  intentions?: string[];
}

/** The page's view of a built map (a fresh generation, or an editor document's current map). */
export async function responseOf(r: ResponseInput): Promise<GenerateResponse> {
  const b = r.built;
  const a = r.analysis;
  const N = b.W * b.H;
  const facts = mapFacts(r.spec, b, a);
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
      const comps = componentsOf(e) as Record<string, unknown>;
      return { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, owner: e.owner, ...lifeOf(comps), ...variantOf(comps) };
    }),
    checks: r.checks,
    passed: r.passed,
    attempts: r.attempts,
    timber: r.timber,
    timberName: fileName(r.spec, lastSeedWord),
    project: r.project,
    projectName: projectFileName(r.spec, lastSeedWord),
    name: r.name ?? mapName(r.spec),
    premise: r.premise ?? description(r.spec),
    sha256: r.timber.length ? await sha256(r.timber) : "",
    ms: r.ms,
    intentions: r.intentions ?? [],
  };
}

/** D329's background search (gen/versions.ts): siblings of the map until one meets all three
 *  outcomes. Run in a worker of its own, so the editor never waits on it (the page ends it by
 *  terminating the worker). Null when none was found. */
export async function runFindVersion(from: { spec: MapSpec; intentions: string[]; heights: Uint8Array }): Promise<GenerateResponse | null> {
  const t0 = performance.now();
  const r = findVersion(from).result;
  if (!r) return null;
  return responseOf({
    spec: r.spec,
    features: r.features,
    built: r.built,
    checks: r.report.checks,
    passed: r.report.passed,
    analysis: r.analysis,
    attempts: r.attempts,
    ms: Math.round(performance.now() - t0),
    timber: r.bytes,
    project: encodeProject(generatedDocument(r)),
    ...(r.name ? { name: r.name } : {}),
    ...(r.description ? { premise: r.description } : {}),
    intentions: r.info.genome?.intentions ?? [],
  });
}

/** What the page hears while a map is made (ROADMAP M9a: generating shows its progress): each
 *  attempt's stage, and its first look, the land and the water the hydrology planned (channels 1,
 *  lakes 2, floors 3), before the water is settled. */
export type GenProgress =
  | { kind: "stage"; attempt: number; stage: string }
  | { kind: "land"; attempt: number; W: number; H: number; heights: Uint8Array; water: Uint8Array }
  /** The map, once it passed its checks (D329: the first that passes is the map, shown at once):
   *  its land and its settled water (1 where wet). */
  | { kind: "candidate"; attempt: number; candidate: number; of: number; met: boolean; W: number; H: number; heights: Uint8Array; water: Uint8Array };

export async function runGenerate(spec: MapSpec, onProgress?: (p: GenProgress) => void, seedWord?: string): Promise<GenerateResponse> {
  const t0 = performance.now();
  const r = generate(
    spec,
    onProgress
      ? {
          onProgress: (p) => onProgress({ kind: "stage", attempt: p.attempt, stage: p.stage }),
          onLand: (l) => onProgress({ kind: "land", attempt: l.attempt, W: spec.size.x, H: spec.size.y, heights: l.heights, water: l.water }),
          onCandidate: (c) => {
            const b = c.result.built;
            const wet = new Uint8Array(b.W * b.H);
            for (let i = 0; i < wet.length; i++) wet[i] = b.water[i] > 0.05 ? 1 : 0;
            onProgress({ kind: "candidate", attempt: c.attempt, candidate: c.candidate, of: c.of, met: c.outcomes.met, W: b.W, H: b.H, heights: b.heights.slice(), water: wet });
          },
        }
      : {},
  );
  const ms = Math.round(performance.now() - t0);
  last = r;
  lastSeedWord = seedWord;
  const project = encodeProject(generatedDocument({ ...r, seedWord }));
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
    ...(r.name ? { name: r.name } : {}),
    ...(r.description ? { premise: r.description } : {}),
    intentions: r.info.genome?.intentions ?? [],
  }).then((resp) => {
    // (a miss worth a background search, D329)
    if (r.report.passed && r.outcomes) {
      const m = missesOf(r.outcomes);
      resp.version = worthSearching(m) ? { misses: m, note: notifies(m) ? versionNote(r.spec.theme, m) : null } : null;
    }
    return resp;
  });
}

/** The last map again, without pre-filled water (PLAN §14.4, in-game check B2). */
export function emptyWaterFile(): { bytes: Uint8Array; name: string } | null {
  if (!last || !last.report.passed) return null;
  const bytes = writeTimber(toTimberFile(last.spec, last.built, { emptyWater: true }));
  return { bytes, name: fileName(last.spec, lastSeedWord).replace(/\.timber$/, "-empty-water.timber") };
}
