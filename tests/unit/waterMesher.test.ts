// Moving water's meshes come back a whole batch at a time (waterMesher.ts): one moment of the water, shared over
// a few workers, handed to the renderer once every part is in, never a part on its own; a worker that fails
// gives the whole batch back to be meshed on the page's thread. (Node has no Worker: a stand-in plays it.)

import { afterEach, describe, expect, it, vi } from "vitest";
import { WaterMesher, type MesherReply, type MesherRequest } from "../../src/render3d/waterMesher";
import type { SurfaceWater } from "../../src/render3d/model";
import type { WaterMeshData } from "../../src/render3d/waterMesh";

/** A worker that answers each batch when told to (or fails). */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<MesherReply>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  got: MesherRequest[] = [];
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: MesherRequest): void {
    this.got.push(m);
  }
  terminate(): void {}
  answer(): void {
    const m = this.got.shift()!;
    this.onmessage?.({ data: { kind: "batch", id: m.id, chunks: m.keys.map((key) => ({ key, data: { quads: 0 } as WaterMeshData })), failed: [] } } as unknown as MessageEvent<MesherReply>);
  }
  fail(): void {
    this.onerror?.({ message: "boom", preventDefault() {} } as unknown as ErrorEvent);
  }
}

const sw = { surface: new Float32Array(4), floor: new Float32Array(4), depth: new Float32Array(4), contamination: new Float32Array(4), top: new Int32Array(4), outflow: null, lower: [] } as SurfaceWater;

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.all = [];
});

describe("moving water meshed in batches", () => {
  it("a batch comes back whole, once every worker's part is in, on its one water", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const done = vi.fn();
    const m = new WaterMesher(done, () => undefined, 3);
    const keys = ["0,0", "1,0", "2,0", "0,1", "1,1"];
    m.mesh(7, 2, 2, new Uint8Array(4), sw, keys);
    expect(m.busy).toBe(true);
    // shared out, near and far alike
    expect(FakeWorker.all.map((w) => w.got[0].keys)).toEqual([["0,0", "0,1"], ["1,0", "1,1"], ["2,0"]]);
    FakeWorker.all[0].answer();
    FakeWorker.all[2].answer();
    expect(done).not.toHaveBeenCalled();
    FakeWorker.all[1].answer();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0]).toBe(7);
    expect([...(done.mock.calls[0][1] as Map<string, unknown>).keys()].sort()).toEqual([...keys].sort());
    expect(m.busy).toBe(false);
  });

  it("a worker that fails gives the whole batch back; a batch forgotten (the water put in place) never lands", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const done = vi.fn();
    const lost = vi.fn();
    const m = new WaterMesher(done, lost, 2);
    m.mesh(1, 2, 2, new Uint8Array(4), sw, ["0,0", "1,0"]);
    m.clear();
    FakeWorker.all[0].answer();
    FakeWorker.all[1].answer();
    expect(done).not.toHaveBeenCalled();
    m.mesh(2, 2, 2, new Uint8Array(4), sw, ["0,0", "1,0", "2,0"]);
    FakeWorker.all[0].answer();
    FakeWorker.all[1].fail();
    expect(lost).toHaveBeenCalledWith(["0,0", "1,0", "2,0"]);
    expect(done).not.toHaveBeenCalled();
    expect(m.working).toBe(false);
    warn.mockRestore();
  });
});
