// The first ten cycles as a report for the map as it is (`sim/cycles.ts`), read with the map's start, its objects, its
// plants and its start's water rule, from the water the map shows (`MapSession.waterShown`, as the Drought and Badtide
// views start from it); and the report's words. The worker runs it a slice at a time; tools/cycles-report.ts and the
// contract tests ask it directly (D342).

import { isDead } from "../analysis/wood";
import { toMapObject } from "../features/build";
import { counted, itemName } from "./labels";
import { startWaterWithin } from "./droughtLine";
import type { MapSession } from "./session";
import { startCycles, type CyclesInput, type CyclesReport, type CyclesRun } from "../sim/cycles";
import { WITHERING_SPECIES } from "../sim/withering";
import type { Difficulty } from "../spec/mapspec";
import { rulesFor } from "../validate/playability";

export interface CyclesOptions {
  /** The difficulty played (default the map's own, `designedFor`). */
  difficulty?: Difficulty;
  /** Weather drawn from this seed with the game's odds (default: the hardest, in its likeliest order). */
  seed?: number;
  /** Cycles to run (default 10). */
  cycles?: number;
}

/** What the report reads of `s`. */
export function mapCyclesInput(s: MapSession, difficulty: Difficulty = s.meta.designedFor ?? "normal"): CyclesInput {
  const b = s.built;
  const objects = b.entities.map(toMapObject);
  const plants = objects.flatMap((o) => (WITHERING_SPECIES.has(o.template) && !isDead(o.components) && o.x >= 0 && o.y >= 0 && o.x < b.W && o.y < b.H ? [{ tile: o.y * b.W + o.x, template: o.template }] : []));
  const water = s.waterShown();
  return {
    W: b.W,
    H: b.H,
    heights: b.heights,
    objects,
    model: b.waterModel,
    water: { depth: water.depth, contamination: water.contamination, stack: water.stack ?? null },
    start: b.start,
    within: startWaterWithin(s),
    plants,
    need: Math.round(rulesFor(s.effectiveSpec(), difficulty).reservoirNeed),
  };
}

/** The run of the first ten cycles on `s` (the caller advances it, reads its report and disposes of it). */
export function mapCycles(s: MapSession, opts: CyclesOptions = {}): CyclesRun {
  const difficulty = opts.difficulty ?? s.meta.designedFor ?? "normal";
  return startCycles(mapCyclesInput(s, difficulty), difficulty, { seed: opts.seed, cycles: opts.cycles });
}

/** The first ten cycles on `s`, at once (a 192² map takes minutes: the worker runs `mapCycles` a slice at a time). */
export function mapCyclesReport(s: MapSession, opts: CyclesOptions = {}): CyclesReport {
  const run = mapCycles(s, opts);
  try {
    run.advance(Infinity);
    return run.report();
  } finally {
    run.dispose();
  }
}

const DIFFICULTY_WORD: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** "1 day", "5 days". */
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** "a, b and c". */
function listed(parts: readonly string[]): string {
  return parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The report in a player's words, a line each: the weather played, each hazard against the start's water, badwater's
 *  arrival, what dies and the shortest dam that holds a drought. */
export function cyclesWords(r: CyclesReport): string[] {
  const out: string[] = [];
  const how = r.weather.kind === "hardest" ? "each drought and badtide at its longest" : `weather drawn from seed ${r.weather.seed}`;
  out.push(`The first ${r.cycles.length} cycles on ${DIFFICULTY_WORD[r.difficulty]}, ${how}.`);
  if (!r.startWater) out.push("Your start has no water a pump reaches.");
  const droughts = new Map(r.droughts.map((d) => [d.cycle, d]));
  const badtides = new Map(r.badtides.map((b) => [b.cycle, b]));
  // (the game day a badtide's badwater reached the start's water, so the first-arrival line doesn't say it twice)
  const reached = new Set<number>();
  let start = 0;
  for (const p of r.cycles) {
    const at = start + p.temperate;
    start = at + p.days;
    const head = `Cycle ${p.cycle}, ${p.hazard} (${days(p.days)})`;
    const d = droughts.get(p.cycle);
    if (d && r.startWater) {
      if (d.goneOnDay === null) out.push(`${head}: your start keeps its water.`);
      else if (d.goneOnDay === 0) out.push(`${head}: your start's water is gone before it begins.`);
      else out.push(`${head}: your start's water is gone on day ${d.goneOnDay}.`);
    }
    const b = badtides.get(p.cycle);
    if (b && r.startWater) {
      if (b.reachesOnDay === null) out.push(`${head}: badwater stays out of your start's water.`);
      else {
        reached.add(at + b.reachesOnDay);
        out.push(`${head}: badwater reaches your start's water on day ${b.reachesOnDay}${b.reachesOnDay > b.days ? ", after it ends" : ""}.`);
      }
    }
  }
  if (r.startWater) {
    if (r.badwater && !reached.has(r.badwater.gameDay)) {
      const w = r.badwater.weather === "temperate" ? "temperate weather" : r.badwater.weather;
      out.push(`Badwater first reaches your start's water in cycle ${r.badwater.cycle}'s ${w}, on day ${r.badwater.day}.`);
    } else if (!r.badwater && !r.badtides.length) out.push("Badwater never reaches your start's water.");
  }
  // what dies, by cycle and weather
  const groups = new Map<string, { cycle: number; weather: string; dry: string[]; bad: string[] }>();
  for (const x of r.deaths) {
    const key = `${x.cycle} ${x.weather}`;
    const g = groups.get(key) ?? { cycle: x.cycle, weather: x.weather === "temperate" ? "temperate weather" : x.weather, dry: [], bad: [] };
    groups.set(key, g);
    (x.cause === "dry" ? g.dry : g.bad).push(counted(x.count, itemName(x.template)));
  }
  for (const g of groups.values()) {
    const parts = [];
    if (g.dry.length) parts.push(`${listed(g.dry)} dry out`);
    if (g.bad.length) parts.push(`${listed(g.bad)} die in contaminated ground`);
    out.push(`Cycle ${g.cycle}, ${g.weather}: ${parts.join("; ")}.`);
  }
  const all = Object.values(r.plants).reduce((a, p) => a + p.total, 0);
  const dead = Object.values(r.plants).reduce((a, p) => a + p.dead, 0);
  if (all) out.push(dead ? `${dead.toLocaleString("en-GB")} of the map's ${all.toLocaleString("en-GB")} plants die.` : `All ${all.toLocaleString("en-GB")} of the map's plants live.`);
  if (r.dam) out.push(`Shortest dam that holds a drought: ${r.dam.length} tiles long, ${r.dam.height} high, ${r.dam.distance} tiles from your start (x ${r.dam.x}, y ${r.dam.y}).`);
  else out.push("No straight dam near your start holds a drought.");
  out.push("The map as it starts: no colony drinks, builds or plants.");
  return out;
}
