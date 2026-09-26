// The seven query tools (EDITOR_PLAN §7), as read-only wrappers over the engine, plus `propose`,
// the one that changes the map. Both delivery routes offer them as tools: Messages API tool use
// (route B) and page functions passed to the artifact's `sample` (route A).
//
// Limits (EDITOR_PLAN §7, the artifact's contract): each input schema ≤ 4 KB, each result ≤ 32 KB,
// the map summary ≤ about 16 KB. Every tool checks its own arguments, because the artifact route
// does not enforce tool schemas and the API's strict mode cannot express numeric bounds. A bad
// argument gets an error that says what is allowed, never a guess.
//
// When a goal is not feasible, find_sites and the proposal's steps return the reason and the
// nearest feasible alternative (a place or a size), which Claude offers and never builds silently.

import type { MapSession } from "../../../src/core/doc/session";
import { BUILDERS, flowBudget, type PlanRecord } from "../../../src/core/features/setpieces";
import { standaloneLimits } from "../../../src/core/features/setpieces/waterfall";
import type { Facing } from "../../../src/core/features/setpieces/common";
import type { Feature, SetPieceKind } from "../../../src/core/features/schema";
import { planContextOf } from "../../../src/core/doc/tools";
import { rulesFor } from "../../../src/core/validate/playability";
import { refContext, type Conversation } from "./conversation";
import { runProposal, type Proposal, type ProposalResult } from "./compound";
import { locate, network } from "./flow";
import { MAP_METRICS, mapMetric, measureFeature, measureSession, startRequirements } from "./metrics";
import { compassWords, extent, resolve, resolveRef, type Place } from "./places";
import { findSites, SITE_KINDS, type SiteKind } from "./sites";
import { hintIds, POWER_WORDS, STEP_OPS } from "./steps";
import { mapSummary, SUMMARY_LIMIT } from "./summary";
import { JUDGEMENT, sizeTarget, type SizeWord } from "./words";
import { round1, viewOf } from "./view";

export const RESULT_LIMIT = 32 * 1024;
export const SCHEMA_LIMIT = 4 * 1024;

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const WHERE = { description: "A place: the player's words (\"halfway down this valley\", \"north third\", \"near the start\", \"the opposite bank\") or a place object", type: ["string", "object"] };
const SIZE = { description: "tiny, small, medium, large, huge, or a number (tiles; blocks of water for a dam site)", type: ["string", "number"] };

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "resolve_region",
    description:
      "Turn a place in words into tiles, and say what is there. Places: compass (\"north third\", \"northeast corner\", \"east edge\", \"center\"); near/far/along/between features (\"near the start\", \"away from the lake\", \"along the river\", \"between the lake and the start\"); flow words read from the river's real flow (\"upstream\", \"downstream of the dam\", \"halfway down\", \"near the source\", \"the opposite bank\", \"the start's bank\", \"this valley\"); terrain (\"high ground\", \"flat ground\"). Parts combine: \"halfway down, on the opposite bank\". Returns the reading, the assumptions made and any words ignored.",
    input_schema: { type: "object", properties: { where: WHERE }, required: ["where"] },
  },
  {
    name: "find_sites",
    description:
      "Find places for something, each planned by the real builder and measured. kind: waterfall (standalone), riverFall (a fall on a river), damSite, gorge, terracedCliffs, badwaterBasin, start, lake (a hollow to dig with a lower brush: its `step` digs it and its `then` puts a spring in it; propose both), forest, berryPatch, ruinField (hills and valleys come from the brush step). Returns up to `limit` sites, best first, each with a ready `step` for propose. When none fits: the reason and the nearest feasible alternative (a size or a place), which you offer, never build silently.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...SITE_KINDS] },
        where: WHERE,
        size: SIZE,
        request: { type: "object", description: "builder values to keep: drop, flow, crest, facing, strength, width, bands" },
        awayFromStart: { type: "number", description: "tiles, 0–256" },
        keepReservoirsClean: { type: "boolean", description: "badwaterBasin: its outlet must not join a river above a dam site" },
        nearStart: { type: "boolean", description: "badwaterBasin: as near the start as the start rules allow" },
        limit: { type: "integer", description: "1–5, default 3" },
      },
      required: ["kind"],
    },
  },
  {
    name: "measure",
    description:
      "Measure the map, a feature, a tile or the distance between two things. subject: \"map\" (height range, water, badwater, stored water, trees, berries, scrap, the start rules with their limits), \"start\", a handle or a feature id. `between`: two things, gives the straight distance and how they sit on the river (upstream/downstream, banks). `at`: a tile [x, y].",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        metrics: { type: "array", items: { type: "string" }, description: "map metrics to return (default: all)" },
        between: { type: "array", items: { type: ["string", "array"] }, description: "two things: \"start\", a handle, a feature id, a kind word or a tile [x, y]" },
        at: { type: "array", items: { type: "number" }, description: "a tile [x, y]" },
      },
    },
  },
  {
    name: "list_features",
    description: "List the map's features with their key values: rivers (with flow direction), lakes, landforms, set pieces, the start, and resource areas. Filter by kind, place or origin (generated, user, claude); page with offset.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "river, lake, landform, setPiece, forest, berryPatch, ruinField, start, or a set piece kind" },
        where: WHERE,
        origin: { type: "string", enum: ["generated", "user", "claude", "stamp"] },
        offset: { type: "integer" },
        limit: { type: "integer", description: "1–40, default 20" },
      },
    },
  },
  {
    name: "limits",
    description: "The achievable ranges for a set piece on this map (PLAN §9.10) and what each size word means here: widths, drops, flow budget, reservoir sizes, basin cap; for the start, the start rules the validator applies; for words, what each judgement word changes and whether it works on this theme.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "waterfall, damSite, gorge, terracedCliffs, badwaterBasin, lake, landform, forest, ruinField, river, brush, carve, start, words" },
        facing: { type: "string", enum: ["north", "east", "south", "west"] },
      },
      required: ["kind"],
    },
  },
  {
    name: "dry_run",
    description:
      "Apply a proposal to a preview copy and return what happened: each step's result and what it resolved to, your expectations checked on the combined result, guards (checks that passed before) that broke and which step broke them, trade-offs between goals, goals not met with their nearest alternative, and a draft report. Nothing changes on the map.",
    input_schema: {
      type: "object",
      properties: {
        request: { type: "string", description: "the player's words" },
        goals: { type: "array", items: { type: "object" }, description: "[{id, text}] one per goal in the request" },
        steps: { type: "array", items: { type: "object" }, description: `ops: ${STEP_OPS.join(", ")}` },
        expectations: { type: "array", items: { type: "object" }, description: "[{goal, subject, metric, approx+tol | min | max | equals | in | change}]" },
      },
      required: ["steps"],
    },
  },
  {
    name: "propose",
    description: "Submit the final proposal with its expectations and your report to the player. The app applies it, checks it again and shows the player a before/after. Not accepted if a step fails or a guard breaks. Your report must name every trade-off and every goal not met, with its nearest alternative.",
    input_schema: {
      type: "object",
      properties: {
        request: { type: "string" },
        goals: { type: "array", items: { type: "object" } },
        steps: { type: "array", items: { type: "object" } },
        expectations: { type: "array", items: { type: "object" } },
        report: { type: "string", description: "your plain-language report, at most 1,500 characters" },
      },
      required: ["steps", "report"],
    },
  },
];

// ------------------------------------------------------------------------------------ the tools

export interface ToolCall {
  name: string;
  args: unknown;
  /** JSON text of the result, within RESULT_LIMIT. */
  result: string;
  bytes: number;
  error: boolean;
  ms: number;
}

/** Shrink a result to the limit: cut the longest arrays first, and say so. */
export function fit(value: unknown, limit = RESULT_LIMIT): string {
  let text = JSON.stringify(value);
  if (text.length <= limit) return text;
  const v = JSON.parse(text) as Record<string, unknown>;
  for (let pass = 0; pass < 12 && text.length > limit; pass++) {
    let longest: { holder: Record<string, unknown> | unknown[]; key: string | number; len: number } | null = null;
    const walk = (o: unknown) => {
      if (Array.isArray(o)) {
        o.forEach((x, k) => {
          if (Array.isArray(x) && (!longest || JSON.stringify(x).length > longest.len)) longest = { holder: o, key: k, len: JSON.stringify(x).length };
          walk(x);
        });
      } else if (o && typeof o === "object") {
        for (const [k, x] of Object.entries(o)) {
          if (Array.isArray(x) && (!longest || JSON.stringify(x).length > longest.len)) longest = { holder: o as Record<string, unknown>, key: k, len: JSON.stringify(x).length };
          walk(x);
        }
      }
    };
    walk(v);
    if (!longest) break;
    const l = longest as { holder: Record<string | number, unknown>; key: string | number };
    const arr = l.holder[l.key] as unknown[];
    const keep = Math.max(1, Math.floor(arr.length / 2));
    l.holder[l.key] = arr.slice(0, keep);
    v.truncated = true;
    text = JSON.stringify(v);
  }
  if (text.length > limit) text = JSON.stringify({ error: "the result is too large: narrow the question (a smaller place, a kind, a page)" });
  return text;
}

export class ClaudeTools {
  readonly calls: ToolCall[] = [];
  constructor(
    readonly session: MapSession,
    readonly conv: Conversation,
  ) {}

  summary(): string {
    const s = JSON.stringify(mapSummary(this.session, this.conv));
    return s.length <= SUMMARY_LIMIT ? s : fit(JSON.parse(s), SUMMARY_LIMIT);
  }

  call(name: string, args: unknown): ToolCall {
    const t0 = Date.now();
    let value: unknown;
    let error = false;
    try {
      if (typeof args !== "object" || args === null || Array.isArray(args)) throw new ArgError("arguments must be an object");
      if (JSON.stringify(args).length > 60_000) throw new ArgError("arguments are too large");
      value = this.dispatch(name, args as Record<string, unknown>);
    } catch (e) {
      error = true;
      value = { error: e instanceof ArgError ? e.message : `the tool failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    const result = fit(value);
    const c: ToolCall = { name, args, result, bytes: result.length, error, ms: Date.now() - t0 };
    this.calls.push(c);
    return c;
  }

  private dispatch(name: string, a: Record<string, unknown>): unknown {
    switch (name) {
      case "resolve_region":
        return this.resolveRegion(a);
      case "find_sites":
        return this.findSites(a);
      case "measure":
        return this.measure(a);
      case "list_features":
        return this.listFeatures(a);
      case "limits":
        return this.limits(a);
      case "dry_run":
        return compact(runProposal(this.session, this.conv, proposalOf(a), "dry_run"));
      case "propose": {
        const report = a.report;
        if (typeof report !== "string" || !report.trim()) throw new ArgError("propose needs your report to the player");
        if (report.length > 1500) throw new ArgError("the report is at most 1,500 characters");
        const r = runProposal(this.session, this.conv, { ...proposalOf(a), report }, "propose");
        return compact(r);
      }
      default:
        throw new ArgError(`there is no tool ${name.slice(0, 40)}: use resolve_region, find_sites, measure, list_features, limits, dry_run or propose`);
    }
  }

  private whereArg(a: Record<string, unknown>, required = false): Place | string | undefined {
    const w = a.where;
    if (w === undefined) {
      if (required) throw new ArgError("where is required: a place in words or a place object");
      return undefined;
    }
    if (typeof w === "string") {
      if (w.length > 200) throw new ArgError("where is at most 200 characters");
      return w;
    }
    if (typeof w === "object" && w !== null && !Array.isArray(w) && JSON.stringify(w).length <= 1500) return w as Place;
    throw new ArgError("where is a phrase or a place object of at most 1,500 characters");
  }

  resolveRegion(a: Record<string, unknown>): unknown {
    const where = this.whereArg(a, true)!;
    const v = viewOf(this.session);
    const r = resolve(v, where, refContext(this.conv));
    if (!r.ok)
      return {
        ok: false,
        errors: r.errors,
        reading: r.place,
        ignored: r.ignored,
        hint: "compass: north third, northeast corner, east edge, center · features: near the start, along the river, between the lake and the start · flow: upstream, downstream of the dam, halfway down, near the source, the opposite bank, this valley · terrain: high ground, flat ground",
      };
    const ex = extent(v, r.mask)!;
    // what is there
    const inside = (f: Feature) => {
      const m = measureFeature(this.session, f);
      return r.mask[m.at[1] * v.W + m.at[0]] === 1;
    };
    const kinds: Record<string, string[]> = {};
    for (const f of this.session.features) {
      if (f.kind === "forest" || f.kind === "berryPatch" || f.kind === "ruinField") continue;
      if (!inside(f)) continue;
      const k = f.kind === "setPiece" ? f.params.kind : f.kind;
      (kinds[k] ??= []).push(f.id);
    }
    let trees = 0;
    let bushes = 0;
    let scrap = 0;
    for (const e of v.entities) {
      if (e.x < 0 || e.y < 0 || e.x >= v.W || e.y >= v.H || !r.mask[e.y * v.W + e.x]) continue;
      if (/^(Pine|Birch|Oak|Succulent)$/.test(e.template)) trees++;
      else if (e.template === "BlueberryBush") bushes++;
      else if (e.template.startsWith("RuinColumnH")) scrap += 15 * Number(e.template.slice(11));
    }
    const levels: number[] = [];
    let wet = 0;
    let moist = 0;
    for (let i = 0; i < r.mask.length; i++) {
      if (!r.mask[i]) continue;
      levels.push(v.heights[i]);
      if (v.water[i] > 0.05) wet++;
      else if (v.moisture[i] > 0) moist++;
    }
    levels.sort((p, q) => p - q);
    const d = v.start ? [Math.hypot(ex.bbox[0] - v.start.x, 0), 0] : null;
    void d;
    let nearest = Infinity;
    if (v.start) for (let i = 0; i < r.mask.length; i++) if (r.mask[i]) nearest = Math.min(nearest, Math.hypot((i % v.W) - v.start.x, Math.floor(i / v.W) - v.start.y));
    const net = network(v);
    const courses: Record<string, [number, number]> = {};
    for (let i = 0; i < r.mask.length; i++) {
      if (!r.mask[i] || net.owner[i] < 0) continue;
      const c = net.courses[net.owner[i]];
      const f = c.field.s[i] / c.length;
      const cur = courses[c.name] ?? [1, 0];
      courses[c.name] = [Math.min(cur[0], f), Math.max(cur[1], f)];
    }
    return {
      ok: true,
      reading: r.place,
      assumptions: r.assumptions,
      ...(r.ignored.length ? { ignoredWords: r.ignored } : {}),
      tiles: r.tiles,
      bbox: ex.bbox,
      centroid: ex.centroid,
      where: compassWords(v, ex.centroid[0], ex.centroid[1]),
      alongRivers: Object.fromEntries(Object.entries(courses).map(([k, [a0, a1]]) => [k, `${Math.round(a0 * 100)}–${Math.round(a1 * 100)}% of the way down`])),
      features: kinds,
      resources: { trees, bushes, scrap },
      terrain: { lowest: levels[0], median: levels[levels.length >> 1], highest: levels[levels.length - 1], waterTiles: wet, moistTiles: moist },
      ...(v.start ? { startInside: r.mask[v.start.y * v.W + v.start.x] === 1, nearestToStart: round1(nearest) } : {}),
    };
  }

  findSites(a: Record<string, unknown>): unknown {
    const kind = a.kind as SiteKind;
    if (!SITE_KINDS.includes(kind)) throw new ArgError(`kind must be one of ${SITE_KINDS.join(", ")}`);
    const size = a.size;
    if (size !== undefined && !((typeof size === "number" && size >= 1 && size <= 20000) || ["tiny", "small", "medium", "large", "huge"].includes(String(size)))) throw new ArgError("size is tiny, small, medium, large, huge or a number 1–20,000");
    const request = a.request as PlanRecord | undefined;
    if (request !== undefined && (typeof request !== "object" || request === null || Array.isArray(request) || JSON.stringify(request).length > 600)) throw new ArgError("request is a small object of builder values");
    const away = a.awayFromStart;
    if (away !== undefined && !(typeof away === "number" && away >= 0 && away <= 256)) throw new ArgError("awayFromStart is 0–256 tiles");
    const limit = a.limit;
    if (limit !== undefined && !(Number.isInteger(limit) && Number(limit) >= 1 && Number(limit) <= 5)) throw new ArgError("limit is 1–5");
    hintIds(this.conv);
    const r = findSites(this.session, { kind, where: this.whereArg(a), size: size as SizeWord | number | undefined, request, awayFromStart: away as number | undefined, keepReservoirsClean: a.keepReservoirsClean === true, nearStart: a.nearStart === true, limit: limit as number | undefined }, refContext(this.conv));
    return {
      ok: r.ok,
      kind: r.kind,
      region: { tiles: r.region.tiles, reading: r.region.reading, assumptions: r.region.assumptions, ...(r.region.ignored.length ? { ignoredWords: r.region.ignored } : {}) },
      ...(r.target ? { sizeTarget: r.target } : {}),
      ...(r.constraint ? { constraint: r.constraint } : {}),
      searched: r.searched,
      sites: r.sites.map((x) => ({ rank: x.rank, at: x.at, where: x.where, ...(x.course ? { course: x.course } : {}), measured: x.measured, step: x.step, ...(x.then ? { then: x.then } : {}), report: x.report.slice(0, 4) })),
      ...(r.reason ? { reason: r.reason } : {}),
      ...(r.alternative ? { alternative: { kind: r.alternative.kind, note: r.alternative.note, step: r.alternative.site.step, measured: r.alternative.site.measured } } : {}),
      ...(r.alsoPossible !== undefined ? { alsoPossible: r.alsoPossible ? { note: r.alsoPossible.note, step: r.alsoPossible.site.step } : "the full size fits nowhere on this map" } : {}),
    };
  }

  measure(a: Record<string, unknown>): unknown {
    const v = viewOf(this.session);
    if (a.at !== undefined) {
      const at = a.at;
      if (!Array.isArray(at) || at.length !== 2 || !at.every((n) => Number.isInteger(n))) throw new ArgError("at is a tile [x, y] of whole numbers");
      const [x, y] = at as number[];
      if (x < 0 || y < 0 || x >= v.W || y >= v.H) throw new ArgError(`(${x}, ${y}) is off the ${v.W}×${v.H} map`);
      const i = y * v.W + x;
      const l = locate(network(v), v.W, x, y);
      return { at: [x, y], where: compassWords(v, x, y), level: v.heights[i], water: round1(v.water[i] * 100) / 100, badwater: v.contamination[i] >= 0.05 && v.water[i] > 0.05, moist: v.moisture[i] > 0, onRiver: !!v.channel[i], ...(l ? { course: { river: l.course.name, frac: Math.round(l.frac * 100) / 100, bank: l.side > 0 ? "left bank (facing downstream)" : "right bank (facing downstream)" } } : {}), ...(v.start ? { distanceToStart: round1(Math.hypot(x - v.start.x, y - v.start.y)) } : {}) };
    }
    if (a.between !== undefined) {
      const b = a.between;
      if (!Array.isArray(b) || b.length !== 2) throw new ArgError("between is two things");
      const refs = refContext(this.conv);
      const [p, q] = b.map((r) => resolveRef(v, r as string | [number, number], refs));
      if (typeof p === "string") throw new ArgError(p);
      if (typeof q === "string") throw new ArgError(q);
      const net = network(v);
      const lp = locate(net, v.W, p.anchor[0], p.anchor[1]);
      const lq = lp ? locate(net, v.W, q.anchor[0], q.anchor[1], lp.course) : null;
      let relation = "not on the same river";
      if (lp && lq) relation = `${p.name} is ${Math.abs(lp.s - lq.s) < 3 ? "level with" : lp.s < lq.s ? "upstream of" : "downstream of"} ${q.name} on ${lp.course.name} (${Math.round(Math.abs(lp.s - lq.s))} tiles apart along it), ${lp.side === lq.side ? "on the same bank" : "on opposite banks"}`;
      return { from: { name: p.name, at: p.anchor }, to: { name: q.name, at: q.anchor }, distance: round1(Math.hypot(p.anchor[0] - q.anchor[0], p.anchor[1] - q.anchor[1])), relation };
    }
    const subject = (a.subject as string | undefined) ?? "map";
    if (typeof subject !== "string" || subject.length > 80) throw new ArgError("subject is \"map\", \"start\", a handle or a feature id");
    if (subject === "map") {
      const m = measureSession(this.session);
      const list = (a.metrics as string[] | undefined) ?? Object.keys(MAP_METRICS);
      if (!Array.isArray(list) || list.length > 40) throw new ArgError("metrics is a list of at most 40 names");
      const bad = list.filter((k) => !MAP_METRICS[k]);
      if (bad.length) throw new ArgError(`no metric ${bad.join(", ")}; known: ${Object.keys(MAP_METRICS).join(", ")}`);
      return {
        metrics: Object.fromEntries(list.map((k) => [k, { value: mapMetric(m, k), unit: MAP_METRICS[k].unit, label: MAP_METRICS[k].label }])),
        startRules: startRequirements(m).map((r) => ({ id: r.id, ok: r.ok, value: r.value, limit: r.limit })),
        storedNeed: Math.round(m.rules.reservoirNeed),
        failing: m.report.checks.filter((c) => !c.ok && c.applicable !== false).map((c) => ({ id: c.id, message: c.message, ...(c.advisory ? { advisory: true } : {}) })),
      };
    }
    const t = resolveRef(v, subject, refContext(this.conv));
    if (typeof t === "string") throw new ArgError(t);
    if (!t.id) return { name: t.name, at: t.anchor, where: compassWords(v, t.anchor[0], t.anchor[1]) };
    const f = this.session.features.find((g) => g.id === t.id);
    if (!f) throw new ArgError(`${subject} no longer exists`);
    return measureFeature(this.session, f);
  }

  listFeatures(a: Record<string, unknown>): unknown {
    const offset = a.offset === undefined ? 0 : Number(a.offset);
    const limit = a.limit === undefined ? 20 : Number(a.limit);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new ArgError("offset is a whole number 0–10,000");
    if (!Number.isInteger(limit) || limit < 1 || limit > 40) throw new ArgError("limit is 1–40");
    const kind = a.kind as string | undefined;
    if (kind !== undefined && (typeof kind !== "string" || kind.length > 40)) throw new ArgError("kind is a feature kind");
    const v = viewOf(this.session);
    const where = this.whereArg(a);
    const mask = where !== undefined ? resolve(v, where, refContext(this.conv)) : null;
    if (mask && !mask.ok) throw new ArgError(`where: ${mask.errors.join("; ")}`);
    const handleOf = new Map(Object.entries(this.conv.handles).map(([h, id]) => [id, h]));
    let list = this.session.features.filter((f) => !kind || f.kind === kind || (f.kind === "setPiece" && f.params.kind === kind));
    if (a.origin) list = list.filter((f) => f.origin === a.origin);
    const counts: Record<string, number> = {};
    for (const f of this.session.features) counts[f.kind === "setPiece" ? f.params.kind : f.kind] = (counts[f.kind === "setPiece" ? f.params.kind : f.kind] ?? 0) + 1;
    const rows = [];
    for (const f of list) {
      const m = measureFeature(this.session, f);
      if (mask && !mask.mask[m.at[1] * v.W + m.at[0]]) continue;
      rows.push({ ...(handleOf.has(f.id) ? { handle: handleOf.get(f.id) } : {}), ...m, ...(f.origin !== "generated" ? { origin: f.origin } : {}) });
    }
    return { total: rows.length, offset, counts, features: rows.slice(offset, offset + limit), ...(offset + limit < rows.length ? { next: offset + limit } : {}) };
  }

  limits(a: Record<string, unknown>): unknown {
    const kind = String(a.kind ?? "");
    const s = this.session;
    const { x: W, y: H } = s.size;
    const designedFor = s.spec?.designedFor ?? s.meta.designedFor;
    const words = ["tiny", "small", "medium", "large", "huge"] as const;
    const need = rulesFor(s.spec, designedFor).reservoirNeed;
    const sizes = (k: string, side?: number) => Object.fromEntries(words.map((w) => [w, sizeTarget(k, w, { W, H, designedFor, side, need })]));
    if (kind === "words") {
      const theme = s.spec?.theme;
      if (!s.spec) return { words: [], note: "an imported map has no settings: judgement words cannot change it; use steps on features instead" };
      return { words: JUDGEMENT.map((w) => ({ word: w.word, means: w.means, changes: w.levers.map((l) => l.setting.join(".")), measuredBy: w.targets.map((t) => `${t.metric} ${t.direction}`), ...(theme && w.weakOn?.includes(theme) ? { weakHere: `on a ${theme} map these settings barely move ${w.targets.map((t) => t.metric).join(", ")}: offer a feature instead` } : {}) })), note: "settings apply to the whole map and regenerate it; the player's own features stay" };
    }
    const budget = flowBudget(W, H);
    if (kind === "start") {
      const r = rulesFor(s.spec, designedFor);
      const m = measureSession(s);
      return { startRules: startRequirements(m).map((x) => ({ id: x.id, limit: x.limit, value: x.value, ok: x.ok, message: x.message })), rules: { waterWithin: r.waterWithin, woodWithin20: r.woodWithin20, bushesWithin20: r.bushesWithin20, badwaterWithin: r.badwaterWithin, ruinsWithin: r.ruinsWithin, reachMin: r.reachMin, storedWaterNeed: Math.round(r.reservoirNeed) }, note: "read from the validator: these are the rules the export check applies" };
    }
    if (kind === "waterfall") {
      const facing = (a.facing as Facing | undefined) ?? "north";
      if (!["north", "east", "south", "west"].includes(facing)) throw new ArgError("facing is north, east, south or west");
      const side = facing === "north" || facing === "south" ? W : H;
      return { standalone: standaloneLimits(W, H, facing, 20), onRiver: { drop: { min: 1, max: 15, typical: [3, 8] }, spacing: "at least 12 tiles from the next fall" }, flowBudget: budget, flowNotes: "a lip W wide needs at least 0.025·W blocks/s; an official-looking sheet about 0.4·W, more than the budget allows past about 9 wide on 128²; a standalone fall takes at most the whole budget unless exactFlow", widthWords: sizes("waterfall", side), dropWords: sizes("waterfallDrop"), footprint: "about (W + 4) × 12 tiles plus an outflow route" };
    }
    if (kind === "damSite") return { crest: { min: 1, max: 4, typical: [1, 3] }, basinCap: Math.floor(0.15 * W * H), colonyNeed: Math.round(rulesFor(s.spec, designedFor).reservoirNeed), sizeWords: sizes("damSite"), note: "the upstream bed must sit at crest level or higher, or the water backs up to the edge; find_sites measures each site's reservoir" };
    if (kind === "lake")
      return {
        how: "dig a hollow with a brush step (tool lower, where, size, amount 2 or more), then fill it with addSource (kind water, fillHollow: true, at the same where): the spring stands at the hollow's lowest point and fills it to its rim, then spills over",
        sizeWords: sizes("lake"),
        spring: { min: 0.25, max: 8, unit: "blocks/s" },
        note: "a lake is dug on dry ground, off the water and the start's own area; find_sites kind lake measures each hollow before you dig it",
      };
    if (kind === "landform" || ["hill", "plateau", "ridge", "canyon", "valley", "island", "mountain"].includes(kind)) return { note: "hills, plateaus, ridges, canyons and valleys come from the brushes: use the brush step; its limits:", ...(this.limits({ kind: "brush" }) as object) };
    if (kind === "forest" || kind === "berryPatch" || kind === "ruinField") return { sizeWords: sizes(kind === "berryPatch" ? "forest" : kind), note: kind === "ruinField" ? "ruins stand on dry ground, at least the ruins rule away from the start" : "trees and berries live only on moist soil beside water" };
    if (kind === "river")
      return {
        how: "carve it with a brush step, tool lower, along a path that starts in or beside water, or beside a source (addSource first, for a new river): its bed keeps flowing downhill and the water follows it; or unleash one with the carve step, which finds its own way down and keeps a source at its start (limits kind carve)",
        path: { points: { min: 2, max: 24 }, width: { min: 1, max: 9, words: "tiny 1, small 2, medium 3, large 5, huge 7 tiles" } },
        source: { min: 0.25, max: 8, unit: "blocks/s", note: "a water source's one tile holds 8 at most; past that, add more sources" },
        existing: { flow: { min: 0.1, max: 64 }, note: "a river the map already has is its sources and its land (water is never an object): changeSource {river} sets its sources' strength; the brush reshapes its bed; the map's River flow setting sets the generated river's" },
        flowBudget: budget,
      };
    if (kind === "brush")
      return {
        tools: ["raise", "lower", "flatten", "smooth", "naturalize"],
        amount: { min: 1, max: 8, unit: "levels (raise, lower)" },
        level: { min: 0, max: 16, note: "flatten's level; default the place's middle level" },
        passes: { min: 1, max: 8, note: "smooth and naturalize" },
        maxTiles: Math.floor(0.3 * W * H),
        size: "a round patch of the place near its middle, clear of the start's own area (a lowered one also clear of the water): tiny, small, medium, large, huge (3, 5, 8, 12, 18 tiles across its radius) or a number of tiles across",
        path: "one stroke along 2–24 points instead of a place, size tiles wide (1–9): a lower stroke that starts in or beside water, or beside a source, carves a bed that keeps flowing downhill, and the water follows it",
        edges: "slope (the brushes' own) or cliff (every tile the full amount: beavers need stairs); flatten also ramped (its rim's steps get the game's natural slopes, so beavers walk up)",
        steps: { min: 2, max: 8, note: "flatten in steps: terraces, a bench every so many levels from its level" },
        walkable: "smooth only: true wears steps to one level and puts the game's natural slopes on them, so beavers can walk up",
        edge: "a brush makes no cliffs: its edge slopes a level a tile to the ground round it, so a place rises its full amount only where it is 2·amount − 1 tiles across or more",
        note: "levels stay within 0–16; an imported map's caves and overhangs are left as they are",
      };
    if (kind === "carve")
      return {
        how: "the editor's Carve: unleash a river from a spot (from [x, y], or where: its start is the highest dry ground there) and it finds its own way down, or aim it at an end (to: a tile or a place); it runs until it ends by itself (a lake, the map's edge, its end, or its power spent), or for seconds",
        power: { min: 0, max: 100, words: POWER_WORDS, note: "how deep it cuts and how far it runs: a creek to a catastrophe" },
        width: { min: 2, max: 24, note: "tiles; left out, it follows power (2.8 + power/10): narrow for a slot canyon, wide for a lazy river" },
        wander: { min: 0, max: 100, note: "straight to winding" },
        walls: "steep (a gorge) or wide (broad terraces)",
        river: "keep (the default: a source at its start, its strength following the width, keeps the river flowing) or dry (a dry canyon, no source)",
        defyGravity: "aimed carves only: true cuts through to an end uphill of the start, on a floor that never rises",
        seconds: { min: 0.5, max: 120 },
        path: { min: 0, max: 99, note: "0 the first course; 1, 2, … another path each (the editor's Try another path). Given a where, a course that would break a check passing now tries another path, then the next highest dry ground there" },
        maxTiles: Math.floor(0.3 * W * H),
        note: "the start's own ground and an imported map's caves stay as they are; objects on the cut ground go with it",
      };
    if (kind === "badwaterBasin") return { strength: { min: 1, max: 3 }, keepsFromStart: rulesFor(s.spec, designedFor).badwaterWithin, sizeWords: sizes("badwaterBasin"), note: "a 7×7 basin with one outlet; its channel runs to a river or the map edge" };
    const b = BUILDERS[kind as SetPieceKind];
    if (b) return { ranges: b.limits(planContextOf(s)) };
    throw new ArgError("kind is waterfall, damSite, gorge, terracedCliffs, badwaterBasin, lake, landform, forest, berryPatch, ruinField, river, brush, carve, start or words");
  }
}

export class ArgError extends Error {}

function proposalOf(a: Record<string, unknown>): Proposal {
  const steps = a.steps;
  if (!Array.isArray(steps)) throw new ArgError("steps is a list of steps");
  if (a.goals !== undefined && (!Array.isArray(a.goals) || a.goals.length > 12 || !a.goals.every((g) => typeof g === "object" && g && typeof (g as { id?: unknown }).id === "string" && typeof (g as { text?: unknown }).text === "string"))) throw new ArgError("goals is a list of at most 12 {id, text}");
  if (a.expectations !== undefined && !Array.isArray(a.expectations)) throw new ArgError("expectations is a list");
  if (a.request !== undefined && (typeof a.request !== "string" || a.request.length > 2000)) throw new ArgError("request is the player's words, at most 2,000 characters");
  return { request: a.request as string | undefined, goals: a.goals as Proposal["goals"], steps: steps as Proposal["steps"], expectations: a.expectations as Proposal["expectations"] };
}

/** A proposal result, small enough for a tool result. */
export function compact(r: ProposalResult): Record<string, unknown> {
  return {
    ok: r.ok,
    ...(r.mode === "propose" ? { accepted: r.accepted } : {}),
    ...(r.errors.length ? { errors: r.errors } : {}),
    ...(r.reordered ? { appliedInOrder: r.order.map((o) => o.index) } : {}),
    steps: r.steps.map((s) => ({ index: s.index, op: s.op, ok: s.ok, ...(s.errors.length ? { errors: s.errors } : {}), ...(s.report.length ? { report: s.report.slice(0, 5) } : {}), ...(Object.keys(s.resolved).length ? { resolved: s.resolved } : {}), ...(s.made.length ? { made: s.made.map((m) => m.handle) } : {}), ...(s.alternative ? { alternative: s.alternative } : {}), ...(s.broke.length ? { broke: s.broke } : {}) })),
    expectations: r.expectations.map((e) => ({ goal: e.goal, subject: e.subject, metric: e.metric, pass: e.pass, actual: e.actual, ...(e.why ? { why: e.why } : {}) })),
    guardsBroken: r.guards.broken.map((g) => ({ id: g.id, message: g.message, causedByStep: g.causedBy })),
    startRules: r.guards.startRequirements.filter((g) => !["start.clear", "start.count", "start.flat", "start.entrance"].includes(g.id)),
    tradeoffs: r.tradeoffs.map((t) => t.text),
    tradeoffKinds: [...new Set(r.tradeoffs.map((t) => t.kind))],
    notMet: r.notMet,
    measured: r.measured,
    draftReport: r.draft,
  };
}

export { JUDGEMENT };
