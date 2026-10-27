// The land's life per first map: the share of dry land that is moist (green), the wet share, the
// lake share of the wet tiles, the signature's reading, and the outcomes.
//   npx tsx investigation/canyon-highlands-height/survey4.ts <theme> <size> [seeds]
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
const [theme, sizeS, seedsS] = process.argv.slice(2);
const size = Number(sizeS);
const seeds: number[] = [];
for (const part of (seedsS ?? "1-30").split(",")) {
  const [a, b] = part.split("-").map(Number);
  for (let s = a; s <= (b ?? a); s++) seeds.push(s);
}
for (const seed of seeds) {
  const r = generate(makeSpec({ seed, theme: theme as ThemeId, size: { x: size, y: size } }));
  const o = r.outcomes;
  const b = r.built; const N = b.W * b.H;
  let dry = 0, moist = 0, wet = 0;
  for (let i = 0; i < N; i++) { if (b.water[i] >= 0.05) wet++; else { dry++; if (b.moisture[i] > 0) moist++; } }
  const sg = (o?.signature ?? {}) as any;
  const sig = theme === "canyon" ? `canyon=${sg.canyon}/${sg.canyonShare}` : `high=${sg.high}`;
  console.log(`s${seed} ${o?.met ? "MET " : "miss"} moist=${(moist / dry * 100).toFixed(0)}% wet=${(wet / N * 100).toFixed(1)}% lake=${sg.lakeShare} ${sig} | ${o?.summary ?? ""}`);
}
