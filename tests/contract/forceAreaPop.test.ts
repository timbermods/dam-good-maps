// A force used inside a working area ends on the land it keeps (PLAN §20 D254, D368 (9)). Inside the
// area a force's change eases to the locked land a level a tile; before the second core hunt the keep
// eased it, but the showing didn't, so the full force played and the land then dropped back at the end
// (an Erupt by up to 5 levels on 275 tiles, a Lift by 7). The forces' showing now eases each tile as
// the keep does: `planForce` (forces/start.ts) for Craterize, Erupt, Quake and Glaciate, `CarvePlay`
// for Carve; Rift and Deposit ease theirs in Rust. investigation/core-hunt-2, finding 1.

import { beforeAll, expect, it } from "vitest";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

// a 21 × 21 working area in the middle of River Valley 64² seed 1
const area: [number, number, number][] = [];
for (let y = 20; y <= 40; y++) area.push([y, 20, 40]);
const at = { cut: null, natural: true, area } as const;
const fault = [{ x: 22, y: 30 }, { x: 38, y: 31 }];

const USES: [string, ed.ForceRequest][] = [
  ["Erupt", { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "vent", power: 80, size: null, shape: null, summit: null, flows: null, ridges: null, seed: 3 } as never, origin: [30, 30], ...at }],
  ["Craterize", { verb: "craterize", settings: { ...CRATER_DEFAULTS, mode: "strike", power: 80, size: null, walls: null, centre: null, debris: null, rays: null, seed: 3 } as never, origin: [30, 30], ...at }],
  ["Quake's Lift", { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "lift", power: 90, scarp: null, seed: 3 } as never, path: fault, side: 1, ...at }],
  ["Quake's Slide", { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 90, scarp: null, seed: 3 } as never, path: fault, side: 1, ...at }],
  ["Glaciate", { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, mode: "flow", power: 100, size: null, benches: null, steps: null, tarn: null, scree: null, seed: 3 } as never, origin: [30, 30], ...at }],
  ["Carve", { verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "unleash", power: 90, width: null, wander: null, walls: null, depth: null, riverDepth: 2, banks: null, dry: true, seed: 3 } as never, origin: [30, 30], ...at }],
  ["Rift", { verb: "rift", settings: { ...RIFT_DEFAULTS, power: 100 }, path: fault, ...at }],
  ["Deposit", { verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power: 100 }, path: [{ x: 25, y: 25 }, { x: 35, y: 35 }], ...at }],
];

beforeAll(async () => {
  await runGenerate(makeSpec({ seed: 1, theme: "riverValley", size: { x: 64, y: 64 } }));
  ed.refine();
}, 120_000);

it.each(USES)("%s inside a working area: its last frame is the land it keeps", (_name, req) => {
  const before = ed.terrainNow().heights.slice();
  const r = ed.forceStart(req);
  expect(r.errors).toEqual([]);
  let shown = r.frame?.heights ?? before;
  for (let k = 0; k < 100_000; k++) {
    const f = ed.forceAdvance(5);
    if (!f) break;
    if (f.heights) shown = f.heights;
    if (f.done) break;
  }
  expect(ed.forceStop(r.gesture).kept).toBe(true);
  const kept = ed.terrainNow().heights.slice();
  ed.undo();
  let changed = 0;
  for (let i = 0; i < kept.length; i++) if (kept[i] !== before[i]) changed++;
  expect(changed).toBeGreaterThan(50);
  let popped = 0;
  for (let i = 0; i < kept.length; i++) if (kept[i] !== shown[i]) popped++;
  expect(popped).toBe(0);
});
