// Small hand-built maps for the water's release-gate tests (D385; investigation/release-gate-core):
// a height field written as a .timber file and opened through MapSession.importMap, so every test
// runs through the session's public entry points (operations, undo, settle, export, project), never
// the water's internals.

import { MapSession } from "../../src/core/doc/session";
import { buildMap } from "../../src/core/features/build";
import { writeTimber } from "../../src/core/format/timber";
import { toTimberFile } from "../../src/core/gen/pack";
import { makeSpec } from "../../src/core/spec/mapspec";
import { TICKS_PER_DAY, WaterSim } from "../../src/core/sim/water";

/** A session on a W×H map of the given heights, nothing on it. */
export function openHeights(W: number, H: number, heights: Uint8Array): MapSession {
  const built = buildMap({ W, H, seed: 1, features: [], base: { heights, columns: new Map(), entities: [] } });
  const bytes = writeTimber(toTimberFile(makeSpec({ seed: 1, theme: "highlands", size: { x: W, y: H } }), built));
  return MapSession.importMap(bytes, "synthetic.timber");
}

/** Runs [y, x0, x1] over a rectangle. */
export function rect(x0: number, y0: number, x1: number, y1: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let y = y0; y <= y1; y++) out.push([y, x0, x1]);
  return out;
}

/** The tiles (y·W + x) of a rectangle. */
export function tilesOf(W: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * W + x);
  return out;
}

/** The game's rules run on the water the session stores (what the file holds), for `ticks`. */
export function gameRun(s: MapSession, ticks: number): WaterSim {
  const b = s.built;
  const sim = new WaterSim(b.waterModel, { depth: b.water.slice(), contamination: b.contamination.slice() });
  if (b.settle.out) sim.setOut(b.settle.out);
  sim.run(ticks);
  return sim;
}

export { TICKS_PER_DAY };

/** A clean water source placed by operation (its id from its tile, so runs repeat exactly). */
export function sourceOp(x: number, y: number, strength: number) {
  const id = `0badc0de-0000-4000-8000-${String(x * 1000 + y).padStart(12, "0")}`;
  return { op: "placeEntity" as const, params: { id, template: "WaterSource", x, y, orientation: "Cw0" as const, components: { WaterSource: { SpecifiedStrength: strength, CurrentStrength: strength } } } };
}
