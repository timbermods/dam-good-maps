// Design version 2's measures (docs/m9-design.md §10) over every batch set: version 2 at the
// default (v2-128), at high Verticality (v2-128-vt85; tall maps in unlocked.ts) and at
// Variety 100 (v2-128-v100), beside version 1 (v1-128) and the current generator (cur-128), all
// measured by the same batch code. The workshop and official maps give the scales, the cuts and the
// relief yardstick; only their aggregates are written. Writes
// investigation/generative/measures-v2.json.
//
//   npx tsx investigation/generative/sidecars.ts --dir <set>     (openings, dam walls; per set)
//   npx tsx investigation/generative/v2/refs.ts                  (relief of official and workshop maps)
//   npx tsx investigation/generative/v2/measures.ts [--sets v2-128,v1-128,…]

/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTable } from "../../workshop/lib/table";
import { distance, featureVector, type VarietyInput } from "../../workshop/lib/variety";
import { scaledDistance, scaleOf, upgma, type VecScale } from "../lib/cluster";
import { OPENING_KEYS } from "../lib/opening";
import { arg, MAPS, ROOT } from "../lib/paths";
import { reliefCode, reliefVector, riverCode, riverVector } from "../lib/structure";
import { closePairs, drivers, V_SCALE } from "./archetypes";
import { AXIS_BINS } from "./batch";
import { INTENTIONS } from "./intentions";
import { readRefs } from "./refs";

const HERE = join(process.cwd(), "investigation", "generative");
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (v: number[], p: number) => {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] : NaN;
};
const med = (v: number[]) => pct(v, 0.5);
const band = (v: number[]) => ({ p10: r3(pct(v, 0.1)), median: r3(med(v)), p90: r3(pct(v, 0.9)) });
const input = (key: string, r: any): VarietyInput => ({ key, layout: r.layout, features: featureVector(r) });

// ----------------------------------------------------------------------------- the references

const rows = readTable();
const workshop = rows.filter((r) => r.source === "workshop");
const official = rows.filter((r) => r.source === "official");
const W = workshop.map((r) => input(r.key, r.raw));
const wsNN = W.map((a) => W.reduce((m, b) => (a.key === b.key ? m : Math.min(m, distance(a, b, V_SCALE))), Infinity));
const vCut = pct(wsNN, 0.1);
const riverScale: VecScale = scaleOf(workshop.map((r) => riverVector(r.raw)));
const reliefScale: VecScale = scaleOf(workshop.map((r) => reliefVector(r.raw)));
const wsSide: Record<string, any> = existsSync(join(ROOT, "workshop-sidecars.json")) ? JSON.parse(readFileSync(join(ROOT, "workshop-sidecars.json"), "utf8")) : {};
const openRef: number[][] = [];
for (const r of [...workshop, ...official]) {
  const s = wsSide[r.key];
  if (!r.startMeasurable || !s?.opening) continue;
  openRef.push(OPENING_KEYS.map((k) => s.opening.v[k]));
}
const openScale: VecScale | null = openRef.length >= 10 ? scaleOf(openRef) : null;
const refs = readRefs();
const VKEYS = ["range", "levels", "maxHeight", "above16", "tallestFall", "flatShare", "cliffShare", "onFoot", "stairsOnly", "oneStep"] as const;
function refVertical(src: string) {
  const list = Object.values(refs).filter((x) => x.source === src);
  const out: Record<string, unknown> = { maps: list.length, withStart: list.filter((x) => x.startMeasurable).length };
  for (const k of VKEYS) out[k] = band(list.filter((x) => k !== "onFoot" && k !== "stairsOnly" && k !== "oneStep" ? true : x.startMeasurable).map((x) => x.v[k]));
  return out;
}
function natDamRate(keys: string[]): number {
  const v = keys.map((k) => wsSide[k]?.opening).filter(Boolean);
  return v.length ? v.filter((o: any) => o.shortest40 !== null && o.shortest40 <= 5).length / v.length : NaN;
}

// ------------------------------------------------------------------------------------- the sets

interface MapRec {
  key: string;
  theme: string;
  rec: any;
  x: any;
}

function loadSet(dir: string) {
  const maps: MapRec[] = [];
  const attempts: Record<string, { n: number; first: number; final: number }> = {};
  const failedBy: Record<string, Record<string, number>> = {};
  for (const f of readdirSync(dir).filter((n) => /^[a-zA-Z]+-\d+\.json$/.test(n))) {
    const rec = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const t = (attempts[rec.theme] ??= { n: 0, first: 0, final: 0 });
    t.n++;
    if (rec.passed) {
      t.final++;
      if (rec.attempts === 1) t.first++;
    }
    const fb = (failedBy[rec.theme] ??= {});
    for (const fa of rec.failures ?? []) for (const id of fa.failed ?? []) fb[id] = (fb[id] ?? 0) + 1;
    if (!rec.passed || !rec.layout) continue;
    const xp = join(dir, f.replace(/\.json$/, ".x.json"));
    maps.push({ key: rec.key, theme: rec.theme, rec, x: existsSync(xp) ? JSON.parse(readFileSync(xp, "utf8")) : null });
  }
  maps.sort((a, b) => a.theme.localeCompare(b.theme) || a.rec.seed - b.rec.seed);
  return { maps, attempts, failedBy };
}

function clusterStats(n: number, d: (i: number, j: number) => number, cut: number) {
  const cl = upgma(n, d, cut);
  return { clusters: cl.length, largest: cl[0]?.length ?? 0, largestShare: r3((cl[0]?.length ?? 0) / Math.max(1, n)) };
}

function nearestMedian(vs: number[][], dist: (a: number[], b: number[]) => number) {
  const nn = vs.map((a, i) => vs.reduce((m, b, j) => (i === j ? m : Math.min(m, dist(a, b))), Infinity));
  return r3(med(nn));
}
const meanAbs = (a: number[], b: number[]) => a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0) / a.length;
const maxBin = AXIS_BINS.map(([, c]) => c.length);
const axisDist = (a: number[], b: number[]) => a.reduce((s, v, k) => s + (v === -1 || b[k] === -1 ? (v === b[k] ? 0 : 1) : Math.abs(v - b[k]) / maxBin[k]), 0) / a.length;

const LIGHT = new Set(arg("light", "").split(",").filter(Boolean));

function measureMaps(maps: MapRec[], withDrivers = true, light = false) {
  const n = maps.length;
  if (light) return lightMeasures(maps);
  const V = maps.map((m) => input(m.key, m.rec));
  const nn = V.map((a, i) => V.reduce((best, b, j) => (i === j ? best : Math.min(best, distance(a, b, V_SCALE))), Infinity));
  const rv = maps.map((m) => riverVector(m.rec));
  const lv = maps.map((m) => reliefVector(m.rec));
  const withOpen = maps.filter((m) => m.x?.opening);
  const ov = withOpen.map((m) => OPENING_KEYS.map((k) => m.x.opening.v[k]));
  let openPairs = 0;
  let openSum = 0;
  if (openScale)
    for (let i = 0; i < ov.length; i++)
      for (let j = i + 1; j < ov.length; j++) {
        openSum += scaledDistance(ov[i], ov[j], openScale);
        openPairs++;
      }
  const withX = maps.filter((m) => m.x);
  const s40 = withX.map((m) => m.x.opening?.shortest40 ?? null);
  const close = closePairs(V, vCut);
  // the cheap cycle signature and the axes
  const cyc = maps.filter((m) => m.rec.cheapCycle);
  const groups = new Map<string, number>();
  for (const m of cyc) groups.set(m.rec.cheapCycle.group, (groups.get(m.rec.cheapCycle.group) ?? 0) + 1);
  const ax = maps.filter((m) => m.rec.axes);
  const joints = new Map<string, number>();
  for (const m of ax) joints.set(m.rec.axes.joint, (joints.get(m.rec.axes.joint) ?? 0) + 1);
  const axisSpread: Record<string, Record<string, number>> = {};
  AXIS_BINS.forEach(([k], idx) => {
    const c: Record<string, number> = {};
    for (const m of ax) {
      const b = m.rec.axes.bins[idx];
      const key = b === null ? "none" : String(b);
      c[key] = (c[key] ?? 0) + 1;
    }
    axisSpread[k] = Object.fromEntries(Object.entries(c).map(([b, v]) => [b, r3(v / Math.max(1, ax.length))]));
  });
  const vert = maps.filter((m) => m.rec.vertical);
  const vOut: Record<string, unknown> = {};
  for (const k of VKEYS) vOut[k] = band(vert.map((m) => m.rec.vertical[k]));
  const flows: Record<string, number> = {};
  for (const m of maps) flows[m.rec.water.flow] = (flows[m.rec.water.flow] ?? 0) + 1;
  return {
    maps: n,
    M1: { nearestMin: r3(Math.min(...nn)), nearestMedian: r3(med(nn)), nearestP10: r3(pct(nn, 0.1)), below025: nn.filter((x) => x < 0.25).length },
    M2a: { ...clusterStats(n, (i, j) => distance(V[i], V[j], V_SCALE), vCut), drivers: withDrivers ? drivers(V, vCut) : null },
    M2b: { ...clusterStats(n, (i, j) => scaledDistance(rv[i], rv[j], riverScale), riverScale.nnP10), codes: new Set(maps.map((m) => riverCode(m.rec))).size },
    M2c: { ...clusterStats(n, (i, j) => scaledDistance(lv[i], lv[j], reliefScale), reliefScale.nnP10), codes: new Set(maps.map((m) => reliefCode(m.rec))).size },
    M3: openScale && ov.length ? { maps: ov.length, ...clusterStats(ov.length, (i, j) => scaledDistance(ov[i], ov[j], openScale), openScale.nnP10), spread: r3(openSum / Math.max(1, openPairs)) } : null,
    M3c: cyc.length ? { maps: cyc.length, groups: groups.size, largestGroupShare: r3(Math.max(...groups.values()) / cyc.length), nearestPeerMedian: nearestMedian(cyc.map((m) => m.rec.cheapCycle.vector), meanAbs), longRetention: band(cyc.map((m) => m.rec.cheapCycle.longRetention)), startDays: band(cyc.map((m) => m.rec.cheapCycle.startDays)), startFirstDrought: r3(cyc.filter((m) => m.rec.cheapCycle.startFirstDrought).length / cyc.length) } : null,
    M3d: ax.length ? { maps: ax.length, jointSignatures: joints.size, largestJointShare: r3(Math.max(...joints.values()) / ax.length), nearestPeerMedian: nearestMedian(ax.map((m) => m.rec.axes.bins.map((b: number | null) => (b === null ? -1 : b))), axisDist), bins: axisSpread } : null,
    M4: { nearestMin: close.maps ? r3(Math.min(...V.map((a) => W.reduce((b, w) => Math.min(b, distance(a, w, V_SCALE)), Infinity)))) : NaN, below: close.below, share: close.share, close: close.close, all: close.all, features: close.features.slice(0, 6) },
    M5: withX.length ? { maps: withX.length, goodNaturalDam: r3(s40.filter((s) => s !== null && s <= 5).length / withX.length), within12: r3(s40.filter((s) => s !== null && s <= 12).length / withX.length) } : null,
    M6: withX.length ? { maps: withX.length, flagged: withX.filter((m) => m.x.walls?.length).length } : null,
    M7: { maps: n, pass: r3(maps.filter((m) => m.rec.storage?.ok ?? m.x?.storage?.ok).length / Math.max(1, n)) },
    vertical: vOut,
    natural: { straightShare8: band(maps.map((m) => m.rec.natural.straightShare8)), longestRun: band(maps.map((m) => m.rec.natural.longestRun)), ridgeHeightStd: band(maps.map((m) => m.rec.natural.ridgeHeightStd ?? NaN)), basinRimThicknessCV: band(maps.map((m) => m.rec.natural.basinRimThicknessCV ?? NaN)) },
    shape: {
      waterShare: band(maps.map((m) => m.rec.metrics.waterShare)),
      lakeShare: band(maps.map((m) => m.rec.water.lakeShare)),
      islandsAny: r3(maps.filter((m) => m.rec.water.islands100 > 0).length / Math.max(1, n)),
      waterfalls: band(maps.map((m) => m.rec.metrics.waterfalls)),
      plateaus: band(maps.map((m) => m.rec.score.plateaus)),
      flows,
    },
    speed: {
      ms: band(maps.map((m) => m.rec.ms)),
      firstLook: band(maps.map((m) => m.rec.timings?.firstLook ?? NaN)),
      firstWater: band(maps.map((m) => m.rec.timings?.firstWater ?? NaN)),
      settles: band(maps.map((m) => m.rec.info?.settles ?? NaN)),
    },
    startDrought: maps[0]?.rec.info && "startDrought" in (maps[0].rec.info ?? {}) ? r3(maps.filter((m) => m.rec.info.startDrought === true).length / Math.max(1, n)) : null,
  };
}

/** The cheap part only (pass rates, relief, speed, the start's drought water): for the size,
 *  Verticality and drought sets, where clustering adds nothing the default set does not show. */
function lightMeasures(maps: MapRec[]) {
  const vOut: Record<string, unknown> = {};
  for (const k of VKEYS) vOut[k] = band(maps.filter((m) => m.rec.vertical).map((m) => m.rec.vertical[k]));
  const withX = maps.filter((m) => m.x);
  const cyc = maps.filter((m) => m.rec.cheapCycle);
  return {
    maps: maps.length,
    M6: withX.length ? { maps: withX.length, flagged: withX.filter((m) => m.x.walls?.length).length } : null,
    M3c: cyc.length ? { maps: cyc.length, startFirstDrought: r3(cyc.filter((m) => m.rec.cheapCycle.startFirstDrought).length / cyc.length) } : null,
    vertical: vOut,
    shape: { waterShare: band(maps.map((m) => m.rec.metrics.waterShare)), lakeShare: band(maps.map((m) => m.rec.water.lakeShare)), islandsAny: r3(maps.filter((m) => m.rec.water.islands100 > 0).length / Math.max(1, maps.length)), waterfalls: band(maps.map((m) => m.rec.metrics.waterfalls)), flows: {} },
    speed: {
      ms: band(maps.map((m) => m.rec.ms)),
      firstLook: band(maps.map((m) => m.rec.timings?.firstLook ?? NaN)),
      firstWater: band(maps.map((m) => m.rec.timings?.firstWater ?? NaN)),
      settles: band(maps.map((m) => m.rec.info?.settles ?? NaN)),
    },
    startDrought: r3(maps.filter((m) => m.rec.info?.startDrought === true).length / Math.max(1, maps.length)),
    vtJumps: r3(maps.filter((m) => (m.rec.genome?.vt ?? 0) >= 70).length / Math.max(1, maps.length)),
  };
}

/** Kyler's start and edge rules (rules.ts) on a set's maps: where the start's water is, how many
 *  maps pass only under the new rules, starting wood (D164) and the woods, and edge walls. */
function rulesStats(maps: MapRec[]) {
  const sw = maps.filter((m) => m.rec.info?.startWater);
  const wd = maps.filter((m) => m.rec.wood);
  const woodBin = (v: number) => (v < 0.35 ? "quick" : v < 0.75 ? "mixed" : "slow");
  const bins: Record<string, number> = { quick: 0, mixed: 0, slow: 0 };
  for (const m of wd) if (m.rec.wood.logs) bins[woodBin(m.rec.wood.oakShare)]++;
  return {
    maps: maps.length,
    otherLevel: sw.length ? r3(sw.filter((m) => !m.rec.info.startWater.sameLevel).length / sw.length) : null,
    d85Fails: sw.length ? r3(sw.filter((m) => !m.rec.info.startWater.d85).length / sw.length) : null,
    waterWalk: sw.length ? band(sw.map((m) => m.rec.info.startWater.walk ?? NaN)) : null,
    treesFails: maps.filter((m) => m.rec.info?.startWood).length ? r3(maps.filter((m) => m.rec.info?.startWood && !m.rec.info.startWood.trees85).length / maps.filter((m) => m.rec.info?.startWood).length) : null,
    woodLogs: wd.length ? band(wd.map((m) => m.rec.wood.logs)) : null,
    woods: wd.length ? Object.fromEntries(Object.entries(bins).map(([k, n]) => [k, r3(n / wd.length)])) : null,
    edgeWalls: maps.filter((m) => (m.rec.info?.edgeWalls ?? m.rec.edgeWalls ?? 0) > 0).length,
    noMine: maps.filter((m) => m.rec.objects && !m.rec.objects.UndergroundRuins).length,
  };
}

/** Intentions: how often each was drawn, emerged, was re-steered or dropped, and the no-clone and
 *  no-archetype measures among the maps where it emerged (all themes together, D138's third
 *  principle). */
function intentionStats(maps: MapRec[]) {
  const out: Record<string, unknown> = {};
  for (const id of INTENTIONS) {
    const drawn = maps.filter((m) => (m.rec.intentions ?? []).some((i: any) => i.id === id));
    const got = drawn.filter((m) => m.rec.intentions.find((i: any) => i.id === id).ok);
    const re = drawn.filter((m) => m.rec.intentions.find((i: any) => i.id === id).outcome === "re-steered").length;
    const V = got.map((m) => input(m.key, m.rec));
    const nn = V.map((a, i) => V.reduce((best, b, j) => (i === j ? best : Math.min(best, distance(a, b, V_SCALE))), Infinity));
    out[id] = {
      drawn: drawn.length,
      emerged: got.length - re,
      reSteered: re,
      dropped: drawn.length - got.length,
      dropRate: r3((drawn.length - got.length) / Math.max(1, drawn.length)),
      themes: Object.fromEntries([...new Set(got.map((m) => m.theme))].sort().map((t) => [t, got.filter((m) => m.theme === t).length])),
      // examples on the contact sheet (seeds 1-30), one per theme first
      examples: [...got]
        .filter((m) => m.rec.seed <= 30)
        .sort((a, b) => a.rec.seed - b.rec.seed || (a.theme < b.theme ? -1 : 1))
        .filter((m, i, all) => all.findIndex((o) => o.theme === m.theme) === i)
        .slice(0, 3)
        .map((m) => m.key),
      M1: V.length > 1 ? { nearestMin: r3(Math.min(...nn)), nearestMedian: r3(med(nn)) } : null,
      M2a: V.length > 1 ? clusterStats(V.length, (i, j) => distance(V[i], V[j], V_SCALE), vCut) : null,
    };
  }
  const counts = [0, 1, 2].map((k) => maps.filter((m) => (m.rec.genome?.intentions?.length ?? 0) === k).length);
  return { perMap: counts, byIntention: out };
}

const out: any = {
  method: "docs/m9-design.md §10 (version 2). V: investigation/workshop/lib/variety.ts with variety-scale.json; clusters UPGMA cut at the workshop's p10 nearest-peer distance on each measure's own scale; no-approximation: the share of a theme's maps closer to their nearest workshop map than that p10 (D128).",
  workshop: {
    maps: W.length,
    vNearestP10: r3(vCut),
    vNearestMedian: r3(med(wsNN)),
    goodNaturalDam: { workshop: r3(natDamRate(workshop.map((r) => r.key))), official: r3(natDamRate(official.map((r) => r.key))) },
    vertical: { official: refVertical("official"), workshop: refVertical("workshop") },
    natural: {
      official: { straightShare8: band(official.map((r) => r.raw.natural.straightShare8)), longestRun: band(official.map((r) => r.raw.natural.longestRun)) },
      workshop: { straightShare8: band(workshop.map((r) => r.raw.natural.straightShare8)), longestRun: band(workshop.map((r) => r.raw.natural.longestRun)) },
    },
    shape: {
      official: { waterShare: band(official.map((r) => r.raw.metrics.waterShare)), waterfalls: band(official.map((r) => r.raw.metrics.waterfalls)) },
      workshop: { waterShare: band(workshop.map((r) => r.raw.metrics.waterShare)), waterfalls: band(workshop.map((r) => r.raw.metrics.waterfalls)) },
    },
  },
  sets: {} as Record<string, unknown>,
};
out.workshop.M2a = clusterStats(W.length, (i, j) => distance(W[i], W[j], V_SCALE), vCut);

const prevPath = join(HERE, "measures-v2.json");
if (existsSync(prevPath) && !process.argv.includes("--fresh")) out.sets = JSON.parse(readFileSync(prevPath, "utf8")).sets ?? {};
const sets = arg("sets", "v2-128,v1-128,cur-128,v2-128-vt85,v2-128-vt85u,v2-128-v100").split(",").filter(Boolean);
for (const s of sets) {
  const dir = join(MAPS, s);
  if (!existsSync(dir)) continue;
  const { maps, attempts, failedBy } = loadSet(dir);
  const byTheme: Record<string, unknown> = {};
  const light = LIGHT.has(s);
  for (const t of [...new Set(maps.map((m) => m.theme))].sort()) byTheme[t] = { attempts: attempts[t], failedAttempts: failedBy[t], ...measureMaps(maps.filter((x) => x.theme === t), true, light) };
  const all: any = light ? lightMeasures(maps) : measureMaps(maps, false);
  out.sets[s] = { maps: maps.length, light, all: { vertical: all.vertical, shape: all.shape, M5: all.M5 ?? null, M6: all.M6, speed: all.speed, startDrought: all.startDrought, M3c: all.M3c, M3d: all.M3d ?? null, vtJumps: all.vtJumps ?? null, rules: rulesStats(maps) }, byTheme, intentions: maps.some((m) => m.rec.intentions) ? intentionStats(maps) : null };
  console.log(`measured ${s}: ${maps.length} maps`);
}
writeFileSync(join(HERE, "measures-v2.json"), JSON.stringify(out, null, 1) + "\n");
console.log("wrote measures-v2.json");
