// Where the start sits and what sets the water's median surface: the start's kind, the lakes' share of
// the wet tiles and their median surface against the rivers' (wet tiles outside the lake outlines).
//   npx tsx investigation/canyon-highlands-96/survey2.ts <theme> <size> [seeds]
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { polygonMask } from "../../src/core/features/geometry";
const [theme, sizeS, seedsS] = process.argv.slice(2);
const size = Number(sizeS);
const seeds: number[] = [];
for (const part of (seedsS ?? "1-20").split(",")) {
  const [a, b] = part.split("-").map(Number);
  for (let s = a; s <= (b ?? a); s++) seeds.push(s);
}
const med = (v: number[]) => (v.length ? v.slice().sort((a, b) => a - b)[v.length >> 1] : NaN);
for (const seed of seeds) {
  const r = generate(makeSpec({ seed, theme: theme as ThemeId, size: { x: size, y: size } }));
  const o = r.outcomes;
  if (!o) { console.log(`s${seed} FAIL att=${r.attempts} ${(r.info as any).stage ?? ""} ${r.report.checks.filter((c) => !c.ok && !c.advisory && !c.approximate && c.applicable !== false).map((c) => c.id).join(",")}`); continue; }
  const sg = o.signature as any;
  const { W, H, heights, water } = r.built;
  const N = W * H;
  const inLake = new Uint8Array(N);
  for (const f of r.features ?? []) if (f.kind === "lake") { const m = polygonMask((f as any).params.outline, W, H); for (let i = 0; i < N; i++) if (m[i]) inLake[i] = 1; }
  const lakeS: number[] = [];
  const riverS: number[] = [];
  for (let i = 0; i < N; i++) if (water[i] >= 0.05) (inLake[i] ? lakeS : riverS).push(heights[i] + water[i]);
  const all = lakeS.concat(riverS);
  const rivers = (r.features ?? []).filter((f: any) => f.kind === "river" && !f.params.badwater && f.role !== "river/startSpring") as any[];
  const big = Math.max(0, ...rivers.filter((f) => f.role !== "river/lakeSpring").map((f) => f.params.flow));
  const st = r.built.start as any;
  // each clean river's flow and the median settled depth along its course
  const depths = rivers.map((f) => {
    const d: number[] = [];
    for (const [px, py] of f.params.path as [number, number][]) { const x = Math.round(px), y = Math.round(py); if (x >= 0 && y >= 0 && x < W && y < H) d.push(water[y * W + x]); }
    return `${f.role.replace("river/", "")}:q${f.params.flow}/d${med(d).toFixed(2)}`;
  }).join(" ");
  const sig = theme === "canyon" ? `canyon=${sg.canyon}/${sg.canyonShare}` : `high=${sg.high}`;
  console.log(`s${seed} ${o.met ? "MET " : "miss"} P${+o.promise}W${+o.story.readable} att=${r.attempts} ${sig} start=${st?.kind}${st?.levelled ? "(lev)" : ""}@L${st?.level} walk=${st?.shoreWalk} | wl=${med(all).toFixed(2)} lakes=${(lakeS.length / Math.max(1, all.length)).toFixed(2)}@${med(lakeS).toFixed(1)} rivers@${med(riverS).toFixed(1)} big=${big} heads=${rivers.length} [${depths}] fixes=${(r.info as any).fixes?.join(",") ?? ""}`);
}
