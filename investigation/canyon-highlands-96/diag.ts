// One map, attempt by attempt, with the outcomes' readings: what the land-stage screen read on the
// plan, what each attempt's settled map read, and the final signature.
//   npx tsx investigation/canyon-highlands-96/diag.ts <theme> <seed> <size>
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { outcomesOf } from "../../src/core/gen/outcomes";
const [theme, seedS, sizeS] = process.argv.slice(2);
const size = Number(sizeS);
const r = generate(makeSpec({ seed: Number(seedS), theme: theme as ThemeId, size: { x: size, y: size } }), {
  onAttempt: ({ attempt, passed, result }) => {
    const info = result.info as any;
    const o = result.outcomes;
    const sg = o?.signature as any;
    const sig = sg ? (theme === "canyon" ? `canyon=${sg.canyon} share=${sg.canyonShare}` : `high=${sg.high} plat=${sg.plateaus} cliffs=${sg.cliffs}`) : "";
    const rivers = (result.features ?? []).filter((f: any) => f.kind === "river" && !f.params.badwater).map((f: any) => `${f.role.replace("river/", "")}:q${f.params.flow}/w${f.params.width}/L${f.params.path.length}`).join(" ");
    console.log(`#${attempt} ${passed ? "PASS" : "fail"} stage=${info.stage} planned=${JSON.stringify(info.planned)} ${sig} | ${o?.summary ?? ""} | ${rivers} | ${result.report.checks.filter((c) => !c.ok && !c.advisory && !c.approximate && c.applicable !== false).map((c) => c.id).join(",")}`);
  },
});
const g = (r as any).genome ?? (r as any).info?.genome;
console.log("attempts", r.attempts, "outcomes", r.outcomes?.summary);
console.log("signature", JSON.stringify(r.outcomes?.signature));
console.log("story", JSON.stringify(r.outcomes?.story));
if (g) console.log("genome", JSON.stringify({ relief: g.relief, base: g.base, top: g.top, hydro: g.hydro, noise: g.noise, parts: g.parts.map((p: any) => `${p.kind}@${p.at.map((v: number) => v.toFixed(2))} s${p.size.toFixed(0)} h${p.height.toFixed(1)}`), terrace: g.terrace, hyps: g.hyps, regional: g.regional, tilt: g.tilt, tiltKind: g.tiltKind, vt: g.vt, intentions: g.intentions }));
// heights histogram against the water's median surface
const { W, H, heights, water } = r.built;
const N = W * H;
const surf: number[] = [];
for (let i = 0; i < N; i++) if (water[i] >= 0.05) surf.push(heights[i] + water[i]);
surf.sort((a, b) => a - b);
const wl = surf[surf.length >> 1];
const hist = new Map<number, number>();
let dry = 0;
for (let i = 0; i < N; i++) if (!(water[i] >= 0.05)) { dry++; hist.set(heights[i], (hist.get(heights[i]) ?? 0) + 1); }
console.log("water median surface", wl, "wet share", (surf.length / N).toFixed(3));
console.log("dry heights:", [...hist].sort((a, b) => a[0] - b[0]).map(([h, n]) => `${h}:${(n / dry * 100).toFixed(0)}%`).join(" "));
