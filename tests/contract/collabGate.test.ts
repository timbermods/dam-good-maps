// While a shared session says the map is read-only (paused, out of step) or edited only through the session, the worker's own edit
// paths refuse with the session's line, and a guest cannot replace the map under its replica (docs/COLLAB-BRIEF.md §7, §9).
import { afterAll, describe, expect, it } from "vitest";
import type { EditOp } from "../../src/core/doc/ops";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const PAUSED = "Bo has left. Waiting to reconnect.";
const raise = { op: "brush", params: { tool: "raise", size: 4, strength: 10, dabs: [40, 40, 52, 40] } } as EditOp;

describe("the worker's direct edit paths", () => {
  afterAll(() => {
    ed.collabGate(null);
    ed.closeSession();
  });

  it("refuse while the session is read-only, every one with its line, and work again when it is not", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: 48, y: 48 } }));
    ed.refine();
    ed.collabGate((whole) => (whole ? "Only the host can open a new map" : PAUSED));
    const refused = [
      ed.apply(raise),
      ed.applyAll([raise], "Raise"),
      ed.applyStep(raise, "Raise", "k"),
      ed.undo(),
      ed.redo(),
      ed.jump(-1),
      ed.removeAt([0], ["trees"] as never),
      ed.plantAt("Pine", [0]),
      ed.strokeClearing(raise, "Raise", [0]),
      ed.moveObjectBy("none", 1, 1),
      ed.moveStartTo(5, 5),
      ed.applyTool({ tool: "fill" } as never, "id"),
      ed.forceStop(),
    ];
    for (const r of refused) {
      expect(r.ok).toBe(false);
      expect(r.errors).toEqual([PAUSED]);
    }
    expect(ed.forceStart({ verb: "craterize", settings: { seed: 1 }, cut: null } as never).errors).toEqual([PAUSED]);
    // a guest cannot replace the map under the replica: opening a map (a file, a project, a generated one) is refused
    expect(() => ed.openProject(new Uint8Array(4))).toThrow("Only the host can open a new map");
    expect(() => ed.openTimber(new Uint8Array(4), "x.timber")).toThrow("Only the host can open a new map");
    expect(() => ed.refine()).toThrow("Only the host can open a new map");
    ed.collabGate(null);
    expect(ed.apply(raise).ok).toBe(true);
  }, 120_000);
});
