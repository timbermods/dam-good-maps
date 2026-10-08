// Relief the eye might see, per first map: the main river's walls (the highest ground within 5 tiles
// of each bank over the water's surface: median and the share of the course with walls of 5+ on
// both sides), the land's cliffs (adjacent dry tiles' level jumps: the share of the land next to a
// jump of 3+ and of 5+), the land's levels (share per level), and the outcomes.
//   npx tsx investigation/canyon-highlands-height/survey3.ts <theme> <size> [seeds]
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
const [theme, sizeS, seedsS] = process.argv.slice(2);
const size = Number(sizeS);
const seeds: number[] = [];
for (const part of (seedsS ?? "1-20").split(",")) {
  const [a, b] = part.split("-").map(Number);
  for (let s = a; s <= (b ?? a); s++) seeds.push(s);
}
const med = (v: number[]) => (v.length ? v.slice().sort((a, b) => a - b)[v.length >> 1] : NaN);
let sumWall = 0, sumDeep = 0, sumCliff3 = 0, sumCliff5 = 0, n = 0;
for (const seed of seeds) {
  const r = generate(makeSpec({ seed, theme: theme as ThemeId, size: { x: size, y: size } }));
  const o = r.outcomes!;
  const { W, H, heights: h, water: D } = r.built;
  const N = W * H;
  const wet = (i: number) => D[i] >= 0.05;
  const rivers = (r.features ?? []).filter((f: any) => f.kind === "river" && !f.params.badwater && f.role !== "river/startSpring" && f.role !== "river/lakeSpring") as any[];
  const main = rivers.find((f) => f.role === "river/main") ?? rivers[0];
  // walls along the main course, as the signature reads them (from the bank out 5 tiles)
  const walls: number[] = [];
  let deep = 0, samples = 0;
  if (main) {
    const p = main.params.path as [number, number][];
    for (let k = 0; k + 1 < p.length; k++) {
      const [ax, ay] = p[k]; const [bx, by] = p[k + 1];
      const L = Math.hypot(bx - ax, by - ay); if (L <= 0) continue;
      const dx = (bx - ax) / L, dy = (by - ay) / L;
      const x = Math.round(ax), y = Math.round(ay);
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2) continue;
      // the water's surface near the point
      let surf = Infinity;
      for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) { if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const i = yy * W + xx; if (wet(i) && h[i] + D[i] < surf) surf = h[i] + D[i]; }
      if (!Number.isFinite(surf)) continue;
      const side: number[] = [];
      for (const sgn of [-1, 1]) {
        let bank = -1;
        for (let t = 1; t <= 12 && bank < 0; t++) { const xx = Math.round(x - sgn * dy * t), yy = Math.round(y + sgn * dx * t); if (xx < 0 || yy < 0 || xx >= W || yy >= H) break; if (!wet(yy * W + xx)) bank = t; }
        if (bank < 0) { side.push(0); continue; }
        let top = -Infinity;
        for (let t = bank; t <= bank + 4; t++) { const xx = Math.round(x - sgn * dy * t), yy = Math.round(y + sgn * dx * t); if (xx < 0 || yy < 0 || xx >= W || yy >= H) break; top = Math.max(top, h[yy * W + xx]); }
        side.push(Math.max(0, top - surf));
      }
      walls.push(Math.min(side[0], side[1]));
      samples++;
      if (Math.min(side[0], side[1]) >= 5) deep++;
    }
  }
  // cliffs: dry tiles next to a jump of 3+ / 5+
  let dry = 0, c3 = 0, c5 = 0;
  const lv = new Map<number, number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (wet(i)) continue; dry++;
    lv.set(h[i], (lv.get(h[i]) ?? 0) + 1);
    let jump = 0;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + ddx, yy = y + ddy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; jump = Math.max(jump, Math.abs(h[i] - h[yy * W + xx])); }
    if (jump >= 3) c3++; if (jump >= 5) c5++;
  }
  const levels = [...lv].sort((a, b) => a[0] - b[0]).filter(([, c]) => c / dry >= 0.03).map(([l, c]) => `${l}:${Math.round((100 * c) / dry)}`).join(" ");
  const wallMed = med(walls), deepShare = samples ? deep / samples : 0;
  sumWall += wallMed; sumDeep += deepShare; sumCliff3 += c3 / dry; sumCliff5 += c5 / dry; n++;
  const g = (r.info as any).genome;
  console.log(`s${seed} ${o.met ? "MET " : "miss"} P${+o.promise}W${+o.story.readable} att=${r.attempts} wall med=${wallMed} 5+=${(deepShare * 100).toFixed(0)}% cliff3=${((100 * c3) / dry).toFixed(0)}% cliff5=${((100 * c5) / dry).toFixed(1)}% base=${g?.base.toFixed(1)} top=${g?.top} step=${g?.terrace.step} share=${g?.terrace.share.toFixed(2)} inc=${g?.hydro.incise.toFixed(1)} fl=${g?.hydro.floor.toFixed(1)} lean=${g?.hyps.lean.toFixed(2)} eq=${g?.hyps.eq.toFixed(2)} | ${levels} | ${o.summary}`);
}
console.log(`mean: wall ${(sumWall / n).toFixed(1)} deep ${((100 * sumDeep) / n).toFixed(0)}% cliff3 ${((100 * sumCliff3) / n).toFixed(0)}% cliff5 ${((100 * sumCliff5) / n).toFixed(1)}% met ${seeds.length}`);
