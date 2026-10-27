// The map card's key facts (PLAN §14.3) for a built map and what its validation measured: a fresh
// generation, a version found for it, or an editor document's current map. Information only (D115):
// no check reads them.

import { startBench } from "../analysis/metrics";
import type { WoodBySpecies } from "../analysis/wood";
import type { BuildResult } from "../features/build";
import type { MapSpec } from "../spec/mapspec";
import { rulesFor, type PlayabilityAnalysis } from "./playability";

/** Key facts for the map card (PLAN §14.3). */
export interface MapFacts {
  cleanSources: number;
  cleanFlow: number;
  badwaterFlow: number;
  /** Badwater sources (one per basin). */
  badwaterSources: number;
  /** Share of the map under water (deeper than 0.05). */
  wetShare: number;
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

/** The facts of map `b`, built from `spec`, with what its playability checks measured (`a`, null when
 *  they did not run). */
export function mapFacts(spec: MapSpec, b: BuildResult, a: PlayabilityAnalysis | null): MapFacts {
  const N = b.W * b.H;
  let wet = 0;
  for (let i = 0; i < N; i++) if (b.water[i] > 0.05) wet++;
  const clean = b.sources.filter((s) => s.template === "WaterSource");
  const bad = b.sources.filter((s) => s.template === "BadwaterSource");
  const sum = (xs: { strength: number }[]) => Math.round(xs.reduce((s, x) => s + x.strength, 0) * 100) / 100;
  return {
    cleanSources: clean.length,
    cleanFlow: sum(clean),
    badwaterFlow: sum(bad),
    badwaterSources: bad.length,
    wetShare: wet / N,
    reservoirNeed: Math.round(rulesFor(spec).reservoirNeed),
    waterDistance: a && Number.isFinite(a.waterDistance) ? Math.round(a.waterDistance * 10) / 10 : null,
    woodBySpecies: a ? { ...a.woodBySpecies } : null,
    woodGrowing: a ? a.woodGrowing : 0,
    startBench: b.start ? startBench(b.heights, b.W, b.H, b.start) : null,
    settle: { ticks: b.settle.ticks, settled: b.settle.settled },
  };
}
