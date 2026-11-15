// The springs searched under the game's rules (planning's ruling on #236, D(new), with D271 and D311): the survey chose
// a place's sources under the port's water rules, so under the game's they can make water the place does not have. D271
// is the aim and the measure: the settled water over the place's real water (the observed-water mask) as high as it
// goes, over real dry land as low as it goes, by where each spring stands and how strong it is. The land is untouched.
//
// A search by turns over the sources, strongest first: each may keep its place and strength, run weaker (three
// quarters or half of today's, never under the official maps' 0.5 a second), go, or stand at the head of the largest
// body of real water (a feed in a real lake the land holds no river into). Never stronger than today. Two steps more
// (D(new-films), planning's rulings of 2026-11-15): a place with no real water (no body of 30 tiles in the mask) first
// tries D245's water floor, one spring for all of them (each of its own alone, at its strengths, or a spring by the
// start: `opts.springs`); and once no single change gains, two or three sources go together (`DROP_GROUPS`). A change
// is kept when it raises the measure by `GAIN` tiles or more, holds the real water (`REAL_HELD`) and the caller's `keep` passes (the checks that may not get worse: the start's water first and the rest
// of its checks, sources at heads, no film above floor 0). Pure but for `settle`.

import { bodies, FILM_DEPTH, FILM_TILES } from "./placeWater";
import { floor0Sheet } from "./placeBasins";
import type { PlaceData } from "../../src/core/places/place";

/** The official maps' weakest spring, blocks a second (doc/waterFix.ts: they run 0.5–2). */
export const FEED_MIN = 0.5;
/** The strengths a source may run at, as shares of today's. */
export const FEED_SHARES = [0.75, 0.5] as const;
/** The least gain in the measure a change must bring, in tiles (less is the settle's noise). */
export const GAIN = 20;
/** The real water a turn may cost, as a share of what the place had (planning: the water over real water is held, the
 *  rest brought down); never less than `GAIN` tiles, the settle's noise. The steps D(new-films) adds (one spring, sources
 *  gone together) cost none, and once one is taken no later step goes under the real water it started from (planning's
 *  ruling of 2026-11-15: the water over real water stays at or above today's on every place). */
export const REAL_HELD = 0.02;
/** The largest group of sources that go together in one step, and the most groups of one size tried (a size with more
 *  is not tried: every group is a settle). */
export const DROP_GROUPS = { most: 3, tries: 28 } as const;
/** Turns over the sources. */
const TURNS = 2;

/** D271's measure of a settled water: wet tiles over real water less wet tiles over real dry land. */
export function realMeasure(depth: ArrayLike<number>, real: Uint8Array, wet = 0.05): { real: number; dry: number; score: number } {
  let r = 0;
  let d = 0;
  for (let i = 0; i < depth.length; i++)
    if (depth[i] > wet) {
      if (real[i]) r++;
      else d++;
    }
  return { real: r, dry: d, score: r - d };
}

/** The water over real dry land in two parts (D(new-films), planning's ruling of 2026-11-15: the measure splits, it does
 *  not forgive): the floor-0 sheet (wet tiles on floor 0 no deeper than `FILM_DEPTH`, in bodies of `FILM_TILES` or more,
 *  held by the edge's spill, D303) and everything else; with the water over real water. */
export function realParts(depth: ArrayLike<number>, floor: ArrayLike<number>, W: number, H: number, real: Uint8Array): { real: number; dry: number; sheet: number; rest: number } {
  const m = realMeasure(depth, real);
  const sheet = floor0Sheet(depth, floor, W, H, real, FILM_DEPTH, FILM_TILES).dry;
  return { real: m.real, dry: m.dry, sheet, rest: m.dry - sheet };
}

/** The head of the largest body of real water: its tile nearest the body's middle, or null when it has none of 30+. */
export function realHead(W: number, H: number, real: Uint8Array): number | null {
  const mask = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = real[i] ? 1 : 0;
  const all = bodies(mask, W, H);
  if (!all.length) return null;
  const big = all.reduce((a, b) => (b.length > a.length ? b : a));
  let sx = 0;
  let sy = 0;
  for (const i of big) {
    sx += i % W;
    sy += Math.floor(i / W);
  }
  const cx = sx / big.length;
  const cy = sy / big.length;
  let best = big[0];
  let bd = Infinity;
  for (const i of big) {
    const dx = (i % W) - cx;
    const dy = Math.floor(i / W) - cy;
    const d = dx * dx + dy * dy;
    if (d < bd) (bd = d), (best = i);
  }
  return best;
}

/** A candidate that raised the measure by `GAIN` or more but that `keep` refused, and why. */
export interface FeedRefusal {
  source: number;
  from: [number, number, number];
  to: [number, number, number] | null;
  real: number;
  dry: number;
  why: string;
}

export interface FeedStep {
  /** "turn": one source changed; "one spring": every source for one (D245's water floor); "group": sources gone together. */
  kind: "turn" | "one spring" | "group";
  source: number;
  from: [number, number, number];
  to: [number, number, number] | null;
  /** For "one spring" and "group": every source before and after. */
  was?: [number, number, number][];
  now?: [number, number, number][];
  real: number;
  dry: number;
}

type Src = [number, number, number];
type Measure = ReturnType<typeof realMeasure>;
type Scores = (mm: Measure, now: Measure, over?: number) => boolean;

/**
 * The place with its sources searched by D271's measure. `settle` gives a candidate's settled depth under the game's
 * rules; `keep` says why a candidate that scores better may not be kept (the checks that may not get worse), or null.
 * `dryNotUp`: no step may raise the water over real dry land (for a place whose search ended with more of it).
 * `springs`: for a place with no real water, the springs by its start to try as its one spring (each a group of
 * sources, src/core/places/spring.ts).
 */
export function searchFeeds(
  place: PlaceData,
  real: Uint8Array,
  settle: (p: PlaceData) => ArrayLike<number>,
  keep: (p: PlaceData) => string | null,
  opts: { dryNotUp?: boolean; springs?: () => Src[][] } = {},
): FeedSearch {
  // a place with no real water is searched both ways, the one spring first and without it, and keeps the better (the one
  // spring taken first can end above the turns alone)
  const turnsOnly = search(place, real, settle, keep, opts, false);
  if (realHead(place.W, place.H, real) !== null || place.sources.length < 2) return turnsOnly;
  const one = search(place, real, settle, keep, opts, true);
  return one.steps[0]?.kind === "one spring" && one.after.real - one.after.dry > turnsOnly.after.real - turnsOnly.after.dry ? one : turnsOnly;
}

type FeedSearch = { place: PlaceData; before: { real: number; dry: number }; after: { real: number; dry: number }; steps: FeedStep[]; refused: FeedRefusal[] };

function search(place: PlaceData, real: Uint8Array, settle: (p: PlaceData) => ArrayLike<number>, keep: (p: PlaceData) => string | null, opts: { dryNotUp?: boolean; springs?: () => Src[][] }, oneSpring: boolean): FeedSearch {
  const { W, H } = place;
  const head = realHead(W, H, real);
  let cur = place;
  let m = realMeasure(settle(cur), real);
  const before = { real: m.real, dry: m.dry };
  let realFloor = before.real - Math.max(GAIN, Math.floor(before.real * REAL_HELD));
  const steps: FeedStep[] = [];
  const refused: FeedRefusal[] = [];
  const as = (s: readonly Src[]): PlaceData => ({ ...cur, sources: s.map((x) => [...x] as Src) });
  // a candidate kept by the measure: the real water held, no more water over real dry land where `dryNotUp` says so,
  // and a gain of `GAIN` over the water it would replace (`now`) and over the best candidate so far (`over`)
  const scores: Scores = (mm, now, over = now.score) => mm.real >= realFloor && !(opts.dryNotUp && mm.dry > now.dry) && mm.score >= over + GAIN;
  // a step D(new-films) adds: no real water lost from where it starts, and none under it after
  const held = (mm: Measure) => mm.real >= m.real;
  const hold = () => void (realFloor = Math.max(realFloor, m.real));
  // the strength a source had before the search (where it stands now), or its own
  const todayOf = (s: Src) => place.sources.find((o) => o[0] === s[0] && o[1] === s[1])?.[2] ?? s[2];
  // the best of several whole source lists by the measure that `keep` passes (the measure first: a keep is a build)
  const bestOf = (lists: Src[][], tag: (s: Src[]) => { source: number; from: Src; to: Src | null }): { s: Src[]; m: ReturnType<typeof realMeasure> } | null => {
    const scored = lists.map((s) => ({ s, m: realMeasure(settle(as(s)), real) })).filter((c) => scores(c.m, m) && held(c.m));
    scored.sort((a, b) => b.m.score - a.m.score);
    for (const c of scored) {
      const why = keep(as(c.s));
      if (!why) return c;
      refused.push({ ...tag(c.s), real: c.m.real, dry: c.m.dry, why });
    }
    return null;
  };
  // D245's water floor for a place with no real water: one spring for all (each of its own alone, at the strengths it may
  // run at, or a spring by the start)
  if (oneSpring) {
    const lists: Src[][] = [];
    for (const s of place.sources) for (const st of strengthsOf(s[2])) lists.push([[s[0], s[1], st]]);
    for (const g of opts.springs?.() ?? []) lists.push(g.map((x) => [...x] as Src));
    const one = bestOf(lists, (s) => ({ source: -1, from: place.sources[0], to: s[0] }));
    if (one) {
      hold();
      steps.push({ kind: "one spring", source: -1, from: place.sources[0], to: one.s[0], was: place.sources.map((x) => [...x] as Src), now: one.s, real: one.m.real, dry: one.m.dry });
      cur = as(one.s);
      m = one.m;
    }
  }
  // the turns, then sources gone together where no single change gains, then the turns again
  for (let round = 0; round < 4; round++) {
    const t = turns(cur, real, head, settle, keep, m, scores, todayOf, steps, refused);
    cur = t.place;
    m = t.m;
    const now = cur.sources;
    if (now.length < 3) break;
    const groups: Src[][] = [];
    const gone: number[][] = [];
    for (let size = 2; size <= DROP_GROUPS.most && size < now.length; size++) {
      const of = combinations(now.length, size);
      if (of.length > DROP_GROUPS.tries) break;
      for (const c of of) {
        groups.push(now.filter((_, i) => !c.includes(i)));
        gone.push(c);
      }
    }
    const g = bestOf(groups, (s) => ({ source: -1, from: now.find((x) => !s.includes(x))!, to: null }));
    if (!g) break;
    hold();
    steps.push({ kind: "group", source: -1, from: now.find((x) => !g.s.includes(x))!, to: null, was: now.map((x) => [...x] as Src), now: g.s, real: g.m.real, dry: g.m.dry });
    cur = as(g.s);
    m = g.m;
  }
  return { place: cur, before, after: { real: m.real, dry: m.dry }, steps, refused };
}

/** The strengths a source of strength `today` may run at: today's, or a share of it, never under FEED_MIN unless today's is. */
function strengthsOf(today: number): number[] {
  return [today, ...FEED_SHARES.map((sh) => Math.round(Math.min(today, Math.max(FEED_MIN, today * sh)) * 1e6) / 1e6)].filter((s, k, all) => all.indexOf(s) === k);
}

/** Every group of `k` of `n` indices, in order. */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (from: number, c: number[]) => {
    if (c.length === k) return void out.push(c);
    for (let i = from; i < n; i++) pick(i + 1, [...c, i]);
  };
  pick(0, []);
  return out;
}

/** The turns over `place`'s sources, strongest first (each keeps, runs weaker, goes or moves to the real water's head). */
function turns(
  place: PlaceData,
  real: Uint8Array,
  head: number | null,
  settle: (p: PlaceData) => ArrayLike<number>,
  keep: (p: PlaceData) => string | null,
  m0: Measure,
  scores: Scores,
  todayOf: (s: Src) => number,
  steps: FeedStep[],
  refused: FeedRefusal[],
): { place: PlaceData; m: ReturnType<typeof realMeasure> } {
  const { W } = place;
  let cur = place;
  let m = m0;
  // sources by identity: a removed one is null, so the turns keep their order
  let srcs: (Src | null)[] = place.sources.map((s) => [...s] as Src);
  const order = srcs.map((_, i) => i).sort((a, b) => srcs[b]![2] - srcs[a]![2] || a - b);
  const withSources = (s: typeof srcs): PlaceData => ({ ...cur, sources: s.filter((x): x is Src => x !== null) });
  for (let turn = 0; turn < TURNS; turn++) {
    let changed = false;
    for (const i of order) {
      const was = srcs[i];
      if (!was) continue;
      // the strengths it may run at: today's, or a share of today's (never of a strength an earlier turn gave it)
      const strengths = strengthsOf(todayOf(place.sources[i]));
      const options: (Src | null)[] = [];
      for (const s of strengths) if (s < was[2]) options.push([was[0], was[1], s]);
      options.push(null);
      if (head !== null && (was[0] !== head % W || was[1] !== Math.floor(head / W)) && !srcs.some((o) => o && o[0] === head % W && o[1] === Math.floor(head / W)))
        for (const s of strengths) options.push([head % W, Math.floor(head / W), s]);
      let best: { s: typeof srcs; m: ReturnType<typeof realMeasure>; to: Src | null } | null = null;
      for (const to of options) {
        const s = srcs.slice();
        s[i] = to;
        if (!s.some((x) => x)) continue;
        const cand = withSources(s);
        const mm = realMeasure(settle(cand), real);
        if (!scores(mm, m, best?.m.score)) continue;
        const why = keep(cand);
        if (why) {
          refused.push({ source: i, from: was, to, real: mm.real, dry: mm.dry, why });
          continue;
        }
        best = { s, m: mm, to };
      }
      if (best) {
        steps.push({ kind: "turn", source: i, from: was, to: best.to, real: best.m.real, dry: best.m.dry });
        srcs = best.s;
        m = best.m;
        cur = withSources(srcs);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { place: cur, m };
}
