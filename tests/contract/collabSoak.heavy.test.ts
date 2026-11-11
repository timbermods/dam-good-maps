// Collaborative editing's soak (nightly, D454): a host and two replicas on two generated maps through
// a few hundred mixed edits from two players, the water settling as it goes, checkpoints on the way, and
// a rejoin at the end. The quick tests (collabLog, collabProtocol) hold the rules; this holds the long run.

import { describe, expect, test } from "vitest";
import { CollabReplica } from "../../src/core/collab";
import type { ThemeId } from "../../src/core/spec/mapspec";
import { act, CHEAP_KINDS, expectIdentical, GUEST, HOST, live, mapProject, settle, sit, Stream, WATCHER, type Kind } from "./collabFixtures";

const SIZE = 48;
// (Highlands seed 3 for seed 5 since generator 0.10.16's ground with grade, D148: seed 5's map now has terrain above
// terrain, where the replicas' water shows the known fault pinned below; seed 3's has none, as seed 5's had, and
// collabLog's tests run on it too)
const MAPS: { name: string; seed: number; theme: ThemeId }[] = [
  { name: "highlands, seed 3", seed: 3, theme: "highlands" },
  { name: "canyon, seed 9", seed: 9, theme: "canyon" },
];

/** The soak on one map: three hundred mixed edits from two players, the water settled every 25, checkpoints every 40,
 *  then a rejoin from the host's snapshot; the host and both replicas identical after the edits and after the rejoin. */
function soak(m: (typeof MAPS)[number]): void {
  const t = sit(mapProject(m.seed, m.theme, SIZE), { checkpointEvery: 40 }, [GUEST, WATCHER]);
  const stream = new Stream(m.seed, SIZE);
  const forces: Kind[] = ["carve", "craterize", "erupt", "lift", "glaciate", "rift", "deposit"];
  for (let n = 0; n < 300; n++) {
    const kind = n % 20 === 19 ? forces[(n / 20) % forces.length | 0] : stream.pick(CHEAP_KINDS);
    const c = stream.command(kind, t.host.session);
    if (c) act(t, stream.pick([HOST, GUEST]), c);
    if (n % 25 === 24) settle(t);
  }
  expect(t.ordered).toBeGreaterThan(200);
  expectIdentical(t, `after ${t.ordered} entries`);
  const snapshot = t.host.snapshot();
  expect(snapshot.checkpointSeq).toBeGreaterThan(100);
  expect(snapshot.tail.length).toBeLessThan(80);
  t.guests.set(GUEST, CollabReplica.fromSnapshot(snapshot, GUEST, {}, live));
  expectIdentical(t, "after the rejoin");
}

describe.each(MAPS)("a soak on $name", (m) => {
  test("three hundred edits, checkpoints on the way and a rejoin leave identical maps", () => soak(m));
});

// The known fault collabLog pins (Highlands 48² seed 5, terrain above terrain since generator 0.10.16): one
// `pumpWater()` can leave a peer's water unsettled. The soak on seed 5 shows it on the host: a force's plan, after the
// host's one settle, throws "The water has not settled: a force plans on the settled water". When the fault is fixed
// this passes and `fails` comes off.
test.fails("a soak on highlands, seed 5: three hundred edits leave identical maps (the known fault, collabLog)", () => soak({ name: "highlands, seed 5", seed: 5, theme: "highlands" }));
