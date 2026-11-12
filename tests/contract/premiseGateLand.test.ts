// The wall with one gate's stage 2 (docs/PREMISES.md §5.1; land first, story second, planning's ruling of 2026-11-11):
// its land's invariants (`gateLand.ts` `GATE_LAND_CHECKS`: the range's crest, the gap the lowest crossing, the range in
// the first frame, the dry lake's bowl, the valley held at the megadam's water, ruled land, the first frame's lip) on
// seeds 1 to 4 at 128² and seed 1 at 192² and 256², and a hand-broken ground for each. The built map, its checks and its
// water settled on the land are premiseGateLand.heavy.test.ts's.

import { describe, expect, it } from "vitest";
import { failing, PLAN_TRIES } from "../../src/core/premise/draw";
import { gateWater } from "../../src/core/premise/gateWater";
import { firstWater } from "../../src/core/premise/draw";
import { GATE_FACE_RUN, GATE_LAND_CHECKS, gateLand, gateLandFailures, gateRelief, gateZones, gorgeFaces, rangeBand, rangeBandParts } from "../../src/core/premise/gateLand";
import { gateOf, onLocal, rangeAt, turnOf, wallGate } from "../../src/core/premise/premises/wallGate";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";
import { gateWetPast } from "../../src/core/premise/gateMap";

const spec = (seed: number, side: number): MapSpec => makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });

const landOf = (s: MapSpec) => {
  const r = firstWater(wallGate, s);
  if ("reason" in r) throw new Error(r.reason);
  return { plan: r.plan, water: r.water, heights: gateLand(r.plan, r.water).heights };
};

describe("The wall with one gate's land", () => {
  // (land first: a plan whose land fails an invariant is drawn again, as the mode does (`gateMap.ts`), never forced; the
  // first plan whose land holds is found within the mode's tries)
  for (const [side, seed] of [[128, 1], [128, 2], [128, 3], [128, 4], [192, 1], [256, 1]])
    it(`holds every land invariant on a plan the mode keeps: seed ${seed} at ${side}²`, () => {
      const s = spec(seed, side);
      const refused: string[] = [];
      for (let attempt = 0; attempt < PLAN_TRIES; attempt++) {
        const plan = wallGate.draw(s, attempt);
        if ("reason" in plan || failing(wallGate.invariants, "plan", { spec: s, plan }).length) continue;
        const water = gateWater(plan);
        if (failing(wallGate.invariants, "land", { spec: s, plan, water }).length) continue;
        const f = gateLandFailures({ spec: s, plan, water, heights: gateLand(plan, water).heights });
        if (!f.length) return;
        refused.push(`${f[0].id}: ${f[0].reason}`);
      }
      expect(refused, "no plan's land held").toEqual([]);
    });

  it("keeps every tile stage 1 fixed as stage 1 laid it, but the range's own ground beside its dry beds", () => {
    const { plan, water, heights } = landOf(spec(2, 128));
    const r = water.raster;
    const { zone } = gateZones(plan);
    for (let i = 0; i < heights.length; i++) if (r.fixed[i] && zone[i] !== 1) expect(heights[i]).toBe(r.heights[i]);
  });

  // (the band `range.flat` and the column pass read: the frame's band where the relief's whole level stands over the
  // tile's foot, read once the gorge's walls are raised and the valley mended; made before them, gap tiles raised over
  // their foot stayed out of it, and the unrounded level put tiles in or out that the map's whole levels did not)
  for (const [side, seed] of [[128, 1], [128, 2], [192, 1], [256, 1]])
    it(`keeps every tile of the range's frame standing over its foot in its band, and no other: seed ${seed} at ${side}²`, () => {
      const r = firstWater(wallGate, spec(seed, side));
      if ("reason" in r) throw new Error(r.reason);
      const h = gateRelief(r.plan, r.water);
      const band = rangeBand(r.plan, r.water);
      const parts = rangeBandParts(r.plan, r.water)!;
      expect(parts).not.toBeNull();
      const out: number[] = [];
      const stray: number[] = [];
      for (let i = 0; i < h.length; i++) {
        const over = h[i] > parts.foots[i] + 0.25;
        if (parts.frame[i] && over && !band[i]) out.push(i);
        if (band[i] && !(parts.frame[i] && over)) stray.push(i);
      }
      expect(out, "frame tiles over their foot left out of the band").toEqual([]);
      expect(stray, "band tiles off the frame or not over their foot").toEqual([]);
    });
});

describe("Broken gate land fails its invariants", () => {
  const s = spec(2, 128);
  const base = landOf(s);
  const g = gateOf(base.plan)!;
  const { W, H } = base.plan;
  const r = base.water.raster;
  const T = turnOf(base.plan, g);
  const { zone } = gateZones(base.plan, g);
  const water = (i: number) => r.lake[i] || r.channel[i] || r.pool[i] || r.crest[i];
  const local = (i: number) => onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
  const gate = base.plan.links.findIndex((l) => l.id === g.gate) + 1;

  // one hand-broken ground for each land invariant, which must fail it: a drawn land always passes, so only these catch
  // an invariant that has stopped testing anything
  const broken: [id: string, what: string, breakIt: (h: Uint8Array) => void][] = [
    ["range.crest", "the range worn to one level", (h) => {
      for (let i = 0; i < W * H; i++) if (zone[i] === 1 && !water(i)) h[i] = 13;
    }],
    ["range.flat", "the range's flanks laid as terraces three levels apart, eight tiles deep", (h) => {
      const band = rangeBand(base.plan, base.water);
      for (let i = 0; i < W * H; i++) if (band[i] && !water(i)) h[i] = 9 + 3 * Math.floor(Math.abs(local(i)[1] - rangeAt(g.range, local(i)[0]).v) / 8);
    }],
    ["range.valleys", "the range worn down to its feet, the cleft's ground with it: no valley falls from it", (h) => {
      for (let i = 0; i < W * H; i++) if (zone[i] === 1 && !r.channel[i] && !r.lake[i]) h[i] = g.sill + 2;
    }],
    ["range.columns", "two-tile columns three levels over the range's flank", (h) => {
      const band = rangeBand(base.plan, base.water);
      let n = 0;
      for (let i = W * 2; i < W * H - W * 2 && n < 6; i++) {
        if (!band[i] || r.fixed[i] || water(i) || (i % W) % 9 || Math.floor(i / W) % 9) continue;
        if ([i - 1, i + 1, i + 2, i - W, i + W, i + 1 - W, i + 1 + W].some((j) => !band[j] || r.fixed[j] || water(j))) continue;
        const top = Math.max(h[i - 1], h[i + 2], h[i - W], h[i + W], h[i + 1 - W], h[i + 1 + W]) + 3;
        h[i] = top;
        h[i + 1] = top;
        n++;
      }
    }],
    ["gate.lowest", "the Gate's gorge filled to the crest", (h) => {
      for (let i = 0; i < W * H; i++) if (r.channel[i] === gate && zone[i] === 1) h[i] = g.crest;
    }],
    ["wall.camera", "the range worn down to its foot", (h) => {
      for (let i = 0; i < W * H; i++) if (zone[i] === 1 && !water(i)) h[i] = g.sill + 2;
    }],
    ["basin.bowl", "the dry lake's pan filled", (h) => {
      const [px, py] = g.pan.at;
      for (let i = 0; i < W * H; i++) if (!r.fixed[i] && (i % W - px) ** 2 + (Math.floor(i / W) - py) ** 2 < (g.pan.r + 2) ** 2) h[i] = g.sill + 3;
    }],
    ["basin.playa", "the basin's floor raised four over its pan", (h) => {
      for (let i = 0; i < W * H; i++) if (zone[i] === 2 && !r.fixed[i] && h[i] <= g.pan.level + 2) h[i] = g.pan.level + 4;
    }],
    ["valley.enclosed", "a cut through the range to the megadam's water beside the lake", (h) => {
      const lake = base.plan.bodies.findIndex((b) => b.id === g.lake) + 1;
      let at = -1;
      for (let i = 0; i < W * H && at < 0; i++) if (r.lake[i] === lake) at = i;
      const u0 = local(at)[0];
      for (let i = 0; i < W * H; i++) if (!water(i) && Math.abs(local(i)[0] - u0) < 2 && local(i)[1] < rangeAt(g.range, u0).v + 4) h[i] = Math.min(h[i], g.megadam);
    }],
    ["terrain.ruled_land", "the basin laid in bands along the grid", (h) => {
      for (let i = 0; i < W * H; i++) if (zone[i] === 2 && !r.fixed[i]) h[i] = 5 + 2 * (Math.floor((i % W) / 6) % 2);
    }],
    ["frame.lip", "the start's ground broken up for 6 tiles round it (stage 3 moves the start up to 4)", (h) => {
      const st = base.plan.frame.start;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) h[(st.y + dy) * W + st.x + dx] = st.z + ((st.x + dx + st.y + dy) & 1);
    }],
  ];

  it("has one broken ground for every land invariant", () => {
    expect([...broken.map(([id]) => id), "bench.shore"].sort()).toEqual(GATE_LAND_CHECKS.map((x) => x.id).sort());
  });

  it("bench.shore: a moat drawn round the start's bench", () => {
    const st = base.plan.frame.start;
    const lake = Uint8Array.from(r.lake);
    for (let i = 0; i < W * H; i++) {
      const d = Math.max(Math.abs((i % W) - st.x), Math.abs(Math.floor(i / W) - st.y));
      if (d === 9 && base.heights[i] === st.z) lake[i] = 1;
    }
    const water = { ...base.water, raster: { ...r, lake } };
    // (the bench stands inside the moat: its edge's water seen from the start spans the whole turn)
    const h = Uint8Array.from(base.heights);
    for (let i = 0; i < W * H; i++) if (Math.max(Math.abs((i % W) - st.x), Math.abs(Math.floor(i / W) - st.y)) < 9 && !r.lake[i] && !r.channel[i]) h[i] = st.z;
    expect(gateLandFailures({ spec: s, plan: base.plan, water, heights: h }).map((f) => f.id)).toContain("bench.shore");
  });

  for (const [id, what, breakIt] of broken)
    it(`${id}: ${what}`, () => {
      const h = Uint8Array.from(base.heights);
      breakIt(h);
      expect(gateLandFailures({ spec: s, plan: base.plan, water: base.water, heights: h }).map((f) => f.id)).toContain(id);
    });
});

describe("gate.settled: the Gate dry past its rows on the settled map (`gateMap.ts` `gateWetPast`, a plan refused when over 0)", () => {
  const s = spec(2, 128);
  const r = firstWater(wallGate, s);
  if ("reason" in r) throw new Error(r.reason);
  const g = gateOf(r.plan)!;
  const raster = r.water.raster;
  const gi = r.plan.links.findIndex((l) => l.id === g.gate) + 1;
  const past = Math.max(...r.plan.links[gi - 1].rows) + 1;

  it("counts none on a dry settle, and water held in the Gate before its rows (the lake's side) none", () => {
    const depth = new Float64Array(raster.W * raster.H);
    expect(gateWetPast(r.plan, r.water, depth)).toBe(0);
    for (let i = 0; i < depth.length; i++) if (raster.channel[i] === gi && raster.along[i] < past) depth[i] = 0.4;
    expect(gateWetPast(r.plan, r.water, depth)).toBe(0);
  });

  it("broken: water standing in the Gate past its rows is counted, so the plan is refused", () => {
    const depth = new Float64Array(raster.W * raster.H);
    for (let i = 0; i < depth.length; i++) if (raster.channel[i] === gi && raster.along[i] > past + 2) depth[i] = 0.1;
    expect(gateWetPast(r.plan, r.water, depth)).toBeGreaterThan(0);
  });
});

describe("gorgeFaces: the longest straight face over three levels on the range and the gorge (a measure, not a check)", () => {
  const s = spec(1, 128);
  const r = firstWater(wallGate, s);
  if ("reason" in r) throw new Error(r.reason);
  gateLand(r.plan, r.water);
  const { W, H } = r.plan;
  const ras = r.water.raster;
  const g = gateOf(r.plan)!;
  const band = rangeBand(r.plan, r.water);
  const gi = r.plan.links.findIndex((l) => l.id === g.gate) + 1;
  const vi = r.plan.links.findIndex((l) => l.id === g.veil) + 1;
  const flat = () => new Uint8Array(W * H).fill(10);
  // (a stretch of `n` tiles along a row, it and the row under it on `ok` ground)
  const rowRun = (n: number, ok: (i: number) => boolean): [number, number] => {
    for (let y = 1; y + 2 < H; y++)
      for (let x = 1; x + n + 1 < W; x++) {
        let all = true;
        for (let k = -1; k <= n && all; k++) all = ok(y * W + x + k) && ok((y + 1) * W + x + k);
        if (all) return [x, y];
      }
    throw new Error("no stretch");
  };
  const far = (i: number, mark: (j: number) => boolean, d: number) => {
    const x = i % W;
    const y = Math.floor(i / W);
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (mark((y + dy) * W + x + dx)) return false;
    return true;
  };
  const isVeil = (j: number) => ras.channel[j] === vi || !!ras.crest[j];
  const isGate = (j: number) => ras.channel[j] === gi;

  it("reads a straight face of five levels, ten tiles long, on the range as ten; none on level ground", () => {
    const h = flat();
    expect(gorgeFaces(r.plan, r.water, h).run).toBe(0);
    const [x, y] = rowRun(10, (i) => band[i] === 1 && far(i, isVeil, 6) && far(i, isGate, 6) && !ras.lake[i] && !ras.channel[i]);
    for (let k = 0; k < 10; k++) h[(y + 1) * W + x + k] = 15;
    expect(gorgeFaces(r.plan, r.water, h).run).toBe(10);
    expect(10).toBeGreaterThan(GATE_FACE_RUN);
  });

  it("leaves out the Veil's own drop and the Gate's bar, laid on purpose", () => {
    // (the Veil's lip: a face along it, its tiles at the crest, the ground in front five lower)
    const h = flat();
    for (const i of ras.lips[g.veil] ?? []) h[i] = 15;
    expect(gorgeFaces(r.plan, r.water, h).run).toBeLessThanOrEqual(1);
    // (the Gate's head: its bar's tiles five over the ground beside them)
    const b = flat();
    const barEnd = Math.max(...(r.plan.links[gi - 1].rows ?? [0])) + 2;
    for (let i = 0; i < W * H; i++) if (ras.channel[i] === gi && ras.along[i] <= barEnd) b[i] = 15;
    expect(gorgeFaces(r.plan, r.water, b).run).toBe(0);
  });
});
