// One generated map: the start's numbers first, then the land's (lm.ts). Prints one JSON line.
//   npx tsx .scratch/gm.ts <theme> <seed> <size> [normal|easy] [--timber out.timber]
import { writeFileSync } from "node:fs";
import { generate } from "../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { surfaceOf } from "../src/core/format/world";
import { mapObjects } from "../src/core/sim/model";
import { easyStartMeasures, easyTargets, startOfObjects } from "../src/core/analysis/easyStart";
import { validateMap } from "../src/core/validate/checks";
import { tilesInFrame } from "../src/core/analysis/opening";
import { landMeasures } from "./lm";

const [theme, seed, size, diff] = process.argv.slice(2);
const ti = process.argv.indexOf("--timber");
const spec = makeSpec({ seed: Number(seed), theme: theme as ThemeId, size: { x: Number(size), y: Number(size) }, designedFor: (diff ?? "normal") as never });
const t0 = process.cpuUsage();
const r = generate(spec);
const c = process.cpuUsage(t0);
const W = spec.size.x, H = spec.size.y;
const heights = surfaceOf(r.file.world);
const objects = mapObjects(r.file.world);
const st = startOfObjects(objects, heights, W);
const v = validateMap(r.file, { profile: "generate", spec: r.spec, features: r.features, water: { model: r.built.waterModel, settled: r.built.settle } });
const rows = easyStartMeasures({ W, H, heights, objects, water: r.built.settle, model: r.built.waterModel, moisture: v.analysis!.moisture, soilContamination: v.analysis!.soilContamination, woodNear: v.analysis!.woodNear }, easyTargets(W, H));
const missed = rows.filter((m) => !m.ok).map((m) => m.id.replace("start.easy_", ""));
const room = rows.find((m) => m.id === "start.easy_room")?.value;
const reach = r.report.checks.find((x) => x.id === "start.reach")?.value;
const D = r.built.settle.depth, C = r.built.settle.contamination;
const bad: number[] = [];
for (let i = 0; i < W * H; i++) if (D[i] >= 0.1 && C[i] > 0.05) bad.push(i);
const badView = st ? tilesInFrame({ x: st.x, y: st.y, z: st.level, orientation: st.orientation }, W, heights, bad) : -1;
const Mo = v.analysis!.moisture;
let landN = 0, moistN = 0;
for (let i = 0; i < W * H; i++) { if (D[i] >= 0.1) continue; landN++; if (Mo[i] > 0) moistN++; }
const moist = +((100 * moistN) / landN).toFixed(1);
const failedChecks = r.report.checks.filter((x) => !x.ok && x.severity === "error").map((x) => x.id);
if (ti > 0) writeFileSync(process.argv[ti + 1], r.bytes);
console.log(JSON.stringify({
  map: `${theme} ${size} s${seed} ${diff ?? "normal"}`,
  passed: r.report.passed, failedChecks, attempts: r.attempts, cpu: +((c.user + c.system) / 1e6).toFixed(1),
  room, reach, missed, badView, moist, start: st && [st.x, st.y, st.level], fixes: r.info.fixes ?? [],
  failures: r.failures.map((f) => f.failed.join("+")),
  land: landMeasures(heights, D, W, H),
}));
