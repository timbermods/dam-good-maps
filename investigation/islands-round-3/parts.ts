// What a seed's shown Islands land was drawn from: its layout, ring, headlands, the islands' radii
// (tiles) and the wet share. `npx tsx investigation/islands-round-3/parts.ts <size> <seed>...`
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
const [size, ...seeds] = process.argv.slice(2).map(Number);
for (const seed of seeds) {
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }));
  const g: any = (r.info as any).genome; const w = r.built.water;
  const isles = g.parts.filter((p: any) => p.isle && !p.head).map((p: any) => p.size.toFixed(0)).join(",");
  const wet = Array.from(w).filter((v) => v > 0.05).length / w.length;
  console.log(seed, g.seaLayout, g.seaRing ? "ring" : "open", "attempts", r.attempts, "heads", g.parts.filter((p: any) => p.head).length, "isles", isles, "wet", wet.toFixed(2));
}
