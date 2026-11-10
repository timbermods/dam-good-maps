// The checks worker's replica answers every ask for the map it follows (#829): a second check of the same map, asked
// while the first runs (the page's own and the export dialog's), shares it, its progress told to both, where it used
// to drop the first and leave the page's dot at "Checking the map"; a check of a map the replica no longer follows
// answers nothing. (The worker's own order, a check after every follow sent before it, is checks.worker.ts's.)

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import * as ed from "../../src/worker/session";

describe("the checks replica's background check", () => {
  it("answers two asks for the same map with the one check, and nothing for an older map", async () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 48, y: 48 } }));
    ed.follow({ version: 7, doc: MapSession.fromGenerated(r, r.file).document, keep: 0, add: [] });
    const told: string[][] = [[], []];
    const [a, b, older] = await Promise.all([
      ed.replicaCheck(7, (p) => told[0].push(p.stage)),
      ed.replicaCheck(7, (p) => told[1].push(p.stage)),
      ed.replicaCheck(6),
    ]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(a!.check.checks).toBeGreaterThan(0);
    expect(told[0]).toContain("checks");
    expect(told[1]).toContain("checks");
    expect(older).toBeNull();
    // and once it has answered, the next ask checks again (from the check it keeps)
    expect(await ed.replicaCheck(7)).not.toBeNull();
  }, 120_000);
});
