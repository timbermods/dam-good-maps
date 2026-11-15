// The springs' search and the film rule of the Real places tool (tools/lib/placeFeeds.ts, tools/lib/placeWater.ts;
// D(new), D(new-films)): on a made-up settle, so each step's rule is seen alone.

import { describe, expect, it } from "vitest";
import { films, FILM_THIN_SHARE } from "../../tools/lib/placeWater";
import { realParts, searchFeeds } from "../../tools/lib/placeFeeds";
import type { PlaceData } from "../../src/core/places/place";

const W = 20;
const H = 20;
const place = (sources: [number, number, number][]): PlaceData => ({ W, H, sources }) as unknown as PlaceData;

describe("a film is a body thin on 90 % of its tiles (D(new-films))", () => {
  it("a few deeper tiles where its spring rises do not unmake it", () => {
    const depth = new Float64Array(W * H);
    const floor = new Float64Array(W * H).fill(3);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) depth[y * W + x] = 0.07;
    for (let k = 0; k < 5; k++) depth[k] = 0.4;
    expect(films(depth, floor, W, H).map((f) => f.tiles.length)).toEqual([120]);
    // past the share it is a pool, not a film
    for (let k = 0; k < Math.ceil(120 * (1 - FILM_THIN_SHARE)) + 1; k++) depth[k] = 0.4;
    expect(films(depth, floor, W, H)).toEqual([]);
  });

  it("the water over real dry land splits into the floor-0 sheet and the rest, keeping its total", () => {
    const depth = new Float64Array(W * H);
    const floor = new Float64Array(W * H).fill(2);
    const real = new Uint8Array(W * H);
    for (let y = 0; y < 10; y++) for (let x = 0; x < W; x++) (depth[y * W + x] = 0.08), (floor[y * W + x] = 0);
    for (let x = 0; x < W; x++) depth[15 * W + x] = 0.3;
    for (let x = 0; x < 5; x++) real[15 * W + x] = 1;
    expect(realParts(depth, floor, W, H, real)).toEqual({ real: 5, dry: 215, sheet: 200, rest: 15 });
  });
});

/** A settle where each source wets its own tiles: `wet[k]` real-water tiles and `dry[k]` dry-land tiles, by where it stands. */
function settleOf(spots: Record<string, { real: number; dry: number }>) {
  const real = new Uint8Array(W * H);
  for (let i = 0; i < 200; i++) real[i] = 1;
  let r = 0;
  let d = 200;
  const tiles: Record<string, { real: number[]; dry: number[] }> = {};
  for (const [k, s] of Object.entries(spots)) tiles[k] = { real: Array.from({ length: s.real }, () => r++), dry: Array.from({ length: s.dry }, () => d++) };
  return {
    real,
    settle: (p: PlaceData) => {
      const depth = new Float64Array(W * H);
      for (const [x, y] of p.sources) for (const i of [...(tiles[`${x},${y}`]?.real ?? []), ...(tiles[`${x},${y}`]?.dry ?? [])]) depth[i] = 0.5;
      return depth;
    },
  };
}

describe("the springs' search (D(new-films))", () => {
  it("drops sources together where no single drop gains: two that wet the same dry land", () => {
    // a and b each wet the same 30 dry tiles (dropping one leaves the other's), c holds the real water
    const real = new Uint8Array(W * H);
    for (let i = 0; i < 40; i++) real[i] = 1;
    const settle = (p: PlaceData) => {
      const depth = new Float64Array(W * H);
      const at = new Set(p.sources.map(([x, y]) => `${x},${y}`));
      if (at.has("1,1")) for (let i = 0; i < 40; i++) depth[i] = 0.5;
      if (at.has("5,15") || at.has("6,15")) for (let i = 300; i < 330; i++) depth[i] = 0.5;
      if (at.has("9,15")) for (let i = 330; i < 340; i++) depth[i] = 0.5;
      return depth;
    };
    const r = searchFeeds(place([[1, 1, 1], [5, 15, 1], [6, 15, 1], [9, 15, 1]]), real, settle, () => null);
    // (the best group is the three that wet only dry land)
    expect(r.after).toEqual({ real: 40, dry: 0 });
    expect(r.steps.map((s) => s.kind)).toEqual(["group"]);
    expect(r.place.sources.map(([x, y]) => `${x},${y}`)).toEqual(["1,1"]);
  });

  it("a group the caller refuses (the start loses its water) is not kept", () => {
    const real = new Uint8Array(W * H);
    for (let i = 0; i < 40; i++) real[i] = 1;
    const settle = (p: PlaceData) => {
      const depth = new Float64Array(W * H);
      const at = new Set(p.sources.map(([x, y]) => `${x},${y}`));
      if (at.has("1,1")) for (let i = 0; i < 40; i++) depth[i] = 0.5;
      if (at.has("5,15") || at.has("6,15")) for (let i = 300; i < 330; i++) depth[i] = 0.5;
      return depth;
    };
    const keep = (p: PlaceData) => (p.sources.some(([x]) => x === 5 || x === 6) ? null : "start.water");
    const r = searchFeeds(place([[1, 1, 1], [5, 15, 1], [6, 15, 1]]), real, settle, keep);
    expect(r.steps.filter((s) => s.kind === "group")).toEqual([]);
    expect(r.refused.some((x) => x.why === "start.water")).toBe(true);
  });

  it("a place with no real water takes one spring for all where the turns alone gain nothing (D245's water floor)", () => {
    // its two springs wet the same 50 dry tiles (neither alone, nor a weaker one, gains); the spring by the start wets 5
    const real = new Uint8Array(W * H);
    const settle = (p: PlaceData) => {
      const depth = new Float64Array(W * H);
      const at = new Set(p.sources.map(([x, y]) => `${x},${y}`));
      if (at.has("2,2") || at.has("4,4")) for (let i = 100; i < 150; i++) depth[i] = 0.5;
      if (at.has("12,12")) for (let i = 200; i < 205; i++) depth[i] = 0.5;
      return depth;
    };
    const r = searchFeeds(place([[2, 2, 1], [4, 4, 1]]), real, settle, () => null, { springs: () => [[[12, 12, 1]]] });
    expect(r.steps.map((s) => s.kind)).toEqual(["one spring"]);
    expect(r.place.sources).toEqual([[12, 12, 1]]);
    expect(r.after.dry).toBe(5);
  });

  it("a group never costs real water, where a turn may cost a little", () => {
    // dropping b and c together gains 29 but loses b's one real-water tile; each alone gains under 20
    const { real, settle } = settleOf({ "2,2": { real: 30, dry: 0 }, "4,4": { real: 1, dry: 15 }, "6,6": { real: 0, dry: 15 } });
    const r = searchFeeds(place([[2, 2, 1], [4, 4, 1], [6, 6, 1]]), real, settle, () => null);
    expect(r.steps).toEqual([]);
    expect(r.after).toEqual(r.before);
  });
});
