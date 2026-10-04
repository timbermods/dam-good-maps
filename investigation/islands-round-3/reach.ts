// Islands to expand to (D429, D432), the measure of `investigation/m9b/islands-reach.ts` at any size,
// with the island list behind each row: `npx tsx investigation/islands-round-3/reach.ts <size> <a> <b> [out.json]`.
// An island is dry land (water at most 0.05 deep) not joined to the start's land and clear of the
// map's edges, of 150 tiles or more (scaled by area from 128²); reachable across at most 8 tiles of
// water at a time, hopping on by any land reached. A land bridge makes it the start's land.
import { writeFileSync } from "node:fs";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
const [size, a, b] = process.argv.slice(2, 5).map(Number);
const outPath = process.argv[5];
const T = 8;
const BUILD = 150;
const rows: any[] = [];
for (let seed = a; seed <= b; seed++) {
  const t0 = Date.now();
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }));
  const { W, H } = r.built; const N = W * H; const w = r.built.water;
  const dry = (i: number) => !(w[i] > 0.05);
  const lab = new Int32Array(N).fill(-1); const sz: number[] = []; const edge: boolean[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] >= 0 || !dry(s0)) continue;
    const id = sz.length; const q = [s0]; lab[s0] = id; let e = false;
    for (let k = 0; k < q.length; k++) { const c = q[k]; const x = c % W, y = (c - x) / W; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) e = true;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (lab[j] < 0 && dry(j)) { lab[j] = id; q.push(j); } } }
    sz.push(q.length); edge.push(e);
  }
  const st = r.built.start;
  if (!st) {
    const row = { seed, size, attempts: r.attempts, passed: r.report.passed, failed: r.report.checks.filter((c: any) => !c.passed).map((c: any) => c.id), layout: (r.info as any).genome?.seaLayout, ring: !!(r.info as any).genome?.seaRing, startLand: 0, startOn: "none", reachable: 0, strait: null, largest: 0, largestReach: false, wet: 0, islands: [], secs: 0 };
    rows.push(row); console.log(seed, row.layout, "| NO START", JSON.stringify(row.failed)); continue;
  }
  const home = lab[st.y * W + st.x];
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
  for (const m of reach) if (m !== home && !edge[m] && sz[m] >= BUILD && (best < 0 || sz[m] > sz[best])) best = m;
  let any = -1;
  for (let m = 0; m < sz.length; m++) if (m !== home && !edge[m] && (any < 0 || sz[m] > sz[any])) any = m;
  // every mass 30 tiles or more, for the picture behind the row
  const islands = sz.map((s, m) => ({ m, s, edge: edge[m], reach: reach.has(m), gap: gapOf.get(m) ?? null })).filter((o) => o.m !== home && o.s >= 30).sort((p, q) => q.s - p.s);
  const g: any = (r.info as any).genome;
  const wet = Array.from(w).filter((v) => v > 0.05).length / N;
  let hash = 0; for (let i = 0; i < N; i++) hash = (Math.imul(hash, 31) + r.built.heights[i]) | 0;
  const fails: Record<string, number> = {};
  for (const f of ((r as any).failures ?? []) as { failed: string[] }[]) for (const why of f.failed) fails[why] = (fails[why] ?? 0) + 1;
  const row = { seed, size, attempts: r.attempts, passed: r.report.passed, fails, hash, layout: g?.seaLayout, ring: !!g?.seaRing, orientation: g?.orientation, startLand: sz[home], startOn: edge[home] ? "shore" : "island", reachable: best >= 0 ? sz[best] : 0, strait: best >= 0 ? gapOf.get(best) : null, largest: any >= 0 ? sz[any] : 0, largestReach: any >= 0 ? reach.has(any) : false, wet: +wet.toFixed(3), islands, secs: +((Date.now() - t0) / 1000).toFixed(1) };
  rows.push(row);
  console.log(seed, row.layout, row.ring ? "ring" : "open", "| start-land", row.startLand, row.startOn, "| reachable", row.reachable ? `${row.reachable} (${row.strait})` : "none", "| largest", row.largest, row.largestReach ? "reached" : "far", "| islands", islands.slice(0, 6).map((o) => `${o.s}${o.edge ? "e" : ""}${o.reach ? "r" : ""}`).join(" "), "|", row.secs, "s");
}
if (outPath) writeFileSync(outPath, JSON.stringify(rows, null, 1));
