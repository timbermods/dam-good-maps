// The ten brief maps of design version 2 (task "show Kyler the maps"): picked from the batches for
// variety (the variety distance and the opening, half each, farthest-first), one per theme at the
// default Verticality first (the first is Kyler's own intention, a start under a cliff with water
// below, and the next show his other three: a snaking river, a crater gathering rivers, a waterfall
// into a round lake), three at high Verticality (85; heights kept within 16),
// and one map with no intention (some maps have none). Each is regenerated from its seed (the bytes must
// equal the batch's), run through the exact cycle model (the worst of three weather seeds), named
// with the names study's rules, and written with a one-page brief:
//   investigation/generative/out/v2/<name>.timber, README.md, index.json
//   investigation/generative/briefs/v2/<nn>.md
// Renders are render.ts's (the app's 3D view, 1600×900, and a top-down view).
//
//   npx tsx investigation/generative/v2/export.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeProject, toDocument } from "../../../src/core/doc/document";
import { THEME_NAMES, THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { distance, featureVector, type Scale } from "../../workshop/lib/variety";
import { scaledDistance, type VecScale } from "../lib/cluster";
import { OPENING_KEYS, type Opening } from "../lib/opening";
import { MAPS } from "../lib/paths";
import { DIR_NAMES } from "../proto/num";
import { AXIS_BINS } from "./batch";
import { card2 } from "./card";
import { generateV2, finalCtx, PROTO2_VERSION } from "./generate";
import { checkIntention, INTENTION_TEXT, type IntentionId } from "./intentions";
import { nameOf, readBack } from "./names";
import { exactCycle } from "./simplay";
import { fallsOf } from "./vertical";
import { V2_ROOT } from "./refs";

const HERE = join(process.cwd(), "investigation", "generative");
const vs = JSON.parse(readFileSync(join(process.cwd(), "investigation", "workshop", "variety-scale.json"), "utf8"));
const vScale: Scale = { spread: vs.spread, L0: vs.L0, F0: vs.F0 };
const measures = JSON.parse(readFileSync(join(HERE, "measures.json"), "utf8"));
const oScale: VecScale = { spread: measures.workshop.opening.spread, d0: measures.workshop.opening.d0, nnP10: 0, nnMedian: 0 };
const WEATHER = [1729, 7, 99];

interface Cand {
  set: string;
  key: string;
  theme: ThemeId;
  seed: number;
  vt: number | null;
  rec: any;
  opening: Opening;
}

function load(set: string, vt: number | null, maxSeed: number): Cand[] {
  const dir = join(MAPS, set);
  const out: Cand[] = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => /^[a-zA-Z]+-\d+\.json$/.test(n))) {
    const rec = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const xp = join(dir, f.replace(/\.json$/, ".x.json"));
    if (!rec.passed || rec.seed > maxSeed || !existsSync(xp)) continue;
    const x = JSON.parse(readFileSync(xp, "utf8"));
    if (!x.opening || x.walls?.length || (rec.vertical?.maxHeight ?? 0) > 16) continue;
    out.push({ set, key: rec.key, theme: rec.theme, seed: rec.seed, vt, rec, opening: x.opening });
  }
  return out.sort((a, b) => a.theme.localeCompare(b.theme) || a.seed - b.seed);
}

const base = load("v2-128", null, 60);
const high = load("v2-128-vt85", 85, 60);
const inp = (c: Cand) => ({ key: c.key, layout: c.rec.layout, features: featureVector(c.rec) });
const ov = (c: Cand) => OPENING_KEYS.map((k) => c.opening.v[k]);
const dist = (a: Cand, b: Cand) => 0.5 * distance(inp(a), inp(b), vScale) + 0.5 * scaledDistance(ov(a), ov(b), oScale);
const emerged = (c: Cand): IntentionId[] => (c.rec.intentions ?? []).filter((i: any) => i.ok).map((i: any) => i.id);

const picked: Cand[] = [];
const farthest = (pool: Cand[], bonus: (c: Cand) => number = () => 0) => {
  let best: Cand | null = null;
  let bd = -Infinity;
  for (const c of pool) {
    if (picked.includes(c)) continue;
    const d = (picked.length ? Math.min(...picked.map((p) => dist(c, p))) : 0) + bonus(c);
    if (d > bd) {
      bd = d;
      best = c;
    }
  }
  return best;
};
// 1. Kyler's intention first: the most typical map where "under a cliff, water below" emerged
{
  const uc = base.filter((c) => emerged(c).includes("under-cliff"));
  let first = uc[0];
  let bm = Infinity;
  for (const c of uc) {
    let s = 0;
    for (const d of uc) if (d !== c) s += dist(c, d);
    if (s < bm) {
      bm = s;
      first = c;
    }
  }
  if (first) picked.push(first);
}
// 1b. Kyler's three other intentions, one map each, in a theme not picked yet when one has it
for (const id of ["snaking-river", "crater-rivers", "cliff-falls-lake"] as IntentionId[]) {
  if (picked.some((p) => emerged(p).includes(id))) continue;
  const pool = base.filter((x) => emerged(x).includes(id));
  const fresh = pool.filter((x) => !picked.some((p) => p.theme === x.theme));
  const c = farthest(fresh.length ? fresh : pool);
  if (c) picked.push(c);
}
// 2. one map per theme at the default, the farthest, with a bonus for an intention not shown yet
const shown = () => new Set(picked.flatMap(emerged));
for (const theme of THEMES) {
  if (picked.some((p) => p.theme === theme)) continue;
  const c = farthest(
    base.filter((x) => x.theme === theme && emerged(x).length),
    (x) => (emerged(x).some((id) => !shown().has(id)) ? 0.5 : 0),
  );
  if (c) picked.push(c);
}
// 3. three at high Verticality, three themes
for (let k = 0; k < 3; k++) {
  const c = farthest(
    high.filter((x) => !picked.some((p) => p.vt && p.theme === x.theme)),
    (x) => (emerged(x).some((id) => !shown().has(id)) ? 0.3 : 0),
  );
  if (c) picked.push(c);
}
// 4. one with no intention
{
  const c = farthest(base.filter((x) => !(x.rec.genome?.intentions ?? []).length));
  if (c) picked.push(c);
}

const outDir = join(HERE, "out", "v2");
const briefDir = join(HERE, "briefs", "v2");
const projDir = join(process.cwd(), ".scratch", "v2-projects");
for (const d of [outDir, briefDir, projDir]) mkdirSync(d, { recursive: true });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const taken = new Set<string>();

const AXIS_NAMES: Record<string, [string, string]> = {
  storageRatio: ["Storage work", "× a Normal drought's need kept by the land within 40 tiles"],
  peakAxialFlow64: ["Power location", "blocks/s through the best water-wheel spot within reach"],
  flatDry40: ["Land and height", "dry tiles on the start's level within 40 tiles' walk"],
  fertilityPersistence: ["Fertile land", "of the moist land near the start still moist after a drought"],
  badwaterDistance: ["Threat exposure", "tiles to the nearest badwater or contaminated soil"],
  logs20: ["Resource timing", "logs standing within 20 tiles' walk"],
  frontierComponents: ["Expansion choice", "separate regions to expand into beyond 20 tiles"],
  deepPumpExtraShore: ["Faction opportunity", "extra shore tiles an Iron Teeth deep pump reaches"],
  oakShare20: ["Resource timing: the woods", "of the starting wood is oak (plenty of wood, slow to regrow; the rest pine and birch, quick)"],
};

/** Difficulty as positions on the axes (docs/m9-design.md §11, a proposal): each condition an axis,
 *  a bound, its side, and whether "none on the map" (a null) meets it. */
export const DIFFICULTY_POSITIONS: Record<string, [string, number, "min" | "max", boolean][]> = {
  Easy: [["storageRatio", 0.5, "min", false], ["badwaterDistance", 30, "min", true], ["logs20", 250, "min", false], ["flatDry40", 250, "min", false]],
  Normal: [["storageRatio", 0.1, "min", false], ["badwaterDistance", 15, "min", true], ["logs20", 150, "min", false], ["flatDry40", 150, "min", false]],
  Hard: [["storageRatio", 1, "max", false], ["badwaterDistance", 60, "max", false], ["logs20", 55, "min", false]],
};
export function suits(values: Record<string, number | null>): string[] {
  const meets = ([k, b, side, noneOk]: [string, number, "min" | "max", boolean]) => {
    const v = values[k];
    if (v === null || v === undefined) return noneOk;
    return side === "min" ? v >= b : v < b;
  };
  return Object.entries(DIFFICULTY_POSITIONS)
    .filter(([, conds]) => conds.every(meets))
    .map(([d]) => d);
}

const readme: string[] = [];
const index: unknown[] = [];
picked.slice(0, 10).forEach((c, k) => {
  const nn = String(k + 1).padStart(2, "0");
  const r = generateV2(c.theme, c.seed, 128, "normal", c.vt ? { vt: c.vt } : {});
  const batch = new Uint8Array(readFileSync(join(MAPS, c.set, `${c.key}.timber`)));
  const same = sha(r.bytes) === sha(batch);
  const b = r.built;
  // the exact cycle model, the worst of three weather seeds (least water kept through the Hard drought)
  // the exact runs are slow (30–100 s each on the shared machine): kept locally by map and seed
  const cachePath = join(V2_ROOT, "export-cycles", `${c.set}-${c.key}.json`);
  const runs: ({ ws: number } & ReturnType<typeof exactCycle>)[] = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : WEATHER.map((ws) => ({ ws, ...exactCycle(r, ws) }));
  mkdirSync(join(V2_ROOT, "export-cycles"), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(runs));
  const worst = runs.reduce((a, x) => (x.values.longRetention < a.values.longRetention ? x : a));
  const t = worst.timeline;
  const days = (id: string) => t[id].days.filter((d: any) => d.phase !== "normal").length;
  const ints: IntentionId[] = r.intentions.filter((i) => i.ok).map((i) => i.id);
  const ctx = finalCtx(b, r.hydro);
  const lines = card2({
    opening: c.opening,
    firstNormal: { lostDay: t["first-normal"].firstWaterLost, days: days("first-normal") },
    lateHard: { lostDay: t["late-hard"].firstWaterLost, days: days("late-hard") },
    intentions: ints,
    onFoot: c.rec.vertical.onFoot,
    water: r.info.startWater && r.info.startWater.walk !== null ? { walk: r.info.startWater.walk, sameLevel: r.info.startWater.sameLevel } : null,
    wood: r.info.startWood ?? null,
  });
  // the name, from the land
  const falls = fallsOf(b.heights, b.water, b.W, b.H, 1.5);
  const lm = checkIntention("landmark", ctx);
  const rb = readBack({
    h: b.heights,
    W: b.W,
    H: b.H,
    D: b.water,
    parts: r.genome.parts.map((p) => p.kind),
    calderas: r.genome.parts.filter((p) => p.kind === "caldera").map((p) => ({ cx: p.at[0] * (b.W - 1), cy: p.at[1] * (b.H - 1), r: p.size })),
    lakeTiles: r.hydro.lakes.map((lk) => lk.tiles),
    terrace: { step: r.genome.terrace.step, share: r.genome.terrace.share },
    theme: c.theme,
    badwater: r.info.badwater,
    splits: r.info.hydro.splits,
    deltas: r.info.hydro.deltas,
    lakesOnRivers: r.hydro.lakes.length,
    falls,
    standingForms: Number(/^(\d+) standing/.exec(lm.note)?.[1] ?? 0),
    highLake: checkIntention("high-lake", ctx).ok,
    metrics: c.rec.metrics,
    water: c.rec.water,
  });
  const damSites = (r.analysis?.damSites ?? []).map((s: any) => ({ length: s.length, ratio: s.volume / Math.max(1, s.length) }));
  const named = nameOf({ metrics: c.rec.metrics, features: [...r.features.map((f: any) => ({ kind: f.kind, role: f.role, params: f.params })), ...rb.features], roles: rb.roles, damSites }, taken);
  const tag = c.vt ? `${THEME_NAMES[c.theme]} ${c.seed}, Verticality ${c.vt}` : `${THEME_NAMES[c.theme]} ${c.seed}`;
  const file = `${named.title} (${tag}).timber`;
  writeFileSync(join(outDir, file), r.bytes);
  writeFileSync(join(projDir, `${nn}.damgoodmaps.json`), encodeProject(toDocument(r.spec, r.features, r.built, r.file)));
  writeFileSync(join(projDir, `${nn}.timber`), r.bytes);
  const g = r.genome;
  const m = c.rec;
  const v = m.vertical;
  const parts = [...new Set(g.parts.map((p) => p.kind))].filter((p) => p !== "knolls");
  const axes = m.axes;
  const axisRows = AXIS_BINS.map(([key, cuts], i) => {
    const val = axes?.values?.[key] ?? null;
    const bin = axes?.bins?.[i] ?? null;
    const [nm, unit] = AXIS_NAMES[key];
    const shown = val === null ? "none found" : key === "fertilityPersistence" || key === "oakShare20" ? `${Math.round(val * 100)}% ${unit}` : `${Math.round(val * 100) / 100} ${unit}`;
    return `| ${nm} | ${shown} | ${bin === null ? "–" : `${bin} of ${cuts.length}`} |`;
  }).join("\n");
  const cycleRow = (id: string, label: string) => {
    const x = t[id];
    const hz = x.days.filter((d: any) => d.phase !== "normal");
    const end = hz[hz.length - 1] ?? x.days[x.days.length - 1];
    const lost = x.firstWaterLost === null ? "keeps it throughout" : x.firstWaterLost <= 0 ? "none from the first day" : `gone by day ${x.firstWaterLost}`;
    const rec = x.recoveryDays === null ? "not back within 5 days" : x.recoveryDays <= 1 ? "back within a day" : `back in ${Math.round(x.recoveryDays)} days`;
    const kept = id === "first-badtide" ? `${end.bad.toLocaleString("en-US")} tiles of badwater` : `${Math.round(end.kept * 100)}% of the water left`;
    return `| ${label} (${hz.length} days) | ${kept} | ${lost} | ${rec} |`;
  };
  const intentText = r.intentions.length
    ? r.intentions.map((i) => `- ${INTENTION_TEXT[i.id]} **${i.ok ? (i.outcome === "re-steered" ? "Emerged after one re-steer" : "Emerged") : "Dropped"}** (${i.note}).`).join("\n")
    : "- None drawn. Some maps have none, so intentions never become a template.";
  const suit = axes ? suits(axes.values) : [];
  const brief = `# ${k + 1}. ${named.title}

${THEME_NAMES[c.theme]}, 128², designed for Normal, seed ${c.seed}, Verticality ${g.vt}${c.vt ? " (set to 85: high)" : " (the theme's default)"}. Prototype ${PROTO2_VERSION}.
File: [out/v2/${file}](../../out/v2/${encodeURI(file)}).

![The 3D view, from the game's angle](../../renders/v2/${nn}-3d.jpg)

![Top-down, north up](../../renders/v2/${nn}-top.jpg)

*Rendered with the app's 3D view, in the clean look.*

## Intention

${intentText}

## How it plays

${lines.map((l) => `- ${l}`).join("\n")}

## Terrain

- **Land:** ${parts.length ? parts.join(", ") : "rolling ground"} over ${g.tiltKind === "radial" ? `a bowl draining toward the ${DIR_NAMES[g.flowDir]}` : g.tilt < 0.8 ? "land with no one regional slope" : `land falling toward the ${DIR_NAMES[g.flowDir]}`}${g.recipe ? `; recipe: ${g.recipe}` : ""}.
- **Relief:** ${v.range} levels (p5–p95), ${v.levels} levels in use, highest ${v.maxHeight}; ${Math.round(v.cliffShare * 100)}% cliff, ${Math.round(v.flatShare * 100)}% flat; tallest fall ${v.tallestFall} levels.
- **Water:** ${r.info.hydro.rivers} river${r.info.hydro.rivers === 1 ? "" : "s"} (${m.water.inflows} from the edge, ${m.water.springs} from springs), ${m.water.lakes} lake${m.water.lakes === 1 ? "" : "s"}, ${m.metrics.waterfalls} fall${m.metrics.waterfalls === 1 ? "" : "s"}${r.info.hydro.splits ? ", a river island" : ""}${r.info.hydro.deltas ? ", a delta" : ""}; water covers ${Math.round(m.metrics.waterShare * 100)}% of the map.
- **Reach:** ${Math.round(v.onFoot * 100)}% of the dry land is reached on foot from the start; ${Math.round(v.stairsOnly * 100)}% needs stairs (${r.info.ramps.cut} natural ramp${r.info.ramps.cut === 1 ? "" : "s"}, ${r.info.ramps.leftToStairs} upland${r.info.ramps.leftToStairs === 1 ? "" : "s"} left to stairs).
- **Badwater:** ${r.info.badwater === "pit" ? "a hollow on high ground, draining by its own ditch" : "none"}.

## Cycle timeline

The exact cycle model (\`investigation/cycles\`), before anything is built; the worst of weather seeds ${WEATHER.join(", ")} (seed ${worst.ws}).

| Weather | At its end | The start's pumpable water | Afterwards |
|---|---|---|---|
${cycleRow("first-normal", "First drought, Normal")}
${cycleRow("late-hard", "Later drought, Hard")}
${cycleRow("first-badtide", "First badtide, Normal")}

## Strategy axes

The verified mechanics study's eight axes (\`investigation/mechanics\`, measurement version 3) and the woods (D164), each in its fixed bins (bin 0 is the lowest).

| Axis | Value | Bin |
|---|---|---|
${axisRows}

Its position suits: ${suit.length ? suit.join(", ") : "none of the proposed difficulty positions"} (docs/m9-design.md §11, a proposal).

## Name

**${named.title}**, by the names study's rule \`${named.rule}\`: ${named.description}
`;
  writeFileSync(join(briefDir, `${nn}.md`), brief);
  readme.push(`| ${k + 1} | [${file}](${encodeURI(file)}) | ${THEME_NAMES[c.theme]} | ${c.seed} | ${g.vt} | ${lines[0]} ${lines[1]} |`);
  index.push({ n: k + 1, name: named.title, file, theme: c.theme, seed: c.seed, vt: g.vt, vtSetting: c.vt, sha256: sha(r.bytes), sameAsBatch: same, passed: r.bytes.length > 0, attempts: r.attempts, intentions: r.intentions.map((i) => ({ id: i.id, ok: i.ok })), maxHeight: v.maxHeight });
  console.log(`${nn} ${named.title} (${tag}): ${same ? "same bytes as the batch" : "DIFFERENT BYTES"}, ${r.bytes.length > 0 ? "passes" : "FAILS"}`);
});
writeFileSync(
  join(outDir, "README.md"),
  `# Ten maps to play: M9 design version 2

Maps from the M9 design prototype, version 2 (${PROTO_VERSION_TEXT()}), 128², designed for Normal. They are our own maps. Each passes the product's checks in both validators, with Kyler's start water rule and starting wood in place of the old start water and tree rules, has no dam wall or edge wall, and comes back byte for byte from its seed. Three are at high Verticality (85), with heights kept within 16.

**To play one:** copy its \`.timber\` file to \`Documents\\Timberborn\\Maps\`, then pick it under **New game**.

| # | File | Theme | Seed | Verticality | How it plays |
|---|---|---|---|---|---|
${readme.join("\n")}

A one-page brief for each is in [../../briefs/v2](../../briefs/v2).
`,
);
writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 1) + "\n");

function PROTO_VERSION_TEXT(): string {
  return PROTO2_VERSION;
}
