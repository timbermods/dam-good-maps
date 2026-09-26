// Relief and verticality of the official and workshop maps (vertical.ts), the yardstick for design
// version 2's task a. Per-map numbers stay local (<ROOT>\v2\refs.json); only the aggregates reach
// measures-v2.json. Vertical reach needs a start: maps whose start can be measured (one start on
// the top surface, water our steady state can show), as the workshop study counts them.
//
//   npx tsx investigation/generative/v2/refs.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { surfaceOf } from "../../../src/core/format/world";
import { mapObjects } from "../../../src/core/sim/model";
import { listMaps } from "../../workshop/lib/paths";
import { loadMap } from "../../workshop/lib/load";
import { readSettled } from "../../workshop/lib/settled";
import { startCentre } from "../../workshop/lib/measures";
import { lowPriority, ROOT, WORKSHOP } from "../lib/paths";
import { vertical, type Vertical } from "./vertical";

export const V2_ROOT = join(ROOT, "v2");

export function refsPath(): string {
  return join(V2_ROOT, "refs.json");
}

export function readRefs(): Record<string, { source: string; startMeasurable: boolean; v: Vertical }> {
  return existsSync(refsPath()) ? JSON.parse(readFileSync(refsPath(), "utf8")) : {};
}

if (process.argv[1] && /refs\.ts$/.test(process.argv[1])) {
  lowPriority();
  mkdirSync(V2_ROOT, { recursive: true });
  const out: Record<string, unknown> = readRefs();
  for (const ref of listMaps()) {
    if (out[ref.key] && !process.argv.includes("--force")) continue;
    const recPath = join(WORKSHOP, "measured", `${ref.key}.json`);
    if (!existsSync(recPath)) continue;
    const rec = JSON.parse(readFileSync(recPath, "utf8"));
    const l = loadMap(ref);
    if (!l.file) continue;
    const w = l.file.world;
    const W = w.sizeX;
    const H = w.sizeY;
    const s = readSettled(ref.key, W * H);
    if (!s) continue;
    const h = surfaceOf(w);
    const objects = mapObjects(w);
    const special: string[] = rec.mechanics?.special ?? [];
    const reliable = !special.some((x: string) => x !== "caves: water under roofs" && x !== "unstable cores") && (rec.terrain?.caveShare ?? 0) < 0.05;
    const st = objects.find((o) => o.template === "StartingLocation");
    const measurable = reliable && !!st && rec.starts === 1 && rec.checks?.["start.dry"]?.ok !== false && !special.includes("start below the top surface");
    const start = measurable && st ? startCentre(st) : null;
    const v = vertical(h, W, H, s.depth, objects, start);
    out[ref.key] = { source: ref.source, startMeasurable: !!start, v };
    console.log(ref.key, JSON.stringify(v));
  }
  writeFileSync(refsPath(), JSON.stringify(out));
}
