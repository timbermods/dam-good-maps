// Showcase mode (D488 (2)): a search the player asks for explicitly, allowed minutes, for maps with an
// arc, offering the best three. The arc is six beats a map can have, each measured on the finished map
// and said in a player's words: an opening vista, a first-drought choice, a valley behind a gate, a
// late-game project, a landmark in the colony's view and a mystery (`arcOf`). The search makes
// siblings of the asked map in order, as Another like this does (versions.ts `siblingSpec`: the same
// seed, theme, settings and intentions on other land, `variation` 0, 1, 2, …), so every map it offers
// has its own share link and regenerates byte for byte; a map that fails any absolute is never offered.
// For a given spec and number of candidates tried the result is the same everywhere (`tried` is
// recorded: `showcaseSearch(spec, { tries })` reproduces it).
//
// The measures reuse what the generator already reads: the intentions' checks (land/intentions.ts
// `checkIntention` on `finalCtx`), the dam sites the checks measured (`analysis.damSites`), the falls
// and the walk from the start. New ones are plain functions here or in analysis/: the game's opening
// camera's frame (`openingFrame`), the standing forms (analysis/vertical.ts `standingForms`), the
// places to pump near the start through the first drought (`pumpPlaces`).

import { sameLand } from "../analysis/story";
import { standingForms, type StandingForm } from "../analysis/vertical";
import { PUMP_CLEAN, PUMP_DEPTH, tileShoreWalk } from "../analysis/walk";
import type { Orientation } from "../format/footprints";
import { checkIntention, type FinalCtx } from "../land/intentions";
import * as portable from "../math/portable";
import type { MapSpec } from "../spec/mapspec";
import { droughtStorage } from "../sim/drought";
import { FIRST_DROUGHT_DAYS, generate, type GenerateResult } from "./generate";
import { finalCtx } from "./intentions";
import { compass } from "./names";
import { siblingSpec } from "./versions";

export const BEATS = ["vista", "drought", "valley", "project", "landmark", "mystery"] as const;
export type BeatId = (typeof BEATS)[number];

/** Each beat in a few words (the page's labels). */
export const BEAT_NAMES: Record<BeatId, string> = {
  vista: "An opening vista",
  drought: "A first-drought choice",
  valley: "A valley behind a gate",
  project: "A late-game project",
  landmark: "A landmark in view",
  mystery: "A mystery",
};

export interface Beat {
  met: boolean;
  /** How strongly the map has it, 0–1 (a beat not met may still show some of it). */
  strength: number;
  /** What the map shows, in a player's words, with its own numbers (when met). */
  say?: string;
}

export type Arc = Record<BeatId, Beat>;

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const levels = (n: number) => `${Math.round(n)}-level`;
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six"];
const words = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "a" or "an" before a number said aloud (an 8, an 11, an 18, an 80, an 800). */
const an = (n: number) => {
  const t = String(Math.round(n));
  return t.startsWith("8") || ((t.length === 2 || t.length === 5) && (t.startsWith("11") || t.startsWith("18"))) ? "an" : "a";
};

// ---------------------------------------------------------------------------- the opening camera

/** The new game's camera turns this far past the start's orientation (investigation/notes/
 *  blocks_and_placement.md §3; render3d/hero.ts `heroYaw`), clockwise from north. */
export const OPENING_TURN = 35;

/** The ground the game's opening camera frames round the start (60° pitch), in tiles along the way
 *  it looks (`ahead` from the start, negative toward the camera) and across: a trapezoid widening
 *  away from the camera. An interim estimate of the game's frame at its opening zoom: the opening-shot
 *  step (feature/opening-shot, docs/progress/showcase.md) brings the core's own frame, and the vista and
 *  landmark beats switch to it when it lands. */
export const OPENING_FRAME = { behind: 14, ahead: 30, half: 20, spread: 0.35 } as const;

/** The way the opening camera looks, as a unit step in tiles (x east, y north): the start's
 *  orientation × 90° + 35° clockwise from north. */
export function openingLook(orientation: Orientation): { fx: number; fy: number; degrees: number } {
  const degrees = ({ Cw0: 0, Cw90: 90, Cw180: 180, Cw270: 270 } as const)[orientation] + OPENING_TURN;
  const a = (degrees * Math.PI) / 180;
  return { fx: portable.sin(a), fy: portable.cos(a), degrees };
}

/** cot 60°, the opening camera's pitch. */
const COT_PITCH = 0.57735;

/** Whether a point `rise` levels over the ground at (x, y) shows in the opening camera's frame
 *  (`OPENING_FRAME`) round `start`. Looking down at 60°, a point up in the air shows where the ground
 *  `rise` × cot 60° beyond it would: a tall form standing just short of the frame's near edge still
 *  stands up into the picture. */
export function openingView(start: { x: number; y: number }, orientation: Orientation): (x: number, y: number, rise?: number) => boolean {
  const { fx, fy } = openingLook(orientation);
  const F = OPENING_FRAME;
  return (x, y, rise = 0) => {
    const dx = x - start.x;
    const dy = y - start.y;
    const u = dx * fx + dy * fy + rise * COT_PITCH;
    const v = dx * fy - dy * fx;
    return u >= -F.behind && u <= F.ahead && Math.abs(v) <= F.half + F.spread * (u + F.behind);
  };
}


/** 1 on the ground the opening camera frames (`OPENING_FRAME`) round `start`. */
export function openingFrame(W: number, H: number, start: { x: number; y: number }, orientation: Orientation): Uint8Array {
  const view = openingView(start, orientation);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (view(x, y)) out[y * W + x] = 1;
  return out;
}

// ---------------------------------------------------------------------------- the waters near the start

/** How far a pumping place may be from the start, in tiles' walk, to count in the first drought's choice. */
export const DROUGHT_WALK = 30;
/** Two pumping places are two choices when they stand this far apart, or more, on whatever water. */
const WATERS_APART = 8;

export interface PumpPlace {
  /** The water tile, and the walk to the nearest shore a pump on it works from. */
  tile: number;
  walk: number;
  /** A pump there still reaches its water after the first drought. */
  holds: boolean;
}

/** The places to pump within `DROUGHT_WALK` of the start, nearest first, each `WATERS_APART` from the
 *  others, whichever water they are on (a river and the pool it runs through are one body of water but
 *  two choices), and whether each holds through the first drought (`kept`: the water left after
 *  `FIRST_DROUGHT_DAYS`, as the generator reads the start's water). The places that hold are spread
 *  first, then those that dry, so the nearest of each kind is always among them. */
export function pumpPlaces(c: FinalCtx, kept: ArrayLike<number>): PumpPlace[] {
  const { W, H, h, D, C } = c;
  const all: PumpPlace[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!(D[i] >= PUMP_DEPTH) || !(C[i] < PUMP_CLEAN)) continue;
    const walk = tileShoreWalk(c.walk, h, W, H, i, D[i], true);
    if (!(walk <= DROUGHT_WALK)) continue;
    all.push({ tile: i, walk, holds: tileShoreWalk(c.walk, h, W, H, i, kept[i], true) <= DROUGHT_WALK });
  }
  all.sort((a, b) => a.walk - b.walk || a.tile - b.tile);
  const out: PumpPlace[] = [];
  for (const holds of [true, false])
    for (const p of all) {
      if (p.holds !== holds) continue;
      const px = p.tile % W;
      const py = (p.tile - px) / W;
      if (!out.some((o) => portable.hypot((o.tile % W) - px, Math.floor(o.tile / W) - py) < WATERS_APART)) out.push(p);
    }
  return out.sort((a, b) => a.walk - b.walk || a.tile - b.tile);
}

// ---------------------------------------------------------------------------- the beats

/** The colony's reach for a landmark in its view: within this many tiles of the start. */
export const LANDMARK_REACH = 50;

/** Farmland a colony grows into, reached the long way round (a pass, a ramp or a ford): a level,
 *  moist, clean patch of 400+ tiles (at 128²) past the start's own, its nearest tile 15–70 tiles off
 *  and at least 1.8 times as far on foot. */
function farmlandTheLongWay(c: FinalCtx): { tiles: number; walk: number; dist: number; x: number; y: number } | null {
  const { W, H, h, D, C, start } = c;
  const N = W * H;
  const farm = new Uint8Array(N);
  for (let i = 0; i < N; i++) farm[i] = c.moist[i] > 0 && !(D[i] > 0.05) && C[i] < 0.05 ? 1 : 0;
  const want = (400 * N) / 16384;
  const seen = new Uint8Array(N);
  let best: ReturnType<typeof farmlandTheLongWay> = null;
  for (let s = 0; s < N; s++) {
    if (!farm[s] || seen[s]) continue;
    const q = [s];
    seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || !farm[j] || Math.abs(h[j] - h[i]) > 1) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    if (q.length < want) continue;
    let entry = -1;
    for (const i of q) if (Number.isFinite(c.walk[i]) && (entry < 0 || c.walk[i] < c.walk[entry])) entry = i;
    if (entry < 0 || c.walk[entry] <= 20) continue;
    const ex = entry % W;
    const ey = (entry - ex) / W;
    const dist = portable.sqrt((ex - start.x) * (ex - start.x) + (ey - start.y) * (ey - start.y));
    if (dist < 15 || dist > 70 || c.walk[entry] < 1.8 * dist) continue;
    if (!best || q.length > best.tiles) best = { tiles: q.length, walk: c.walk[entry], dist, x: ex, y: ey };
  }
  return best;
}

function formWord(f: StandingForm): string {
  return f.tiles.length <= 30 ? "spire" : f.tiles.length <= 120 ? "butte" : "mesa";
}

type View = (x: number, y: number, rise?: number) => boolean;

/** Whether a standing form shows in the opening view: its ground in the frame, or its top standing up
 *  into it (`openingView` with its height). */
function formInView(f: StandingForm, W: number, view: View): boolean {
  const px = f.peak % W;
  if (view(px, (f.peak - px) / W, f.prominence)) return true;
  return f.tiles.some((i) => view(i % W, Math.floor(i / W)));
}

/** The opening camera's frame as the arc reads it: its relief, its water, its tallest fall and its
 *  most prominent standing form. */
function vistaBeat(c: FinalCtx, view: View, forms: readonly StandingForm[], sayForm: boolean): Beat {
  const { W, H, h, D } = c;
  let lo = Infinity;
  let hi = -Infinity;
  let n = 0;
  let wet = 0;
  let fall = 0;
  const drops = new Map(c.falls.map((f) => [f.i, f.drop]));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!view(x, y)) continue;
      const i = y * W + x;
      n++;
      if (h[i] < lo) lo = h[i];
      if (h[i] > hi) hi = h[i];
      if (D[i] >= 0.1) wet++;
      const d = drops.get(i);
      if (d !== undefined && d > fall) fall = d;
    }
  if (!n) return { met: false, strength: 0 };
  const relief = hi - lo;
  const share = wet / n;
  const form = forms.find((f) => formInView(f, W, view));
  const prom = form?.prominence ?? 0;
  const parts: string[] = [];
  if (relief >= 6) parts.push(`${relief} levels of relief`);
  if (share >= 0.04) parts.push("open water");
  if (fall >= 2) parts.push(`${an(fall)} ${levels(fall)} fall`);
  // (the form is the landmark beat's to say when that beat has it)
  if (form && prom >= 6) parts.push(sayForm ? `${an(prom)} ${levels(prom)} ${formWord(form)}` : `the ${formWord(form)}`);
  const strength = (clamp01((relief - 3) / 9) + clamp01(share / 0.12) + Math.max(fall >= 2 ? clamp01(fall / 5) : 0, prom >= 6 ? clamp01((prom - 3) / 9) : 0)) / 3;
  // (relief alone is every rugged map's: the view needs two things to see and some strength)
  const met = parts.length >= 2 && strength >= 0.6;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return { met, strength, ...(met ? { say: `The opening view takes in ${list}.` } : {}) };
}

/** The first drought's choice: places to pump near the start, some running dry in the first drought
 *  and some holding (`pumpPlaces`). Strongest when the nearest water is the one that runs dry: the
 *  easy pump is the trap, and the colony that pumps the farther water, or stores some, is ready. */
function droughtBeat(c: FinalCtx, kept: ArrayLike<number>): Beat {
  const places = pumpPlaces(c, kept);
  const holds = places.filter((p) => p.holds);
  const dries = places.filter((p) => !p.holds);
  if (!holds.length || !dries.length) return { met: false, strength: holds.length ? 0.25 : 0 };
  const trap = dries[0].walk < holds[0].walk;
  const strength = 0.55 + (trap ? 0.3 : 0) + 0.15 * clamp01((places.length - 2) / 3);
  const say = trap
    ? `The nearest water, ${Math.round(dries[0].walk)} tiles' walk from the start, runs low in the first drought; water ${Math.round(holds[0].walk)} tiles' walk away holds.`
    : `Water ${Math.round(holds[0].walk)} tiles' walk from the start holds through the first drought; the water ${Math.round(dries[0].walk)} tiles' walk away runs low.`;
  return { met: true, strength, say };
}

/** A feature two beats could claim (a plug holding back a lake, a district behind debris): it counts
 *  in one only (`arcOf`). */
type Shared = { say: string } | null;

function valleyBeat(c: FinalCtx, district: Shared): Beat {
  const says: string[] = [];
  for (const id of ["hidden-valley", "farmland-past-gorge"] as const) {
    const r = checkIntention(id, c);
    if (r.ok && r.say) says.push(r.say);
  }
  if (district) says.push(district.say);
  const far = farmlandTheLongWay(c);
  if (far) says.push(`${far.tiles} tiles of farmland lie ${Math.round(far.dist)} tiles ${compass(c.start.x, c.start.y, far.x, far.y)}, reached the long way round: ${Math.round(far.walk)} tiles' walk.`);
  if (!says.length) return { met: false, strength: 0 };
  return { met: true, strength: Math.min(1, 0.55 + 0.15 * (says.length - 1)), say: says[0] };
}

/** The strongest of several readings, with its words: met at 0.5. */
function strongest(): { take(s: number, line: string): void; beat(): Beat } {
  let strength = 0;
  let say: string | undefined;
  return {
    take(s, line) {
      if (s > strength) {
        strength = s;
        say = line;
      }
    },
    beat: () => ({ met: strength >= 0.5, strength, ...(strength >= 0.5 && say ? { say } : {}) }),
  };
}

function projectBeat(c: FinalCtx, r: GenerateResult, plug: Shared): Beat {
  const scale = (c.W * c.H) / 16384;
  const best = strongest();
  // a natural narrows a dam of 4–14 tiles closes, holding a large reservoir (a dam of a tile or two
  // across a lake's outlet is an early fix, not a project)
  const sites = (r.analysis?.damSites ?? []).filter((d) => d.length >= 4 && d.length <= 14);
  let dam = sites[0] ?? null;
  for (const d of sites) if (d.volume > dam!.volume) dam = d;
  if (dam && dam.volume >= 1000 * scale) {
    const d = Math.round(portable.sqrt((dam.x - c.start.x) * (dam.x - c.start.x) + (dam.y - c.start.y) * (dam.y - c.start.y)));
    const held = String(Math.round(dam.volume / 100) * 100).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    best.take(0.5 + 0.5 * clamp01((dam.volume - 1000 * scale) / (3000 * scale)), `${capital(an(dam.length))} ${dam.length}-tile dam across a narrows ${d} tiles ${compass(c.start.x, c.start.y, dam.x, dam.y)} of the start would hold ${held} water.`);
  }
  if (plug) best.take(0.85, plug.say);
  const high = checkIntention("high-lake", c);
  if (high.ok && high.say) best.take(0.75, high.say);
  return best.beat();
}

function landmarkBeat(c: FinalCtx, view: View, forms: readonly StandingForm[]): Beat {
  const { W, start } = c;
  let strength = 0;
  let say: string | undefined;
  for (const f of forms) {
    if (f.prominence < 8) break;
    let near = Infinity;
    for (const i of f.tiles) {
      const x = i % W;
      const y = (i - x) / W;
      near = Math.min(near, portable.sqrt((x - start.x) * (x - start.x) + (y - start.y) * (y - start.y)));
    }
    const reach = near <= LANDMARK_REACH;
    const seen = reach && formInView(f, W, view);
    const s = seen ? 0.7 + 0.3 * clamp01((Math.min(f.prominence, 15) - 8) / 5) : reach ? 0.35 : 0.15;
    if (s > strength) {
      strength = s;
      const px = f.peak % W;
      const py = (f.peak - px) / W;
      say = seen ? `${capital(an(f.prominence))} ${levels(f.prominence)} ${formWord(f)} stands ${Math.round(near)} tiles ${compass(start.x, start.y, px, py)} of the start, in the opening view.` : undefined;
    }
  }
  return { met: strength >= 0.7, strength, ...(say ? { say } : {}) };
}

function mysteryBeat(c: FinalCtx, r: GenerateResult, plug: Shared, district: Shared): Beat {
  const best = strongest();
  const relic = checkIntention("relic-pinnacle", c);
  if (relic.ok && relic.say) best.take(1, relic.say);
  // a cave or an overhang: columns of the map with air under ground (terrain above terrain)
  const mask = r.built.waterModel.stacked?.mask;
  if (mask) {
    let caves = 0;
    for (let i = 0; i < mask.length; i++) if ((mask[i] & (mask[i] + 1)) !== 0) caves++;
    if (caves >= 6) best.take(0.9, `A cave opens under the land, ${caves} tiles of it.`);
  }
  if (plug) best.take(0.8, plug.say);
  if (district) best.take(0.6, district.say);
  let ruins = 0;
  for (const o of c.objects) if (/^RuinColumnH\d$/.test(o.template) && o.x >= 0 && o.y >= 0 && o.x < c.W && o.y < c.H && !Number.isFinite(c.walk[o.y * c.W + o.x])) ruins++;
  // (ruins on unwalked heights are on most rugged maps: some mystery, not enough alone)
  if (ruins >= 4) best.take(0.4, "A field of ruins stands on heights no beaver walks to.");
  return best.beat();
}

/** The finished map's arc: its six beats, each measured on it. Null for a map without a start. */
export function arcOf(r: GenerateResult): Arc | null {
  const b = r.built;
  if (!b.start) return null;
  const c = finalCtx(b, { rivers: [] });
  const startObj = b.entities.find((e) => e.template === "StartingLocation");
  const view = openingView(b.start, startObj?.orientation ?? "Cw0");
  const forms = standingForms(b.heights, b.W, b.H);
  // (each beat is one small function, so a better measure replaces one alone: the opening shot's
  // frame, the ruins placed with meaning, docs/progress/showcase.md)
  const landmark = landmarkBeat(c, view, forms);
  // a feature two beats could claim counts in one: in the valley (a district behind debris) or the
  // project (a plug holding back a lake) when that beat has nothing else, else in the mystery
  const shared = (id: "plug-lake" | "district-behind"): Shared => {
    if (id === "district-behind" && !c.walkCleared) return null;
    const x = checkIntention(id, c);
    return x.ok && x.say ? { say: x.say } : null;
  };
  const plug = shared("plug-lake");
  const district = shared("district-behind");
  const valleyAlone = valleyBeat(c, null);
  const projectAlone = projectBeat(c, r, null);
  const districtInValley = !!district && !valleyAlone.met;
  const plugInProject = !!plug && !projectAlone.met;
  return {
    vista: vistaBeat(c, view, forms, !landmark.met),
    drought: droughtBeat(c, droughtStorage(b.waterModel, b.water, FIRST_DROUGHT_DAYS)),
    valley: districtInValley ? valleyBeat(c, district) : valleyAlone,
    project: plugInProject ? projectBeat(c, r, plug) : projectAlone,
    landmark,
    mystery: mysteryBeat(c, r, plugInProject ? null : plug, districtInValley ? null : district),
  };
}

/** How an arc ranks: each beat met counts one, and the beats' mean strength breaks ties (0–7). */
export function arcScore(arc: Arc): number {
  let met = 0;
  let sum = 0;
  for (const id of BEATS) {
    if (arc[id].met) met++;
    sum += arc[id].strength;
  }
  return met + sum / BEATS.length;
}

/** The beats met, in a line: how many, then the two strongest beats' own words. */
export function arcNote(arc: Arc): string {
  const met = BEATS.filter((id) => arc[id].met);
  if (!met.length) return "No beat of the arc stands out.";
  const says = met
    .slice()
    .sort((a, b) => arc[b].strength - arc[a].strength || BEATS.indexOf(a) - BEATS.indexOf(b))
    .map((id) => arc[id].say)
    .filter((s, k, all): s is string => !!s && all.indexOf(s) === k)
    .slice(0, 2);
  return [`${met.length} of ${BEATS.length} beats.`, ...says].join(" ");
}

// ---------------------------------------------------------------------------- the search

/** The maps the search offers. */
export const SHOWCASE_KEEP = 3;
/** The most candidates one search makes, whatever its budget. */
export const SHOWCASE_MOST = 200;

export interface ShowcaseCandidate {
  /** Its place in the search (0: the asked map itself) and its sibling's variation. */
  index: number;
  variation: number;
  /** Its share spec: generating it gives this map, byte for byte. */
  spec: MapSpec;
  /** It passed every absolute (a map that fails one is never offered). */
  passed: boolean;
  arc: Arc | null;
  /** The rank it is offered by: `arcScore`, less one when the map misses its theme's promise. */
  score: number;
  note: string;
  name?: string;
}

export interface ShowcasePick extends ShowcaseCandidate {
  result: GenerateResult;
}

export interface ShowcaseResult {
  /** The best three (fewer when fewer passed), best first. */
  best: ShowcasePick[];
  /** Candidates made: `showcaseSearch(spec, { tries: tried })` gives the same best three. */
  tried: number;
  ms: number;
  /** The search was stopped before its budget or tries ran out. */
  stopped: boolean;
}

export interface ShowcaseOptions {
  /** The time allowed, in milliseconds: no candidate starts after it (one always runs). Ignored when
   *  `tries` is given: a replay makes all its maps, however long they take. */
  budgetMs?: number;
  /** The most candidates to make (the reproduction of an earlier search: its `tried`). */
  tries?: number;
  /** Each candidate as it is scored, with the best three so far and the number made. */
  onCandidate?: (c: ShowcaseCandidate, best: readonly ShowcasePick[], tried: number) => void;
  signal?: AbortSignal;
}

/** The share spec of the search's `index`-th candidate: the asked map's sibling at its variation +
 *  `index`, keeping the intentions the player asked for (none: each draws its own). */
export function showcaseSpec(spec: MapSpec, index: number): MapSpec {
  const variation = (spec.variation ?? 0) + index;
  const s = siblingSpec(spec, variation, spec.intentions ?? []);
  if (!variation) delete s.variation;
  return s;
}

/** Whether a ranks before b: the higher score, then the earlier candidate. */
function before(a: ShowcaseCandidate, b: ShowcaseCandidate): boolean {
  return a.score > b.score || (a.score === b.score && a.index < b.index);
}

/** Scores one generated candidate. */
export function scoreCandidate(r: GenerateResult, index: number, spec: MapSpec): ShowcaseCandidate {
  const arc = r.report.passed ? arcOf(r) : null;
  const promise = r.outcomes?.promise ?? true;
  const score = arc ? arcScore(arc) - (promise ? 0 : 1) : -Infinity;
  return { index, variation: spec.variation ?? 0, spec, passed: r.report.passed, arc, score, note: arc ? arcNote(arc) : "It failed a check.", ...(r.name ? { name: r.name } : {}) };
}

/**
 * Makes the asked map's siblings in order (`showcaseSpec`), scores each by its arc, and keeps the best
 * three that passed every absolute, never two on the same land (the better of two is kept). It yields
 * between candidates, so a worker hears a stop while it runs. Deterministic for the spec and the number of candidates made.
 */
export async function showcaseSearch(spec: MapSpec, opts: ShowcaseOptions = {}): Promise<ShowcaseResult> {
  const t0 = performance.now();
  const most = Math.min(opts.tries ?? SHOWCASE_MOST, SHOWCASE_MOST);
  const best: ShowcasePick[] = [];
  let tried = 0;
  let stopped = false;
  while (tried < most) {
    if (tried > 0 && opts.tries === undefined && opts.budgetMs !== undefined && performance.now() - t0 >= opts.budgetMs) break;
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (opts.signal?.aborted) {
      stopped = true;
      break;
    }
    const s = showcaseSpec(spec, tried);
    const r = generate(s);
    const c = scoreCandidate(r, tried, s);
    tried++;
    // (a sibling on a kept pick's land replaces it when it ranks before it, else is passed over)
    const twin = c.arc ? best.findIndex((p) => sameLand(p.result.built.heights, r.built.heights)) : -1;
    if (c.arc && (twin < 0 || before(c, best[twin]))) {
      if (twin >= 0) best.splice(twin, 1);
      let at = best.length;
      while (at > 0 && before(c, best[at - 1])) at--;
      if (at < SHOWCASE_KEEP) {
        best.splice(at, 0, { ...c, result: r });
        if (best.length > SHOWCASE_KEEP) best.pop();
      }
    }
    opts.onCandidate?.(c, best, tried);
  }
  return { best, tried, ms: Math.round(performance.now() - t0), stopped };
}
