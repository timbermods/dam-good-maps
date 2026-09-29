// Reproduce small reference measurements; historical source copies stay in ignored local/.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fromJson } from "../core/map";
import { Terrain } from "../core/terrain";
import { CASES } from "../demo/cases";
import { WALL_CALIBRATION } from "../demo/calibration";

const revisions = { round7: "9ed213b7ce515efe4b25819f35a53a066980fce5", round8: "d335c50196475ab5ce7c9be0b09cce33d701cf87" };
const references = {} as Record<string, unknown>;
for (const [round, ref] of Object.entries(revisions)) {
  const dir = new URL(`../local/round9-${round}/core/`, import.meta.url); mkdirSync(dir, { recursive: true });
  for (const file of ["erode", "roof", "wash", "washRuns", "terrain", "support", "random", ...(round === "round8" ? ["sweep"] : [])])
    writeFileSync(new URL(`${file}.ts`, dir), execFileSync("git", ["show", `${ref}:investigation/erode/core/${file}.ts`]));
  const { planErode } = await import(new URL("erode.ts", dir).href);
  references[round] = { ref, cases: [...CASES.slice(0, 4), ...[30, 60, 90].map(power => ({ ...WALL_CALIBRATION, power }))].map(c => {
    const m = fromJson(JSON.parse(gunzipSync(readFileSync(new URL(`../maps/${c.map}.json.gz`, import.meta.url))).toString()));
    const terrain = Terrain.fromHeights(m.W, m.H, m.heights);
    const p = planErode({ terrain, rock: m.rock, keep: m.keep, water: m.water }, { points: c.points }, c);
    return { case: c.id, power: c.power, size: c.size, worn: p.worn, held: p.held,
      sha256: createHash("sha256").update(new Uint8Array(p.final.cols.buffer)).digest("hex") };
  }) };
}
writeFileSync(new URL("../checks/round9-baseline.json", import.meta.url), JSON.stringify(references, null, 1) + "\n");
console.log(JSON.stringify(references));
