// The springs searched under the game's rules (planning's ruling on #236, D(new), with D271 and D311): the survey chose
// a place's sources under the port's water rules, so under the game's they can make water the place does not have. D271
// is the aim and the measure: the settled water over the place's real water (the observed-water mask) as high as it
// goes, over real dry land as low as it goes, by where each spring stands and how strong it is. The land is untouched.
//
// A search by turns over the sources, strongest first: each may keep its place and strength, run weaker (three
// quarters or half of today's, never under the official maps' 0.5 a second), go, or stand at the head of the largest
// body of real water (a feed in a real lake the land holds no river into). Never stronger than today. A change is kept
// when it raises the measure by `GAIN` tiles or more and the caller's `keep` passes (the checks that may not get worse:
// the start's water and the rest of its checks, sources at heads, no film above floor 0). Pure but for `settle`.

import { bodies } from "./placeWater";
import type { PlaceData } from "../../src/core/places/place";

/** The official maps' weakest spring, blocks a second (doc/waterFix.ts: they run 0.5–2). */
export const FEED_MIN = 0.5;
/** The strengths a source may run at, as shares of today's. */
export const FEED_SHARES = [0.75, 0.5] as const;
/** The least gain in the measure a change must bring, in tiles (less is the settle's noise). */
export const GAIN = 20;
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
    const d = (i % W - cx) ** 2 + (Math.floor(i / W) - cy) ** 2;
    if (d < bd) (bd = d), (best = i);
  }
  return best;
}

export interface FeedStep {
  source: number;
  from: [number, number, number];
  to: [number, number, number] | null;
  real: number;
  dry: number;
}

/**
 * The place with its sources searched by D271's measure. `settle` gives a candidate's settled depth under the game's
 * rules; `keep` says whether a candidate that scores better may be kept (the checks that may not get worse).
 */
export function searchFeeds(place: PlaceData, real: Uint8Array, settle: (p: PlaceData) => ArrayLike<number>, keep: (p: PlaceData) => boolean): { place: PlaceData; before: { real: number; dry: number }; after: { real: number; dry: number }; steps: FeedStep[] } {
  const { W, H } = place;
  const head = realHead(W, H, real);
  let cur = place;
  let m = realMeasure(settle(cur), real);
  const before = { real: m.real, dry: m.dry };
  const steps: FeedStep[] = [];
  // sources by identity: a removed one is null, so the turns keep their order
  let srcs: ([number, number, number] | null)[] = place.sources.map((s) => [...s] as [number, number, number]);
  const order = srcs.map((_, i) => i).sort((a, b) => srcs[b]![2] - srcs[a]![2] || a - b);
  const withSources = (s: typeof srcs): PlaceData => ({ ...place, ...cur, sources: s.filter((x): x is [number, number, number] => x !== null) });
  for (let turn = 0; turn < TURNS; turn++) {
    let changed = false;
    for (const i of order) {
      const was = srcs[i];
      if (!was) continue;
      const options: ([number, number, number] | null)[] = [];
      for (const share of FEED_SHARES) {
        const s = Math.round(Math.max(FEED_MIN, was[2] * share) * 1e6) / 1e6;
        if (s < was[2]) options.push([was[0], was[1], s]);
      }
      options.push(null);
      if (head !== null && (was[0] !== head % W || was[1] !== Math.floor(head / W)) && !srcs.some((o) => o && o[0] === head % W && o[1] === Math.floor(head / W)))
        for (const s of [was[2], ...FEED_SHARES.map((sh) => Math.max(FEED_MIN, was[2] * sh))]) options.push([head % W, Math.floor(head / W), Math.round(s * 1e6) / 1e6]);
      let best: { s: typeof srcs; m: ReturnType<typeof realMeasure>; to: [number, number, number] | null } | null = null;
      for (const to of options) {
        const s = srcs.slice();
        s[i] = to;
        if (!s.some((x) => x)) continue;
        const cand = withSources(s);
        const mm = realMeasure(settle(cand), real);
        if (mm.score < (best?.m.score ?? m.score) + GAIN) continue;
        if (!keep(cand)) continue;
        best = { s, m: mm, to };
      }
      if (best) {
        steps.push({ source: i, from: was, to: best.to, real: best.m.real, dry: best.m.dry });
        srcs = best.s;
        m = best.m;
        cur = withSources(srcs);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { place: cur, before, after: { real: m.real, dry: m.dry }, steps };
}
