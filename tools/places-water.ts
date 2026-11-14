// The water a map opens with against the water its sources keep (tools/lib/placeWater.ts), over the Real places and
// over generated maps (planning's order on #236: a place opens with the water its sources keep).
//
//   npx tsx tools/places-water.ts --places [--only a,b] [--part 1/2] --out f.jsonl
//   npx tsx tools/places-water.ts --generated [--part 1/2] --out f.jsonl   (seeds 1–2 of each theme at 128², one 256²)
//   npx tsx tools/places-water.ts --summary f.jsonl [g.jsonl ...]
//
// Each map is opened as the page opens it (a place through core/places/open.ts, a generated map's .timber imported),
// its shown water compared with its file's water model settled with no edit (what the first edit shows), and the
// start's checks run on both waters. One JSON line a map.

import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeTimber } from "../src/core/format/timber";
import { MapSession } from "../src/core/doc/session";
import { generate } from "../src/core/gen/generate";
import { placeSession } from "../src/core/places/open";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { compareWater, settleFile, startFails, type WaterCompare } from "./lib/placeWater";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : null;
};

interface Row extends WaterCompare {
  id: string;
  size: number;
  startOpened: string[];
  startSettled: string[];
  ms: number;
}

function measure(id: string, s: MapSession): Row {
  const t = performance.now();
  const file = s.openedFile();
  const opened = s.waterShown();
  if (!s.showsStoredWater) throw new Error(`${id}: opens without its file's water`);
  const settled = settleFile(file);
  const W = s.size.x;
  const H = s.size.y;
  const c = compareWater(opened.depth, settled.water.depth, W, H);
  return { id, size: W, ...c, startOpened: startFails(file, s.waterNow().model, opened), startSettled: startFails(file, settled.model, settled.water), ms: Math.round(performance.now() - t) };
}

function part<T>(xs: T[]): T[] {
  const p = arg("part");
  if (!p) return xs;
  const [k, n] = p.split("/").map(Number);
  return xs.filter((_, i) => i % n === k - 1);
}

const out = arg("out");
const emit = (r: Row) => {
  const line = JSON.stringify(r);
  if (out) appendFileSync(out, line + "\n");
  console.log(`${r.id} ${r.size}²  wet ${r.wetOpened} → ${r.wetSettled} (${(r.change * 100).toFixed(1)} %)  bodies ${r.bodies}, lost ${r.lost.length}  start ${r.startOpened.join(",") || "-"} → ${r.startSettled.join(",") || "-"}  ${r.ms} ms`);
};

if (arg("places") !== null) {
  const only = arg("only")?.split(",");
  const dir = "public/real-places/data";
  const ids = readdirSync(dir)
    .filter((f) => f.endsWith(".json.gz"))
    .map((f) => f.replace(/\.json\.gz$/, ""))
    .filter((id) => !only || only.includes(id))
    .sort();
  for (const id of part(ids)) emit(measure(id, placeSession(new Uint8Array(readFileSync(join(dir, `${id}.json.gz`))))));
}

if (arg("generated") !== null) {
  const themes: ThemeId[] = ["riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"];
  const maps: { theme: ThemeId; seed: number; side: number }[] = [...themes.flatMap((theme) => [1, 2].map((seed) => ({ theme, seed, side: 128 }))), { theme: "riverValley", seed: 1, side: 256 }];
  for (const m of part(maps)) {
    const r = generate(makeSpec({ seed: m.seed, size: { x: m.side, y: m.side }, theme: m.theme }));
    const id = `${m.theme}-${m.seed}`;
    emit(measure(id, MapSession.importMap(writeTimber(r.file), `${id}.timber`)));
  }
}

const sum = arg("summary");
if (sum !== null) {
  const files = process.argv.slice(process.argv.indexOf("--summary") + 1).filter((f) => !f.startsWith("--"));
  const rows = files.flatMap((f) => readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row));
  const lose = rows.filter((r) => r.change < -0.01);
  const gain = rows.filter((r) => r.change > 0.01);
  const lostBody = rows.filter((r) => r.lost.length);
  const startNew = rows.filter((r) => r.startSettled.some((id) => !r.startOpened.includes(id)));
  const startFixed = rows.filter((r) => r.startOpened.some((id) => !r.startSettled.includes(id)));
  const equal = rows.filter((r) => r.wetOpened === r.wetSettled && !r.lost.length);
  console.log(`${rows.length} maps: ${lose.length} lose more than 1 % of wet tiles, ${gain.length} gain more than 1 %, ${lostBody.length} lose a body of 30+, ${startNew.length} fail a start check on settled water they passed opened (${startFixed.length} the other way), ${equal.length} equal`);
  const worst = [...rows].sort((a, b) => a.change - b.change || b.lost.length - a.lost.length).slice(0, 10);
  for (const r of worst)
    console.log(
      `  ${r.id} ${r.size}²: ${r.wetOpened} → ${r.wetSettled} (${(r.change * 100).toFixed(1)} %), lost ${r.lost.length} of ${r.bodies} bodies${r.lost.length ? ` (${r.lost.map((l) => `${l.size}→${l.wet}`).join(", ")})` : ""}` +
        (r.startSettled.some((id) => !r.startOpened.includes(id)) ? `, start now fails ${r.startSettled.filter((id) => !r.startOpened.includes(id)).join(",")}` : ""),
    );
  for (const r of startNew) console.log(`  start: ${r.id} ${r.startSettled.filter((id) => !r.startOpened.includes(id)).join(",")}`);
}
