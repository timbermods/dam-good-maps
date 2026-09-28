// Badwater on every map (Kyler, 2026-09-26, PLAN §20 D200): at least one permanent badwater source on
// every map, as many and as strong as the official maps' for the size, in hollows and side valleys
// beyond the difficulty's badwater distance; a check in both validators; and the player's explicit
// No badwater for a peaceful map, which places none and which the check accepts.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { deleteEdit, LAST_BADWATER_NOTE } from "../../src/core/doc/tools";
import { startingLocation, waterSource } from "../../src/core/format/entities";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { OFFICIAL_BADWATER } from "../../src/core/gen/calibrated";
import { generate } from "../../src/core/gen/generate";
import { toTimberFile } from "../../src/core/gen/pack";
import { asksForBadwater, badwaterBudget, NO_BADWATER_NOTE, pickBadwaterSprings, SPRING_MARGIN } from "../../src/core/resources/badwater";
import { lownessAt } from "../../src/core/resources/measure";
import { planMapResources } from "../../src/core/resources/plan";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { mapObjects, waterModel } from "../../src/core/sim/model";
import { decodeSpecFragment, defaultSettings, encodeSpecFragment, makeSpec, THEMES, type MapSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { blocks } from "../../src/core/validate/report";

const official = JSON.parse(readFileSync("investigation/official-baselines.json", "utf8"));

/** Python with numpy for prototype/validate.py (CI installs it; a machine without it skips). */
function python(): string | null {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
}
const PY = python();

/** A map's spec with its Badwater setting changed. */
function withBadwater(spec: MapSpec, badwater: MapSpec["settings"]["hazards"]["badwater"]): MapSpec {
  return { ...spec, settings: { ...spec.settings, hazards: { ...spec.settings.hazards, badwater } } };
}

/** A plateau at level 6 with the start in the west and a side valley at level 3 running from the
 *  middle to the east edge, which its water leaves by. */
function valleyGround(W = 96, H = 96) {
  const N = W * H;
  const heights = new Uint8Array(N).fill(6);
  for (let y = 44; y <= 52; y++) for (let x = 50; x < W; x++) heights[y * W + x] = 3;
  const start = { x: 16, y: 48 };
  const startEntity = startingLocation({ id: "s", owner: "t", x: start.x - 1, y: start.y - 1, z: 6, orientation: "Cw0" });
  const settle = canonicalSettle(waterModel(W, H, heights, mapObjects({ entities: [] })));
  return { W, H, N, heights, start, startEntity, settle };
}

describe("badwater on every map (D200)", () => {
  it("the calibration is the official maps' measure, and every official map has a lasting badwater supply", () => {
    const r = official.rates;
    expect([...OFFICIAL_BADWATER.sources]).toEqual(r.badwater_sources_per_map.medians);
    expect([...OFFICIAL_BADWATER.strength]).toEqual(r.badwater_strength_per_map.medians);
    expect([...OFFICIAL_BADWATER.sourcesSpread]).toEqual([r.badwater_sources_per_map.factors.p25, r.badwater_sources_per_map.factors.p75]);
    expect([...OFFICIAL_BADWATER.strengthSpread]).toEqual([r.badwater_strength_per_map.factors.p25, r.badwater_strength_per_map.factors.p75]);
    // 18 of the 19 have a BadwaterSource; Spillage has badwater seeps instead
    expect(official.badwater.everyMap.withSource).toBe(18);
    expect(Object.keys(official.badwater.everyMap.withoutSource)).toEqual(["Spillage"]);
    expect(official.badwater.strength.p50).toBe(1.5);
  });

  it("the budget: none with No badwater, at least one otherwise, more on larger maps, each 1–3 strong", () => {
    for (const side of [48, 96, 128, 192, 256]) {
      expect(badwaterBudget(side, side, "off", 1).sources).toBe(0);
      for (const setting of ["low", "normal", "high"] as const)
        for (let seed = 1; seed <= 20; seed++) {
          const b = badwaterBudget(side, side, setting, seed);
          expect(b.sources, `${side} ${setting} ${seed}`).toBeGreaterThanOrEqual(1);
          expect(b.strength).toBeGreaterThanOrEqual(1);
          expect(b.strength).toBeLessThanOrEqual(3);
          expect(badwaterBudget(side, side, setting, seed)).toEqual(b);
        }
    }
    const at = (side: number) => badwaterBudget(side, side, "normal", 7).sources;
    expect(at(256)).toBeGreaterThan(at(96));
    // the setting moves them: High more than Normal, Low fewer
    const sum = (s: "low" | "normal" | "high") => Array.from({ length: 20 }, (_, k) => badwaterBudget(192, 192, s, k + 1)).reduce((a, b) => a + b.sources * b.strength, 0);
    expect(sum("high")).toBeGreaterThan(sum("normal"));
    expect(sum("normal")).toBeGreaterThan(sum("low"));
    // the seed moves them within the official typical range
    expect(new Set(Array.from({ length: 30 }, (_, k) => JSON.stringify(badwaterBudget(192, 192, "normal", k + 1)))).size).toBeGreaterThan(1);
  });

  it("every generated map has a badwater source, beyond the badwater distance, and passes the check", () => {
    for (const theme of THEMES) {
      const r = generate(makeSpec({ seed: 21, theme, size: { x: 96, y: 96 } }));
      expect(r.report.passed, theme).toBe(true);
      const bad = r.built.entities.filter((e) => e.template === "BadwaterSource");
      expect(bad.length, theme).toBeGreaterThanOrEqual(1);
      expect(r.report.checks.find((c) => c.id === "resources.badwater_source")!.ok, theme).toBe(true);
      expect(r.report.checks.find((c) => c.id === "start.badwater")!.ok, theme).toBe(true);
    }
  });

  it("No badwater places none, says so in the map's description and share link, and passes the check", () => {
    const spec = withBadwater(makeSpec({ seed: 22, size: { x: 96, y: 96 } }), "off");
    const r = generate(spec);
    expect(r.report.passed).toBe(true);
    expect(r.built.entities.filter((e) => e.template === "BadwaterSource")).toEqual([]);
    const c = r.report.checks.find((x) => x.id === "resources.badwater_source")!;
    expect(c.ok).toBe(true);
    expect(c.message).toMatch(/No badwater/);
    expect(String(r.file.metadata?.MapDescription)).toContain(NO_BADWATER_NOTE);
    // the share link carries it (bw=0), and opens as No badwater
    const link = encodeSpecFragment(spec);
    expect(link).toMatch(/(^|&)bw=0(&|$)/);
    expect(decodeSpecFragment(link)!.spec.settings.hazards.badwater).toBe("off");
    // without its settings, the file's description tells the validators
    const v = validateMap(r.file, { profile: "import", designedFor: "normal" });
    expect(v.report.checks.find((x) => x.id === "resources.badwater_source")!.ok).toBe(true);
    expect(asksForBadwater(null, String(r.file.metadata?.MapDescription))).toBe(false);
    expect(asksForBadwater(null, "A river crosses the valley.")).toBe(true);
    expect(asksForBadwater("low")).toBe(true);
  });

  it("an old link or project whose setting asked for badwater opens asking for it; one set to 0 opens as No badwater", () => {
    expect(decodeSpecFragment("v=0.6.2&s=5&t=canyon&z=128&d=n&bw=0")!.spec.settings.hazards.badwater).toBe("off");
    expect(decodeSpecFragment("v=0.6.2&s=5&t=canyon&z=128&d=n&bw=l")!.spec.settings.hazards.badwater).toBe("low");
    expect(decodeSpecFragment("v=0.6.2&s=5&t=canyon&z=128&d=n")!.spec.settings.hazards.badwater).toBe("normal");
  });

  it("a map that asks for badwater and has none fails resources.badwater_source: it blocks generation and warns on export", () => {
    const r = generate(makeSpec({ seed: 23, size: { x: 96, y: 96 } }));
    const file = toTimberFile(r.spec, r.built);
    file.world.entities = file.world.entities.filter((e) => e.Template !== "BadwaterSource");
    const none = readTimber(writeTimber(file));
    for (const profile of ["generate", "export", "import"] as const) {
      const v = validateMap(none, { profile, spec: r.spec, designedFor: "normal" });
      const c = v.report.checks.find((x) => x.id === "resources.badwater_source")!;
      expect(c.ok, profile).toBe(false);
      expect(blocks(profile, c)).toBe(profile === "generate");
      expect(c.severity).toBe(profile === "generate" ? "error" : "warning");
      // the same map set to No badwater passes
      const off = validateMap(none, { profile, spec: withBadwater(r.spec, "off"), designedFor: "normal" });
      expect(off.report.checks.find((x) => x.id === "resources.badwater_source")!.ok, profile).toBe(true);
    }
  });

  it("D213: removing the map's last badwater spring switches it to No badwater, and undoing brings the spring back", () => {
    const r = generate(makeSpec({ seed: 23, size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r);
    const check = () => s.validate().report.checks.find((x) => x.id === "resources.badwater_source")!;
    const springs = s.features.filter((f) => f.kind === "setPiece" && f.params.kind === "badwaterBasin");
    expect(springs.length).toBeGreaterThan(0);
    expect(s.badwaterRemoved()).toBe(false);
    expect(s.effectiveSpec()!.settings.hazards.badwater).toBe(r.spec.settings.hazards.badwater);
    // removing the last one says so (removing one of several does not)
    const last = deleteEdit(s, springs[springs.length - 1].id);
    expect(last.ok && last.report.includes(LAST_BADWATER_NOTE)).toBe(springs.length === 1);
    // removing them is not refused: the map is now a peaceful one, and says so
    const applied = s.applyAll(springs.map((f) => ({ op: "deleteFeature" as const, params: { id: f.id } })), "user", "Remove the badwater springs");
    expect(applied.ok, applied.errors.join("; ")).toBe(true);
    expect(s.built.entities.some((e) => e.template === "BadwaterSource")).toBe(false);
    expect(s.badwaterRemoved()).toBe(true);
    expect(s.effectiveSpec()!.settings.hazards.badwater).toBe("off");
    expect(check().ok).toBe(true);
    const out = readTimber(s.exportTimber().bytes);
    expect(String(out.metadata?.MapDescription)).toContain(NO_BADWATER_NOTE);
    // the file alone, without its settings, reads as No badwater in the validator
    expect(validateMap(out, { profile: "import" }).report.checks.find((c) => c.id === "resources.badwater_source")!.ok).toBe(true);
    // undo: the springs, and with them the badwater the map asked for
    expect(s.undo()).toBe(true);
    expect(s.badwaterRemoved()).toBe(false);
    expect(String(readTimber(s.exportTimber().bytes).metadata?.MapDescription)).not.toContain(NO_BADWATER_NOTE);
    expect(check().ok).toBe(true);
  });

  it.skipIf(!PY)("the Python validator agrees: a map without one fails, a No badwater map passes without its settings", () => {
    const dir = join(".scratch", "badwater-oracle");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const r = generate(makeSpec({ seed: 23, size: { x: 96, y: 96 } }));
    const file = toTimberFile(r.spec, r.built);
    file.world.entities = file.world.entities.filter((e) => e.Template !== "BadwaterSource");
    const none = join(dir, "none.timber");
    writeFileSync(none, writeTimber(file));
    const off = generate(withBadwater(makeSpec({ seed: 22, size: { x: 96, y: 96 } }), "off"));
    const peaceful = join(dir, "peaceful.timber");
    writeFileSync(peaceful, off.bytes);
    const out = spawnSync(PY!, ["-B", "prototype/validate.py", "--json", none, peaceful], { encoding: "utf8", maxBuffer: 64 << 20 });
    const verdict = (path: string) => {
      const name = path.split(/[\\/]/).pop()!;
      const line = (out.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("{") && l.includes(name));
      const j = JSON.parse(line!) as { checks: { id: string; ok: boolean }[] };
      return j.checks.find((c) => c.id === "resources.badwater_source")!.ok;
    };
    expect(verdict(none)).toBe(false);
    expect(verdict(peaceful)).toBe(true);
    // the TypeScript validator, on the same files without their settings
    expect(validateMap(readTimber(new Uint8Array(readFileSync(none))), { profile: "import" }).report.checks.find((c) => c.id === "resources.badwater_source")!.ok).toBe(false);
    expect(validateMap(readTimber(new Uint8Array(readFileSync(peaceful))), { profile: "import" }).report.checks.find((c) => c.id === "resources.badwater_source")!.ok).toBe(true);
  });

  it("springs go in a hollow or side valley beyond the badwater distance, never on open ground", () => {
    const g = valleyGround();
    const budget = badwaterBudget(g.W, g.H, "normal", 3);
    const springs = pickBadwaterSprings({ W: g.W, H: g.H, heights: g.heights, water: g.settle.depth, taken: new Uint8Array(g.N), start: g.start, within: 15, budget, seed: 3 });
    expect(springs.length).toBeGreaterThanOrEqual(1);
    for (const s of springs) {
      expect(g.heights[s.y * g.W + s.x]).toBe(3);
      expect(s.fromStart).toBeGreaterThanOrEqual(15 + SPRING_MARGIN);
      expect(s.lowness).toBeGreaterThanOrEqual(0.5);
      expect(lownessAt(g.heights, g.W, g.H, s.x + 1, s.y + 1, s.z)).toBe(s.lowness);
    }
    // a flat plateau has no such ground
    const flat = new Uint8Array(g.N).fill(6);
    expect(pickBadwaterSprings({ W: g.W, H: g.H, heights: flat, water: new Float64Array(g.N), taken: new Uint8Array(g.N), start: g.start, within: 15, budget, seed: 3 })).toEqual([]);
  });

  it("on a map the generator did not plan (a Real place), one call places the springs and settles the water again with them", () => {
    const g = valleyGround();
    const input = {
      W: g.W,
      H: g.H,
      heights: g.heights,
      water: g.settle.depth,
      moisture: new Float64Array(g.N),
      soilContamination: new Float64Array(g.N),
      entities: [g.startEntity],
      start: g.start,
      settings: defaultSettings("riverValley", "normal", { x: g.W, y: g.H }).resources,
      seed: 4,
      nearStart: { wood: 108, bushes: 48 },
      ruinsClear: 22,
      badwater: { setting: "normal" as const, within: 15 },
    };
    const r = planMapResources(input);
    expect(r.badwater.length).toBeGreaterThanOrEqual(1);
    expect(r.water).not.toBeNull();
    const bad = r.entities.filter((e) => e.template === "BadwaterSource");
    expect(bad.length).toBe(r.badwater.length);
    // the badwater keeps its distance from the start, in the settle the file will carry
    const w = r.water!;
    let contaminated = 0;
    for (let i = 0; i < g.N; i++) {
      if (!(w.settle.contamination[i] > 0.05 && w.settle.depth[i] > 0.05) && !(w.soilContamination[i] > 0)) continue;
      contaminated++;
      const x = i % g.W;
      const y = (i - x) / g.W;
      expect(Math.max(Math.abs(x - g.start.x), Math.abs(y - g.start.y))).toBeGreaterThanOrEqual(15);
    }
    expect(contaminated).toBeGreaterThan(0);
    // No badwater: none, and the caller's water stands
    const off = planMapResources({ ...input, badwater: { setting: "off", within: 15 } });
    expect(off.badwater).toEqual([]);
    expect(off.water).toBeNull();
    expect(off.entities.some((e) => e.template === "BadwaterSource")).toBe(false);
    // the same input, the same entities
    expect(planMapResources(input).entities.map((e) => e.id)).toEqual(r.entities.map((e) => e.id));
    // a spring is a BadwaterSource like the generator's
    expect(bad[0].before).toEqual(waterSource({ id: "x", owner: "x", x: 0, y: 0, z: 0, strength: r.badwater[0].strength, bad: true }).before);
  });
});
