// Your maps (PLAN §20 D234, D330; docs/UI-BRIEF.md §3, §6): every edited map kept in this browser,
// no map dropped on its own; rename, copy, undoable delete, the Timberborn
// mark; a full disk said plainly; saving in the background after edits settle, never waited on.
// The core's model and saver directly (D342 (5)), and the IndexedDB adapter over fake-indexeddb. The
// list itself is exercised in tests/e2e/page-parts.spec.ts.

import "fake-indexeddb/auto";
import { IDBFactory, IDBTransaction } from "fake-indexeddb";
import { gzipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { YourMapsSaver } from "../../src/core/library/saver";
import { whenText } from "../../src/core/library/when";
import { storeProblem, type YourMapEntry, type YourMapsStore } from "../../src/core/library/yourMaps";
import { openYourMaps } from "../../src/platform/yourMaps";

const at = (min: number) => new Date(Date.UTC(2026, 8, 29, 12, 0) + min * 60_000).toISOString();
const entry = (id: string, min: number, over: Partial<YourMapEntry> = {}): YourMapEntry => ({ id, name: `Map ${id}`, kind: "generated", createdAt: at(min), editedAt: at(min), thumbnail: null, revision: 1, savedToTimberborn: null, bytes: 0, ...over });
const bytes = (n: number) => new Uint8Array([n, n + 1, n + 2]);

describe("the store", () => {
  it("keeps a map and its project file, newest edit first", async () => {
    const s = openYourMaps(new IDBFactory());
    expect(await s.put(entry("a", 1), bytes(1))).toEqual({ ok: true });
    expect(await s.put(entry("b", 2), bytes(2))).toEqual({ ok: true });
    expect((await s.list()).map((e) => e.id)).toEqual(["b", "a"]);
    expect(await s.project("a")).toEqual(bytes(1));
    expect((await s.list())[1].bytes).toBe(3);
    // a new version of a map replaces it
    await s.put(entry("a", 3, { revision: 2 }), bytes(9));
    expect((await s.list()).map((e) => [e.id, e.revision])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
    expect(await s.project("a")).toEqual(bytes(9));
    expect(await s.project("nope")).toBe(null);
  });

  it("never drops a map on its own", async () => {
    const s = openYourMaps(new IDBFactory());
    for (let k = 1; k <= 40; k++) await s.put(entry(`m${k}`, k), bytes(k));
    const ids = (await s.list()).map((e) => e.id);
    expect(ids.length).toBe(40);
    expect(ids).toContain("m1");
    expect(await s.project("m1")).toEqual(bytes(1));
  });

  it("renames, copies and marks a map saved to Timberborn", async () => {
    const s = openYourMaps(new IDBFactory());
    await s.put(entry("a", 1, { revision: 4 }), bytes(1));
    await s.rename("a", "Willow Bend");
    await s.markSaved("a", 4);
    await s.copy("a", { id: "c", name: "Willow Bend (copy)", at: at(5) });
    const [c, a] = await s.list();
    expect(a).toMatchObject({ id: "a", name: "Willow Bend", savedToTimberborn: 4 });
    // a copy is a map of its own: not saved to Timberborn yet
    expect(c).toMatchObject({ id: "c", name: "Willow Bend (copy)", savedToTimberborn: null, editedAt: at(5) });
    expect(await s.project("c")).toEqual(bytes(1));
  });

  it("deletes a map, and brings it back on undo", async () => {
    const s = openYourMaps(new IDBFactory());
    await s.put(entry("a", 1), bytes(1));
    const r = await s.remove("a");
    expect(r?.entry.id).toBe("a");
    expect(await s.list()).toEqual([]);
    await s.restore(r!);
    expect((await s.list()).map((e) => e.id)).toEqual(["a"]);
    expect(await s.project("a")).toEqual(bytes(1));
    expect(await s.remove("gone")).toBe(null);
  });

  it("says plainly when there is no browser storage or it is full", async () => {
    const none = openYourMaps(null);
    expect(await none.list()).toEqual([]);
    const r = await none.put(entry("a", 1), bytes(1));
    expect(r).toEqual({ ok: false, reason: "unavailable" });
    expect(storeProblem(r)).toMatch(/isn't keeping Your maps/);
    expect(storeProblem({ ok: false, reason: "full" })).toMatch(/^Browser storage is full/);
    expect(storeProblem({ ok: true })).toBe(null);
  });
});

/** Timers the test runs by hand. */
function clock() {
  let t = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let next = 1;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (id: unknown) => void timers.delete(id as number),
    advance(ms: number) {
      t += ms;
      for (const [id, x] of [...timers]) if (x.at <= t) {
        timers.delete(id);
        x.fn();
      }
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("saving in the background", () => {
  it("saves once the edits settle, one snapshot for a burst of edits", async () => {
    const puts: string[] = [];
    const store: Pick<YourMapsStore, "put"> = { put: async (e) => (puts.push(`${e.id}@${e.revision}`), { ok: true }) };
    const c = clock();
    const saver = new YourMapsSaver(store, { delay: 1000, ...c });
    let taken = 0;
    for (let rev = 1; rev <= 5; rev++) {
      saver.changed("a", () => (taken++, { entry: entry("a", rev, { revision: rev }), project: bytes(rev) }));
      c.advance(300);
    }
    expect(puts).toEqual([]);
    c.advance(1000);
    await settle();
    expect(puts).toEqual(["a@5"]);
    expect(taken).toBe(1);
    expect(saver.busy()).toBe(false);
  });

  it("saves at once when a map is replaced, and never overlaps two writes of one map", async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const store: Pick<YourMapsStore, "put"> = {
      put: (e) =>
        new Promise((resolve) => {
          order.push(`start ${e.revision}`);
          release = () => {
            order.push(`end ${e.revision}`);
            resolve({ ok: true });
          };
        }),
    };
    const c = clock();
    const saver = new YourMapsSaver(store, { delay: 1000, ...c });
    saver.changed("a", () => ({ entry: entry("a", 1, { revision: 1 }), project: bytes(1) }));
    void saver.flush("a");
    await settle();
    // an edit while the first write runs waits for it
    saver.changed("a", () => ({ entry: entry("a", 2, { revision: 2 }), project: bytes(2) }));
    void saver.flush();
    await settle();
    expect(order).toEqual(["start 1"]);
    release();
    await settle();
    await settle();
    expect(order).toEqual(["start 1", "end 1", "start 2"]);
    release();
    await settle();
    expect(saver.busy()).toBe(false);
  });

  it("flush waits for an in-flight outgoing snapshot and write with no pending timer", async () => {
    let take!: (value: { entry: YourMapEntry; project: Uint8Array }) => void;
    let write!: (value: { ok: true }) => void;
    const c = clock();
    const saver = new YourMapsSaver({ put: () => new Promise((r) => { write = r; }) }, c);
    saver.changed("a", () => new Promise((r) => { take = r; }));
    void saver.flush("a");
    await settle();
    let done = false;
    const barrier = saver.flush().then(() => { done = true; });
    await settle();
    expect(done).toBe(false);
    take({ entry: entry("a", 1), project: bytes(1) });
    await settle();
    expect(done).toBe(false);
    write({ ok: true });
    await barrier;
    expect(done).toBe(true);
    expect(saver.busy()).toBe(false);
  });

  it("reports a failed save so the page can say so", async () => {
    const results: string[] = [];
    const saver = new YourMapsSaver({ put: async () => ({ ok: false, reason: "full" }) }, { onResult: (r) => results.push(r.ok ? "ok" : r.reason) });
    saver.changed("a", () => ({ entry: entry("a", 1), project: bytes(1) }));
    await saver.flush();
    const failing = new YourMapsSaver(
      {
        put: async () => {
          throw new Error("storage gone");
        },
      },
      { onResult: (r) => results.push(r.ok ? "ok" : r.reason) },
    );
    failing.changed("a", () => ({ entry: entry("a", 1), project: bytes(1) }));
    await failing.flush();
    expect(results).toEqual(["full", "unavailable"]);
  });
});

// From the saving review (investigation/saving-review, F2, F4 and its quota control): two tabs on one
// database, a save queued behind a write, a deleted map's queued save, and a write that fails half way.
describe("saving safely", () => {
  it("a second tab's stale save can't overwrite the first tab's saved edit", async () => {
    const factory = new IDBFactory();
    const a = openYourMaps(factory);
    const b = openYourMaps(factory);
    await a.put(entry("a", 1), bytes(1));
    const [oldA] = await a.list();
    const [oldB] = await b.list();
    const results: string[] = [];
    const sa = new YourMapsSaver(a);
    const sb = new YourMapsSaver(b, { onResult: (r) => results.push(r.ok ? "ok" : r.reason) });
    sa.changed("a", () => ({ entry: { ...oldA, revision: 2 }, project: bytes(2) }));
    sb.changed("a", () => ({ entry: { ...oldB, revision: 2 }, project: bytes(3) }));
    await sa.flush();
    await sb.flush();
    expect(await a.project("a")).toEqual(bytes(2));
    expect(results).toEqual(["conflict"]);
    expect(storeProblem({ ok: false, reason: "conflict" })).toMatch(/another tab/);
  });

  it("a second tab's stale save can't bring back a deleted map", async () => {
    const factory = new IDBFactory();
    const a = openYourMaps(factory);
    const b = openYourMaps(factory);
    await a.put(entry("a", 1), bytes(1));
    const [old] = await b.list();
    const saver = new YourMapsSaver(b);
    saver.changed("a", () => ({ entry: { ...old, revision: 2 }, project: bytes(2) }));
    await a.remove("a");
    await saver.flush();
    expect(await a.project("a")).toBeNull();
  });

  it("a pending save can't undo another tab's rename", async () => {
    const factory = new IDBFactory();
    const a = openYourMaps(factory);
    const b = openYourMaps(factory);
    await a.put(entry("a", 1), bytes(1));
    const [old] = await b.list();
    const saver = new YourMapsSaver(b);
    saver.changed("a", () => ({ entry: old, project: bytes(2) }));
    await a.rename("a", "Renamed");
    await saver.flush();
    expect((await a.list())[0].name).toBe("Renamed");
  });

  it("the same tab saves one map again and again, each save over the last", async () => {
    const s = openYourMaps(new IDBFactory());
    let e = entry("a", 1);
    const saver = new YourMapsSaver(s, { onResult: (r) => expect(r.ok).toBe(true) });
    for (let rev = 1; rev <= 3; rev++) {
      saver.changed("a", () => ((e = { ...e, revision: rev }), { entry: e, project: bytes(rev) }));
      await saver.flush();
    }
    expect(await s.project("a")).toEqual(bytes(3));
  });

  it("flush waits for a save queued behind a write already in storage", async () => {
    const order: number[] = [];
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let first = true;
    const saver = new YourMapsSaver({
      put: async (e) => {
        if (first) (first = false), await hold;
        order.push(e.revision);
        return { ok: true };
      },
    });
    saver.changed("a", () => ({ entry: entry("a", 1, { revision: 1 }), project: bytes(1) }));
    void saver.flush();
    await settle();
    saver.changed("a", () => ({ entry: entry("a", 2, { revision: 2 }), project: bytes(2) }));
    void saver.flush("a");
    await settle();
    let done = false;
    const barrier = saver.flush().then(() => (done = true));
    await settle();
    expect(done).toBe(false);
    release();
    await barrier;
    expect(order).toEqual([1, 2]);
  });

  it("discarding a deleted map drops its queued save", async () => {
    const puts: number[] = [];
    const c = clock();
    const saver = new YourMapsSaver({ put: async (e) => (puts.push(e.revision), { ok: true }) }, c);
    saver.changed("a", () => ({ entry: entry("a", 1, { revision: 7 }), project: bytes(1) }));
    await saver.discard("a");
    c.advance(10_000);
    await saver.flush();
    expect(puts).toEqual([]);
    expect(saver.busy()).toBe(false);
  });

  it("a write that fails half way keeps the map as it was", async () => {
    const s = openYourMaps(new IDBFactory());
    await s.put(entry("q", 1, { name: "before" }), new Uint8Array([1]));
    // fake-indexeddb's own request, abort and rollback, with the project's write failing after the entry's succeeded
    const proto = IDBTransaction.prototype as unknown as { _execRequestAsync: (args: { source?: { name?: string }; operation: { name: string } }) => unknown };
    const original = proto._execRequestAsync;
    let injected = false;
    proto._execRequestAsync = function (args) {
      if (!injected && args.source?.name === "projects" && args.operation.name.includes("storeRecord")) {
        injected = true;
        args = { ...args, operation: Object.defineProperty(() => { throw new DOMException("Injected full storage", "QuotaExceededError"); }, "name", { value: "injected" }) };
      }
      return original.call(this, args);
    };
    let r: Awaited<ReturnType<typeof s.put>>;
    try {
      r = await s.put(entry("q", 2, { name: "after", revision: 2 }), new Uint8Array([2]));
    } finally {
      proto._execRequestAsync = original;
    }
    expect(injected).toBe(true);
    expect(r).toEqual({ ok: false, reason: "full" });
    expect((await s.list())[0]).toMatchObject({ name: "before", revision: 1 });
    expect(await s.project("q")).toEqual(new Uint8Array([1]));
  });
});

describe("when a map was last edited", () => {
  const now = new Date(Date.UTC(2026, 8, 29, 12, 0));
  it("in plain words", () => {
    expect(whenText(at(0), now)).toBe("Edited just now");
    expect(whenText(at(-5), now)).toBe("Edited 5 minutes ago");
    expect(whenText(at(-60), now)).toBe("Edited 1 hour ago");
    expect(whenText(at(-60 * 24 * 2), now)).toBe("Edited 2 days ago");
    expect(whenText(at(-60 * 24 * 30), now)).toMatch(/^Edited \d+ Aug$/);
    expect(whenText("not a date", now)).toBe("");
  });
});

describe("the map's size on an entry", () => {
  const project = (w: number, h: number) => gzipSync(strToU8(JSON.stringify({ app: "dam-good-maps", formatVersion: 3, base: { sizeX: w, sizeY: h } })));

  it("a new save records the size, square or not", async () => {
    const s = openYourMaps(new IDBFactory());
    await s.put(entry("sq", 1), project(128, 128));
    await s.put(entry("wide", 2), project(192, 96));
    const list = await s.list();
    expect(list.find((e) => e.id === "sq")?.size).toEqual({ w: 128, h: 128 });
    expect(list.find((e) => e.id === "wide")?.size).toEqual({ w: 192, h: 96 });
  });

  it("the saver fills it from the project it saves", async () => {
    const s = openYourMaps(new IDBFactory());
    const saver = new YourMapsSaver(s);
    saver.changed("a", () => ({ entry: entry("a", 1), project: project(64, 80) }));
    await saver.flush();
    expect((await s.list())[0].size).toEqual({ w: 64, h: 80 });
  });

  it("an old entry without a size gets it on the next list, and keeps it", async () => {
    const factory = new IDBFactory();
    const s = openYourMaps(factory);
    await s.put(entry("a", 1, { size: undefined }), project(256, 256));
    // simulate an entry saved before sizes: strip the field in storage
    const raw = await new Promise<IDBDatabase>((res) => {
      const r = factory.open("dgm-your-maps", 1);
      r.onsuccess = () => res(r.result);
    });
    await new Promise<void>((res) => {
      const t = raw.transaction(["entries"], "readwrite");
      const st = t.objectStore("entries");
      st.get("a").onsuccess = (ev) => {
        const e = (ev.target as IDBRequest).result;
        delete e.size;
        st.put(e);
      };
      t.oncomplete = () => res();
    });
    raw.close();
    expect((await s.list())[0].size).toEqual({ w: 256, h: 256 });
    expect((await openYourMaps(factory).list())[0].size).toEqual({ w: 256, h: 256 });
  });

  it("an unreadable project leaves the size absent without breaking the list", async () => {
    const s = openYourMaps(new IDBFactory());
    await s.put(entry("bad", 1), new Uint8Array([1, 2, 3]));
    await s.put(entry("good", 2), project(128, 128));
    const list = await s.list();
    expect(list.map((e) => e.id)).toEqual(["good", "bad"]);
    expect(list[1].size).toBeUndefined();
    expect(list[0].size).toEqual({ w: 128, h: 128 });
  });
});
