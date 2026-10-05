// Every setting makes a map (D471): the settings panel's extremes, and the maps players found that
// made none, each a spec the panel allows. everySetting.heavy.test.ts generates each in the nightly
// suite; `npx tsx tests/contract/everySetting.ts <index>` generates one by hand.
import { expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type Difficulty, type MapSpec, type Settings, type ThemeId } from "../../src/core/spec/mapspec";
import { highestMax, reserveGuard } from "../../src/ui/settingsModel";

export interface SettingCase {
  name: string;
  spec: MapSpec;
}

type Shape = (s: Settings) => void;

/** Every setting at its minimum (each choice its first, each count and slider its lowest). */
const allMin: Shape = (s) => {
  Object.assign(s.terrain, { relief: 0, verticality: 0, variety: 0, highestTerrain: 10, terracing: 0, buildableLand: "tight" });
  Object.assign(s.water, { rivers: 0, riverStyle: "straight", riverFlow: "trickle", droughtReserve: "scarce", lakes: "none", waterfalls: "off", sources: "placed" });
  Object.assign(s.hazards, { badwater: "off", badwaterDistance: 8, thornBelts: "off", unstableCores: "off" });
  Object.assign(s.resources, { forestDensity: 50, groveSize: "scattered", speciesMix: { pine: 0, birch: 0, oak: 0, succulent: 0 }, berriesNearStart: 20, berryBushes: 50, ruins: 25, relics: "off", geothermal: "off", mineSites: 2 });
  Object.assign(s.start, { area: "small", rules: { waterWithin: 4, woodWithin20: 0, bushesWithin20: 0, badwaterWithin: 8, ruinsWithin: 0 } });
};

/** Every setting at its maximum. */
const allMax: Shape = (s) => {
  Object.assign(s.terrain, { relief: 100, verticality: 100, variety: 100, highestTerrain: 22, terracing: 100, buildableLand: "generous" });
  Object.assign(s.water, { rivers: 3, riverStyle: "braided", riverFlow: "lush", droughtReserve: "plenty", lakes: "many", waterfalls: "many", sources: "placed" });
  Object.assign(s.hazards, { badwater: "high", badwaterDistance: 60, thornBelts: "some", unstableCores: "on" });
  Object.assign(s.resources, { forestDensity: 200, groveSize: "bigWoods", speciesMix: { pine: 100, birch: 100, oak: 100, succulent: 100 }, berriesNearStart: 100, berryBushes: 300, ruins: 300, relics: "some", geothermal: "some", mineSites: 4 });
  Object.assign(s.start, { area: "large", rules: { waterWithin: 40, woodWithin20: 800, bushesWithin20: 200, badwaterWithin: 60, ruinsWithin: 60 } });
};

/** Wild land under the most water: the land cut apart by its rivers and lakes. */
const wildWet: Shape = (s) => {
  Object.assign(s.terrain, { relief: 100, verticality: 100, variety: 100, highestTerrain: 22, terracing: 100, buildableLand: "tight" });
  Object.assign(s.water, { rivers: 3, riverStyle: "meandering", riverFlow: "lush", droughtReserve: "plenty", lakes: "many", waterfalls: "many" });
};

/** Flat, dry land with the strictest walk to water. */
const flatDry: Shape = (s) => {
  Object.assign(s.terrain, { relief: 0, verticality: 0, variety: 100, terracing: 0, highestTerrain: 10, buildableLand: "generous" });
  Object.assign(s.water, { rivers: 0, riverStyle: "straight", riverFlow: "trickle", droughtReserve: "plenty", lakes: "none", waterfalls: "off" });
  s.start.rules.waterWithin = 4;
};

/** The most asked of the start, from the least the map grows, with badwater and ruins kept far. */
const starvedStart: Shape = (s) => {
  Object.assign(s.resources, { forestDensity: 50, groveSize: "scattered", speciesMix: { pine: 0, birch: 100, oak: 0, succulent: 0 }, berriesNearStart: 100, berryBushes: 50, ruins: 300, mineSites: 4 });
  Object.assign(s.hazards, { badwater: "high", badwaterDistance: 60 });
  Object.assign(s.start, { area: "small", rules: { waterWithin: 4, woodWithin20: 800, bushesWithin20: 200, badwaterWithin: 60, ruinsWithin: 60 } });
};

/** A spec the panel allows: Highest terrain within its slider's reach, and a drought reserve the map
 *  has room for (the panel disables one that doesn't fit). */
function caseOf(name: string, theme: ThemeId, designedFor: Difficulty, size: { x: number; y: number }, seed: number, shape: Shape): SettingCase {
  const spec = makeSpec({ seed, size, theme, designedFor });
  shape(spec.settings);
  const t = spec.settings.terrain;
  t.highestTerrain = Math.min(t.highestTerrain, highestMax(t.verticality));
  const w = spec.settings.water;
  const order = ["plenty", "normal", "scarce"] as const;
  let k = order.indexOf(w.droughtReserve);
  while (k < order.length - 1 && !reserveGuard(designedFor, order[k], size.x, size.y).fits) k++;
  w.droughtReserve = order[k];
  return { name: `${name}, ${theme} ${size.x}×${size.y} ${designedFor} seed ${seed}`, spec };
}

/** Kyler's map, 2026-10-04 ("No valid map after 27 attempts"): Any 256², seed 3399078211, the
 *  terrain sliders at 100, Highest terrain 22, two meandering Lush rivers, Many lakes and falls. */
export function kylersMap(): SettingCase {
  const spec = makeSpec({ seed: 3399078211, size: { x: 256, y: 256 }, theme: "any", designedFor: "normal" });
  Object.assign(spec.settings.terrain, { relief: 100, verticality: 100, variety: 100, highestTerrain: 22, terracing: 100, buildableLand: "normal" });
  Object.assign(spec.settings.water, { rivers: 2, riverStyle: "meandering", riverFlow: "lush", droughtReserve: "normal", lakes: "many", waterfalls: "many", sources: "placed" });
  spec.settings.resources.mineSites = 3;
  return { name: "Kyler's map, any 256×256 normal seed 3399078211", spec };
}

const THEMES: ThemeId[] = ["any", "lakeBasin", "islands", "canyon", "highlands", "delta", "riverValley"];

/** The sweep: at each size the panel offers (its four presets and the smallest custom size), every
 *  setting at its minimum and at its maximum, and the pairs most likely to fight (wild land under
 *  the most water, flat dry land with the strictest walk to water, the most asked of a start that
 *  grows the least), on themes in turn; the stacked combinations that once made no map on three
 *  more seeds each; a long thin custom map at both extremes; and Kyler's map. */
export function settingCases(): SettingCase[] {
  const out: SettingCase[] = [kylersMap()];
  const sizes = [48, 96, 128, 192, 256];
  sizes.forEach((n, k) => {
    const size = { x: n, y: n };
    const seed = 101 + k;
    out.push(caseOf("all minimums", "any", "hard", size, seed, allMin));
    out.push(caseOf("all maximums", "any", "easy", size, seed, allMax));
    out.push(caseOf("wild land, most water", THEMES[k % THEMES.length], "normal", size, seed, wildWet));
    out.push(caseOf("flat, dry, water at 4", THEMES[(k + 2) % THEMES.length], "easy", size, seed, flatDry));
    out.push(caseOf("starved start", THEMES[(k + 4) % THEMES.length], "hard", size, seed, starvedStart));
  });
  // (the stacked combinations that once made no map, on more seeds each, so a lucky seed hides no gap)
  for (const seed of [1, 2, 3]) {
    out.push(caseOf("all maximums", "any", "easy", { x: 48, y: 48 }, seed, allMax));
    out.push(caseOf("starved start", "highlands", "hard", { x: 48, y: 48 }, seed, starvedStart));
    out.push(caseOf("starved start", "delta", "hard", { x: 96, y: 96 }, seed, starvedStart));
  }
  out.push(caseOf("all minimums", "any", "hard", { x: 256, y: 48 }, 111, allMin));
  out.push(caseOf("all maximums", "any", "easy", { x: 48, y: 256 }, 112, allMax));
  return out;
}

/** The case as a test: its map passes every check that isn't advisory. */
export function settingTest(c: SettingCase): void {
  it(c.name, () => {
    const r = generate(c.spec);
    const failed = r.report.checks.filter((x) => !x.ok && !x.advisory).map((x) => `${x.id}: ${x.message}`);
    expect(r.report.passed, `${c.name}: no map after ${r.attempts} attempts (${failed.join("; ")})`).toBe(true);
  });
}

// (by hand: npx tsx tests/contract/everySetting.ts <index>|list)
if (typeof process !== "undefined" && process.argv[1]?.replace(/\\/g, "/").endsWith("tests/contract/everySetting.ts")) {
  const cases = settingCases();
  const arg = process.argv[2] ?? "list";
  if (arg === "list") cases.forEach((c, i) => console.log(i, c.name));
  else {
    const c = cases[Number(arg)];
    const t0 = performance.now();
    const r = generate(c.spec);
    const failed = r.report.checks.filter((x) => !x.ok && !x.advisory).map((x) => `${x.id}: ${x.message}`);
    console.log(`${arg} ${c.name}: ${r.report.passed ? "map" : "NO MAP"} in ${r.attempts} attempts, ${Math.round(performance.now() - t0)} ms`);
    if (!r.report.passed) {
      console.log(r.failures.map((f) => `${f.attempt}: ${f.failed.join(", ")}`).join("\n"));
      console.log(failed.join("\n"));
    }
  }
}
