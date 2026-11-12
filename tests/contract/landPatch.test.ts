// Answers the size of the edit (#922 step 4, core/doc/landPatch.ts): an edit's answer carries what it changed of the
// land and the terrain, over the rectangle it changed, and the land the page holds with it laid on is the worker's,
// byte for byte; a patch made against other land is never laid.

import { describe, expect, it } from "vitest";
import { diffLand, layLand, WET, type Land } from "../../src/core/doc/landPatch";
import { EditQueue, type MapAnswer, type QueueOpen } from "../../src/core/doc/editQueue";
import type { TerrainState } from "../../src/core/features/raster/strokePreview";
import * as ed from "../../src/worker/session";
import { mapProject } from "./collabFixtures";

/** Every byte of a land: its heights and each part of its terrain (`dry`: but the settled water's depth and moisture). */
function bytes(l: Land, dry = false): string {
  const out: string[] = [Buffer.from(l.heights).toString("base64")];
  for (const k of Object.keys(l.terrain).sort()) {
    if (dry && (WET as readonly string[]).includes(k)) continue;
    const v = (l.terrain as unknown as Record<string, unknown>)[k];
    out.push(k, ArrayBuffer.isView(v) ? Buffer.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)).toString("base64") : JSON.stringify(v ?? null));
  }
  return out.join("|");
}

describe("a land's patch", () => {
  it("laid on the land it was made of makes the other, byte for byte: tile maps, whole parts, a map that came or went", () => {
    const W = 20;
    const t = (seed: number): TerrainState => {
      const pre = new Uint8Array(W * W).map((_, i) => (i * 7 + seed) % 9);
      return { pre, protect: new Uint8Array(W * W), channel: new Uint8Array(W * W), base: null, locked: null, columns: new Int32Array(0), water: new Float64Array(W * W).map((_, i) => (i % 5 === 0 ? NaN : i / 3)), moisture: null, top: 16, rockHold: [[3, 1, 9]] };
    };
    const a: Land = { heights: new Uint8Array(W * W).fill(4), terrain: t(1) };
    const b: Land = { heights: a.heights.slice(), terrain: { ...t(1), pre: t(1).pre.slice(), water: (t(1).water as Float64Array).slice(), moisture: new Float64Array(W * W).fill(0.5), rockHold: [[3, 1, 9], [44, 2, 8]] } };
    b.heights[5 * W + 6] = 9;
    b.terrain.pre[7 * W + 2] = 1;
    (b.terrain.water as Float64Array)[3 * W + 11] = 2.25;
    const p = diffLand(a, b, W, 4, 5)!;
    expect(p.rect).toEqual({ x0: 2, y0: 3, x1: 11, y1: 7 });
    expect(Object.keys(p.dense).sort()).toEqual(["pre", "water"]);
    expect(Object.keys(p.whole).sort()).toEqual(["moisture", "rockHold"]);
    expect(bytes(layLand(a, p, W))).toBe(bytes(b));
    // (the land it was laid on is left as it was)
    expect(bytes(a)).toBe(bytes({ heights: new Uint8Array(W * W).fill(4), terrain: t(1) }));
    expect(diffLand(b, b, W, 5, 6)).toBe(null);
  });
});

describe("an edit's answer is the size of the edit", () => {
  it("a stroke's answer at 128² carries its rectangle, not the map; laid on the land opened, with the water's news, it is the worker's", () => {
    const W = 128;
    const open = ed.openProject(mapProject(11, "riverValley", W));
    const land: Land = { heights: open.view.heights.slice(), terrain: structuredClone(open.terrain) };
    const dabs: number[] = [];
    for (let k = 0; k < 10; k++) dabs.push((60 + k) * 4 + 2, 64 * 4 + 2);
    const u = ed.apply({ op: "brush", params: { tool: "raise", size: 3, strength: 5, dabs } }, "user", "Raise");
    expect(u.ok).toBe(true);
    expect(u.view.heights).toBeUndefined();
    expect(u.view.terrain).toBeUndefined();
    const p = u.view.land!;
    expect(p.from).toBe(open.landSeq);
    let size = p.heights?.byteLength ?? 0;
    for (const v of Object.values(p.dense)) size += v.byteLength;
    // (before step 4 this answer carried the whole land and terrain: 16 KiB of heights and some 400 KiB of terrain)
    expect(size).toBeLessThan(16_384);
    expect(p.chain).toBe("land");
    expect(u.view.wet).toBeUndefined();
    let now = ed.terrainNow();
    const laid = layLand(land, p, W);
    // (the land is the worker's; its water comes with the water's news, on their own channel and numbering)
    expect(bytes(laid, true)).toBe(bytes({ heights: now.heights, terrain: now.terrain }, true));
    const news = ed.settleWater();
    now = ed.terrainNow();
    const wet = news.wet!;
    expect(wet.chain).toBe("wet");
    expect(wet.from).toBe(open.wetSeq);
    expect(wet.heights).toBeUndefined();
    expect(bytes(layLand(laid, wet, W))).toBe(bytes({ heights: now.heights, terrain: now.terrain }));
  });

  it("the water's news overtaking an answer (they come on two channels): both are laid, nothing is asked again", () => {
    const W = 48;
    const open = ed.openProject(mapProject(11, "riverValley", W));
    let asked = 0;
    const q = new EditQueue(open as unknown as QueueOpen, { send: () => new Promise(() => {}) }, { now: () => 0, after: () => () => {} }, { stale: () => void asked++ });
    const a = ed.apply({ op: "brush", params: { tool: "lower", size: 2, strength: 9, dabs: [10 * 4 + 2, 20 * 4 + 2, 16 * 4 + 2, 20 * 4 + 2] } }, "user", "Lower") as unknown as MapAnswer;
    const news = ed.settleWater();
    const b = ed.apply({ op: "brush", params: { tool: "raise", size: 2, strength: 9, dabs: [30 * 4 + 2, 30 * 4 + 2, 34 * 4 + 2, 30 * 4 + 2] } }, "user", "Raise") as unknown as MapAnswer;
    // (the news first, then the two answers)
    q.event({ ok: true, errors: [], view: news as MapAnswer["view"] });
    q.event(a);
    q.event(b);
    // (and a copy of the news again, as a background check hands it back too)
    q.event({ ok: true, errors: [], view: structuredClone(news) as MapAnswer["view"] });
    expect(asked).toBe(0);
    expect(q.landResends).toBe(0);
    let now = ed.terrainNow();
    expect(bytes(q.base, true)).toBe(bytes({ heights: now.heights, terrain: now.terrain }, true));
    // (the water the last answer moved comes with the next news)
    q.event({ ok: true, errors: [], view: ed.settleWater() as MapAnswer["view"] });
    now = ed.terrainNow();
    expect(bytes(q.base)).toBe(bytes({ heights: now.heights, terrain: now.terrain }));
    expect(q.landResends).toBe(0);
  });

  it("the queue lays a patch only on the land it was made against, and asks for the whole land otherwise", () => {
    const W = 48;
    const open = ed.openProject(mapProject(11, "riverValley", W));
    let asked = 0;
    const q = new EditQueue(open as unknown as QueueOpen, { send: () => new Promise(() => {}) }, { now: () => 0, after: () => () => {} }, { stale: () => void asked++ });
    const stroke = (x: number) => ed.apply({ op: "brush", params: { tool: "raise", size: 2, strength: 5, dabs: [x * 4 + 2, 20 * 4 + 2, (x + 3) * 4 + 2, 20 * 4 + 2] } }, "user", "Raise");
    q.event(stroke(10) as unknown as MapAnswer);
    expect(asked).toBe(0);
    // (a read of the whole map, the page's or a test's, leaves the numbering as it is: the land the page holds keeps its
    // number, and land it does not hold yet, the water settled meanwhile, gets none)
    const read = ed.sessionView().landSeq;
    expect(read === open.landSeq + 1 || read === -1).toBe(true);
    q.event(stroke(14) as unknown as MapAnswer);
    expect(asked).toBe(0);
    expect(Buffer.from(q.base.heights).equals(Buffer.from(ed.terrainNow().heights))).toBe(true);
    // (an answer the page never saw: the next patch is not laid on the land it holds, and the whole land comes)
    stroke(20);
    const late = stroke(30) as unknown as MapAnswer;
    q.event(late);
    expect(asked).toBe(1);
    expect(q.landResends).toBe(1);
    const l = ed.landNow();
    q.event({ ok: true, errors: [], epoch: l.epoch, view: l.view as MapAnswer["view"] });
    expect(Buffer.from(q.base.heights).equals(Buffer.from(ed.terrainNow().heights))).toBe(true);
    q.event(stroke(36) as unknown as MapAnswer);
    expect(asked).toBe(1);
    expect(Buffer.from(q.base.heights).equals(Buffer.from(ed.terrainNow().heights))).toBe(true);
  });
});

describe("at idle the page's water is the session's", () => {
  it("an undo puts its step's water back with no settle after it: the water's news follows once the queue is idle, once", async () => {
    const W = 96;
    const open = ed.openProject(mapProject(11, "riverValley", W));
    let wets = 0;
    // (the page's wiring: answers through the port, the water's news through the listener, the idle hook to the worker)
    const q: EditQueue = new EditQueue(
      open as unknown as QueueOpen,
      {
        send: async (env, call) =>
          ed.ticketed(env, () => (call.kind === "moveTo" ? ed.moveTo(call.step) : ed.apply(...(call.args as Parameters<typeof ed.apply>)))) as unknown as MapAnswer,
      },
      { now: () => 0, after: () => () => {} },
      { idle: () => ed.idleWater() },
    );
    ed.listen((e) => {
      if (e.kind === "wet") wets++;
      if (e.kind === "wet" || e.kind === "settled") q.event({ ok: true, errors: [], epoch: e.epoch, view: e.view as MapAnswer["view"] });
    });
    try {
      const water = () => {
        const now = ed.terrainNow().terrain;
        const t = q.base.terrain;
        const eq = (a: Float64Array | null | undefined, b: Float64Array | null | undefined) => Buffer.from(new Uint8Array(a!.buffer, a!.byteOffset, a!.byteLength)).equals(Buffer.from(new Uint8Array(b!.buffer, b!.byteOffset, b!.byteLength)));
        return eq(t.water, now.water) && eq(t.moisture, now.moisture);
      };
      const dabs: number[] = [];
      for (let k = 0; k < 10; k++) dabs.push((40 + k) * 4 + 2, 48 * 4 + 2);
      q.edit("apply", [{ op: "brush", params: { tool: "lower", size: 4, strength: 9, dabs } }, "user", "Lower"]);
      await q.idle();
      // (settling: its news brings the water, so nothing is sent at idle)
      expect(ed.waterSettling()).toBe(true);
      expect(wets).toBe(0);
      q.event({ ok: true, errors: [], epoch: open.epoch, view: ed.settleWater() as MapAnswer["view"] });
      expect(water()).toBe(true);
      // (the undo puts the water before the stroke back, and nothing settles after it)
      q.undo();
      await q.idle();
      expect(ed.waterSettling()).toBe(false);
      expect(wets).toBe(1);
      expect(water()).toBe(true);
      // (asked again with the page's water the session's: nothing)
      ed.idleWater();
      expect(wets).toBe(1);
      q.redo();
      await q.idle();
      expect(water()).toBe(true);
      expect(q.landResends).toBe(0);
    } finally {
      ed.listen(null);
    }
  });
});
