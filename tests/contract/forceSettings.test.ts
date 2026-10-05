// One table of every force's settings (forces/settings.ts, D342): the operation's check and each force's
// own check when it starts give the same one-line reason, and ops.schema.json's `forceResult.settings`
// (one range a setting, shared by the forces) contains every force's own, the code refusing the rest.

import { describe, expect, it } from "vitest";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { DEFAULTS as CARVE_DEFAULTS, CarveRun } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS, validateCrater } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS, validateErupt } from "../../src/core/forces/erupt";
import type { ForceMap } from "../../src/core/forces/force";
import { GLACIATE_DEFAULTS, glaciateProblem } from "../../src/core/forces/glaciate/model";
import { forceSettingsProblems, VERBS, type Verb } from "../../src/core/forces/op";
import { DEPOSIT_DEFAULTS, validateDeposit } from "../../src/core/forces/deposit";
import { RIFT_DEFAULTS, validateRift } from "../../src/core/forces/rift";
import { QUAKE_DEFAULTS, validateQuake } from "../../src/core/forces/quake";
import { FORCE_SETTINGS, POWER_MAX, POWER_MIN, SEED_MAX } from "../../src/core/forces/settings";

type Prop = { type?: string | string[]; enum?: unknown[]; minimum?: number; maximum?: number };
const props = (opsSchema as unknown as { $defs: { forceResult: { properties: { settings: { properties: Record<string, Prop> } } } } }).$defs.forceResult.properties.settings.properties;

const DEFAULTS: Record<Verb, Record<string, unknown>> = {
  carve: { ...CARVE_DEFAULTS },
  craterize: { ...CRATER_DEFAULTS },
  erupt: { ...ERUPT_DEFAULTS },
  quake: { ...QUAKE_DEFAULTS },
  glaciate: { ...GLACIATE_DEFAULTS },
  rift: { ...RIFT_DEFAULTS },
  deposit: { ...DEPOSIT_DEFAULTS },
};

const W = 16;
const map: ForceMap = { W, H: W, heights: new Uint8Array(W * W).fill(4), entities: [], water: { depth: new Float64Array(W * W), contamination: new Float64Array(W * W) }, maxHeight: 22 };
const path = [{ x: 2, y: 2 }, { x: 10, y: 10 }];

/** Why each force refuses `s` when it starts (null: it starts). */
function atStart(verb: Verb, s: Record<string, unknown>): string | null {
  const thrown = (f: () => void) => {
    try {
      f();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  switch (verb) {
    case "deposit":
      return thrown(() => validateDeposit(s as never));
    case "rift":
      return thrown(() => validateRift(s as never));
    case "carve":
      return thrown(() => new CarveRun(map, s as never, { origin: 5 * W + 5 }));
    case "craterize":
      return thrown(() => validateCrater(s as never, map, { origin: 5 * W + 5 }));
    case "erupt":
      return thrown(() => validateErupt(s as never, map, { origin: 5 * W + 5 }));
    case "quake":
      return thrown(() => validateQuake(s as never, map, { path, side: 1 }));
    case "glaciate":
      return glaciateProblem(W, W, s as never, { origin: 5 * W + 5 });
  }
}

describe("a force's settings, one table (D342)", () => {
  it("the schema's ranges contain every force's own, and its choices every force's", () => {
    expect([props.power.minimum, props.power.maximum]).toEqual([POWER_MIN, POWER_MAX]);
    expect([props.seed.minimum, props.seed.maximum]).toEqual([0, SEED_MAX]);
    for (const verb of VERBS) {
      const t = FORCE_SETTINGS[verb];
      for (const [k, list] of Object.entries(t.choices)) for (const v of list) expect(props[k]?.enum, `${verb} ${k}`).toContain(v);
      for (const k of t.flags) expect(props[k]?.type, `${verb} ${k}`).toBe("boolean");
      for (const r of t.ranges) {
        const p = props[r.key];
        expect(p, `${verb} ${r.key}`).toBeDefined();
        expect(p.minimum!, `${verb} ${r.key} min`).toBeLessThanOrEqual(r.min);
        expect(p.maximum!, `${verb} ${r.key} max`).toBeGreaterThanOrEqual(r.max);
      }
      for (const d of t.details ?? []) if (d.options) for (const v of d.options) expect(props[d.key]?.enum, `${verb} ${d.key}`).toContain(v);
    }
  });

  it("each force takes its own range's ends, and refuses past them with the same one-line reason when it starts as in its operation", () => {
    for (const verb of VERBS) {
      const base = DEFAULTS[verb];
      expect(forceSettingsProblems(verb, base), verb).toEqual([]);
      expect(atStart(verb, base), verb).toBeNull();
      for (const r of FORCE_SETTINGS[verb].ranges) {
        for (const v of [r.min, r.max]) {
          expect(forceSettingsProblems(verb, { ...base, [r.key]: v }), `${verb} ${r.key} ${v}`).toEqual([]);
          expect(atStart(verb, { ...base, [r.key]: v }), `${verb} ${r.key} ${v}`).toBeNull();
        }
        // (past either end, and between whole levels; the schema's range still takes some of them)
        for (const v of [r.min - 1, r.max + 1, ...(r.whole ? [r.min + 0.5] : [])]) {
          const s = { ...base, [r.key]: v };
          expect(forceSettingsProblems(verb, s), `${verb} ${r.key} ${v}`).toEqual([r.why]);
          expect(atStart(verb, s), `${verb} ${r.key} ${v}`).toBe(r.why);
        }
      }
      for (const [k, v] of [["power", 101], ["seed", -1], ["floor", 0], ["mode", "sideways"]] as const) {
        const s = { ...base, [k]: v };
        const why = forceSettingsProblems(verb, s);
        expect(why, `${verb} ${k}`).toHaveLength(1);
        expect(atStart(verb, s), `${verb} ${k}`).toBe(why[0]);
      }
    }
  });
});
