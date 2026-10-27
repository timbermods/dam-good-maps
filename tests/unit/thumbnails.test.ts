// Your maps' picture never holds a save up (D453, #597's review): a thumbnail worker that never answers, or whose script
// can't load, gives no picture within the wait, and the next picture starts a fresh worker.

import { describe, expect, it } from "vitest";
import { expose } from "comlink";
import { thumbnailMaker } from "../../src/ui/thumbnails";

const map = { heights: new Uint8Array(4), W: 2, H: 2, water: null };

/** A worker stand-in: it hears messages and never answers, `fail()` fires its `error` event (a script that didn't load). */
class SilentWorker extends EventTarget {
  terminated = false;
  postMessage(): void {}
  terminate(): void {
    this.terminated = true;
  }
  fail(): void {
    this.dispatchEvent(new Event("error"));
  }
}

/** A worker stand-in that answers like `thumbnail.worker.ts`, over a channel. */
function answeringWorker(url: string): Worker {
  const { port1, port2 } = new MessageChannel();
  expose({ png: async () => url }, port2);
  return Object.assign(port1, { terminate: () => port1.close() }) as unknown as Worker;
}

describe("Your maps' thumbnail worker", { timeout: 10_000 }, () => {
  it("gives no picture once the wait is over when the worker never answers, and starts a fresh one next time", async () => {
    const made: SilentWorker[] = [];
    const make = thumbnailMaker(() => {
      const w = new SilentWorker();
      made.push(w);
      return w as unknown as Worker;
    }, 50);
    const t0 = performance.now();
    expect(await make(map)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(made[0].terminated).toBe(true);
    expect(await make(map)).toBeNull();
    expect(made).toHaveLength(2);
  });

  it("gives no picture at once when the worker's script fails to load, and starts a fresh one next time", async () => {
    const made: SilentWorker[] = [];
    const make = thumbnailMaker(() => {
      const w = new SilentWorker();
      made.push(w);
      return w as unknown as Worker;
    }, 60_000);
    const first = make(map);
    made[0].fail();
    expect(await first).toBeNull();
    expect(made[0].terminated).toBe(true);
    const second = make(map);
    expect(made).toHaveLength(2);
    made[1].fail();
    expect(await second).toBeNull();
  });

  it("gives the worker's picture, from one worker kept for the next", async () => {
    let started = 0;
    const make = thumbnailMaker(() => {
      started++;
      return answeringWorker("data:image/png;base64,AAAA");
    }, 5000);
    expect(await make({ heights: new Uint8Array(4), W: 2, H: 2, water: new Float32Array(4) })).toBe("data:image/png;base64,AAAA");
    expect(await make(map)).toBe("data:image/png;base64,AAAA");
    expect(started).toBe(1);
  });
});
