// The water the hydrology planned, as the land holds it (D363's measures; what the start and the mine
// sites' room are judged on): a lake planned to its
// outlet over a rim its land spills lower stands at that rim (Canyon 96² seed 16), a planned lake the
// land holds no water in is a film, and a river on a flat floodplain runs as a thin sheet the width
// of the flat (River Valley 96² seed 33).
import { describe, expect, it } from "vitest";
import type { RiverFeature } from "../../src/core/features/schema";
import { plannedWater } from "../../src/core/gen/generate";
import type { Hydro } from "../../src/core/land/hydro";

const W = 24;
const H = 24;
const N = W * H;

function hydro(over: Partial<Hydro>): Hydro {
  return { rivers: [], water: new Uint8Array(N), lakes: [], falls: [], arms: [], flowTotal: 0, ...over } as Hydro;
}

describe("the planned water as the land holds it", () => {
  it("stands a lake no higher than the rim its land spills over", () => {
    // (upland at 6; a basin at 3, its rim lower at one tile (4), a gully at 2 beyond it to the edge)
    const h = new Uint8Array(N).fill(6);
    const tiles: number[] = [];
    for (let y = 8; y <= 14; y++)
      for (let x = 8; x <= 14; x++) {
        h[y * W + x] = 3;
        tiles.push(y * W + x);
      }
    h[11 * W + 15] = 4;
    for (let x = 16; x < W; x++) h[11 * W + x] = 2;
    const water = new Uint8Array(N);
    for (const i of tiles) water[i] = 2;
    const hy = hydro({ water, lakes: [{ tiles, outletBed: 6 } as unknown as Hydro["lakes"][number]] });
    const held = plannedWater(h, hy, W, H, true);
    for (const i of tiles) expect(held[i]).toBeCloseTo(4.3 - 3, 5);
    // (as planned, to its outlet: what the edge lips are raised to hold)
    const planned = plannedWater(h, hy, W, H);
    for (const i of tiles) expect(planned[i]).toBeCloseTo(6.6 - 3, 5);
    // (and a planned lake tile its land holds no water on is a film, never deep enough to pump from)
    h[11 * W + 15] = 2;
    const open = plannedWater(h, hy, W, H, true);
    for (const i of tiles) expect(open[i]).toBeLessThan(0.3);
  });

  it("runs a river over a flat floodplain as a sheet the width of the flat", () => {
    const river: RiverFeature = {
      id: "r",
      kind: "river",
      origin: "generated",
      locked: false,
      params: { path: [[-1, 12], [24, 12]], width: 3, bedDepth: 1, bedProfile: { start: 4, steps: [] }, flow: 2.5, style: "straight", entry: { edge: "west" }, exit: { edge: "east" }, badwater: false },
    };
    const water = new Uint8Array(N);
    for (let x = 0; x < W; x++) for (let y = 11; y <= 13; y++) water[y * W + x] = 1;
    // (a channel cut in a plain: its banks a level over it)
    const cut = new Uint8Array(N).fill(5);
    for (let x = 0; x < W; x++) for (let y = 11; y <= 13; y++) cut[y * W + x] = 4;
    const inChannel = plannedWater(cut, hydro({ rivers: [river], water }), W, H, true)[12 * W + 10];
    expect(inChannel).toBeGreaterThan(0.3);
    // (the same river on a floodplain 15 tiles wide at its bed's level: a sheet)
    const flat = cut.slice();
    for (let x = 0; x < W; x++) for (let y = 5; y <= 19; y++) flat[y * W + x] = 4;
    const onFlat = plannedWater(flat, hydro({ rivers: [river], water }), W, H, true)[12 * W + 10];
    expect(onFlat).toBeLessThan(inChannel);
    expect(onFlat).toBeLessThan(0.3);
  });
});
