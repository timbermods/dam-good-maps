// Collaborative editing, claims (PLAN §20 D362, D486; docs/COLLAB-BRIEF.md §2 to §4; core/collab/claims.ts,
// footprint.ts, waterNotes.ts): who holds which ground, what an edit reaches, and the quiet note when an
// edit changes the water in the other player's area. The core is exercised directly, headless, on small
// generated maps. The host decides on the record's exact writes (#397's touchesOf, plus the generated trees
// an entry fells); the cautious band the page shows while a stroke is drawn is held against those writes
// (no written tile may escape it), and a force's plan footprint too. The long sweep of every force is in
// collabClaims.heavy.test.ts (nightly).

import { beforeAll, describe, expect, it } from "vitest";
import { claimsCheck, ClaimsState, parseCommand, reachInto, refusal, refusalForWrites, type ClaimCommand, type PlayerNames, type Role } from "../../src/core/collab/claims";
import { bandOf, footprintOf, forceBand, trialWrites, TileMask, writtenBy } from "../../src/core/collab/footprint";
import { Mask } from "../../src/core/collab/mask";
import { describeWaterNote, waterNote, waterNotes } from "../../src/core/collab/waterNotes";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { planEntity, planMoveEntity } from "../../src/core/doc/placing";
import { planRemove } from "../../src/core/doc/remove";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { FOOTPRINTS } from "../../src/core/format/footprints";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import * as ed from "../../src/worker/session";
import { mulberry } from "./brushRandom";
import { act, GUEST, GUID, HOST, sit } from "./collabFixtures";
import { holdForce, open, planOf } from "./collabClaimsForces";

const W = 64;
const NAMES: PlayerNames = { host: "Kyler", guest: "Emma" };
const run = (y: number, x0: number, x1: number): [number, number, number] => [y, x0, x1];
/** A square of tiles as runs. */
const square = (x0: number, y0: number, x1: number, y1: number): [number, number, number][] => {
  const out: [number, number, number][] = [];
  for (let y = y0; y <= y1; y++) out.push(run(y, x0, x1));
  return out;
};

/** One generated map, saved as the app saves it; every test opens its own session from it. */
let bytes: Uint8Array;
beforeAll(() => {
  bytes = MapSession.fromGenerated(generate(makeSpec({ seed: 5, theme: "highlands", size: { x: W, y: W } }))).project();
}, 300_000);
function session(water: "defer" | "canonical" = "defer"): MapSession {
  const s = MapSession.open(decodeProject(bytes));
  s.setWaterMode(water);
  return s;
}

/** The top-left corner of a w × h block of ground with no slope or object of more than a tile on it or
 *  within three tiles (those ride the ground an edit changes beside them; a tree is one tile). */
function bare(s: MapSession, w: number, h: number): [number, number] {
  const big = s.built.entities.filter((e) => e.template === "Slope" || (FOOTPRINTS[e.template] && FOOTPRINTS[e.template].blocks.length > 1 && FOOTPRINTS[e.template].size[0] * FOOTPRINTS[e.template].size[1] > 1));
  for (let y = 4; y < W - h - 4; y++)
    for (let x = 4; x < W - w - 4; x++)
      if (!big.some((e) => e.x >= x - 3 && e.x <= x + w + 3 && e.y >= y - 3 && e.y <= y + h + 3)) return [x, y];
  throw new Error("no bare ground");
}

/** Tiles of `a` that are not in `b`. */
function outside(a: TileMask | Mask, b: TileMask | Mask): number {
  const N = a instanceof TileMask ? a.bits.length : a.N;
  let n = 0;
  for (let i = 0; i < N; i++) if (a.has(i) && !b.has(i)) n++;
  return n;
}

/** What the host will record as written by `ops` on `s`, held against the cautious band (and the plan's
 *  footprint for a force); then the step is applied, so the next one starts from where it leaves the map. */
function held(s: MapSession, ops: EditOp[], what: string): { written: number } {
  const band = bandOf(ops, s);
  const trial = trialWrites(s, ops);
  expect(trial.ok, what).toBe(true);
  if (!trial.ok) return { written: 0 };
  expect(outside(trial.writes, band.tiles), `${what}: a tile the host records escapes the cautious band`).toBe(0);
  if (ops.some((o) => o.op === "forceResult")) expect(outside(trial.writes, footprintOf(ops, s).tiles), `${what}: a written tile escapes the plan's footprint`).toBe(0);
  const r = ops.length === 1 ? s.apply(ops[0]) : s.applyAll(ops);
  expect(r.errors, what).toEqual([]);
  return { written: trial.writes.size };
}

describe("claims (§2)", () => {
  const claims = () => new ClaimsState(W, W);
  const ok = (r: ReturnType<ClaimsState["apply"]>) => {
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return r;
  };
  const why = (c: ClaimsState, by: "host" | "guest", cmd: ClaimCommand) => c.refusal(by, cmd, NAMES);

  it("claims only unclaimed ground, of any shape and size, and says why when it can't", () => {
    const c = claims();
    ok(c.apply("host", { kind: "claim", runs: square(4, 4, 20, 12) }, NAMES));
    expect(c.countOf("host")).toBe(17 * 9);
    // an L, a single tile, a whole row, the whole map: any shape, any size
    ok(c.apply("guest", { kind: "claim", runs: [run(30, 2, 9), run(31, 2, 3), run(32, 2, 3)] }, NAMES));
    ok(c.apply("guest", { kind: "claim", runs: [run(50, 50, 50)] }, NAMES));
    expect(c.countOf("guest")).toBe(8 + 2 + 2 + 1);
    expect(why(c, "guest", { kind: "claim", runs: square(18, 10, 24, 14) })).toBe("That includes Kyler's area");
    expect(why(c, "host", { kind: "claim", runs: [run(31, 3, 5)] })).toBe("That includes Emma's area");
    expect(why(c, "host", { kind: "claim", runs: [run(5, 6, 8)] })).toBe("That ground is already yours");
    // refused: nothing changed, not even partly
    const before = c.owner.slice();
    expect(c.apply("guest", { kind: "claim", runs: square(18, 10, 24, 14) }, NAMES).ok).toBe(false);
    expect(c.owner).toEqual(before);
    // part of a claim already yours is fine to claim again: the claim grows
    ok(c.apply("host", { kind: "claim", runs: square(18, 4, 24, 12) }, NAMES));
    expect(c.countOf("host")).toBe(17 * 9 + 4 * 9);
    // a whole map can be claimed when nothing is held
    const all = claims();
    ok(all.apply("host", { kind: "claim", runs: square(0, 0, W - 1, W - 1) }, NAMES));
    expect(all.countOf("host")).toBe(W * W);
  });

  it("refuses a shape that is not one, a run off the map, and anything the schema forbids, in one line each", () => {
    const c = claims();
    expect(why(c, "host", { kind: "claim", runs: [run(0, 5, 70)] })).toBe("Part of that shape is off the map");
    expect(why(c, "host", { kind: "claim", runs: [run(70, 0, 1)] })).toBe("Part of that shape is off the map");
    expect(why(c, "host", { kind: "claim", runs: [run(3, 9, 2)] })).toBe("Part of that shape is off the map");
    expect(why(c, "host", { kind: "claim", runs: [] })).toBe("Not a claim command: runs needs 1+ items");
    expect(why(c, "host", { kind: "claim", runs: [[1, 2.5, 4]] as never })).toBe("Not a claim command: runs 0 1 must be integer");
    for (const bad of [{ kind: "claim" }, { kind: "hoard", runs: [[0, 0, 1]] }, { kind: "accept" }, { kind: "claim", runs: [[0, 0, 1]], extra: 1 }, "claim", null]) {
      const r = parseCommand(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.reason).not.toContain("\n");
    }
    expect(parseCommand({ kind: "release" }).ok).toBe(true);
    expect(parseCommand({ kind: "accept", offer: 3 }).ok).toBe(true);
  });

  it("releases all of a claim or part of it, never the other's", () => {
    const c = claims();
    ok(c.apply("host", { kind: "claim", runs: square(4, 4, 20, 12) }, NAMES));
    ok(c.apply("guest", { kind: "claim", runs: square(30, 30, 40, 40) }, NAMES));
    expect(why(c, "host", { kind: "release", runs: square(2, 2, 6, 6).concat(square(30, 30, 31, 31)) })).toBe("That includes Emma's area");
    expect(why(c, "host", { kind: "release", runs: square(50, 50, 52, 52) })).toBe("None of that ground is yours");
    // part: a slice and a corner, with unclaimed ground in the shape (nothing to release there)
    const r = ok(c.apply("host", { kind: "release", runs: square(2, 2, 6, 12) }, NAMES));
    expect(r.ok && r.changed.length).toBe(3 * 9);
    expect(c.countOf("host")).toBe(17 * 9 - 3 * 9);
    expect(c.ownerOf(4 * W + 4)).toBe(null);
    expect(c.ownerOf(4 * W + 7)).toBe("host");
    ok(c.apply("host", { kind: "release" }, NAMES));
    expect(c.countOf("host")).toBe(0);
    expect(why(c, "host", { kind: "release" })).toBe("You have no area to release");
    expect(c.countOf("guest")).toBe(11 * 11);
    // once released the ground is anyone's to claim
    ok(c.apply("guest", { kind: "claim", runs: square(4, 4, 8, 8) }, NAMES));
  });

  it("offers ground to the other, who accepts or declines; an offer dies when its ground changes hands first", () => {
    const c = claims();
    ok(c.apply("host", { kind: "claim", runs: square(4, 4, 20, 12) }, NAMES));
    expect(why(c, "guest", { kind: "offer", runs: square(4, 4, 6, 6) })).toBe("That includes Kyler's area");
    expect(why(c, "guest", { kind: "offer", runs: square(40, 4, 46, 6) })).toBe("Only ground you have claimed can be offered");
    expect(why(c, "host", { kind: "offer", runs: square(4, 4, 30, 6) })).toBe("Only ground you have claimed can be offered");
    const offered = ok(c.apply("host", { kind: "offer", runs: square(4, 4, 8, 6) }, NAMES));
    const id = (offered.ok && offered.offer!.id) as number;
    expect(c.offers).toHaveLength(1);
    // an offer changes nothing until it is accepted
    expect(c.countOf("host")).toBe(17 * 9);
    expect(why(c, "host", { kind: "accept", offer: id })).toBe("That offer is not for you");
    expect(why(c, "guest", { kind: "accept", offer: 99 })).toBe("That offer is no longer available");
    // declined: gone, ground still the host's
    ok(c.apply("guest", { kind: "decline", offer: id }, NAMES));
    expect(c.offers).toHaveLength(0);
    expect(c.countOf("guest")).toBe(0);
    expect(why(c, "guest", { kind: "accept", offer: id })).toBe("That offer is no longer available");
    // accepted: the ground changes hands, the claim's revision moves on
    const second = ok(c.apply("host", { kind: "offer", runs: square(4, 4, 8, 6) }, NAMES));
    const rev = c.revision;
    ok(c.apply("guest", { kind: "accept", offer: (second.ok && second.offer!.id) as number }, NAMES));
    expect(c.countOf("guest")).toBe(5 * 3);
    expect(c.countOf("host")).toBe(17 * 9 - 5 * 3);
    expect(c.revision).toBeGreaterThan(rev);
    expect(c.ownerOf(4 * W + 4)).toBe("guest");
    // the offerer may take an offer back by declining it
    const third = ok(c.apply("host", { kind: "offer", runs: square(12, 8, 14, 10) }, NAMES));
    ok(c.apply("host", { kind: "decline", offer: (third.ok && third.offer!.id) as number }, NAMES));
    expect(c.offers).toHaveLength(0);
    // ground that changes hands first kills the offer: released, or offered and accepted elsewhere
    const a = ok(c.apply("host", { kind: "offer", runs: square(12, 8, 14, 10) }, NAMES));
    const b = ok(c.apply("host", { kind: "offer", runs: square(14, 8, 16, 10) }, NAMES));
    ok(c.apply("host", { kind: "release", runs: [run(8, 13, 13)] }, NAMES));
    expect(c.offers.map((o) => o.id)).toEqual([(b.ok && b.offer!.id) as number]);
    expect(why(c, "guest", { kind: "accept", offer: (a.ok && a.offer!.id) as number })).toBe("That offer is no longer available");
    // the overlapping offer (tile 14,8 is in both) goes when the other is accepted
    const d = ok(c.apply("host", { kind: "offer", runs: square(14, 8, 16, 10) }, NAMES));
    ok(c.apply("guest", { kind: "accept", offer: (b.ok && b.offer!.id) as number }, NAMES));
    expect(c.offers).toHaveLength(0);
    expect(why(c, "guest", { kind: "accept", offer: (d.ok && d.offer!.id) as number })).toBe("That offer is no longer available");
  });

  it("keeps its state in a snapshot a rejoining player is sent, and refuses a bad one", () => {
    const c = claims();
    ok(c.apply("host", { kind: "claim", runs: square(4, 4, 20, 12) }, NAMES));
    ok(c.apply("guest", { kind: "claim", runs: [run(30, 2, 9), run(31, 2, 3)] }, NAMES));
    ok(c.apply("host", { kind: "offer", runs: square(4, 4, 8, 6) }, NAMES));
    const json = JSON.parse(JSON.stringify(c.toSnapshot()));
    const back = ClaimsState.fromSnapshot(json, W, W);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.claims.owner).toEqual(c.owner);
    expect(back.claims.offers).toEqual(c.offers);
    expect(back.claims.revision).toBe(c.revision);
    // the next offer is numbered as it would have been
    expect(back.claims.toSnapshot()).toEqual(c.toSnapshot());
    const next = ok(back.claims.apply("host", { kind: "offer", runs: [run(10, 4, 5)] }, NAMES));
    const same = ok(c.apply("host", { kind: "offer", runs: [run(10, 4, 5)] }, NAMES));
    expect(next.ok && next.offer!.id).toBe(same.ok && same.offer!.id);
    // refused: another size, overlapping claims, an offer of ground that is not the offerer's
    expect(ClaimsState.fromSnapshot(json, 32, 32)).toEqual({ ok: false, reason: "The claims are for a map of another size" });
    const both = { ...json, guest: [...json.guest, [4, 4, 4]] };
    expect(ClaimsState.fromSnapshot(both, W, W)).toEqual({ ok: false, reason: "The claims overlap" });
    const stray = { ...json, nextOffer: 6, offers: [{ id: 5, from: "guest", to: "host", runs: [[4, 4, 4]] }] };
    expect(ClaimsState.fromSnapshot(stray, W, W)).toEqual({ ok: false, reason: "An offer is of ground its offerer does not hold" });
    expect(ClaimsState.fromSnapshot({ ...json, version: 2 }, W, W).ok).toBe(false);
    // refused: two offers with one number, and a next number that is not past the ones waiting
    const offer = (id: number, y: number) => ({ id, from: "host", to: "guest", runs: [[y, 4, 5]] });
    expect(ClaimsState.fromSnapshot({ ...json, nextOffer: 9, offers: [offer(3, 5), offer(3, 6)] }, W, W)).toEqual({ ok: false, reason: "Two offers have the same number" });
    expect(ClaimsState.fromSnapshot({ ...json, nextOffer: 3, offers: [offer(3, 5)] }, W, W)).toEqual({ ok: false, reason: "The next offer number is not past the offers waiting" });
    expect(ClaimsState.fromSnapshot({ ...json, nextOffer: 4, offers: [offer(3, 5)] }, W, W).ok).toBe(true);
    // the arrays of runs are bounded
    expect(ClaimsState.fromSnapshot({ ...json, host: Array.from({ length: 1048577 }, () => [0, 0, 0]) }, W, W).ok).toBe(false);
  });

  it("never reaches the saved map: the project and the export are the same with claims in play", () => {
    const s = session();
    const c = claims();
    const project = JSON.stringify(s.document);
    ok(c.apply("host", { kind: "claim", runs: square(4, 4, 20, 12) }, NAMES));
    ok(c.apply("guest", { kind: "claim", runs: square(30, 30, 40, 40) }, NAMES));
    ok(c.apply("host", { kind: "offer", runs: square(4, 4, 8, 6) }, NAMES));
    // an edit refused for reaching into a claim leaves no mark either: the trial takes it back whole
    const op: EditOp = { op: "sculpt", params: { mode: "raise", cells: [run(35, 32, 34)], amount: 1 } };
    expect(refusal(op, c, "host", s, NAMES)).toBe("Reaches into Emma's area");
    expect(JSON.stringify(s.document)).toBe(project);
    expect(JSON.stringify(s.document)).not.toContain("claim");
    expect(Buffer.from(s.exportTimber().bytes).includes(Buffer.from("claim"))).toBe(false);
  });
});

describe("what an edit reaches (§3)", () => {
  it("brush strokes: every tool and option, no changed tile outside the footprint, the footprint inside the cautious band", () => {
    const s = session();
    const rnd = mulberry(7);
    const tools = ["raise", "lower", "flatten", "smooth", "naturalize"] as const;
    let changed = 0;
    for (let k = 0; k < 45; k++) {
      const tool = tools[k % 5];
      const cx = 8 + Math.floor(rnd() * 48);
      const cy = 8 + Math.floor(rnd() * 48);
      const dabs: number[] = [];
      for (let j = 0; j < 6; j++) dabs.push(4 * (cx + j) + 2, 4 * (cy + Math.floor(j / 2)) + 2);
      const params: Record<string, unknown> = { tool, size: 1 + Math.floor(rnd() * 5), strength: 1 + Math.floor(rnd() * 9), dabs };
      if (tool === "flatten") params.level = 8;
      else if (k % 7 === 0 && (tool === "raise" || tool === "lower")) params.target = 8;
      if (tool === "naturalize" && k % 2) params.weathers = true;
      if (k % 11 === 3) params.shape = "square";
      if (k % 13 === 4 && (tool === "raise" || tool === "lower")) {
        params.shape = "area";
        params.dabs = [4 * cx + 2, 4 * cy + 2, 4 * (cx + 5) + 2, 4 * (cy + 4) + 2];
      }
      if (k % 9 === 5) params.area = square(cx - 2, cy - 2, cx + 6, cy + 6);
      changed += held(s, [{ op: "brush", params } as unknown as EditOp], `brush ${k} ${tool}`).written;
    }
    expect(changed).toBeGreaterThan(200);
  });

  it("Select's actions on a shape, objects riding the ground, slopes: all inside", () => {
    const s = session();
    const cells = [...square(10, 10, 16, 14), run(15, 11, 14), run(16, 12, 13)];
    for (const [k, params] of [
      { mode: "raise", amount: 2 },
      { mode: "lower", amount: 1 },
      { mode: "flatten", level: 9 },
      { mode: "smooth" },
      { mode: "terrace", step: 2 },
    ].entries())
      held(s, [{ op: "sculpt", params: { cells, exact: true, ...params } } as unknown as EditOp], `sculpt ${params.mode}`);
    // a slope pinned and taken away
    const ground = s.built.heights;
    let at: [number, number] | null = null;
    for (let y = 21; y < 40 && !at; y++) for (let x = 21; x < 40 && !at; x++) if (ground[y * W + x] + 1 === ground[y * W + x + 1] && !s.built.entities.some((e) => Math.abs(e.x - x) < 2 && Math.abs(e.y - y) < 2)) at = [x, y];
    expect(at).not.toBeNull();
    const pin: EditOp = { op: "pinSlope", params: { x: at![0], y: at![1], orientation: "Cw0" } };
    if (s.check(pin).length === 0) {
      held(s, [pin], "pinSlope");
      held(s, [{ op: "removeSlope", params: { x: at![0], y: at![1] } }], "removeSlope");
    }
    // Remove / Select Delete on an area with trees and bushes in it
    const area = [...Array(20 * 20).keys()].map((k) => (20 + Math.floor(k / 20)) * W + 22 + (k % 20));
    const removed = planRemove(s, area, ["trees", "bushes", "ruins", "sources", "slopes", "objects"]);
    expect(removed.ok).toBe(true);
    if (removed.ok) held(s, removed.ops, "remove");
  });

  it("placing, moving, turning, setting and removing objects: the rotated footprint, old and new place", () => {
    const s = session();
    const free = (w: number, h: number): [number, number] => {
      for (let y = 6; y < W - 8; y++)
        for (let x = 6; x < W - 8; x++) {
          const plan = planEntity(s, { template: "MediumRelic", x, y, orientation: "Cw0" }, "d0000000-0000-4000-8000-000000000999");
          if (plan.ok && !s.built.entities.some((e) => Math.abs(e.x - x) < w && Math.abs(e.y - y) < h)) return [x, y];
        }
      throw new Error("no free ground");
    };
    const [x, y] = free(6, 6);
    let n = 0;
    const id = () => `d0000000-0000-4000-8000-0000000001${String(n++).padStart(2, "0")}`;
    const ids: string[] = [];
    for (const orientation of ["Cw0", "Cw90", "Cw180", "Cw270"] as const) {
      const rock = id();
      const plan = planEntity(s, { template: "MediumRelic", x: x + (n % 3) * 7, y, orientation }, rock);
      if (!plan.ok) continue;
      held(s, plan.ops, `place a relic ${orientation}`);
      ids.push(rock);
    }
    expect(ids.length).toBeGreaterThanOrEqual(2);
    // a 3 × 3 badwater source levels its nine tiles and rides the ground
    const badwater = planEntity(s, { template: "BadwaterSource", x: x + 3, y: y + 8, orientation: "Cw0" }, id());
    if (badwater.ok) held(s, badwater.ops, "place a badwater source");
    // move: its old and its new tiles
    const move = planMoveEntity(s, ids[0], 4, 3);
    if (move.ok) held(s, move.ops, "move");
    // setEntityProps: a water source's strength, with no change of ground at all
    const src = planEntity(s, { template: "WaterSource", x: x + 10, y: y + 10, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } }, id());
    expect(src.ok).toBe(true);
    if (src.ok) {
      held(s, src.ops, "place a source");
      const srcId = (src.ops.at(-1) as { params: { id: string } }).params.id;
      const set: EditOp = { op: "setEntityProps", params: { id: srcId, components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } } };
      const fp = footprintOf(set, s);
      expect(fp.tiles.tiles()).toEqual([(y + 10) * W + x + 10]);
      held(s, [set], "set a source's strength");
      held(s, [{ op: "deleteEntities", params: { entities: [srcId, ids[1]] } }], "delete objects");
    }
  });

  it("scattering objects with the paint brush: the tiles of the objects it plants", () => {
    const s = session();
    const op: EditOp = { op: "paintObjects", params: { kind: "trees", template: "Pine", area: square(30, 36, 44, 46), density: 0.3, seed: 4 } };
    const fp = footprintOf(op, s);
    expect(fp.tiles.count()).toBeGreaterThan(0);
    held(s, [op], "paint trees");
  });

  it("a feature operation has its real footprint where there is one: the start its bench, a lock nothing; any other rebuilds the map", () => {
    const s = session();
    const start = s.features.find((f) => f.kind === "start")!;
    const move: EditOp = { op: "updateFeature", params: { id: start.id, patch: { params: { position: [40, 20], benchLevel: s.built.heights[20 * W + 40] } } } };
    const fp = footprintOf(move, s);
    expect(fp.whole).toBe(false);
    expect(fp.tiles.has(20 * W + 40)).toBe(true);
    expect(fp.tiles.count()).toBeLessThan(200);
    // a lock toggled writes nothing, and the host's trial agrees
    const other = s.features.find((f) => f.kind !== "start")!;
    const lock: EditOp = { op: "updateFeature", params: { id: other.id, patch: { locked: true } } };
    expect(footprintOf(lock, s).tiles.count()).toBe(0);
    expect(footprintOf(lock, s).whole).toBe(false);
    const locked = trialWrites(s, lock);
    expect(locked.ok && locked.writes.size).toBe(0);
    // a feature's parameters change land the build decides on: the whole map until it is known
    const edit: EditOp = { op: "updateFeature", params: { id: other.id, patch: { params: {} } } };
    const wide = footprintOf(edit, s);
    expect(wide.whole).toBe(true);
    expect(wide.tiles.count()).toBe(W * W);
    held(s, [move], "move the start");
  });
});

describe("the refusal (§3)", () => {
  const raise = (cells: [number, number, number][]): EditOp => ({ op: "sculpt", params: { mode: "raise", cells, exact: true, amount: 1 } });

  it("refuses an edit that reaches into the other's claim, allows the rest, and refuses a step whole", () => {
    const s = session();
    // her claim an 11 x 11 block of bare ground; his a block beside it
    const [bx, by] = bare(s, 24, 14);
    const gx0 = bx + 12, gy0 = by + 2, gx1 = gx0 + 10, gy1 = gy0 + 10;
    const c = new ClaimsState(W, W);
    expect(c.apply("guest", { kind: "claim", runs: square(gx0, gy0, gx1, gy1) }, NAMES).ok).toBe(true);
    expect(c.apply("host", { kind: "claim", runs: square(bx, by, bx + 8, by + 8) }, NAMES).ok).toBe(true);
    const mid = gy0 + 5;
    // inside her claim, at its edge, one tile in: refused, naming her
    expect(refusal(raise([run(gy0, gx0, gx0)]), c, "host", s, NAMES)).toBe("Reaches into Emma's area");
    expect(refusal(raise([run(mid, gx0 - 6, gx0 + 1)]), c, "host", s, NAMES)).toBe("Reaches into Emma's area");
    // beside it, on unclaimed ground, and in one's own claim: allowed
    expect(refusal(raise([run(gy0 - 1, gx0, gx1)]), c, "host", s, NAMES)).toBeNull();
    expect(refusal(raise([run(mid, gx0 - 6, gx0 - 1)]), c, "host", s, NAMES)).toBeNull();
    expect(refusal(raise([run(by + 4, bx + 1, bx + 7)]), c, "host", s, NAMES)).toBeNull();
    // the same edit from the other side
    expect(refusal(raise([run(mid, gx0 + 1, gx0 + 2)]), c, "guest", s, NAMES)).toBeNull();
    expect(refusal(raise([run(by + 4, bx + 1, bx + 7)]), c, "guest", s, NAMES)).toBe("Reaches into Kyler's area");
    // a group: one op reaching in refuses all of it
    expect(refusal([raise([run(by + 12, bx, bx + 4)]), raise([run(mid, gx0 + 1, gx0 + 1)])], c, "host", s, NAMES)).toBe("Reaches into Emma's area");
    expect(refusal([raise([run(by + 12, bx, bx + 4)]), raise([run(mid, gx0 - 3, gx0 - 3)])], c, "host", s, NAMES)).toBeNull();
    // a brush stroke's disc reaches only as far as the disc: dabs a few tiles away, then one that touches
    const stroke = (...at: number[]): EditOp => ({ op: "brush", params: { tool: "raise", size: 1, strength: 5, dabs: at.flatMap((x) => [4 * x + 2, 4 * mid + 2]) } });
    expect(refusal(stroke(gx0 - 4, gx0 - 3), c, "host", s, NAMES)).toBeNull();
    expect(refusal(stroke(gx0 - 4, gx0 - 3, gx0 + 1), c, "host", s, NAMES)).toBe("Reaches into Emma's area");
    // no claims held by the other: nothing to reach into
    expect(refusal(raise([run(mid, gx0 + 1, gx0 + 2)]), new ClaimsState(W, W), "host", s, NAMES)).toBeNull();
    // a stroke that changes nothing there still counts: it was aimed at that ground
    const flat: EditOp = { op: "brush", params: { tool: "lower", size: 1, strength: 5, target: 22, dabs: [4 * (gx0 + 2) + 2, 4 * mid + 2] } };
    expect(refusal(flat, c, "host", s, NAMES)).toBe("Reaches into Emma's area");
  });

  it("takes the write mask of an applied entry directly, as a footprint, a mask, bytes or tiles", () => {
    const c = new ClaimsState(W, W);
    c.apply("guest", { kind: "claim", runs: square(30, 30, 40, 40) }, NAMES);
    const inside = 35 * W + 35;
    const beside = 35 * W + 20;
    const mask = new TileMask(W, W).add(beside).add(inside);
    expect(refusalForWrites(mask, c, "host", NAMES)).toBe("Reaches into Emma's area");
    expect(refusalForWrites(new TileMask(W, W).add(beside), c, "host", NAMES)).toBeNull();
    const bytes = new Uint8Array(W * W);
    bytes[inside] = 1;
    expect(refusalForWrites(bytes, c, "host", NAMES)).toBe("Reaches into Emma's area");
    expect(refusalForWrites([beside, 7], c, "host", NAMES)).toBeNull();
    expect(refusalForWrites([beside, inside], c, "host", NAMES)).toBe("Reaches into Emma's area");
    expect(refusalForWrites({ has: (i) => i === inside }, c, "host", NAMES)).toBe("Reaches into Emma's area");
    expect(refusalForWrites({ tiles: mask, whole: false }, c, "host", NAMES)).toBe("Reaches into Emma's area");
    // the tiles that would land there, for the page to show in her colour
    expect(reachInto(mask, c, "host")).toEqual([inside]);
    expect(reachInto(mask, c, "guest")).toEqual([]);
  });
});

describe("the cautious band while drawing (§3)", () => {
  it("is quick, and only ever wider than the footprint: it may warn at a border where the stroke would not really reach", () => {
    const s = session();
    const [bx, by] = bare(s, 24, 14);
    const dabs = [4 * (bx + 4) + 2, 4 * (by + 6) + 2, 4 * (bx + 5) + 2, 4 * (by + 6) + 2, 4 * (bx + 6) + 2, 4 * (by + 7) + 2];
    for (const tool of ["raise", "smooth"] as const) {
      const op: EditOp = { op: "brush", params: { tool, size: 3, strength: 5, dabs } };
      const fp = footprintOf(op, s);
      const band = bandOf(op, s);
      expect(outside(fp.tiles, band.tiles)).toBe(0);
      expect(band.tiles.count()).toBeGreaterThanOrEqual(fp.tiles.count());
    }
    // her claim a tile past the disc: the footprint does not reach it, the band does, in her tiles
    const op: EditOp = { op: "brush", params: { tool: "raise", size: 3, strength: 5, dabs } };
    const fp = footprintOf(op, s);
    const band = bandOf(op, s);
    let edge = -1;
    for (let x = bx + 7; x < bx + 20 && edge < 0; x++) if (!fp.tiles.has((by + 7) * W + x) && band.tiles.has((by + 7) * W + x)) edge = x;
    expect(edge).toBeGreaterThan(0);
    const c = new ClaimsState(W, W);
    c.apply("guest", { kind: "claim", runs: square(edge, by + 5, edge + 5, by + 9) }, NAMES);
    expect(refusal(op, c, "host", s, NAMES)).toBeNull();
    expect(reachInto(fp, c, "host")).toEqual([]);
    expect(reachInto(band, c, "host").length).toBeGreaterThan(0);
  });
});

describe("forces: the plan's footprint and the gesture's band, held against what the host records", () => {
  beforeAll(() => {
    ed.openProject(bytes);
  }, 300_000);

  it("a Craterize and an aimed Carve", () => {
    const at: [number, number] = [32, 28];
    expect(holdForce({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 50 }, origin: at, cut: null } as unknown as ed.ForceRequest)).not.toBeNull();
    expect(holdForce({ verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", power: 60 }, origin: at, end: [at[0] + 14, at[1] + 6], cut: null } as unknown as ed.ForceRequest)).not.toBeNull();
  }, 120_000);

  it("a force reaching into a claim is refused from its plan; Try another counts the force it replaces", () => {
    const mirror = open();
    const request = { verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 15 }, origin: [30, 30], cut: null } as unknown as ed.ForceRequest;
    const first = planOf(request)!;
    expect(first).not.toBeNull();
    const c = new ClaimsState(W, W);
    c.apply("guest", { kind: "claim", runs: square(26, 26, 32, 32) }, NAMES);
    expect(refusal(first, c, "host", mirror, NAMES)).toBe("Reaches into Emma's area");
    expect(refusal(first, c, "guest", mirror, NAMES)).toBeNull();
    // her claim in a corner the crater does not reach
    const fp = footprintOf(first, mirror);
    const reached = (x: number, y: number) => fp.tiles.tiles().some((i) => i % W >= x && i % W < x + 5 && Math.floor(i / W) >= y && Math.floor(i / W) < y + 5);
    const corner = ([[0, 0], [W - 5, 0], [0, W - 5], [W - 5, W - 5]] as [number, number][]).find(([x, y]) => !reached(x, y));
    expect(corner).toBeDefined();
    const far = new ClaimsState(W, W);
    far.apply("guest", { kind: "claim", runs: square(corner![0], corner![1], corner![0] + 4, corner![1] + 4) }, NAMES);
    expect(refusal(first, far, "host", mirror, NAMES)).toBeNull();
    // the gesture's band says it too, in her tiles, before the plan is complete
    const force = first.find((o) => o.op === "forceResult");
    const band = forceBand({ verb: "craterize", settings: (force as unknown as { params: { settings: never } }).params.settings, origin: [30, 30] }, mirror);
    expect(reachInto(band, c, "host").length).toBeGreaterThan(0);
    // Try another: the force is kept, then replaced by the next seed; the footprint holds both
    const kept = open();
    const n1 = decodeProject(ed.project().bytes).edits.length;
    expect(ed.forceAgain().errors).toEqual([]);
    for (let k = 0; k < 400 && !ed.forceAdvance(8)!.done; k++);
    expect(ed.forceStop().errors).toEqual([]);
    const second = decodeProject(ed.project().bytes).edits.slice(n1).map((e) => ({ op: e.op, params: e.params }) as EditOp);
    expect((second.find((o) => o.op === "forceResult") as { params: { replaces?: number } }).params.replaces).toBeDefined();
    const fp2 = footprintOf(second, kept);
    const written = trialWrites(kept, second);
    expect(written.ok).toBe(true);
    // every tile the host records is in the footprint, but for an object the replaced force had removed that
    // stands again (its place is not in the map this footprint reads; the host's record holds it)
    const prior = (first.find((o) => o.op === "forceResult") as unknown as { params: { removed: string[]; tiles: number[] } }).params;
    kept.applyAll(second);
    const restored = new Set(kept.built.entities.filter((e) => prior.removed.includes(e.id)).map((e) => e.y * W + e.x));
    if (written.ok) for (const i of written.writes.tiles()) if (!fp2.tiles.has(i)) expect(restored.has(i), `tile ${i} escapes the footprint`).toBe(true);
    // the force it replaced is in it, so a claim only the first force reached still refuses the second
    for (const i of prior.tiles) expect(fp2.tiles.has(i)).toBe(true);
    ed.undo();
    ed.undo();
  }, 120_000);
});

describe("the host's check (#397's seam): claimsCheck", () => {
  const NAMES2: PlayerNames = { host: "Ada", guest: "Bo" };
  const roleOf = (a: string): Role => (a === HOST ? "host" : "guest");
  const crater = (x: number, y: number, seed = 5, debris = "heavy", size = 16, power = 80, rays = false) => ({ kind: "force", gesture: { id: GUID(5000 + seed), request: { verb: "craterize", settings: { mode: "strike", power, size, walls: "terraced", centre: "auto", debris, rays, seed }, origin: [x, y], cut: null, natural: true } } }) as never;
  const stroke = (x: number, y: number): never => ({ kind: "edit", label: "Raise", ops: [{ op: "brush", params: { tool: "raise", size: 2, strength: 8, dabs: [4 * x + 2, 4 * y + 2, 4 * (x + 1) + 2, 4 * y + 2] } }] }) as never;

  it("refuses an entry that wrote into the other's area and takes it back; each player edits their own area", () => {
    const claims = new ClaimsState(W, W);
    const t = sit(bytes, { check: claimsCheck(() => claims, roleOf, NAMES2) }, [GUEST]);
    const [bx, by] = bare(t.host.session, 30, 14);
    claims.apply("host", { kind: "claim", runs: square(bx, by, bx + 10, by + 10) }, NAMES2);
    claims.apply("guest", { kind: "claim", runs: square(bx + 16, by, bx + 26, by + 10) }, NAMES2);
    const mine = stroke(bx + 5, by + 5);
    const hers = stroke(bx + 21, by + 5);
    const reason = (a: { kind: string }) => (a.kind === "reject" ? (a as unknown as { reason: string }).reason : "ordered");
    // the host edits his own area (the author is an id, not a role: he is not refused in his own claim)
    expect(reason(act(t, HOST, mine))).toBe("ordered");
    const hash = t.host.hash();
    const seq = t.host.seq;
    // into hers: refused, one plain line, the sequence does not advance, nothing is left of it
    expect(reason(act(t, HOST, hers))).toBe("Reaches into Bo's area");
    expect(t.host.seq).toBe(seq);
    expect(t.host.hash()).toBe(hash);
    expect(t.guests.get(GUEST)!.hash()).toBe(hash);
    // she edits hers, outside both, and is refused in his
    expect(reason(act(t, GUEST, hers))).toBe("ordered");
    expect(reason(act(t, GUEST, stroke(58, 58)))).toBe("ordered");
    expect(reason(act(t, GUEST, mine))).toBe("Reaches into Ada's area");
    // a player the claims do not know is refused, not taken for the host
    const check = claimsCheck(() => claims, () => undefined as unknown as Role, NAMES2);
    expect(check({ author: "x" } as never, { writes: new Mask(W * W) } as never, t.host as never)).toBe("That player has no place in the claims");
    // nothing is held: nothing is refused
    const none = new ClaimsState(W, W);
    expect(claimsCheck(() => none, roleOf)({ author: GUEST } as never, { writes: new Mask(W * W).add(1), keys: [] } as never, t.host as never)).toBeNull();
  }, 120_000);

  it("a crater's knocked-down trees count: they lie on ground the crater did not change", () => {
    // a Light crater with Rays at the middle fells twelve generated trees; the record's patch has no tile for them
    const gesture = crater(32, 32, 5, "light", 24, 60, true);
    const probe = sit(bytes, {}, [GUEST]);
    let extra: number[] = [];
    probe.host.setCheck((_e, record, state) => {
      const all = writtenBy({ writes: record.writes, keys: record.keys }, state.session);
      extra = all.tiles().filter((i) => !record.writes.has(i));
      return "probe";
    });
    act(probe, HOST, gesture);
    expect(extra.length, "no tree felled off the ground the record says was written").toBeGreaterThan(0);
    // her claim is one such tree's ground, and nothing else the crater wrote: the record alone lets it through
    const claims = new ClaimsState(W, W);
    const tile = extra[0];
    claims.apply("guest", { kind: "claim", runs: [run(Math.floor(tile / W), tile % W, tile % W)] }, NAMES2);
    const t = sit(bytes, {}, [GUEST]);
    const seam = claimsCheck(() => claims, roleOf, NAMES2);
    t.host.setCheck((entry, record, state) => {
      expect(refusalForWrites(record.writes, claims, "host", NAMES2), "the record alone").toBeNull();
      return seam(entry, record, state);
    });
    const answer = act(t, HOST, gesture);
    expect(answer.kind).toBe("reject");
    expect((answer as unknown as { reason: string }).reason).toBe("Reaches into Bo's area");
    expect(t.host.seq).toBe(0);
  }, 120_000);
});

describe("water notes (§4)", () => {
  const roleOf = (a: string): Role => (a === "kyler" ? "host" : "guest");
  it("notes whose edits flooded the other's area and where, and nothing for an edit far from it", () => {
    const s = session("canonical");
    const claims = new ClaimsState(W, W);
    // hers beside the spring's flood, his own elsewhere
    claims.apply("guest", { kind: "claim", runs: square(46, 33, 54, 43) }, NAMES);
    claims.apply("host", { kind: "claim", runs: square(2, 6, 12, 14) }, NAMES);
    const before = Float64Array.from(s.built.water);
    const plan = planEntity(s, { template: "WaterSource", x: 40, y: 30, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 3, CurrentStrength: 3 } } }, "d0000000-0000-4000-8000-000000000a01");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(s.applyAll(plan.ops).errors).toEqual([]);
    // the water flows across her claim: the edit was never refused for it
    expect(refusal(plan.ops, claims, "host", s, NAMES)).toBeNull();
    const batch = [{ author: "kyler", seq: 7 }];
    const note = waterNote(before, s.built.water, claims, "guest", batch, roleOf);
    expect(note).not.toBeNull();
    if (!note) return;
    expect(note.by).toBe("host");
    expect(note.owner).toBe("guest");
    expect(note.edits).toBe(1);
    expect(note.seqs).toEqual({ from: 7, to: 7 });
    expect(note.flooded).toBeGreaterThan(3);
    expect(note.drained).toBe(0);
    expect(note.tiles).toBe(note.flooded);
    // where: inside her area, the centre one of the flooded tiles
    expect(note.bounds.x0).toBeGreaterThanOrEqual(46);
    expect(note.bounds.x1).toBeLessThanOrEqual(54);
    expect(note.bounds.y0).toBeGreaterThanOrEqual(33);
    expect(note.bounds.y1).toBeLessThanOrEqual(43);
    const centre = note.centre.y * W + note.centre.x;
    expect(claims.ownerOf(centre)).toBe("guest");
    expect(s.built.water[centre] - before[centre]).toBeGreaterThanOrEqual(0.25);
    expect(note.runs.reduce((n, [, a, b]) => n + b - a + 1, 0)).toBe(note.tiles);
    expect(describeWaterNote(note, NAMES)).toMatch(/^Kyler's edit flooded \d+ tiles of your area$/);
    // the batch settled together: three of his edits and one of hers are named as his three; hers alone is no note for her
    const mixed = [{ author: "kyler", seq: 5 }, { author: "emma", seq: 6 }, { author: "kyler", seq: 7 }, { author: "kyler", seq: 8 }];
    const named = waterNote(before, s.built.water, claims, "guest", mixed, roleOf)!;
    expect(named.edits).toBe(3);
    expect(named.seqs).toEqual({ from: 5, to: 8 });
    expect(describeWaterNote(named, NAMES)).toMatch(/^Kyler's 3 edits flooded \d+ tiles of your area$/);
    expect(waterNote(before, s.built.water, claims, "guest", [{ author: "emma", seq: 7 }], roleOf)).toBeNull();
    // (and his own area is watched too: the flood did not reach it)
    expect(waterNotes(before, s.built.water, claims, mixed, roleOf).map((n) => n.owner)).toEqual(["guest"]);
    // draining: the spring taken away again
    const flooded = Float64Array.from(s.built.water);
    s.undo();
    const drained = waterNote(flooded, s.built.water, claims, "guest", batch, roleOf);
    expect(drained?.drained).toBe(note.flooded);
    expect(drained?.flooded).toBe(0);
    expect(describeWaterNote(drained!, NAMES)).toMatch(/^Kyler's edit drained \d+ tiles of your area$/);
    // nothing for an edit that leaves the water alone: a hill raised far from her area
    const dry = Float64Array.from(s.built.water);
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: [run(54, 4, 8)], exact: true, amount: 1 } }).errors).toEqual([]);
    expect(waterNote(dry, s.built.water, claims, "guest", batch, roleOf)).toBeNull();
    // and none where nobody else holds ground
    expect(waterNote(before, flooded, new ClaimsState(W, W), "guest", batch, roleOf)).toBeNull();
    // a trace of change is the settle's noise, not an event
    const trace = Float64Array.from(before);
    for (let i = 0; i < trace.length; i++) trace[i] += 0.01;
    expect(waterNote(before, trace, claims, "guest", batch, roleOf)).toBeNull();
    // two tiles are not worth a note either; the threshold and the count can be asked for
    const two = Float64Array.from(before);
    two[36 * W + 48] += 1;
    two[36 * W + 49] += 1;
    expect(waterNote(before, two, claims, "guest", batch, roleOf)).toBeNull();
    expect(waterNote(before, two, claims, "guest", batch, roleOf, { minTiles: 2 })?.tiles).toBe(2);
    expect(waterNote(before, two, claims, "guest", batch, roleOf, { minTiles: 2, threshold: 2 })).toBeNull();
    // badwater reaching her area, when contamination is given
    const clean = new Float64Array(W * W);
    const fouled = Float64Array.from(clean);
    for (let x = 47; x < 53; x++) fouled[36 * W + x] = 0.5;
    const foul = waterNote(before, before, claims, "guest", batch, roleOf, { contamination: { before: clean, after: fouled } });
    expect(foul?.fouled).toBe(6);
    expect(foul?.flooded).toBe(0);
    expect(describeWaterNote(foul!, NAMES)).toBe("Kyler's edit fouled 6 tiles of your area");
  });
});
