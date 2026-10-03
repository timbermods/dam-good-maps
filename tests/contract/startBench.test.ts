// Release gate (D385), forces: a force that breaks the start's ground carries the start to the nearest
// level ground where it stands well, in the same undo step (D257). `moveStartNear(s, x, y, true)`
// (core/doc/tools.ts) promises "only where its ground is level already ... the force's land stays as
// it made it", and nothing pops in after a force's last frame (D368 (9)). But it checks only the
// start's 3 × 3 and its door tile for level ground, while the start's bench (its disc of radius 2,
// `rasterizeBench`) is laid at the new place: a tile two away from the new start that isn't at the
// bench's level is cut or filled to it, land the force never made.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { startMiddle } from "../../src/core/doc/tools";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 64;
const open = () => MapSession.open(decodeProject(ed.project().bytes));

/** The tiles whose level changed that the force's own result doesn't list, as "x,y: before -> after". */
async function beyondTheForce(theme: ThemeId, seed: number, req: (st: { x: number; y: number }) => ed.ForceRequest) {
  await runGenerate(makeSpec({ seed, theme, size: { x: W, y: W } }));
  ed.refine();
  const before = open();
  const from = startMiddle(before);
  expect(ed.forceStart(req(before.built.start!)).errors).toEqual([]);
  for (let k = 0; k < 4000 && !(ed.forceAdvance(16)?.done ?? true); k++);
  expect(ed.forceStop().kept).toBe(true);
  const after = open();
  // (the start was carried, in the force's step)
  expect(startMiddle(after)).not.toEqual(from);
  const f = after.logOps.filter((o) => o.op === "forceResult").at(-1)!;
  if (f.op !== "forceResult") throw new Error("no force");
  const own = new Set(f.params.tiles);
  const out: string[] = [];
  for (let i = 0; i < W * W; i++) if (!own.has(i) && after.built.heights[i] !== before.built.heights[i]) out.push(`${i % W},${Math.floor(i / W)}: ${before.built.heights[i]} -> ${after.built.heights[i]}`);
  return out;
}

describe("carrying the start leaves the force's land as the force made it (D257, D368 (9))", () => {
  it("River valley 64², seed 11: a Quake Lift under the start carries it from (17, 19); no tile the Lift left alone changes level (it was: (17, 19) rose from 1 to 6, the old bench gone)", async () => {
    const changed = await beyondTheForce("riverValley", 11, (st) => ({ verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "lift", power: 50 }, path: [{ x: Math.max(0, st.x - 15), y: st.y }, { x: Math.min(W - 1, st.x + 15), y: st.y + 1 }], side: 1, cut: null, natural: true }));
    expect(changed).toEqual([]);
  });

  // (seed 1 on M9b's maps, D148: its Canyon 64² seed 2 does not pass its checks)
  it("Canyon 64², seed 1: an Erupt (Power 40) beside the start carries it; no tile the eruption left alone changes level (it was, on seed 2 of dev's maps: (22, 13) cut from 7 to 2)", async () => {
    const changed = await beyondTheForce("canyon", 1, (st) => ({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 40 }, origin: [st.x + 2, st.y], cut: null, natural: true }));
    expect(changed).toEqual([]);
  });

  it("Islands 64², seed 6: a Craterize (Power 40) beside the start carries it; no tile the impact left alone changes level (it was: (55, 49) dropped from 2 to 1)", async () => {
    const changed = await beyondTheForce("islands", 6, (st) => ({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 40 }, origin: [st.x + 2, st.y], cut: null, natural: true }));
    expect(changed).toEqual([]);
  });
});
