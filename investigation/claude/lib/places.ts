// The place resolver (EDITOR_PLAN §7 "Spatial language"; M9's flow-relative place words, reused by
// M12). The app, not Claude, turns words into tiles, so every request resolves the same way.
//
// A place is a small structured value (`Place`) or a phrase in the player's words, which `parse`
// turns into one and returns alongside the tiles, so Claude sees how its words were read. Every
// phrase part that matches narrows the place (they intersect); words that match nothing are
// listed as ignored, never guessed.
//
// Definitions (north is +y, the top of the top-down view, as the editor's compass):
// - Compass: "the north part" / "north third": the northern third of the map; "north half";
//   "north edge": within 8% of the side (at least 4 tiles); "northeast corner": the east third of
//   the north third; "northeast quarter": the quadrant; "center": the middle third both ways.
//   Non-square maps use the same fractions of each side.
// - Near X: within 20 tiles (the colony's gather radius); "close to" 12; "next to"/"beside" 8.
//   Far from / away from X: 30 or more tiles. Along a river: within its half-width + 6.
//   Between X and Y: the middle 60% of the corridor from X to Y, a quarter of their distance wide
//   (at least 6 tiles each side).
// - Flow-relative, all read from the actual flow (flow.ts):
//   - on a course, arc position from the source: "near the source" 0–0.25, "a third of the way
//     down" 0.25–0.42, "halfway down" 0.4–0.6, "two thirds down" 0.58–0.75, "near the mouth"
//     0.75–1, "the middle reaches" 0.33–0.67;
//   - "upstream"/"downstream" alone: the upper / lower third of the course;
//   - upstream of X: X's course above it (less a margin of the river's width) and every course
//     draining into that stretch; downstream of X: below it and wherever its water goes next;
//     "just" up/downstream: within max(12, 15% of the course) of X along the flow;
//   - banks relative to the flow: "the start's bank" is the side of the river the start is on,
//     "the opposite bank" the other; "left"/"right bank" as seen facing downstream. The channel
//     itself belongs to neither;
//   - "this valley": the selected feature's valley (its river's), otherwise the main river's.
// - Terrain: high ground is the top third of the map's levels; low ground the bottom third; flat
//   ground has its 8 neighbours at its level; dry ground has no standing water.

import { polygonMask } from "../../../src/core/features/geometry";
import type { Feature, Point, RiverFeature } from "../../../src/core/features/schema";
import { distanceFrom, runsToTiles, tilesToRuns, type Runs } from "../../../src/core/math/grid";
import { pointAtArc } from "../../../src/core/features/geometry";
import { downstreamStretches, locate, network, upstreamStretches, type Course, type Network } from "./flow";
import { round1, type MapView } from "./view";
import { naturalDam, naturalFall } from "./natural";

export type Compass = "north" | "south" | "east" | "west" | "northeast" | "northwest" | "southeast" | "southwest" | "center";
export type Part = "third" | "half" | "edge" | "corner" | "quarter";
/** A thing a place is relative to: "start", "main river", a handle, a feature id, "selected",
 *  "last", a kind word ("lake", "dam site"), or a tile [x, y]. */
export type Ref = string | [number, number];

export type Place =
  | { compass: Compass; part?: Part }
  | { near: Ref; within?: number }
  | { far: Ref; beyond?: number }
  /** Tiles nearer to `closer` than `than` (default: the start) is now, by at least `by` tiles. */
  | { closer: Ref; than?: Ref; by?: number }
  | { along: Ref; within?: number }
  | { between: [Ref, Ref]; width?: number }
  | { upstream: Ref | null; river?: Ref; reach?: "just" | "far" | "any" }
  | { downstream: Ref | null; river?: Ref; reach?: "just" | "far" | "any" }
  | { course: [number, number]; river?: Ref }
  | { bank: "same" | "opposite" | "left" | "right"; of?: Ref; river?: Ref }
  | { valley: Ref | null }
  | { terrain: "high" | "low" | "flat" | "dry" }
  | { rect: [number, number, number, number] }
  | { all: Place[] }
  | { any: Place[] }
  | { not: Place };

/** What the conversation knows: names Claude gave to what it made, the selected feature, the last
 *  feature made. */
export interface RefContext {
  handles?: Record<string, string>;
  selected?: string | null;
  last?: string | null;
  /** What kind words ("the lake", "the dam site") meant the first time they were read in this
   *  conversation, so "the lake" stays the same lake after the start moves. */
  aliases?: Record<string, string>;
}

export interface Resolved {
  ok: boolean;
  mask: Uint8Array;
  tiles: number;
  /** The structured place that was resolved (the phrase's reading). */
  place: Place | null;
  assumptions: string[];
  errors: string[];
  /** Words of the phrase that matched nothing. */
  ignored: string[];
}

// ------------------------------------------------------------------------------------ references

export interface RefTarget {
  /** A plain name for reports. */
  name: string;
  id?: string;
  feature?: Feature;
  course?: Course;
  /** A representative tile. */
  anchor: [number, number];
  /** The tiles it covers (for distances), when larger than a point. */
  mask?: Uint8Array;
}

const KIND_WORDS: [RegExp, (f: Feature) => boolean, string][] = [
  [/^(the )?(start|starting (location|point)|district cent(er|re)|base|colony|town)$/, (f) => f.kind === "start", "the start"],
  [/^(the )?(dam|dam site|dam opportunity|reservoir site|narrows)$/, (f) => f.kind === "setPiece" && f.params.kind === "damSite", "the dam site"],
  [/^(the )?(waterfall|falls|fall|cascade)$/, (f) => f.kind === "setPiece" && f.params.kind === "waterfall", "the waterfall"],
  [/^(the )?(badwater|badwater (spring|basin|source|route|pool))$/, (f) => (f.kind === "setPiece" && f.params.kind === "badwaterBasin") || (f.kind === "river" && f.params.badwater), "the badwater"],
  [/^(the )?gorge$/, (f) => f.kind === "setPiece" && f.params.kind === "gorge", "the gorge"],
  [/^(the )?(terraced )?cliffs?$/, (f) => f.kind === "setPiece" && f.params.kind === "terracedCliffs", "the terraced cliffs"],
  [/^(the )?(lake|pond)$/, (f) => f.kind === "lake" && !f.params.planned, "the lake"],
  [/^(the )?reservoir$/, (f) => f.kind === "lake", "the reservoir"],
  [/^(the )?(forest|woods|trees|grove)$/, (f) => f.kind === "forest", "the forest"],
  [/^(the )?(ruins?|ruin field|scrap)$/, (f) => f.kind === "ruinField", "the ruins"],
  [/^(the )?(berries|berry patch|bushes|blueberries)$/, (f) => f.kind === "berryPatch", "the berries"],
  [/^(the )?(plateau|hill|ridge|canyon|island|mountain)$/, (f) => f.kind === "landform" && !!f.params.outline, "the landform"],
];

function featureAnchor(v: MapView, f: Feature): [number, number] {
  const r2 = (p: readonly number[]): [number, number] => [Math.round(p[0]), Math.round(p[1])];
  switch (f.kind) {
    case "start":
      return r2(f.params.position);
    case "river":
      return r2(pointAtArc(f.params.path, 0.5 * pathLen(f.params.path)).p);
    case "lake":
      return r2(centroid(f.params.outline));
    case "landform":
      if (f.params.outline) return r2(centroid(f.params.outline));
      if (f.params.along) {
        const r = v.features.find((g): g is RiverFeature => g.kind === "river" && g.id === f.params.along!.river);
        if (r) return r2(pointAtArc(r.params.path, 0.5 * pathLen(r.params.path)).p);
      }
      return [v.W >> 1, v.H >> 1];
    case "setPiece": {
      const p = f.params.plan;
      const river = typeof p.river === "string" ? v.features.find((g): g is RiverFeature => g.kind === "river" && g.id === p.river) : undefined;
      if (Array.isArray(p.lip)) return r2(p.lip as number[]);
      if (Array.isArray(p.at) && (p.at as number[]).length === 2) return r2(p.at as number[]);
      if (typeof p.x === "number" && typeof p.y === "number") return [Number(p.x) + 1, Number(p.y) + 1];
      if (river && typeof p.at === "number") return r2(pointAtArc(river.params.path, p.at).p);
      if (river && typeof p.from === "number") return r2(pointAtArc(river.params.path, (Number(p.from) + Number(p.to)) / 2).p);
      return [v.W >> 1, v.H >> 1];
    }
    case "forest":
    case "berryPatch":
    case "ruinField": {
      const tiles = runsToTiles(f.params.area, v.W);
      let sx = 0;
      let sy = 0;
      for (const i of tiles) {
        sx += i % v.W;
        sy += Math.floor(i / v.W);
      }
      return tiles.length ? [Math.round(sx / tiles.length), Math.round(sy / tiles.length)] : [0, 0];
    }
    default:
      return [v.W >> 1, v.H >> 1];
  }
}

function pathLen(p: readonly Point[]): number {
  let l = 0;
  for (let i = 0; i + 1 < p.length; i++) l += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
  return l;
}

function centroid(poly: readonly Point[]): [number, number] {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

/** The tiles a feature covers, for distances ("near the lake" is near any of its tiles). */
function featureMask(v: MapView, f: Feature): Uint8Array | undefined {
  if (f.kind === "lake") return polygonMask(f.params.outline, v.W, v.H);
  if (f.kind === "landform" && f.params.outline) return polygonMask(f.params.outline, v.W, v.H);
  if (f.kind === "forest" || f.kind === "berryPatch" || f.kind === "ruinField") {
    const m = new Uint8Array(v.W * v.H);
    for (const i of runsToTiles(f.params.area, v.W)) if (i >= 0 && i < m.length) m[i] = 1;
    return m;
  }
  if (f.kind === "setPiece" && f.params.kind === "badwaterBasin") {
    const m = new Uint8Array(v.W * v.H);
    const [cx, cy] = featureAnchor(v, f);
    for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) if (x >= 0 && y >= 0 && x < v.W && y < v.H) m[y * v.W + x] = 1;
    return m;
  }
  return undefined;
}

/** Resolve a reference to a thing on the map. */
export function resolveRef(v: MapView, ref: Ref, ctx: RefContext = {}, assumptions: string[] = []): RefTarget | string {
  const net = network(v);
  if (Array.isArray(ref)) {
    const [x, y] = ref;
    if (!(Number.isFinite(x) && Number.isFinite(y)) || x < 0 || y < 0 || x >= v.W || y >= v.H) return `(${x}, ${y}) is not on the ${v.W}×${v.H} map`;
    return { name: `(${Math.round(x)}, ${Math.round(y)})`, anchor: [Math.round(x), Math.round(y)] };
  }
  const word = ref.trim().toLowerCase().replace(/\s+/g, " ");
  const asFeature = (f: Feature, name: string): RefTarget => {
    const course = f.kind === "river" ? net.byId.get(f.id) : undefined;
    return { name, id: f.id, feature: f, course, anchor: featureAnchor(v, f), mask: course ? courseMask(v, course) : featureMask(v, f) };
  };
  const byId = (id: string) => v.features.find((f) => f.id === id);
  if (/^(it|this|that|the selected( feature)?|selected|this one)$/.test(word)) {
    const id = ctx.selected ?? ctx.last;
    const f = id ? byId(id) : undefined;
    if (!f) return `"${ref}" needs a selected feature or something made earlier in this conversation`;
    return asFeature(f, ctx.selected ? "the selected feature" : "what was made last");
  }
  if (/^(last|the last one)$/.test(word)) {
    const f = ctx.last ? byId(ctx.last) : undefined;
    return f ? asFeature(f, "what was made last") : "nothing was made earlier in this conversation";
  }
  if (ctx.handles && ref in ctx.handles) {
    const f = byId(ctx.handles[ref]);
    return f ? asFeature(f, ref) : `${ref} no longer exists (it was deleted or undone)`;
  }
  const direct = byId(ref);
  if (direct) return asFeature(direct, direct.kind === "river" ? (net.byId.get(direct.id)?.name ?? direct.id) : direct.id);
  if (/^(the )?(main )?(river|stream|valley river|this river)$/.test(word)) {
    if (!net.main) return "this map has no river the app knows (imported maps have no features yet)";
    return { name: net.main.name, id: net.main.id, course: net.main, anchor: courseAnchor(net.main), mask: courseMask(v, net.main) };
  }
  const trib = /^(the )?(north|south|east|west) (tributary|river|inflow)$/.exec(word);
  if (trib) {
    const c = net.courses.find((k) => !k.main && k.source.edge === trib[2]);
    if (!c) return `there is no river from the ${trib[2]} edge`;
    return { name: c.name, id: c.id, course: c, anchor: courseAnchor(c), mask: courseMask(v, c) };
  }
  const remembered = ctx.aliases?.[word.replace(/^the /, "")];
  if (remembered) {
    const f = byId(remembered);
    if (f) return f.kind === "river" && net.byId.get(f.id) ? { name: net.byId.get(f.id)!.name, id: f.id, course: net.byId.get(f.id), anchor: courseAnchor(net.byId.get(f.id)!), mask: courseMask(v, net.byId.get(f.id)!) } : asFeature(f, `the ${word.replace(/^the /, "")}`);
  }
  for (const [re, test, name] of KIND_WORDS) {
    if (!re.test(word)) continue;
    // an imported map has its StartingLocation but no start feature
    if (name === "the start" && !v.features.some(test) && v.start) return { name: "the start", anchor: [v.start.x, v.start.y] };
    let all = v.features.filter(test);
    if (!all.length) {
      // M9a: falls emerge on the rivers and dam opportunities are the land's own (D111)
      const natural = name === "the waterfall" ? naturalFall(v, net, word) : name === "the dam site" ? naturalDam(v, net) : null;
      if (natural) {
        assumptions.push(`"${ref}" read as ${natural.name}: the map's own, as the land made it`);
        return { name: natural.name, anchor: natural.anchor, ...(natural.course ? { course: natural.course } : {}) };
      }
      return `there is no ${name.replace(/^the /, "")} on this map`;
    }
    // River Valley names its falls: "the cascade" is the upper fall, "the falls" the lower one
    const named = /cascade/.test(word) ? all.filter((f) => f.role?.endsWith("/cascade")) : /falls$/.test(word) ? all.filter((f) => f.role?.endsWith("/falls")) : [];
    if (named.length) all = named;
    // prefer what this conversation made, then the player's own, then the one nearest the start
    const made = new Set(Object.values(ctx.handles ?? {}));
    const start = v.start;
    const score = (f: Feature) => (made.has(f.id) ? 0 : f.origin !== "generated" ? 1 : 2) * 1e6 + (start ? Math.hypot(featureAnchor(v, f)[0] - start.x, featureAnchor(v, f)[1] - start.y) : 0);
    all.sort((a, b) => score(a) - score(b));
    if (all.length > 1) {
      const a = featureAnchor(v, all[0]);
      const d = start ? Math.round(Math.hypot(a[0] - start.x, a[1] - start.y)) : null;
      assumptions.push(`"${ref}" read as the one in the ${compassWords(v, a[0], a[1])}${d !== null ? `, ${d} tiles from the start` : ""} (${all[0].id}): ${made.has(all[0].id) ? "the one made in this conversation" : "the one nearest the start"}, of ${all.length}`);
    }
    const f = all[0];
    if (ctx.aliases && !/start/.test(word)) ctx.aliases[word.replace(/^the /, "")] = f.id;
    if (f.kind === "river") {
      const c = net.byId.get(f.id)!;
      return { name: c.name, id: c.id, course: c, anchor: courseAnchor(c), mask: courseMask(v, c) };
    }
    return asFeature(f, name);
  }
  return `"${ref}" names nothing on this map (try "start", "main river", a feature id or a name given earlier)`;
}

function courseAnchor(c: Course): [number, number] {
  const p = pointAtArc(c.path, c.length / 2).p;
  return [Math.round(p[0]), Math.round(p[1])];
}

function courseMask(v: MapView, c: Course): Uint8Array {
  const m = new Uint8Array(v.W * v.H);
  const half = c.width / 2;
  for (let i = 0; i < m.length; i++) if (c.field.d[i] < Math.max(1, half)) m[i] = 1;
  return m;
}

// ------------------------------------------------------------------------------------ resolving

const NEAR = 20;
const FAR = 30;

function empty(v: MapView): Uint8Array {
  return new Uint8Array(v.W * v.H);
}

function count(m: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < m.length; i++) n += m[i];
  return n;
}

function distanceTo(v: MapView, t: RefTarget): Float64Array {
  const m = t.mask ?? empty(v);
  if (!t.mask) m[t.anchor[1] * v.W + t.anchor[0]] = 1;
  return distanceFrom(m, v.W, v.H);
}

/** The course a flow-relative place is on: the one named, else the one the reference lies on,
 *  else this valley's. */
function courseFor(v: MapView, net: Network, river: Ref | undefined, at: RefTarget | null, ctx: RefContext, assumptions: string[]): Course | string {
  if (river !== undefined) {
    const t = resolveRef(v, river, ctx, assumptions);
    if (typeof t === "string") return t;
    if (!t.course) return `${t.name} is not a river`;
    return t.course;
  }
  if (at?.course) return at.course;
  if (at) {
    const l = locate(net, v.W, at.anchor[0], at.anchor[1]);
    if (l) return l.course;
  }
  return valleyCourse(v, net, ctx, assumptions);
}

/** "This valley": the selected feature's river, otherwise the main river. */
function valleyCourse(v: MapView, net: Network, ctx: RefContext, assumptions: string[]): Course | string {
  if (ctx.selected) {
    const f = v.features.find((g) => g.id === ctx.selected);
    if (f?.kind === "river") {
      const c = net.byId.get(f.id);
      if (!c) return "the selected river is gone";
      assumptions.push(`"this valley" read as the valley of ${c.name}, the selected river (it flows ${c.heading})`);
      return c;
    }
    if (f) {
      const a = featureAnchor(v, f);
      const l = locate(net, v.W, a[0], a[1]);
      if (l) {
        assumptions.push(`"this valley" read as the valley of ${l.course.name}, where the selected feature lies`);
        return l.course;
      }
    }
  }
  if (!net.main) return "this map has no river the app knows (imported maps have no features yet)";
  if (net.courses.length > 1) assumptions.push(`read along ${net.main.name} (it flows ${net.main.heading}), the map's main river`);
  return net.main;
}

function stretchMask(v: MapView, net: Network, parts: [Course, number, number][]): Uint8Array {
  const m = empty(v);
  const index = new Map(net.courses.map((c, k) => [c, k]));
  for (const [c, from, to] of parts) {
    const k = index.get(c)!;
    for (let i = 0; i < m.length; i++) if (net.owner[i] === k && c.field.s[i] >= from && c.field.s[i] <= to) m[i] = 1;
  }
  return m;
}

export function resolvePlace(v: MapView, place: Place, ctx: RefContext = {}, assumptions: string[] = []): { mask: Uint8Array; errors: string[] } {
  const { W, H } = v;
  const N = W * H;
  const net = network(v);
  const errors: string[] = [];
  const m = empty(v);
  const fail = (e: string) => {
    errors.push(e);
    return { mask: m, errors };
  };
  const p = place as Record<string, unknown>;
  if ("all" in p) {
    const list = p.all as Place[];
    if (!Array.isArray(list) || !list.length) return fail("all needs a list of places");
    m.fill(1);
    for (const q of list) {
      const r = resolvePlace(v, q, ctx, assumptions);
      errors.push(...r.errors);
      for (let i = 0; i < N; i++) m[i] &= r.mask[i];
    }
    return { mask: m, errors };
  }
  if ("any" in p) {
    for (const q of p.any as Place[]) {
      const r = resolvePlace(v, q, ctx, assumptions);
      errors.push(...r.errors);
      for (let i = 0; i < N; i++) m[i] |= r.mask[i];
    }
    return { mask: m, errors };
  }
  if ("not" in p) {
    const r = resolvePlace(v, p.not as Place, ctx, assumptions);
    for (let i = 0; i < N; i++) m[i] = r.mask[i] ? 0 : 1;
    return { mask: m, errors: r.errors };
  }
  if ("rect" in p) {
    const [x0, y0, x1, y1] = p.rect as number[];
    for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(H - 1, Math.max(y0, y1)); y++)
      for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(W - 1, Math.max(x0, x1)); x++) m[y * W + x] = 1;
    return { mask: m, errors };
  }
  if ("compass" in p) {
    const c = p.compass as Compass;
    const part = (p.part as Part | undefined) ?? (c.length > 5 && c !== "center" ? "corner" : "third");
    const edge = (side: number) => Math.max(4, Math.round(0.08 * side));
    const test = (x: number, y: number, dir: string, pt: Part): boolean => {
      const f = pt === "half" ? 1 / 2 : pt === "quarter" ? 1 / 2 : 1 / 3;
      switch (dir) {
        case "north":
          return pt === "edge" ? y >= H - edge(H) : y >= H * (1 - f) - 0.5;
        case "south":
          return pt === "edge" ? y < edge(H) : y < H * f - 0.5;
        case "east":
          return pt === "edge" ? x >= W - edge(W) : x >= W * (1 - f) - 0.5;
        case "west":
          return pt === "edge" ? x < edge(W) : x < W * f - 0.5;
        default:
          return false;
      }
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let ok: boolean;
        if (c === "center") ok = x >= W / 3 - 0.5 && x < (2 * W) / 3 - 0.5 && y >= H / 3 - 0.5 && y < (2 * H) / 3 - 0.5;
        else if (c.length > 5) {
          const ns = c.startsWith("north") ? "north" : "south";
          const ew = c.endsWith("east") ? "east" : "west";
          const pt = part === "edge" ? "edge" : part === "quarter" || part === "half" ? "quarter" : "third";
          ok = test(x, y, ns, pt) && test(x, y, ew, pt);
        } else ok = test(x, y, c, part === "corner" ? "third" : part);
        if (ok) m[y * W + x] = 1;
      }
    return { mask: m, errors };
  }
  if ("near" in p || "far" in p || "along" in p) {
    const ref = (p.near ?? p.far ?? p.along) as Ref;
    const t = resolveRef(v, ref, ctx, assumptions);
    if (typeof t === "string") return fail(t);
    const d = distanceTo(v, t);
    if ("near" in p) {
      const r = Number(p.within ?? NEAR);
      for (let i = 0; i < N; i++) if (d[i] <= r) m[i] = 1;
    } else if ("far" in p) {
      const r = Number(p.beyond ?? FAR);
      for (let i = 0; i < N; i++) if (d[i] >= r) m[i] = 1;
    } else {
      if (!t.course) return fail(`"along" needs a river; ${t.name} is not one`);
      const r = Number(p.within ?? t.course.width / 2 + 6);
      for (let i = 0; i < N; i++) if (t.course.field.d[i] <= r) m[i] = 1;
    }
    return { mask: m, errors };
  }
  if ("closer" in p) {
    const t = resolveRef(v, p.closer as Ref, ctx, assumptions);
    if (typeof t === "string") return fail(t);
    const than = resolveRef(v, (p.than as Ref | undefined) ?? "start", ctx, assumptions);
    if (typeof than === "string") return fail(than);
    const d = distanceTo(v, t);
    const now = d[than.anchor[1] * W + than.anchor[0]];
    const by = Number(p.by ?? 3);
    for (let i = 0; i < N; i++) if (d[i] <= now - by) m[i] = 1;
    assumptions.push(`"closer to ${t.name}" read as nearer to it than ${than.name} is now (${Math.round(now)} tiles), by at least ${by}`);
    return { mask: m, errors };
  }
  if ("between" in p) {
    const [ra, rb] = p.between as [Ref, Ref];
    const a = resolveRef(v, ra, ctx, assumptions);
    const b = resolveRef(v, rb, ctx, assumptions);
    if (typeof a === "string") return fail(a);
    if (typeof b === "string") return fail(b);
    const [ax, ay] = a.anchor;
    const [bx, by] = b.anchor;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 4) return fail(`${a.name} and ${b.name} are too close together for anything between them`);
    const half = Number(p.width ?? Math.max(6, 0.25 * len));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len);
        if (t < 0.2 || t > 0.8) continue;
        const px = ax + t * (bx - ax);
        const py = ay + t * (by - ay);
        if (Math.hypot(x - px, y - py) <= half) m[y * W + x] = 1;
      }
    return { mask: m, errors };
  }
  if ("upstream" in p || "downstream" in p) {
    const up = "upstream" in p;
    const ref = (up ? p.upstream : p.downstream) as Ref | null;
    const reach = (p.reach as string | undefined) ?? "any";
    const at = ref === null || ref === undefined ? null : resolveRef(v, ref, ctx, assumptions);
    if (typeof at === "string") return fail(at);
    const c = courseFor(v, net, p.river as Ref | undefined, at, ctx, assumptions);
    if (typeof c === "string") return fail(c);
    if (!at) {
      // alone: the upper or lower third of the course
      const [from, to] = up ? [0, c.length / 3] : [(2 * c.length) / 3, c.length];
      assumptions.push(`"${up ? "upstream" : "downstream"}" read as the ${up ? "upper" : "lower"} third of ${c.name}'s course (it flows ${c.heading}, read from its ${c.evidence === "water" ? "water surface" : c.evidence === "bed" ? "bed" : "feature"})`);
      return { mask: stretchMask(v, net, [[c, from, to]]), errors };
    }
    // a river named as the reference on another river: where it joins (or leaves) that river
    let anchor = at.anchor;
    if (at.course && at.course !== c) {
      const k = at.course;
      anchor = k.outlet.kind === "river" && k.outlet.river === c.id ? [Math.round(k.path[k.path.length - 1][0]), Math.round(k.path[k.path.length - 1][1])] : [Math.round(k.path[0][0]), Math.round(k.path[0][1])];
      assumptions.push(`${at.name} read as the place where it meets ${c.name}`);
    }
    const l = locate(net, W, Math.min(W - 1, Math.max(0, anchor[0])), Math.min(H - 1, Math.max(0, anchor[1])), c);
    if (!l) return fail(`${at.name} is not near ${c.name}`);
    const margin = Math.max(3, c.width);
    const just = Math.max(12, 0.15 * c.length);
    let parts: [Course, number, number][];
    if (up) {
      const to = l.s - margin;
      if (to <= 0) return fail(`${at.name} is at the top of ${c.name}: nothing is upstream of it on this river`);
      const from = reach === "just" ? Math.max(0, to - just) : 0;
      parts = reach === "just" ? [[c, from, to]] : upstreamStretches(net, c, to);
      if (reach === "far") parts = [[c, 0, Math.max(0, l.s / 2)], ...parts.slice(1)];
    } else {
      const from = l.s + margin;
      if (from >= c.length) return fail(`${at.name} is at the mouth of ${c.name}: nothing is downstream of it on this river`);
      const to = reach === "just" ? Math.min(c.length, from + just) : c.length;
      parts = reach === "just" ? [[c, from, to]] : downstreamStretches(net, c, from);
      if (reach === "far") parts = [[c, (l.s + c.length) / 2, c.length], ...parts.slice(1)];
    }
    assumptions.push(`${up ? "upstream" : "downstream"} of ${at.name} read along ${c.name}, which flows ${c.heading}`);
    return { mask: stretchMask(v, net, parts), errors };
  }
  if ("course" in p) {
    const [f0, f1] = p.course as [number, number];
    if (!(f0 >= 0 && f1 <= 1 && f0 < f1)) return fail("course fractions run from 0 (the source) to 1 (the mouth), low to high");
    const c = courseFor(v, net, p.river as Ref | undefined, null, ctx, assumptions);
    if (typeof c === "string") return fail(c);
    return { mask: stretchMask(v, net, [[c, f0 * c.length, f1 * c.length]]), errors };
  }
  if ("bank" in p) {
    const which = p.bank as string;
    const c0 = p.river !== undefined ? courseFor(v, net, p.river as Ref, null, ctx, assumptions) : null;
    if (typeof c0 === "string") return fail(c0);
    let side: number;
    let c: Course;
    if (which === "left" || which === "right") {
      c = c0 ?? (valleyCourse(v, net, ctx, assumptions) as Course);
      if (typeof c === "string") return fail(c);
      side = which === "left" ? 1 : -1;
      assumptions.push(`the ${which} bank as seen facing downstream on ${c.name} (it flows ${c.heading})`);
    } else {
      const of = resolveRef(v, (p.of as Ref | undefined) ?? "start", ctx, assumptions);
      if (typeof of === "string") return fail(of);
      const cc = c0 ?? courseFor(v, net, undefined, of, ctx, assumptions);
      if (typeof cc === "string") return fail(cc);
      c = cc;
      const l = locate(net, W, of.anchor[0], of.anchor[1], c)!;
      side = which === "same" ? l.side : -l.side;
      assumptions.push(`the ${which === "same" ? `bank ${of.name} is on` : `bank opposite ${of.name}`} of ${c.name}`);
    }
    const k = net.courses.indexOf(c);
    const half = c.width / 2;
    for (let i = 0; i < N; i++) if (net.owner[i] === k && c.field.side[i] === side && c.field.d[i] >= half) m[i] = 1;
    return { mask: m, errors };
  }
  if ("valley" in p) {
    const ref = p.valley as Ref | null;
    let c: Course | string;
    if (ref === null || ref === undefined) c = valleyCourse(v, net, ctx, assumptions);
    else {
      const t = resolveRef(v, ref, ctx, assumptions);
      if (typeof t === "string") return fail(t);
      c = courseFor(v, net, undefined, t, ctx, assumptions);
    }
    if (typeof c === "string") return fail(c);
    const k = net.courses.indexOf(c);
    for (let i = 0; i < N; i++) if (net.owner[i] === k) m[i] = 1;
    return { mask: m, errors };
  }
  if ("terrain" in p) {
    const kind = p.terrain as string;
    const sorted = Array.from(v.heights).sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length / 3)];
    const hi = sorted[Math.floor((2 * sorted.length) / 3)];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const h = v.heights[i];
        const dry = !(v.water[i] > 0.05) && !v.channel[i];
        let ok = false;
        if (kind === "high") ok = h > hi || (h === hi && hi > lo);
        else if (kind === "low") ok = h <= lo;
        else if (kind === "dry") ok = dry;
        else if (kind === "flat") {
          ok = dry;
          for (let dy = -1; dy <= 1 && ok; dy++)
            for (let dx = -1; dx <= 1 && ok; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= W || yy >= H || v.heights[yy * W + xx] !== h) ok = false;
            }
        }
        if (ok) m[i] = 1;
      }
    return { mask: m, errors };
  }
  return fail(`unknown place ${JSON.stringify(place).slice(0, 80)}`);
}

// ------------------------------------------------------------------------------------ phrases

const REF_WORDS =
  "start|starting location|district cent(?:er|re)|base|colony|main river|river|stream|lake|pond|reservoir|dam site|dam|waterfall|falls|cascade|badwater spring|badwater basin|badwater|gorge|terraced cliffs|cliffs|forest|woods|trees|ruin field|ruins|berry patch|berries|plateau|hill|ridge|selected feature|(?:north|south|east|west) (?:tributary|inflow)|[a-z]+-\\d+|f-[a-z2-7]{13}|it|this|that";
const REF = `(?:the |this |that |our |my )?(${REF_WORDS})(?:'s)?`;

interface Rule {
  re: RegExp;
  make: (m: RegExpExecArray) => Place | null;
}

const COMPASS: Record<string, Compass> = {
  north: "north", northern: "north", top: "north",
  south: "south", southern: "south", bottom: "south",
  east: "east", eastern: "east", right: "east",
  west: "west", western: "west", left: "west",
  northeast: "northeast", northeastern: "northeast", "north-east": "northeast", "north east": "northeast", "top right": "northeast",
  northwest: "northwest", northwestern: "northwest", "north-west": "northwest", "north west": "northwest", "top left": "northwest",
  southeast: "southeast", southeastern: "southeast", "south-east": "southeast", "south east": "southeast", "bottom right": "southeast",
  southwest: "southwest", southwestern: "southwest", "south-west": "southwest", "south west": "southwest", "bottom left": "southwest",
};
const COMPASS_WORDS = Object.keys(COMPASS).sort((a, b) => b.length - a.length).join("|");

function refOf(word: string): Ref {
  const w = word.trim();
  const xy = /^\(?(\d+)\s*,\s*(\d+)\)?$/.exec(w);
  if (xy) return [Number(xy[1]), Number(xy[2])];
  return w;
}

/** A stretch of a river's course, of the main river or of a named one: "halfway down the north
 *  tributary", "near the mouth of the inflow from the east", "a third of the way down this valley". */
const COURSE_OF = "(?: (?:of|down|along|up|on))?(?: (?:the|this|that))? ((?:north|south|east|west) (?:tributary|inflow|creek|river|stream)|main river|river|valley|course|stream|creek)";
function courseRule(head: RegExp, band: [number, number]): Rule {
  return {
    re: new RegExp(`${head.source}(?:${COURSE_OF})?`),
    make: (m) => {
      const w = m[1];
      if (!w || /^(river|valley|course|stream|creek)$/.test(w)) return { course: band };
      return { course: band, river: w === "main river" ? w : w.replace(/ (creek|river|stream)$/, " tributary") };
    },
  };
}

const RULES: Rule[] = [
  { re: new RegExp(`between ${REF} and ${REF}`), make: (m) => ({ between: [refOf(m[1]), refOf(m[2])] }) },
  { re: new RegExp(`(just |right |a (?:little|bit) |far |well )?(upstream|downstream|upriver|downriver|up river|down river)(?: (?:of|from) ${REF})?`), make: (m) => {
      const up = /up/.test(m[2]);
      const reach = m[1] ? (/far|well/.test(m[1]) ? "far" : "just") : "any";
      const ref = m[3] ? refOf(m[3]) : null;
      return up ? { upstream: ref, reach } : { downstream: ref, reach };
    } },
  { re: new RegExp(`(just )?(above|below) ${REF}`), make: (m) => {
      if (!/dam|falls|waterfall|cascade|lake|reservoir|gorge|pond/.test(m[3])) return null;
      const reach = m[1] ? "just" : "any";
      return m[2] === "above" ? { upstream: refOf(m[3]), reach } : { downstream: refOf(m[3]), reach };
    } },
  courseRule(/(?:half ?way|midway|mid-way|in the middle of the (?:river|valley|course))(?: (?:down|along|up))?/, [0.4, 0.6]),
  courseRule(/(?:a|one) third of the way(?: (?:down|along))?/, [0.25, 0.42]),
  courseRule(/two[- ]thirds of the way(?: (?:down|along))?/, [0.58, 0.75]),
  courseRule(/(?:near |at |by )?(?:the )?(?:source|headwaters|head of the (?:valley|river)|upper (?:reaches|valley|river|end)|top of the (?:valley|river))/, [0, 0.25]),
  courseRule(/(?:near |at |by )?(?:the )?(?:mouth|lower (?:reaches|valley|river|end)|bottom of the (?:valley|river)|end of the (?:river|valley)|where the river leaves)/, [0.75, 1]),
  courseRule(/(?:the )?middle reaches/, [0.33, 0.67]),
  { re: new RegExp(`(?:on |along )?(?:the )?(?:opposite|other|far) (?:bank|side)(?: of the (?:river|valley|stream))?(?: from ${REF})?`), make: (m) => ({ bank: "opposite", ...(m[1] ? { of: refOf(m[1]) } : {}) }) },
  { re: new RegExp(`across the (?:river|stream|water)(?: from ${REF})?`), make: (m) => ({ bank: "opposite", ...(m[1] ? { of: refOf(m[1]) } : {}) }) },
  { re: new RegExp(`(?:on )?(?:the )?(?:same|this|near|home) (?:bank|side)(?: (?:as|of) ${REF})?`), make: (m) => ({ bank: "same", ...(m[1] ? { of: refOf(m[1]) } : {}) }) },
  { re: /(?:on )?(?:the )?(?:start's|starting|colony's) (?:bank|side)/, make: () => ({ bank: "same", of: "start" }) },
  { re: /(?:on )?(?:the )?(left|right) bank/, make: (m) => ({ bank: m[1] as "left" | "right" }) },
  { re: new RegExp(`(?:in |of )?(?:this|the|our) valley|${REF} valley`), make: (m) => ({ valley: m[1] ? refOf(m[1]) : null }) },
  { re: new RegExp(`(next to|beside|right by|alongside|adjacent to) ${REF}`), make: (m) => ({ near: refOf(m[2]), within: 8 }) },
  { re: new RegExp(`(?:closer|nearer) to ${REF}`), make: (m) => ({ closer: refOf(m[1]) }) },
  { re: new RegExp(`(close to|near to) ${REF}`), make: (m) => ({ near: refOf(m[2]), within: 12 }) },
  { re: new RegExp(`(far from|away from|well away from|not near|distant from|far away from) ${REF}`), make: (m) => ({ far: refOf(m[2]), beyond: /far|well|distant/.test(m[1]) ? 40 : 30 }) },
  { re: new RegExp(`(?:along|by|beside) (?:the (?:banks? of the )?)?(river|stream|main river|(?:north|south|east|west) (?:tributary|inflow))`), make: (m) => ({ along: m[1] === "stream" ? "river" : m[1] }) },
  { re: new RegExp(`(near|around|by|at) ${REF}`), make: (m) => (m[2] === "this" || m[2] === "that" ? null : { near: refOf(m[2]) }) },
  { re: /(?:near |at |around )?\(?(\d{1,3})\s*,\s*(\d{1,3})\)?/, make: (m) => ({ near: [Number(m[1]), Number(m[2])], within: 6 }) },
  { re: /(?:on |in )?(?:the )?(?:high ground|highlands|uplands|heights|plateaus?|hilltops?|mountains?)/, make: () => ({ terrain: "high" }) },
  { re: /(?:on |in )?(?:the )?(?:low ground|lowlands|valley floor|floodplain|low land)/, make: () => ({ terrain: "low" }) },
  { re: /(?:on )?flat (?:ground|land|area)/, make: () => ({ terrain: "flat" }) },
  { re: /(?:the )?(?:very )?(?:cent(?:er|re)|middle)(?: of the map)?/, make: () => ({ compass: "center" }) },
  { re: new RegExp(`(?:in |on |at |to )?(?:the )?(far )?(${COMPASS_WORDS})(?: (third|part|half|edge|side|end|corner|quarter|region|area|reaches|bit|portion))?(?: of the map)?`), make: (m) => {
      const c = COMPASS[m[2]];
      const w = m[3];
      let part: Part | undefined =
        w === "half" ? "half" : w === "edge" || w === "side" || m[1] ? "edge" : w === "corner" ? "corner" : w === "quarter" ? "quarter" : undefined;
      if (!part && /^(top|bottom|left|right|top right|top left|bottom right|bottom left)$/.test(m[2]) && !w) part = undefined;
      return part ? { compass: c, part } : { compass: c };
    } },
];

const STOP = new Set(
  "a an the of in on at to and or but with for from into onto this that these those it its is are be put place add make give me some more less somewhere there here up down near my our map side part area bit little lot".split(" "),
);

/** Read a phrase in the player's words. Every part that matches narrows the place. */
export function parse(phrase: string): { place: Place | null; ignored: string[]; matched: string[] } {
  let text = ` ${phrase.toLowerCase().replace(/[.;!?]/g, " ").replace(/\s+/g, " ").trim()} `;
  const parts: Place[] = [];
  const matched: string[] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, "g");
    let m: RegExpExecArray | null;
    const found: [number, number, Place][] = [];
    while ((m = re.exec(text))) {
      if (!m[0].trim()) {
        re.lastIndex++;
        continue;
      }
      // whole words only
      const before = text[m.index - 1];
      const after = text[m.index + m[0].length];
      if ((before && /[a-z0-9]/.test(before)) || (after && /[a-z0-9]/.test(after))) continue;
      const p = rule.make(m);
      if (p) found.push([m.index, m[0].length, p]);
    }
    for (const [at, len, p] of found.reverse()) {
      matched.push(text.slice(at, at + len).trim());
      parts.push(p);
      text = text.slice(0, at) + " ".repeat(len) + text.slice(at + len);
    }
  }
  const ignored = text
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter((w) => w && !STOP.has(w));
  const place = parts.length === 0 ? null : parts.length === 1 ? parts[0] : { all: parts };
  return { place, ignored, matched };
}

// ------------------------------------------------------------------------------------ the entry

/** Resolve a structured place or a phrase. */
export function resolve(v: MapView, where: Place | string, ctx: RefContext = {}): Resolved {
  const assumptions: string[] = [];
  let place: Place | null;
  let ignored: string[] = [];
  if (typeof where === "string") {
    const r = parse(where);
    place = r.place;
    ignored = r.ignored;
    if (!place) return { ok: false, mask: empty(v), tiles: 0, place: null, assumptions, errors: [`"${where}" names no place the app knows`], ignored };
  } else place = where;
  const r = resolvePlace(v, place, ctx, assumptions);
  const tiles = count(r.mask);
  const errors = [...r.errors];
  if (!errors.length && tiles === 0) errors.push("the place is empty on this map: its parts do not overlap");
  return { ok: errors.length === 0, mask: r.mask, tiles, place, assumptions: [...new Set(assumptions)], errors, ignored };
}

export function maskRuns(v: MapView, mask: Uint8Array): Runs {
  const tiles: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) tiles.push(i);
  return tilesToRuns(tiles, v.W);
}

/** Bounding box and centroid of a mask. */
export function extent(v: MapView, mask: Uint8Array): { bbox: [number, number, number, number]; centroid: [number, number]; tiles: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % v.W;
    const y = (i - x) / v.W;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
    sx += x;
    sy += y;
    n++;
  }
  if (!n) return null;
  return { bbox: [x0, y0, x1, y1], centroid: [round1(sx / n), round1(sy / n)], tiles: n };
}

/** The compass words for where a tile lies ("north third, east third": "northeast corner"). */
export function compassWords(v: { W: number; H: number }, x: number, y: number): string {
  const ns = y >= (2 * v.H) / 3 - 0.5 ? "north" : y < v.H / 3 - 0.5 ? "south" : "";
  const ew = x >= (2 * v.W) / 3 - 0.5 ? "east" : x < v.W / 3 - 0.5 ? "west" : "";
  if (ns && ew) return `${ns}${ew} corner`;
  if (ns) return `${ns} third`;
  if (ew) return `${ew} third`;
  return "center";
}

/** Whether a tile is inside a place (for intent checks). */
export function within(v: MapView, where: Place | string, x: number, y: number, ctx: RefContext = {}): { inside: boolean; reading: Resolved } {
  const r = resolve(v, where, ctx);
  const i = Math.round(y) * v.W + Math.round(x);
  return { inside: r.ok && !!r.mask[i], reading: r };
}
