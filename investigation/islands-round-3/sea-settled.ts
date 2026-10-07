// The sea's planned level against its settled surface, and the largest island planned and settled.
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { seaLevel, islandToExpandTo } from "../../src/core/land/islands";
const [size, ...seeds] = process.argv.slice(2).map(Number);
for (const seed of seeds) {
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }));
  const { W, H, heights: h, water: w } = r.built; const N = W * H;
  const S = seaLevel(h, W, H);
  const surf = new Map<number, number>();
  for (let i = 0; i < N; i++) if (w[i] > 0.05) { const lv = Math.round((h[i] + w[i]) * 4) / 4; surf.set(lv, (surf.get(lv) ?? 0) + 1); }
  const top = [...surf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l, c]) => `${l}:${c}`).join(" ");
  console.log(seed, (r.info as any).genome?.seaLayout, "attempts", r.attempts, "planned S", S, "planned island", (r.info as any).planned?.island, "| settled island", islandToExpandTo(h, w, W, H), "| settled surfaces", top);
}
