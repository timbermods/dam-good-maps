// Collaborative editing's core (docs/COLLAB-BRIEF.md, D362, D486): a host orders the edits of two
// players, a replica rebuilds the map from the ordered list, and what the players made directly is the
// same on both at every entry while the water settles in the background. After the settle both hold
// the same map: the same exported .timber bytes and the same project document. Each applied step's
// record is checked against the map before and after it (patch, writes, touches).

import { beforeAll, describe, expect, test } from "vitest";
import { applyPatch, captureState, cloneState, recordFromJson, recordToJson, stateHash, type MapState } from "../../src/core/collab";
import { startMiddle } from "../../src/core/doc/start";
import type { EditOp } from "../../src/core/doc/ops";
import { planFill, unfedWater } from "../../src/core/doc/waterEdits";
import { act, BRUSH_KINDS, CHEAP_KINDS, expectIdentical, FORCE_KINDS, GUEST, GUID, HOST, KINDS, mapProject, settle, sit, Stream, type Kind, type Table } from "./collabFixtures";

const SIZE = 48;

interface Tally {
  committed: Map<string, number>;
  patches: number;
}

/** The record the host kept for an entry, against the map before and after it. */
function expectRecord(t: Table, seq: number, author: string, kind: string, before: MapState, tally: Tally) {
  const after = captureState(t.host.session);
  tally.committed.set(kind, (tally.committed.get(kind) ?? 0) + 1);
  const record = t.host.records.get(seq)!;
  expect(record.author).toBe(author);
  expect(record.ops.length, `${kind} keeps its operations`).toBeGreaterThan(0);
  // the patch carries the literal values: forward from before is after, backward from after is before
  const forward = cloneState(before);
  applyPatch(forward, record.patch);
  expect(stateHash(forward), `${kind} patch forward`).toBe(stateHash(after));
  expect(forward.heights).toEqual(after.heights);
  const back = cloneState(after);
  applyPatch(back, record.patch, true);
  expect(stateHash(back), `${kind} patch back`).toBe(stateHash(before));
  // every tile that changed is written, and everything written is touched
  for (const [i] of record.patch.ground) expect(record.writes.has(i)).toBe(true);
  for (const i of record.writes.tiles()) expect(record.touch.has(i)).toBe(true);
  if (FORCE_KINDS.includes(kind as Kind)) expect(record.touch.size, `${kind} reads the whole map`).toBe(SIZE * SIZE);
  // the same record, by its JSON form
  const roundTrip = recordFromJson(SIZE * SIZE, JSON.parse(JSON.stringify(recordToJson(record))));
  expect(roundTrip.writes.toRuns()).toEqual(record.writes.toRuns());
  expect(roundTrip.patch).toEqual(record.patch);
  expect(roundTrip.ops).toEqual(record.ops);
  tally.patches += record.patch.ground.length;
}

/** One step by one author; true when the host ordered it. */
function step(t: Table, stream: Stream, author: string, kind: Kind, tally: Tally): boolean {
  const command = stream.command(kind, t.host.session);
  if (!command) return false;
  const before = captureState(t.host.session);
  const answer = act(t, author, command);
  if (answer.kind !== "commit") return false;
  expectRecord(t, answer.entry.seq, author, kind, before, tally);
  return true;
}

describe("a host and a replica on a generated map", () => {
  let bytes: Uint8Array;
  beforeAll(() => {
    bytes = mapProject(5, "highlands", SIZE);
  });

  test("mixed edits from two players leave identical maps once the water has settled", () => {
    const t = sit(bytes, {}, [GUEST]);
    const stream = new Stream(5, SIZE);
    const tally: Tally = { committed: new Map(), patches: 0 };
    // placed objects first, so moving, changing and removing have something to work on
    for (let n = 0; n < 4; n++) step(t, stream, n % 2 ? GUEST : HOST, "place", tally);
    const pool: Kind[] = [...CHEAP_KINDS, ...CHEAP_KINDS, "carve", "craterize", "erupt", "lift", "glaciate", "rift", "deposit"];
    for (let n = 0; n < 8; n++) step(t, stream, stream.pick([HOST, GUEST]), stream.pick(pool), tally);
    expectIdentical(t, `after ${t.ordered} entries`);
    // every kind of edit, by a different author each time
    for (const [k, kind] of KINDS.entries()) {
      let ok = (tally.committed.get(kind) ?? 0) > 0;
      for (let tries = 0; tries < 8 && !ok; tries++) ok = step(t, stream, k % 2 ? GUEST : HOST, kind, tally);
      expect(ok, `${kind} was applied at least once`).toBe(true);
    }
    expectIdentical(t, `at the end, after ${t.ordered} entries`);
    expect(t.settles).toBeGreaterThan(1);
    expect(tally.patches).toBeGreaterThan(60);
    for (const kind of [...BRUSH_KINDS, ...FORCE_KINDS]) expect(tally.committed.get(kind), kind).toBeGreaterThan(0);
    // each player's actions are in the records, in order, the same on both peers
    expect(t.host.records.byAuthor(HOST).length).toBeGreaterThan(0);
    expect(t.host.records.byAuthor(GUEST).length).toBeGreaterThan(0);
    expect(t.guests.get(GUEST)!.records.all().map((r) => recordToJson(r))).toEqual(t.host.records.all().map((r) => recordToJson(r)));
  });

  test("the edits the stream does not make: weathering, placement strokes, groups, features, slopes", () => {
    const t = sit(bytes, {}, [GUEST]);
    const tally: Tally = { committed: new Map(), patches: 0 };
    const s = t.host.session;
    let n = 0;
    const edit = (kind: string, author: string, ops: EditOp[]) => {
      settle(t);
      const before = captureState(s);
      const answer = act(t, author, { kind: "edit", ops, label: kind });
      expect(answer.kind === "reject" ? answer.reason : "ordered", kind).toBe("ordered");
      if (answer.kind === "commit") expectRecord(t, answer.entry.seq, author, kind, before, tally);
      n++;
    };
    // a weathering Naturalize stroke: its rim, shore and kept ground are worked out on the settled map by every peer
    const dabs = [60, 60, 80, 70, 100, 80, 120, 90, 140, 100, 80, 120];
    edit("weathering", HOST, [{ op: "brush", params: { tool: "naturalize", size: 6, strength: 10, seed: 7, weathers: true, dabs } } as EditOp]);
    // a placement stroke, expanded by the host into the objects it placed
    const area: [number, number, number][] = [];
    for (let y = 30; y < 38; y++) area.push([y, 20, 30]);
    edit("paintObjects", GUEST, [{ op: "paintObjects", params: { kind: "trees", template: "Pine", area, density: 0.4, seed: 3 } } as EditOp]);
    expect(t.host.records.get(t.host.seq)!.ops.every((o) => o.op === "placeEntity")).toBe(true);
    // a group of several operations is one step
    edit("group", HOST, [
      { op: "brush", params: { tool: "raise", size: 4, strength: 10, dabs: [40, 40, 60, 48] } } as EditOp,
      { op: "brush", params: { tool: "lower", size: 3, strength: 10, dabs: [120, 120, 130, 126] } } as EditOp,
    ]);
    expect(t.host.records.get(t.host.seq)!.ops.length).toBe(2);
    // features: add, change, reorder and delete one
    const box: [number, number, number][] = [];
    for (let y = 8; y < 13; y++) box.push([y, 8, 16]);
    const id = GUID(777);
    const forest = { id, kind: "forest", origin: "user", locked: false, params: { area: box, density: 0.7, speciesMix: { Birch: 1 }, life: "auto", youngShare: 0.2 } };
    edit("addFeature", GUEST, [{ op: "addFeature", params: { feature: forest } } as unknown as EditOp]);
    edit("updateFeature", HOST, [{ op: "updateFeature", params: { id, patch: { params: { density: 0.4 } } } } as EditOp]);
    expect(t.host.records.get(t.host.seq)!.ops[0].undo, "a feature operation keeps its undo data with its record").toBeTruthy();
    edit("reorderFeature", GUEST, [{ op: "reorderFeature", params: { id, index: 0 } } as EditOp]);
    edit("deleteFeature", HOST, [{ op: "deleteFeature", params: { id } } as EditOp]);
    // slopes
    edit("pinSlope", GUEST, [{ op: "pinSlope", params: { x: 24, y: 24, orientation: "Cw0" } } as EditOp]);
    settle(t);
    const slope = s.built.entities.find((e) => e.template === "Slope" && e.x === 24 && e.y === 24);
    expect(slope, "the pinned slope stands").toBeTruthy();
    edit("removeSlope", HOST, [{ op: "removeSlope", params: { x: 24, y: 24 } } as EditOp]);
    expect(t.refused).toEqual([]);
    expectIdentical(t, `after ${n} special edits`);
    expect(tally.committed.size).toBeGreaterThanOrEqual(8);
  });

  test("the start carried by a Select action and by a force, and Unleash from a placed source", () => {
    const t = sit(bytes, {}, [GUEST]);
    const s = t.host.session;
    const at = startMiddle(s)!;
    const startAt = () => s.built.entities.find((e) => e.template === "StartingLocation")!;
    const where0 = `${startAt().x},${startAt().y}`;
    // Select raises the ground under the start: the host carries the start in the same step, from the tiles it worked out
    const cells: [number, number, number][] = [];
    for (let y = at[1] - 2; y <= at[1] + 2; y++) cells.push([y, at[0], at[0] + 2]);
    const lifted = act(t, GUEST, { kind: "select", label: "Select: raise", ops: [{ op: "sculpt", params: { mode: "raise", cells, amount: 3 } } as EditOp] });
    expect(lifted.kind === "reject" ? lifted.reason : "ordered").toBe("ordered");
    expect(`${startAt().x},${startAt().y}`, "the start was carried").not.toBe(where0);
    // a force over the start: Craterize carries it again
    const crater = act(t, HOST, { kind: "force", gesture: { id: GUID(901), request: { verb: "craterize", settings: { mode: "strike", power: 80, size: 20, walls: "terraced", centre: "auto", debris: "heavy", rays: false, seed: 5 }, origin: [startAt().x, startAt().y], cut: null, natural: true } } });
    expect(crater.kind === "reject" ? crater.reason : "ordered").toBe("ordered");
    // Unleash: a source the players placed carves its own river
    settle(t);
    let placed: string | null = null;
    for (let tries = 0; tries < 30 && !placed; tries++) {
      const id = GUID(1000 + tries);
      const x = 8 + ((tries * 7) % 30);
      const y = 8 + ((tries * 11) % 30);
      const op = { op: "placeEntity", params: { id, template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } } } as EditOp;
      if (s.check(op).length) continue;
      const a = act(t, HOST, { kind: "edit", label: "Place source", ops: [op] });
      if (a.kind === "commit") placed = `${id}|${x}|${y}`;
    }
    expect(placed, "a source was placed").toBeTruthy();
    const [sid, sx, sy] = placed!.split("|");
    const unleash = act(t, GUEST, { kind: "force", gesture: { id: GUID(902), request: { verb: "carve", settings: { mode: "unleash", power: 70, wander: 35, width: null, seed: 4, walls: "steep", defyGravity: false, dry: false, layers: true }, origin: [Number(sx), Number(sy)], source: sid, cut: null, natural: true }, sourceId: GUID(903) } });
    expect(unleash.kind === "reject" ? unleash.reason : "ordered", "Unleash from the placed source").toBe("ordered");
    expectIdentical(t, "after the start and Unleash");
  });

  test("Fill and Remove unfed water, which are checked against the settled water on every peer", () => {
    const t = sit(bytes, {}, [GUEST]);
    const s = t.host.session;
    settle(t);
    const { W } = s.built;
    // a stepped pit on a plateau: flatten high ground, lower a 5x5 patch a level and a 3x3 patch in it a level more, then fill to the inner pit's rim
    let top = 0;
    let cx = 24;
    let cy = 24;
    for (let y = 6; y < W - 6; y++) for (let x = 6; x < W - 6; x++) if (s.built.heights[y * W + x] > top) [top, cx, cy] = [s.built.heights[y * W + x], x, y];
    const rect = (r: number): [number, number, number][] => Array.from({ length: 2 * r + 1 }, (_, k): [number, number, number] => [cy - r + k, cx - r, cx + r]);
    const level = Math.max(4, top - 1);
    for (const [label, op] of [
      ["Flatten", { op: "sculpt", params: { mode: "flatten", cells: rect(4), level } }],
      ["Lower", { op: "sculpt", params: { mode: "lower", cells: rect(2), amount: 1 } }],
      ["Lower", { op: "sculpt", params: { mode: "lower", cells: rect(1), amount: 1 } }],
    ] as [string, EditOp][]) {
      const dug = act(t, HOST, { kind: "select", label, ops: [op] });
      expect(dug.kind === "reject" ? dug.reason : "ordered", label).toBe("ordered");
    }
    settle(t);
    const plan = planFill(s, cx, cy, level - 1);
    expect(plan.reason).toBeNull();
    const fill = plan.op;
    const filled = act(t, GUEST, { kind: "edit", label: "Fill", ops: [fill!] });
    expect(filled.kind === "reject" ? filled.reason : "ordered").toBe("ordered");
    settle(t);
    const unfed = unfedWater(s).op;
    expect(unfed, "the fill's water has no source").toBeTruthy();
    const removed = act(t, HOST, { kind: "edit", label: "Remove unfed water", ops: [unfed!] });
    expect(removed.kind === "reject" ? removed.reason : "ordered").toBe("ordered");
    expect(t.host.records.get(t.host.seq)!.keys).toContain("lakes");
    expectIdentical(t, "after Fill and Remove unfed water");
  });
});
