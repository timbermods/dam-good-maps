// The poisoned floodplain's works over seeds (docs/design/poisoned-floodplain.md §7 "proof", §9 row 4, §10): each
// seed's map at each size (`plainMap.ts`), the start's numbers first, its bands, the Red Fall's curtain (the shared fall
// judge), each rung's site and what it buys by number (`plainWorks.ts`), the works checks it fails, and the two proofs
// (`plainProof.ts`): the turn and then the river in built on its settled session, the floor's green after them. One
// line a map, then the table: first-attempt passes and the green after the river in.
//
//   npx tsx tools/plain-works.ts [--seeds 1-12] [--sizes 128,192,256] [--json out.json]

import { writeFileSync } from "node:fs";
import { plainMap } from "../src/core/premise/plainMap";
import { plainProof, RIVER_IN } from "../src/core/premise/plainProof";
import { plainMeasure } from "../src/core/premise/plainWorks";
import { makeSpec } from "../src/core/spec/mapspec";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const range = (t: string) => t.split(",").flatMap((x) => (x.includes("-") ? Array.from({ length: Number(x.split("-")[1]) - Number(x.split("-")[0]) + 1 }, (_, k) => Number(x.split("-")[0]) + k) : [Number(x)]));
const SEEDS = range(arg("seeds", "1-12"));
const SIZES = range(arg("sizes", "128,192,256"));
const JSON_OUT = arg("json", "");

interface Row {
  seed: number;
  side: number;
  held: boolean;
  attempt: number;
  start: string;
  bands: string;
  fall: string;
  works: string;
  fails: string;
  turn: boolean | null;
  riverIn: boolean | null;
  green: number | null;
  ditchable: number | null;
  /** The small rungs the map lists (`listPaid`). */
  small: string;
  /** The generate's time (ms) and the check that refused the first attempt. */
  ms: number;
  first: string;
  line: string;
}

const rows: Row[] = [];
for (const side of SIZES)
  for (const seed of SEEDS) {
    const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
    const t0 = performance.now();
    const m = plainMap(spec);
    if ("reason" in m) {
      console.log(`seed ${seed} at ${side}²: no map: ${m.reason}`);
      rows.push({ seed, side, held: false, attempt: -1, start: "", bands: "", fall: "", works: "", fails: m.reason, turn: null, riverIn: null, green: null, ditchable: null, small: "", ms: Math.round(performance.now() - t0), first: m.failed[0] ?? m.reason, line: "" });
      continue;
    }
    const ms = Math.round(performance.now() - t0);
    const st = Object.entries(m.start).map(([k, v]) => `${k.slice(6)} ${v.value}/${v.limit}${v.ok ? "" : "!"}`).join(", ");
    const s = m.settled.bands;
    const pc = (v: number) => `${Math.round(100 * v)} %`;
    const fall = m.settled.curtain;
    const works = m.ladder.works.map((w) => `${w.id} ${w.tiles.length}t→${w.level} ${plainMeasure(w)}${w.paid ? "" : "?"}`).join("; ");
    const pf = m.held ? plainProof(spec, m) : null;
    const row: Row = {
      seed,
      side,
      held: m.held,
      attempt: m.attempt,
      start: st,
      bands: `dead ${pc(s.dead)}, green ${pc(s.green)}, dry ${pc(s.dry)}`,
      fall: fall.ok ? "whole" : `SPLIT (${fall.note})`,
      works,
      fails: [...m.failed, ...m.works.map((f) => `${f.id}: ${f.reason}`)].join(" | "),
      turn: pf ? pf.turn.ok : null,
      riverIn: pf ? pf.riverIn.ok : null,
      green: pf ? pf.riverIn.bands.green : null,
      ditchable: pf ? pf.riverIn.ditchable : null,
      small: m.ladder.works.filter((w) => w.rung === "small" || w.rung === "first").map((w) => w.id).join("+"),
      ms,
      first: m.attempt > 0 ? m.failed[0] ?? "" : "",
      line: pf
        ? `turn: red on the floor ${pf.turn.red}, lip ${pf.turn.lip}, fork ${pf.turn.fork}, leaks ${pf.turn.leaks}, dead ${pc(pf.before.bands.dead)}→${pc(pf.turn.bands.dead)}; river in: green ${pc(pf.before.bands.green)}→${pc(pf.turn.bands.green)}→${pc(pf.riverIn.bands.green)} (dry ${pc(pf.riverIn.bands.dry)}, dead ${pc(pf.riverIn.bands.dead)}; ditchable ${pc(pf.riverIn.ditchable)} (from any clean water ${pc(pf.riverIn.ditchableClean)}); the sloughs wet ${pf.riverIn.sloughs.map(pc).join(", ")}), plain sheet ${pf.riverIn.plain}, start ${pf.riverIn.start}; ${pf.ms} ms`
        : "",
    };
    rows.push(row);
    console.log(`seed ${seed} at ${side}²: start ${st}\n  attempt ${m.attempt + 1}${m.held ? "" : " (did not hold)"}, ${ms} ms; settled ${row.bands}; the Red Fall ${row.fall}\n  works: ${works}${row.fails ? `\n  failed: ${row.fails}` : ""}\n  ${row.line}`);
  }

console.log("\nseed size | first attempt | s | fall | turn.proved | riverIn.proved | green after the river in | ditchable | small rungs | first attempt refused by");
const head = (f: string) => f.split(":")[0];
for (const r of rows)
  console.log(
    `${String(r.seed).padStart(4)} ${r.side} | ${r.attempt === 0 && r.held ? "yes" : r.held ? `no (${r.attempt + 1})` : "none"} | ${(r.ms / 1000).toFixed(1)} | ${r.fall.startsWith("whole") ? "whole" : "split"} | ${r.turn} | ${r.riverIn} | ${r.green === null ? "-" : (100 * r.green).toFixed(1) + " %"} | ${r.ditchable === null ? "-" : (100 * r.ditchable).toFixed(0) + " %"} | ${r.small} | ${head(r.first)}`,
  );
for (const side of SIZES) {
  const rs = rows.filter((r) => r.side === side);
  const sec = rs.map((r) => r.ms / 1000);
  const by = new Map<string, number>();
  for (const r of rs) if (r.first) by.set(head(r.first), (by.get(head(r.first)) ?? 0) + 1);
  console.log(
    `${side}²: first attempts ${rs.filter((r) => r.attempt === 0 && r.held).length} of ${rs.length}; attempts ${rs.map((r) => r.attempt + 1).join(", ")}; ${Math.min(...sec).toFixed(1)} to ${Math.max(...sec).toFixed(1)} s (mean ${(sec.reduce((a, b) => a + b, 0) / sec.length).toFixed(1)}); green ≥ ${100 * RIVER_IN.green} % on ${rs.filter((r) => (r.green ?? 0) >= RIVER_IN.green).length}; riverIn.proved ${rs.filter((r) => r.riverIn).length}; turn.proved ${rs.filter((r) => r.turn).length}; first attempts refused by ${[...by].map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`,
  );
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
