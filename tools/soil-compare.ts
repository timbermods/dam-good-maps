// D298's report: generate each map with the old soil model (sim/moisture.ts, via soil3d's port mode)
// and with the game's own rules, and count the plants that move or change, and the times.
//
//   npx tsx tools/soil-compare.ts --themes any,riverValley --seeds 1-4 --size 128

import { generate } from "../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { gameSoil, SOIL_MODE } from "../src/core/sim/soil";
import { toMapObject } from "../src/core/features/build";
import { isDead } from "../src/core/analysis/wood";
import type { JsonObject } from "../src/core/format/json";

const arg = (n: string, f: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : f; };
const themes = arg("themes", "any,riverValley,canyon,highlands,lakeBasin,delta,islands").split(",") as ThemeId[];
const [a, b] = arg("seeds", "1-4").split("-").map(Number);
const size = Number(arg("size", "128"));
const PLANT = /Pine|Birch|Oak|Maple|Chestnut|Mangrove|Blueberry|Dandelion|Cattail|Spadderdock|Coffee|Kohlrabi|Carrot|Potato|Wheat|Sunflower|Canola|Grape|Soybean|Corn|Eggplant|Algae|Mushroom|Cassava/;
const key = (e: { template: string; x: number; y: number }) => `${e.template}@${e.x},${e.y}`;
console.log("theme seed | plants old/new | moved | same place, changed | attempts old/new | ms old/new");
const tot: Record<string, { plants: number; moved: number; changed: number; maps: number; sameAttempt: number; msOld: number; msNew: number; dies: number }> = {};
for (const theme of themes)
  for (let seed = a; seed <= (b ?? a); seed++) {
    const spec = makeSpec({ seed, theme, size: { x: size, y: size } });
    SOIL_MODE.mode = "port";
    let t0 = performance.now();
    const r0 = generate(spec);
    const ms0 = performance.now() - t0;
    SOIL_MODE.mode = "game";
    t0 = performance.now();
    const r1 = generate(spec);
    const ms1 = performance.now() - t0;
    const plants = (r: typeof r0) => new Map(r.built.entities.filter((e) => PLANT.test(e.template)).map((e) => [key(e), JSON.stringify(e.components ?? {})]));
    const p0 = plants(r0);
    const p1 = plants(r1);
    let moved = 0;
    let changed = 0;
    for (const [k, v] of p1) {
      if (!p0.has(k)) moved++;
      else if (p0.get(k) !== v) changed++;
    }
    // living plants the old model put on ground the game's rules leave dry (they would die)
    SOIL_MODE.mode = "game";
    const b0 = r0.built;
    const g0 = gameSoil(b0.W, b0.H, b0.heights, b0.water, b0.contamination, b0.entities.map(toMapObject), b0.settle.sat);
    let dies = 0;
    for (const e of b0.entities) {
      if (!PLANT.test(e.template) || e.x < 0 || e.y < 0 || e.x >= b0.W || e.y >= b0.H) continue;
      const i = e.y * b0.W + e.x;
      const dead = isDead({ ...(e.before ?? {}), ...(e.components ?? {}) } as JsonObject);
      if (!dead && b0.moisture[i] > 0 && !(g0.moisture[i] > 0)) dies++;
    }
    const t = (tot[theme] ??= { plants: 0, moved: 0, changed: 0, maps: 0, sameAttempt: 0, msOld: 0, msNew: 0, dies: 0 } as { plants: number; moved: number; changed: number; maps: number; sameAttempt: number; msOld: number; msNew: number; dies: number });
    t.dies += dies;
    t.plants += p1.size;
    t.moved += moved;
    t.changed += changed;
    t.maps++;
    t.sameAttempt += r0.attempts === r1.attempts ? 1 : 0;
    t.msOld += ms0;
    t.msNew += ms1;
    console.log(`${theme} ${seed} | ${p0.size}/${p1.size} | ${moved} | ${changed} | ${r0.attempts}/${r1.attempts} | ${Math.round(ms0)}/${Math.round(ms1)} | old plants the game dries: ${dies}`);
  }
console.log("\ntheme | maps | plants (new) | moved | changed | same attempt | mean ms old/new | old plants the game dries");
for (const [theme, t] of Object.entries(tot)) console.log(`${theme} | ${t.maps} | ${t.plants} | ${t.moved} (${((100 * t.moved) / Math.max(1, t.plants)).toFixed(1)}%) | ${t.changed} | ${t.sameAttempt}/${t.maps} | ${Math.round(t.msOld / t.maps)}/${Math.round(t.msNew / t.maps)} | ${t.dies}`);
