// The High look (Map look 2, PLAN §20 D284; D241, D242, D250): the Standard shaders stay exactly as
// they are (the High additions go in only at named points, and only into High's own materials);
// every High effect has its switch; the automatic choice steps down to High's lower-cost tier and
// then to Standard when frames stay too slow (never on one slow spell, never back up by itself) and
// remembers where it settled per GPU and size; the water's flow is estimated from its surface
// (downhill, still where level) and its contamination is smoothed within one surface only; the new
// trees are placed the same way every time and switch models with the camera; the landmarks keep
// the objects' bookkeeping. The pixels are compared on a GPU by tools/capture-high.ts.

import { describe, expect, it } from "vitest";
import { DataTexture, InstancedBufferAttribute, PerspectiveCamera, ShaderMaterial } from "three";
import { fallMaterial, objectMaterial, sceneUniforms, skyMaterial, terrainMaterial, waterMaterial } from "../../src/render3d/materials";
import { entityView, surfaceWater, waterFromDepth, DEAD } from "../../src/render3d/model";
import { allEffects, effectiveEffects, effectsFrom, HIGH_EFFECTS, LOWER_COST_DROPS } from "../../src/render3d/high/effects";
import { LIMITS, LookGovernor, startTier } from "../../src/render3d/high/fallback";
import { roughWater, surfaceContamination, surfaceFlow } from "../../src/render3d/high/flow";
import { Forest, isPlant, replacedBatch } from "../../src/render3d/high/forest";
import { buildLandmarks, landmarkKind } from "../../src/render3d/high/landmarks";
import { fallHooks, landmarkHooks, objectHooks, skyHooks, SWITCHES, terrainHooks, vegetationHooks, waterHooks } from "../../src/render3d/high/shaders";
import { buildEntities } from "../../src/render3d/entities3d";

const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
const U = () => sceneUniforms(1, 1, tex(), tex(), tex(), tex());
const source = (m: ShaderMaterial) => `${m.vertexShader}\n${m.fragmentShader}`;

describe("the Standard look's shaders", () => {
  it("are the same with the hooks left empty as without them, in both looks", () => {
    for (const lite of [false, true]) {
      const u = U();
      expect(source(terrainMaterial(u, 0, 1, lite, {}))).toBe(source(terrainMaterial(u, 0, 1, lite)));
      expect(source(waterMaterial(u, lite, {}))).toBe(source(waterMaterial(u, lite)));
      expect(source(fallMaterial(u, lite, {}))).toBe(source(fallMaterial(u, lite)));
      expect(source(objectMaterial(u, lite, {}))).toBe(source(objectMaterial(u, lite)));
    }
    expect(source(skyMaterial({}))).toBe(source(skyMaterial()));
  });

  it("hold none of the High look's code", () => {
    const u = U();
    for (const m of [terrainMaterial(u, 0, 1), waterMaterial(u), fallMaterial(u), objectMaterial(u), skyMaterial(), terrainMaterial(u, 0, 1, true)]) {
      const s = source(m);
      expect(s).not.toMatch(/\bhl[A-Z]\w*|bakedSunLit|measuredSurfaceWater|vegPalette|ambientVisibility/);
    }
  });
});

describe("the High look's shaders", () => {
  it("put every addition in at its point", () => {
    const u = U();
    const cases: [ShaderMaterial, ReturnType<typeof terrainHooks>][] = [
      [terrainMaterial(u, 0, 1, false, terrainHooks()), terrainHooks()],
      [waterMaterial(u, false, waterHooks()), waterHooks()],
      [fallMaterial(u, false, fallHooks()), fallHooks()],
      [objectMaterial(u, false, objectHooks()), objectHooks()],
      [objectMaterial(u, false, vegetationHooks(9)), vegetationHooks(9)],
      [skyMaterial(skyHooks()), skyHooks()],
    ];
    for (const [m, hooks] of cases) {
      const s = source(m);
      for (const [k, text] of Object.entries(hooks)) expect(s.includes(text as string), k).toBe(true);
    }
  });

  it("keep the baked shadow for when soft shadows are off", () => {
    const s = terrainMaterial(U(), 0, 1, false, terrainHooks()).fragmentShader;
    expect(s).toMatch(/float bakedSunLit\(vec2 g, float z\)/);
    expect(s).toMatch(/float sunLit\(vec2 g, float z\)/);
    expect(s).toMatch(/if \(hlShadows < 0\.5\) lit = bakedSunLit\(g, z\)/);
  });

  it("have a switch for each effect that needs one in a shader", () => {
    const all = [terrainHooks(), waterHooks(), fallHooks(), objectHooks(), landmarkHooks(), skyHooks()].map((h) => Object.values(h).join("\n")).join("\n");
    for (const k of SWITCHES) expect(all, k).toContain(k);
  });
});

describe("the effects", () => {
  it("are all on by default, each switchable, and remembered as those switched off", () => {
    const e = allEffects();
    expect(Object.values(e).every(Boolean)).toBe(true);
    expect(HIGH_EFFECTS.length).toBe(new Set(HIGH_EFFECTS.map((x) => x.key)).size);
    const off = effectsFrom(["shadows", "sway", "not-an-effect"]);
    expect(off.shadows).toBe(false);
    expect(off.sway).toBe(false);
    expect(off.water).toBe(true);
  });

  it("lose only what the lower-cost tier drops, and keep the player's own switches", () => {
    const chosen = { ...allEffects(), haze: false };
    const lower = effectiveEffects(chosen, true);
    for (const k of LOWER_COST_DROPS) expect(lower[k]).toBe(false);
    expect(lower.haze).toBe(false);
    expect(lower.water).toBe(true);
    expect(effectiveEffects(chosen, false)).toEqual(chosen);
  });
});

describe("the automatic choice (the fallback)", () => {
  const run = (g: LookGovernor, ms: number, frames: number, t0: number) => {
    let t = t0;
    for (let k = 0; k < frames; k++) g.sample(ms, (t += 16));
    return t;
  };

  it("keeps High while frames are quick", () => {
    const g = new LookGovernor("high");
    run(g, 8, 1000, 0);
    expect(g.tier).toBe("high");
  });

  it("steps down to the lower-cost tier, then to Standard, when frames stay too slow", () => {
    const g = new LookGovernor("high");
    let t = run(g, LIMITS.lowerAt + 5, LIMITS.window * LIMITS.strikes, 0);
    expect(g.tier).toBe("lower");
    // (frames right after stepping down don't count: the grace period)
    t = run(g, LIMITS.standardAt + 10, LIMITS.window * LIMITS.strikes, t);
    expect(g.tier).toBe("lower");
    t = run(g, LIMITS.standardAt + 10, 200, t + LIMITS.grace);
    t = run(g, LIMITS.standardAt + 10, LIMITS.window * LIMITS.strikes, t);
    expect(g.tier).toBe("standard");
    // and never back up by itself
    run(g, 2, 1000, t);
    expect(g.tier).toBe("standard");
  });

  it("never steps down for one slow spell", () => {
    const g = new LookGovernor("high");
    let t = run(g, 60, LIMITS.window, 0);
    t = run(g, 8, LIMITS.window, t);
    run(g, 60, LIMITS.window, t);
    expect(g.tier).toBe("high");
  });

  it("ignores frames in the grace period after a new map or a change of look", () => {
    const g = new LookGovernor("high");
    g.hold(0);
    run(g, 100, LIMITS.window * LIMITS.strikes, 0);
    expect(g.tier).toBe("high");
  });

  it("leaves High at once, on its first reading, for a GPU far too slow for it", () => {
    expect(new LookGovernor("high").probe([5, 6, 7, 6, 5])).toBe("high");
    expect(new LookGovernor("high").probe([40, 41, 39, 40, 42])).toBe("lower");
    expect(new LookGovernor("high").probe([80, 90, 85, 88, 86])).toBe("standard");
    expect(new LookGovernor("lower").probe([40, 41, 39, 40, 42])).toBe("lower");
  });

  it("starts where it settled last time on the same GPU at about the same size", () => {
    const saved = { gpu: "GPU A", pixels: 1_000_000, tier: "standard" as const };
    expect(startTier("GPU A", 1_100_000, saved)).toBe("standard");
    expect(startTier("GPU B", 1_000_000, saved)).toBe("high");
    expect(startTier("GPU A", 2_500_000, saved)).toBe("high");
    expect(startTier("GPU A", 1_000_000, null)).toBe("high");
  });
});

describe("the water's flow (estimated from its surface)", () => {
  /** A channel along x, its surface falling eastward, beside a level lake. */
  const scene = () => {
    const W = 12;
    const H = 6;
    const heights = new Uint8Array(W * H);
    const depth = new Float32Array(W * H);
    const cont = new Float32Array(W * H);
    for (let x = 0; x < W; x++) {
      // the channel, rows 1–2: ground stepping down eastward, water a level deep on it
      for (const y of [1, 2]) {
        heights[y * W + x] = 4;
        depth[y * W + x] = 1 - x * 0.03;
      }
      // the lake, rows 4–5: level
      for (const y of [4, 5]) {
        heights[y * W + x] = 2;
        depth[y * W + x] = 1;
        cont[y * W + x] = x < 6 ? 1 : 0;
      }
    }
    const view = waterFromDepth(heights, depth, cont);
    return { W, H, heights, sw: surfaceWater(W, H, view) };
  };

  it("runs downhill in a channel and holds still in a level lake", () => {
    const { W, H, sw } = scene();
    const v = surfaceFlow(W, H, sw);
    const at = (x: number, y: number) => [v[(y * W + x) * 2], v[(y * W + x) * 2 + 1]];
    expect(at(5, 1)[0]).toBeGreaterThan(0.3);
    expect(Math.abs(at(5, 1)[1])).toBeLessThan(0.05);
    expect(at(5, 4)).toEqual([0, 0]);
    // dry ground has none
    expect(at(5, 3)).toEqual([0, 0]);
  });

  it("holds a lake still though its surface falls a hair, as a settled lake's does (under 2.5 × 10⁻⁴ a tile)", () => {
    const W = 10;
    const H = 3;
    const heights = new Uint8Array(W * H).fill(2);
    const depth = Float32Array.from({ length: W * H }, (_, i) => 2 - (i % W) * 1e-4);
    const sw = surfaceWater(W, H, waterFromDepth(heights, depth, new Float32Array(W * H)));
    expect(surfaceFlow(W, H, sw).every((v) => v === 0)).toBe(true);
  });

  it("smooths contamination into a soft front, through water on the same surface only", () => {
    const { W, H, sw } = scene();
    const c = surfaceContamination(W, H, sw);
    // the front in the lake is soft: between clean and bad over a few tiles
    expect(c[4 * W + 5]).toBeGreaterThan(0.5);
    expect(c[4 * W + 5]).toBeLessThan(1);
    expect(c[4 * W + 6]).toBeGreaterThan(0);
    expect(c[4 * W + 6]).toBeLessThan(0.5);
    // pure water stays pure, and the clean channel above takes none of it
    expect(c[4 * W + 0]).toBeCloseTo(1, 5);
    expect(c[4 * W + 11]).toBeCloseTo(0, 5);
    for (let x = 0; x < W; x++) expect(c[1 * W + x]).toBe(0);
  });

  it("finds no rough water in a gentle river, and some below a fall", () => {
    const { W, H, heights, sw } = scene();
    const calm = roughWater(W, H, heights, sw, surfaceFlow(W, H, sw));
    expect(calm.counts.falls).toBe(0);
    // a fall: the channel's east half a level and a half lower
    const h2 = heights.slice();
    const d2 = new Float32Array(W * H);
    for (let x = 0; x < W; x++)
      for (const y of [1, 2]) {
        h2[y * W + x] = x < 6 ? 6 : 4;
        d2[y * W + x] = 0.6;
      }
    const sw2 = surfaceWater(W, H, waterFromDepth(h2, d2, new Float32Array(W * H)));
    const rough = roughWater(W, H, h2, sw2, surfaceFlow(W, H, sw2));
    expect(rough.counts.falls).toBeGreaterThan(0);
  });
});

describe("the new trees and bushes (#66)", () => {
  const view = entityView([
    { template: "Pine", x: 3, y: 4, z: 2, orientation: "Cw0", owner: "t" },
    { template: "Oak", x: 5, y: 4, z: 2, orientation: "Cw0", owner: "t" },
    { template: "Birch", x: 7, y: 4, z: 2, orientation: "Cw0", owner: "t", dead: true },
    { template: "BlueberryBush", x: 9, y: 4, z: 2, orientation: "Cw0", owner: "t" },
    { template: "Succulent", x: 11, y: 4, z: 2, orientation: "Cw0", owner: "t" },
    { template: "RuinColumnH3", x: 13, y: 4, z: 2, orientation: "Cw0", owner: "t" },
  ])
  const material = new ShaderMaterial();

  it("replace pine, birch, oak and blueberry bushes, dead or alive, and nothing else", () => {
    expect(["Pine", "Birch", "Oak", "BlueberryBush"].every(isPlant)).toBe(true);
    expect(isPlant("Succulent")).toBe(false);
    expect(replacedBatch("Pine.dead")).toBe(true);
    expect(replacedBatch("Succulent")).toBe(false);
    const f = new Forest(view, material);
    f.layout();
    expect(f.stats.plants).toBe(4);
    const drawn = f.meshes.flatMap((m) => Array.from(m.userData.objects as Int32Array).slice(0, m.count));
    expect(drawn.sort()).toEqual([0, 1, 2, 3]);
    // the dead birch is drawn by a dead batch, and grows from afar with Markers as dead trees do
    const deadMesh = f.meshes.find((m) => m.name.includes("Birch.dead") && m.count > 0)!;
    expect((deadMesh.geometry.getAttribute("grow") as InstancedBufferAttribute).getX(0)).toBe(14);
    expect(view.flags[2] & DEAD).toBeTruthy();
  });

  it("stand in the same place every time, within their tile", () => {
    const a = new Forest(view, material);
    const b = new Forest(view, material);
    a.layout();
    b.layout();
    for (let k = 0; k < a.meshes.length; k++) expect(Array.from(a.meshes[k].instanceMatrix.array)).toEqual(Array.from(b.meshes[k].instanceMatrix.array));
    for (const m of a.meshes)
      for (let i = 0; i < m.count; i++) {
        const e = m.instanceMatrix.array;
        const k = (m.userData.objects as Int32Array)[i];
        expect(Math.abs(e[i * 16 + 12] - (view.x[k] + 0.5))).toBeLessThan(0.08);
        expect(Math.abs(-e[i * 16 + 14] - (view.y[k] + 0.5))).toBeLessThan(0.08);
      }
  });

  it("switch to their close-up models near the camera and back from afar, keeping every plant", () => {
    const f = new Forest(view, material);
    const cam = new PerspectiveCamera(40, 1, 0.1, 1000);
    cam.position.set(6, 8, 2);
    cam.lookAt(6, 2, -4.5);
    cam.updateMatrixWorld();
    expect(f.update(cam, 800, true)).toBe(true);
    expect(f.stats.near).toBe(4);
    cam.position.set(6, 400, 300);
    cam.lookAt(6, 2, -4.5);
    cam.updateMatrixWorld();
    f.update(cam, 800, true);
    expect(f.stats.far).toBe(4);
    // the lower-cost tier: far models only
    cam.position.set(6, 8, 2);
    cam.lookAt(6, 2, -4.5);
    cam.updateMatrixWorld();
    f.update(cam, 800, false);
    expect(f.stats.near).toBe(0);
    expect(f.stats.far).toBe(4);
  });
});

describe("the landmarks (#67 stage 3)", () => {
  it("replace the landmark objects' batches with their own, keeping each instance's object and ground", () => {
    const view = entityView([
      { template: "RuinColumnH3", x: 3, y: 4, z: 2, orientation: "Cw0", owner: "t" },
      { template: "SmallRelic", x: 6, y: 4, z: 2, orientation: "Cw0", owner: "t" },
      { template: "Blockage", x: 9, y: 4, z: 2, orientation: "Cw0", owner: "t" },
      { template: "NaturalDam", x: 11, y: 4, z: 2, orientation: "Cw0", owner: "t" },
      { template: "Pine", x: 13, y: 4, z: 2, orientation: "Cw0", owner: "t" },
    ])
    const material = new ShaderMaterial();
    const { group } = buildEntities(view, material);
    const out = buildLandmarks(group, view, material, material);
    const names = out.map((r) => r.fresh.name).sort();
    expect(names).toContain("high.SmallRelic");
    expect(names).toContain("high.Blockage");
    expect(names).toContain("high.NaturalDam");
    expect(names.some((n) => n === "high.RuinColumnH3")).toBe(true);
    // the mixed rubble batch split by kind; each instance keeps its object
    for (const { fresh } of out) {
      const objects = fresh.userData.objects as Int32Array;
      expect(objects.length).toBe(fresh.count);
      for (const k of objects) expect(landmarkKind(view.templates[view.template[k]])).toBeTruthy();
    }
    // the ruins follow painted ground as today's do
    const ruin = out.find((r) => r.fresh.name === "high.RuinColumnH3")!;
    expect(ruin.fresh.userData.follows).toBeDefined();
    expect(ruin.fresh.userData.ty0).toBeDefined();
    expect(landmarkKind("Pine")).toBeUndefined();
  });
});
