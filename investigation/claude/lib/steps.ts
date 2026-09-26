// Claude's operation schema: the steps a proposal is made of, and how the app turns each one into
// the engine's own operations (core/doc/ops.ts, via the planners of core/doc/tools.ts).
//
// Claude never writes a feature's params, a set piece's plan or tile runs: those are the builders'
// work (PLAN §19.3). A step names what it wants in the terms the tools speak: a kind, a request for
// its builder, or a place and a size for the app to resolve, exactly as find_sites would. So every
// step is bounded, the app checks it, and the same step gives the same edit from a proposal, a
// reference solution or a tool.
//
// Every step checks its own arguments (neither delivery route enforces numeric bounds, EDITOR_PLAN
// §7 "Safety"), and a proposal is capped at MAX_STEPS steps and MAX_AREA_SHARE of the map.

import type { EditOp } from "../../../src/core/doc/ops";
import type { MapSession } from "../../../src/core/doc/session";
import { deleteEdit, moveEdit, planContextOf, planLake, planLandform, planPiece, planRiver, replacePatch, type PlannedEdit } from "../../../src/core/doc/tools";
import { FOREST, RUIN_HEIGHT_SHARES, RUINS } from "../../../src/core/gen/calibrated";
import type { Feature, LandformFeature, Point, SetPieceFeature, SetPieceKind, StartFeature } from "../../../src/core/features/schema";
import { BUILT_KINDS, type PlanRecord } from "../../../src/core/features/setpieces";
import { local, type Facing } from "../../../src/core/features/setpieces/common";
import { tilesToRuns } from "../../../src/core/math/grid";
import { TREE_LOGS } from "../../../src/core/format/entities";
import { defaultSettings, LOGS_PER_TREE, THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { planNarrowsEdit } from "../../../src/core/doc/narrows";
import { rulesFor } from "../../../src/core/validate/playability";
import { newHandle, newId, refContext, type Conversation } from "./conversation";
import { anchorOf } from "./metrics";
import { compassWords, resolve, resolveRef, type Place } from "./places";
import { findSites, resourceArea, setVerifier, type SiteKind, type SitesResult } from "./sites";
import { guardsOf } from "./metrics";
import { newConversation } from "./conversation";
import { comparative, findWord, JUDGEMENT, leverPatch, sizeWordOf, type SizeWord } from "./words";
import { viewOf } from "./view";
import { network } from "./flow";

export const MAX_STEPS = 12;
/** Set pieces a step can place: the kinds with a site search. Kinds the engine builds beyond these
 *  (M7's plugSpillway, obstaclePayoff, secondDistrict) are refused with the reason until they get one. */
export const STEP_PIECES: readonly SetPieceKind[] = ["waterfall", "damSite", "gorge", "terracedCliffs", "badwaterBasin"];
/** The share of the map one proposal may change (tiles of areas, outlines and sculpts). */
export const MAX_AREA_SHARE = 0.3;

export type Where = Place | string;

export type Step =
  | { op: "changeSettings"; word?: string; degree?: number; patch?: { designedFor?: string; settings?: Record<string, Record<string, unknown>> } }
  | { op: "addSetPiece"; kind: SetPieceKind; request?: PlanRecord; where?: Where; size?: SizeWord | number; handle?: string; keepReservoirsClean?: boolean; nearStart?: boolean; awayFromStart?: number }
  | { op: "changeSetPiece"; target: string; request?: PlanRecord; change?: string }
  | { op: "changeFeature"; target: string; set: { level?: number; floorDepth?: number; spring?: number; flow?: number; width?: number; height?: number; edgeStyle?: "gentle" | "terraced" | "cliff"; density?: number } }
  | { op: "addRiver"; points: Point[]; flow?: number | "gentle" | "steady" | "strong"; width?: number; bedDepth?: number; badwater?: boolean; handle?: string }
  | { op: "addLake"; outline?: Point[]; where?: Where; size?: SizeWord | number; level?: number; floorDepth?: number; spring?: number; handle?: string }
  | { op: "addLandform"; kind: LandformFeature["params"]["kind"]; outline?: Point[]; where?: Where; size?: SizeWord; height?: number; edgeStyle?: LandformFeature["params"]["edgeStyle"]; handle?: string }
  | { op: "addResource"; kind: "forest" | "berryPatch" | "ruinField"; where: Where; amount?: number; size?: SizeWord; at?: [number, number]; handle?: string }
  | { op: "removeResources"; kind: "trees" | "bushes" | "ruins"; where: Where }
  | { op: "moveFeature"; target: string; by?: [number, number]; to?: [number, number] | Where }
  | { op: "moveStart"; to: [number, number] | Where; bringFood?: boolean }
  | { op: "deleteFeature"; target: string }
  | { op: "setRiverBadwater"; target: string; badwater: boolean }
  | { op: "sculpt"; mode: "raise" | "lower" | "flatten" | "smooth"; where: Where; amount?: number; level?: number }
  | { op: "undoLast" }
  // M9a (docs/m9-design.md §16): a new map from the processes (theme, seed, size, Verticality), and
  // a natural narrows on a river (the builder #63 keeps as an internal operation)
  | { op: "generate"; theme?: string; seed?: number; size?: number; verticality?: number; variety?: number; flowDirection?: string; intentions?: string[] }
  | { op: "placeNarrows"; target?: string; where?: Where; at?: number; reach?: number; rise?: number; handle?: string };

export const STEP_OPS = ["changeSettings", "addSetPiece", "changeSetPiece", "changeFeature", "addRiver", "addLake", "addLandform", "addResource", "removeResources", "moveFeature", "moveStart", "deleteFeature", "setRiverBadwater", "sculpt", "undoLast", "generate", "placeNarrows"] as const;

export interface Expanded {
  ok: boolean;
  step: Step;
  /** The engine's operations, applied as one group (a settings change is a `specPatch` alone). */
  ops: EditOp[];
  /** Features this step makes: handle → id. */
  made: { handle: string; id: string; kind: string }[];
  /** What the builders reported: reductions, what was cleared, what was added. */
  report: string[];
  /** How the app read the step: the place, the site chosen, the settings moved. */
  resolved: Record<string, unknown>;
  errors: string[];
  /** When the step cannot be done: the nearest feasible alternative, as a step, never applied. */
  alternative?: { note: string; step: Record<string, unknown> | null };
  /** Tiles the step changes (for the proposal's area cap). */
  tiles: number;
}

const fail = (step: Step, errors: string[], alternative?: Expanded["alternative"], resolved: Record<string, unknown> = {}): Expanded => ({ ok: false, step, ops: [], made: [], report: [], resolved, errors, alternative, tiles: 0 });

// ------------------------------------------------------------------------------ argument checks

const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, max = 200) => typeof v === "string" && v.length <= max;

function checkPlace(w: unknown, name: string, W: number, H: number): string[] {
  if (w === undefined) return [];
  if (typeof w === "string") return w.length <= 200 ? [] : [`${name} is longer than 200 characters`];
  if (typeof w !== "object" || w === null) return [`${name} must be a phrase or a place object`];
  const s = JSON.stringify(w);
  if (s.length > 1500) return [`${name} is too large`];
  // tile references inside must be on the map
  const bad = s.match(/\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/g)?.find((m) => {
    const [x, y] = JSON.parse(m) as number[];
    return x < 0 || y < 0 || x >= Math.max(W, 4096) || y >= Math.max(H, 4096);
  });
  return bad ? [`${name} has a tile off the map: ${bad}`] : [];
}

function checkPoints(p: unknown, W: number, H: number, name: string, min: number, max: number): string[] {
  if (!Array.isArray(p) || p.length < min || p.length > max) return [`${name} needs ${min}–${max} points`];
  for (const q of p) if (!Array.isArray(q) || q.length !== 2 || !num(q[0], -1, W) || !num(q[1], -1, H)) return [`${name}: ${JSON.stringify(q)} is not a tile on the ${W}×${H} map`];
  return [];
}

function checkRequest(r: unknown): string[] {
  if (r === undefined) return [];
  if (typeof r !== "object" || r === null || Array.isArray(r)) return ["request must be an object"];
  const keys = Object.keys(r);
  if (keys.length > 16) return ["request has too many fields"];
  for (const k of keys) {
    const v = (r as Record<string, unknown>)[k];
    const ok =
      (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 4096) ||
      (typeof v === "string" && v.length <= 64) ||
      typeof v === "boolean" ||
      (Array.isArray(v) && v.length <= 4 && v.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 4096));
    if (!ok) return [`request.${k} must be a number, a short word, a flag or a tile`];
  }
  return [];
}

/** Why a step's arguments are malformed or out of bounds (empty when they are fine). */
export function checkStep(step: unknown, W: number, H: number): string[] {
  if (typeof step !== "object" || step === null || Array.isArray(step)) return ["each step is an object with an op"];
  const s = step as Record<string, unknown>;
  if (!STEP_OPS.includes(s.op as (typeof STEP_OPS)[number])) return [`unknown op ${String(s.op).slice(0, 40)}: use one of ${STEP_OPS.join(", ")}`];
  if (JSON.stringify(s).length > 4000) return [`the ${s.op} step is too large`];
  if (s.handle !== undefined && !(str(s.handle, 40) && /^[a-z0-9][a-z0-9-]*$/i.test(String(s.handle)))) return ["handle is a short name of letters, digits and dashes"];
  if (s.size !== undefined && !(num(s.size, 1, 4096) || (typeof s.size === "string" && ["tiny", "small", "medium", "large", "huge"].includes(s.size)))) return ["size is tiny, small, medium, large, huge or a number"];
  const errs: string[] = [];
  switch (s.op) {
    case "changeSettings":
      if (s.word === undefined && s.patch === undefined) return ["changeSettings needs a word (harsher, lush, …) or a patch"];
      if (s.word !== undefined && !str(s.word, 40)) return ["word is a short judgement word"];
      if (s.degree !== undefined && !num(s.degree, 0.5, 2)) return ["degree is 0.5 (a bit), 1 or 2 (much)"];
      if (s.patch !== undefined) {
        const p = s.patch as Record<string, unknown>;
        if (typeof p !== "object" || p === null) return ["patch must be an object"];
        const extra = Object.keys(p).filter((k) => k !== "designedFor" && k !== "settings");
        if (extra.length) return [`patch may change designedFor and settings only, not ${extra.join(", ")}`];
      }
      return [];
    case "addSetPiece":
      if (!STEP_PIECES.includes(s.kind as SetPieceKind)) return [`kind must be one of ${STEP_PIECES.join(", ")} (${BUILT_KINDS.includes(s.kind as SetPieceKind) ? `the engine builds ${String(s.kind)}, but no step places it yet` : "the others are not built yet"})`];
      errs.push(...checkRequest(s.request), ...checkPlace(s.where, "where", W, H));
      if (s.request === undefined && s.where === undefined) errs.push("addSetPiece needs a request or a where");
      if (s.awayFromStart !== undefined && !num(s.awayFromStart, 0, 256)) errs.push("awayFromStart is 0–256 tiles");
      return errs;
    case "changeSetPiece":
      if (!str(s.target, 80)) return ["target names the set piece (a handle or an id)"];
      if (s.request === undefined && s.change === undefined) return ["changeSetPiece needs a request patch or a change (\"wider\", \"a bit taller\")"];
      return [...checkRequest(s.request), ...(s.change !== undefined && !str(s.change, 80) ? ["change is a short phrase"] : [])];
    case "changeFeature": {
      if (!str(s.target, 80)) return ["target names the feature"];
      const set = s.set as Record<string, unknown> | undefined;
      if (!set || typeof set !== "object" || Array.isArray(set) || !Object.keys(set).length) return ["set holds the values to change: level, floorDepth, spring, flow, width, height, edgeStyle or density"];
      const bounds: Record<string, [number, number]> = { level: [1, 15], floorDepth: [1, 4], spring: [0, 8], flow: [0.1, 64], width: [1, 9], height: [0, 16], density: [0, 1] };
      for (const [k, x] of Object.entries(set)) {
        if (k === "edgeStyle") {
          if (!["gentle", "terraced", "cliff"].includes(String(x))) errs.push("edgeStyle is gentle, terraced or cliff");
        } else if (!bounds[k]) errs.push(`${k} cannot be changed here`);
        else if (!num(x, bounds[k][0], bounds[k][1])) errs.push(`${k} is ${bounds[k][0]}–${bounds[k][1]}`);
      }
      return errs;
    }
    case "addRiver":
      errs.push(...checkPoints(s.points, W, H, "points", 2, 24));
      if (s.flow !== undefined && !(num(s.flow, 0.1, 64) || ["gentle", "steady", "strong"].includes(String(s.flow)))) errs.push("flow is 0.1–64 blocks/s or gentle, steady, strong");
      if (s.width !== undefined && !num(s.width, 1, 9)) errs.push("width is 1–9 tiles");
      if (s.bedDepth !== undefined && !num(s.bedDepth, 1, 4)) errs.push("bedDepth is 1–4");
      return errs;
    case "addLake":
      if (s.outline !== undefined) errs.push(...checkPoints(s.outline, W, H, "outline", 3, 32));
      else if (s.where === undefined) errs.push("addLake needs an outline or a where");
      errs.push(...checkPlace(s.where, "where", W, H));
      if (s.level !== undefined && !num(s.level, 1, 15)) errs.push("level is 1–15");
      if (s.floorDepth !== undefined && !num(s.floorDepth, 1, 4)) errs.push("floorDepth is 1–4");
      if (s.spring !== undefined && !num(s.spring, 0, 8)) errs.push("spring is 0–8 blocks/s");
      return errs;
    case "addLandform":
      if (!["hill", "plateau", "ridge", "canyon", "valley", "island"].includes(String(s.kind))) return ["kind is hill, plateau, ridge, canyon, valley or island"];
      if (s.outline !== undefined) errs.push(...checkPoints(s.outline, W, H, "outline", 3, 32));
      else if (s.where === undefined) errs.push("addLandform needs an outline or a where");
      errs.push(...checkPlace(s.where, "where", W, H));
      if (s.height !== undefined && !num(s.height, 0, 16)) errs.push("height is 0–16 (16 is the editor's limit)");
      if (s.edgeStyle !== undefined && !["gentle", "terraced", "cliff"].includes(String(s.edgeStyle))) errs.push("edgeStyle is gentle, terraced or cliff");
      return errs;
    case "addResource":
      if (!["forest", "berryPatch", "ruinField"].includes(String(s.kind))) return ["kind is forest, berryPatch or ruinField"];
      if (s.amount !== undefined && !num(s.amount, 1, 20000)) errs.push("amount is 1–20,000 (trees, bushes or scrap)");
      return [...errs, ...checkPlace(s.where, "where", W, H)];
    case "removeResources":
      if (!["trees", "bushes", "ruins"].includes(String(s.kind))) return ["kind is trees, bushes or ruins"];
      return checkPlace(s.where, "where", W, H);
    case "moveFeature":
      if (!str(s.target, 80)) return ["target names the feature"];
      if (s.by !== undefined && !(Array.isArray(s.by) && s.by.length === 2 && num(s.by[0], -W, W) && num(s.by[1], -H, H))) return ["by is [dx, dy] in tiles"];
      if (s.by === undefined && s.to === undefined) return ["moveFeature needs by or to"];
      if (Array.isArray(s.to)) return s.to.length === 2 && num(s.to[0], 0, W - 1) && num(s.to[1], 0, H - 1) ? [] : ["to is a tile [x, y] on the map, or a place"];
      return checkPlace(s.to, "to", W, H);
    case "moveStart":
      if (Array.isArray(s.to)) return s.to.length === 2 && num(s.to[0], 0, W - 1) && num(s.to[1], 0, H - 1) ? [] : ["to is a tile [x, y] on the map, or a place"];
      return checkPlace(s.to, "to", W, H);
    case "deleteFeature":
      return str(s.target, 80) ? [] : ["target names the feature"];
    case "setRiverBadwater":
      return str(s.target, 80) && typeof s.badwater === "boolean" ? [] : ["setRiverBadwater needs a target river and badwater true or false"];
    case "sculpt":
      if (!["raise", "lower", "flatten", "smooth"].includes(String(s.mode))) return ["mode is raise, lower, flatten or smooth"];
      if (s.amount !== undefined && !num(s.amount, 1, 8)) errs.push("amount is 1–8 levels");
      if (s.level !== undefined && !num(s.level, 0, 16)) errs.push("level is 0–16");
      return [...errs, ...checkPlace(s.where, "where", W, H)];
    case "undoLast":
      return [];
    case "generate":
      if (s.theme !== undefined && !(THEMES as readonly string[]).includes(String(s.theme))) return [`theme is one of ${THEMES.join(", ")}`];
      if (s.seed !== undefined && !(Number.isInteger(s.seed) && num(s.seed, 0, 4294967295))) return ["seed is a whole number, 0–4294967295"];
      if (s.size !== undefined && !(Number.isInteger(s.size) && num(s.size, 96, 256))) return ["size is 96–256 tiles a side"];
      if (s.verticality !== undefined && !num(s.verticality, 0, 100)) return ["verticality is 0–100"];
      if (s.variety !== undefined && !num(s.variety, 0, 100)) return ["variety is 0–100"];
      if (s.intentions !== undefined && !(Array.isArray(s.intentions) && s.intentions.length <= 2 && s.intentions.every((x) => str(x, 40)))) return ["intentions are at most 2, from the set"];
      return [];
    case "placeNarrows":
      if (s.target === undefined && s.where === undefined) return ["placeNarrows needs a target river or a where"];
      if (s.target !== undefined && !str(s.target, 80)) return ["target names the river"];
      if (s.where !== undefined) errs.push(...checkPlace(s.where, "where", W, H));
      if (s.at !== undefined && !num(s.at, 0, 1)) errs.push("at is 0–1 along the river, from its head");
      if (s.reach !== undefined && !num(s.reach, 0.5, 1)) errs.push("reach is 0.5–1");
      if (s.rise !== undefined && !(Number.isInteger(s.rise) && num(s.rise, 1, 4))) errs.push("rise is 1–4 levels");
      return errs;
  }
  return [];
}

// ---------------------------------------------------------------------------------- expansion

function targetFeature(s: MapSession, conv: Conversation, target: string): Feature | string {
  const t = resolveRef(viewOf(s), target, refContext(conv));
  if (typeof t === "string") return t;
  if (!t.id) return `${target} is not a feature`;
  const f = s.features.find((g) => g.id === t.id);
  return f ?? `${target} no longer exists`;
}

function fromPlanned(step: Step, r: PlannedEdit, conv: Conversation, kind: string, handle: string | undefined, id: string, resolved: Record<string, unknown> = {}): Expanded {
  if (!r.ok) return fail(step, r.errors, undefined, resolved);
  const h = newHandle(conv, kind, handle);
  return { ok: true, step, ops: r.ops, made: [{ handle: h, id, kind }], report: r.report, resolved, errors: [], tiles: r.tiles.length };
}

const SITE_OF: Partial<Record<SetPieceKind, SiteKind>> = { damSite: "damSite", gorge: "gorge", terracedCliffs: "terracedCliffs", badwaterBasin: "badwaterBasin" };

function siteSummary(r: SitesResult): Record<string, unknown> {
  const site = r.sites[0];
  return {
    place: r.region.reading,
    placeTiles: r.region.tiles,
    assumptions: r.region.assumptions,
    ...(r.region.ignored.length ? { ignoredWords: r.region.ignored } : {}),
    ...(site ? { site: { at: site.at, where: site.where, course: site.course, measured: site.measured } } : {}),
    ...(r.target ? { sizeTarget: r.target } : {}),
  };
}

function alternativeOf(r: SitesResult): Expanded["alternative"] {
  if (!r.alternative) return undefined;
  const note = r.alsoPossible ? `${r.alternative.note}; or ${r.alsoPossible.note}` : r.alternative.note;
  return { note, step: r.alternative.site.step };
}

/** Turn one step into the engine's operations on the map as it stands now. */
export function expandStep(s: MapSession, conv: Conversation, step: Step): Expanded {
  const { x: W, y: H } = s.size;
  const errs = checkStep(step, W, H);
  if (errs.length) return fail(step, errs);
  const v = viewOf(s);
  const refs = refContext(conv);
  switch (step.op) {
    case "changeSettings": {
      if (!s.spec) return fail(step, ["an imported map has no settings to change"]);
      if (step.word) {
        const w = JUDGEMENT.find((j) => j.word === step.word) ?? findWord(step.word)?.word;
        if (!w) return fail(step, [`"${step.word}" is not in the judgement-word table (${JUDGEMENT.map((j) => j.word).join(", ")})`]);
        const { patch, moved, atBound } = leverPatch(s.spec, w.levers, step.degree ?? 1);
        if (!moved.length) return fail(step, [`the map is already as ${w.word} as its settings go (${atBound.join(", ")} at their limits)`]);
        const weak = w.weakOn?.includes(s.spec.theme) ? { weakHere: `on a ${s.spec.theme} map these settings barely move ${w.targets.map((t) => t.metric).join(", ")}` } : {};
        return { ok: true, step, ops: [{ op: "specPatch", params: { patch: { settings: patch } } }], made: [], report: [], resolved: { word: w.word, means: w.means, moved, ...(atBound.length ? { atBound } : {}), levers: w.levers.map((l) => l.setting.join(".")), ...weak }, errors: [], tiles: 0 };
      }
      return { ok: true, step, ops: [{ op: "specPatch", params: { patch: step.patch as Record<string, unknown> } }], made: [], report: [], resolved: { patch: step.patch }, errors: [], tiles: 0 };
    }
    case "addSetPiece": {
      const id = newId(conv, step.kind);
      hintIds({ ...conv, counter: conv.counter - 1 });
      let request = step.request;
      let resolved: Record<string, unknown> = {};
      if (!request || step.where !== undefined) {
        const kind: SiteKind = step.kind === "waterfall" ? (request?.mode === "on-river" ? "riverFall" : "waterfall") : (SITE_OF[step.kind] ?? "damSite");
        const r = findSites(s, { kind, where: step.where, size: step.size, request, keepReservoirsClean: step.keepReservoirsClean, nearStart: step.nearStart, awayFromStart: step.awayFromStart, limit: 1 }, refs);
        resolved = siteSummary(r);
        if (!r.ok) return fail(step, [r.reason ?? "no site fits"], alternativeOf(r), resolved);
        const site = r.sites[0];
        if (site.step.existing) {
          return { ok: true, step, ops: [], made: [], report: [`the dam site ${String(site.step.existing)} already here meets it: nothing to build`], resolved: { ...resolved, existing: site.step.existing }, errors: [], tiles: 0 };
        }
        request = { ...(site.step.request as PlanRecord) };
      }
      const planned = planPiece(s, step.kind, request, id, "claude");
      return fromPlanned(step, planned, conv, step.kind, step.handle, id, { ...resolved, request });
    }
    case "changeSetPiece": {
      const f = targetFeature(s, conv, step.target);
      if (typeof f === "string") return fail(step, [f]);
      if (f.kind !== "setPiece") return fail(step, [`${step.target} is a ${f.kind}, not a set piece`]);
      let req: PlanRecord = { ...f.params.request, ...(f.params.plan.mode === "standalone" ? { lip: f.params.plan.lip as number[] } : {}), ...(step.request ?? {}) };
      let gained = 0;
      if (step.change) {
        const c = comparative(step.change);
        if (!c) return fail(step, [`"${step.change}" is not a change the app knows (wider, narrower, taller, bigger, a bit …)`]);
        const key = c.param === "size" ? (f.params.kind === "waterfall" ? "width" : f.params.kind === "damSite" ? "crest" : "width") : c.param === "depth" ? "crest" : c.param;
        const cur = Number(f.params.plan[key] ?? req[key]);
        if (!Number.isFinite(cur)) return fail(step, [`a ${f.params.kind} has no ${c.param} to change`]);
        let next = key === "flow" ? Math.round(cur * c.factor * 100) / 100 : Math.round(cur * c.factor);
        if (key !== "flow" && next === cur) next = cur + (c.factor > 1 ? 1 : -1);
        req[key] = next;
        if (key === "width" && f.params.kind === "waterfall") gained = next - cur;
      }
      let planned = planPiece(s, f.params.kind, req, f.id, f.origin);
      // a standalone fall that grows into a river grows away from it instead: its lip moves along
      // itself, at most the width it gains
      const moves: string[] = [];
      const lip = req.lip as number[] | undefined;
      if (!planned.ok && gained > 0 && f.params.plan.mode === "standalone" && lip && planned.errors.some((e) => e.startsWith("it would dam a river"))) {
        const facing = String(req.facing ?? f.params.plan.facing) as Facing;
        for (let k = 1; k <= gained && !planned.ok; k++)
          for (const v of [k, -k]) {
            const [dx, dy] = local(0, 0, facing, 0, v);
            const moved = { ...req, lip: [lip[0] + dx, lip[1] + dy] };
            const r = planPiece(s, f.params.kind, moved, f.id, f.origin);
            if (!r.ok) continue;
            planned = r;
            req = moved;
            moves.push(`moved ${k} tile${k > 1 ? "s" : ""} along its lip, away from the river, to grow`);
            break;
          }
      }
      if (!planned.ok) return fail(step, planned.errors);
      return { ok: true, step, ops: planned.ops, made: [], report: [...planned.report, ...moves], resolved: { target: f.id, request: req }, errors: [], tiles: planned.tiles.length };
    }
    case "changeFeature": {
      const f = targetFeature(s, conv, step.target);
      if (typeof f === "string") return fail(step, [f]);
      const set = step.set;
      const done = (ops: EditOp[], report: string[]): Expanded => ({ ok: true, step, ops, made: [], report, resolved: { target: f.id, set }, errors: [], tiles: 0 });
      if (f.kind === "lake") {
        if (f.params.planned || f.params.river || !f.params.outlet.path) return fail(step, ["this lake is part of the generated layout (a reservoir site or its river's basin): change the settings, or dam it"]);
        const spring = "spring" in f.params.inflow ? f.params.inflow.spring : 0;
        const r = planLake({ outline: f.params.outline, level: set.level ?? f.params.outlet.sill, floorDepth: set.floorDepth ?? f.params.floorDepth, spring: set.spring ?? spring }, planContextOf(s, f.id), f.id, f.origin);
        if (!r.ok) return fail(step, r.errors);
        return done([{ op: "updateFeature", params: { id: f.id, patch: { params: replacePatch(f.params, r.feature.params) as Record<string, unknown> } } }], r.report);
      }
      if (f.kind === "river") {
        if (!f.params.banks) return fail(step, ["the generated river follows the map's settings: change River flow with changeSettings instead"]);
        const r = planRiver({ points: f.params.path, flow: set.flow ?? f.params.flow, width: set.width ?? f.params.width, bedDepth: f.params.bedDepth }, planContextOf(s, f.id), f.id, f.origin);
        if (!r.ok) return fail(step, r.errors);
        return done([{ op: "updateFeature", params: { id: f.id, patch: { params: replacePatch(f.params, r.feature.params) as Record<string, unknown> } } }, ...r.ops.slice(1)], r.report);
      }
      if (f.kind === "landform") {
        if (!f.params.outline) return fail(step, ["this landform follows the river; change the relief or terracing settings instead"]);
        const patch: Record<string, unknown> = {};
        if (set.height !== undefined) patch.height = set.height;
        if (set.edgeStyle !== undefined) patch.edgeStyle = set.edgeStyle;
        if (!Object.keys(patch).length) return fail(step, ["a landform changes its height or edgeStyle"]);
        return done([{ op: "updateFeature", params: { id: f.id, patch: { params: patch } } }], [`now ${set.height !== undefined ? `level ${set.height}` : ""}${set.edgeStyle ? ` with ${set.edgeStyle} edges` : ""}`.trim()]);
      }
      if ((f.kind === "forest" || f.kind === "berryPatch") && set.density !== undefined) return done([{ op: "updateFeature", params: { id: f.id, patch: { params: { density: set.density } } } }], [`density ${set.density}`]);
      return fail(step, [`a ${f.kind} has none of these to change: ${Object.keys(set).join(", ")}`]);
    }
    case "addRiver": {
      const id = newId(conv, "river");
      const flow = typeof step.flow === "string" ? { gentle: 1, steady: 2, strong: 4 }[step.flow] : (step.flow ?? 2);
      const r = planRiver({ points: step.points, flow, ...(step.width ? { width: step.width } : {}), ...(step.bedDepth ? { bedDepth: step.bedDepth } : {}) }, planContextOf(s), id, "claude");
      if (step.badwater) return fail(step, ["a river's badwater switch is not built yet: draw the river clean and add a badwater spring that drains into it"]);
      if (r.ok && step.badwater && r.feature.kind === "river") {
        r.feature.params.badwater = true;
        const op = r.ops[0];
        if (op.op === "addFeature") op.params.feature = r.feature;
        r.report.push("it carries badwater: it stops moistening the soil, and trees along it die");
      }
      return fromPlanned(step, r, conv, "river", step.handle, id);
    }
    case "addLake": {
      const id = newId(conv, "lake");
      hintIds({ ...conv, counter: conv.counter - 1 });
      let outline = step.outline;
      let spring = step.spring;
      let resolved: Record<string, unknown> = {};
      if (!outline) {
        const r = findSites(s, { kind: "lake", where: step.where, size: step.size, request: { ...(step.level ? { level: step.level } : {}), ...(step.spring !== undefined ? { spring: step.spring } : {}) }, limit: 1 }, refs);
        resolved = siteSummary(r);
        if (!r.ok) return fail(step, [r.reason ?? "no place for the lake"], alternativeOf(r), resolved);
        outline = r.sites[0].step.outline as Point[];
        // a site a river fills comes without a spring (D171)
        if (spring === undefined && typeof r.sites[0].step.spring === "number") spring = r.sites[0].step.spring;
      }
      const r = planLake({ outline, ...(step.level ? { level: step.level } : {}), ...(step.floorDepth ? { floorDepth: step.floorDepth } : {}), ...(spring !== undefined ? { spring } : {}) }, planContextOf(s), id, "claude");
      if (r.ok && spring === 0 && step.spring === undefined) r.report = r.report.map((l) => (l.startsWith("no spring") ? "the river beside it fills it, so it has no spring of its own (a source starts water, never stands in a flow)" : l));
      return fromPlanned(step, r, conv, "lake", step.handle, id, resolved);
    }
    case "addLandform": {
      const id = newId(conv, step.kind);
      hintIds({ ...conv, counter: conv.counter - 1 });
      let outline = step.outline;
      let height = step.height;
      let resolved: Record<string, unknown> = {};
      if (!outline) {
        const r = findSites(s, { kind: step.kind as SiteKind, where: step.where, size: step.size, request: { ...(step.height !== undefined ? { height: step.height } : {}), ...(step.edgeStyle ? { edgeStyle: step.edgeStyle } : {}) }, limit: 1 }, refs);
        resolved = siteSummary(r);
        if (!r.ok) return fail(step, [r.reason ?? "no place for it"], alternativeOf(r), resolved);
        outline = r.sites[0].step.outline as Point[];
        height ??= Number(r.sites[0].step.height);
      }
      const r = planLandform({ outline, kind: step.kind, ...(height !== undefined ? { height } : {}), edgeStyle: step.edgeStyle ?? (step.kind === "plateau" ? "cliff" : "gentle") }, planContextOf(s), id, "claude");
      return fromPlanned(step, r, conv, step.kind, step.handle, id, resolved);
    }
    case "addResource": {
      const where = resolve(v, step.where, refs);
      if (!where.ok) return fail(step, where.errors, undefined, { place: where.place });
      const size = step.size ?? (step.amount === undefined ? "medium" : undefined);
      const perTile = step.kind === "ruinField" ? 42 : 1;
      const perSize: Record<string, number> = { tiny: 14, small: 35, medium: 85, large: 210, huge: 550 };
      const wanted = step.amount ?? (perSize[typeof size === "string" ? size : "medium"] ?? 85) * (step.kind === "ruinField" ? 16 : 1);
      const tiles = resourceArea(s, step.kind, where.mask, Math.max(4, Math.round(wanted / perTile)), step.at);
      if (!tiles.length) return fail(step, [step.kind === "ruinField" ? "no dry ground there for ruins (they keep off moist soil and away from the start)" : "no moist soil there: trees and berries only live where the water keeps the soil moist"], undefined, { place: where.place, assumptions: where.assumptions });
      const id = newId(conv, step.kind);
      const area = tilesToRuns(tiles, W);
      let feature: Feature;
      if (step.kind === "forest") feature = { id, kind: "forest", origin: "claude", locked: false, params: { area, density: 1, speciesMix: { Pine: 47, Birch: 27, Oak: 20 }, groveSize: tiles.length, life: "auto", youngShare: FOREST.youngShare } };
      else if (step.kind === "berryPatch") feature = { id, kind: "berryPatch", origin: "claude", locked: false, params: { area, density: 1, ripeShare: 0.5 } };
      else feature = { id, kind: "ruinField", origin: "claude", locked: false, params: { area, scrapTarget: Math.round(tiles.length * perTile), heightMix: [...RUIN_HEIGHT_SHARES], centerBias: RUINS.centerBias } };
      const h = newHandle(conv, step.kind, step.handle);
      const got = tiles.length * perTile;
      const unit = step.kind === "ruinField" ? "scrap" : step.kind === "forest" ? "trees" : "bushes";
      const short = got < wanted * 0.8 ? ` (asked for ${Math.round(wanted)}: that is all the suitable ground there)` : "";
      return { ok: true, step, ops: [{ op: "addFeature", params: { feature } }], made: [{ handle: h, id, kind: step.kind }], report: [`about ${Math.round(got)} ${unit} on ${tiles.length} tiles${short}`], resolved: { place: where.place, assumptions: where.assumptions, tiles: tiles.length }, errors: [], tiles: tiles.length };
    }
    case "removeResources": {
      const where = resolve(v, step.where, refs);
      if (!where.ok) return fail(step, where.errors);
      const test = step.kind === "trees" ? /^(Pine|Birch|Oak|Succulent)$/ : step.kind === "bushes" ? /^BlueberryBush$/ : /^RuinColumnH\d$/;
      const ids = s.built.entities.filter((e) => test.test(e.template) && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && where.mask[e.y * W + e.x]).map((e) => e.id);
      if (!ids.length) return fail(step, [`there are no ${step.kind} there`]);
      return { ok: true, step, ops: [{ op: "deleteEntities", params: { entities: ids } }], made: [], report: [`removes ${ids.length} ${step.kind}`], resolved: { place: where.place, assumptions: where.assumptions, count: ids.length }, errors: [], tiles: ids.length };
    }
    case "moveFeature": {
      const f = targetFeature(s, conv, step.target);
      if (typeof f === "string") return fail(step, [f]);
      if (f.kind === "start") return expandStep(s, conv, { op: "moveStart", to: step.to ?? [anchorOf(v, f)[0] + step.by![0], anchorOf(v, f)[1] + step.by![1]] });
      // a set piece moved to a place: the app picks a site there with the piece's own builder
      // values (a spring keeps its strength, a fall its width and drop), checked like any site,
      // and rebuilds the piece there under the same id
      if (step.to !== undefined && !Array.isArray(step.to) && f.kind === "setPiece") {
        const kind = f.params.kind;
        const siteKind: SiteKind | undefined = kind === "waterfall" ? (f.params.plan.mode === "on-river" ? "riverFall" : "waterfall") : SITE_OF[kind];
        if (!siteKind) return fail(step, [`a ${kind} cannot be moved to a place yet: give to as a tile [x, y] or by [dx, dy]`]);
        const keep: PlanRecord = { ...f.params.request };
        for (const k of ["at", "lip", "centre", "center", "position"]) delete keep[k];
        const r = findSites(s, { kind: siteKind, where: step.to, request: keep, limit: 1, replaces: f.id }, refs);
        const resolved = siteSummary(r);
        if (!r.ok) return fail(step, [r.reason ?? "no site fits"], alternativeOf(r), resolved);
        const planned = planPiece(s, kind, { ...keep, ...(r.sites[0].step.request as PlanRecord) }, f.id, f.origin);
        if (!planned.ok) return fail(step, planned.errors, undefined, resolved);
        return { ok: true, step, ops: planned.ops, made: [], report: planned.report, resolved: { ...resolved, target: f.id, to: r.sites[0].at }, errors: [], tiles: planned.tiles.length };
      }
      if (step.to !== undefined && !Array.isArray(step.to)) return fail(step, ["only a set piece moves to a place; give to as a tile [x, y] or by [dx, dy]"]);
      const a = anchorOf(v, f);
      const [dx, dy] = step.by ?? [(step.to as [number, number])[0] - a[0], (step.to as [number, number])[1] - a[1]];
      const r = moveEdit(s, f.id, Math.round(dx), Math.round(dy));
      if (!r.ok) return fail(step, r.errors);
      return { ok: true, step, ops: r.ops, made: [], report: r.report, resolved: { target: f.id, by: [Math.round(dx), Math.round(dy)] }, errors: [], tiles: r.tiles.length };
    }
    case "moveStart":
      return expandMoveStart(s, conv, step);
    case "deleteFeature": {
      const f = targetFeature(s, conv, step.target);
      if (typeof f === "string") return fail(step, [f]);
      if (f.kind === "start") return fail(step, ["the start cannot be deleted: every map needs exactly one; move it instead"]);
      const r = deleteEdit(s, f.id);
      if (!r.ok) return fail(step, r.errors);
      return { ok: true, step, ops: r.ops, made: [], report: [...r.report], resolved: { target: f.id, kind: f.kind === "setPiece" ? f.params.kind : f.kind }, errors: [], tiles: 0 };
    }
    case "setRiverBadwater": {
      // the river feature stores the flag, but no build step reads it yet: the river would stay
      // clean, and the step would claim a change that never happens
      if (step.badwater) return fail(step, ["a river's badwater switch is not built yet (the map's water ignores it): add a badwater spring (badwaterBasin) whose outlet joins the river instead"], { note: "a badwater spring beside the river, draining into it", step: { op: "addSetPiece", kind: "badwaterBasin", where: { along: step.target, within: 20 }, keepReservoirsClean: true } });
      const f = targetFeature(s, conv, step.target);
      if (typeof f === "string") return fail(step, [f]);
      if (f.kind !== "river") return fail(step, [`${step.target} is not a river`]);
      return { ok: true, step, ops: [{ op: "updateFeature", params: { id: f.id, patch: { params: { badwater: step.badwater } } } }], made: [], report: step.badwater ? ["the river now carries badwater: it stops moistening the soil, and trees along it die"] : ["the river runs clean"], resolved: { target: f.id }, errors: [], tiles: 0 };
    }
    case "sculpt": {
      const where = resolve(v, step.where, refs);
      if (!where.ok) return fail(step, where.errors);
      if (where.tiles > MAX_AREA_SHARE * W * H) return fail(step, [`that area is ${where.tiles} tiles; one proposal may sculpt at most ${Math.floor(MAX_AREA_SHARE * W * H)}`]);
      const tiles: number[] = [];
      for (let i = 0; i < where.mask.length; i++) if (where.mask[i]) tiles.push(i);
      const params = { mode: step.mode, cells: tilesToRuns(tiles, W), ...(step.mode === "raise" || step.mode === "lower" ? { amount: step.amount ?? 1 } : {}), ...(step.mode === "flatten" ? { level: step.level ?? v.heights[tiles[0]] } : {}) };
      return { ok: true, step, ops: [{ op: "sculpt", params } as EditOp], made: [], report: [`${step.mode} ${tiles.length} tiles`], resolved: { place: where.place, assumptions: where.assumptions }, errors: [], tiles: tiles.length };
    }
    case "undoLast":
      return { ok: true, step, ops: [], made: [], report: [], resolved: conv.accepted.length ? { undoes: conv.accepted[conv.accepted.length - 1].text } : {}, errors: conv.accepted.length ? [] : ["nothing to undo in this conversation"], tiles: 0 };
    case "generate": {
      if (!s.spec) return fail(step, ["an imported map has no settings: it cannot be generated again"]);
      // what M9a does not steer yet: said, with the map it can make instead
      const without = { ...step } as Record<string, unknown>;
      delete without.variety;
      delete without.flowDirection;
      delete without.intentions;
      if (step.variety !== undefined) return fail(step, ["Variety becomes a setting in M9b: the map is made at its default Variety"], { note: "the same map at the default Variety", step: without });
      if (step.flowDirection !== undefined) return fail(step, ["choosing the flow direction waits for M9b: the land picks it"], { note: "the same map with the land's own flow direction", step: without });
      if (step.intentions !== undefined) return fail(step, ["steering to intentions waits for M9b"], { note: "the same map, its intentions drawn by the land", step: without });
      const theme = (step.theme ?? s.spec.theme) as ThemeId;
      const side = step.size ?? s.spec.size.x;
      const size = { x: side, y: step.size ?? s.spec.size.y };
      const settings = step.theme && step.theme !== s.spec.theme ? defaultSettings(theme, s.spec.designedFor, size) : JSON.parse(JSON.stringify(s.spec.settings));
      if (step.verticality !== undefined) settings.terrain.verticality = Math.round(step.verticality);
      const patch: Record<string, unknown> = { theme, archetype: theme, seed: step.seed ?? s.spec.seed, size, settings };
      const moved = [step.theme !== undefined ? `theme ${theme}` : null, step.seed !== undefined ? `seed ${step.seed}` : null, step.size !== undefined ? `size ${side}` : null, step.verticality !== undefined ? `Verticality ${Math.round(step.verticality)}${step.verticality >= 70 ? " (land may rise above 16)" : ""}` : null].filter(Boolean);
      return { ok: true, step, ops: [{ op: "specPatch", params: { patch } }], made: [], report: [`a new map from the processes: ${moved.join(", ") || "the same settings"}`], resolved: { patch: { theme, seed: patch.seed, size, verticality: settings.terrain.verticality } }, errors: [], tiles: 0 };
    }
    case "placeNarrows": {
      // the river and the place along it: a named river (at 0–1, default halfway), or a place in
      // words, read as the river course through it and the middle of its stretch there
      let riverId: string;
      let at = step.at ?? 0.5;
      const resolved: Record<string, unknown> = {};
      if (step.where !== undefined) {
        const where = resolve(v, step.where, refs);
        if (!where.ok) return fail(step, where.errors);
        const net = network(v);
        let best: { id: string; n: number; s: number; length: number; reversed: boolean } | null = null;
        for (const c of net.courses) {
          if (step.target !== undefined) {
            const t = targetFeature(s, conv, step.target);
            if (typeof t === "string" || t.id !== c.id) continue;
          }
          let n = 0;
          let sum = 0;
          for (let i = 0; i < where.mask.length; i++)
            if (where.mask[i] && c.field.d[i] < Math.max(3, c.width)) {
              n++;
              sum += c.field.s[i];
            }
          if (n && (!best || n > best.n)) best = { id: c.id, n, s: sum / n, length: c.length, reversed: c.reversed };
        }
        if (!best) return fail(step, [`no river runs through ${where.place ? "that place" : "there"}: a narrows closes in on a river`]);
        riverId = best.id;
        // (the feature's own path order: the builder measures along it)
        const frac = best.s / Math.max(1, best.length);
        at = Math.round((best.reversed ? 1 - frac : frac) * 100) / 100;
        Object.assign(resolved, { place: where.place, assumptions: where.assumptions });
      } else {
        const f = targetFeature(s, conv, step.target!);
        if (typeof f === "string") return fail(step, [f]);
        if (f.kind !== "river") return fail(step, [`${step.target} is not a river`]);
        riverId = f.id;
      }
      const id = newId(conv, "naturalNarrows");
      const r = planNarrowsEdit(s, { river: riverId, at, reach: step.reach, rise: step.rise }, id);
      if (!r.ok) {
        // the nearest place along the river where the spurs fit
        for (const d of [0.05, -0.05, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3]) {
          const a2 = Math.round(Math.min(0.95, Math.max(0.05, at + d)) * 100) / 100;
          if (planNarrowsEdit(s, { river: riverId, at: a2, reach: step.reach, rise: step.rise }, id).ok) return fail(step, r.errors, { note: `the nearest place along the river where spurs fit on both banks: ${Math.round(a2 * 100)}% of the way along it`, step: { op: "placeNarrows", target: riverId, at: a2, ...(step.reach !== undefined ? { reach: step.reach } : {}), ...(step.rise !== undefined ? { rise: step.rise } : {}) } });
        }
        return fail(step, r.errors, undefined, resolved);
      }
      const h = newHandle(conv, "narrows", step.handle);
      return { ok: true, step, ops: r.ops, made: [{ handle: h, id, kind: "naturalNarrows" }], report: r.report, resolved: { ...resolved, river: riverId, at, gap: r.gap }, errors: [], tiles: r.tiles.length };
    }
  }
}

function expandMoveStart(s: MapSession, conv: Conversation, step: Extract<Step, { op: "moveStart" }>): Expanded {
  const v = viewOf(s);
  const refs = refContext(conv);
  const feat = s.features.find((f): f is StartFeature => f.kind === "start");
  let to: [number, number];
  let resolved: Record<string, unknown> = {};
  if (Array.isArray(step.to) && step.to.length === 2 && typeof step.to[0] === "number") to = [Math.round(step.to[0]), Math.round(Number(step.to[1]))];
  else {
    hintIds(conv);
    const r = findSites(s, { kind: "start", where: step.to as Where, limit: 1 }, refs);
    resolved = siteSummary(r);
    if (!r.ok) return fail(step, [r.reason ?? "no spot meets the start rules there"], alternativeOf(r), resolved);
    to = r.sites[0].at;
  }
  const ops: EditOp[] = [];
  const report: string[] = [];
  if (feat) ops.push({ op: "updateFeature", params: { id: feat.id, patch: { params: { position: to, benchLevel: Math.max(1, v.heights[to[1] * v.W + to[0]]) } } } });
  else {
    const e = s.built.entities.find((g) => g.template === "StartingLocation");
    if (!e) return fail(step, ["this map has no start to move"]);
    ops.push({ op: "moveEntity", params: { id: e.id, x: to[0] - 1, y: to[1] - 1 } });
  }
  report.push(`the start moves to (${to[0]}, ${to[1]})`);
  const made: Expanded["made"] = [];
  if (step.bringFood !== false) {
    // bring trees and berries along when the new spot lacks them (the start rules, read from the
    // validator at HEAD): a grove and a berry patch on moist soil 7–16 tiles out
    const rules = rulesFor(s.spec, s.meta.designedFor);
    const near = (e: { x: number; y: number }) => Math.hypot(e.x - to[0], e.y - to[1]) <= 18;
    // starting wood in logs (D164): each tree by its species' yield
    const wood = s.built.entities.filter((e) => /^(Pine|Birch|Oak)$/.test(e.template) && near(e)).reduce((a, e) => a + TREE_LOGS[e.template], 0);
    const bushes = s.built.entities.filter((e) => e.template === "BlueberryBush" && near(e)).length;
    const ring = new Uint8Array(v.W * v.H);
    for (let y = 0; y < v.H; y++)
      for (let x = 0; x < v.W; x++) {
        const d = Math.hypot(x - to[0], y - to[1]);
        if (d >= 7 && d <= 16) ring[y * v.W + x] = 1;
      }
    const add = (kind: "berryPatch" | "forest", need: number) => {
      const tiles = resourceArea(s, kind, ring, need);
      if (tiles.length < need * 0.5) return;
      const id = newId(conv, kind);
      const area = tilesToRuns(tiles, v.W);
      const feature: Feature =
        kind === "berryPatch"
          ? { id, kind, origin: "claude", locked: false, params: { area, density: 1, ripeShare: 0.5 } }
          : { id, kind, origin: "claude", locked: false, params: { area, density: 1, speciesMix: { Pine: 47, Birch: 27, Oak: 20 }, groveSize: tiles.length, life: "alive", youngShare: 0 } };
      ops.push({ op: "addFeature", params: { feature } });
      for (const t of tiles) ring[t] = 0;
      const h = newHandle(conv, kind);
      made.push({ handle: h, id, kind });
      report.push(`plants ${kind === "berryPatch" ? `a berry patch of ${tiles.length} bushes` : `a grove of ${tiles.length} trees`} near the new start, for the start rules (${kind === "berryPatch" ? `${rules.bushesWithin20} bushes` : `${rules.woodWithin20} logs`} within 20 tiles)`);
    };
    const needB = Math.ceil(rules.bushesWithin20 * 1.25) - bushes;
    // the grove's mix gives about 3 logs a tree
    const needT = Math.ceil((Math.ceil(rules.woodWithin20 * 1.25) - wood) / LOGS_PER_TREE);
    if (needB > 0) add("berryPatch", needB);
    if (needT > 0) add("forest", needT);
  }
  return { ok: true, step, ops, made, report, resolved: { ...resolved, to, where: compassWords(v, to[0], to[1]) }, errors: [], tiles: 0 };
}

// ---------------------------------------------------------------------------- site verification

const guardCache = new Map<string, Map<string, boolean>>();

/** The id the next feature will get: builders shape some pieces from their id (a dam ridge's
 *  wobble), so a site is checked with the id the real step will use. */
let idHint: { seed: number; counter: number } | null = null;
export function hintIds(conv: Conversation | null): void {
  idHint = conv ? { seed: conv.seed, counter: conv.counter } : null;
}

/** Build a site's step on the session, validate, and take it back: which guards it breaks. */
setVerifier((s, raw) => {
  const step = raw as unknown as Step;
  const key = viewOf(s).key;
  let before = guardCache.get(key);
  if (!before) {
    before = new Map(guardsOf(s.validate().report).map((g) => [g.id, g.ok]));
    if (guardCache.size > 8) guardCache.clear();
    guardCache.set(key, before);
  }
  const scratch = newConversation(idHint?.seed ?? 7);
  scratch.counter = idHint?.counter ?? 0;
  // a site for moving a piece is checked as the piece rebuilt there, under its own id
  const replaces = typeof raw.replaces === "string" ? s.features.find((f): f is SetPieceFeature => f.kind === "setPiece" && f.id === raw.replaces) : undefined;
  const ex: Pick<Expanded, "ok" | "ops" | "errors"> = replaces
    ? (() => {
        const r = planPiece(s, replaces.params.kind, raw.request as PlanRecord, replaces.id, replaces.origin);
        return r.ok ? { ok: true, ops: r.ops, errors: [] } : { ok: false, ops: [], errors: r.errors };
      })()
    : expandStep(s, scratch, step);
  if (!ex.ok) return { broken: [], error: ex.errors[0] ?? "it cannot be built" };
  if (!ex.ops.length) return { broken: [] };
  const r = ex.ops[0].op === "specPatch" ? s.apply(ex.ops[0], "claude") : s.applyAll(ex.ops, "claude");
  if (!r.ok) return { broken: [], error: r.errors[0] ?? "it cannot be built" };
  const after = guardsOf(s.validate().report);
  s.undo();
  return { broken: after.filter((g) => !g.ok && g.applicable && before!.get(g.id) !== false).map((g) => g.id) };
});

export function isSetPiece(f: Feature): f is SetPieceFeature {
  return f.kind === "setPiece";
}

export { sizeWordOf };
