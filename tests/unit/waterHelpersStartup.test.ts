// The editor starts without the multi-core water when the browser refuses one of its helper threads
// (src/platform/index.ts): the water runs on one thread, and the helpers already made are stopped. From the merge
// review (investigation/merge-review, F4). And it starts no more helpers than the machine's budget allows.

import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../src/platform/isolation", () => ({}));
vi.mock("comlink", () => ({ wrap: () => ({ waterHelpers: () => Promise.resolve(), connectChecks: () => Promise.resolve() }), transfer: (x: unknown) => x }));
import { createGenerator } from "../../src/platform/index";
import { meshWorkersFor, waterThreadBudget } from "../../src/core/sim/parallelPolicy";

afterEach(() => vi.unstubAllGlobals());

it("a refused second water helper leaves a working generator and stops the first (F4)", () => {
  vi.stubGlobal("crossOriginIsolated", true);
  vi.stubGlobal("navigator", { userAgent: "Chrome/150", hardwareConcurrency: 8 });
  vi.stubGlobal("document", {});
  let helpers = 0;
  let stopped = 0;
  vi.stubGlobal(
    "Worker",
    class {
      readonly helper: boolean;
      constructor(url: URL) {
        this.helper = url.href.includes("waterStrip");
        if (this.helper && ++helpers === 2) throw new DOMException("worker denied", "SecurityError");
      }
      postMessage(): void {}
      terminate(): void {
        if (this.helper) stopped++;
      }
    },
  );
  expect(() => createGenerator()).not.toThrow();
  expect(helpers).toBe(2);
  expect(stopped).toBe(1);
});

// The water's threads leave the page's thread, the water mesh workers and the flow bake a core each: a flood keeps
// all of them busy at once, and with more threads than cores the page's thread lost 60 to 300 ms at a time (#581).
it("starts the water's helpers within the machine's budget, leaving the page's other workers a core each", () => {
  for (const cores of [4, 6, 8, 12, 16, 24, 32]) {
    const budget = waterThreadBudget(cores);
    expect(budget, `${cores} threads`).toBeGreaterThanOrEqual(1);
    if (budget > 1) expect(budget + meshWorkersFor(cores) + 2, `${cores} threads`).toBeLessThanOrEqual(cores);
  }
  vi.stubGlobal("crossOriginIsolated", true);
  vi.stubGlobal("document", {});
  let helpers = 0;
  vi.stubGlobal(
    "Worker",
    class {
      constructor(url: URL) {
        if (url.href.includes("waterStrip")) helpers++;
      }
      postMessage(): void {}
      terminate(): void {}
    },
  );
  // 12 threads: the water 7 (6 helpers and its coordinator), three mesh workers, the bake, the page
  vi.stubGlobal("navigator", { userAgent: "Chrome/150", hardwareConcurrency: 12 });
  createGenerator();
  expect(helpers).toBe(6);
  helpers = 0;
  // 8 threads: the water 4, two mesh workers, the bake, the page
  vi.stubGlobal("navigator", { userAgent: "Chrome/150", hardwareConcurrency: 8 });
  createGenerator();
  expect(helpers).toBe(3);
});
