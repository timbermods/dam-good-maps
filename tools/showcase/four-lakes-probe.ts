// Four Lakes: the design alone, in a second (no core): the land's measures, the works' rows, the seeps, the old
// channel's bed where the South Run meets it.   npx tsx tools/showcase/four-lakes-probe.ts
import { CHANNELS, designLand, measureLand, N, W } from "./four-lakes-design";

const land = designLand();
const m = measureLand(land.heights);
console.log(`land: flat ${(m.flat8 * 100).toFixed(1)} %, one-level steps ${(m.step1 * 100).toFixed(1)} %, top-3 ${(m.top3 * 100).toFixed(1)} %, max step ${m.maxStep}, highest ${m.histogram.reduce((a, v, k) => (v ? k : a), 0)}`);
console.log(`histogram: ${m.histogram.map((v, k) => `${k}:${v}`).join(" ")}`);
console.log(`guard raised ${land.guarded}; plugs ${land.plugs.map((p) => p.length).join(", ")}`);
for (const [name, row] of Object.entries(land.works)) console.log(`  ${name}: ${row.length} tiles, bed ${[...new Set(row.map((i) => land.heights[i]))].join("/")}, at ${row.slice(0, 8).map((i) => `${i % W},${Math.floor(i / W)}`).join(" ")}`);
console.log(`seeps: ${land.seeps.map(([x, y, q]) => `${x},${y} (${q}) bed ${land.heights[y * W + x]}`).join("; ")}`);
console.log(`old channel's bed, every 2 tiles from 240: ${land.beds["Old channel"].slice(120).join(" ")}`);
const k = CHANNELS.findIndex((c) => c.name === "South Run") + 1;
const tiles: string[] = [];
for (let i = 0; i < N; i++) if (land.channel[i] === k) tiles.push(`${i % W},${Math.floor(i / W)}:${land.heights[i]}`);
console.log(`South Run's bed: ${tiles.join(" ")}`);
for (const name of ["West Run", "Birch Brook", "South Brook", "High Brook", "Bench Brook"]) {
  const c = CHANNELS.findIndex((q) => q.name === name) + 1;
  // how deep the bed lies under its banks: the mean over its bed tiles of (lowest neighbour that is not bed) - bed
  let sum = 0;
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (land.channel[i] !== c) continue;
    let lo = 99;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && !land.channel[j] && !land.lake[j]) lo = Math.min(lo, land.heights[j] - land.heights[i]);
    if (lo < 99) {
      sum += lo;
      n++;
    }
  }
  console.log(`  ${name}: ${n} bank tiles, banks ${(sum / Math.max(1, n)).toFixed(2)} over the bed`);
}
