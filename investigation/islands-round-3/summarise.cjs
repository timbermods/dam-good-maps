// Round 3's tables from local/<tag>-<size>.json (reach.ts): `node summarise.cjs dev r2 r3` prints, per size,
// the seeds with no island to expand to, the attempts, the wet share and the ring count for each tag.
const fs = require("fs");
const d = __dirname + "/local/";
const tags = process.argv.slice(2);
const load = (t, s) => (fs.existsSync(`${d}${t}-${s}.json`) ? JSON.parse(fs.readFileSync(`${d}${t}-${s}.json`)) : null);
for (const size of [96, 128, 256]) {
  console.log(`\n${size}²`);
  console.log("| Version | No island to expand to | Attempts, mean | Wet share, median | Ring maps | No start |");
  console.log("|---|---|---|---|---|---|");
  for (const t of tags) {
    const rows = load(t, size);
    if (!rows) { console.log(`| ${t} | (missing) | | | | |`); continue; }
    const none = rows.filter((r) => !r.reachable).map((r) => r.seed);
    const mean = (rows.reduce((s, r) => s + r.attempts, 0) / rows.length).toFixed(1);
    const wet = rows.map((r) => r.wet).sort((p, q) => p - q)[Math.floor(rows.length / 2)].toFixed(2);
    const rings = rows.filter((r) => r.ring).length;
    const ns = rows.filter((r) => r.startOn === "none").map((r) => r.seed);
    console.log(`| ${t} | ${none.length}${none.length ? ` (${none.join(", ")})` : ""} | ${mean} | ${wet} | ${rings} | ${ns.length ? ns.join(", ") : "0"} |`);
  }
}
