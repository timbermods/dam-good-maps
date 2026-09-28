// Starts stop looking alike (PLAN §20 D252). The start rules plant groves for Minimum starting wood
// and berry patches for Minimum starting bushes within 20 tiles' walk of the start (D85, D164,
// D227). Planted evenly on the moist land nearest the start, they made the same ring of groves and
// patches within about 10 tiles of every start. Now the map's own groves and patches come first,
// and the start rules add only what they leave short, reading the land the way the floor's wood
// does (D229): on a side and at a distance each map draws, on the kinds of place the land offers,
// with an opening of its own (the groves' species), keeping the start's yard clear where the walk
// has room. Every start still meets Minimum starting wood, Minimum starting bushes and the
// starting-logs floor (D224, D227).

import { beforeAll, describe, expect, it } from "vitest";
import { startPlantingSpread, type StartPlantingSpread } from "../../src/core/analysis/startPlanting";
import type { Feature } from "../../src/core/features/schema";
import { generate } from "../../src/core/gen/generate";
import { tilesToRuns } from "../../src/core/math/grid";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

const SIDE = 96;

interface Start {
  label: string;
  spread: StartPlantingSpread;
  checks: Record<string, boolean>;
}

/** A forest or berry patch the start rules planted, on the given tiles. */
function planted(kind: "forest" | "berryPatch", tiles: [number, number][], W: number): Feature {
  const area = tilesToRuns([...new Set(tiles.map(([x, y]) => y * W + x))].sort((a, b) => a - b), W);
  const role = kind === "forest" ? `forest/start/open/${tiles[0][1] * W + tiles[0][0]}` : `berryPatch/start/${tiles[0][1] * W + tiles[0][0]}`;
  return kind === "forest"
    ? { id: role, kind, origin: "generated", role, locked: false, params: { area, density: 1, speciesMix: { Pine: 1 }, groveSize: tiles.length, life: "auto", youngShare: 0.35 } }
    : { id: role, kind, origin: "generated", role, locked: false, params: { area, density: 1, ripeShare: 1 } };
}

describe("the measure of a start's planting (D252)", () => {
  const W = 64;
  const start = { x: 32, y: 32 };
  it("a planting all round the start within 10 tiles is a ring; one on a side is not", () => {
    // groves in every direction, 7 tiles out
    const ring: [number, number][] = [];
    for (let k = 0; k < 64; k++) {
      const a = (2 * Math.PI * k) / 64;
      ring.push([Math.round(start.x + 7 * Math.cos(a)), Math.round(start.y + 7 * Math.sin(a))]);
    }
    const r = startPlantingSpread([planted("forest", ring, W)], W, start);
    expect(r.ring).toBe(true);
    expect(r.octants).toBe(8);
    expect(r.lean).toBeLessThan(0.1);
    // the same trees on the east side, 8–14 tiles out, and a patch beside them
    const side: [number, number][] = [];
    for (let x = 40; x <= 46; x++) for (let y = 28; y <= 36; y++) side.push([x, y]);
    const s = startPlantingSpread([planted("forest", side, W), planted("berryPatch", [[44, 38], [45, 38], [44, 39]], W)], W, start);
    expect(s.ring).toBe(false);
    expect(s.octants).toBeLessThanOrEqual(3);
    expect(s.lean).toBeGreaterThan(0.9);
    expect(s.nearest).toBeGreaterThanOrEqual(8);
    expect(s.groves).toBe(1);
    expect(s.patches).toBe(1);
    expect(s.kinds).toEqual(["open"]);
  });
});

describe("the start's own planting on generated maps (PLAN §20 D252)", () => {
  const starts: Start[] = [];
  beforeAll(() => {
    for (const theme of ["riverValley", "any"] as ThemeId[])
      for (let seed = 1; seed <= 8; seed++) {
        const r = generate(makeSpec({ seed, theme, size: { x: SIDE, y: SIDE } }));
        const st = r.features.find((f) => f.kind === "start");
        const [x, y] = st && st.kind === "start" ? st.params.position : [0, 0];
        const checks: Record<string, boolean> = {};
        for (const c of r.report.checks) checks[c.id] = c.ok;
        starts.push({ label: `${theme} ${seed}`, spread: startPlantingSpread(r.features, SIDE, { x, y }), checks });
      }
  });

  it("every start still meets Minimum starting wood, Minimum starting bushes and the starting-logs floor", () => {
    for (const s of starts) for (const id of ["start.wood", "start.food", "start.wood_floor"]) expect(s.checks[id], `${s.label} ${id}`).toBe(true);
  });

  it("no two starts get the same ring: the planting leans to a side instead of surrounding the start", () => {
    // (the even planting it replaced: a mean lean of 0.36 on these starts, every yard planted up to
    // its bench)
    const lean = starts.reduce((a, s) => a + s.spread.lean, 0) / starts.length;
    expect(lean, "mean lean").toBeGreaterThan(0.45);
    const rings = starts.filter((s) => s.spread.ring).map((s) => s.label);
    expect(rings.length, `rings: ${rings.join(", ")}`).toBeLessThanOrEqual(3);
    // where the walk has room, the start's yard stays clear of its own planting
    const clear = starts.filter((s) => s.spread.nearest >= 5.5).length;
    expect(clear, "starts with a clear yard").toBeGreaterThanOrEqual(2);
  });

  it("reads the land: the groves go to several kinds of place, with openings of their own", () => {
    const kinds = new Set(starts.flatMap((s) => s.spread.kinds));
    expect(kinds.size, [...kinds].join(", ")).toBeGreaterThanOrEqual(3);
    for (const k of kinds) expect(["riverside", "across", "plateau", "valley", "open", "dead"]).toContain(k);
    // an oak-rich opening somewhere and a pine-rich one somewhere else (D164's lever)
    const mostly = (s: Start, sp: string) => {
      const all = Object.values(s.spread.species).reduce((a, b) => a + b, 0);
      return all > 0 && (s.spread.species[sp] ?? 0) > all / 2;
    };
    expect(starts.some((s) => mostly(s, "Oak")), "an oak-rich start").toBe(true);
    expect(starts.some((s) => mostly(s, "Pine")), "a pine-rich start").toBe(true);
  });
});
