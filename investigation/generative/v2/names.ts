// Names from the land (design version 2, task d): the vocabulary and rules of the names study
// (investigation/names: lexicon.json, patterns.json, forbidden.json), applied to a prototype map.
//
// The rules read features, MapMetrics, dam sites and roles. The prototype has no planned landform
// features and no premises, so it emits read-back ones for naming only, each when the built map
// passes a shape check (the names README: a premise role only when the geometry shows it):
// - landforms from the land: plateaus and mesas (a level region of 300+ tiles standing 2+ levels
//   over all its rim, cliff-edged when its edges drop 2+ levels in one step), ridges, the main
//   valley, terraces (benches of 2+ levels on 30%+ of the map), hills;
// - lakes from the settled water (level pools of 100+ tiles), with their islands;
// - roles: great-scarp (a cliff of 4+ levels crossed by a fall), mesa-field (4+ standing forms),
//   hanging-lake (the high-lake intention realized), chain-lakes (3+ lakes on the rivers),
//   twin-falls (two falls of 2+ levels), moat-island (a river island of 100+ tiles), many-mouths
//   (a delta with 2+ mouths), crater-lake (a lake with most of its tiles inside a caldera's ring), volcano-island and
//   badwater-volcano (a cone part standing, with the sea or a badwater hollow), staircase.
// The pick: the highest-priority rule that holds, then the fallback, never random; a title that
// matches a known map or place, or another title in the batch, moves on to the next.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "investigation", "names");

export interface NameInput {
  metrics: Record<string, any>;
  /** Features (the map's own and the read-back ones for naming). */
  features: { kind: string; role?: string; params: Record<string, any> }[];
  roles: Set<string>;
  damSites: { length: number; ratio: number }[];
}

export interface Named {
  title: string;
  description: string;
  rule: string;
}

let data: { lexicon: any; patterns: any; forbidden: any } | null = null;
export function namesAvailable(): boolean {
  return existsSync(join(DIR, "patterns.json"));
}
function load() {
  if (!data) data = { lexicon: JSON.parse(readFileSync(join(DIR, "lexicon.json"), "utf8")), patterns: JSON.parse(readFileSync(join(DIR, "patterns.json"), "utf8")), forbidden: JSON.parse(readFileSync(join(DIR, "forbidden.json"), "utf8")) };
  return data;
}

function getPath(o: any, path: string): any {
  let v = o;
  for (const k of path.split(".")) v = v == null ? undefined : v[k];
  return v;
}

function cmp(v: any, c: any): boolean {
  if (c && typeof c === "object" && !Array.isArray(c)) {
    if ("$exists" in c) return (v !== undefined && v !== null) === !!c.$exists;
    if (typeof v !== "number") return false;
    if ("gte" in c && !(v >= c.gte)) return false;
    if ("lte" in c && !(v <= c.lte)) return false;
    if ("gt" in c && !(v > c.gt)) return false;
    if ("lt" in c && !(v < c.lt)) return false;
    return true;
  }
  return v === c;
}

function holds(cond: any, x: NameInput): boolean {
  if (!cond) return true;
  if (cond.all) return cond.all.every((c: any) => holds(c, x));
  if (cond.any) return cond.any.some((c: any) => holds(c, x));
  if (cond.featureRole) return x.roles.has(cond.featureRole);
  if (cond.metric) {
    const v = getPath(x.metrics, cond.metric.path);
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
    const t = cond.metric.value;
    switch (cond.metric.op) {
      case ">=": return v >= t;
      case "<=": return v <= t;
      case ">": return v > t;
      case "<": return v < t;
      case "=": return v === t;
    }
    return false;
  }
  if (cond.feature) {
    const n = x.features.filter((f) => f.kind === cond.feature.kind && Object.entries(cond.feature.where ?? {}).every(([k, c]) => cmp(getPath(f, k), c))).length;
    return cmp(n, cond.feature.count ?? { gte: 1 });
  }
  if (cond.analysis) {
    const list = cond.analysis.path === "damSites" ? x.damSites : [];
    const n = list.filter((s: any) => Object.entries(cond.analysis.where ?? {}).every(([k, c]) => cmp(s[k], c))).length;
    return cmp(n, cond.analysis.count ?? { gte: 1 });
  }
  if (cond.derived) {
    if (cond.derived.path === "dominantTreeSpecies") {
      const sp = x.metrics.species ?? {};
      const cands = ["Pine", "Birch", "Oak"].map((k) => [k, sp[k] ?? 0] as [string, number]).sort((a, b) => b[1] - a[1]);
      if (!cands[0][1] || cands[0][1] === cands[1][1]) return false;
      return cands[0][0] === cond.derived.equals;
    }
    return false;
  }
  return false;
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function forbidden(title: string, taken: Set<string>): boolean {
  const f = load().forbidden;
  const t = norm(title);
  if (taken.has(t)) return true;
  for (const m of f.mapTitles) {
    const p = norm(m.phrase);
    if (t === p) return true;
    if (m.match === "phrase" && p.includes(" ") && ` ${t} `.includes(` ${p} `)) return true;
  }
  for (const r of f.realPlaces) if (` ${t} `.includes(` ${norm(r.phrase)} `)) return true;
  return false;
}

/** Nouns by how specific they are (the fallback's order), then the other groups' words. */
const NOUNS = ["caldera", "crater", "scarp", "gorge", "canyon", "mesa", "crown", "tableland", "cascade", "falls", "lake", "spring", "plateau", "ridge", "terrace", "steps", "stair", "shelf", "basin", "valley", "narrows", "isle", "island", "bend", "reach", "river", "stream", "brook", "cliff", "highland", "plain", "meadow", "knoll", "pool", "shore", "channel", "mouth"];

export function nameOf(x: NameInput, taken: Set<string>): Named {
  const { patterns, lexicon } = load();
  const rules = [...patterns.rules].sort((a: any, b: any) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const r of rules) {
    if (!holds(r.when, x)) continue;
    if (forbidden(r.title, taken)) continue;
    taken.add(norm(r.title));
    return { title: r.title, description: r.description, rule: r.id };
  }
  // the fallback: the most specific eligible noun, then an eligible word of another group
  const words: { id: string; word: string; group: string }[] = [];
  for (const g of lexicon.groups) for (const w of g.words) if (holds(w.requires, x)) words.push({ id: w.id, word: w.word, group: g.id });
  const nouns = NOUNS.map((n) => words.find((w) => w.id === n)).filter((w): w is { id: string; word: string; group: string } => !!w);
  const others = words.filter((w) => w.group === "modifiers" || w.group === "beaver" || w.group === "whimsy").sort((a, b) => a.id.localeCompare(b.id));
  const cap = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  for (const n of nouns)
    for (const o of others) {
      if (o.id === n.id) continue;
      const title = cap(`${o.word} ${n.word}`);
      if (forbidden(title, taken)) continue;
      taken.add(norm(title));
      return { title, description: patterns.fallback.description, rule: `fallback:${o.id}+${n.id}` };
    }
  return { title: "Unnamed", description: patterns.fallback.description, rule: "none" };
}

// ------------------------------------------------------------- read-back features for naming

export interface ReadBack {
  h: Uint8Array;
  W: number;
  H: number;
  D: ArrayLike<number>;
  parts: string[];
  /** Caldera parts (centre and ring radius, tiles) and the lakes' tiles, for the crater-lake role. */
  calderas?: { cx: number; cy: number; r: number }[];
  lakeTiles?: number[][];
  terrace: { step: number; share: number };
  theme: string;
  badwater: string;
  splits: number;
  deltas: number;
  lakesOnRivers: number;
  falls: { i: number; drop: number }[];
  standingForms: number;
  highLake: boolean;
  metrics: Record<string, any>;
  water: Record<string, any>;
}

/** The landforms, lakes and roles a built prototype map shows, for naming only. */
export function readBack(r: ReadBack): { features: NameInput["features"]; roles: Set<string> } {
  const { h, W, H, D } = r;
  const N = W * H;
  const features: NameInput["features"] = [];
  const roles = new Set<string>();
  // level regions standing over their rim: plateaus (cliff-edged ones read as mesas)
  const lab = new Int32Array(N).fill(-1);
  let plateaus = 0;
  let cliffPlateaus = 0;
  for (let s = 0; s < N; s++) {
    if (lab[s] >= 0) continue;
    const q = [s];
    lab[s] = s;
    let rim = 0;
    let lower = 0;
    let drop2 = 0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (h[j] === h[i]) {
          if (lab[j] < 0) {
            lab[j] = s;
            q.push(j);
          }
          continue;
        }
        rim++;
        if (h[j] < h[i]) lower++;
        if (h[i] - h[j] >= 2) drop2++;
      }
    }
    if (q.length >= 300 && rim > 0 && lower / rim >= 0.9 && !(D[s] > 0.05)) {
      plateaus++;
      if (drop2 / rim >= 0.5) cliffPlateaus++;
    }
  }
  for (let k = 0; k < plateaus; k++) features.push({ kind: "landform", params: { kind: "plateau", edgeStyle: k < cliffPlateaus ? "cliff" : "gentle" } });
  if (r.parts.includes("ridge")) features.push({ kind: "landform", params: { kind: "ridge" } });
  if (r.parts.includes("trough") || r.parts.includes("escarpment") || r.theme === "riverValley") features.push({ kind: "landform", params: { kind: "valley" } });
  if (r.parts.includes("knolls")) features.push({ kind: "landform", params: { kind: "hill", height: 2 } });
  if (r.terrace.step >= 2 && r.terrace.share >= 0.3) features.push({ kind: "landform", params: { kind: "terraces", edgeStyle: "terraced" } });
  // lakes, with their islands
  const lakes = r.water.lakes ?? 0;
  for (let k = 0; k < lakes; k++) features.push({ kind: "lake", params: { islands: { count: k === 0 ? r.water.islands100 ?? 0 : 0 } } });
  // roles
  const tall = r.falls.filter((f) => f.drop >= 2);
  if (r.parts.includes("escarpment") && r.falls.some((f) => f.drop >= 4)) roles.add("premise/great-scarp");
  if (r.standingForms >= 4) roles.add("premise/mesa-field");
  if (r.highLake) roles.add("premise/hanging-lake");
  if (r.lakesOnRivers >= 3) roles.add("premise/chain-lakes");
  if (tall.length >= 2) roles.add("premise/twin-falls");
  if (r.splits > 0 && (r.water.islands100 ?? 0) >= 1) roles.add("premise/moat-island");
  if (r.deltas > 0 && (r.metrics.edgeExits ?? 0) >= 2) roles.add("premise/many-mouths");
  // a crater lake: a lake with most of its tiles inside a caldera's ring
  if ((r.calderas ?? []).some((c) => (r.lakeTiles ?? []).some((t) => t.length >= 30 && t.filter((i) => Math.sqrt(((i % W) - c.cx) ** 2 + (Math.floor(i / W) - c.cy) ** 2) <= c.r).length >= 0.6 * t.length))) roles.add("premise/crater-lake");
  if (r.parts.includes("cone") && r.theme === "islands" && (r.water.islands100 ?? 0) >= 1) roles.add("premise/volcano-island");
  if (r.parts.includes("cone") && r.badwater === "pit") roles.add("premise/badwater-volcano");
  if (r.terrace.step >= 2 && r.terrace.share >= 0.5) roles.add("premise/staircase");
  return { features, roles };
}
