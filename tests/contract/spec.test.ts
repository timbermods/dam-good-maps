// Contract (PLAN §15): the MapSpec schema accepts every preset and rejects out-of-bound values; the
// eval-free checker the app uses agrees with Ajv on the same schema.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { decodeSpecFragment, encodeSpecFragment, makeSpec, seedFromText, THEMES, type MapSpec } from "../../src/core/spec/mapspec";
import { MAPSPEC_SCHEMA, validateSpec } from "../../src/core/spec/schema";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const ajvValidate = ajv.compile(MAPSPEC_SCHEMA);

function both(spec: unknown): [boolean, boolean] {
  return [validateSpec(spec).length === 0, ajvValidate(spec) as boolean];
}

describe("MapSpec schema", () => {
  it("accepts every theme preset at every difficulty and size preset", () => {
    for (const theme of THEMES)
      for (const d of ["easy", "normal", "hard"] as const)
        for (const s of [48, 96, 128, 192, 256]) {
          const spec = makeSpec({ seed: 123, theme, designedFor: d, size: { x: s, y: s === 48 ? 256 : s } });
          expect(both(spec), `${theme} ${d} ${s}`).toEqual([true, true]);
        }
  });

  const bad: [string, (s: MapSpec) => void][] = [
    ["negative seed", (s) => (s.seed = -1)],
    ["seed above uint32", (s) => (s.seed = 2 ** 32)],
    ["size above 256", (s) => (s.size.x = 300)],
    ["size below 48", (s) => (s.size.y = 40)],
    ["relief above 100", (s) => (s.settings.terrain.relief = 101)],
    ["terrain above 16", (s) => (s.settings.terrain.highestTerrain = 17)],
    ["unknown theme", (s) => ((s as { theme: string }).theme = "volcano")],
    ["unknown property", (s) => ((s as unknown as Record<string, unknown>).extra = 1)],
    ["two colonies without the mod", (s) => (s.colonies = { count: 2, mod: "none" })],
    ["five colonies", (s) => ((s.colonies as { count: number }).count = 5)],
    ["missing settings", (s) => delete (s as Partial<MapSpec>).settings],
  ];
  it.each(bad)("rejects %s", (_, mutate) => {
    const spec = makeSpec({ seed: 1 });
    mutate(spec);
    expect(both(spec)).toEqual([false, false]);
  });

  it("allows the reserved Timber Together shape (D5)", () => {
    const spec = makeSpec({ seed: 1 });
    spec.colonies = { count: 2, mod: "timberTogether" };
    expect(both(spec)).toEqual([true, true]);
  });
});

describe("URL codec (PLAN §14.5)", () => {
  it("round-trips seed, theme, size and difficulty", () => {
    const spec = makeSpec({ seed: 4242, size: { x: 96, y: 96 }, designedFor: "hard" });
    const back = decodeSpecFragment("#" + encodeSpecFragment(spec))!;
    expect(back.problems).toEqual([]);
    expect(back.spec).toEqual(spec);
    const wide = makeSpec({ seed: 7, size: { x: 256, y: 150 } });
    expect(decodeSpecFragment(encodeSpecFragment(wide))!.spec.size).toEqual({ x: 256, y: 150 });
  });

  it("writes only the settings that differ from the theme preset", () => {
    for (const theme of ["riverValley", "canyon", "lakeBasin"] as const) {
      const spec = makeSpec({ seed: 7, theme, designedFor: "easy" });
      expect(encodeSpecFragment(spec)).toBe(`v=${spec.generatorVersion}&s=7&t=${theme}&z=128&d=e`);
    }
    const spec = makeSpec({ seed: 7 });
    spec.settings.terrain.relief = 70;
    spec.settings.water.riverFlow = "strong";
    spec.settings.resources.speciesMix = { pine: 10, birch: 20, oak: 30, succulent: 40 };
    expect(encodeSpecFragment(spec)).toBe(`v=${spec.generatorVersion}&s=7&t=riverValley&z=128&d=n&rl=70&fl=s&sm=ChQeKA`);
  });

  it("round-trips every setting, and the rest of the spec (PLAN §19.1)", () => {
    const rng = (() => {
      let x = 12345;
      return () => {
        x = (Math.imul(x, 1103515245) + 12345) >>> 0;
        return x / 4294967296;
      };
    })();
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
    const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
    for (let k = 0; k < 200; k++) {
      const spec = makeSpec({ seed: int(0, 4294967295), theme: pick(THEMES), designedFor: pick(["easy", "normal", "hard"] as const), size: { x: int(48, 256), y: int(48, 256) } });
      const st = spec.settings;
      st.terrain = { relief: int(0, 100), highestTerrain: int(10, 16), terracing: int(0, 100), buildableLand: pick(["tight", "normal", "generous"] as const) };
      st.water = {
        rivers: int(0, 3),
        riverStyle: pick(["straight", "meandering", "braided"] as const),
        riverFlow: pick(["trickle", "normal", "strong", "lush"] as const),
        droughtReserve: pick(["scarce", "normal", "plenty"] as const),
        lakes: pick(["none", "few", "some", "many"] as const),
        waterfalls: pick(["off", "few", "many"] as const),
      };
      st.hazards = { badwater: pick(["off", "low", "normal", "high"] as const), badwaterDistance: int(12, 60), thornBelts: pick(["off", "some"] as const), unstableCores: pick(["off", "on"] as const) };
      st.resources = {
        forestDensity: int(50, 200),
        groveSize: pick(["scattered", "normal", "bigWoods"] as const),
        speciesMix: { pine: int(0, 100), birch: int(0, 100), oak: int(0, 100), succulent: int(0, 100) },
        berriesNearStart: int(20, 100),
        berryBushes: int(50, 300),
        ruins: int(25, 300),
        relics: pick(["off", "some"] as const),
        geothermal: pick(["off", "some"] as const),
        mineSites: int(1, 4), // every map has at least one (Kyler, 2026-09-25; D148)
      };
      st.start = {
        area: pick(["small", "normal", "large"] as const),
        rules: { waterWithin: int(4, 40), woodWithin20: int(0, 800), bushesWithin20: int(0, 200), badwaterWithin: int(12, 60), ruinsWithin: int(0, 60) },
      };
      if (rng() < 0.3) spec.archetype = pick(THEMES);
      if (rng() < 0.2) spec.premise = "gorge-dammed basin";
      if (rng() < 0.2) spec.colonies = { count: pick([2, 3, 4] as const), mod: "timberTogether" };
      if (rng() < 0.2) spec.setPieces = [{ kind: "waterfall", params: { mode: "standalone", lip: [40, 90], facing: "north", width: 20, drop: 6 } }];
      if (rng() < 0.2) spec.constraints = { locks: [{ runs: [[3, 4, 9]] }], keepOut: [], keep: ["f-abc"] };
      expect(both(spec), JSON.stringify(spec)).toEqual([true, true]);
      const back = decodeSpecFragment("#" + encodeSpecFragment(spec))!;
      expect(back.problems).toEqual([]);
      expect(back.spec).toEqual(spec);
    }
  });

  it("keeps the preset's value for anything it cannot use, and says so", () => {
    const d = decodeSpecFragment("#v=0.4.0&s=5&t=canyon&z=96&d=h&rl=500&fl=x&zz=1&sm=!!&c=9t")!;
    expect(d.spec).toEqual(makeSpec({ seed: 5, theme: "canyon", size: { x: 96, y: 96 }, designedFor: "hard" }));
    expect(d.problems.length).toBe(5);
    expect(decodeSpecFragment("#t=canyon")).toBeNull();
  });

  it("reads a link's starting trees from before D164 as wood, 2 logs a tree; the wood key wins", () => {
    const old = decodeSpecFragment("#v=0.6.0&s=5&t=canyon&z=96&d=n&st=25")!;
    expect(old.problems).toEqual([]);
    expect(old.spec.settings.start.rules.woodWithin20).toBe(50);
    expect(encodeSpecFragment(old.spec)).toContain("&sl=50");
    expect(encodeSpecFragment(old.spec)).not.toContain("st=");
    expect(decodeSpecFragment("#s=5&t=canyon&st=25&sl=90")!.spec.settings.start.rules.woodWithin20).toBe(90);
    // a value that is not a count keeps the preset, and says so
    const bad = decodeSpecFragment("#s=5&t=canyon&st=x")!;
    expect(bad.spec.settings.start.rules.woodWithin20).toBe(80);
    expect(bad.problems.length).toBe(1);
  });

  it("hashes text seeds", () => {
    expect(seedFromText("4242")).toBe(4242);
    expect(seedFromText("beaver")).toBe(seedFromText(" beaver "));
    expect(seedFromText("beaver")).not.toBe(seedFromText("otter"));
  });
});
