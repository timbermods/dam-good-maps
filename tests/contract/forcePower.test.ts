// Size and Power (PLAN §20 D361 (1), (3)): Size sets how far a force reaches, Power how strong it is
// within that. At the largest Size, Power 0 gives the gentlest effect that still shows (D356: at least 9
// tiles change) but small: at most a quarter of Power 100's change in all (the sum of the levels every
// tile moved; a Slide, which moves land sideways, 30%: its 2-tile shift) and, where the force raises or cuts, at
// most 60% of Power 100's deepest change and no more than 4 levels; and the change grows with Power
// across 0, 50 and 100. A painted Lift answers Power while it is painted.

import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULTS as CARVE } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS, impact } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS, ERUPT_SIZE_MAX } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS, GLACIATE_SIZE_MAX } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { fixture } from "./forceFixtures";
import * as ed from "../../src/worker/session";
import { openMap } from "./forceEverywhere";

const W = 128;
let at: [number, number] = [W >> 1, W >> 1];
const mid: [number, number] = [W >> 1, W >> 1];
const fault = [{ x: 10, y: W * 0.4 }, { x: W - 10, y: W * 0.45 }];

beforeAll(async () => {
  // (River Valley 128² seed 1 since the height round, investigation/canyon-highlands-height, D148: on
  // Highlands' tall terraces the gentlest crater, eruption or glacier at the largest Size fills a
  // valley and moves more than a quarter of Power 100's on every seed tried, 5 to 10)
  const b = await openMap("riverValley", W, 1);
  let best = -1;
  for (let y = 10; y < W - 10; y += 2)
    for (let x = 10; x < W - 10; x += 2) {
      const i = y * W + x;
      if (b.water[i] > 0 || b.heights[i] <= best) continue;
      best = b.heights[i];
      at = [x, y];
    }
});

/** Each force at its largest Size (Carve's widest), the page's way (nature drawing its details). */
function request(force: string, power: number): ed.ForceRequest {
  const base = { cut: null, natural: true } as const;
  switch (force) {
    case "carve":
      return { verb: "carve", settings: { ...CARVE, power, width: 24, wander: null, walls: null, depth: null, riverDepth: 2, banks: null } as never, origin: at, ...base };
    case "craterize":
      return { verb: "craterize", settings: { ...CRATER_DEFAULTS, power, size: 180, walls: null, centre: null, debris: null, rays: null } as never, origin: mid, ...base };
    case "erupt":
      return { verb: "erupt", settings: { ...ERUPT_DEFAULTS, power, size: ERUPT_SIZE_MAX, shape: null, summit: null, flows: null, ridges: null } as never, origin: mid, ...base };
    case "glaciate":
      return { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power, size: GLACIATE_SIZE_MAX, benches: null, steps: null, tarn: null, scree: null } as never, origin: at, ...base };
    default:
      return { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: force === "quake slide" ? "slide" : "lift", power, scarp: null } as never, path: fault, side: 1, ...base };
  }
}

/** The land it shows at its end: tiles changed, the deepest change, the sum of every change. */
function change(force: string, power: number) {
  const before = ed.terrainNow().heights.slice();
  const r = ed.forceStart(request(force, power));
  expect(r.errors).toEqual([]);
  let shown = r.frame?.heights ?? before;
  for (let k = 0; k < 20000; k++) {
    const f = ed.forceAdvance(64);
    if (!f) break;
    if (f.heights) shown = f.heights;
    if (f.done) break;
  }
  ed.forceCancel();
  let tiles = 0;
  let max = 0;
  let sum = 0;
  for (let i = 0; i < shown.length; i++) {
    const d = Math.abs(shown[i] - before[i]);
    if (d) tiles++;
    max = Math.max(max, d);
    sum += d;
  }
  return { tiles, max, sum };
}

describe("Size sets the reach, Power the strength within it (D361 (3))", () => {
  for (const force of ["carve", "craterize", "erupt", "glaciate", "quake lift", "quake slide"])
    it(`${force}: at its largest Size, Power 0 is gentle but visible, and the change grows with Power`, () => {
      const [p0, p50, p100] = [0, 50, 100].map((p) => change(force, p));
      const where = `${force}: ${JSON.stringify({ p0, p50, p100 })}`;
      expect(p0.tiles, where).toBeGreaterThanOrEqual(9);
      // (a Slide moves land sideways: its gentlest is a 2-tile shift, the least that shows at a map's edge)
      expect(p0.sum, where).toBeLessThanOrEqual(p100.sum * (force === "quake slide" ? 0.3 : 0.25));
      if (force !== "quake slide") {
        expect(p0.max, where).toBeLessThanOrEqual(Math.min(4, p100.max * 0.6));
      }
      expect(p50.sum, where).toBeGreaterThan(p0.sum);
      expect(p100.sum, where).toBeGreaterThan(p50.sum);
    }, 120_000);

  it("the strength rule: full at Power 100 and at Power's own size, the square root of the natural share at Power 0", () => {
    // (an impact's: Power 0 gives a 6-tile crater, Power 50 a 48-tile one)
    const plain = fixture("plain", 64);
    const strength = (power: number, size: number | null) => impact(plain, { ...CRATER_DEFAULTS, power, size }, { origin: 32 * 64 + 32 }).strength;
    expect(strength(100, 180)).toBe(1);
    expect(strength(0, null)).toBe(1);
    expect(strength(0, 6)).toBe(1);
    expect(strength(0, 180)).toBeCloseTo(Math.sqrt(6 / 180), 6);
    expect(strength(50, 180)).toBeGreaterThan(strength(0, 180));
  });
});

describe("a painted Lift answers Power while it is painted (D361 (1))", () => {
  it("the same stroke, painted again at Power 100, lifts higher than at Power 0, and is kept with it", () => {
    const before = ed.terrainNow().heights.slice();
    const r = ed.forceStart({ ...request("quake lift", 0), painting: true } as ed.ForceRequest);
    expect(r.errors).toEqual([]);
    const lift = (h: Uint8Array) => h.reduce((m, v, i) => Math.max(m, v - before[i]), 0);
    const low = lift(r.frame!.heights!);
    const f = ed.forcePaint(fault, 1, 100)!;
    expect(lift(f.heights!)).toBeGreaterThan(low + 3);
    const u = ed.forceStop();
    expect(u.kept).toBe(true);
    expect(lift(ed.terrainNow().heights)).toBeGreaterThan(low + 3);
    ed.undo();
  });
});
