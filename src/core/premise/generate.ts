// The generator's premise mode (docs/PREMISES.md §2.1, §2.2 stages 3, 5 and 8; build step 4): `generate` calls
// `generatePremise` when `spec.premise` names a premise (share link key `p`; no control on the page yet). Each attempt
// draws a plan (stage 0), lays its water by number (stage 1) and the relief between (stage 2), places the start for the
// first frame (stage 3), lays the ladder (stage 4, `ladder.ts`: each work's site and its gain by number, read out in
// `info.premise.ladder`), builds the map once with the generator's own `buildMap` (one canonical settle, stage 5) and
// runs the checks in profile "generate" (stage 8). The build plants the map's life and resources on the settled
// ground first (stage 6, `life.ts`; the settle reused). A plan that fails anywhere before the settle is drawn again
// for the cost of its land; one that fails its checks costs a settle. A plan handed over too watered or too dry by
// number (`ladder.ts` `spectrumMiss`) is drawn again before its settle. A premise the spec rules out (`eligible`), or
// one whose plans are spent, hands the spec back with the reason in one line, and the themes make the map (D471).
//
// Not yet (a later build step): set pieces (stage 7). A check only that step answers would be reported as a warning
// (`LATER`), never silently; none is now.

import type { GenerateOptions, GenerateResult, GenerationInfo } from "../gen/generate";
import { writeTimber } from "../format/timber";
import type { MapSpec } from "../spec/mapspec";
import { rulesFor } from "../validate/playability";
import { blocks, type CheckResult, type ValidationReport } from "../validate/report";
import { drawPlan, failing, PLAN_TRIES, type Failure } from "./draw";
import { checkFrame } from "./frame";
import { ladderOf, spectrumMiss, type Ladder } from "./ladder";
import type { LifeReport } from "./life";
import { premiseLand, premiseMap } from "./map";
import { PREMISES } from "./premises";
import type { PremiseId, PremisePlan } from "./types";
import { waterByNumber } from "./water";

/** Settles one premise map may cost before the themes make it (PREMISES §2.2 stage 5: at most two a plan; the themes
 *  allow five a genome). A plan that fails before the settle costs none. */
export const PREMISE_SETTLES = 3;

/** The checks a premise map answers only at a later build step (PREMISES §7), each with the step that answers it:
 *  until then a warning on it. Empty since step 6: its plants answer `start.food`, `start.wood` and
 *  `start.wood_floor`, and its mine sites `resources.mine_site`. */
export const LATER: Readonly<Record<string, string>> = {};

/** What a premise map records of its making (`GenerationInfo.premise`). */
export interface PremiseInfo {
  id: string;
  /** The plan the map was made from (the ladder's readout reads it, §8). */
  plan?: PremisePlan;
  /** The attempt whose plan made the map. */
  attempt?: number;
  /** The ladder (stage 4): each work's site and its gain by number, and day 1's water and moist shares. */
  ladder?: Ladder;
  /** What stage 6 planted, against its budget. */
  life?: LifeReport;
  /** Where stage 3 put the start, and what it measured there. */
  start?: { moved: number; level: number; farmland: number; shallow: number };
  /** The checks reported as warnings until a later build step answers them (`LATER`). */
  later?: string[];
  /** What could not stand as the plan has it, one line each (never silent, D342). */
  notes?: string[];
  /** Why the themes made this map instead, in one line (D471). */
  fellBack?: string;
}

/** The checks with those a later step answers turned into warnings, saying which step. */
function deferLater(report: ValidationReport): { report: ValidationReport; later: string[] } {
  const later: string[] = [];
  const checks: CheckResult[] = report.checks.map((c) => {
    const why = LATER[c.id];
    if (!why || c.ok || !blocks(report.profile, c)) return c;
    later.push(c.id);
    return { ...c, advisory: true, severity: "warning", message: `${c.message} (a premise map: ${why})` };
  });
  return { report: { ...report, checks, passed: !checks.some((c) => blocks(report.profile, c)) }, later };
}

/** A premise map for a spec whose `premise` names one, or why the themes must make it (one line, D471). */
export function generatePremise(specIn: MapSpec, opts: GenerateOptions = {}): { result: GenerateResult } | { reason: string } {
  const t0 = performance.now();
  const def = PREMISES[specIn.premise as PremiseId];
  if (!def) return { reason: `There is no premise "${specIn.premise}"` };
  const why = def.eligible(specIn);
  if (why) return { reason: why };
  const rules = rulesFor(specIn);
  const needs = { level: rules.levelLand, farmland: rules.farmland };
  const failures: GenerateResult["failures"] = [];
  const failedAt: number[] = [];
  let settles = 0;
  let last = "";
  const fail = (attempt: number, f: Failure[] | string[]) => {
    const ids = f.map((x) => (typeof x === "string" ? x : x.id));
    failures.push({ attempt, failed: ids });
    failedAt.push(Math.round(performance.now() - t0));
    last = typeof f[0] === "string" ? f[0] : `${f[0].id}: ${f[0].reason}`;
  };
  for (let attempt = 0; attempt < PLAN_TRIES && settles < PREMISE_SETTLES; attempt++) {
    // stage 0: the plan
    opts.onProgress?.({ attempt, stage: "plan" });
    const drawn = drawPlan(def, specIn, attempt);
    if ("reason" in drawn) {
      fail(attempt, [drawn.reason]);
      continue;
    }
    if (drawn.failures.length) {
      fail(attempt, drawn.failures);
      continue;
    }
    const plan = drawn.plan;
    // stage 1: its water by number, and the `land` invariants it alone can judge
    opts.onProgress?.({ attempt, stage: "land" });
    const water = waterByNumber(plan);
    const land = failing(def.invariants, "land", { spec: specIn, plan, water });
    if (land.length) {
      fail(attempt, land);
      continue;
    }
    // stage 2: the relief between; stage 3: the start for the first frame
    const ground = premiseLand(plan, water);
    const frame = checkFrame(plan, water, ground.heights, needs);
    if (frame.reason) {
      fail(attempt, [{ id: "frame.start", reason: frame.reason }]);
      continue;
    }
    // stage 4: the ladder, each work's site and its gain by number
    const ladder = ladderOf(plan, water, ground.heights, ground.laid);
    // (a map handed over too watered, or too dry, is drawn again before its settle: `spectrum` by number)
    const miss = spectrumMiss(ladder.day1);
    if (miss) {
      fail(attempt, [{ id: "ladder.spectrum", reason: miss }]);
      continue;
    }
    // stage 5: one build, one canonical settle; stage 8: the checks
    opts.onProgress?.({ attempt, stage: "water" });
    const spec: MapSpec = { ...JSON.parse(JSON.stringify(specIn)), accepted: { attempt, candidate: 0 } };
    settles++;
    const m = premiseMap(spec, plan, ground, frame.start, ladder);
    opts.onProgress?.({ attempt, stage: "check" });
    const { report, later } = deferLater(m.report);
    if (!report.passed) {
      fail(
        attempt,
        report.checks.filter((c) => blocks(report.profile, c)).map((c) => c.id),
      );
      last = report.checks.filter((c) => blocks(report.profile, c)).map((c) => `${c.id}: ${c.message}`)[0] ?? last;
      continue;
    }
    const info: GenerationInfo = {
      genomes: 0,
      genome: null,
      settles,
      hydro: null,
      start: null,
      straight: null,
      storage: null,
      startDrought: null,
      stage: "built",
      premise: { id: def.id, plan, attempt, ladder, life: m.life, start: { moved: frame.moved, level: frame.level, farmland: frame.farmland, shallow: Math.round(frame.shallow * 100) / 100 }, later, ...(m.notes.length ? { notes: m.notes } : {}) },
    };
    // the first look is the map's own land (D348: a land shown is never replaced, so it is shown once it passed)
    if (opts.onLand) {
      const wet = new Uint8Array(plan.W * plan.H);
      for (let i = 0; i < wet.length; i++) wet[i] = water.raster.channel[i] ? 1 : water.raster.lake[i] ? 2 : 0;
      opts.onLand({ attempt, heights: m.built.heights.slice(), water: wet });
    }
    const final = Math.round(performance.now() - t0);
    const result: GenerateResult = {
      spec,
      features: m.features,
      built: m.built,
      report,
      analysis: m.analysis,
      bytes: writeTimber(m.file),
      file: m.file,
      attempts: attempt + 1,
      failures,
      field: m.field,
      intentions: [],
      info,
      name: m.name,
      description: plan.line,
      timings: { firstLook: final, firstWater: final, final, failed: failedAt },
    };
    return { result };
  }
  return { reason: `No ${def.id} map held in ${failures.length} plans and ${settles} settles (${last})` };
}
