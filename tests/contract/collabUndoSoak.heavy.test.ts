// Undo with two players over a long run (nightly, D454): a host and two replicas on two generated maps through a few
// hundred mixed edits, forces among them, with undo and redo asked of random actions of either player, the planned
// ones and the blocked ones. The quick tests (collabUndo) hold the rules; this holds the long run: every answer is an
// order or one of the rule's plain refusals, never the safety net that says an undo would have changed ground other
// edits are on (that would be a gap in the rule), and the peers agree throughout.

import { describe, expect, test } from "vitest";
import { CollabReplica, type Command, type Reject } from "../../src/core/collab";
import type { ThemeId } from "../../src/core/spec/mapspec";
import { act, CHEAP_KINDS, expectIdentical, GUEST, HOST, live, mapProject, settle, sit, Stream, WATCHER, type Kind } from "./collabFixtures";

const SIZE = 48;
const MAPS: { name: string; seed: number; theme: ThemeId }[] = [
  { name: "highlands, seed 5", seed: 5, theme: "highlands" },
  { name: "canyon, seed 9", seed: 9, theme: "canyon" },
];

describe.each(MAPS)("an undo soak on $name", (m) => {
  test("three hundred edits with undo and redo asked at random leave identical maps", () => {
    const t = sit(mapProject(m.seed, m.theme, SIZE), { checkpointEvery: 40 }, [GUEST, WATCHER]);
    const stream = new Stream(m.seed + 100, SIZE);
    const forces: Kind[] = ["carve", "craterize", "erupt", "lift", "glaciate", "rift", "deposit"];
    const reasons = new Map<string, number>();
    let undone = 0;
    let brought = 0;
    for (let n = 0; n < 300; n++) {
      const author = stream.pick([HOST, GUEST]);
      let command: Command | null;
      if (n % 3 === 2) {
        // (half the time as the page does it, the plan's target; half the time a random action of the player's, blocked or not)
        const own = t.host.records.byAuthor(author);
        const planned = n % 2 ? (n % 4 === 3 ? t.host.undoPlan(author) : t.host.redoPlan(author)) : null;
        const r = planned ? (planned.target === null ? null : own.find((x) => x.seq === planned.target)!) : own.length ? stream.pick(own) : null;
        command = r ? (r.undoneAt === undefined ? { kind: "undo", target: r.seq } : { kind: "redo", target: r.seq }) : null;
      } else {
        const kind = n % 20 === 19 ? forces[(n / 20) % forces.length | 0] : stream.pick(CHEAP_KINDS);
        command = stream.command(kind, t.host.session);
      }
      if (!command) continue;
      const answer = act(t, author, command);
      if (answer.kind === "commit") {
        if (command.kind === "undo") undone++;
        if (command.kind === "redo") brought++;
      } else if (command.kind === "undo" || command.kind === "redo") {
        const reason = (answer as Reject).reason;
        expect(reason, "an undo is refused only by the rule").toMatch(/is on top of this$|has changed since$/);
        const key = reason.replace(/^\S+ /, "").replace(/ in the .*? is on/, " is on");
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
      }
      if (n % 25 === 24) settle(t);
      expect(t.guests.get(GUEST)!.hash()).toBe(t.host.hash());
    }
    expect(undone).toBeGreaterThan(8);
    expect(brought).toBeGreaterThan(0);
    expect(reasons.size, "the rule refused some").toBeGreaterThan(0);
    expectIdentical(t, `after ${t.ordered} entries (${undone} undone, ${brought} brought back)`);
    const snapshot = t.host.snapshot();
    t.guests.set(GUEST, CollabReplica.fromSnapshot(snapshot, GUEST, {}, live));
    expectIdentical(t, "after the rejoin");
    expect(t.guests.get(GUEST)!.undoPlan()).toEqual(t.host.undoPlan(GUEST));
    expect(t.guests.get(GUEST)!.redoPlan()).toEqual(t.host.redoPlan(GUEST));
  });
});
