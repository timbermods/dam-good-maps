// The shared forces core (PLAN §20 D203, D206, D219, D220), pinned to Codex's prototypes: the
// forces-core investigation (#59) compared its extracted verbs with the four prototypes' pinned
// sources byte for byte on 45 cases (investigation/forces-core/checks/parity.json). The port in
// src/core/forces must give the same land, objects and fallen trees on each of them.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CarveRun, DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS, impact } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS, erupt } from "../../src/core/forces/erupt";
import { snapshotMap, type ForceMap } from "../../src/core/forces/force";
import { QUAKE_DEFAULTS, quake } from "../../src/core/forces/quake";
import { fixture } from "./forceFixtures";

interface Pinned {
  verb: string;
  seed: number;
  sha256: string;
  mode?: string;
  scarp?: string;
  centre?: string;
  shape?: string;
  wander?: number;
}

const PINNED: { cases: number; results: Pinned[] } = JSON.parse(readFileSync(join(__dirname, "../../investigation/forces-core/checks/parity.json"), "utf8"));

const digest = (m: ForceMap) =>
  createHash("sha256")
    .update(m.heights)
    .update(JSON.stringify(m.entities))
    .update(JSON.stringify(m.fallen ?? []))
    .digest("hex");

const pinned = (p: Partial<Pinned>) => PINNED.results.find((r) => Object.entries(p).every(([k, v]) => r[k as keyof Pinned] === v))!.sha256;

describe("the forces core, pinned to the prototypes (#59's 45 cases)", () => {
  it("has the 45 cases", () => {
    expect(PINNED.cases).toBe(45);
    expect(PINNED.results.length).toBe(45);
  });

  it("Quake: Lift and Slide, Sheer and Stepped, three personalities", () => {
    for (const seed of [0, 1, 42])
      for (const mode of ["lift", "slide"] as const)
        for (const scarp of ["sheer", "stepped"] as const) {
          const m = fixture("slide", 64);
          const p = quake(snapshotMap(m), { ...QUAKE_DEFAULTS, seed, mode, scarp }, { path: [{ x: 0, y: 38 }, { x: 63, y: 38 }], side: seed % 2 ? 1 : -1 });
          expect(digest(p.map), `${mode} ${scarp} ${seed}`).toBe(pinned({ verb: "quake", mode, scarp, seed }));
        }
  });

  it("Craterize: every centre, with and without rays", () => {
    for (const seed of [0, 1, 42])
      for (const centre of ["bowl", "peak", "ring", "flat"] as const) {
        const m = fixture("plain", 64);
        const p = impact(snapshotMap(m), { ...CRATER_DEFAULTS, seed, centre, power: 50, size: 28, rays: seed > 0 }, { origin: 38 * 64 + 40 });
        expect(digest(p.map), `${centre} ${seed}`).toBe(pinned({ verb: "craterize", centre, seed }));
      }
  });

  it("Erupt: Vent and Fissure, Steep and Broad", () => {
    for (const seed of [0, 1, 42])
      for (const mode of ["vent", "fissure"] as const)
        for (const shape of ["steep", "broad"] as const) {
          const m = fixture("plain", 64);
          const p = erupt(snapshotMap(m), { ...ERUPT_DEFAULTS, seed, mode, shape, power: 45 }, { origin: 40 * 64 + 35, path: [{ x: 30, y: 40 }, { x: 50, y: 42 }] });
          expect(digest(p.map), `${mode} ${shape} ${seed}`).toBe(pinned({ verb: "erupt", mode, shape, seed }));
        }
  });

  it("Carve: straight to winding, three personalities, every step to the end", () => {
    for (const seed of [0, 1, 42])
      for (const wander of [0, 35, 100]) {
        const m = fixture("plain", 64);
        const r = new CarveRun(snapshotMap(m), { ...CARVE_DEFAULTS, mode: "aim", dry: true, defyGravity: true, width: 5, power: 75, wander, seed }, { origin: 55 * 64 + 40, end: 3 * 64 + 40 });
        for (let k = 0; k < 1400 && !r.metrics.stable; k++) r.step();
        expect(r.metrics.stable).toBe(true);
        expect(digest(r.map), `wander ${wander} seed ${seed}`).toBe(pinned({ verb: "carve", wander, seed }));
      }
  });
});
