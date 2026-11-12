// The start's drought run beside the map (`premise/generate.ts` `generatePremiseAsync`, worker/drought.worker.ts): it
// starts from the first build's water, which must be the shown map's (life and the second build move no water), and a
// runner that fails (its worker not loading, throwing, dying) neither hangs the generator nor changes its map: the run
// goes on on the generator's own thread (`droughtRunner.ts`).

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePremise, generatePremiseAsync, type DroughtRunner } from "../../src/core/premise/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytes = (a: ArrayLike<number> & ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

describe("the start's drought beside the map", () => {
  it("starts from the shown map's water: the second build's water and contamination are the first build's", async () => {
    for (const [theme, seed] of [["any", 1], ["any", 2], ["any", 3], ["riverValley", 1], ["canyon", 1]] as [ThemeId, number][]) {
      let first: { depth: Float64Array; contamination: Float64Array } | null = null;
      // (a runner that keeps the first build's water and fails every day: the generator runs the drought itself)
      const keep: DroughtRunner = {
        start: (_model, depth, contamination) => {
          first = { depth: depth.slice(), contamination: contamination.slice() };
          return { day: () => Promise.reject(new Error("no run here")), stop: () => {} };
        },
      };
      const r = await generatePremiseAsync(makeSpec({ seed, size: { x: 128, y: 128 }, theme, premise: "lakeStair" }), {}, keep);
      if ("reason" in r) throw new Error(r.reason);
      expect(first, `${theme} ${seed}`).not.toBeNull();
      const b = r.result.built;
      expect(bytes(Float64Array.from(b.water)).equals(bytes(first!.depth)), `${theme} ${seed}: water`).toBe(true);
      expect(bytes(Float64Array.from(b.contamination)).equals(bytes(first!.contamination)), `${theme} ${seed}: contamination`).toBe(true);
    }
  });

  it("makes the same map when its runner fails to start, fails on a day, or dies mid-run", async () => {
    // (seed 1 at 128², whose gate runs a day of the drought: its by-number read does not vouch)
    const spec = () => makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme: "any", premise: "lakeStair" });
    let asked = 0;
    const one = generatePremise(spec());
    if ("reason" in one) throw new Error(one.reason);
    const runners: Record<string, DroughtRunner> = {
      "fails to start": { start: () => { throw new Error("the worker did not load"); } },
      "fails every day": { start: () => ({ day: () => (asked++, Promise.reject(new Error("it threw"))), stop: () => {} }) },
      // (one that answers nothing until it dies: the waits fail then)
      "dies mid-run": {
        start: () => {
          const fails: ((e: Error) => void)[] = [];
          setTimeout(() => fails.forEach((f) => f(new Error("it died"))), 50);
          return { day: () => (asked++, new Promise((_, fail) => fails.push(fail))), stop: () => {} };
        },
      },
    };
    for (const [why, runner] of Object.entries(runners)) {
      const r = await generatePremiseAsync(spec(), {}, runner);
      if ("reason" in r) throw new Error(r.reason);
      expect(sha(r.result.bytes), why).toBe(sha(one.result.bytes));
    }
    expect(asked).toBe(2);
  });
});

describe("the drought worker's runner (droughtRunner.ts)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("fails its waits, and every run after, when its worker fails", async () => {
    let made: { onerror: ((e: { message: string }) => void) | null } | null = null;
    vi.stubGlobal(
      "Worker",
      class {
        onerror: ((e: { message: string }) => void) | null = null;
        onmessage: unknown = null;
        onmessageerror: unknown = null;
        constructor() {
          made = this;
        }
        postMessage() {}
        terminate() {}
      },
    );
    const { droughtRunner } = await import("../../src/worker/droughtRunner");
    const runner = droughtRunner()!;
    const z = new Float64Array(4);
    const run = runner.start({ W: 2, H: 2, floor: z, dam: null, emitters: [] } as never, z, z, 9);
    const wait = run.day(1);
    made!.onerror!({ message: "it did not load" });
    await expect(wait).rejects.toThrow(/drought worker failed/);
    expect(() => runner.start({ W: 2, H: 2, floor: z, dam: null, emitters: [] } as never, z, z, 9)).toThrow(/drought worker failed/);
  });
});
