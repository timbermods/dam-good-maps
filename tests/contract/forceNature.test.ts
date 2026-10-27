// Every force's row is Power, Size, at most one signature choice and Try another (PLAN §20 D289),
// with everything else behind More, each detail on Auto until the player pins it (D309): what used
// to be a control is natural variation drawn from the land where the force acts and the series' seed
// (core/forces/nature.ts), for every detail still absent from its settings; a detail present in the
// settings (a pin) is left exactly as it is. The same place and seed always draw the same character;
// the seeds draw different ones, leaned by the land (open ground lets a river wander, rugged ground
// carves steep gorges); a pin survives every seed while the rest keeps varying. The editor's force
// runs with the drawn settings and its operation keeps them, Try another re-rolls only the details
// still on Auto (sending no pins re-rolls all of them, as a caller outside the row does), and the
// project replays to the same bytes.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS, type CraterSettings } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { AUTO_CARVE_DETAILS, AUTO_CRATER_DETAILS, AUTO_ERUPT_DETAILS, AUTO_QUAKE_DETAILS, carveNature, craterNature, eruptNature, quakeNature, ruggedness, type ForceGround } from "../../src/core/forces/nature";
import type { ForceResultParams } from "../../src/core/forces/op";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 64;
/** Flat ground, and ground rising a level every two tiles eastward (rugged). */
const flat: ForceGround = { W, H: W, heights: new Uint8Array(W * W).fill(6), at: 32 * W + 32 };
const steep: ForceGround = { W, H: W, heights: Uint8Array.from({ length: W * W }, (_, i) => Math.min(22, (i % W) >> 1)), at: 32 * W + 32 };

describe("a force's character from the land and the seed, on Auto until pinned (D289, D309)", () => {
  it("the same place and seed draw the same; the seeds draw many; only the unshown choices change", () => {
    expect(ruggedness(flat)).toBe(0);
    expect(ruggedness(steep)).toBe(1);
    const carves = new Set<string>();
    const craters = new Set<string>();
    const erupts = new Set<string>();
    const quakes = new Set<string>();
    for (let seed = 0; seed < 24; seed++) {
      const c = carveNature({ ...CARVE_DEFAULTS, ...AUTO_CARVE_DETAILS, seed, power: 40, width: 7, dry: true }, flat);
      expect(carveNature({ ...CARVE_DEFAULTS, ...AUTO_CARVE_DETAILS, seed, power: 40, width: 7, dry: true }, flat)).toEqual(c);
      expect([c.power, c.width, c.dry, c.seed, c.mode]).toEqual([40, 7, true, seed, "unleash"]);
      carves.add(`${c.wander} ${c.walls}`);
      const k = craterNature({ ...CRATER_DEFAULTS, ...AUTO_CRATER_DETAILS, seed, power: 50, size: 30 }, flat);
      expect([k.power, k.size, k.mode]).toEqual([50, 30, "strike"]);
      craters.add(`${k.walls} ${k.centre} ${k.debris} ${k.rays}`);
      const e = eruptNature({ ...ERUPT_DEFAULTS, ...AUTO_ERUPT_DETAILS, seed, power: 50, size: 40 }, steep);
      expect([e.power, e.size, e.mode]).toEqual([50, 40, "vent"]);
      erupts.add(`${e.shape} ${e.summit} ${e.flows} ${e.ridges}`);
      const q = quakeNature({ ...QUAKE_DEFAULTS, ...AUTO_QUAKE_DETAILS, seed, mode: "slide" }, steep);
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
      const a = carveNature({ ...CARVE_DEFAULTS, ...AUTO_CARVE_DETAILS, seed }, flat);
      const b = carveNature({ ...CARVE_DEFAULTS, ...AUTO_CARVE_DETAILS, seed }, steep);
      flatWander += a.wander ?? 0;
      steepWander += b.wander ?? 0;
      if (a.walls === "steep") flatSteepWalls++;
      if (b.walls === "steep") steepSteepWalls++;
    }
    expect(flatWander).toBeGreaterThan(steepWander);
    expect(steepSteepWalls).toBeGreaterThan(flatSteepWalls);
  });

  it("a detail pinned in the settings stays through every seed; the rest still varies (D309)", () => {
    const centres = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const k = craterNature({ ...CRATER_DEFAULTS, ...AUTO_CRATER_DETAILS, seed, power: 50, size: 30, walls: "terraced" }, flat);
      expect(k.walls).toBe("terraced");
      centres.add(`${k.centre} ${k.debris} ${k.rays}`);
    }
    expect(centres.size).toBeGreaterThan(4);
  });

  it("the editor's force runs with the drawn settings and keeps them; Try another re-rolls only the details still on Auto; a pin sent with it survives; the project replays exactly", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.refine();
    const s0 = MapSession.open(decodeProject(ed.project().bytes));
    const b = s0.built;
    const st = b.start!;
    const at: [number, number] = [st.x < 48 ? 72 : 24, st.y < 48 ? 72 : 24];
    const ground: ForceGround = { W: 96, H: 96, heights: b.heights, at: at[1] * 96 + at[0] };
    // (a fresh series, Auto for every detail: what the row's craterSettingsOf sends before any pin)
    const settings = { ...CRATER_DEFAULTS, ...AUTO_CRATER_DETAILS, power: 40 } as unknown as CraterSettings;
    const lastParams = () => {
      const s = MapSession.open(decodeProject(ed.project().bytes));
      const op = s.state.sculpts.filter((o) => o.op === "forceResult").at(-1)!;
      return { s, params: op.params as ForceResultParams };
    };
    const started = ed.forceStart({ verb: "craterize", settings, origin: at, cut: null, natural: true });
    expect(started.errors).toEqual([]);
    // (a new force clears sources unless its row says Ride: D474)
    expect(started.settings).toEqual({ ...craterNature({ ...settings, seed: settings.seed }, ground), sources: "clear" });
    for (let k = 0; k < 400 && !ed.forceAdvance(8)!.done; k++);
    expect(ed.forceStop().kept).toBe(true);
    const first = lastParams().params.settings as CraterSettings;
    expect(first).toEqual({ ...craterNature(settings, ground), sources: "clear" });
    // Try another with no pins (a caller outside the row, D309): the next seed, and every choice
    // drawn again from it
    const seen = new Set([`${first.walls} ${first.centre} ${first.debris} ${first.rays}`]);
    for (let k = 0; k < 5; k++) {
      const again = ed.forceAgain();
      expect(again.errors).toEqual([]);
      for (let j = 0; j < 400 && !ed.forceAdvance(8)!.done; j++);
      expect(ed.forceStop().kept).toBe(true);
      const p = lastParams().params.settings as CraterSettings;
      expect(p).toEqual({ ...craterNature({ ...settings, seed: p.seed }, ground), sources: "clear" });
      seen.add(`${p.walls} ${p.centre} ${p.debris} ${p.rays}`);
    }
    expect(seen.size).toBeGreaterThan(1);
    // Try another with the row's pins (D309): the pinned detail survives every try, the rest keeps
    // varying
    const pinnedWalls = (lastParams().params.settings as CraterSettings).walls;
    const others = new Set<string>();
    for (let k = 0; k < 6; k++) {
      const again = ed.forceAgain({ walls: pinnedWalls, centre: null, debris: null, rays: null });
      expect(again.errors).toEqual([]);
      expect(again.settings).toMatchObject({ walls: pinnedWalls });
      for (let j = 0; j < 400 && !ed.forceAdvance(8)!.done; j++);
      expect(ed.forceStop().kept).toBe(true);
      const p = lastParams().params.settings as CraterSettings;
      expect(p.walls).toBe(pinnedWalls);
      others.add(`${p.centre} ${p.debris} ${p.rays}`);
    }
    expect(others.size).toBeGreaterThan(1);
    // the project replays to the same bytes (its result is literal)
    const { s } = lastParams();
    expect(Array.from(s.built.heights)).toEqual(Array.from(ed.terrainNow().heights));
    // a force without the row's nature (a saved one, or another caller) runs as asked, every detail
    // fully specified (no Auto: `natural` is only ever set once nature.ts is meant to fill the rest)
    const plain = ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 40, walls: "steep", rays: true }, origin: at, cut: null });
    expect(plain.settings).toMatchObject({ walls: "steep", rays: true });
    ed.forceCancel();
  });

  it("pinning every value a run drew reproduces that exact result (D309)", async () => {
    await runGenerate(makeSpec({ seed: 24, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.refine();
    const s0 = MapSession.open(decodeProject(ed.project().bytes));
    const st = s0.built.start!;
    const at: [number, number] = [st.x < 48 ? 72 : 24, st.y < 48 ? 72 : 24];
    const settings = { ...CRATER_DEFAULTS, ...AUTO_CRATER_DETAILS, power: 45, seed: 3 } as unknown as CraterSettings;
    const runOnce = () => {
      const started = ed.forceStart({ verb: "craterize", settings, origin: at, cut: null, natural: true });
      expect(started.errors).toEqual([]);
      for (let k = 0; k < 400 && !ed.forceAdvance(8)!.done; k++);
      const heights = Array.from(ed.terrainNow().heights);
      const drawn = started.settings as CraterSettings;
      ed.forceCancel();
      return { heights, drawn };
    };
    const a = runOnce();
    // pin every value the first run drew, including its seed: the row's Auto shows this once it
    // ends, and one click each pins it (D309)
    const pinned = { ...settings, ...a.drawn };
    const started2 = ed.forceStart({ verb: "craterize", settings: pinned, origin: at, cut: null, natural: true });
    expect(started2.settings).toEqual(a.drawn);
    for (let k = 0; k < 400 && !ed.forceAdvance(8)!.done; k++);
    expect(Array.from(ed.terrainNow().heights)).toEqual(a.heights);
    ed.forceCancel();
  });
});
