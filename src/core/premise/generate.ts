// The generator's premise mode (docs/PREMISES.md §2.1, §2.2 stages 3, 5 and 8; build step 4): `generate` calls
// `generatePremise` when `spec.premise` names a premise or Any (share link key `p`). The pair is resolved first
// (`choice.ts` `resolvePremise`: Any from the seed; a theme the premise does not honour is refused in one line), and
// the theme gives the land's style (`style.ts`: stage 2's uplands, stage 6's woods; PREMISES §1.5). Each attempt
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
import type { PremiseDef } from "./types";
import { writeTimber } from "../format/timber";
import type { MapSpec } from "../spec/mapspec";
import { FLOOR_MARGIN, rulesFor } from "../validate/playability";
import { blocks, type CheckResult, type ValidationReport } from "../validate/report";
import { drawPlan, failing, PLAN_TRIES, type Failure } from "./draw";
import { checkFrame, type FrameNeeds } from "./frame";
import { ladderOf, spectrumMiss, type Ladder } from "./ladder";
import type { LifeReport } from "./life";
import { premiseBase, premiseFinish, premiseLand } from "./map";
import { premiseCard, type PremiseCard } from "./card";
import { resolvePremise, type StyleTheme } from "./choice";
import { sitePlan } from "./siting";
import { startWaterGateSteps, type GateDay } from "./hold";
import { HazardRun, hazardDays } from "../sim/weather";
import { TICKS_PER_DAY, type WaterModel } from "../sim/water";
import { PREMISES } from "./premises";
import { premiseStyle } from "./style";
import type { PremisePlan } from "./types";
import { waterByNumber } from "./water";
import { premiseWashes } from "./washes";
import { withSmallMapThreads } from "../sim/parallel";

/** Settles one premise map may cost before the themes make it (PREMISES §2.2 stage 5: at most two a plan; the themes
 *  allow five a genome). A plan that fails before the settle costs none. */
export const PREMISE_SETTLES = 3;

/** The `land` invariants read on the skeleton's water before the siting (the stair's falls and weirs, which the side
 *  network never touches): every plan that failed them there failed them in stage 1 too (seeds 6, 12 and 14 at 128²,
 *  six of six), each after half a second to a second of siting. */
const SKELETON_LAND: ReadonlySet<string> = new Set(["water.falls", "water.weirs"]);

/** The checks a premise map answers only at a later build step (PREMISES §7), each with the step that answers it:
 *  until then a warning on it. Empty since step 6: its plants answer `start.food`, `start.wood` and
 *  `start.wood_floor`, and its mine sites `resources.mine_site`. */
export const LATER: Readonly<Record<string, string>> = {};

/** What a premise map records of its making (`GenerationInfo.premise`). */
export interface PremiseInfo {
  /** The premise the map was made from (Any resolved), or the one asked for when the themes made it. */
  id: string;
  /** The theme whose style the land took (Any resolved). */
  theme?: StyleTheme;
  /** The map card's words (`card.ts` `premiseCard`). */
  card?: PremiseCard;
  /** The plan the map was made from (the ladder's readout reads it, §8). */
  plan?: PremisePlan;
  /** The attempt whose plan made the map. */
  attempt?: number;
  /** The ladder (stage 4): each work's site and its gain by number, and day 1's water and moist shares. */
  ladder?: Ladder;
  /** What stage 6 planted, against its budget. */
  life?: LifeReport;
  /** Where stage 3 put the start, and what it measured there. */
  start?: { moved: number; bench: number; moist: number; reach: number; shallow: number };
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

type PremiseOutcome = { result: GenerateResult } | { reason: string };

/** What the premise mode asks of its caller as it goes (`premiseSteps`): `settled`, an attempt's first build is settled,
 *  its water and model those of the start's drought run (`hold.ts` `startWaterGateSteps`), which the caller may start
 *  now, beside the rest of the map; `day`, that run's water at the end of day `day` (1, 2, … in order), which the
 *  caller answers; `done`, the attempt needs no more of it. */
export type PremiseAsk = { kind: "settled"; model: WaterModel; depth: Float64Array; contamination: Float64Array; days: number } | { kind: "day"; day: number } | { kind: "done" };

/** A premise map for a spec whose `premise` names one, or why the themes must make it (one line, D471). The start's
 *  drought run on this thread, after the map (and on its pool, `withSmallMapThreads`). */
export function generatePremise(specIn: MapSpec, opts: GenerateOptions = {}, own?: PremiseDef): PremiseOutcome {
  const steps = premiseSteps(specIn, opts, own);
  let run: LocalRun | null = null;
  try {
    for (let next = steps.next(); ; ) {
      if (next.done) return next.value;
      const a = next.value;
      if (a.kind === "settled") {
        run?.stop();
        run = localRun(a.model, a.depth, a.contamination, a.days);
        next = steps.next();
      } else if (a.kind === "done") {
        run?.stop();
        run = null;
        next = steps.next();
      } else next = steps.next(run!.day(a.day));
    }
  } finally {
    run?.stop();
  }
}

interface LocalRun {
  day(k: number): GateDay;
  stop(): void;
}

/** The start's drought run on this thread (and its pool, `withSmallMapThreads`), made when a day is first asked for:
 *  day `k`'s water, the run stepped on from the last day it reached (a day asked again or earlier is run anew). */
function localRun(model: WaterModel, depth: Float64Array, contamination: Float64Array, days: number): LocalRun {
  let run: HazardRun | null = null;
  let at = 0;
  let last: GateDay | null = null;
  const stop = () => {
    run?.dispose();
    run = null;
    at = 0;
  };
  return {
    day(k) {
      if (run && k === at && last) return last;
      if (run && k < at) stop();
      const r = (run ??= new HazardRun(model, { depth, contamination, stack: null } as never, "drought", days));
      while (at < k) {
        withSmallMapThreads(() => r.step(TICKS_PER_DAY));
        at++;
      }
      return (last = r.water());
    },
    stop,
  };
}

/** Where the page's generator runs the start's drought beside the map (`generatePremiseAsync`): from the first build's
 *  water and model, each day's water as it comes; `stop` ends the run. */
export interface DroughtRunner {
  /** The run started; `day` rejects when the run fails (the generator then runs it on its own thread). */
  start(model: WaterModel, depth: Float64Array, contamination: Float64Array, days: number): { day(k: number): Promise<GateDay>; stop(): void };
}

/** `generatePremise` with the start's drought run by `runner`, started as soon as an attempt's first build is settled
 *  and run beside its life, second build and checks (the page's generator, D453); the gate judges the same days'
 *  water, so the map is the same, byte for byte (D455), and nothing is handed over before the gate has passed. */
export async function generatePremiseAsync(specIn: MapSpec, opts: GenerateOptions, runner: DroughtRunner, own?: PremiseDef): Promise<PremiseOutcome> {
  const steps = premiseSteps(specIn, opts, own);
  let run: ReturnType<DroughtRunner["start"]> | null = null;
  // (where the runner fails, its worker failing to load, throwing or dying: the run on this thread, the same water)
  let local: LocalRun | null = null;
  let ask: Extract<PremiseAsk, { kind: "settled" }> | null = null;
  const fallBack = (): LocalRun => {
    run?.stop();
    run = null;
    return (local ??= localRun(ask!.model, ask!.depth, ask!.contamination, ask!.days));
  };
  const stopAll = () => {
    run?.stop();
    local?.stop();
    run = null;
    local = null;
  };
  try {
    for (let next = steps.next(); ; ) {
      if (next.done) return next.value;
      const a = next.value;
      if (a.kind === "settled") {
        stopAll();
        ask = a;
        try {
          run = runner.start(a.model, a.depth, a.contamination, a.days);
        } catch {
          run = null;
        }
        next = steps.next();
      } else if (a.kind === "done") {
        stopAll();
        next = steps.next();
      } else {
        let w: GateDay | null = null;
        if (run && !local) {
          try {
            w = await run.day(a.day);
          } catch {
            w = null;
          }
        }
        next = steps.next(w ?? fallBack().day(a.day));
      }
    }
  } finally {
    stopAll();
  }
}

/** The premise mode's attempts, asking its caller for the start's drought run (`PremiseAsk`). */
function* premiseSteps(specIn: MapSpec, opts: GenerateOptions = {}, own?: PremiseDef): Generator<PremiseAsk, PremiseOutcome, GateDay | undefined> {
  const t0 = performance.now();
  const pair = resolvePremise(specIn);
  if ("reason" in pair) return pair;
  // (a premise's own definition where the caller gives one: its stages' seams in use before it joins `PREMISES`)
  const def = own ?? PREMISES[pair.premise];
  const why = def.eligible(specIn);
  if (why) return { reason: why };
  // the start held to the shared gate's floors (D515: a premise carries none of its own), its bench built with the
  // generator's margin over its floor (`FLOOR_MARGIN`)
  const rules = rulesFor(specIn);
  const needs: FrameNeeds = { bench: rules.levelLand, moist: rules.farmland + rules.forester, reach: rules.reachMin };
  const bench = Math.ceil(FLOOR_MARGIN * rules.levelLand);
  const skeletonLand = def.invariants.filter((inv) => SKELETON_LAND.has(inv.id));
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
  // (each attempt's start, and its stages' marks, for `timings.stages`)
  let tA = t0;
  const marks: Record<string, number> = {};
  for (let attempt = 0; attempt < PLAN_TRIES && settles < PREMISE_SETTLES; attempt++) {
    tA = performance.now();
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
    // stage 0's second pass: the works sited by the skeleton's day-1 moisture (`siting.ts`)
    // (the theme's style for this attempt: the skeleton's land is read as the map's will be)
    const style = premiseStyle(pair.theme, specIn, attempt);
    // (the start's frame judged on the skeleton's land first: the side network only takes ground from it, so a start
    // short of its bench there is short on the map, and is drawn again before its works are sited. Only the reasons
    // the side network cannot undo are read there, `FrameNeeds.early`: the 5 × 5, its door, the landmark's lip and
    // foot in the frame, and the bench; the frame's water depth and the moist land wait for the full land)
    // (and the stair's falls and weirs, `SKELETON_LAND`, on the skeleton's water: the side network never touches them,
    // so a plan they fail there fails them in stage 1, after the siting's cost)
    const sited = sitePlan(def, specIn, drawn.plan, attempt, style.relief, (sk, w, heights) => {
      const early = failing(skeletonLand, "land", { spec: specIn, plan: sk, water: w });
      if (early.length) return early[0];
      const f = checkFrame(sk, w, heights, { ...needs, early: true });
      return f.reason ? { id: "frame.start", reason: f.reason } : null;
    }, bench);
    if ("reason" in sited) {
      fail(attempt, [{ id: sited.id ?? "site", reason: sited.reason }]);
      continue;
    }
    const plan = sited.plan;
    marks.plan = performance.now();
    // stage 1: its water by number, and the `land` invariants it alone can judge
    opts.onProgress?.({ attempt, stage: "land" });
    const water = def.water?.(plan) ?? waterByNumber(plan);
    const land = failing(def.invariants, "land", { spec: specIn, plan, water });
    if (land.length) {
      fail(attempt, land);
      continue;
    }
    // stage 2: the relief between, in the theme's style; stage 3: the start for the first frame
    const ground = def.land?.(plan, water, style, bench, needs.reach) ?? premiseLand(plan, water, style, bench, needs.reach);
    // (and the `ground` invariants, on stage 2's ground)
    const onGround = failing(def.invariants, "ground", { spec: specIn, plan, water, heights: ground.heights });
    if (onGround.length) {
      fail(attempt, onGround);
      continue;
    }
    const frame = checkFrame(plan, water, ground.heights, needs, ground.ramps);
    if (frame.reason) {
      fail(attempt, [{ id: "frame.start", reason: frame.reason }]);
      continue;
    }
    // (the dry washes and the old bed, `washes.ts`: cut once the start is put, before the ladder reads the land)
    const washes = premiseWashes(plan, ground, frame.start, attempt, bench);
    if (washes.length) ground.washes = washes;
    // stage 4: the ladder, each work's site and its gain by number
    const ladder = ladderOf(plan, water, ground.heights, ground.laid);
    // (a map handed over too watered, or too dry, is drawn again before its settle: `spectrum` by number, its moist
    // floor by the map's side, `moistFloor`)
    const miss = spectrumMiss(ladder.day1, plan.W);
    if (miss) {
      fail(attempt, [{ id: "ladder.spectrum", reason: miss }]);
      continue;
    }
    // stage 5: one build, one canonical settle; stage 8: the checks
    opts.onProgress?.({ attempt, stage: "water" });
    const spec: MapSpec = { ...JSON.parse(JSON.stringify(specIn)), accepted: { attempt, candidate: 0 } };
    settles++;
    marks.land = performance.now();
    // (on threads from 128² where this thread has them, the page's generator worker: the settle is most of the wait)
    const settled = withSmallMapThreads(() => premiseBase(spec, plan, ground, frame.start, ladder, style));
    // (the start's drought may start now: its water and model are the first build's, which life leaves as they are)
    yield { kind: "settled", model: settled.base.waterModel, depth: settled.base.water, contamination: settled.base.contamination, days: hazardDays(spec.designedFor, "drought") };
    const m = withSmallMapThreads(() => premiseFinish(settled));
    opts.onProgress?.({ attempt, stage: "check" });
    const { report, later } = deferLater(m.report);
    if (!report.passed) {
      yield { kind: "done" };
      fail(
        attempt,
        report.checks.filter((c) => blocks(report.profile, c)).map((c) => c.id),
      );
      last = report.checks.filter((c) => blocks(report.profile, c)).map((c) => `${c.id}: ${c.message}`)[0] ?? last;
      continue;
    }
    // the start's water through the difficulty's longest drought (D133's rule, PREMISES §2.2 stage 8): read by number,
    // the drought run (on the settle's threads) only where that read cannot vouch for it; a start whose water goes in
    // the run is the next plan
    marks.map = performance.now();
    const gate = startWaterGateSteps(spec, plan, m.built, water);
    let g = gate.next();
    while (!g.done) g = gate.next((yield { kind: "day", day: g.value })!);
    const held = g.value;
    yield { kind: "done" };
    marks.gate = performance.now();
    if (held.gone) {
      fail(attempt, [{ id: "drought.start", reason: `the start's water is gone on day ${held.gone} of a ${held.days}-day drought` }]);
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
      ...(ground.washes ? { washes: ground.washes } : {}),
      premise: { id: def.id, theme: pair.theme, card: premiseCard({ id: def.id, theme: pair.theme, plan, ladder }) ?? undefined, plan, attempt, ladder, life: m.life, start: { moved: frame.moved, bench: frame.bench, moist: frame.moist, reach: frame.reach, shallow: Math.round(frame.shallow * 100) / 100 }, later, ...(m.notes.length || plan.notes?.length ? { notes: [...(plan.notes ?? []), ...m.notes] } : {}) },
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
      timings: {
        firstLook: final,
        firstWater: final,
        final,
        failed: failedAt,
        stages: { before: Math.round(tA - t0), plan: Math.round(marks.plan - tA), land: Math.round(marks.land - marks.plan), build: m.ms.build, life: m.ms.life, checks: m.ms.checks, gate: Math.round(marks.gate - marks.map) },
      },
    };
    return { result };
  }
  return { reason: `No ${def.id} map held in ${failures.length} plans and ${settles} settles (${last})` };
}
