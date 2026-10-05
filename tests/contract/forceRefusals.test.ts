// A force's refusal is one plain line that says why (PLAN §20 D342), never a crash or a reason about
// something else. Before the second core hunt: a Quake sent with no fault threw a TypeError; a point
// that is not a tile (a fraction, NaN) was refused as "the carve's origin is off the map" or as a bad
// Size; and a Rift or Deposit on ground above the layer showing, or outside the working area, blamed the
// Floor ("the Floor leaves no ground to drop here") or the working area when there was none.
// investigation/core-hunt-2, finding 3.

import { beforeAll, expect, it } from "vitest";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

beforeAll(async () => {
  await runGenerate(makeSpec({ seed: 3, size: { x: 64, y: 64 } }));
  ed.refine();
}, 120_000);

const line = [{ x: 30.6, y: 30.2 }, { x: 40.7, y: 41.9 }];
const tiny: [number, number, number][] = [[30, 30, 30]];
const LAYER = "That ground is above the layer showing: show it to change it";
const AREA = "Outside the working area: Esc clears it";
const PICK = "Pick a spot on the map";

it.each([
  ["a Quake with no fault", { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 0 }, path: [], side: 1, cut: null, natural: true }, "Draw a fault on the land"],
  ["a Quake through NaN", { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 0 }, path: [{ x: NaN, y: 30 }, { x: 40, y: 30 }], side: 1, cut: null, natural: true }, PICK],
  ["a fissure through NaN", { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "fissure", power: 0 }, origin: [30, 30], path: [{ x: NaN, y: 30 }, { x: 40, y: 30 }], cut: null, natural: true }, PICK],
  ["a Carve at half a tile", { verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "unleash" }, origin: [30.5, 30.5], cut: null }, PICK],
  ["an impact at half a tile", { verb: "craterize", settings: CRATER_DEFAULTS, origin: [30.5, 30.5], cut: null }, PICK],
  ["a Rift under the layer showing", { verb: "rift", settings: RIFT_DEFAULTS, path: line, cut: 0 }, LAYER],
  ["a Rift outside the working area", { verb: "rift", settings: RIFT_DEFAULTS, path: line, cut: null, area: tiny }, AREA],
  ["a Deposit under the layer showing", { verb: "deposit", settings: DEPOSIT_DEFAULTS, path: line, cut: 0 }, LAYER],
] as [string, ed.ForceRequest, string][])("%s is refused with its own reason", (_name, req, why) => {
  const before = ed.terrainNow().heights.slice();
  const r = ed.forceStart(req);
  expect(r.ok).toBe(false);
  expect(r.errors).toEqual([why]);
  expect(ed.terrainNow().heights).toEqual(before);
  expect(ed.forcing()).toBe(false);
});
