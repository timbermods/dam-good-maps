// Every force's row is Power, Size, at most one choice and Try another (PLAN §20 D289): what used to
// be a control is natural variation drawn from the land where the force acts and the series' seed
// (core/forces/nature.ts). The same place and seed always draw the same character; the seeds draw
// different ones, leaned by the land (open ground lets a river wander, rugged ground carves steep
// gorges); the editor's force runs with the drawn settings and its operation keeps them, Try
// another re-rolls them, and the project replays to the same bytes.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { carveNature, craterNature, eruptNature, quakeNature, ruggedness, type ForceGround } from "../../src/core/forces/nature";
import type { ForceResultParams } from "../../src/core/forces/op";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 64;
/** Flat ground, and ground rising a level every two tiles eastward (rugged). */
const flat: ForceGround = { W, H: W, heights: new Uint8Array(W * W).fill(6), at: 32 * W + 32 };
const steep: ForceGround = { W, H: W, heights: Uint8Array.from({ length: W * W }, (_, i) => Math.min(22, (i % W) >> 1)), at: 32 * W + 32 };

describe("a force's character from the land and the seed (D289)", () => {
  it("the same place and seed draw the same; the seeds draw many; only the unshown choices change", () => {
    expect(ruggedness(flat)).toBe(0);
    expect(ruggedness(steep)).toBe(1);
    const carves = new Set<string>();
    const craters = new Set<string>();
    const erupts = new Set<string>();
    const quakes = new Set<string>();
    for (let seed = 0; seed < 24; seed++) {
      const c = carveNature({ ...CARVE_DEFAULTS, seed, power: 40, width: 7, dry: true }, flat);
      expect(carveNature({ ...CARVE_DEFAULTS, seed, power: 40, width: 7, dry: true }, flat)).toEqual(c);
      expect([c.power, c.width, c.dry, c.seed, c.mode]).toEqual([40, 7, true, seed, "unleash"]);
      carves.add(`${c.wander} ${c.walls}`);
      const k = craterNature({ ...CRATER_DEFAULTS, seed, power: 50, size: 30 }, flat);
      expect([k.power, k.size, k.mode]).toEqual([50, 30, "strike"]);
      craters.add(`${k.walls} ${k.centre} ${k.debris} ${k.rays}`);
      const e = eruptNature({ ...ERUPT_DEFAULTS, seed, power: 50, size: 40 }, steep);
      expect([e.power, e.size, e.mode]).toEqual([50, 40, "vent"]);
      erupts.add(`${e.shape} ${e.summit} ${e.flows} ${e.ridges}`);
      const q = quakeNature({ ...QUAKE_DEFAULTS, seed, mode: "slide" }, steep);
      expect(q.mode).toBe("slide");
      quakes.add(q.scarp);
    }
    expect(carves.size).toBeGreaterThan(4);
    expect(craters.size).toBeGreaterThan(4);
    expect(erupts.size).toBeGreaterThan(4);
    expect(quakes.size).toBe(2);
  });

  it("the land leans it: open ground lets a river wander and breaks broad; rugged ground runs straighter between steep walls", () => {
    let flatWander = 0;
    let steepWander = 0;
    let flatSteepWalls = 0;
    let steepSteepWalls = 0;
    for (let seed = 0; seed < 60; seed++) {
      const a = carveNature({ ...CARVE_DEFAULTS, seed }, flat);
      const b = carveNature({ ...CARVE_DEFAULTS, seed }, steep);
      flatWander += a.wander ?? 0;
      steepWander += b.wander ?? 0;
      if (a.walls === "steep") flatSteepWalls++;
      if (b.walls === "steep") steepSteepWalls++;
    }
    expect(flatWander).toBeGreaterThan(steepWander);
    expect(steepSteepWalls).toBeGreaterThan(flatSteepWalls);
  });

  it("the editor's force runs with the drawn settings and keeps them; Try another re-rolls them; the project replays exactly", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s0 = MapSession.open(decodeProject(ed.project().bytes));
    const b = s0.built;
    const st = b.start!;
    const at: [number, number] = [st.x < 48 ? 72 : 24, st.y < 48 ? 72 : 24];
    const ground: ForceGround = { W: 96, H: 96, heights: b.heights, at: at[1] * 96 + at[0] };
    const settings = { ...CRATER_DEFAULTS, power: 40 };
    const lastParams = () => {
      const s = MapSession.open(decodeProject(ed.project().bytes));
      const op = s.state.sculpts.filter((o) => o.op === "forceResult").at(-1)!;
      return { s, params: op.params as ForceResultParams };
    };
    const started = ed.forceStart({ verb: "craterize", settings, origin: at, cut: null, natural: true });
    expect(started.errors).toEqual([]);
    expect(started.settings).toEqual(craterNature({ ...settings, seed: settings.seed }, ground));
    for (let k = 0; k < 400 && !ed.forceAdvance(8)!.done; k++);
    expect(ed.forceStop().kept).toBe(true);
    const first = lastParams().params.settings as typeof settings;
    expect(first).toEqual(craterNature(settings, ground));
    // Try another: the next seed, and the choices drawn again from it
    const seen = new Set([`${first.walls} ${first.centre} ${first.debris} ${first.rays}`]);
    for (let k = 0; k < 5; k++) {
      const again = ed.forceAgain();
      expect(again.errors).toEqual([]);
      for (let j = 0; j < 400 && !ed.forceAdvance(8)!.done; j++);
      expect(ed.forceStop().kept).toBe(true);
      const p = lastParams().params.settings as typeof settings;
      expect(p).toEqual(craterNature({ ...settings, seed: p.seed }, ground));
      seen.add(`${p.walls} ${p.centre} ${p.debris} ${p.rays}`);
    }
    expect(seen.size).toBeGreaterThan(1);
    // the project replays to the same bytes (its result is literal)
    const { s } = lastParams();
    expect(Array.from(s.built.heights)).toEqual(Array.from(ed.terrainNow().heights));
    // a force without the row's nature (a saved one, or another caller) runs as asked
    const plain = ed.forceStart({ verb: "craterize", settings: { ...settings, walls: "steep", rays: true }, origin: at, cut: null });
    expect(plain.settings).toMatchObject({ walls: "steep", rays: true });
    ed.forceCancel();
  });
});
