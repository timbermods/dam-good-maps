// find_sites: candidate places for a set piece, a feature or the start, inside a resolved place,
// each planned by the real builder on the current map, measured, and ranked. When nothing fits, it
// says why and offers the nearest feasible alternative: the best size this place allows, or the
// nearest place where the size fits. It never substitutes silently: the caller decides.

import type { MapSession } from "../../../src/core/doc/session";
import { planContextOf, planLake, planLandform, startProblem, pieceTiles } from "../../../src/core/doc/tools";
import { applyBrush } from "../../../src/core/features/raster/brush";
import { hollowAt } from "../../../src/core/features/hollow";
import { entityTiles } from "../../../src/core/features/edits";
import { nearExtras, patchStrokes } from "./dig";
import { pointAtArc } from "../../../src/core/features/geometry";
import { planSetPiece, type PlanContext, type PlanRecord } from "../../../src/core/features/setpieces";
import { reservoirOf, type DamSitePlan } from "../../../src/core/features/setpieces/damSite";
import { FACINGS, STEP, type Facing } from "../../../src/core/features/setpieces/common";
import type { LandformFeature, Point, RiverFeature, SetPieceKind } from "../../../src/core/features/schema";
import { distanceFrom, runsToTiles, type Runs } from "../../../src/core/math/grid";
import { TREE_LOGS } from "../../../src/core/format/entities";
import { LOGS_PER_TREE } from "../../../src/core/spec/mapspec";
import { rulesFor } from "../../../src/core/validate/playability";
import { locate, network, type Course } from "./flow";
import { reservoirIsClean, reservoirTiles, waterName } from "./metrics";
import { compassWords, extent, resolve, type Place, type RefContext } from "./places";
import { sizeTarget, type SizeTarget, type SizeWord } from "./words";
import { round1, round2, viewOf, type MapView } from "./view";

export type SiteKind =
  | "waterfall"
  | "riverFall"
  | "damSite"
  | "gorge"
  | "terracedCliffs"
  | "badwaterBasin"
  | "start"
  | "lake"
  | "hill"
  | "plateau"
  | "ridge"
  | "island"
  | "canyon"
  | "valley"
  | "forest"
  | "berryPatch"
  | "ruinField";

export const SITE_KINDS: readonly SiteKind[] = ["waterfall", "riverFall", "damSite", "gorge", "terracedCliffs", "badwaterBasin", "start", "lake", "hill", "plateau", "ridge", "island", "canyon", "valley", "forest", "berryPatch", "ruinField"];

/** Checks a site's step on the map: apply, validate, take back. Returns the guards it would break
 *  (checks that pass now and fail with it), or why it cannot be built. Registered by steps.ts. */
export type Verifier = (s: MapSession, step: Record<string, unknown>) => { broken: string[]; error?: string };
let verifier: Verifier | null = null;
export function setVerifier(v: Verifier): void {
  verifier = v;
}
/** Candidates verified per query, at most. */
const VERIFY_MAX = 10;

export interface SiteQuery {
  kind: SiteKind;
  where?: Place | string;
  size?: SizeWord | number;
  /** Builder values to keep (drop, flow, crest, facing, strength, …). */
  request?: PlanRecord;
  /** Keep at least this far from the start (tiles). */
  awayFromStart?: number;
  /** badwaterBasin: its outlet must not join a river above any dam site (the reservoir stays clean). */
  keepReservoirsClean?: boolean;
  /** badwaterBasin: as near the start as the rules allow ("dangerous"). */
  nearStart?: boolean;
  limit?: number;
  /** Check each offered site against the guards with a real build (default true). */
  verify?: boolean;
  /** Sites for moving this set piece: each is checked as the piece rebuilt there. */
  replaces?: string;
  /** Lakes: a planned lake's outline (setups only), not a hollow to dig. */
  planned?: boolean;
}

export interface Site {
  rank: number;
  kind: SiteKind;
  at: [number, number];
  where: string;
  /** Along the valley's river, when it lies in one. */
  course?: { river: string; frac: number };
  /** The step that builds it (for propose): ready to use as it is. */
  step: Record<string, unknown>;
  /** A second step that finishes it (a lake's spring, after its hollow is dug). */
  then?: Record<string, unknown>;
  measured: Record<string, unknown>;
  meetsSize: boolean;
  report: string[];
}

export interface SitesResult {
  ok: boolean;
  kind: SiteKind;
  region: { tiles: number; reading: Place | null; assumptions: string[]; ignored: string[] };
  target?: SizeTarget;
  sites: Site[];
  searched: number;
  reason?: string;
  alternative?: { kind: "size" | "place"; note: string; site: Site };
  /** Sites passed over because a build showed they break a guard. */
  rejected?: string;
  /** When the size fails here: where the full size would fit instead (null: nowhere on this map). */
  alsoPossible?: { kind: "place"; note: string; site: Site } | null;
  /** A rule that bent the place: sites were kept out of part of it (the start's badwater rule). */
  constraint?: string;
}

const TMP = "00000000-0000-4000-8000-00000000c1a0";

function tilesOf(mask: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i);
  return out;
}

/** Up to `max` tiles of a mask on a coarse grid, spread evenly. */
function gridTiles(v: MapView, mask: Uint8Array, max: number, margin = 2): number[] {
  const all = tilesOf(mask).filter((i) => {
    const x = i % v.W;
    const y = (i - x) / v.W;
    return x >= margin && y >= margin && x < v.W - margin && y < v.H - margin;
  });
  if (all.length <= max) return all;
  const g = Math.max(2, Math.ceil(Math.sqrt(all.length / max)));
  return all.filter((i) => (i % v.W) % g === 0 && Math.floor(i / v.W) % g === 0);
}

function meets(t: SizeTarget | undefined, value: number): boolean {
  if (!t) return true;
  if (t.approx !== undefined) return Math.abs(value - t.approx) <= (t.tol ?? 0);
  if (t.min !== undefined && value < t.min) return false;
  if (t.max !== undefined && value > t.max) return false;
  return true;
}

/** How far a value is from a size target (0 inside it). */
function shortfall(t: SizeTarget | undefined, value: number): number {
  if (!t) return 0;
  if (t.approx !== undefined) return Math.max(0, Math.abs(value - t.approx) - (t.tol ?? 0));
  if (t.min !== undefined && value < t.min) return t.min - value;
  if (t.max !== undefined && value > t.max) return value - t.max;
  return 0;
}

function courseInfo(v: MapView, x: number, y: number): Site["course"] {
  const l = locate(network(v), v.W, x, y);
  return l ? { river: l.course.name, frac: round2(l.frac) } : undefined;
}

// ----------------------------------------------------------------------------------- the entry

export function findSites(s: MapSession, q: SiteQuery & { farFirst?: boolean }, ctxRefs: RefContext = {}): SitesResult {
  const v = viewOf(s);
  const where = q.where ?? { valley: null };
  const r = typeof where === "string" && !where.trim() ? resolve(v, { valley: null }, ctxRefs) : resolve(v, where, ctxRefs);
  const region = { tiles: r.tiles, reading: r.place, assumptions: r.assumptions, ignored: r.ignored };
  const base: SitesResult = { ok: false, kind: q.kind, region, sites: [], searched: 0 };
  if (!r.ok) return { ...base, reason: r.errors.join("; ") };
  const limit = Math.min(5, Math.max(1, q.limit ?? 3));
  // "far from" places rank their farthest spots first
  if (r.place && JSON.stringify(r.place).includes('"far"')) q = { ...q, farFirst: true };
  const found = search(s, v, q, r.mask);
  base.target = found.target;
  base.searched = found.searched;
  if (found.constraint) base.constraint = found.constraint;
  // every offered site is checked with a real build: a site that breaks a guard (a start rule,
  // the reservoir, the water's way out) is not offered, and why is kept
  const rejected: string[] = [];
  const verified = (list: Site[], want: number): Site[] => {
    if (!verifier || q.verify === false) return list.slice(0, want);
    const out: Site[] = [];
    let tries = 0;
    for (const x of list) {
      if (out.length >= want || tries >= VERIFY_MAX) break;
      if (x.step.existing) {
        out.push(x);
        continue;
      }
      tries++;
      let res = verifier(s, q.replaces ? { ...x.step, replaces: q.replaces } : x.then ? { ...x.step, then: x.then } : x.step);
      // a planned lake a river already fills needs no spring of its own: a source starts water,
      // never stands in a flow (D171)
      if (x.kind === "lake" && x.step.op === "addLake" && q.request?.spring === undefined && x.step.spring === undefined && !res.error && res.broken.length === 1 && res.broken[0] === "water.source_in_flow") {
        const fed = { ...x.step, spring: 0 };
        const again = verifier(s, fed);
        if (!again.error && !again.broken.length) {
          res = again;
          x.step = fed;
          x.report = [...(x.report ?? []).filter((l) => !/spring/.test(l)), "the river beside it fills it, so it has no spring of its own (a source starts water, never stands in a flow)"];
        }
      }
      if (res.error || res.broken.length) {
        rejected.push(res.error ?? `breaks ${res.broken.join(", ")}`);
        continue;
      }
      out.push(x);
    }
    return out;
  };
  // sites right beside the start tend to take its berries, trees or walkable land: try them last
  // unless the place itself is about the start
  if (v.start) {
    const ex0 = extent(v, r.mask);
    const placeNearStart = ex0 ? Math.hypot(ex0.centroid[0] - v.start.x, ex0.centroid[1] - v.start.y) < 25 : false;
    if (!placeNearStart) {
      const near = (x: Site) => Math.hypot(x.at[0] - v.start!.x, x.at[1] - v.start!.y) < 18;
      found.sites = [...found.sites.filter((x) => !near(x)), ...found.sites.filter(near)];
    }
  }
  // map objects (M7: mine sites, relics, geothermal fields, …) stand on ground a piece must not
  // carve or flood (entities.placement): sites near one are tried last. The build check is still
  // the final word; this only keeps it from spending its tries there. None exist before M7.
  const objects = mapObjectSpots(s);
  if (objects.length) {
    const nearObject = (x: Site) => objects.some(([ox, oy]) => Math.hypot(x.at[0] - ox, x.at[1] - oy) < 12);
    found.sites = [...found.sites.filter((x) => !nearObject(x)), ...found.sites.filter(nearObject)];
  }
  const good = verified(found.sites.filter((x) => x.meetsSize), limit);
  if (good.length) return { ...base, ok: true, sites: good.map((x, k) => ({ ...x, rank: k + 1 })), ...(rejected.length ? { rejected: summarize(rejected) } : {}) };
  if (rejected.length) found.why = `every site that fits here breaks a check that passes now (${summarize(rejected)})`;
  found.sites = verified(found.sites.filter((x) => !x.meetsSize), 1);
  // nothing fits here: the nearest feasible alternative, a smaller size here or the size elsewhere
  if (found.sites.length) {
    const best = found.sites[0];
    const out: SitesResult = {
      ...base,
      reason: found.why ?? `nothing here reaches the ${found.target ? describeTarget(found.target) : "size asked for"}`,
      alternative: { kind: "size", note: `the best this place allows: ${sizeNote(best)}`, site: { ...best, rank: 1 } },
      sites: [],
    };
    const elsewhere = verified(search(s, v, q, new Uint8Array(v.W * v.H).fill(1)).sites.filter((x) => x.meetsSize), 1);
    const ex = extent(v, r.mask);
    if (elsewhere.length && ex) {
      elsewhere.sort((a, b) => Math.hypot(a.at[0] - ex.centroid[0], a.at[1] - ex.centroid[1]) - Math.hypot(b.at[0] - ex.centroid[0], b.at[1] - ex.centroid[1]));
      const pick = elsewhere[0];
      const dist = Math.round(Math.hypot(pick.at[0] - ex.centroid[0], pick.at[1] - ex.centroid[1]));
      out.alsoPossible = { kind: "place", note: `the full size fits at ${pick.where}${pick.course ? `, ${Math.round(pick.course.frac * 100)}% of the way down ${pick.course.river}` : ""}, about ${dist} tiles from the place asked for (${sizeNote(pick)})`, site: { ...pick, rank: 1 } };
    } else out.alsoPossible = null;
    return out;
  }
  // try the whole valley, then the whole map, for the nearest place that fits
  const wide = new Uint8Array(v.W * v.H).fill(1);
  const elsewhere = search(s, v, q, wide);
  const ex = extent(v, r.mask);
  if (ex) elsewhere.sites.sort((a, b) => Math.hypot(a.at[0] - ex.centroid[0], a.at[1] - ex.centroid[1]) - Math.hypot(b.at[0] - ex.centroid[0], b.at[1] - ex.centroid[1]));
  elsewhere.sites = [...verified(elsewhere.sites.filter((x) => x.meetsSize), 1), ...elsewhere.sites.filter((x) => !x.meetsSize).slice(0, 1)];
  const fits = elsewhere.sites.filter((x) => x.meetsSize);
  const pick = (fits.length ? fits : elsewhere.sites).sort((a, b) => (ex ? Math.hypot(a.at[0] - ex.centroid[0], a.at[1] - ex.centroid[1]) - Math.hypot(b.at[0] - ex.centroid[0], b.at[1] - ex.centroid[1]) : 0))[0];
  const reason = found.why ?? `no ${q.kind} fits in this place (${r.tiles} tiles searched at ${found.searched} spots)`;
  if (!pick) return { ...base, reason: `${reason}, and nowhere else on this map either${elsewhere.why ? `: ${elsewhere.why}` : ""}` };
  const dist = ex ? Math.round(Math.hypot(pick.at[0] - ex.centroid[0], pick.at[1] - ex.centroid[1])) : 0;
  return {
    ...base,
    reason,
    alternative: {
      kind: "place",
      note: `the nearest place that ${fits.length ? "fits" : "comes closest"}: ${pick.where}${pick.course ? `, ${Math.round(pick.course.frac * 100)}% of the way down ${pick.course.river}` : ""}, about ${dist} tiles from the place asked for${fits.length ? "" : ` (${sizeNote(pick)})`}`,
      site: { ...pick, rank: 1 },
    },
  };
}

function summarize(reasons: string[]): string {
  const n = new Map<string, number>();
  for (const r of reasons) n.set(r, (n.get(r) ?? 0) + 1);
  return [...n].map(([r, k]) => `${k} ${r}`).join("; ");
}

function describeTarget(t: SizeTarget): string {
  if (t.approx !== undefined) return `${t.metric} of ${t.approx} ±${t.tol} ${t.unit}`;
  if (t.min !== undefined && t.max !== undefined) return `${t.metric} of ${t.min}–${t.max} ${t.unit}`;
  if (t.min !== undefined) return `${t.metric} of at least ${t.min} ${t.unit}`;
  return `${t.metric} of at most ${t.max} ${t.unit}`;
}

function sizeNote(x: Site): string {
  const m = x.measured;
  if (m.reservoir !== undefined) return `a reservoir of ${m.reservoir} blocks`;
  if (m.width !== undefined) return `${m.width} tiles wide`;
  if (m.area !== undefined) return `${m.area} tiles`;
  if (m.trees !== undefined) return `${m.trees} tree spots`;
  if (m.scrap !== undefined) return `${m.scrap} scrap`;
  return JSON.stringify(m).slice(0, 80);
}

interface Found {
  sites: Site[];
  searched: number;
  target?: SizeTarget;
  why?: string;
  constraint?: string;
}

function search(s: MapSession, v: MapView, q: SiteQuery & { farFirst?: boolean }, mask: Uint8Array): Found {
  const designedFor = s.spec?.designedFor ?? s.meta.designedFor;
  const size = q.size;
  switch (q.kind) {
    case "damSite":
      return damSites(s, v, q, mask, size !== undefined ? sizeTarget("damSite", size, { W: v.W, H: v.H, designedFor, need: rulesFor(s.spec, s.meta.designedFor).reservoirNeed }) ?? undefined : undefined);
    case "waterfall":
      return standaloneFalls(s, v, q, mask);
    case "riverFall":
      return riverFalls(s, v, q, mask);
    case "gorge":
      return gorges(s, v, q, mask);
    case "terracedCliffs":
      return cliffs(s, v, q, mask);
    case "badwaterBasin": {
      // a size word sets the spring's strength ("huge" 3 blocks/s) unless the request gives one
      const t = size !== undefined ? sizeTarget("badwaterBasin", size, { W: v.W, H: v.H, designedFor }) ?? undefined : undefined;
      const strength = q.request?.strength ?? t?.approx;
      const found = badwater(s, v, strength !== undefined ? { ...q, request: { ...q.request, strength } } : q, mask);
      return t ? { ...found, target: t } : found;
    }
    case "start":
      return starts(s, v, q, mask);
    case "lake":
      return (q.planned ? plannedLakes : lakes)(s, v, q, mask, size !== undefined ? sizeTarget("lake", size, { W: v.W, H: v.H, designedFor }) ?? undefined : undefined);
    case "forest":
    case "berryPatch":
    case "ruinField":
      return resources(s, v, q, mask);
    default:
      // hills and valleys come from the brushes (D182)
      return { sites: [], searched: 0, why: "hills, plateaus, ridges, canyons and valleys come from the brushes: use the brush step (raise or lower a place, with size, amount and edges)" };
  }
}

// -------------------------------------------------------------------------------- river pieces

/** Arc positions along each course whose channel point lies in the mask, every `step` tiles. */
function arcsIn(v: MapView, mask: Uint8Array, step = 3, margin = 6): [Course, number][] {
  const out: [Course, number][] = [];
  for (const c of network(v).courses) {
    for (let a = margin; a < c.length - margin; a += step) {
      const p = pointAtArc(c.path, a).p;
      const x = Math.round(p[0]);
      const y = Math.round(p[1]);
      if (x < 0 || y < 0 || x >= v.W || y >= v.H) continue;
      // the course's arc position in its feature's own order (builders take that)
      if (mask[y * v.W + x]) out.push([c, c.reversed ? c.length - a : a]);
    }
  }
  return out;
}

function damSites(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array, target?: SizeTarget): Found {
  const ctx = planContextOf(s);
  const arcs = arcsIn(v, mask, 3, 10);
  const existing = s.features.filter((f) => f.kind === "setPiece" && (f.params.kind === "damSite" || f.params.kind === "gorge" || f.params.kind === "waterfall"));
  const sites: Site[] = [];
  let why: string | undefined;
  const crests = q.request?.crest ? [Number(q.request.crest)] : [2, 3, 1];
  for (const [c, at] of arcs) {
    // keep clear of other pieces on the same river: another ridge or gorge 10 tiles, a fall's step 6
    const clash = existing.find((f) => {
      if (f.kind !== "setPiece" || f.params.plan.river !== c.id) return false;
      const d = Math.abs(Number(f.params.plan.at ?? f.params.plan.from) - at);
      return d < (f.params.kind === "waterfall" ? 6 : 10);
    });
    if (clash) continue;
    const river = s.features.find((f): f is RiverFeature => f.kind === "river" && f.id === c.id)!;
    let best: Site | null = null;
    for (const crest of crests) {
      const req: PlanRecord = { river: c.id, at: round2(at), crest };
      const r = planSetPiece("damSite", req, ctx, { id: TMP, origin: "claude" });
      if (!r.ok) {
        why ??= r.errors[0];
        continue;
      }
      const held = reservoirOf(r.feature.params.plan as unknown as DamSitePlan, river, ctx, null);
      if (!held) continue;
      const cap = Math.floor(0.15 * v.W * v.H);
      if (held.area > cap) continue;
      const p = pointAtArc(river.params.path, at).p;
      const x = Math.round(p[0]);
      const y = Math.round(p[1]);
      const clean = reservoirIsClean(v, c.id, at);
      const site: Site = {
        rank: 0,
        kind: "damSite",
        at: [x, y],
        where: compassWords(v, x, y),
        course: courseInfo(v, x, y),
        step: { op: "addSetPiece", kind: "damSite", request: req },
        measured: { reservoir: Math.round(held.volume), area: held.area, damLength: held.length, crest: Number(r.feature.params.plan.crest), reservoirClean: clean, fillMinutes: river.params.flow > 0 ? round1(held.volume / river.params.flow / 60) : null },
        meetsSize: meets(target, held.volume),
        report: r.feature.params.report,
      };
      if (!best || (site.meetsSize && !best.meetsSize) || (site.meetsSize === best.meetsSize && held.volume > Number(best.measured.reservoir))) best = site;
      if (site.meetsSize && crest === crests[0]) break;
    }
    if (best) sites.push(best);
  }
  // the dam sites already on the map, measured the same way: one may already be what was asked
  for (const f of existing) {
    if (f.kind !== "setPiece" || f.params.kind !== "damSite") continue;
    const river = s.features.find((g): g is RiverFeature => g.kind === "river" && g.id === f.params.plan.river);
    if (!river) continue;
    const p = pointAtArc(river.params.path, Number(f.params.plan.at)).p;
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    if (!mask[y * v.W + x]) continue;
    const held = reservoirOf(f.params.plan as unknown as DamSitePlan, river, ctx, f.id);
    if (!held) continue;
    sites.push({
      rank: 0,
      kind: "damSite",
      at: [x, y],
      where: compassWords(v, x, y),
      course: courseInfo(v, x, y),
      step: { existing: f.id, note: "already on the map: no step needed" },
      measured: { reservoir: Math.round(held.volume), area: held.area, damLength: held.length, crest: Number(f.params.plan.crest), reservoirClean: reservoirIsClean(v, river.id, Number(f.params.plan.at)), existing: f.id, fillMinutes: river.params.flow > 0 ? round1(held.volume / river.params.flow / 60) : null },
      meetsSize: meets(target, held.volume),
      report: [`the dam site ${f.id} is already here`],
    });
  }
  // sites that meet the size first, new ones before those already on the map; among them the most
  // water per dam tile (a short dam holding a big reservoir is the best opportunity)
  sites.sort((a, b) => Number(b.meetsSize) - Number(a.meetsSize) || Number(b.measured.reservoirClean) - Number(a.measured.reservoirClean) || Number(!!a.measured.existing) - Number(!!b.measured.existing) || Number(b.measured.reservoir) / Number(b.measured.damLength) - Number(a.measured.reservoir) / Number(a.measured.damLength));
  const dirty = sites.filter((x) => !x.measured.reservoirClean).length;
  if (dirty && dirty === sites.length) why = "the river here already carries badwater (the map's own badwater joins it upstream): every reservoir here would hold badwater";
  // when nothing meets the size, the biggest reservoir is the nearest alternative
  if (!sites.some((x) => x.meetsSize)) sites.sort((a, b) => Number(b.measured.reservoir) - Number(a.measured.reservoir));
  if (!arcs.length) why = "no river runs through this place";
  return { sites: spaced(sites, 8), searched: arcs.length, target, why: sites.length ? (dirty === sites.length ? why : undefined) : why ?? "no dam across the river here holds water (it reaches a map edge or walks round the dam)" };
}

/** Keep sites at least `d` tiles apart. */
/** Where the map's single map objects stand (M7's mapObject features with an x, y placement). Typed
 *  loosely: the feature kind only exists from M7 on. */
function mapObjectSpots(s: MapSession): [number, number][] {
  const out: [number, number][] = [];
  const W = s.size.x;
  for (const f of s.features as unknown as { kind: string; params?: { placement?: { x?: number; y?: number; area?: Runs } } }[]) {
    const p = f.kind === "mapObject" ? f.params?.placement : undefined;
    if (!p) continue;
    if (typeof p.x === "number" && typeof p.y === "number") out.push([p.x, p.y]);
    // a belt or a line (thorns, a weir, a plug): every fourth of its tiles
    else if (p.area) runsToTiles(p.area, W).forEach((i, k) => k % 4 === 0 && out.push([i % W, Math.floor(i / W)]));
  }
  return out;
}

/** What a builder's "clears …" line would take away: trees 1, berry bushes and ruin columns 2. */
function clearedCost(report: string[]): number {
  let n = 0;
  for (const line of report) {
    if (!/^clears /.test(line)) continue;
    for (const m of line.matchAll(/(\d+) (trees?|berry bushes|ruin columns?)/g)) n += Number(m[1]) * (/tree/.test(m[2]) ? 1 : 2);
  }
  return n;
}

function spaced(sites: Site[], d: number): Site[] {
  const out: Site[] = [];
  for (const x of sites) if (out.every((y) => Math.hypot(x.at[0] - y.at[0], x.at[1] - y.at[1]) >= d)) out.push(x);
  return out;
}

function riverFalls(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array): Found {
  const ctx = planContextOf(s);
  const arcs = arcsIn(v, mask, 4, 8);
  const drop = Number(q.request?.drop ?? 3);
  const sites: Site[] = [];
  let why: string | undefined;
  for (const [c, at] of arcs) {
    const req: PlanRecord = { mode: "on-river", river: c.id, at: round2(at), drop };
    const r = planSetPiece("waterfall", req, ctx, { id: TMP, origin: "claude" });
    if (!r.ok) {
      why ??= r.errors[0];
      continue;
    }
    const river = s.features.find((f): f is RiverFeature => f.kind === "river" && f.id === c.id)!;
    const p = pointAtArc(river.params.path, at).p;
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    sites.push({ rank: 0, kind: "riverFall", at: [x, y], where: compassWords(v, x, y), course: courseInfo(v, x, y), step: { op: "addSetPiece", kind: "waterfall", request: req }, measured: { drop: Number(r.feature.params.plan.drop), riverWidth: river.params.width, flow: river.params.flow }, meetsSize: Number(r.feature.params.plan.drop) === drop, report: r.feature.params.report });
  }
  return { sites: spaced(sites, 12), searched: arcs.length, why: sites.length ? undefined : why ?? "no river runs through this place" };
}

function gorges(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array): Found {
  const ctx = planContextOf(s);
  const arcs = arcsIn(v, mask, 5, 4);
  const sites: Site[] = [];
  let why: string | undefined;
  const length = Number(q.request?.length ?? 16);
  for (const [c, at] of arcs) {
    const req: PlanRecord = { river: c.id, from: round2(Math.max(1, at - length / 2)), length, width: Number(q.request?.width ?? 5), wallHeight: Number(q.request?.wallHeight ?? 3), ...(q.request?.access ? { access: q.request.access } : {}) };
    const r = planSetPiece("gorge", req, ctx, { id: TMP, origin: "claude" });
    if (!r.ok) {
      why ??= r.errors[0];
      continue;
    }
    const p = pointAtArc(s.features.find((f): f is RiverFeature => f.kind === "river" && f.id === c.id)!.params.path, at).p;
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    // other pieces on the same stretch of river (a fall's step, a dam site's ridge) end up inside
    // the gorge: allowed, but offered last and said
    const from = Number(r.feature.params.plan.from);
    const to = Number(r.feature.params.plan.to);
    const inside = s.features.filter((f) => f.kind === "setPiece" && f.params.plan.river === c.id && (() => {
      const a = Number(f.params.plan.at ?? f.params.plan.from);
      return a >= from - 3 && a <= to + 3;
    })());
    const encloses = inside.map((f) => {
      const a = Number(f.kind === "setPiece" ? f.params.plan.at ?? f.params.plan.from : 0);
      const frac = c.reversed ? 1 - a / c.length : a / c.length;
      return `the ${f.kind === "setPiece" && f.params.kind === "damSite" ? "dam site" : f.kind === "setPiece" ? String(f.params.kind) : f.kind} ${Math.round(frac * 100)}% down ${c.name} (${f.id})`;
    });
    sites.push({ rank: 0, kind: "gorge", at: [x, y], where: compassWords(v, x, y), course: courseInfo(v, x, y), step: { op: "addSetPiece", kind: "gorge", request: req }, measured: { width: r.feature.params.plan.width, length: round1(to - from), wallHeight: r.feature.params.plan.wallHeight, ...(encloses.length ? { encloses } : {}) }, meetsSize: true, report: r.feature.params.report });
  }
  const clear = (x: Site) => !(x.measured as { encloses?: string[] }).encloses;
  const kept = spaced(sites, 20);
  return { sites: [...kept.filter(clear), ...kept.filter((x) => !clear(x))], searched: arcs.length, why: sites.length ? undefined : why ?? "no river runs through this place" };
}

// ------------------------------------------------------------------------------ standalone pieces

function startDistance(v: MapView): Float64Array | null {
  if (!v.start) return null;
  const m = new Uint8Array(v.W * v.H);
  m[v.start.y * v.W + v.start.x] = 1;
  return distanceFrom(m, v.W, v.H);
}

/** The facings that fall toward lower ground at (x, y), best first. */
function downhillFacings(v: MapView, x: number, y: number): Facing[] {
  const at = (xx: number, yy: number) => v.heights[Math.min(v.H - 1, Math.max(0, yy)) * v.W + Math.min(v.W - 1, Math.max(0, xx))];
  const score = (f: Facing) => {
    const [dx, dy] = STEP[f];
    let sum = 0;
    for (let k = 3; k <= 9; k += 3) sum += at(x - k * dx, y - k * dy) - at(x + k * dx, y + k * dy);
    return sum;
  };
  return [...FACINGS].sort((a, b) => score(b) - score(a));
}

function standaloneFalls(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array): Found {
  const ctx = planContextOf(s);
  const sd = startDistance(v);
  const away = q.awayFromStart ?? 12;
  const designedFor = s.spec?.designedFor ?? s.meta.designedFor;
  const cands = gridTiles(v, mask, 160, 4).filter((i) => !v.channel[i] && !(v.water[i] > 0.05) && (!sd || sd[i] >= away));
  // closest to the middle of the place first
  const ex = extent(v, mask);
  if (ex) cands.sort((a, b) => Math.hypot((a % v.W) - ex.centroid[0], Math.floor(a / v.W) - ex.centroid[1]) - Math.hypot((b % v.W) - ex.centroid[0], Math.floor(b / v.W) - ex.centroid[1]));
  const sites: Site[] = [];
  let why: string | undefined;
  let searched = 0;
  let target: SizeTarget | undefined;
  for (const i of cands) {
    if (sites.length >= 12 || searched >= 90) break;
    const x = i % v.W;
    const y = (i - x) / v.W;
    const facings = q.request?.facing ? [q.request.facing as Facing] : downhillFacings(v, x, y).slice(0, 2);
    for (const facing of facings) {
      const side = facing === "north" || facing === "south" ? v.W : v.H;
      const t = q.size !== undefined ? sizeTarget("waterfall", q.size, { W: v.W, H: v.H, designedFor, side }) : undefined;
      target ??= t ?? undefined;
      const width = t ? Math.round(t.approx ?? Math.min(t.max ?? 12, Math.max(t.min ?? 6, ((t.min ?? 6) + (t.max ?? 12)) / 2))) : Number(q.request?.width ?? 8);
      const req: PlanRecord = { mode: "standalone", lip: [x, y], facing, width, drop: Number(q.request?.drop ?? 6), flow: q.request?.flow ?? "steady", ...(q.request?.exactFlow ? { exactFlow: true } : {}) };
      searched++;
      const r = planSetPiece("waterfall", req, ctx, { id: TMP, origin: "claude" });
      if (!r.ok) {
        why ??= r.errors[0];
        continue;
      }
      if (r.feature.params.report.some((l) => l.startsWith("moved"))) continue;
      const p = r.feature.params.plan;
      const outflow = (p.outflowLevels as number[]).length;
      const w = Number(p.width);
      sites.push({
        rank: 0,
        kind: "waterfall",
        at: [x, y],
        where: compassWords(v, x, y),
        course: courseInfo(v, x, y),
        step: { op: "addSetPiece", kind: "waterfall", request: req },
        measured: { width: w, drop: p.drop, lipLevel: p.lipLevel, flow: p.flow, facing, outflowTiles: outflow, outflowTo: waterName(s, v, p.outflowTo), lipDepth: round2((0.3 * Number(p.flow)) / w) },
        meetsSize: meets(t ?? undefined, w),
        report: r.feature.params.report,
      });
      break;
    }
  }
  // short outflows and falls that suit the ground first; of the spaced sites, those that clear
  // less (ruins and berries weigh more than trees) are offered first
  sites.sort((a, b) => Number(b.meetsSize) - Number(a.meetsSize) || Number(a.measured.outflowTiles) - Number(b.measured.outflowTiles));
  const cost = (x: Site) => Math.round(clearedCost(x.report) / 20);
  const kept = spaced(sites, 10).sort((a, b) => Number(b.meetsSize) - Number(a.meetsSize) || cost(a) - cost(b));
  return { sites: kept, searched, target, why: sites.length ? undefined : why ?? "no spot here fits the fall without moving it" };
}

function cliffs(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array): Found {
  const ctx = planContextOf(s);
  const sd = startDistance(v);
  const cands = gridTiles(v, mask, 120, 4).filter((i) => !v.channel[i] && !(v.water[i] > 0.05) && (!sd || sd[i] >= 10));
  const sites: Site[] = [];
  let why: string | undefined;
  let searched = 0;
  for (const i of cands) {
    if (sites.length >= 10 || searched >= 80) break;
    const x = i % v.W;
    const y = (i - x) / v.W;
    // the front faces the lower ground (toward water)
    const facing = (q.request?.facing as Facing) ?? downhillFacings(v, x, y)[0];
    const req: PlanRecord = { at: [x, y], facing, bands: Number(q.request?.bands ?? 4), depth: Number(q.request?.depth ?? 8), width: Number(q.request?.width ?? 16) };
    searched++;
    const r = planSetPiece("terracedCliffs", req, ctx, { id: TMP, origin: "claude" });
    if (!r.ok) {
      why ??= r.errors[0];
      continue;
    }
    if (r.feature.params.report.some((l) => l.startsWith("moved"))) continue;
    const p = r.feature.params.plan;
    sites.push({ rank: 0, kind: "terracedCliffs", at: [x, y], where: compassWords(v, x, y), course: courseInfo(v, x, y), step: { op: "addSetPiece", kind: "terracedCliffs", request: req }, measured: { bands: p.bands, depth: p.depth, width: p.width, from: Number(p.base) + 1, to: Number(p.base) + Number(p.bands) }, meetsSize: true, report: r.feature.params.report });
  }
  return { sites: spaced(sites, 16), searched, why: sites.length ? undefined : why };
}

function badwater(s: MapSession, v: MapView, q: SiteQuery & { farFirst?: boolean }, mask: Uint8Array): Found {
  const ctx = planContextOf(s);
  const rules = rulesFor(s.spec, s.meta.designedFor);
  const sd = startDistance(v);
  // soil contamination reaches about 7 tiles past the water: keep the basin's rim that much
  // beyond the start rule, plus the basin's own half-width
  const minD = rules.badwaterWithin + 12;
  const cands = gridTiles(v, mask, 200, 6).filter((i) => !v.channel[i] && !(v.water[i] > 0.05) && (!sd || sd[i] >= minD));
  let inside = 0;
  let tooNear = 0;
  if (sd) for (let i = 0; i < mask.length; i++) if (mask[i]) {
    inside++;
    if (sd[i] < minD) tooNear++;
  }
  const constraint = inside && tooNear / inside > 0.25 ? `the start rule keeps badwater ${rules.badwaterWithin} tiles from the start, and its soil spreads about 7 more: ${Math.round((100 * tooNear) / inside)}% of this place is nearer than ${minD} tiles, so sites are only in the rest` : undefined;
  // as near the start as the rules allow ("dangerous"); in a named place, nearest its middle;
  // otherwise as far from the start as the map allows
  const ex = q.where !== undefined && !q.farFirst ? extent(v, mask) : null;
  if (q.nearStart && sd) cands.sort((a, b) => sd[a] - sd[b]);
  else if (ex) cands.sort((a, b) => Math.hypot((a % v.W) - ex.centroid[0], Math.floor(a / v.W) - ex.centroid[1]) - Math.hypot((b % v.W) - ex.centroid[0], Math.floor(b / v.W) - ex.centroid[1]));
  else if (sd) cands.sort((a, b) => sd[b] - sd[a]);
  const damPieces = s.features.filter((f) => f.kind === "setPiece" && f.params.kind === "damSite");
  const net = network(v);
  const sites: Site[] = [];
  let why: string | undefined = cands.length ? undefined : `every spot here is within ${minD} tiles of the start (the start rule keeps badwater ${rules.badwaterWithin} tiles away, and its soil spreads about 7 more)`;
  let searched = 0;
  const strength = Number(q.request?.strength ?? (q.nearStart ? 2.5 : 1.5));
  // an outlet that joins a river above the start, or just below it (contamination spreads through
  // the water both ways), carries badwater past it and start.badwater breaks on the verifying
  // build: such sites are kept but tried last
  const startOn = new Map<string, number>();
  if (v.start) for (const c of net.courses) {
    const l = locate(net, v.W, v.start.x, v.start.y, c);
    if (l && l.d < 30) startOn.set(c.name, l.s + minD);
  }
  const nearStartJoin = (river?: string, arc?: number) => river !== undefined && arc !== undefined && startOn.has(river) && arc < startOn.get(river)!;
  let below = 0;
  let flooded: { d: (typeof damPieces)[number]; tiles: Set<number> }[] | undefined;
  for (const i of cands) {
    if (below >= 8 || sites.length >= 24 || searched >= 60) break;
    const x = i % v.W;
    const y = (i - x) / v.W;
    const req: PlanRecord = { mode: "basin", at: [x, y], strength };
    searched++;
    const r = planSetPiece("badwaterBasin", req, ctx, { id: TMP, origin: "claude" });
    if (!r.ok) {
      why ??= r.errors[0];
      continue;
    }
    const p = r.feature.params.plan;
    const tiles = p.outlet as number[];
    const end: [number, number] = [tiles[tiles.length - 2], tiles[tiles.length - 1]];
    let join: { river?: string; frac?: number; arc?: number } = {};
    let poisons: string[] = [];
    if (typeof p.outletTo === "string" && p.outletTo !== "edge") {
      const c = net.byId.get(p.outletTo);
      if (c) {
        const l = locate(net, v.W, end[0], end[1], c);
        if (l) {
          join = { river: c.name, frac: round2(l.frac), arc: round1(l.s) };
          // dam sites on that river below the junction would hold badwater
          poisons = damPieces
            .filter((d) => d.kind === "setPiece" && d.params.plan.river === c.id)
            .filter((d) => {
              const at = Number(d.kind === "setPiece" ? d.params.plan.at : 0);
              const flowAt = c.reversed ? c.length - at : at;
              return flowAt > l.s;
            })
            .map((d) => d.id);
        }
      }
    }

    // a basin the reservoir would rise over, or whose channel to the edge runs through it,
    // poisons it whatever river its outlet joins
    if (q.keepReservoirsClean && damPieces.length) {
      flooded ??= damPieces.map((d) => ({ d, tiles: reservoirTiles(s, d) }));
      const route: number[] = [];
      for (let k = 0; k + 1 < tiles.length; k += 2) route.push(Math.round(tiles[k + 1]) * v.W + Math.round(tiles[k]));
      const under = flooded.find((r) => r.tiles.has(i) || route.some((t) => r.tiles.has(t)));
      if (under) {
        why = `the reservoir of the dam site ${under.d.id} would take in a spring here (the spring or its channel lies in it)`;
        continue;
      }
    }
    if (q.keepReservoirsClean && poisons.length) {
      why ??= `its outlet would join the river above the dam site ${poisons[0]}, and the reservoir would fill with badwater`;
      continue;
    }
    sites.push({
      rank: 0,
      kind: "badwaterBasin",
      at: [x + 1, y + 1],
      where: compassWords(v, x, y),
      course: courseInfo(v, x, y),
      step: { op: "addSetPiece", kind: "badwaterBasin", request: req },
      measured: { strength: p.strength, distanceToStart: sd ? round1(sd[i]) : null, outletTo: p.outletTo === "edge" ? "map edge" : join.river ?? waterName(s, v, p.outletTo), joinsAt: join.frac, routeTiles: (p.outletLevels as number[]).length, poisonsDamSites: poisons },
      meetsSize: true,
      report: r.feature.params.report,
    });
    if (!nearStartJoin(join.river, join.arc)) below++;
    else (sites[sites.length - 1] as Site & { joinsNearStart?: boolean }).joinsNearStart = true;
  }
  const above = (x: Site) => (x as Site & { joinsNearStart?: boolean }).joinsNearStart === true;
  const ordered = [...sites.filter((x) => !above(x)), ...sites.filter(above)];
  return { sites: spaced(ordered, 10), searched, why: sites.length ? undefined : why, ...(constraint ? { constraint } : {}) };
}

// ---------------------------------------------------------------------------------- the start

/** Candidate spots for the start, pre-checked against the start rules the validator uses at HEAD
 *  (rulesFor): pumpable clean water within the water rule, wood (logs, D164) and berries within 20
 *  tiles, no badwater within the badwater rule. The water rule walks over the map's own slopes
 *  (Kyler, 2026-09-25); the pre-check reads it as straight distance to water a pump on the spot's
 *  level reaches, which the slopes only widen. The step's dry run is the final word. */
function starts(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array): Found {
  const rules = rulesFor(s.spec, s.meta.designedFor);
  const b = s.built;
  const feat = s.features.find((f) => f.kind === "start");
  const pieces = pieceTiles(s);
  const W = v.W;
  const N = W * v.H;
  // pumpable clean water: its surface 0–2 below the ground level at the candidate
  const clean: number[] = [];
  for (let i = 0; i < N; i++) if (v.water[i] >= 0.3 && v.contamination[i] < 0.05) clean.push(i);
  const bad = new Uint8Array(N);
  for (let i = 0; i < N; i++) if ((v.water[i] > 0.05 && v.contamination[i] >= 0.05) || v.soilContamination[i] > 0) bad[i] = 1;
  const badD = distanceFrom(bad, W, v.H);
  const trees = b.entities.filter((e) => /^(Pine|Birch|Oak)$/.test(e.template));
  const bushes = b.entities.filter((e) => e.template === "BlueberryBush" && !(e.components.LivingNaturalResource as { IsDead?: boolean } | undefined)?.IsDead);
  const cands = gridTiles(v, mask, 400, 8);
  const sites: Site[] = [];
  let why: string | undefined;
  let searched = 0;
  const fails = { water: 0, trees: 0, bushes: 0, badwater: 0, ground: 0 };
  for (const i of cands) {
    const x = i % W;
    const y = (i - x) / W;
    searched++;
    if (startProblem(b, x, y, feat?.kind === "start" ? feat.params.orientation : "Cw0", false, feat?.id ?? null, pieces)) {
      fails.ground++;
      continue;
    }
    let dry = true;
    for (let dy = -2; dy <= 2 && dry; dy++) for (let dx = -2; dx <= 2 && dry; dx++) if (v.water[(y + dy) * W + x + dx] > 0.05 || v.channel[(y + dy) * W + x + dx]) dry = false;
    if (!dry) {
      fails.ground++;
      continue;
    }
    const z = v.heights[i];
    let wd = Infinity;
    for (const j of clean) {
      const sfc = v.heights[j] + v.water[j];
      if (sfc < z - 2 || sfc > z + 0.01) continue;
      const d = Math.hypot((j % W) - x, Math.floor(j / W) - y) - 1;
      if (d < wd) wd = d;
    }
    if (wd > rules.waterWithin) {
      fails.water++;
      continue;
    }
    if (badD[i] < rules.badwaterWithin + 2) {
      fails.badwater++;
      continue;
    }
    const near = (e: { x: number; y: number }) => Math.hypot(e.x - x, e.y - y) <= 20;
    const t = trees.filter(near).reduce((a, e) => a + TREE_LOGS[e.template], 0);
    const u = bushes.filter(near).length;
    // trees and berries can come along (moveStart adds a grove and a berry patch nearby), as long
    // as there is moist soil for them within reach
    const needTrees = Math.max(0, Math.ceil((Math.ceil(rules.woodWithin20 * 1.2) - t) / LOGS_PER_TREE));
    const needBushes = Math.max(0, Math.ceil(rules.bushesWithin20 * 1.2) - u);
    let moist = 0;
    for (let dy = -16; dy <= 16; dy++)
      for (let dx = -16; dx <= 16; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= v.H || Math.hypot(dx, dy) < 7 || Math.hypot(dx, dy) > 16) continue;
        const k = yy * W + xx;
        if (v.moisture[k] > 0 && !(v.soilContamination[k] > 0) && !(v.water[k] > 0) && !v.channel[k] && !b.occupied[k]) moist++;
      }
    if (needTrees + needBushes > moist * 0.8) {
      if (needTrees > needBushes) fails.trees++;
      else fails.bushes++;
      continue;
    }
    const brings = [needTrees ? `a grove of ${needTrees} trees` : "", needBushes ? `a berry patch of ${needBushes} bushes` : ""].filter(Boolean);
    sites.push({
      rank: 0,
      kind: "start",
      at: [x, y],
      where: compassWords(v, x, y),
      course: courseInfo(v, x, y),
      step: { op: "moveStart", to: [x, y] },
      measured: { level: z, waterDistance: round1(wd), woodWithin20: t, bushesWithin20: u, badwaterDistance: round1(badD[i]), ...(brings.length ? { brings: brings.join(" and ") } : {}) },
      meetsSize: true,
      report: brings.length ? [`moving the start here also plants ${brings.join(" and ")} near it, to keep the start rules`] : [],
    });
  }
  if (!sites.length) {
    const worst = Object.entries(fails).sort((a, b) => b[1] - a[1])[0];
    why = `no spot here meets the start rules (${searched} spots: ${fails.water} too far from pumpable clean water (${rules.waterWithin} tiles), ${fails.trees} with too little wood (${rules.woodWithin20} logs), ${fails.bushes} with too few berry bushes (${rules.bushesWithin20}), ${fails.badwater} too near badwater (${rules.badwaterWithin}), ${fails.ground} not level, dry and clear); mostly: ${worst[0]}`;
  }
  // what needs nothing brought along first, then nearest the water
  sites.sort((a, b) => Number(!!a.measured.brings) - Number(!!b.measured.brings) || Number(a.measured.waterDistance) - Number(b.measured.waterDistance));
  return { sites: spaced(sites, 8), searched, why };
}

// --------------------------------------------------------------------------------- lakes, land

function octagon(cx: number, cy: number, rx: number, ry: number): Point[] {
  const out: Point[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI / 4) * k + Math.PI / 8;
    out.push([Math.round((cx + rx * Math.cos(a)) * 2) / 2, Math.round((cy + ry * Math.sin(a)) * 2) / 2]);
  }
  return out;
}

/** The tiles within `r` of a mask: centres of pieces whose body reaches the place. */
function dilate(v: MapView, mask: Uint8Array, r: number): Uint8Array {
  const d = distanceFrom(mask, v.W, v.H);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) if (d[i] <= r) out[i] = 1;
  return out;
}

/** Lakes (D184: a lake is dug and filled, not placed as a shape): a round hollow dug with a lower
 *  brush, 2 levels (deeper on sloping ground), on dry ground off the start's own area, and a
 *  spring at its lowest point that
 *  fills it. Each site is measured by digging it on a copy of the ground: the hollow's area and its
 *  level. Its step digs the hollow; `then` puts the spring in it (propose both, in that order). */
function lakes(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array, target?: SizeTarget): Found {
  const sd = startDistance(v);
  const want = target ? (target.approx ?? ((target.min ?? 60) + (target.max ?? target.min ?? 60)) / 2) : Number(q.request?.area ?? 80);
  const r0 = Math.max(3, Math.round(Math.sqrt(want / Math.PI)));
  const cands = gridTiles(v, dilate(v, mask, r0), 150, r0 + 4).filter((i) => !v.channel[i] && (!sd || sd[i] >= r0 + 5));
  // nearest the place first
  const ex = extent(v, mask);
  if (ex) cands.sort((a, b) => Number(!mask[a]) - Number(!mask[b]) || Math.hypot((a % v.W) - ex.centroid[0], Math.floor(a / v.W) - ex.centroid[1]) - Math.hypot((b % v.W) - ex.centroid[0], Math.floor(b / v.W) - ex.centroid[1]));
  // the objects on the ground (plants a pond drowns, ruins that float on changed ground)
  const occ = new Uint8Array(v.W * v.H);
  for (const e of s.built.entities) for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < v.W && ty < v.H) occ[ty * v.W + tx] = 1;
  const extras = nearExtras(s, 3);
  // the ground the brushes paint (an imported map's caves and overhangs stay as they are)
  const state = s.terrainState();
  const pre = state.pre;
  const roofed = new Uint8Array(v.W * v.H);
  for (const k of state.columns) roofed[k] = 1;
  const sites: Site[] = [];
  let why: string | undefined = cands.length ? undefined : "a lake is dug off the start's own area: none fits there";
  let searched = 0;
  for (const i of cands) {
    if (sites.length >= 8 || searched >= 60) break;
    const x = i % v.W;
    const y = (i - x) / v.W;
    searched++;
    // off the water, and the objects on the ground round it
    let wet = false;
    let objects = 0;
    for (let yy = Math.max(0, y - r0 - 1); yy <= Math.min(v.H - 1, y + r0 + 1); yy++)
      for (let xx = Math.max(0, x - r0 - 1); xx <= Math.min(v.W - 1, x + r0 + 1); xx++) {
        const d2 = (xx - x) ** 2 + (yy - y) ** 2;
        const k = yy * v.W + xx;
        if (d2 <= (r0 + 1) ** 2 && (v.water[k] > 0.05 || v.channel[k] || extras[k])) wet = true;
        if (d2 <= (r0 + 1) ** 2) objects += occ[k];
      }
    if (wet) {
      why ??= "every spot here touches water, or a relic, geothermal field or mine site that must stay off water: a lake is dug on dry ground away from them";
      continue;
    }
    // the patch the brush step paints (the place round the spot, as the step reads it), dug 2
    // levels deep, deeper on sloping ground (up to 6) until it holds the size asked for
    const place = resolve(v, { near: [x, y], within: r0 });
    if (!place.ok) continue;
    const disc = place.mask;
    const tiles: number[] = [];
    for (let k = 0; k < disc.length; k++) if (disc[k] && !roofed[k]) tiles.push(k);
    let h = { fills: false, level: 0, tiles: 0, low: 0 };
    let amount = 2;
    for (; amount <= 6; amount += 2) {
      const dug = pre.slice();
      for (const p of patchStrokes(pre, disc, tiles, v.W, v.H, { tool: "lower", amount, passes: 1 }).strokes) applyBrush(p, dug, v.W, v.H, (k) => !roofed[k]);
      h = hollowAt(dug, null, v.W, v.H, x, y);
      if (h.fills && h.tiles >= 9 && (!target || meets(target, h.tiles) || h.tiles >= want * 0.8)) break;
    }
    amount = Math.min(amount, 6);
    if (!h.fills || h.tiles < 9) {
      why ??= "the ground slopes away here: a hollow dug here would drain";
      continue;
    }
    sites.push({
      rank: 0,
      kind: "lake",
      at: [x, y],
      where: compassWords(v, x, y),
      course: courseInfo(v, x, y),
      step: { op: "brush", tool: "lower", where: { near: [x, y], within: r0 }, amount },
      then: { op: "addSource", kind: "water", at: [x, y], fillHollow: true },
      measured: { area: h.tiles, level: h.level, ...(objects ? { objectsOnIt: objects } : {}) },
      meetsSize: meets(target, h.tiles),
      report: [`a hollow dug ${amount} levels deep and ${2 * r0} tiles across; a spring fills it to level ${h.level}, about ${h.tiles} tiles`],
    });
  }
  // bare ground first: a pond there drowns nothing
  sites.sort((p, q2) => Number(!!p.measured.objectsOnIt) - Number(!!q2.measured.objectsOnIt));
  return { sites: spaced(sites, r0 * 2), searched, target, why: sites.length ? undefined : why };
}

/** A planned lake's outline (setups only: a corpus map with a lake, as documents from before D184
 *  hold them): an octagon where the lake planner fits one. */
function plannedLakes(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array, target?: SizeTarget): Found {
  const ctx = planContextOf(s);
  const sd = startDistance(v);
  const want = target ? (target.approx ?? ((target.min ?? 60) + (target.max ?? target.min ?? 60)) / 2) : Number(q.request?.area ?? 80);
  const r0 = Math.max(2, Math.sqrt(want / Math.PI) * 1.08);
  const cands = gridTiles(v, dilate(v, mask, r0), 150, Math.ceil(r0) + 4).filter((i) => !v.channel[i] && (!sd || sd[i] >= r0 + 8));
  // nearest the place first
  const ex = extent(v, mask);
  if (ex) cands.sort((a, b) => Number(!mask[a]) - Number(!mask[b]) || Math.hypot((a % v.W) - ex.centroid[0], Math.floor(a / v.W) - ex.centroid[1]) - Math.hypot((b % v.W) - ex.centroid[0], Math.floor(b / v.W) - ex.centroid[1]));
  const sites: Site[] = [];
  let why: string | undefined;
  let searched = 0;
  for (const i of cands) {
    if (sites.length >= 8 || searched >= 60) break;
    const x = i % v.W;
    const y = (i - x) / v.W;
    const outline = octagon(x, y, r0, r0);
    searched++;
    const r = planLake({ outline, ...(q.request?.level !== undefined ? { level: Number(q.request.level) } : {}), floorDepth: Number(q.request?.floorDepth ?? 2), spring: Number(q.request?.spring ?? 0.5) }, ctx, TMP, "claude");
    if (!r.ok) {
      why ??= r.errors[0];
      continue;
    }
    const area = r.tiles.length;
    sites.push({ rank: 0, kind: "lake", at: [x, y], where: compassWords(v, x, y), course: courseInfo(v, x, y), step: { op: "addLake", outline }, measured: { area, level: r.feature.kind === "lake" ? r.feature.params.outlet.sill : null }, meetsSize: meets(target, area), report: r.report });
  }
  return { sites: spaced(sites, r0 * 2), searched, target, why: sites.length ? undefined : why };
}

function landforms(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array): Found {
  const ctx: PlanContext = planContextOf(s);
  const sd = startDistance(v);
  const designedFor = s.spec?.designedFor ?? s.meta.designedFor;
  const t = sizeTarget("landform", q.size ?? "medium", { W: v.W, H: v.H, designedFor })!;
  const rise = sizeTarget("landformHeight", typeof q.size === "string" ? q.size : "medium", { W: v.W, H: v.H, designedFor })!;
  const d = t.approx!;
  const kind = q.kind as LandformFeature["params"]["kind"];
  const rx = kind === "ridge" ? d / 2 : d / 2;
  const ry = kind === "ridge" ? Math.max(2, d / 6) : d / 2;
  const cands = gridTiles(v, dilate(v, mask, Math.ceil(d / 2)), 150, Math.ceil(d / 2) + 2).filter((i) => !v.channel[i] && (!sd || sd[i] >= d / 2 + 8));
  const ex = extent(v, mask);
  if (ex) cands.sort((a, b) => Number(!mask[a]) - Number(!mask[b]) || Math.hypot((a % v.W) - ex.centroid[0], Math.floor(a / v.W) - ex.centroid[1]) - Math.hypot((b % v.W) - ex.centroid[0], Math.floor(b / v.W) - ex.centroid[1]));
  const sites: Site[] = [];
  let why: string | undefined;
  let searched = 0;
  for (const i of cands) {
    if (sites.length >= 8 || searched >= 50) break;
    const x = i % v.W;
    const y = (i - x) / v.W;
    const outline = octagon(x, y, rx, ry);
    // a landform must not bury a river, a lake or a set piece
    let blocked = false;
    for (let yy = Math.floor(y - ry); yy <= Math.ceil(y + ry) && !blocked; yy++)
      for (let xx = Math.floor(x - rx); xx <= Math.ceil(x + rx) && !blocked; xx++) {
        if (xx < 0 || yy < 0 || xx >= v.W || yy >= v.H) continue;
        const k = yy * v.W + xx;
        if (v.channel[k] || v.water[k] > 0.05) blocked = true;
      }
    searched++;
    if (blocked) {
      why ??= "every spot here would bury water: rivers and lakes are in the way";
      continue;
    }
    const lowering = kind === "canyon" || kind === "valley";
    const ground = v.heights[i];
    const height = q.request?.height !== undefined ? Number(q.request.height) : lowering ? Math.max(0, ground - rise.approx!) : Math.min(16, ground + rise.approx!);
    const edgeStyle = (q.request?.edgeStyle as LandformFeature["params"]["edgeStyle"]) ?? (kind === "plateau" ? "cliff" : "gentle");
    const r = planLandform({ outline, kind, height, edgeStyle }, ctx, TMP, "claude");
    if (!r.ok) {
      why ??= r.errors[0];
      continue;
    }
    sites.push({ rank: 0, kind: q.kind, at: [x, y], where: compassWords(v, x, y), course: courseInfo(v, x, y), step: { op: "addLandform", kind, outline, height, edgeStyle }, measured: { diameter: Math.round(2 * rx), area: r.tiles.length, height, rise: height - ground }, meetsSize: true, report: r.report });
  }
  return { sites: spaced(sites, d), searched, target: t, why: sites.length ? undefined : why };
}

// ----------------------------------------------------------------------------------- resources

/** Tiles a resource can stand on: trees and berries on moist, clean, dry-footed soil; ruins on dry
 *  ground (they keep moist land for farms, PLAN §9.7) with a neighbour at their level. */
function suitable(v: MapView, kind: "forest" | "berryPatch" | "ruinField", occupied: Uint8Array): Uint8Array {
  const m = new Uint8Array(v.W * v.H);
  for (let i = 0; i < m.length; i++) {
    if (occupied[i] || v.water[i] > 0 || v.channel[i]) continue;
    const moist = v.moisture[i] > 0 && !(v.soilContamination[i] > 0);
    if (kind === "ruinField" ? !(v.moisture[i] > 0) : moist) m[i] = 1;
  }
  return m;
}

function resources(s: MapSession, v: MapView, q: SiteQuery, mask: Uint8Array): Found {
  const kind = q.kind as "forest" | "berryPatch" | "ruinField";
  const designedFor = s.spec?.designedFor ?? s.meta.designedFor;
  const t = sizeTarget(kind === "berryPatch" ? "forest" : kind, q.size ?? "medium", { W: v.W, H: v.H, designedFor }) ?? undefined;
  const occupied = s.built.occupied;
  const ok = suitable(v, kind, occupied);
  const sd = startDistance(v);
  const rules = rulesFor(s.spec, s.meta.designedFor);
  const keep = kind === "ruinField" ? rules.ruinsWithin + 3 : 0;
  for (let i = 0; i < ok.length; i++) if (!mask[i] || (sd && sd[i] < keep)) ok[i] = 0;
  // the per-tile yield: a tree or bush per tile at density 1; ruins about 42 scrap per column
  const perTile = kind === "ruinField" ? 42 : 1;
  const want = t ? (t.approx ?? ((t.min ?? 50) + (t.max ?? t.min ?? 50)) / 2) : 60;
  const tilesWanted = Math.max(6, Math.round(want / perTile));
  // grow a compact patch from the densest suitable spot
  const W = v.W;
  let seed = -1;
  let bestN = -1;
  const grid = gridTiles(v, ok, 120, 2);
  for (const i of grid) {
    const x = i % W;
    const y = (i - x) / W;
    let n = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < v.H && ok[(y + dy) * W + x + dx]) n++;
    if (n > bestN) {
      bestN = n;
      seed = i;
    }
  }
  if (seed < 0) return { sites: [], searched: grid.length, target: t, why: kind === "ruinField" ? "no dry ground here (ruins keep off moist soil and stay clear of the start)" : "no moist, dry-footed soil here: trees and berries die off the river's moisture band" };
  const area: number[] = [];
  const seen = new Uint8Array(ok.length);
  const queue = [seed];
  seen[seed] = 1;
  const level = v.heights[seed];
  while (queue.length && area.length < tilesWanted) {
    const c = queue.shift()!;
    area.push(c);
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= v.H) continue;
      const n = yy * W + xx;
      if (seen[n] || !ok[n]) continue;
      if (kind === "ruinField" && v.heights[n] !== level) continue; // one flat level (PLAN §9.7)
      seen[n] = 1;
      queue.push(n);
    }
  }
  const x = seed % W;
  const y = (seed - x) / W;
  const got = area.length * perTile;
  const site: Site = {
    rank: 0,
    kind: q.kind,
    at: [x, y],
    where: compassWords(v, x, y),
    course: courseInfo(v, x, y),
    step: { op: "addResource", kind, where: q.where ?? { near: [x, y], within: 12 }, amount: Math.round(want), at: [x, y] },
    measured: kind === "ruinField" ? { area: area.length, scrap: got } : kind === "forest" ? { area: area.length, trees: got } : { area: area.length, bushes: got },
    meetsSize: meets(t, got) || got >= (t?.min ?? 0),
    report: [],
  };
  return { sites: [site], searched: grid.length, target: t, why: undefined };
}

/** The tiles a resource step would cover (the same growth as find_sites), for the step layer. */
export function resourceArea(s: MapSession, kind: "forest" | "berryPatch" | "ruinField", mask: Uint8Array, tilesWanted: number, seedAt?: [number, number]): number[] {
  const v = viewOf(s);
  const ok = suitable(v, kind, s.built.occupied);
  const rules = rulesFor(s.spec, s.meta.designedFor);
  const sd = startDistance(v);
  const keep = kind === "ruinField" ? rules.ruinsWithin + 3 : 0;
  for (let i = 0; i < ok.length; i++) if (!mask[i] || (sd && sd[i] < keep)) ok[i] = 0;
  const W = v.W;
  let seed = seedAt ? seedAt[1] * W + seedAt[0] : -1;
  if (seed < 0 || !ok[seed]) {
    let bestN = -1;
    for (const i of gridTiles(v, ok, 120, 2)) {
      const x = i % W;
      const y = (i - x) / W;
      let n = 0;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < v.H && ok[(y + dy) * W + x + dx]) n++;
      if (n > bestN) {
        bestN = n;
        seed = i;
      }
    }
  }
  if (seed < 0 || !ok[seed]) return [];
  const area: number[] = [];
  const seen = new Uint8Array(ok.length);
  const queue = [seed];
  seen[seed] = 1;
  const level = v.heights[seed];
  while (queue.length && area.length < tilesWanted) {
    const c = queue.shift()!;
    area.push(c);
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= v.H) continue;
      const n = yy * W + xx;
      if (seen[n] || !ok[n]) continue;
      if (kind === "ruinField" && v.heights[n] !== level) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return area;
}

export type { SetPieceKind };
