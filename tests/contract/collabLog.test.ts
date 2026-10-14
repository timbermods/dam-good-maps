// Collaborative editing's core (docs/COLLAB-BRIEF.md, D362, D486): a host orders the edits of two
// players, two replicas rebuild the map from the ordered list, and at every checkpoint all three hold
// the same map: the same exported .timber bytes (terrain and settled water) and the same project bytes.
// Each applied step's record is checked against the map before and after it (patch, writes, touches).

import { beforeAll, describe, expect, test } from "vitest";
import { applyPatch, captureState, cloneState, recordFromJson, recordToJson, stateHash, type MapState } from "../../src/core/collab";
import type { ThemeId } from "../../src/core/spec/mapspec";
import { act, BRUSH_KINDS, CHEAP_KINDS, FORCE_KINDS, GUEST, HOST, KINDS, mapProject, sameProject, sit, Stream, WATCHER, type Kind, type Table } from "./collabFixtures";

const SIZE = 48;
const MAPS: { name: string; seed: number; theme: ThemeId }[] = [
  { name: "highlands, seed 5", seed: 5, theme: "highlands" },
  { name: "canyon, seed 9", seed: 9, theme: "canyon" as ThemeId },
];

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && Buffer.compare(a, b) === 0;

/** Everything the three peers hold is the same: the file the game loads and the project the app saves. */
function expectIdentical(t: Table, where: string) {
  const exported = t.host.session.exportTimber().bytes;
  const project = t.host.session.project();
  for (const g of t.guests.values()) {
    expect(g.status, where).toBe("live");
    expect(g.seq, where).toBe(t.host.seq);
    expect(g.hash(), `${g.playerId} hash ${where}`).toBe(t.host.hash());
    expect(same(g.session.exportTimber().bytes, exported), `${g.playerId} .timber ${where}`).toBe(true);
    expect(sameProject(g.session.project(), project), `${g.playerId} project ${where}`).toBe(true);
  }
}

interface Tally {
  committed: Map<Kind, number>;
  patches: number;
}

/** One step by one author; the record the host kept is checked against the map before and after. */
function step(t: Table, stream: Stream, author: string, kind: Kind, tally: Tally): boolean {
  const command = stream.command(kind, t.host.session);
  if (!command) return false;
  const before = captureState(t.host.session);
  const answer = act(t, author, command);
  if (answer.kind !== "commit") return false;
  const after = captureState(t.host.session);
  tally.committed.set(kind, (tally.committed.get(kind) ?? 0) + 1);
  const record = t.host.records.get(answer.entry.seq)!;
  expect(record.author).toBe(author);
  // the patch carries the literal values: forward from before is after, backward from after is before
  const forward = cloneState(before);
  applyPatch(forward, record.patch);
  expect(stateHash(forward), `${kind} patch forward`).toBe(stateHash(after));
  expect(forward.heights).toEqual(after.heights);
  const back = cloneState(after);
  applyPatch(back, record.patch, true);
  expect(stateHash(back), `${kind} patch back`).toBe(stateHash(before));
  // every tile that changed is written, and everything written is touched
  const changed = (a: MapState, b: MapState) => a.heights.findIndex((h, i) => h !== b.heights[i] || a.lava[i] !== b.lava[i]);
  for (const [i] of record.patch.ground) expect(record.writes.has(i)).toBe(true);
  expect(changed(forward, after)).toBe(-1);
  for (const i of record.writes.tiles()) expect(record.touch.has(i)).toBe(true);
  expect(record.changed).toBe(record.patch.ground.length + record.patch.objects.length + record.patch.fallen.length > 0 || record.patch.water !== null);
  if (FORCE_KINDS.includes(kind)) expect(record.touch.size, `${kind} reads the whole map`).toBe(SIZE * SIZE);
  // the same record, by its JSON form
  const roundTrip = recordFromJson(SIZE * SIZE, JSON.parse(JSON.stringify(recordToJson(record))));
  expect(roundTrip.writes.toRuns()).toEqual(record.writes.toRuns());
  expect(roundTrip.touch.toRuns()).toEqual(record.touch.toRuns());
  expect(roundTrip.patch).toEqual(record.patch);
  tally.patches += record.patch.ground.length;
  return true;
}

describe.each(MAPS)("host and two replicas on $name", (m) => {
  let bytes: Uint8Array;
  beforeAll(() => {
    bytes = mapProject(m.seed, m.theme, SIZE);
  });

  test("interleaved edits from two players leave identical maps at every checkpoint", () => {
    const t = sit(bytes);
    const stream = new Stream(m.seed, SIZE);
    const tally: Tally = { committed: new Map(), patches: 0 };
    // placed objects first, so moving, changing and removing have something to work on
    for (let n = 0; n < 4; n++) step(t, stream, n % 2 ? GUEST : HOST, "place", tally);
    const pool: Kind[] = [...CHEAP_KINDS, ...CHEAP_KINDS, "carve", "craterize", "erupt", "lift", "glaciate", "rift", "deposit"];
    for (let n = 0; n < 16; n++) {
      step(t, stream, stream.pick([HOST, GUEST]), stream.pick(pool), tally);
      if (n % 8 === 7) expectIdentical(t, `after ${t.ordered} entries`);
    }
    // every kind of edit, by a different author each time
    for (const [k, kind] of KINDS.entries()) {
      let ok = (tally.committed.get(kind) ?? 0) > 0;
      for (let tries = 0; tries < 8 && !ok; tries++) ok = step(t, stream, k % 2 ? GUEST : HOST, kind, tally);
      expect(ok, `${kind} was applied at least once`).toBe(true);
    }
    expectIdentical(t, `at the end, after ${t.ordered} entries`);
    expect(t.ordered, t.refused.join("; ")).toBeGreaterThan(20);
    expect(t.refused.length, `refused: ${t.refused.join("; ")}`).toBeLessThan(8);
    expect(tally.patches).toBeGreaterThan(80);
    for (const kind of [...BRUSH_KINDS, ...FORCE_KINDS]) expect(tally.committed.get(kind), kind).toBeGreaterThan(0);
    // each player's actions are in the records, in order
    expect(t.host.records.byAuthor(HOST).length).toBeGreaterThan(0);
    expect(t.host.records.byAuthor(GUEST).length).toBeGreaterThan(0);
    expect(t.guests.get(WATCHER)!.records.all().map((r) => r.seq)).toEqual(t.host.records.all().map((r) => r.seq));
  });
});
