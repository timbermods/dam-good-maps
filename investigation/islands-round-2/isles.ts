// Where each isle part of the sea layout ended up on the finished map: its mass over the sea's level
// (size, touching the edge or not), whether it is a headland (D417's broad headlands reach into the
// sea from the land) and the planned rise. `npx tsx investigation/islands-round-2/isles.ts <size> <seeds...>`
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { seaLevel } from "../../src/core/land/islands";
import { orientXY } from "../../src/core/land/orient";
const [size, ...seeds] = process.argv.slice(2).map(Number);
for (const seed of seeds) {
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }));
  const { W, H } = r.built; const N = W * H; const h = r.built.heights; const w = r.built.water;
  const S = seaLevel(h, W, H);
  const dry = (i: number) => h[i] > S;
  const lab = new Int32Array(N).fill(-1); const sz: number[] = []; const edge: boolean[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] >= 0 || !dry(s0)) continue;
    const id = sz.length; const q = [s0]; lab[s0] = id; let e = false;
    for (let k = 0; k < q.length; k++) { const c = q[k]; const x = c % W, y = (c - x) / W; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) e = true;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (lab[j] < 0 && dry(j)) { lab[j] = id; q.push(j); } } }
    sz.push(q.length); edge.push(e);
  }
  const g: any = (r.info as any).genome; const o = g.orientation ?? 0;
  const st = r.built.start!;
  const isles = g.parts.filter((p: any) => p.isle);
  const sea = g.parts.find((p: any) => p.shape === "sea");
  const [sx, sy] = orientXY(sea.at[0] * (W - 1), sea.at[1] * (H - 1), W, H, o);
  console.log(`seed ${seed} ${g.seaLayout} ${g.seaRing ? "ring" : "open"} S=${S} sea at (${sx.toFixed(0)},${sy.toFixed(0)}) R=${sea.size.toFixed(0)} start (${st.x},${st.y}) mass ${sz[lab[st.y * W + st.x]]} wet ${(Array.from(w).filter((v) => v > 0.05).length / N).toFixed(2)}`);
  isles.forEach((p: any, k: number) => {
    const [x, y] = orientXY(p.at[0] * (W - 1), p.at[1] * (H - 1), W, H, o);
    const i = Math.round(y) * W + Math.round(x); const m = lab[i];
    // the isle's own land: dry tiles within its radius
    let own = 0, mainM = new Map<number, number>();
    for (let yy = Math.max(0, Math.floor(y - p.size)); yy <= Math.min(H - 1, Math.ceil(y + p.size)); yy++) for (let xx = Math.max(0, Math.floor(x - p.size)); xx <= Math.min(W - 1, Math.ceil(x + p.size)); xx++) { if ((xx - x) ** 2 + (yy - y) ** 2 > p.size * p.size) continue; const j = yy * W + xx; if (dry(j)) { own++; mainM.set(lab[j], (mainM.get(lab[j]) ?? 0) + 1); } }
    const top = [...mainM.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([mm, c]) => `${sz[mm]}${edge[mm] ? "e" : ""}×${c}`).join(",");
    const dSea = Math.hypot(x - sx, y - sy) / sea.size;
    console.log(`  isle ${k} at (${x.toFixed(0)},${y.toFixed(0)}) r=${p.size.toFixed(1)} rise=${p.height.toFixed(1)} h=${h[i]} ${dry(i) ? "dry" : "WET"} d/R=${dSea.toFixed(2)} ownDry=${own}/${Math.round(Math.PI * p.size * p.size)} masses ${top}`);
  });
}
