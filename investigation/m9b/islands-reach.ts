// Islands to expand to (D429, Kyler's check): for seeds a..b at 128², the largest island to build on
// reachable from the start: `npx tsx investigation/m9b/islands-reach.ts 1 30`. An island is dry land
// (water at most 0.05 deep) not joined to the start's land and clear of the map's edges, of 150 tiles or
// more; reachable across at most 8 tiles of water at a time (a bridge, levees or a dam across a
// strait), hopping on by any land reached. A land bridge makes it the start's land, not an island.
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
const [a, b] = process.argv.slice(2).map(Number);
const T = 8;        // the longest strait counted as crossable (a bridge, levees or a dam)
const BUILD = 150;  // dry tiles an island needs to count as one to build on
for (let seed = a; seed <= b; seed++) {
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: 128, y: 128 } }));
  const { W, H } = r.built; const N = W * H; const w = r.built.water;
  const dry = (i: number) => !(w[i] > 0.05);
  const lab = new Int32Array(N).fill(-1); const size: number[] = []; const edge: boolean[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] >= 0 || !dry(s0)) continue;
    const id = size.length; const q = [s0]; lab[s0] = id; let e = false;
    for (let k = 0; k < q.length; k++) { const c = q[k]; const x = c % W, y = (c - x) / W; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) e = true;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (lab[j] < 0 && dry(j)) { lab[j] = id; q.push(j); } } }
    size.push(q.length); edge.push(e);
  }
  const st = r.built.start!; const home = lab[st.y * W + st.x];
  // reachable masses: from the start's land, across at most T tiles of water at a time, hopping on
  const reach = new Set<number>([home]); const gapOf = new Map<number, number>([[home, 0]]);
  let grew = true;
  while (grew) {
    grew = false;
    const dist = new Int16Array(N).fill(-1); const q: number[] = [];
    for (let i = 0; i < N; i++) if (lab[i] >= 0 && reach.has(lab[i])) { dist[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) { const c = q[k]; if (dist[c] >= T + 1) continue; const x = c % W, y = (c - x) / W;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (dist[j] >= 0) continue;
        if (dry(j)) { if (!reach.has(lab[j])) { reach.add(lab[j]); gapOf.set(lab[j], dist[c]); grew = true; } continue; }
        dist[j] = dist[c] + 1; q.push(j); } }
  }
  let best = -1;
  for (const m of reach) if (m !== home && !edge[m] && size[m] >= BUILD && (best < 0 || size[m] > size[best])) best = m;
  // and the largest island at all, reachable or not
  let any = -1;
  for (let m = 0; m < size.length; m++) if (m !== home && !edge[m] && (any < 0 || size[m] > size[any])) any = m;
  console.log(seed, "start-land", size[home], edge[home] ? "shore" : "island", "| reachable island", best >= 0 ? `${size[best]} tiles, strait ${gapOf.get(best)}` : "none", "| largest island", any >= 0 ? size[any] : 0, "| layout", (r.info as any).genome?.seaLayout);
}
