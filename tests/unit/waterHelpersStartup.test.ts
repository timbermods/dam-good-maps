// The editor starts without the multi-core water when the browser refuses one of its helper threads
// (src/platform/index.ts): the water runs on one thread, and the helpers already made are stopped. From the merge
// review (investigation/merge-review, F4).

import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../src/platform/isolation", () => ({}));
vi.mock("comlink", () => ({ wrap: () => ({ waterHelpers: () => Promise.resolve(), connectChecks: () => Promise.resolve() }), transfer: (x: unknown) => x }));
import { createGenerator } from "../../src/platform/index";

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
