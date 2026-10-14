// A theme's first maps, one line each: the outcomes, the signature's numbers, the rivers' flows, the
// water's median surface and the dry land's share by level over it.
//   npx tsx investigation/canyon-highlands-96/survey.ts <theme> <size> [seeds]
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
const [theme, sizeS, seedsS] = process.argv.slice(2);
const size = Number(sizeS);
const seeds: number[] = [];
for (const part of (seedsS ?? "1-20").split(",")) {
  const [a, b] = part.split("-").map(Number);
  for (let s = a; s <= (b ?? a); s++) seeds.push(s);
}
for (const seed of seeds) {
  const r = generate(makeSpec({ seed, theme: theme as ThemeId, size: { x: size, y: size } }));
  const o = r.outcomes!;
  const sg = o.signature as any;
  const g = (r.info as any).genome;
  const { W, H, heights, water } = r.built;
  const N = W * H;
  const surf: number[] = [];
  for (let i = 0; i < N; i++) if (water[i] >= 0.05) surf.push(heights[i] + water[i]);
  surf.sort((a, b) => a - b);
  const wl = surf.length ? surf[surf.length >> 1] : 0;
  let dry = 0;
  const over = new Map<number, number>();
  for (let i = 0; i < N; i++) if (!(water[i] >= 0.05)) { dry++; const d = Math.floor(heights[i] - wl); over.set(d, (over.get(d) ?? 0) + 1); }
  const hist = [...over].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}:${Math.round((n / dry) * 100)}`).join(" ");
  const rivers = (r.features ?? []).filter((f: any) => f.kind === "river" && !f.params.badwater) as any[];
  const main = rivers.find((f) => f.role === "river/main");
  const sig = theme === "canyon" ? `canyon=${sg.canyon}/${sg.canyonShare}` : `high=${sg.high} plat=${sg.plateaus} cliffs=${sg.cliffs}`;
  console.log(`s${seed} ${o.met ? "MET " : "miss"} P${+o.promise}W${+o.story.readable} att=${r.attempts} ${sig} lake=${sg.lakeShare} wl=${wl.toFixed(2)} main=q${main?.params.flow}/L${main?.params.path.length} heads=${rivers.length}[${rivers.map((f) => f.params.flow).join(",")}] in=${g?.hydro.inflows} sp=${g?.hydro.springs} inc=${g?.hydro.incise.toFixed(1)} fl=${g?.hydro.floor.toFixed(1)} step=${g?.terrace.step} share=${g?.terrace.share.toFixed(2)} eq=${g?.hyps.eq.toFixed(2)} lean=${g?.hyps.lean.toFixed(2)} tilt=${g?.tiltKind}/${g?.tilt.toFixed(1)} | ${hist} | ${o.story.why.join("; ")}`);
}
