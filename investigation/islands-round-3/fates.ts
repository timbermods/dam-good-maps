// What became of each island a layout drew, on each planned land of a seed (DGM_WHY=1 exposes the
// planned land, with the temporary line in REPORT.md, "Regenerating"): under the sea, joined to the
// mainland (the largest land), joined to another island, or standing alone, with its tiles. `DGM_WHY=1 npx tsx investigation/islands-round-3/fates.ts <size> <seed>...`
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { orientXY } from "../../src/core/land/orient";
const [size, ...seeds] = process.argv.slice(2).map(Number);
for (const seed of seeds) generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }), { onAttempt: (a: any) => {
  const p = (globalThis as any).__plan; (globalThis as any).__plan = null; if (!p) return;
  const g = a.result.info?.genome; const { W, H } = p; const N = W * H; const dry = (i: number) => !(p.water[i] > 0.05);
  const lab = new Int32Array(N).fill(-1); const sz: number[] = [];
  for (let s = 0; s < N; s++) { if (lab[s] >= 0 || !dry(s)) continue; const id = sz.length; const q = [s]; lab[s] = id;
    for (let k = 0; k < q.length; k++) { const c = q[k]; const x = c % W, y = (c - x) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (lab[j] < 0 && dry(j)) { lab[j] = id; q.push(j); } } }
    sz.push(q.length); }
  const main = sz.indexOf(Math.max(...sz)); const o = g.orientation ?? 0; const seen = new Map<number, number>();
  const fates = g.parts.filter((q: any) => q.kind === "isle" && q.isle && !q.head).map((q: any) => {
    const [x, y] = orientXY(q.at[0] * (W - 1), q.at[1] * (H - 1), W, H, o); const i = Math.round(y) * W + Math.round(x); const l = lab[i];
    if (l < 0) return `${q.size.toFixed(0)}:sea`; if (l === main) return `${q.size.toFixed(0)}:MAIN`;
    seen.set(l, (seen.get(l) ?? 0) + 1); return `${q.size.toFixed(0)}:m${l}(${sz[l]})`;
  });
  console.log(seed, a.attempt, g.seaLayout, g.seaRing ? "ring" : "open", a.result.info?.stage, "|", fates.join(" "), "| heads", g.parts.filter((q: any) => q.head && q.kind === "isle").length);
} } as any);
