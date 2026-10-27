// Undo with two players over a long run (nightly, D454): a host and two replicas on two generated maps through a few
// hundred mixed edits, forces among them, with undo and redo asked of random actions of either player, the planned
// ones and the blocked ones. The quick tests (collabUndo) hold the rules; this holds the long run: every answer is an
// order or one of the rule's plain refusals, never the safety net that says an undo would have changed ground other
// edits are on (that would be a gap in the rule), and the peers agree throughout.

import { describe, expect, test } from "vitest";
import { CollabReplica, type Command, type Reject } from "../../src/core/collab";
import type { EditOp } from "../../src/core/doc/ops";
import { startMiddle } from "../../src/core/doc/start";
import { planFill, unfedWater } from "../../src/core/doc/waterEdits";
import type { ThemeId } from "../../src/core/spec/mapspec";
import { act, CHEAP_KINDS, expectIdentical, GUEST, GUID, HOST, live, mapProject, settle, settleHost, sit, Stream, WATCHER, type Kind, type Table } from "./collabFixtures";

const SIZE = 48;
const MAPS: { name: string; seed: number; theme: ThemeId }[] = [
  { name: "highlands, seed 5", seed: 5, theme: "highlands" },
  { name: "canyon, seed 9", seed: 9, theme: "canyon" },
];

/** The edits that read widely or plan on the settled water, which the stream does not make: weathering, placement strokes, features,
 *  a Select over the start, and Fill and Remove unfed water on a pit the soak digs (in the order they are asked for by `n`). */
function broad(t: Table, n: number, pit: { cx: number; cy: number; level: number } | null): { label: string; command: Command | null } {
  const s = t.host.session;
  const W = s.built.W;
  const spot = (m = 8) => [m + ((n * 7) % (W - 2 * m)), m + ((n * 11) % (W - 2 * m))] as const;
  const [x, y] = spot();
  const forest = GUID(777);
  switch (n % 12) {
    case 0: {
      const dabs = [x * 4, y * 4, (x + 5) * 4, (y + 2) * 4, (x + 9) * 4, (y + 4) * 4];
      return { label: "weathering", command: { kind: "edit", label: "weathering", ops: [{ op: "brush", params: { tool: "naturalize", size: 6, strength: 10, seed: n, weathers: true, dabs } } as EditOp] } };
    }
    case 1: {
      const area: [number, number, number][] = [];
      for (let yy = y; yy < y + 6; yy++) area.push([yy, x, x + 8]);
      return { label: "paintObjects", command: { kind: "edit", label: "paintObjects", ops: [{ op: "paintObjects", params: { kind: "trees", template: "Pine", area, density: 0.4, seed: n } } as EditOp] } };
    }
    case 2: {
      const at = startMiddle(s);
      if (!at) return { label: "select start", command: null };
      const cells: [number, number, number][] = [];
      for (let yy = at[1] - 2; yy <= at[1] + 2; yy++) cells.push([yy, at[0], at[0] + 2]);
      return { label: "select start", command: { kind: "select", label: "Select: raise", ops: [{ op: "sculpt", params: { mode: "raise", cells, amount: 1 } } as EditOp] } };
    }
    case 3: {
      const box: [number, number, number][] = [];
      for (let yy = y; yy < y + 5; yy++) box.push([yy, x, x + 8]);
      const f = { id: forest, kind: "forest", origin: "user", locked: false, params: { area: box, density: 0.7, speciesMix: { Birch: 1 }, life: "auto", youngShare: 0.2 } };
      return { label: "feature", command: { kind: "edit", label: "addFeature", ops: [{ op: "addFeature", params: { feature: f } } as unknown as EditOp] } };
    }
    case 4:
      return { label: "feature", command: { kind: "edit", label: "updateFeature", ops: [{ op: "updateFeature", params: { id: forest, patch: { params: { density: 0.3 } } } } as EditOp] } };
    case 5:
      return { label: "feature", command: { kind: "edit", label: "reorderFeature", ops: [{ op: "reorderFeature", params: { id: forest, index: 0 } } as EditOp] } };
    case 6:
      return { label: "feature", command: { kind: "edit", label: "deleteFeature", ops: [{ op: "deleteFeature", params: { id: forest } } as EditOp] } };
    case 7: {
      if (!pit) return { label: "fill", command: null };
      settleHost(t);
      const plan = planFill(s, pit.cx, pit.cy, pit.level - 1);
      return { label: "fill", command: plan.op ? { kind: "edit", label: "Fill", ops: [plan.op] } : null };
    }
    case 8: {
      settleHost(t);
      const op = unfedWater(s).op;
      return { label: "unfed", command: op ? { kind: "edit", label: "Remove unfed water", ops: [op] } : null };
    }
    default:
      return { label: "", command: null };
  }
}

/** A stepped pit on the highest plateau, dug by Select actions (the rect helper of collabLog's Fill test). */
function dig(t: Table): { cx: number; cy: number; level: number } {
  const s = t.host.session;
  const W = s.built.W;
  settleHost(t);
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
  ] as [string, EditOp][]) act(t, HOST, { kind: "select", label, ops: [op] });
  return { cx, cy, level };
}

describe.each(MAPS)("an undo soak on $name", (m) => {
  test("three hundred edits with undo and redo asked at random leave identical maps", () => {
    const t = sit(mapProject(m.seed, m.theme, SIZE), { checkpointEvery: 40 }, [GUEST, WATCHER]);
    const stream = new Stream(m.seed + 100, SIZE);
    const forces: Kind[] = ["carve", "craterize", "erupt", "lift", "glaciate", "rift", "deposit"];
    const reasons = new Map<string, number>();
    const made = new Set<string>();
    const pit = dig(t);
    let undone = 0;
    let brought = 0;
    let broadN = 0;
    for (let n = 0; n < 300; n++) {
      const author = stream.pick([HOST, GUEST]);
      let command: Command | null;
      let label = "";
      if (n % 3 === 2) {
        // (half the time as the page does it, the plan's target; half the time a random action of the player's, blocked or not)
        const own = t.host.records.byAuthor(author);
        const planned = n % 2 ? (n % 4 === 3 ? t.host.undoPlan(author) : t.host.redoPlan(author)) : null;
        const r = planned ? (planned.target === null ? null : own.find((x) => x.seq === planned.target)!) : own.length ? stream.pick(own) : null;
        command = r ? (r.undoneAt === undefined ? { kind: "undo", target: r.seq } : { kind: "redo", target: r.seq }) : null;
      } else if (n % 4 === 1) {
        // (the broad kinds, in turn, by either player)
        const b = broad(t, broadN++, pit);
        label = b.label;
        command = b.command;
      } else {
        const kind = n % 20 === 19 ? forces[(n / 20) % forces.length | 0] : stream.pick(CHEAP_KINDS);
        command = stream.command(kind, t.host.session);
      }
      if (!command) continue;
      const answer = act(t, author, command);
      if (answer.kind === "commit") {
        if (label) made.add(label);
        if (command.kind === "undo") undone++;
        if (command.kind === "redo") brought++;
        // (a redo asked for right after the undo has nothing between it and the action, so it must be ordered: the plain round trip
        // every map offers, while the random redos above are often blocked by what was done since)
        if (command.kind === "undo" && n % 24 === 11) {
          const back = act(t, author, { kind: "redo", target: command.target });
          expect(back.kind === "reject" ? (back as Reject).reason : "ordered", "a redo right after its undo").toBe("ordered");
          brought++;
        }
      } else if (command.kind === "undo" || command.kind === "redo") {
        const reason = (answer as Reject).reason;
        expect(reason, "an undo is refused only by the rule").toMatch(/is on top of this$|has changed since$|has changed for good$/);
        const key = reason.replace(/^\S+ /, "").replace(/ in the .*? is on/, " is on");
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
      }
      if (n % 25 === 24) settle(t);
      expect(t.guests.get(GUEST)!.hash()).toBe(t.host.hash());
    }
    // (the broad kinds went in among the rest, and what an undo did to them was never the safety net's answer)
    for (const label of ["weathering", "paintObjects", "select start", "feature"]) expect(made.has(label), `${label} was ordered`).toBe(true);
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
