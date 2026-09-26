// Claude's steps for the other forces (D202, D203, D206, D219): craterize, erupt and quake, as the
// editor's buttons make them. Each runs the force whole on the map as it stands (the shared forces
// core, src/core/forces) and becomes one `forceResult` operation, exactly the one the editor's worker
// keeps for the same force; a step that would strike, erupt or split the land through the start is
// refused with the editor's own word ("Start here"). M12 keeps them ready (D134).

import type { EditOp } from "../../../src/core/doc/ops";
import type { MapSession } from "../../../src/core/doc/session";
import { forceMapOf } from "../../../src/core/forces/carve/result";
import { CRATER_DEFAULTS, naturalSize, type CraterSettings } from "../../../src/core/forces/craterize";
import { ERUPT_DEFAULTS, type EruptSettings } from "../../../src/core/forces/erupt";
import { plainEntities, type FullForceMap } from "../../../src/core/forces/force";
import { START_REASON, startGround, startProblem } from "../../../src/core/forces/objects";
import { QUAKE_DEFAULTS, slideTiles, type QuakeSettings } from "../../../src/core/forces/quake";
import { geology } from "../../../src/core/forces/random";
import { forceParamsOf, pathRecord } from "../../../src/core/forces/result";
import { CraterRun, EruptRun, QuakeRun } from "../../../src/core/forces/runs";

/** The forces' Power words, as the editor's rows say them. */
export const IMPACT_WORDS = { pebble: 15, meteor: 40, asteroid: 65, cataclysm: 95 } as const;
export const ERUPT_WORDS = { cinder: 15, cone: 40, volcano: 65, cataclysm: 95 } as const;
export const QUAKE_WORDS = { tremor: 15, rift: 40, upheaval: 65, cataclysm: 95 } as const;

export type ForceStep =
  | { op: "craterize"; at?: [number, number]; where?: unknown; toward?: [number, number]; power?: number | keyof typeof IMPACT_WORDS; size?: number; walls?: "steep" | "terraced"; centre?: CraterSettings["centre"]; debris?: "light" | "heavy"; rays?: boolean; path?: number; handle?: string }
  | { op: "erupt"; at?: [number, number]; where?: unknown; line?: [number, number][]; power?: number | keyof typeof ERUPT_WORDS; shape?: "steep" | "broad"; summit?: EruptSettings["summit"]; flows?: "light" | "heavy"; ridges?: boolean; path?: number; handle?: string }
  | { op: "quake"; line: [number, number][]; mode?: "lift" | "slide"; side?: "left" | "right"; power?: number | keyof typeof QUAKE_WORDS; scarp?: "sheer" | "stepped"; path?: number; handle?: string };

const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const tileOn = (p: unknown, W: number, H: number) => Array.isArray(p) && p.length === 2 && num(p[0], 0, W - 1) && num(p[1], 0, H - 1);
const powerOk = (v: unknown, words: object) => v === undefined || num(v, 0, 100) || (typeof v === "string" && v in words);
const powerOf = (v: number | string | undefined, words: Record<string, number>, fallback: number) => (typeof v === "string" ? words[v] : (v ?? fallback));
const wordOf = (power: number, words: Record<string, number>) => Object.entries(words).reduce((a, e) => (Math.abs(e[1] - power) < Math.abs(a[1] - power) ? e : a))[0];

/** Why a force step's arguments are wrong (the place, when given, is checked by the caller). */
export function checkForceStep(s: Record<string, unknown>, W: number, H: number): string[] {
  const errs: string[] = [];
  const line = (v: unknown, name: string) => {
    if (!Array.isArray(v) || v.length < 2 || v.length > 24) return [`${name} needs 2–24 points`];
    for (const q of v) if (!tileOn(q, W, H)) return [`${name}: ${JSON.stringify(q)} is not a tile on the ${W}×${H} map`];
    return [];
  };
  if (s.path !== undefined && !(Number.isInteger(s.path) && num(s.path, 0, 99))) errs.push("path is 0–99: 0 the first personality, 1, 2, … the editor's Try another");
  switch (s.op) {
    case "craterize":
      if (s.at === undefined && s.where === undefined) return ["craterize needs at [x, y] or a where (it strikes the middle of it)"];
      if (s.at !== undefined && !tileOn(s.at, W, H)) errs.push("at is a tile [x, y] on the map");
      if (s.toward !== undefined && !tileOn(s.toward, W, H)) errs.push("toward is a tile [x, y] on the map: the impactor travels that way (a glancing blow, an oval crater)");
      if (!powerOk(s.power, IMPACT_WORDS)) errs.push(`power is 0–100, or ${Object.keys(IMPACT_WORDS).join(", ")}`);
      if (s.size !== undefined && !num(s.size, 4, 180)) errs.push("size is the crater's width, 4–180 tiles (left out, it follows power)");
      if (s.walls !== undefined && s.walls !== "steep" && s.walls !== "terraced") errs.push("walls is steep or terraced");
      if (s.centre !== undefined && !["auto", "bowl", "peak", "ring", "flat"].includes(String(s.centre))) errs.push("centre is auto, bowl, peak, ring or flat");
      if (s.debris !== undefined && s.debris !== "light" && s.debris !== "heavy") errs.push("debris is light or heavy");
      if (s.rays !== undefined && typeof s.rays !== "boolean") errs.push("rays is true or false");
      return errs;
    case "erupt":
      if (s.at === undefined && s.where === undefined && s.line === undefined) return ["erupt needs at [x, y], a where (its middle) or a line (a fissure)"];
      if (s.at !== undefined && !tileOn(s.at, W, H)) errs.push("at is a tile [x, y] on the map");
      if (s.line !== undefined) errs.push(...line(s.line, "line"));
      if (!powerOk(s.power, ERUPT_WORDS)) errs.push(`power is 0–100, or ${Object.keys(ERUPT_WORDS).join(", ")}`);
      if (s.shape !== undefined && s.shape !== "steep" && s.shape !== "broad") errs.push("shape is steep or broad");
      if (s.summit !== undefined && !["auto", "peak", "crater", "caldera"].includes(String(s.summit))) errs.push("summit is auto, peak, crater or caldera");
      if (s.flows !== undefined && s.flows !== "light" && s.flows !== "heavy") errs.push("flows is light or heavy");
      if (s.ridges !== undefined && typeof s.ridges !== "boolean") errs.push("ridges is true or false");
      return errs;
    case "quake":
      errs.push(...line(s.line, "line"));
      if (s.mode !== undefined && s.mode !== "lift" && s.mode !== "slide") errs.push("mode is lift or slide");
      if (s.side !== undefined && s.side !== "left" && s.side !== "right") errs.push("side is left or right of the line, as it is drawn (north up): the side that moves");
      if (!powerOk(s.power, QUAKE_WORDS)) errs.push(`power is 0–100, or ${Object.keys(QUAKE_WORDS).join(", ")}`);
      if (s.scarp !== undefined && s.scarp !== "sheer" && s.scarp !== "stepped") errs.push("scarp is sheer or stepped");
      return errs;
  }
  return errs;
}

export interface ForceExpansion {
  ok: boolean;
  ops: EditOp[];
  report: string[];
  resolved: Record<string, unknown>;
  errors: string[];
  tiles: number;
}

/** The map a force starts from on the session: its ground, plain copies of its objects, its water,
 *  the rock of the map as it was opened, the fresh rock and fallen trees none (Claude's forces work
 *  on the map as its build stands). */
function mapOf(s: MapSession): { map: FullForceMap; keep: Uint8Array } {
  const b = s.built;
  const m = forceMapOf(b);
  const entities = plainEntities(m.entities.map((e) => (e.raw ? (({ raw: _raw, ...rest }) => rest)(e) : e)));
  const map: FullForceMap = { ...m, entities, rockLayers: geology(s.openedHeights), lava: new Uint32Array(m.W * m.H), fallen: [] };
  const keep = new Uint8Array(m.W * m.H);
  for (const i of s.columns.keys()) keep[i] = 1;
  return { map, keep };
}

const refused = (errors: string[], resolved: Record<string, unknown> = {}): ForceExpansion => ({ ok: false, ops: [], report: [], resolved, errors, tiles: 0 });

/** Run a force step on the session's map: `at` is its point (the caller resolved a where to it). */
export function expandForceStep(s: MapSession, step: ForceStep, at: [number, number] | null): ForceExpansion {
  const { x: W, y: H } = s.size;
  const { map, keep } = mapOf(s);
  const tile = (p: [number, number]) => Math.round(p[1]) * W + Math.round(p[0]);
  const cap = Math.floor(0.3 * W * H);
  const resolved: Record<string, unknown> = {};
  if (at && startGround(map)[tile(at)]) return refused([`${START_REASON}: the start's ground stays as it is, so the force starts away from it`], { at });
  let run: CraterRun | EruptRun | QuakeRun;
  let settings: CraterSettings | EruptSettings | QuakeSettings;
  const seed = (d: number) => (step.path !== undefined ? (d + step.path) >>> 0 : d);
  try {
    if (step.op === "craterize") {
      const aimed = step.toward && at && (Math.round(step.toward[0]) !== at[0] || Math.round(step.toward[1]) !== at[1]);
      settings = { mode: aimed ? "aim" : "strike", power: powerOf(step.power, IMPACT_WORDS, CRATER_DEFAULTS.power), size: step.size ?? null, walls: step.walls ?? CRATER_DEFAULTS.walls, centre: step.centre ?? CRATER_DEFAULTS.centre, debris: step.debris ?? CRATER_DEFAULTS.debris, rays: step.rays ?? CRATER_DEFAULTS.rays, seed: seed(CRATER_DEFAULTS.seed) };
      run = new CraterRun(map, settings, { origin: tile(at!), ...(aimed ? { end: tile(step.toward!) } : {}) }, keep);
    } else if (step.op === "erupt") {
      const fissure = !!step.line;
      const path = fissure ? step.line!.map(([x, y]) => ({ x, y })) : undefined;
      const origin = fissure ? tile(step.line![0]) : tile(at!);
      settings = { mode: fissure ? "fissure" : "vent", power: powerOf(step.power, ERUPT_WORDS, ERUPT_DEFAULTS.power), shape: step.shape ?? ERUPT_DEFAULTS.shape, summit: step.summit ?? ERUPT_DEFAULTS.summit, flows: step.flows ?? ERUPT_DEFAULTS.flows, ridges: step.ridges ?? ERUPT_DEFAULTS.ridges, seed: seed(ERUPT_DEFAULTS.seed) };
      run = new EruptRun(map, settings, { origin, ...(path ? { path } : {}) }, keep);
    } else {
      settings = { mode: step.mode ?? "lift", power: powerOf(step.power, QUAKE_WORDS, QUAKE_DEFAULTS.power), scarp: step.scarp ?? QUAKE_DEFAULTS.scarp, seed: seed(QUAKE_DEFAULTS.seed) };
      run = new QuakeRun(map, settings, { path: step.line.map(([x, y]) => ({ x, y })), side: step.side === "right" ? -1 : 1 }, keep);
    }
    run.finishAll();
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    return refused([text === START_REASON ? `${START_REASON}: the start's ground stays as it is (a fault or a fissure keeps a few tiles from it)` : text], resolved);
  }
  const after = run.final()!;
  if (run instanceof QuakeRun) {
    const start = map.entities.find((e) => e.template === "StartingLocation");
    const moved = start && after.entities.find((e) => e.id === start.id);
    if (start && moved && (moved.x !== start.x || moved.y !== start.y)) return refused([`${START_REASON}: the start is on the side that slides; side ${step.op === "quake" && step.side === "right" ? "left" : "right"} moves the other one`], resolved);
    const problem = !startProblem(map) && startProblem({ ...after, water: run.map.water });
    if (problem) return refused([`${problem}: the quake would leave the start so`], resolved);
  }
  const where =
    step.op === "quake" ? { path: pathRecord(step.line.map(([x, y]) => ({ x, y }))), side: step.side === "right" ? (-1 as const) : (1 as const) } : step.op === "erupt" && step.line ? { origin: step.line[0], path: pathRecord(step.line.map(([x, y]) => ({ x, y }))) } : { origin: at!, ...(step.op === "craterize" && settings.mode === "aim" ? { end: step.toward! } : {}) };
  const params = forceParamsOf(map, after, { verb: step.op, settings, where, cut: null, steps: run.steps, reason: "done" });
  if (!params) return refused(["the land held: nothing changed (more power, or somewhere else)"], resolved);
  if (params.tiles.length > cap) return refused([`that ${step.op === "craterize" ? "impact" : step.op === "erupt" ? "eruption" : "quake"} changes ${params.tiles.length} tiles; one proposal may change at most ${cap} (30% of the map): less power, or a smaller size`], resolved);
  let up = 0;
  let down = 0;
  let low = Infinity;
  let high = -Infinity;
  params.tiles.forEach((i, k) => {
    const d = params.heights[k] - map.heights[i];
    up = Math.max(up, d);
    down = Math.max(down, -d);
    low = Math.min(low, params.heights[k]);
    high = Math.max(high, params.heights[k]);
  });
  const felled = params.felled?.length ?? 0;
  const gone = params.removed.length;
  const power = settings.power;
  const report: string[] = [];
  if (step.op === "craterize") {
    const cs = settings as CraterSettings;
    const d = cs.size ?? naturalSize(cs.power);
    report.push(`strikes a crater ${d} tiles across (${wordOf(power, IMPACT_WORDS)}, power ${power}) at (${at![0]}, ${at![1]})${cs.mode === "aim" ? `, a glancing blow toward (${step.op === "craterize" ? step.toward![0] : 0}, ${step.op === "craterize" ? step.toward![1] : 0})` : ""}: its floor down to level ${low}, its rim and debris up to level ${high}, over ${params.tiles.length} tiles`);
    Object.assign(resolved, { at, mode: cs.mode, diameter: d, floor: low, rim: high });
  } else if (step.op === "erupt") {
    report.push(`${settings.mode === "fissure" ? "opens a fissure" : "raises a volcano"} (${wordOf(power, ERUPT_WORDS)}, power ${power}) ${settings.mode === "fissure" ? `along ${step.line!.length} points` : `at (${at![0]}, ${at![1]})`}: up to level ${high}, ${up} levels at most, over ${params.tiles.length} tiles; its fresh lava is hard rock, which Carve cuts slowly`);
    Object.assign(resolved, { at: at ?? step.line![0], mode: settings.mode, summit: high, rise: up });
  } else {
    const qs = settings as QuakeSettings;
    const side = step.side === "right" ? "right" : "left";
    report.push(
      qs.mode === "slide"
        ? `slides the land on the ${side} of the fault ${slideTiles(power)} tiles along it (${wordOf(power, QUAKE_WORDS)}, power ${power}): ${params.moved?.length ?? 0} objects carried with it, ${params.tiles.length} tiles changed`
        : `lifts the land on the ${side} of the fault by up to ${up} levels and drops the other side by up to ${down} (${wordOf(power, QUAKE_WORDS)}, power ${power}), over ${params.tiles.length} tiles`,
    );
    Object.assign(resolved, { mode: qs.mode, side, lift: up, drop: down });
  }
  if (felled) report.push(`${felled} tree${felled > 1 ? "s" : ""} knocked down (dead, lying away from it)`);
  if (gone) report.push(`${gone} object${gone > 1 ? "s" : ""} on the changed ground go with it`);
  Object.assign(resolved, { tiles: params.tiles.length, felled, removed: gone, seed: settings.seed });
  return { ok: true, ops: [{ op: "forceResult", params }], report, resolved, errors: [], tiles: params.tiles.length };
}
