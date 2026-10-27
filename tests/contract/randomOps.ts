// Random edit operations for the E1 property tests (EDITOR_PLAN §9, §10): every kind the engine
// takes, drawn from a seeded stream so a failure reproduces. Each one targets what exists on the
// map now, so almost all pass their check; the rest must be rejected cleanly. Since M5 the draw
// also makes the land and water tools' edits: drawn rivers, lakes, landforms with gentle and
// terraced edges, every set piece, and moving and deleting them, each a group of operations the
// tools apply as one step. Since #167 it fills hollows and removes unfed water too (D387 (2) and (3),
// D394), the way the core's questions make those operations, and draws refused ones.

import type { MapSession } from "../../src/core/doc/session";
import type { EditOp } from "../../src/core/doc/ops";
import { planEntity } from "../../src/core/doc/placing";
import { moveEdit } from "../../src/core/doc/tools";
import { DEFAULTS as CARVE_DEFAULTS, CarveRun, type CarveSettings } from "../../src/core/forces/carve/run";
import { forceMapOf } from "../../src/core/forces/carve/result";
import { plainEntities, protectedGround, type FullForceMap } from "../../src/core/forces/force";
import { CRATER_DEFAULTS, type CraterSettings } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS, type EruptSettings } from "../../src/core/forces/erupt";
import { QUAKE_DEFAULTS, type QuakeSettings } from "../../src/core/forces/quake";
import { footprint } from "../../src/core/forces/objects";
import { geology } from "../../src/core/forces/random";
import { keptForceParams } from "../../src/core/forces/keep";
import type { ForceRequest } from "../../src/core/forces/start";
import { CraterRun, EruptRun, QuakeRun } from "../../src/core/forces/runs";
import type { Feature, LandformFeature } from "../../src/core/features/schema";
import type { Orientation } from "../../src/core/format/footprints";
import { tilesToRuns } from "../../src/core/math/grid";
import type { Rng } from "../../src/core/math/rng";
import { planFill, unfedWater } from "../../src/core/doc/waterEdits";
import { spillLevels } from "../../src/core/sim/prefill";

const ORIENT: Orientation[] = ["Cw0", "Cw90", "Cw180", "Cw270"];

export function guid(rng: Rng): string {
  let hex = "";
  for (let i = 0; i < 32; i++) hex += "0123456789abcdef"[rng.int(0, 16)];
  const v = "89ab"[rng.int(0, 4)];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${v}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function rect(rng: Rng, W: number, H: number, maxW: number, maxH: number): { x0: number; y0: number; x1: number; y1: number } {
  const w = rng.int(2, maxW + 1);
  const h = rng.int(2, maxH + 1);
  const x0 = rng.int(1, W - w - 1);
  const y0 = rng.int(1, H - h - 1);
  return { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
}

function rectRuns(r: { x0: number; y0: number; x1: number; y1: number }, W: number) {
  const tiles: number[] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) tiles.push(y * W + x);
  return tilesToRuns(tiles, W);
}

const pick = <T>(rng: Rng, xs: readonly T[]): T | undefined => (xs.length ? xs[rng.int(0, xs.length)] : undefined);


/** A random edit of the editor's tools that apply a group of operations as one step: an object or a
 *  source from the shelf (its footprint levelled with it, D290, D328), or the start moved (the
 *  generation's objects under it cleared); null when the tool refuses it (the tool tests cover the
 *  reasons). */
export function randomToolEdit(s: MapSession, rng: Rng): EditOp[] | null {
  const { x: W, y: H } = s.size;
  const planned = (r: { ok: true; ops: EditOp[] } | { ok: false; errors: string[] }): EditOp[] | null => (r.ok ? r.ops : null);
  if (rng.int(0, 4) === 0) {
    const st = s.features.find((f) => f.kind === "start");
    return st ? planned(moveEdit(s, st.id, rng.int(-6, 7), rng.int(-6, 7))) : null;
  }
  const template = pick(rng, ["WaterSource", "BadwaterSource", "SmallRelic", "MediumRelic", "GeothermalField", "UndergroundRuins"])!;
  const strength = rng.int(1, 4);
  const components = template === "WaterSource" || template === "BadwaterSource" ? { [template]: { SpecifiedStrength: strength, CurrentStrength: strength } } : undefined;
  return planned(planEntity(s, { template, x: rng.int(4, W - 6), y: rng.int(4, H - 6), orientation: pick(rng, ORIENT)!, ...(components ? { components } : {}) }, guid(rng)));
}

/** A small, real carve (Live editing's force, D194, D199, D203, the way the product makes one): a
 *  short "Keep river" or "Dry canyon" run of a few dozen steps, from a point on dry land outside
 *  the start's protected ground. Kept brief and gentle (low Power, low Wander, no Aim, no rock
 *  layers to break through) so it cuts a modest reach rather than running to completion — real
 *  work, but light enough that the sweep which hunts down every op kind stays fast on the heavy
 *  project's larger presets. Null when the map has no room for one, or the run cut nothing (a
 *  carve that only kept a source is still a real, if small, change). */
function randomCarve(s: MapSession, rng: Rng): EditOp | null {
  const b = s.built;
  const { x: W, y: H } = s.size;
  const m = forceMapOf(b);
  const keep = protectedGround(m);
  let ox = -1;
  let oy = -1;
  for (let tries = 0; tries < 25 && ox < 0; tries++) {
    const x = rng.int(10, W - 10);
    const y = rng.int(10, H - 10);
    const i = y * W + x;
    if (!keep[i] && b.water[i] === 0) {
      ox = x;
      oy = y;
    }
  }
  if (ox < 0) return null;
  const settings: CarveSettings = {
    ...CARVE_DEFAULTS,
    power: rng.int(20, 55),
    wander: rng.int(0, 40),
    width: null,
    seed: rng.int(0, 1000),
    walls: rng.pick(["steep", "wide"] as const),
    defyGravity: false,
    dry: rng.float() < 0.5,
  };
  const run = new CarveRun(m, settings, { origin: oy * W + ox }, { sourceId: guid(rng) });
  for (let k = 0, n = 30 + rng.int(0, 40); k < n && !run.done; k++) run.step();
  // (its operation as the editor keeps it: forces/keep.ts)
  const kept = keptForceParams({ before: m, request: { verb: "carve", settings, origin: [ox, oy], cut: null }, carve: run, staged: null });
  return kept.ok ? { op: "forceResult", params: kept.params } : null;
}

/** A small, real force (Craterize, Erupt or Quake's Lift; D202, D203, D206, the way the product makes
 *  one): a low-power, small one planned on the map as its build stands (plain copies of its objects,
 *  the rock of the map as opened) and kept as the forces' one operation, `forceResult`, literally.
 *  Only planned, not played through its stages (the plan is what is kept; its stages only show it),
 *  so the sweep stays fast on the heavy project's larger presets. Null when there is no room, or the
 *  start's ground refuses it, or it changed nothing. */
function randomForce(s: MapSession, rng: Rng): EditOp | null {
  const b = s.built;
  const { x: W, y: H } = s.size;
  const m = forceMapOf(b);
  const entities = plainEntities(m.entities.map((e) => (e.raw ? (({ raw: _raw, ...rest }) => rest)(e) : e)));
  const map: FullForceMap = { ...m, entities, rockLayers: geology(s.openedHeights), lava: new Uint32Array(W * H), fallen: [] };
  const keep = new Uint8Array(W * H);
  for (const i of s.columns.keys()) keep[i] = 1;
  // (the draw keeps its forces off the start's ground: applied straight to the session, a force
  // there would leave the start for the editor to carry, which the worker does, not the session)
  const guard = new Uint8Array(W * H);
  for (const e of map.entities) if (e.template === "StartingLocation") for (const i of footprint(map, e, 1)) guard[i] = 1;
  let ox = -1;
  let oy = -1;
  for (let tries = 0; tries < 25 && ox < 0; tries++) {
    const x = rng.int(12, W - 12);
    const y = rng.int(12, H - 12);
    const i = y * W + x;
    if (!guard[i] && !keep[i] && b.water[i] === 0) {
      ox = x;
      oy = y;
    }
  }
  if (ox < 0) return null;
  const verb = rng.pick(["craterize", "erupt", "quake"] as const);
  const seed = rng.int(0, 1000);
  let run: CraterRun | EruptRun | QuakeRun;
  let request: ForceRequest;
  try {
    if (verb === "craterize") {
      const settings: CraterSettings = { ...CRATER_DEFAULTS, power: rng.int(5, 30), size: rng.int(4, 9) * 2, seed };
      run = new CraterRun(map, settings, { origin: oy * W + ox }, keep);
      request = { verb, settings, origin: [ox, oy], cut: null };
    } else if (verb === "erupt") {
      const settings: EruptSettings = { ...ERUPT_DEFAULTS, power: rng.int(5, 30), size: rng.int(4, 9) * 2, flows: "light", seed };
      run = new EruptRun(map, settings, { origin: oy * W + ox }, keep);
      request = { verb, settings, origin: [ox, oy], cut: null };
    } else {
      const path = [
        { x: Math.max(1, ox - 6), y: oy },
        { x: Math.min(W - 2, ox + 6), y: Math.max(1, Math.min(H - 2, oy + rng.int(-2, 3))) },
      ];
      const side = rng.float() < 0.5 ? (1 as const) : (-1 as const);
      const settings: QuakeSettings = { ...QUAKE_DEFAULTS, mode: "lift", power: rng.int(10, 35), seed };
      run = new QuakeRun(map, settings, { path, side }, keep);
      request = { verb, settings, path, side, cut: null };
    }
    run.planAll();
  } catch {
    return null;
  }
  // (its operation as the editor keeps it, from the request it would have sent: forces/keep.ts)
  const kept = keptForceParams({ before: map, request, carve: null, staged: run });
  return kept.ok ? { op: "forceResult", params: kept.params } : null;
}

/** A Fill on a real hollow (D387 (3), D394), the way the editor's question makes one: a dry tile
 *  whose spill level stands above its floor (a pit a sculpt, brush or carve left), filled to a
 *  sensible level up to its spill level (`planFill`). Where no hollow holds it, or the question
 *  refuses, a Fill the engine must refuse: the tile's own water to a level the hollow doesn't hold.
 *  Null on a map with no dry tile at all. */
function randomFill(s: MapSession, rng: Rng): EditOp | null {
  const b = s.built;
  const m = b.waterModel;
  const { W, H, floor } = m;
  const spill = spillLevels(m);
  const hollows: number[] = [];
  for (let i = 0; i < W * H; i++) if (b.water[i] === 0 && spill[i] > floor[i] + 0.25) hollows.push(i);
  const i = pick(rng, hollows);
  if (i !== undefined) {
    const level = floor[i] + Math.min(spill[i] - floor[i], pick(rng, [0.5, 1, 1.5, 2])!);
    const plan = planFill(s, i % W, Math.floor(i / W), level);
    if (plan.op) return plan.op;
  }
  // refused: a one-tile lake on dry ground, to a level its hollow doesn't hold as stored
  const dry: number[] = [];
  for (let t = 0; t < W * H; t++) if (b.water[t] === 0) dry.push(t);
  const t = i ?? pick(rng, dry);
  if (t === undefined) return null;
  const level = floor[t] + 1;
  return { op: "fillHollow", params: { at: [t % W, Math.floor(t / W)], level, lake: { tiles: [t], floor: [floor[t]], depth: [1], contamination: [0] } } };
}

/** Remove unfed water (D387 (2)), the way the editor's question makes it: map-wide, or within a
 *  random selection (a pool with a tile in it goes whole). Where there is none to take, the drawn
 *  removal of a dry tile, which the engine must refuse. */
function randomRemoval(s: MapSession, rng: Rng): EditOp | null {
  const { x: W, y: H } = s.size;
  const within = rng.float() < 0.5 ? rect(rng, W, H, Math.min(40, W - 4), Math.min(40, H - 4)) : null;
  const take = unfedWater(s, within);
  if (take.op) return take.op;
  const dry = pick(rng, Array.from(s.built.water.keys()).filter((t) => s.built.water[t] === 0));
  return dry === undefined ? null : { op: "removeUnfedWater", params: { tiles: [dry] } };
}

/** One random operation (or a tool's group of them) for the session's current map, or null when
 *  the drawn kind has no target. */
export function randomOp(s: MapSession, rng: Rng): EditOp | EditOp[] | null {
  if (rng.float() < 0.2) {
    const ops = randomToolEdit(s, rng);
    if (ops) return ops;
  }
  const { x: W, y: H } = s.size;
  const features = s.features;
  const entities = s.built.entities;
  const byKind = (k: Feature["kind"]) => features.filter((f) => f.kind === k);
  const roll = rng.int(0, 104);
  if (roll < 12) {
    const f = pick(rng, [...byKind("forest"), ...byKind("berryPatch"), ...byKind("ruinField")]);
    if (!f) return null;
    if (f.kind === "forest") {
      const patch = [
        { density: Math.round(rng.range(0.2, 1) * 100) / 100 },
        { life: pick(rng, ["auto", "alive", "dead"] as const) },
        { youngShare: Math.round(rng.float() * 100) / 100 },
        { speciesMix: { Pine: 1, Oak: rng.int(0, 3) } },
      ][rng.int(0, 4)];
      return { op: "updateFeature", params: { id: f.id, patch: { params: patch } } };
    }
    if (f.kind === "berryPatch") return { op: "updateFeature", params: { id: f.id, patch: { params: { density: Math.round(rng.range(0.3, 1) * 100) / 100, ripeShare: Math.round(rng.float() * 100) / 100 } } } };
    return { op: "updateFeature", params: { id: f.id, patch: { params: { centerBias: Math.round(rng.range(0, 2) * 100) / 100 } } } };
  }
  if (roll < 17) {
    // the features read back out of a generated field (M9a): reshaping one builds it as it now says
    // instead of as the field holds it (a river's width, a natural lake's floor); undo gives the
    // field back. A map from before M9a (no field) reshapes its planned landforms instead.
    const inField = new Set(s.document.field?.contains ?? []);
    const f = pick(rng, s.features.filter((g) => inField.has(g.id) && (g.kind === "river" || (g.kind === "lake" && g.params.natural === true))));
    if (f?.kind === "river") return { op: "updateFeature", params: { id: f.id, patch: { params: { width: Math.round(Math.max(1.5, Math.min(9, f.params.width + rng.range(-1.5, 1.5))) * 10) / 10 } } } };
    if (f?.kind === "lake") return { op: "updateFeature", params: { id: f.id, patch: { params: { floorDepth: rng.int(1, 4) } } } };
    const lf = pick(rng, byKind("landform")) as LandformFeature | undefined;
    if (!lf?.params.along) return null;
    if (lf.params.kind === "terraces") {
      const bands = (lf.params.along.bands ?? []).map((b, k) => (k === 0 ? { at: b.at + rng.int(-2, 3), rise: b.rise } : b));
      return { op: "updateFeature", params: { id: lf.id, patch: { params: { along: { bands } } } } };
    }
    return { op: "updateFeature", params: { id: lf.id, patch: { params: { along: { halfWidth: Math.max(4, lf.params.along.halfWidth + rng.int(-2, 3)) } } } } };
  }
  if (roll < 21) {
    const r = pick(rng, byKind("river"));
    if (!r || r.kind !== "river") return null;
    return { op: "updateFeature", params: { id: r.id, patch: { params: { flow: Math.round(r.params.flow * rng.range(0.7, 1.3) * 100) / 100 } } } };
  }
  if (roll < 25) {
    const st = pick(rng, byKind("start"));
    if (!st || st.kind !== "start") return null;
    const [x, y] = st.params.position;
    const nx = Math.min(W - 10, Math.max(9, x + rng.int(-2, 3)));
    const ny = Math.min(H - 10, Math.max(9, y + rng.int(-2, 3)));
    return { op: "updateFeature", params: { id: st.id, patch: { params: { position: [nx, ny] } } } };
  }
  if (roll < 38) {
    const id = guid(rng);
    const kind = pick(rng, ["plateau", "forest", "berryPatch", "ruinField", "lake"] as const)!;
    const r = rect(rng, W, H, 14, 12);
    if (kind === "plateau") {
      return {
        op: "addFeature",
        params: {
          feature: { id, kind: "landform", origin: "user", locked: false, params: { kind: "plateau", edgeStyle: "cliff", outline: [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]], height: rng.int(3, 17) } },
        },
      };
    }
    if (kind === "lake") {
      const sill = rng.int(3, 12);
      return {
        op: "addFeature",
        params: {
          feature: {
            id,
            kind: "lake",
            origin: "user",
            locked: false,
            params: { outline: [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]], floorDepth: 2, outlet: { at: [r.x1, r.y0], sill, to: "none" }, inflow: { spring: 1 }, planned: false },
          },
        },
      };
    }
    const area = rectRuns(r, W);
    if (kind === "forest") return { op: "addFeature", params: { feature: { id, kind: "forest", origin: "user", locked: false, params: { area, density: 0.8, speciesMix: { Birch: 1, Pine: 1 }, life: "auto", youngShare: 0.3 } } } };
    if (kind === "berryPatch") return { op: "addFeature", params: { feature: { id, kind: "berryPatch", origin: "claude", locked: false, params: { area, density: 1, ripeShare: 0.5 } } } };
    return { op: "addFeature", params: { feature: { id, kind: "ruinField", origin: "user", locked: false, params: { area, scrapTarget: 500, heightMix: [0.3, 0.2, 0.2, 0.1, 0.1, 0.05, 0.03, 0.02], centerBias: 0.5 } } } };
  }
  if (roll < 44) {
    const candidates = features.filter((f) => f.origin !== "generated" || f.kind === "forest" || f.kind === "berryPatch" || f.kind === "ruinField");
    const f = pick(rng, candidates);
    return f ? { op: "deleteFeature", params: { id: f.id } } : null;
  }
  if (roll < 46) {
    const f = pick(rng, features.filter((g) => g.origin !== "generated"));
    return f ? { op: "reorderFeature", params: { id: f.id, index: rng.int(0, features.length) } } : null;
  }
  if (roll >= 53 && roll < 60) {
    // a brush stroke (live editing): a wandering path of dabs
    const tool = pick(rng, ["raise", "lower", "flatten", "smooth", "naturalize"] as const)!;
    let x = rng.int(4, W - 4) * 4 + 2;
    let y = rng.int(4, H - 4) * 4 + 2;
    const dabs: number[] = [];
    for (let k = rng.int(1, 40); k > 0; k--) {
      x = Math.min(4 * W - 1, Math.max(0, x + rng.int(-6, 7)));
      y = Math.min(4 * H - 1, Math.max(0, y + rng.int(-6, 7)));
      dabs.push(x, y);
    }
    return {
      op: "brush",
      params: { tool, size: rng.int(2, 19) / 2, strength: rng.int(1, 11), ...(tool === "flatten" ? { level: rng.int(0, 17) } : {}), ...(tool === "naturalize" ? { seed: rng.int(0, 1_000_000) } : {}), dabs },
    };
  }
  if (roll < 60) {
    const mode = pick(rng, ["raise", "lower", "flatten", "terrace", "smooth"] as const)!;
    const cells = rectRuns(rect(rng, W, H, 10, 8), W);
    if (mode === "raise" || mode === "lower") return { op: "sculpt", params: { mode, cells, amount: rng.int(1, 4) } };
    if (mode === "flatten") return { op: "sculpt", params: { mode, cells, level: rng.int(2, 15) } };
    if (mode === "terrace") return { op: "sculpt", params: { mode, cells, step: rng.int(2, 5) } };
    return { op: "sculpt", params: { mode, cells } };
  }
  if (roll < 67) {
    const template = pick(rng, ["Pine", "Oak", "BlueberryBush", "RuinColumnH3", "Thorns", "Blockage", "WaterSource"])!;
    return { op: "placeEntity", params: { id: guid(rng), template, x: rng.int(1, W - 1), y: rng.int(1, H - 1), orientation: pick(rng, ORIENT)! } };
  }
  const movable = entities.filter((e) => /^(Pine|Birch|Oak|Succulent|BlueberryBush|RuinColumnH\d|Thorns|Blockage)$/.test(e.template));
  if (roll < 72) {
    const e = pick(rng, movable);
    if (!e) return null;
    return { op: "moveEntity", params: { id: e.id, x: Math.min(W - 2, Math.max(1, e.x + rng.int(-3, 4))), y: Math.min(H - 2, Math.max(1, e.y + rng.int(-3, 4))), orientation: pick(rng, ORIENT) } };
  }
  if (roll < 80) {
    const n = rng.int(1, 6);
    const ids = new Set<string>();
    for (let k = 0; k < n; k++) {
      const e = pick(rng, movable);
      if (e) ids.add(e.id);
    }
    return ids.size ? { op: "deleteEntities", params: { entities: [...ids] } } : null;
  }
  if (roll < 84) {
    const e = pick(rng, entities.filter((x) => x.template === "Pine" || x.template === "Oak" || x.template === "Birch"));
    if (!e) return null;
    return { op: "setEntityProps", params: { id: e.id, components: rng.float() < 0.5 ? { Growable: { GrowthProgress: Math.round(rng.range(0.2, 0.9) * 100) / 100 } } : { LivingNaturalResource: { IsDead: true } } } };
  }
  if (roll < 88) {
    const sl = pick(rng, entities.filter((e) => e.template === "Slope"));
    return sl ? { op: "removeSlope", params: { x: sl.x, y: sl.y } } : null;
  }
  if (roll < 91) return { op: "pinSlope", params: { x: rng.int(1, W - 1), y: rng.int(1, H - 1), orientation: pick(rng, ORIENT)! } };
  if (roll < 96) return randomCarve(s, rng);
  if (roll < 98) return randomForce(s, rng);
  if (roll >= 100 && roll < 102) return randomFill(s, rng);
  if (roll >= 102 && roll < 104) return randomRemoval(s, rng);
  // an invalid operation: it must be rejected with a reason, and change nothing
  return pick(rng, [
    { op: "sculpt", params: { mode: "naturalize", cells: [[1, 1, 3]] } },
    { op: "deleteFeature", params: { id: "f-aaaaaaaaaaaaa" } },
    { op: "moveEntity", params: { id: guid(rng), x: 1, y: 1 } },
    { op: "sculpt", params: { mode: "raise", cells: [[H + 3, 0, 4]], amount: 1 } },
    { op: "brush", params: { tool: "raise", size: 3, strength: 5, dabs: [4 * W + 8, 10] } },
    { op: "placeEntity", params: { id: guid(rng), template: "Maple", x: 3, y: 3, orientation: "Cw0" } },
    { op: "removeUnfedWater", params: { tiles: [5, 4] } },
    { op: "fillHollow", params: { at: [3, 3], level: 2, lake: { tiles: [3 * W + 3], floor: [1], depth: [0.5], contamination: [0] } } },
  ] as EditOp[])!;
}
