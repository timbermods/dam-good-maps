// The poisoned floodplain's works over seeds (docs/design/poisoned-floodplain.md §7 "proof", §9 row 4, §10): each
// seed's map at each size (`plainMap.ts`), the start's numbers first, its bands, the Red Fall's curtain (the shared fall
// judge), each rung's site and what it buys by number (`plainWorks.ts`), the works checks it fails, and the two proofs
// (`plainProof.ts`): the turn and then the river in built on its settled session, the floor's green after them. One
// line a map, then the table: first-attempt passes and the green after the river in.
//
//   npx tsx tools/plain-works.ts [--seeds 1-12] [--sizes 128,192,256] [--json out.json]

import { writeFileSync } from "node:fs";
import { plainMap } from "../src/core/premise/plainMap";
import { plainProof, RIVER_IN_GREEN } from "../src/core/premise/plainProof";
import { plainMeasure } from "../src/core/premise/plainWorks";
import { PLAIN_IDS } from "../src/core/premise/premises/poisonedPlain";
import { makeSpec } from "../src/core/spec/mapspec";
import { curtains } from "../tests/contract/fallCurtain";
import { VEIL_SHORT } from "../src/core/premise/gateMap";
import type { PlainMap } from "../src/core/premise/plainMap";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const range = (t: string) => t.split(",").flatMap((x) => (x.includes("-") ? Array.from({ length: Number(x.split("-")[1]) - Number(x.split("-")[0]) + 1 }, (_, k) => Number(x.split("-")[0]) + k) : [Number(x)]));
const SEEDS = range(arg("seeds", "1-12"));
const SIZES = range(arg("sizes", "128,192,256"));
const JSON_OUT = arg("json", "");

/** The Red Fall's curtain as the settled water stands (as `premisePlainWater.heavy.test.ts` judges it). */
export function fallCurtain(m: PlainMap): { ok: boolean; note: string } {
  const { plan, water } = m.land;
  const r = water.raster;
  const b = m.map.built;
  const N = plan.W * plan.H;
  const k = plan.links.findIndex((l) => l.id === PLAIN_IDS.redFall);
  const fall = plan.links[k];
  const near = new Uint8Array(N);
  for (const i of r.lips[fall.id] ?? []) {
    const x = i % plan.W;
    const y = (i - x) / plan.W;
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < plan.W && yy < plan.H) near[yy * plan.W + xx] = 1;
      }
  }
  for (let i = 0; i < N; i++) if (r.crest[i] && r.crest[i] !== k + 1) near[i] = 0;
  const depth = Float64Array.from(b.water, (d, i) => (near[i] ? d : 0));
  const ground = Float64Array.from(b.heights, (h, i) => (near[i] ? h : 99));
  const c = curtains({ W: plan.W, H: plan.H, before: ground, beforeDepth: new Float64Array(N), after: ground, depth, need: fall.fall!.height - VEIL_SHORT });
  return { ok: c.ok, note: c.note };
}

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
      rows.push({ seed, side, held: false, attempt: -1, start: "", bands: "", fall: "", works: "", fails: m.reason, turn: null, riverIn: null, green: null, line: "" });
      continue;
    }
    const ms = Math.round(performance.now() - t0);
    const st = Object.entries(m.start).map(([k, v]) => `${k.slice(6)} ${v.value}/${v.limit}${v.ok ? "" : "!"}`).join(", ");
    const s = m.settled.bands;
    const pc = (v: number) => `${Math.round(100 * v)} %`;
    const fall = fallCurtain(m);
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
      line: pf
        ? `turn: red on the floor ${pf.turn.red}, lip ${pf.turn.lip}, fork ${pf.turn.fork}, leaks ${pf.turn.leaks}, dead ${pc(pf.before.bands.dead)}→${pc(pf.turn.bands.dead)}; river in: green ${pc(pf.before.bands.green)}→${pc(pf.turn.bands.green)}→${pc(pf.riverIn.bands.green)} (dry ${pc(pf.riverIn.bands.dry)}, dead ${pc(pf.riverIn.bands.dead)}), plain sheet ${pf.riverIn.plain}, start ${pf.riverIn.start}; ${pf.ms} ms`
        : "",
    };
    rows.push(row);
    console.log(`seed ${seed} at ${side}²: start ${st}\n  attempt ${m.attempt + 1}${m.held ? "" : " (did not hold)"}, ${ms} ms; settled ${row.bands}; the Red Fall ${row.fall}\n  works: ${works}${row.fails ? `\n  failed: ${row.fails}` : ""}\n  ${row.line}`);
  }

console.log("\nseed size | first attempt | fall | turn.proved | riverIn.proved | green after the river in");
for (const r of rows) console.log(`${String(r.seed).padStart(4)} ${r.side} | ${r.attempt === 0 && r.held ? "yes" : r.held ? `no (${r.attempt + 1})` : "none"} | ${r.fall.startsWith("whole") ? "whole" : "split"} | ${r.turn} | ${r.riverIn} | ${r.green === null ? "-" : (100 * r.green).toFixed(1) + " %"}`);
const greens = rows.filter((r) => r.green !== null).map((r) => r.green!);
console.log(`green ≥ ${100 * RIVER_IN_GREEN} % on ${greens.filter((g) => g >= RIVER_IN_GREEN).length} of ${greens.length}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
