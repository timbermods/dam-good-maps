// REPORT-v2.md's tables, printed from the committed aggregates: measures-v2.json, simplay-v2.json,
// landscapes-v2.json, bench-v2.json, narrows-v2.json and variations-v2.json.
//
//   npx tsx investigation/generative/v2/tables.ts [--template <report template> --out investigation/generative/REPORT-v2.md]

/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES, THEME_NAMES } from "../../../src/core/spec/mapspec";
import { INTENTIONS, INTENTION_TEXT } from "./intentions";

const HERE = join(process.cwd(), "investigation", "generative");
const read = (f: string) => (existsSync(join(HERE, f)) ? JSON.parse(readFileSync(join(HERE, f), "utf8")) : null);
const M = read("measures-v2.json");
const SIM = read("simplay-v2.json");
const LAND = read("landscapes-v2.json");
const BENCH = read("bench-v2.json");
const LAKES = read("lakes-v2.json");
const pc = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 1000) / 10}%` : "–");
const n2 = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100) / 100}` : "–");
const sections: Record<string, string[]> = {};
let cur = "head";
const sec = (k: string) => {
  cur = k;
  sections[k] ??= [];
};
const p = (s = "") => (sections[cur] ??= []).push(s);
const sets = M.sets;
const T = (set: string, theme: string) => sets[set]?.byTheme?.[theme];
const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
const head = (cells: string[]) => [row(cells), row(cells.map(() => "---"))].join("\n");

// §2 pass rates
sec("passrates");
p("### Pass rates (first attempt / final, maps)");
p();
const sizeSets = ["v2-96", "v2-128", "v2-192", "v2-256", "v2-128-vt85", "v2-128-v100", "v2-128-dreq", "v2-128-doff", "v1-128", "cur-128"].filter((s) => sets[s]);
p(head(["Set", ...THEMES.map((t) => THEME_NAMES[t])]));
for (const s of sizeSets) p(row([s, ...THEMES.map((t) => { const a = T(s, t)?.attempts; return a ? `${pc(a.first / a.n)} / ${pc(a.final / a.n)} (${a.n})` : "–"; })]));
p();

// §3 the measures
sec("m1");
p("### M1 no clones (nearest other seed; min / median)");
p();
p(head(["Theme", "v2", "v1", "current"]));
for (const t of THEMES) p(row([THEME_NAMES[t], ...["v2-128", "v1-128", "cur-128"].map((s) => (T(s, t) ? `${T(s, t).M1.nearestMin} / ${T(s, t).M1.nearestMedian}` : "–"))]));
p();
sec("m2");
p("### M2 no archetypes: largest cluster's share (clusters)");
p();
p(head(["Theme", "Whole maps v2", "v1", "current", "Rivers v2", "v1", "Relief v2", "v1"]));
for (const t of THEMES) {
  const c = (s: string, k: string) => (T(s, t) ? `${pc(T(s, t)[k].largestShare)} (${T(s, t)[k].clusters})` : "–");
  p(row([THEME_NAMES[t], c("v2-128", "M2a"), c("v1-128", "M2a"), c("cur-128", "M2a"), c("v2-128", "M2b"), c("v1-128", "M2b"), c("v2-128", "M2c"), c("v1-128", "M2c")]));
}
p();
sec("drivers");
p("### M2a drivers of the largest whole-map cluster (v2 against v1)");
p();
p(head(["Theme", "Set", "Layout half / feature half (workshop pair 0.51 / 0.53)", "Planarity: cluster / rest (workshop 0.22)", "Features its maps agree on most (ratio to a workshop pair)"]));
for (const t of THEMES)
  for (const s of ["v1-128", "v2-128"]) {
    const d = T(s, t)?.M2a?.drivers;
    if (!d) continue;
    p(row([THEME_NAMES[t], s, `${d.within.layoutHalf} / ${d.within.featureHalf}`, `${d.within.planarity} / ${d.rest.planarity}`, d.features.slice(0, 4).map((f: any) => `${f.name} ${f.ratio}`).join(", ")]));
  }
p();
sec("m3");
p("### M3 openings; M3c cheap cycle; M3d strategy axes");
p();
p(head(["Theme", "Openings: largest, spread (v2 / v1 / current)", "Cycle groups, largest (v2 / v1 / current)", "Axes: joint signatures, largest (v2 / v1 / current)"]));
for (const t of THEMES) {
  const o = (s: string) => (T(s, t)?.M3 ? `${pc(T(s, t).M3.largestShare)}, ${T(s, t).M3.spread}` : "–");
  const c = (s: string) => (T(s, t)?.M3c ? `${T(s, t).M3c.groups}, ${pc(T(s, t).M3c.largestGroupShare)}` : "–");
  const a = (s: string) => (T(s, t)?.M3d ? `${T(s, t).M3d.jointSignatures}, ${pc(T(s, t).M3d.largestJointShare)}` : "–");
  p(row([THEME_NAMES[t], ["v2-128", "v1-128", "cur-128"].map(o).join(" / "), ["v2-128", "v1-128", "cur-128"].map(c).join(" / "), ["v2-128", "v1-128", "cur-128"].map(a).join(" / ")]));
}
p();
sec("m4");
p("### M4 no approximation (share of a theme's maps closer to a workshop map than the workshop's p10, 0.591)");
p();
p(head(["Theme", "v2", "v1", "current", "v2's close pairs: layout half / feature half (all maps' nearest pairs)", "Features that make v2's close pairs close (ratio to all nearest pairs)"]));
for (const t of THEMES) {
  const m4 = (s: string) => (T(s, t) ? `${pc(T(s, t).M4.share)} (${T(s, t).M4.below})` : "–");
  const x = T("v2-128", t)?.M4;
  p(row([THEME_NAMES[t], m4("v2-128"), m4("v1-128"), m4("cur-128"), x ? `${x.close.layoutHalf} / ${x.close.featureHalf} (${x.all.layoutHalf} / ${x.all.featureHalf})` : "–", x ? x.features.slice(0, 5).map((f: any) => `${f.name} ${f.ratio}`).join(", ") : "–"]));
}
p();
sec("m5");
p(`### M5–M7: good natural dam site within 40 tiles (workshop ${pc(M.workshop.goodNaturalDam.workshop)}, official ${pc(M.workshop.goodNaturalDam.official)}); dam walls; storage possible`);
p();
p(head(["Theme", "M5 v2", "v1", "current", "M6 walls v2", "v1", "current", "M7 v2"]));
for (const t of THEMES) {
  const m5 = (s: string) => (T(s, t)?.M5 ? pc(T(s, t).M5.goodNaturalDam) : "–");
  const m6 = (s: string) => (T(s, t)?.M6 ? `${T(s, t).M6.flagged} of ${T(s, t).M6.maps}` : "–");
  p(row([THEME_NAMES[t], m5("v2-128"), m5("v1-128"), m5("cur-128"), m6("v2-128"), m6("v1-128"), m6("cur-128"), T("v2-128", t) ? pc(T("v2-128", t).M7.pass) : "–"]));
}
p();

// relief and verticality
sec("relief");
p("### Relief and verticality (medians; p10–p90 in brackets)");
p();
const VK = ["range", "levels", "maxHeight", "above16", "tallestFall", "flatShare", "cliffShare", "onFoot", "stairsOnly", "oneStep"];
const fmtB = (b: any, k: string) => (b ? (k === "above16" || k.endsWith("Share") || k === "onFoot" || k === "stairsOnly" || k === "oneStep" ? `${pc(b.median)} (${pc(b.p10)}–${pc(b.p90)})` : `${n2(b.median)} (${n2(b.p10)}–${n2(b.p90)})`) : "–");
const U = read("unlocked-v2.json");
p(head(["Measure", "Official", "Workshop", "v2 default", "v2 Verticality 85 (≤ 16)", "v2 Verticality 85 unlocked (the land before the build)", "v2 Variety 100", "v1", "current"]));
for (const k of VK)
  p(row([k, fmtB(M.workshop.vertical.official[k], k), fmtB(M.workshop.vertical.workshop[k], k), fmtB(sets["v2-128"]?.all?.vertical?.[k], k), fmtB(sets["v2-128-vt85"]?.all?.vertical?.[k], k), fmtB(U?.all?.[k], k), ...["v2-128-v100", "v1-128", "cur-128"].map((s) => fmtB(sets[s]?.all?.vertical?.[k], k))]));
p();
sec("reliefThemes");
p("### Relief by theme (v2 default: range, levels, tallest fall, flat, cliff; median)");
p();
p(head(["Theme", "Range", "Levels", "Tallest fall", "Flat", "Cliff", "On foot", "At Verticality 85: range, fall, cliff, on foot"]));
for (const t of THEMES) {
  const v = T("v2-128", t)?.vertical;
  const h = T("v2-128-vt85", t)?.vertical;
  if (!v) continue;
  p(row([THEME_NAMES[t], v.range.median, v.levels.median, v.tallestFall.median, pc(v.flatShare.median), pc(v.cliffShare.median), pc(v.onFoot.median), h ? `${h.range.median}, ${h.tallestFall.median}, ${pc(h.cliffShare.median)}, ${pc(h.onFoot.median)}` : "–"]));
}
p();
sec("natural");
p("### Naturalness and shape (medians)");
p();
p(head(["Set", "Steps in straight runs of 8+", "Longest straight run", "Ridge height std", "Basin rim thickness CV", "Water share", "Lake share", "Maps with an island", "Waterfalls"]));
const nat = (s: string, label: string) => {
  const byT = sets[s]?.byTheme;
  if (!byT) return;
  const pick = (f: (x: any) => number) => {
    const v = THEMES.map((t) => byT[t]).filter(Boolean).map(f).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  p(row([label, n2(pick((x) => x.natural.straightShare8.median)), n2(pick((x) => x.natural.longestRun.median)), n2(pick((x) => x.natural.ridgeHeightStd.median)), n2(pick((x) => x.natural.basinRimThicknessCV.median)), pc(sets[s].all.shape.waterShare.median), pc(sets[s].all.shape.lakeShare.median), pc(sets[s].all.shape.islandsAny), n2(sets[s].all.shape.waterfalls.median)]));
};
p(row(["Official", n2(M.workshop.natural.official.straightShare8.median), n2(M.workshop.natural.official.longestRun.median), "–", "–", pc(M.workshop.shape.official.waterShare.median), "–", "–", n2(M.workshop.shape.official.waterfalls.median)]));
p(row(["Workshop", n2(M.workshop.natural.workshop.straightShare8.median), n2(M.workshop.natural.workshop.longestRun.median), "–", "–", pc(M.workshop.shape.workshop.waterShare.median), "–", "–", n2(M.workshop.shape.workshop.waterfalls.median)]));
nat("v2-128", "v2 (theme median)");
nat("v1-128", "v1 (theme median)");
nat("cur-128", "current (theme median)");
p();
sec("flows");
p("### Flow directions (v2: share of maps whose water leaves toward each side)");
p();
for (const t of THEMES) {
  const f = T("v2-128", t)?.shape?.flows;
  if (!f) continue;
  const n = Object.values(f).reduce((a: number, b: any) => a + b, 0) as number;
  p(`- ${THEME_NAMES[t]}: ${Object.entries(f).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => `${k} ${pc(v / n)}`).join(", ")}`);
}
p();

// intentions
sec("intentions");
const I = sets["v2-128"]?.intentions;
if (I) {
  p(`### Intentions (v2-128; maps with none / one / two: ${I.perMap.join(" / ")})`);
  p();
  p(head(["Intention", "Drawn", "Emerged", "Re-steered", "Dropped", "Drop rate", "Within: M1 min / median", "Within: M2a largest (clusters)", "On the sheet"]));
  for (const id of INTENTIONS) {
    const x = I.byIntention[id];
    if (!x || !x.drawn) continue;
    p(row([INTENTION_TEXT[id].replace(/\.$/, ""), x.drawn, x.emerged, x.reSteered, x.dropped, pc(x.dropRate), x.M1 ? `${x.M1.nearestMin} / ${x.M1.nearestMedian}` : "–", x.M2a ? `${pc(x.M2a.largestShare)} (${x.M2a.clusters})` : "–", (x.examples ?? []).join(", ") || "–"]));
  }
  p();
}
// Kyler's three new intentions, drawn on every map of a set (a steering test, seeds 1-30 per theme)
const FORCED: [string, string][] = [["v2-128-i-snaking", "snaking-river"], ["v2-128-i-crater", "crater-rivers"], ["v2-128-i-cliff", "cliff-falls-lake"]];
if (FORCED.some(([s]) => sets[s]?.intentions)) {
  p("### Kyler's three new intentions on every map (seeds 1–30 of every theme, each drawn alone)");
  p();
  p(head(["Intention", "Maps", "Emerged", "Re-steered", "Dropped", "Drop rate", "By theme (emerged)", "Within: M1 min / median", "Within: M2a largest (clusters)"]));
  for (const [s, id] of FORCED) {
    const x = sets[s]?.intentions?.byIntention?.[id];
    if (!x) continue;
    p(row([INTENTION_TEXT[id as keyof typeof INTENTION_TEXT].replace(/\.$/, ""), x.drawn, x.emerged, x.reSteered, x.dropped, pc(x.dropRate), Object.entries(x.themes ?? {}).map(([t, n]) => `${THEME_NAMES[t as keyof typeof THEME_NAMES]} ${n}`).join(", "), x.M1 ? `${x.M1.nearestMin} / ${x.M1.nearestMedian}` : "–", x.M2a ? `${pc(x.M2a.largestShare)} (${x.M2a.clusters})` : "–"]));
  }
  p();
}

// Kyler's start and edge rules
sec("rules");
p("### Kyler's start and edge rules (rules.ts): the start's water, starting wood and the woods, edge walls");
p();
p(head(["Set", "Start water on another level", "D85 would fail", "Old tree count would fail", "Walk to the pump shore: median (p10–p90)", "Starting wood, logs: median (p10–p90)", "Woods: quick / mixed / slow", "Maps with an edge wall", "No mine site"]));
for (const s of ["v2-128", "v2-128-vt85", "v2-128-v100", "v2-96", "v2-192", "v2-256", "v2-128-dreq", "v2-128-doff", "v1-128", "cur-128"]) {
  const x = sets[s]?.all?.rules;
  if (!x) continue;
  const b = (v: any) => (v ? `${v.median} (${v.p10}–${v.p90})` : "–");
  const w = x.woods ? `${pc(x.woods.quick)} / ${pc(x.woods.mixed)} / ${pc(x.woods.slow)}` : "–";
  p(row([s, x.otherLevel === null ? "–" : pc(x.otherLevel), x.d85Fails === null ? "–" : pc(x.d85Fails), x.treesFails === null ? "–" : pc(x.treesFails), b(x.waterWalk), b(x.woodLogs), w, `${x.edgeWalls} of ${x.maps}`, `${x.noMine ?? "–"}`]));
}
p();

// lake shapes and island seas (lakes.ts)
sec("lakes");
if (LAKES) {
  const b = (v: any) => (v && Number.isFinite(v.median) ? `${v.median} (${v.p10}–${v.p90})` : "–");
  p("### Lake shapes (lakes of 150+ tiles at 128², not ponds or craters; median, p10–p90)");
  p();
  p(head(["Source", "Lakes", "Roundness 4πA/P²", "Fill", "Elongation", "Branching", "Round lakes"]));
  const shapeRow = (name: string, x: any) => x && p(row([name, x.lakes, b(x.roundness), b(x.fill), b(x.elongation), b(x.branching), pc(x.roundShare)]));
  shapeRow("Real terrain (the survey's library)", LAKES.survey?.lakes);
  shapeRow("Workshop maps", LAKES.refs?.workshop?.lakes);
  shapeRow("Official maps", LAKES.refs?.official?.lakes);
  shapeRow("v2 before the fix", LAKES.sets?.["v2-128-before"]?.classes?.lakes);
  shapeRow("v2", LAKES.sets?.["v2-128"]?.classes?.lakes);
  shapeRow("v1", LAKES.sets?.["v1-128"]?.classes?.lakes);
  shapeRow("current", LAKES.sets?.["cur-128"]?.classes?.lakes);
  p();
  p("Kept round on purpose (v2): the lakes in calderas and cone craters, and the maps where Kyler's crater or round-lake intention emerged.");
  p();
  p(head(["v2 lakes", "Lakes", "Roundness", "Fill", "Elongation", "Branching"]));
  for (const [k, name] of [["craters", "In calderas and cone craters"], ["intentionMaps", "On maps where Kyler's crater or round lake emerged"], ["ponds", "Ponds (60–150 tiles)"]] as const) {
    const x = LAKES.sets?.["v2-128"]?.classes?.[k];
    if (x) p(row([name, x.lakes, b(x.roundness), b(x.fill), b(x.elongation), b(x.branching)]));
  }
  p();
  p("### Island seas (Islands maps; median, p10–p90)");
  p();
  p(head(["Source", "Maps", "Water share", "The largest body", "Land in islands", "Islands of 30+ tiles", "Island size (tiles)", "Read as islands in a sea"]));
  const seaRow = (name: string, x: any) => x && p(row([name, x.maps, b(x.water), b(x.mainWater), b(x.apart), b(x.islands), b(x.islandMedian), pc(x.reads)]));
  seaRow("v2 before the fix", LAKES.sets?.["v2-128-before"]?.islands);
  seaRow("v2", LAKES.sets?.["v2-128"]?.islands);
  seaRow("v1", LAKES.sets?.["v1-128"]?.islands);
  seaRow("current", LAKES.sets?.["cur-128"]?.islands);
  const ti = LAKES.refs?.official?.named?.oThousandIslands;
  if (ti) p(row(["Official: Thousand Islands", 1, pc(ti.water), pc(ti.mainWater), pc(ti.apart), ti.islands, ti.islandMedian, ti.reads ? "yes" : "no"]));
  if (LAKES.refs?.workshop?.seas) p(row(["Workshop maps (all)", LAKES.refs.workshop.seas.maps, "–", "–", "–", "–", "–", pc(LAKES.refs.workshop.seas.islandSeas / LAKES.refs.workshop.seas.maps)]));
  p();
}

// start drought
sec("drought");
p("### Drought-aware start water (the start keeps pumpable water through the first Normal drought, analytic)");
p();
p(head(["Set", "Share of maps", "First attempt", "Final"]));
for (const s of ["v2-128", "v2-128-dreq", "v2-128-doff", "v1-128", "cur-128"]) {
  const x = sets[s];
  if (!x) continue;
  const att = THEMES.map((t) => x.byTheme[t]?.attempts).filter(Boolean);
  const n = att.reduce((a: number, b: any) => a + b.n, 0);
  const f1 = att.reduce((a: number, b: any) => a + b.first, 0);
  const fin = att.reduce((a: number, b: any) => a + b.final, 0);
  const share = x.all.startDrought ?? x.all.M3c?.startFirstDrought;
  p(row([s, pc(share), pc(f1 / n), pc(fin / n)]));
}
p();

// speed
sec("speed");
p("### Speed in the batches (all six themes, loaded machine; the set's name gives its size; ms)");
p();
p(head(["Set", "Whole map: median (p90)", "First look", "First settled water", "Settles per map: median (p90)"]));
for (const s of ["v2-128", "v2-96", "v2-192", "v2-256", "v1-128", "cur-128"]) {
  const x = sets[s]?.all?.speed;
  if (!x) continue;
  p(row([s, `${x.ms.median} (${x.ms.p90})`, Number.isFinite(x.firstLook.median) ? `${x.firstLook.median} (${x.firstLook.p90})` : "–", Number.isFinite(x.firstWater.median) ? `${x.firstWater.median} (${x.firstWater.p90})` : "–", Number.isFinite(x.settles.median) ? `${x.settles.median} (${x.settles.p90})` : "–"]));
}
p();
sec("bench");
if (BENCH) {
  p(`### Speed bench (${String(BENCH.machine).replace(/\s+/g, " ").trim()}, Node ${BENCH.node}; seeds ${BENCH.seeds.join(", ")} of every theme, one map at a time; ms)`);
  p();
  p(head(["Where", "Size", "Generator", "Median", "Max", "Node CPU median", "First attempt", "First look median (max)", "First water median"]));
  for (const r of BENCH.summary) p(row([r.where, r.size, r.gen, r.medianMs, r.maxMs, r.medianCpu ?? "–", `${r.firstAttemptShare}%`, r.medianFirstLook !== null ? `${r.medianFirstLook} (${r.maxFirstLook})` : "–", r.medianFirstWater ?? "–"]));
  p();
}

// simplay
sec("sim");
if (SIM) {
  p("### The exact cycle model (seeds 1–15 per theme at 128², weather seed 1729)");
  p();
  p(head(["Theme", "Groups, largest (v2 / v1 / current)", "Nearest-peer median (v2 / v1 / current)", "Water kept through the Hard drought, range (v2)", "Start keeps water through the first Normal drought (v2)"]));
  for (const t of THEMES) {
    const g = (k: string) => SIM.gens[k]?.themes?.[t];
    p(row([THEME_NAMES[t], ["proto2", "proto", "current"].map((k) => (g(k) ? `${g(k).groups}, ${pc(g(k).largestGroupShare)}` : "–")).join(" / "), ["proto2", "proto", "current"].map((k) => (g(k) ? g(k).nearestPeerMedian : "–")).join(" / "), g("proto2") ? `${pc(g("proto2").longRetention[0])}–${pc(g("proto2").longRetention[1])}` : "–", g("proto2")?.firstNormalKept !== null && g("proto2") ? pc(g("proto2").firstNormalKept) : "–"]));
  }
  p();
  const a = SIM.gens.proto2?.cheapAgainstExact;
  if (a) p(`The cheap signature against the exact model (${a.maps} maps of v2): long retention r = ${a.longRetentionCorrelation}, short retention r = ${a.shortRetentionCorrelation}, start days r = ${a.startDaysCorrelation}, running share against badwater exposure r = ${a.exposureCorrelation}; the retention bin agrees on ${pc(a.retentionBinAgreement)}, the start-days bin on ${pc(a.startBinAgreement)}, the first-drought verdict on ${pc(a.firstDroughtAgreement)}.`);
  p();
}

// landscapes
sec("land");
if (LAND) {
  p(`### The landscape bench (${LAND.stratum}, ${LAND.regions} real regions; seeds 1–30 per theme)`);
  p();
  p(head(["Group (median distance from the real median; lower is closer)", "v2", "v1", "current"]));
  for (const g of ["network", "water", "relief", "naturalness"]) p(row([g, ...["proto2", "proto", "current"].map((k) => LAND.gens[k]?.groups?.[g] ?? "–")]));
  for (const h of ["heightHistogram", "slopeHistogram"]) p(row([`${h} (total variation)`, ...["proto2", "proto", "current"].map((k) => LAND.gens[k]?.histograms?.[h] ?? "–")]));
  p();
  p(head(["Measure", "Real p10 / median / p90", "v2 median (outside the real 80%)", "v1", "current"]));
  for (const [name, m] of Object.entries<any>(LAND.gens.proto2.measures)) {
    const o = (k: string) => (LAND.gens[k]?.measures?.[name] ? `${LAND.gens[k].measures[name].generated.median} (${pc(LAND.gens[k].measures[name].outsideReal80)})` : "–");
    p(row([`${name} (${m.group})`, `${m.real.p10} / ${m.real.median} / ${m.real.p90}`, o("proto2"), o("proto"), o("current")]));
  }
  p();
}
sec("misc");
const NAR = read("narrows-v2.json");
if (NAR) p(`Natural narrows: ${JSON.stringify(NAR)}`);
const VAR = read("variations-v2.json");
if (VAR) p(`Variations: ${JSON.stringify({ ...VAR, rows: undefined })}`);
// with --template <file> --out <file>: fill each {{key}} of the template with its section
const tpl = process.argv.indexOf("--template");
if (tpl >= 0) {
  const text = readFileSync(process.argv[tpl + 1], "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => (sections[k] ?? [`(missing: ${k})`]).join("\n").trim());
  const o = process.argv.indexOf("--out");
  writeFileSync(process.argv[o + 1], text);
  console.log(`wrote ${process.argv[o + 1]}`);
} else console.log(Object.entries(sections).map(([k, v]) => `<!-- ${k} -->\n${v.join("\n")}`).join("\n"));
