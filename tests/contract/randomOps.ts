// Random edit operations for the E1 property tests (EDITOR_PLAN §9, §10): every kind the engine
// takes, drawn from a seeded stream so a failure reproduces. Each one targets what exists on the
// map now, so almost all pass their check; the rest must be rejected cleanly. Since M5 the draw
// also makes the land and water tools' edits: drawn rivers, lakes, landforms with gentle and
// terraced edges, every set piece, and moving and deleting them, each a group of operations the
// tools apply as one step.

import type { MapSession } from "../../src/core/doc/session";
import type { EditOp } from "../../src/core/doc/ops";
import { deleteEdit, moveEdit, planContextOf, planLake, planLandform, planPiece, planRiver, type PlannedEdit } from "../../src/core/doc/tools";
import type { Facing } from "../../src/core/features/setpieces/common";
import type { Feature, LandformFeature, Point, RiverFeature } from "../../src/core/features/schema";
import type { Orientation } from "../../src/core/format/footprints";
import { tilesToRuns } from "../../src/core/math/grid";
import type { Rng } from "../../src/core/math/rng";

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

const FACINGS: Facing[] = ["north", "east", "south", "west"];

/** A random edit of the land and water tools (M5), as the operations they apply together; null
 *  when the draw has no target or the tool refuses it (the tools refuse invalid requests with a
 *  reason, which the tool tests cover). */
export function randomToolEdit(s: MapSession, rng: Rng): EditOp[] | null {
  const { x: W, y: H } = s.size;
  const at = (m: number): Point => [rng.int(m, W - m), rng.int(m, H - m)];
  const planned = (r: PlannedEdit): EditOp[] | null => (r.ok ? r.ops : null);
  const roll = rng.int(0, 12);
  switch (roll) {
    case 0: {
      const edge = rng.int(0, 4);
      const e: Point = edge === 0 ? [0, rng.int(12, H - 12)] : edge === 1 ? [W - 1, rng.int(12, H - 12)] : edge === 2 ? [rng.int(12, W - 12), 0] : [rng.int(12, W - 12), H - 1];
      const end: Point = edge < 2 ? [rng.int(12, W - 12), edge === 0 ? H - 1 : 0] : [edge === 2 ? W - 1 : 0, rng.int(12, H - 12)];
      return planned(planRiver({ points: [e, at(12), end], flow: [1, 2, 4][rng.int(0, 3)] }, planContextOf(s), guid(rng)));
    }
    case 1: {
      const [cx, cy] = at(12);
      const w = rng.int(3, 7);
      const h = rng.int(3, 6);
      return planned(planLake({ outline: [[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy + h], [cx - w, cy + h]], spring: [0.25, 0.5, 1][rng.int(0, 3)] }, planContextOf(s), guid(rng)));
    }
    case 2: {
      const [cx, cy] = at(10);
      const r = rng.int(4, 9);
      const edgeStyle = (["gentle", "terraced", "cliff"] as const)[rng.int(0, 3)];
      const kind = (["hill", "plateau", "ridge", "canyon", "island"] as const)[rng.int(0, 5)];
      return planned(planLandform({ outline: [[cx - r, cy - r], [cx + r, cy - r + 2], [cx + r - 1, cy + r], [cx - r + 2, cy + r - 1]], kind, edgeStyle }, planContextOf(s), guid(rng)));
    }
    case 3:
    case 4:
      return planned(planPiece(s, "waterfall", { mode: "standalone", lip: at(8), facing: FACINGS[rng.int(0, 4)], width: rng.int(3, 24), drop: rng.int(2, 17), flow: (["gentle", "steady", "strong"] as const)[rng.int(0, 3)] }, guid(rng)));
    case 5:
    case 6: {
      const river = pick(rng, s.features.filter((f): f is RiverFeature => f.kind === "river"));
      if (!river) return null;
      const len = river.params.path.reduce((a, p, k, ps) => (k ? a + Math.hypot(p[0] - ps[k - 1][0], p[1] - ps[k - 1][1]) : 0), 0);
      const kind = (["waterfall", "damSite", "gorge"] as const)[rng.int(0, 3)];
      const where = Math.round(rng.range(8, Math.max(9, len - 8)) * 100) / 100;
      if (kind === "waterfall") return planned(planPiece(s, "waterfall", { mode: "on-river", river: river.id, at: where, drop: rng.int(1, 4) }, guid(rng)));
      if (kind === "damSite") return planned(planPiece(s, "damSite", { river: river.id, at: where, crest: rng.int(1, 5) }, guid(rng)));
      return planned(planPiece(s, "gorge", { river: river.id, from: where, length: rng.int(6, 30), width: rng.int(3, 9), wallHeight: rng.int(2, 5), access: rng.float() < 0.5 ? "stairs" : "none" }, guid(rng)));
    }
    case 7:
      return planned(planPiece(s, "terracedCliffs", { at: at(10), facing: FACINGS[rng.int(0, 4)], bands: rng.int(3, 7), depth: rng.int(6, 13), width: rng.int(8, 24) }, guid(rng)));
    case 8:
      return planned(planPiece(s, "badwaterBasin", { mode: "basin", at: at(10), strength: rng.int(1, 4) }, guid(rng)));
    case 9:
    case 10: {
      // move a player's feature: rivers, lakes and set pieces are planned again at their new place
      const f = pick(rng, s.features.filter((g) => g.origin !== "generated" && (g.kind === "river" || g.kind === "lake" || g.kind === "landform" || g.kind === "setPiece")));
      if (!f) return null;
      return planned(moveEdit(s, f.id, rng.int(-6, 7), rng.int(-6, 7)));
    }
    default: {
      const f = pick(rng, s.features.filter((g) => g.kind === "setPiece" && g.origin !== "generated"));
      return f ? planned(deleteEdit(s, f.id)) : null;
    }
  }
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
  const roll = rng.int(0, 100);
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
    // terrain features of the generated layout: the terraces (the whole map), the valley floor
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
  if (roll < 96) {
    const locks = s.state.locks;
    if (locks.length && rng.float() < 0.4) return { op: "setLock", params: { id: pick(rng, locks)!.id, region: null } };
    return { op: "setLock", params: { id: `lock-${rng.int(0, 1000)}`, region: { runs: rectRuns(rect(rng, W, H, 12, 12), W) } } };
  }
  // an invalid operation: it must be rejected with a reason, and change nothing
  return pick(rng, [
    { op: "sculpt", params: { mode: "naturalize", cells: [[1, 1, 3]] } },
    { op: "deleteFeature", params: { id: "f-aaaaaaaaaaaaa" } },
    { op: "moveEntity", params: { id: guid(rng), x: 1, y: 1 } },
    { op: "sculpt", params: { mode: "raise", cells: [[H + 3, 0, 4]], amount: 1 } },
    { op: "brush", params: { tool: "raise", size: 3, strength: 5, dabs: [4 * W + 8, 10] } },
    { op: "placeEntity", params: { id: guid(rng), template: "Maple", x: 3, y: 3, orientation: "Cw0" } },
    { op: "regenerateRegion", params: { area: { runs: [[1, 1, 4]] }, seedVariant: 1, layers: ["terrain"] } },
  ] as EditOp[])!;
}
