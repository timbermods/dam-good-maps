// The bake worker never leaves a job hanging (fields.ts's Baker): a worker that fails hands the jobs it
// had to the page's thread, and so does a worker that can't start; a job that throws rejects; the
// failure is said once. (Node has no Worker: a stand-in plays the browser's.)

import { afterEach, describe, expect, it, vi } from "vitest";
import { Baker } from "../../src/render3d/high/fields";
import { runBake, type BakeJob } from "../../src/render3d/high/bake";

const job = (W = 6, H = 5) => ({ kind: "ambient" as const, W, H, heights: Uint8Array.from({ length: W * H }, (_, i) => (i * 7) % 5), canopies: { kind: new Uint8Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0) } });

/** A browser Worker that takes jobs and then fails (an error event) instead of answering. */
class FailingWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  static last: FailingWorker | null = null;
  constructor() {
    FailingWorker.last = this;
  }
  postMessage(): void {}
  terminate(): void {
    this.terminated = true;
  }
  fail(): void {
    this.onerror?.({ message: "boom", preventDefault() {} } as unknown as ErrorEvent);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("the bake worker", () => {
  it("hands a failed worker's jobs to the page's thread: they still arrive, the same answer, and later jobs too", async () => {
    vi.stubGlobal("Worker", FailingWorker);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const b = new Baker();
    const a = b.run(job());
    const c = b.run(job(4, 4));
    FailingWorker.last!.fail();
    expect(FailingWorker.last!.terminated).toBe(true);
    const [ra, rc] = await Promise.all([a, c]);
    const want = runBake({ ...job(), id: 0 } as BakeJob);
    expect(ra.kind === "ambient" && Array.from(ra.data)).toEqual(want.kind === "ambient" && Array.from(want.data));
    expect(rc.kind).toBe("ambient");
    // later jobs run on the page's thread
    expect((await b.run(job())).kind).toBe("ambient");
    // said once, however many failures follow
    FailingWorker.last!.fail();
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });

  it("answers on the page's thread where no worker can start, and a job that throws rejects", async () => {
    vi.stubGlobal("Worker", class {
      constructor() {
        throw new Error("no workers here");
      }
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const b = new Baker();
    expect((await b.run(job())).kind).toBe("ambient");
    await expect(b.run({ ...job(), heights: null as unknown as Uint8Array })).rejects.toBeInstanceOf(Error);
    warn.mockRestore();
  });
});

describe("the canopies' cover after the objects change", () => {
  it("comes from the bake worker a moment later, the same as the whole bake's for those objects", async () => {
    const { AmbientField } = await import("../../src/render3d/high/fields");
    const { entityView } = await import("../../src/render3d/model");
    vi.stubGlobal("Worker", class {
      constructor() {
        throw new Error("no workers here");
      }
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const W = 24;
    const H = 20;
    const heights = Uint8Array.from({ length: W * H }, (_, i) => 3 + ((i * 7) % 3));
    const tree = (template: string, x: number, y: number, dead = false) => ({ template, x, y, z: heights[y * W + x], owner: "t", orientation: "Cw0", dead });
    const before = entityView([tree("Pine", 4, 4), tree("Oak", 10, 8), tree("RuinColumnH3", 15, 12)]);
    // a pine drowned, a source placed among them, a birch grown
    const after = entityView([tree("WaterSource", 2, 2), tree("Pine", 4, 4, true), tree("Oak", 10, 8), tree("RuinColumnH3", 15, 12), tree("Birch", 18, 5)]);
    const field = new AmbientField(W, H, new Baker(), () => undefined);
    const until = async () => {
      for (let k = 0; k < 200 && !field.ready; k++) await new Promise((r) => setTimeout(r, 5));
    };
    field.bake(heights, before);
    await until();
    field.objects(heights, after);
    expect(field.ready).toBe(false);
    await until();
    expect(field.ready).toBe(true);
    const whole = new AmbientField(W, H, new Baker(), () => undefined);
    whole.bake(heights, after);
    for (let k = 0; k < 200 && !whole.ready; k++) await new Promise((r) => setTimeout(r, 5));
    expect(Array.from(field.texture.image.data as Uint8Array)).toEqual(Array.from(whole.texture.image.data as Uint8Array));
    warn.mockRestore();
  });
});
