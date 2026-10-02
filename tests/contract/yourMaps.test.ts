// Your maps (PLAN §20 D234, D330; docs/UI-BRIEF.md §3, §6): every edited map kept in this browser,
// the last 30 unstarred and every starred one; rename, star, copy, undoable delete, the Timberborn
// mark; a full disk said plainly; saving in the background after edits settle, never waited on.
// The core's model and saver directly (D342 (5)), and the IndexedDB adapter over fake-indexeddb. The
// list itself is exercised in tests/e2e/page-parts.spec.ts.

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { YourMapsSaver } from "../../src/core/library/saver";
import { whenText } from "../../src/core/library/when";
import { KEEP, storeProblem, toDrop, type YourMapEntry, type YourMapsStore } from "../../src/core/library/yourMaps";
import { openYourMaps } from "../../src/platform/yourMaps";

const at = (min: number) => new Date(Date.UTC(2026, 8, 29, 12, 0) + min * 60_000).toISOString();
const entry = (id: string, min: number, over: Partial<YourMapEntry> = {}): YourMapEntry => ({ id, name: `Map ${id}`, kind: "generated", createdAt: at(min), editedAt: at(min), starred: false, thumbnail: null, revision: 1, savedToTimberborn: null, bytes: 0, ...over });
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

  it("keeps the last 30 unstarred maps and every starred one", async () => {
    const s = openYourMaps(new IDBFactory());
    await s.put(entry("old-star", 0, { starred: true }), bytes(0));
    for (let k = 1; k <= KEEP + 2; k++) await s.put(entry(`m${k}`, k), bytes(k));
    const ids = (await s.list()).map((e) => e.id);
    expect(ids.length).toBe(KEEP + 1);
    expect(ids).toContain("old-star");
    expect(ids).not.toContain("m1");
    expect(ids).not.toContain("m2");
    expect(ids).toContain(`m${KEEP + 2}`);
    expect(await s.project("m1")).toBe(null);
  });

  it("never drops the map just saved, even an old one", () => {
    const all = Array.from({ length: KEEP + 1 }, (_, k) => entry(`m${k}`, k + 10));
    all.push(entry("late", 0));
    expect(toDrop(all, "late")).not.toContain("late");
    expect(toDrop(all, "late").length).toBe(2);
  });

  it("renames, stars, copies and marks a map saved to Timberborn", async () => {
    const s = openYourMaps(new IDBFactory());
    await s.put(entry("a", 1, { revision: 4 }), bytes(1));
    await s.rename("a", "Willow Bend");
    await s.star("a", true);
    await s.markSaved("a", 4);
    await s.copy("a", { id: "c", name: "Willow Bend (copy)", at: at(5) });
    const [c, a] = await s.list();
    expect(a).toMatchObject({ id: "a", name: "Willow Bend", starred: true, savedToTimberborn: 4 });
    // a copy is a map of its own: not starred, not saved to Timberborn yet
    expect(c).toMatchObject({ id: "c", name: "Willow Bend (copy)", starred: false, savedToTimberborn: null, editedAt: at(5) });
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
