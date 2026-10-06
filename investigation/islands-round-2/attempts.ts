import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
const [size, ...seeds] = process.argv.slice(2).map(Number);
for (const seed of seeds) {
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }));
  const g: any = (r.info as any).genome; const sea = g.parts.find((p: any) => p.shape === "sea");
  console.log(seed, g.seaLayout, g.seaRing ? "ring" : "open", "attempts", r.attempts, "sea size", sea.size.toFixed(1), "depth", sea.height.toFixed(1), "aspect", sea.extra.toFixed(2), "tilt", g.tilt?.toFixed(2), "eq", g.hyps?.eq?.toFixed(2), "isles", g.parts.filter((p: any) => p.isle).length);
}
