// Starting wood (D164) and the woods axis for batch sets made before it existed (version 1 and the
// current generator): read each map's file, count the logs within 20 tiles' walk of its start by
// species (rules.ts), and add `wood` and the `oakShare20` axis bin to its record in place, with the
// edge walls (rules.ts) its settled water shows.
//
//   npx tsx investigation/generative/v2/woodaxis.ts --sets v1-128,cur-128
//   npx tsx investigation/generative/v2/woodaxis.ts --sets v2-128 --rebin   (the bin from the stored share)

/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FOOTPRINTS, worldBlocks } from "../../../src/core/format/footprints";
import { readTimber } from "../../../src/core/format/timber";
import { surfaceOf } from "../../../src/core/format/world";
import { mapObjects } from "../../../src/core/sim/model";
import { arg, MAPS } from "../lib/paths";
import { AXIS_BINS } from "./batch";
import { edgeWalls, startingWood } from "./rules";

const k = AXIS_BINS.findIndex(([key]) => key === "oakShare20");
const cuts = AXIS_BINS[k][1];
const rebin = process.argv.includes("--rebin");
for (const set of arg("sets", "v1-128,cur-128").split(",")) {
  const dir = join(MAPS, set);
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => /^[a-zA-Z]+-\d+\.json$/.test(x))) {
    const path = join(dir, f);
    const rec = JSON.parse(readFileSync(path, "utf8"));
    if (rebin) {
      // the axis bin again from the stored share (after the cuts change)
      const v = rec.axes?.values?.oakShare20 ?? null;
      if (!rec.axes) continue;
      rec.axes.bins[k] = v === null ? null : cuts.filter((c) => v >= c).length;
      rec.axes.joint = rec.axes.bins.map((b: number | null) => (b === null ? "n" : String(b))).join("");
      writeFileSync(path, JSON.stringify(rec));
      n++;
      continue;
    }
    const tp = join(dir, f.replace(/\.json$/, ".timber"));
    if (!rec.passed || !existsSync(tp)) continue;
    const w = readTimber(new Uint8Array(readFileSync(tp))).world;
    const objs = mapObjects(w) as any[];
    const s = objs.find((o) => o.template === "StartingLocation");
    if (!s) continue;
    const cells = worldBlocks(FOOTPRINTS.StartingLocation, s).filter((b) => b.localZ === 0);
    const start = { x: Math.round(cells.reduce((a, b) => a + b.x, 0) / cells.length), y: Math.round(cells.reduce((a, b) => a + b.y, 0) / cells.length) };
    const wood = startingWood(surfaceOf(w), w.sizeX, w.sizeY, objs, start);
    rec.wood = wood;
    const fp = join(dir, f.replace(/\.json$/, ".f32"));
    if (existsSync(fp)) {
      const buf = readFileSync(fp);
      const D = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).subarray(0, w.sizeX * w.sizeY);
      rec.edgeWalls = edgeWalls(surfaceOf(w), D, w.sizeX, w.sizeY).length;
    }
    if (rec.axes) {
      const v = wood.logs ? wood.oakShare : null;
      const bin = v === null ? null : cuts.filter((c) => v >= c).length;
      rec.axes.values.oakShare20 = v;
      rec.axes.bins = rec.axes.bins.slice(0, k).concat([bin]);
      rec.axes.joint = rec.axes.bins.map((b: number | null) => (b === null ? "n" : String(b))).join("");
    }
    writeFileSync(path, JSON.stringify(rec));
    n++;
  }
  console.log(`${set}: ${n} records`);
}
