// The island counts before and after per size, from local/{before,after}-<size>.json (reach.ts), and
// the per-seed table at one size: `node investigation/islands-round-2/summarise.cjs [128]`.
const fs = require("fs");
const d = __dirname + "/local/";
const tableSize = Number(process.argv[2] || 128);
const load = (f) => (fs.existsSync(d + f) ? JSON.parse(fs.readFileSync(d + f)) : null);
console.log("| Size | No island to expand to, before | After | Attempts, mean before → after | Wet share, median before → after |");
console.log("|---|---|---|---|---|");
for (const size of [96, 128, 256]) {
  const b = load(`before-${size}.json`), a = load(`after-${size}.json`);
  if (!b || !a) { console.log(`| ${size}² | (missing) | | | |`); continue; }
  const none = (rows) => rows.filter((r) => !r.reachable).map((r) => r.seed);
  const mean = (rows, k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(1);
  const med = (rows, k) => { const v = rows.map((r) => r[k]).sort((p, q) => p - q); return v[Math.floor(v.length / 2)].toFixed(2); };
  const nb = none(b), na = none(a);
  console.log(`| ${size}² | ${nb.length} (${nb.join(", ")}) | ${na.length}${na.length ? ` (${na.join(", ")})` : ""} | ${mean(b, "attempts")} → ${mean(a, "attempts")} | ${med(b, "wet")} → ${med(a, "wet")} |`);
}
const b = load(`before-${tableSize}.json`), a = load(`after-${tableSize}.json`);
if (b && a) {
  console.log(`\nSeeds 1–30 at ${tableSize}²: the largest island to expand to (tiles, strait), before → after; the layout after.\n`);
  console.log("| Seed | Before | After | Layout after | Seed | Before | After | Layout after |");
  console.log("|---|---|---|---|---|---|---|---|");
  const cell = (r) => (r.reachable ? `${r.reachable} (${r.strait})` : `none (largest ${r.largest})`);
  const bm = new Map(b.map((r) => [r.seed, r]));
  for (let s = 1; s <= 15; s++) {
    const row = (seed) => { const r = a.find((x) => x.seed === seed); const o = bm.get(seed); return `${seed} | ${cell(o)} | ${cell(r)} | ${r.layout}${r.ring ? ", ring" : ""}`; };
    console.log(`| ${row(s)} | ${row(s + 15)} |`);
  }
}
