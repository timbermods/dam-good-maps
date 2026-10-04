// A force has a visible effect wherever it is used (PLAN §20 D356): never "nothing happened", never
// "not here"; it adapts to where it is used, scaled by Power. The sweep behind the check: each force
// used the editor's way (its row's settings at a Power, nature drawing the rest, as the page sends them)
// at many places on generated maps, headless in the editor's own worker session (D342), on fixed seeds so
// it is the same every run. Carve, Craterize, Erupt and Glaciate are clicked; Quake is clicked (a short
// natural fault the land turns, D360) and given a short drawn fault through the place, Slide and Lift.
//
// "Visible": at least VISIBLE_TILES tiles change height by a level or more (a 3 × 3 patch). Used by
// tests/contract/forceEverywhere.test.ts (a sample, every run) and tests/contract/forceEverywhere.heavy.test.ts
// (every theme, nightly), and by tools/force-everywhere.ts (the full sweep and its report).

import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { DEFAULTS as CARVE_DEFAULTS, type CarveSettings } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS, type CraterSettings } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS, type EruptSettings } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS, type GlaciateSettings } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS, type QuakeSettings } from "../../src/core/forces/quake";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

/** Tiles that must change height (by a level or more) for a use to count as visible. */
export const VISIBLE_TILES = 9;

export type Use = "carve" | "craterize" | "erupt" | "glaciate" | "quake slide" | "quake lift" | "quake slide click" | "quake lift click";
export const USES: readonly Use[] = ["carve", "craterize", "erupt", "glaciate", "quake slide", "quake lift", "quake slide click", "quake lift click"];
export const POWERS = [10, 50, 90] as const;

/** Kinds of ground a place is picked for (plus plain random ones). */
export type Ground = "random" | "flat" | "water" | "peak" | "slope" | "edge" | "by the start";

export interface Place {
  x: number;
  y: number;
  ground: Ground;
}

export interface Outcome {
  theme: ThemeId;
  size: number;
  seed: number;
  use: Use;
  power: number;
  place: Place;
  /** Tiles whose height changed by a level or more. */
  changed: number;
  /** Why it would not start, when it would not (the worker's words). */
  refused: string | null;
  /** How long it took, worked out and shown to its end (ms). */
  ms: number;
}

/** A small fixed-seed generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate and open the map in the editor's session (its water deferred: the sweep is about land). */
export async function openMap(theme: ThemeId, size: number, seed: number) {
  await runGenerate(makeSpec({ seed, theme, size: { x: size, y: size } }));
  ed.refine();
  return MapSession.open(decodeProject(ed.project().bytes)).built;
}

/** The places to use the forces on a map: `random` plain random ones, and one of each kind of ground
 *  the map has (flat ground, water, a peak, a slope, the map's edge, beside the start). */
export function places(b: { W: number; H: number; heights: Uint8Array; water: ArrayLike<number>; start?: { x: number; y: number } | null }, random: number, next: () => number): Place[] {
  const { W, H, heights, water } = b;
  const at = (x: number, y: number) => heights[y * W + x];
  const out: Place[] = [];
  for (let k = 0; k < random; k++) out.push({ x: 2 + Math.floor(next() * (W - 4)), y: 2 + Math.floor(next() * (H - 4)), ground: "random" });
  const pick = (ground: Ground, ok: (x: number, y: number) => boolean, score: (x: number, y: number) => number = () => next()) => {
    let best: Place | null = null;
    let s = -Infinity;
    for (let y = 3; y < H - 3; y += 2)
      for (let x = 3; x < W - 3; x += 2) {
        if (!ok(x, y)) continue;
        const v = score(x, y) + next() * 0.01;
        if (v > s) {
          s = v;
          best = { x, y, ground };
        }
      }
    if (best) out.push(best);
  };
  const wet = (x: number, y: number) => water[y * W + x] > 0;
  const span = (x: number, y: number, r: number) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const h = at(Math.max(0, Math.min(W - 1, x + dx)), Math.max(0, Math.min(H - 1, y + dy)));
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    return hi - lo;
  };
  pick("flat", (x, y) => !wet(x, y) && span(x, y, 3) === 0);
  pick("water", wet);
  pick("peak", (x, y) => !wet(x, y), (x, y) => at(x, y));
  pick("slope", (x, y) => !wet(x, y) && span(x, y, 2) >= 3);
  const ex = next() < 0.5 ? 0 : W - 1;
  out.push({ x: ex, y: 4 + Math.floor(next() * (H - 8)), ground: "edge" });
  if (b.start) out.push({ x: Math.min(W - 1, b.start.x + 3), y: b.start.y, ground: "by the start" });
  return out;
}

/** The request the page sends for `use` at `power` at the place (`next` turns a fault's heading). */
function request(use: Use, power: number, p: Place, W: number, H: number, next: () => number): ed.ForceRequest {
  const origin: [number, number] = [p.x, p.y];
  const base = { cut: null, natural: true } as const;
  switch (use) {
    // (the rows' own settings, as the page sends them: every detail on Auto, for nature to draw)
    case "carve":
      return { verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "unleash", power, width: null, wander: null, walls: null, depth: null, riverDepth: 2, banks: null, dry: false, seed: 0 } as unknown as CarveSettings, origin, ...base };
    case "craterize":
      return { verb: "craterize", settings: { ...CRATER_DEFAULTS, mode: "strike", power, size: null, walls: null, centre: null, debris: null, rays: null } as unknown as CraterSettings, origin, ...base };
    case "erupt":
      return { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "vent", power, size: null, shape: null, summit: null, flows: null, ridges: null } as unknown as EruptSettings, origin, ...base };
    case "glaciate":
      return { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, mode: "flow", power, size: null, benches: null, steps: null, tarn: null, scree: null } as unknown as GlaciateSettings, origin, ...base };
    case "quake slide click":
    case "quake lift click":
      // a click: the page sends the tap itself (D360 (1b))
      return { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: use === "quake lift click" ? "lift" : "slide", power, scarp: null } as unknown as QuakeSettings, path: [{ x: p.x, y: p.y }, { x: p.x, y: p.y }], side: next() < 0.5 ? 1 : -1, ...base };
    default: {
      // a short fault through the place, 12 tiles, on the map
      const a = next() * Math.PI;
      const c = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));
      const path = [
        { x: c(p.x - 6 * Math.cos(a), W), y: c(p.y - 6 * Math.sin(a), H) },
        { x: c(p.x, W), y: c(p.y, H) },
        { x: c(p.x + 6 * Math.cos(a), W), y: c(p.y + 6 * Math.sin(a), H) },
      ];
      const lift = use === "quake lift";
      return { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: lift ? "lift" : "slide", power, scarp: null } as unknown as QuakeSettings, path, side: next() < 0.5 ? 1 : -1, ...(lift ? { painting: true } : {}), ...base };
    }
  }
}

/** Use it once, to its end, as the page shows it: what its final land changed (its last frame, the
 *  land the page shows before the keep), then taken back (the map as it was). Refused: why. */
export function useAt(use: Use, power: number, p: Place, W: number, H: number, next: () => number): { changed: number; refused: string | null; ms: number } {
  const t0 = performance.now();
  const before = ed.terrainNow().heights.slice();
  const r = ed.forceStart(request(use, power, p, W, H, next));
  if (!r.ok || !r.frame) return { changed: 0, refused: r.errors[0] ?? "refused", ms: Math.round(performance.now() - t0) };
  let shown = r.frame.heights ?? before;
  if (use !== "quake lift")
    for (let k = 0; k < 20000; k++) {
      const f = ed.forceAdvance(64);
      if (!f) break;
      if (f.heights) shown = f.heights;
      if (f.done) break;
    }
  ed.forceCancel();
  let changed = 0;
  for (let i = 0; i < shown.length; i++) if (Math.abs(shown[i] - before[i]) >= 1) changed++;
  return { changed, refused: null, ms: Math.round(performance.now() - t0) };
}

/** Every use at every Power at the map's places. */
export async function sweep(theme: ThemeId, size: number, seed: number, random: number, uses: readonly Use[] = USES, powers: readonly number[] = POWERS): Promise<Outcome[]> {
  const b = await openMap(theme, size, seed);
  const next = rng(seed * 7919 + size);
  const out: Outcome[] = [];
  for (const place of places(b, random, next))
    for (const use of uses)
      for (const power of powers) {
        const r = useAt(use, power, place, b.W, b.H, next);
        out.push({ theme, size, seed, use, power, place, ...r });
      }
  return out;
}

/** The uses that did nothing visible. */
export const invisible = (o: readonly Outcome[]) => o.filter((r) => r.changed < VISIBLE_TILES);

/** One line per use that did nothing visible. */
export function describe(o: Outcome): string {
  return `${o.use} at Power ${o.power}, ${o.theme} ${o.size}² seed ${o.seed}, ${o.place.ground} (${o.place.x}, ${o.place.y}): ${o.refused ? `refused: "${o.refused}"` : `${o.changed} tiles changed`}`;
}

/** What the sweep found doing nothing visible, kept for Kyler (D356: a force that works only in narrow
 *  situations becomes an option or is dropped; he decides). Each is allowed here until it is decided,
 *  and the check fails on anything else. Emptied by D360 (1) (Carve clicked at the map's edge carves
 *  inward, and a Quake click makes a short fault); a `theme` limits an entry to that theme's maps. */
export const KNOWN: readonly { use: Use; ground: Ground; power: number; theme?: ThemeId; why: string }[] = [
  // (M9b's maps, 2026-10-02: Delta's alluvial plain and an Islands sea at the edge give a slide no slope
  // within its reach, so it moves nothing; for Kyler, D356)
  ...([["quake slide", "random", 10], ["quake slide click", "random", 10], ["quake slide", "flat", 10], ["quake slide click", "flat", 50], ["quake slide click", "flat", 90]] as const).map(([use, ground, power]) => ({ use, ground, power, theme: "delta" as ThemeId, why: "Delta 128² seed 5's plain: no slope for the slide" })),
  { use: "quake slide", ground: "edge", power: 90, theme: "islands", why: "Islands 128² seed 5: the sea at the map's edge, no slope for the slide" },
];

/** The uses that did nothing visible and are not among the known ones. */
export const unexpected = (o: readonly Outcome[]) => invisible(o).filter((r) => !KNOWN.some((k) => k.use === r.use && k.ground === r.place.ground && k.power === r.power && (!k.theme || k.theme === r.theme)));
