// A long play's records, cycle by cycle (`--cycles N`, D488 (2): Showcase mode's winner played to cycle 10 on both
// factions). What decides whether a map plays well through the cycles, measured at each hazard's start, first day and
// end (the moments jobs.ts records the whole map at): the start's water a pump reaches, the map's water and soil
// against the cycle model, the farmland and the food and wood by the start, and the real time each cycle took. The
// probe plays no colony (no pump, farm or home is built, so the beavers die of thirst around day 8 on every map: the
// game-over box the probe closes), so the colony's own survival is not measured: what the map gives it is.
import { startWalk, startWaterOf, type Verdict } from './catalog';
import type { Ctx, Loaded } from './compare';
import type { MapSnapshot } from './job';
import type { MapInfo } from './mapfile';
import type { ModelRun } from './model';
import { reachAt } from '../../../src/core/analysis/walk';
import { DIFFICULTY_RULES } from '../../../src/core/spec/mapspec';
import { FARMLAND_NEAR } from '../../../src/core/validate/playability';

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const pct = (v: number) => (Number.isFinite(v) ? `${(100 * v).toFixed(0)}%` : '-');

/** The wet line and the band the wet-tile counts leave out (D297, D302; compare.ts `timeline` judges the same way). */
const WET = 0.05;
const WET_BAND = 0.01;
/** The start's land: within this many tiles' walk (the start's own rules: wood, bushes and farmland within 20). */
const NEAR = 20;
/** The model checks' tolerances, stated before the first long play: the whole map's water, wet tiles and moist tiles
 *  within 5% of the model at every checkpoint (as cal-timeline and ceiling-hazards judge), and the start's water
 *  within 10% of its volume at the start (as drought-start-water judges). */
const MAP_TOLERANCE = 0.05;
const START_TOLERANCE = 0.1;

type Water = { depth: ArrayLike<number>; contamination: ArrayLike<number>; moisture: ArrayLike<number>; soilContamination: ArrayLike<number> };

/** One checkpoint of a cycle: a hazard's start, first day or end. */
export interface CyclePoint {
  id: string;
  day: number;
  /** Real seconds from starting the map to this record (the mod's snapshot, from DGM Probe 0.3.2). */
  realSeconds: number | null;
  game: PointMeasures | null;
  model: PointMeasures | null;
}

export interface PointMeasures {
  /** The whole map: water, wet tiles judged (tiles on the wet line in either left out, D297, D302), moist tiles. */
  volume: number;
  wetJudged: number;
  moist: number;
  /** The start's water: the bodies `start.water` counts in the file, their water now, as a share of the file's. */
  startShare: number;
  /** Tiles of clean water a pump reaches within the start's walk now (`start.water` on this moment's water). */
  pumpTiles: number;
  /** The nearest such tile's walk (Infinity without one). */
  pumpWalk: number;
  /** Moist farmland (dry, clean, moist) within 20 tiles' walk. */
  farmland: number;
}

export interface CycleRow {
  cycle: number;
  /** The weather as planned, and as the game ran it (its own record of each cycle). */
  planned: { temperateDays: number; hazard: string; hazardDays: number };
  played: { temperateDays: number; hazard: string; hazardDays: number } | null;
  points: CyclePoint[];
  /** Living berry bushes and trees within 20 tiles' walk at the cycle's end (the game's plants). */
  bushesNear: number | null;
  treesNear: number | null;
  /** Real minutes from the previous cycle's end (the map's start for cycle 1) to this cycle's end. */
  realMinutes: number | null;
  /** The largest game–model gap at this cycle's checkpoints: whole-map water, wet tiles, moist tiles (shares of the
   *  larger of the two), and the start's water (share of its volume at the start). Null without the model. */
  gap: { volume: number; wet: number; moist: number; start: number } | null;
}

export interface CycleTable {
  rows: CycleRow[];
  /** The start's water at the start: bodies, tiles, volume, and the rules beside the counts. */
  startVolume: number;
  startTiles: number;
  within: number;
  rules: { farmland: number; bushes: number };
  /** The model's CPU seconds (shared by both factions: the same file and weather). */
  modelSeconds: number | null;
  modelError: string | null;
}

/** The moments jobs.ts records for hazard `i` of `hazard` (`weatherMoments`): its start, first day and end. */
function hazardMoments(L: Loaded, cycle: number, hazard: string) {
  const ids = ['start', 'day1', 'end'].map((k) => `${hazard}${cycle}-${k}`);
  return ids.map((id) => L.prepared.map.moments.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
}

function measures(info: MapInfo, w: Water, mode: 'Easy' | 'Normal' | 'Hard', startTiles: number[], v0: number, walk: Float64Array | null): PointMeasures {
  let volume = 0, wetJudged = 0, moist = 0, farmland = 0;
  const N = info.W * info.H;
  for (let t = 0; t < N; t++) {
    const d = w.depth[t] || 0;
    volume += d;
    if (Math.abs(d - WET) > WET_BAND && d > WET) wetJudged++;
    if (w.moisture[t] > 0) moist++;
    if (walk && w.moisture[t] > 0 && !(d > WET) && (w.soilContamination[t] || 0) < 0.05 && reachAt(walk, info.W, info.H, t) <= NEAR) farmland++;
  }
  let sv = 0;
  for (const t of startTiles) sv += w.depth[t] || 0;
  // start.water on this moment's water, over the file's terrain and objects (the walk is shared with the file's)
  const now = startWaterOf({ ...info, depth: Float32Array.from(w.depth), contamination: Float32Array.from(w.contamination) }, mode);
  return { volume, wetJudged, moist, startShare: v0 > 0 ? sv / v0 : NaN, pumpTiles: now.pump.length, pumpWalk: now.pump[0]?.walk ?? Infinity, farmland };
}

/** Judged counts leave out tiles on the wet line in either the game or the model, so the pair is counted together. */
function judgedPair(g: MapSnapshot, m: Water): { g: number; m: number } {
  let jg = 0, jm = 0;
  for (let t = 0; t < g.depth.length; t++) {
    if (Math.abs(g.depth[t] - WET) <= WET_BAND || Math.abs(m.depth[t] - WET) <= WET_BAND) continue;
    if (g.depth[t] > WET) jg++;
    if (m.depth[t] > WET) jm++;
  }
  return { g: jg, m: jm };
}

/** A long play's table: one row per cycle, from the run's records and the model on the same weather. */
export function cycleTable(L: Loaded, model: ModelRun | null, modelError: string | null): CycleTable {
  const info = L.info;
  const mode = L.prepared.game.mode;
  const sw = startWaterOf(info, mode);
  const startTiles = sw.bodies.flat();
  let v0 = 0;
  for (const t of startTiles) v0 += info.depth[t] || 0;
  const walk = startWalk(info)?.walk ?? null;
  const rules = { farmland: FARMLAND_NEAR, bushes: DIFFICULTY_RULES[mode.toLowerCase() as 'easy' | 'normal' | 'hard'].bushesWithin20 };
  const played = L.result?.weather ?? [];
  const rows: CycleRow[] = [];
  let lastReal: number | null = 0;
  L.prepared.game.cycles.forEach((c, i) => {
    const cycle = i + 1;
    const points: CyclePoint[] = hazardMoments(L, cycle, c.hazard).map((m) => {
      const s = L.snapshot(m.id);
      const mm = model?.maps.find((x) => Math.abs(x.day - m.day) < 0.06) ?? null;
      const game = s ? measures(info, s, mode, startTiles, v0, walk) : null;
      const mod = mm ? measures(info, mm, mode, startTiles, v0, walk) : null;
      // the judged wet tiles of a pair leave out the tiles on the line in either
      if (s && mm && game && mod) {
        const j = judgedPair(s, mm);
        game.wetJudged = j.g;
        mod.wetJudged = j.m;
      }
      return { id: m.id, day: m.day, realSeconds: s?.realSeconds ?? null, game, model: mod };
    });
    const end = points.find((p) => p.id.endsWith('-end'));
    const endSnap = end ? L.snapshot(end.id) : null;
    let bushes: number | null = null, trees: number | null = null;
    if (endSnap && walk) {
      bushes = 0;
      trees = 0;
      for (const p of endSnap.plants ?? []) {
        if (p.plant?.dead || p.x < 0 || p.y < 0 || p.x >= info.W || p.y >= info.H) continue;
        if (reachAt(walk, info.W, info.H, p.y * info.W + p.x) > NEAR) continue;
        if (/Bush/.test(p.template)) bushes++;
        else trees++;
      }
    }
    const endReal = end?.realSeconds ?? null;
    const realMinutes = endReal != null && lastReal != null ? (endReal - lastReal) / 60 : null;
    lastReal = endReal;
    const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, a, b);
    const both = points.filter((p) => p.game && p.model);
    const gap = both.length
      ? {
          volume: Math.max(...both.map((p) => rel(p.game!.volume, p.model!.volume))),
          wet: Math.max(...both.map((p) => rel(p.game!.wetJudged, p.model!.wetJudged))),
          moist: Math.max(...both.map((p) => rel(p.game!.moist, p.model!.moist))),
          start: v0 > 0 ? Math.max(...both.map((p) => Math.abs(p.game!.startShare - p.model!.startShare))) : 0,
        }
      : null;
    const pl = played.find((w) => w.cycle === cycle);
    rows.push({ cycle, planned: { ...c }, played: pl ? { temperateDays: pl.temperateDays, hazard: pl.hazard, hazardDays: pl.hazardDays } : null, points, bushesNear: bushes, treesNear: trees, realMinutes, gap });
  });
  return { rows, startVolume: v0, startTiles: startTiles.length, within: sw.within, rules, modelSeconds: model?.cpuSeconds ?? null, modelError };
}

// ------------------------------------------------------------------------------ the checks

class NotMeasurable extends Error {}
const tableOf = (c: Ctx): CycleTable => {
  if (!c.cycles) throw new NotMeasurable('no cycle records for this game (not a long play)');
  return c.cycles;
};
const lowest = (r: CycleRow, side: 'game' | 'model') => {
  const ps = r.points.filter((p) => p[side]);
  return ps.length ? ps.reduce((a, b) => (b[side]!.pumpTiles < a[side]!.pumpTiles ? b : a)) : null;
};
const weatherOf = (r: CycleRow) => `${r.planned.temperateDays} + ${r.planned.hazardDays} ${r.planned.hazard}`;

function eval_(fn: (c: Ctx) => { verdict: Verdict; detail: string }) {
  return (c: Ctx) => {
    try {
      return fn(c);
    } catch (e) {
      if (e instanceof NotMeasurable) return { verdict: 'not measurable' as Verdict, detail: e.message };
      throw e;
    }
  };
}

export const CYCLE_EVALS: Record<string, (c: Ctx) => { verdict: Verdict; detail: string }> = {
  'cycles-water': eval_((c) => {
    const t = tableOf(c);
    if (t.modelError) throw new NotMeasurable(`the model did not run: ${t.modelError}`);
    const rows = t.rows.filter((r) => r.gap);
    if (!rows.length) throw new NotMeasurable('no checkpoint has both a game record and the model');
    const bad = rows.filter((r) => r.gap!.volume > MAP_TOLERANCE || r.gap!.wet > MAP_TOLERANCE || r.gap!.moist > MAP_TOLERANCE);
    const worst = (k: 'volume' | 'wet' | 'moist') => Math.max(...rows.map((r) => r.gap![k]));
    const missing = t.rows.length - rows.length;
    return {
      verdict: bad.length || missing ? 'failed' : 'passed',
      detail: `${rows.length} of ${t.rows.length} cycles judged at their hazard's start, first day and end; largest game–model gap: water ${pct(worst('volume'))}, wet tiles ${pct(worst('wet'))}, moist tiles ${pct(worst('moist'))} (tolerance ${pct(MAP_TOLERANCE)})${bad.length ? `; over it in cycles ${bad.map((r) => r.cycle).join(', ')}` : ''}${missing ? `; ${missing} cycles without records` : ''}${t.modelSeconds != null ? `; the model took ${t.modelSeconds.toFixed(0)} CPU s` : ''}`,
    };
  }),
  'cycles-start-water': eval_((c) => {
    const t = tableOf(c);
    if (!c.L.info.start) throw new NotMeasurable('no start on this map');
    if (!t.startTiles) throw new NotMeasurable(`no clean water a pump reaches within ${t.within} tiles' walk of the start at the load (start.water)`);
    const dry = t.rows.filter((r) => (lowest(r, 'game')?.game?.pumpTiles ?? 1) === 0);
    const judged = t.rows.filter((r) => r.gap);
    const off = judged.filter((r) => r.gap!.start > START_TOLERANCE);
    const parts = t.rows.map((r) => {
      const lo = lowest(r, 'game');
      const end = r.points.find((p) => p.id.endsWith('-end'));
      return `cycle ${r.cycle} (${weatherOf(r)}): ${lo?.game ? `${lo.game.pumpTiles} pump tiles at the fewest` : 'no record'}${end?.game ? `, ${pct(end.game.startShare)} left at its end` : ''}${end?.model ? ` (model ${pct(end.model.startShare)})` : ''}`;
    });
    const verdict: Verdict = judged.length ? (off.length ? 'failed' : 'passed') : 'recorded';
    return {
      verdict,
      detail: `the start's water at the load: ${t.startTiles} tiles, ${t.startVolume.toFixed(0)} water, within ${t.within} tiles' walk. Clean water a pump reaches ${dry.length ? `ran out in cycles ${dry.map((r) => r.cycle).join(', ')}` : 'through every hazard'}. ${parts.join('; ')}${judged.length ? `; largest game–model gap ${pct(Math.max(...judged.map((r) => r.gap!.start)))} of the start's volume (tolerance ${pct(START_TOLERANCE)})` : ''}`,
    };
  }),
  'cycles-land': eval_((c) => {
    const t = tableOf(c);
    if (!c.L.info.start) throw new NotMeasurable('no start on this map');
    const low = t.rows.filter((r) => r.points.some((p) => p.game && p.game.farmland < t.rules.farmland));
    const few = t.rows.filter((r) => r.bushesNear != null && r.bushesNear < t.rules.bushes);
    const parts = t.rows.map((r) => {
      const s = r.points.find((p) => p.id.endsWith('-start'))?.game, e = r.points.find((p) => p.id.endsWith('-end'))?.game;
      return `cycle ${r.cycle}: farmland ${s?.farmland ?? '-'} → ${e?.farmland ?? '-'}, ${r.bushesNear ?? '-'} bushes, ${r.treesNear ?? '-'} trees`;
    });
    return {
      verdict: 'recorded',
      detail: `within ${NEAR} tiles' walk of the start (the start's rules: ${t.rules.farmland} moist farmland, ${t.rules.bushes} berry bushes): farmland under the rule in ${low.length ? `cycles ${low.map((r) => r.cycle).join(', ')}` : 'no cycle'}, bushes under it in ${few.length ? `cycles ${few.map((r) => r.cycle).join(', ')}` : 'no cycle'}. ${parts.join('; ')}`,
    };
  }),
  'cycles-shots'(c) {
    const shots = c.L.result!.shots ?? [];
    return { verdict: 'recorded', detail: `${shots.length} screenshots (at the load, each hazard's end and the end), in the run's shots folder and contact sheet. Judged by eye: the water where the records say, nothing broken` };
  },
};

// ------------------------------------------------------------------------------ the summary

const cell = (g: number | undefined, m: number | undefined, f: (v: number) => string) => (g == null ? '-' : `${f(g)}${m != null ? ` / ${f(m)}` : ''}`);

/** The summary's table for one long play (summary.md): one row per cycle. */
export function cycleMarkdown(title: string, t: CycleTable): string[] {
  const out: string[] = [];
  out.push(`### ${title}`, '');
  out.push(
    `The start's water at the load: ${t.startTiles} tiles, ${t.startVolume.toFixed(0)} water within ${t.within} tiles' walk. Game / model where both ran${t.modelError ? ` (the model did not run: ${t.modelError})` : t.modelSeconds != null ? ` (the model: ${t.modelSeconds.toFixed(0)} CPU s)` : ''}. The start's rules: ${t.rules.farmland} moist farmland, ${t.rules.bushes} berry bushes within 20 tiles' walk.`,
    '',
  );
  out.push(
    "| Cycle | Weather (days) | Pump tiles at the fewest | Start's water left at the hazard's end | Farmland, hazard start → end | Bushes / trees at the end | Model gap: water / wet / moist / start | Real min |",
    '|---|---|---|---|---|---|---|---|',
  );
  for (const r of t.rows) {
    const lo = lowest(r, 'game'), lm = lowest(r, 'model');
    const s = r.points.find((p) => p.id.endsWith('-start')), e = r.points.find((p) => p.id.endsWith('-end'));
    const asPlayed = r.played && (r.played.temperateDays !== r.planned.temperateDays || r.played.hazardDays !== r.planned.hazardDays || (r.played.hazard !== r.planned.hazard && r.played.hazardDays > 0)) ? ` (played ${r.played.temperateDays} + ${r.played.hazardDays} ${r.played.hazard})` : '';
    out.push(
      `| ${r.cycle} | ${weatherOf(r)}${asPlayed} | ${cell(lo?.game?.pumpTiles, lm?.model?.pumpTiles, String)} | ${cell(e?.game?.startShare, e?.model?.startShare, pct)} | ${s?.game?.farmland ?? '-'} → ${e?.game?.farmland ?? '-'} | ${r.bushesNear ?? '-'} / ${r.treesNear ?? '-'} | ${r.gap ? `${pct(r.gap.volume)} / ${pct(r.gap.wet)} / ${pct(r.gap.moist)} / ${pct(r.gap.start)}` : '-'} | ${r.realMinutes != null ? f2(r.realMinutes) : '-'} |`,
    );
  }
  out.push('');
  return out;
}
