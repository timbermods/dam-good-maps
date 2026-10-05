// The Rust boundary, probed: odd paths, points and settings sent to every force the editor's way
// (the worker session's forceStart). Each must start, or be refused with a one-line reason; never throw.
import { makeSpec } from "../../../src/core/spec/mapspec";
import { runGenerate } from "../../../src/worker/api";
import * as ed from "../../../src/worker/session";
import { RIFT_DEFAULTS } from "../../../src/core/forces/rift";
import { DEPOSIT_DEFAULTS } from "../../../src/core/forces/deposit";
import { DEFAULTS as CARVE } from "../../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../../src/core/forces/erupt";
import { QUAKE_DEFAULTS } from "../../../src/core/forces/quake";
import { GLACIATE_DEFAULTS } from "../../../src/core/forces/glaciate/model";
const W = 64;
await runGenerate(makeSpec({ seed: 3, size: { x: W, y: W } }));
ed.refine();
const paths: Record<string, { x: number; y: number }[]> = {
  empty: [],
  one: [{ x: 30, y: 30 }],
  same: [{ x: 30, y: 30 }, { x: 30, y: 30 }],
  off: [{ x: -20, y: 30 }, { x: -5, y: 40 }],
  half: [{ x: 30, y: 30 }, { x: 90, y: 30 }],
  nan: [{ x: NaN, y: 30 }, { x: 40, y: 30 }],
  inf: [{ x: 30, y: 30 }, { x: Infinity, y: 30 }],
  frac: [{ x: 30.6, y: 30.2 }, { x: 40.7, y: 41.9 }],
  edge: [{ x: 0, y: 0 }, { x: 63, y: 0 }],
  long: Array.from({ length: 400 }, (_, k) => ({ x: 5 + (k % 50), y: 5 + Math.floor(k / 8) })),
};
const reqs: [string, any][] = [];
for (const [n, path] of Object.entries(paths)) {
  reqs.push([`rift ${n}`, { verb: "rift", settings: { ...RIFT_DEFAULTS, power: 0 }, path, cut: null }]);
  reqs.push([`deposit ${n}`, { verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power: 0 }, path, cut: null }]);
  reqs.push([`quake ${n}`, { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 0 }, path, side: 1, cut: null, natural: true }]);
  reqs.push([`erupt fissure ${n}`, { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "fissure", power: 0 }, origin: [30, 30], path, cut: null, natural: true }]);
}
const bad = { power: NaN };
for (const [verb, d, extra] of [["rift", RIFT_DEFAULTS, { path: paths.frac }], ["deposit", DEPOSIT_DEFAULTS, { path: paths.frac }], ["carve", { ...CARVE, mode: "unleash" }, { origin: [30, 30] }], ["craterize", CRATER_DEFAULTS, { origin: [30, 30] }], ["erupt", ERUPT_DEFAULTS, { origin: [30, 30] }], ["quake", QUAKE_DEFAULTS, { path: paths.frac, side: 1 }], ["glaciate", GLACIATE_DEFAULTS, { origin: [30, 30] }]] as const) {
  for (const [n, s] of Object.entries({ nanPower: bad, power101: { power: 101 }, negSize: { size: -3 }, hugeSize: { size: 1e9 }, seedFrac: { seed: 1.5 }, floor99: { floor: 99 }, floorNeg: { floor: -1 }, walls: { walls: "zzz" }, noMode: { mode: undefined }, origin: {} }))
    reqs.push([`${verb} ${n}`, { verb, settings: { ...d, ...s }, ...extra, cut: null }]);
  reqs.push([`${verb} originOff`, { verb, settings: d, ...extra, origin: [99, 5], cut: null }]);
  reqs.push([`${verb} originFrac`, { verb, settings: d, ...extra, origin: [30.5, 30.5], cut: null }]);
  reqs.push([`${verb} cut0`, { verb, settings: d, ...extra, cut: 0 }]);
  reqs.push([`${verb} areaTiny`, { verb, settings: d, ...extra, area: [[30, 30, 30]], cut: null }]);
  reqs.push([`${verb} areaOff`, { verb, settings: d, ...extra, area: [[200, 0, 3]], cut: null }]);
}
for (const [name, req] of reqs) {
  let line: string;
  try {
    const r = ed.forceStart(req);
    if (!r.ok) line = `refused: ${JSON.stringify(r.errors)}`;
    else {
      let f; let n = 0;
      for (; n < 4000; n++) { f = ed.forceAdvance(64); if (!f || f.done) break; }
      const st = ed.forceStop();
      line = `kept=${st.kept} ${st.errors?.join("|") ?? ""}`;
      if (st.kept) ed.undo();
    }
  } catch (e) {
    line = `THREW ${(e as Error).message.slice(0, 160)}`;
    try { ed.forceCancel(); } catch {}
  }
  console.log(`${name.padEnd(24)} ${line}`);
}
