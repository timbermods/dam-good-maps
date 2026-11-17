// A map being made is bounded on the time it actually ran, and keeps the screen on while it runs (the owner's phone: a
// locked screen held the worker still while the card counted on, attempts 8 to 10 "taking" thirty minutes).
import { expect, test } from "vitest";
import { boundOf, OFFER_AFTER_S, RunningClock, startMaking, STOP_AFTER_S } from "../../src/ui/makingClock";

test("the running clock leaves out the time the page was hidden, and says it paused until the next attempt", () => {
  let t = 1000;
  const c = new RunningClock(() => t);
  t += 10_000;
  expect(c.seconds()).toBe(10);
  c.hide();
  t += 30 * 60_000; // the screen locked for half an hour
  expect(c.seconds()).toBe(10);
  expect(c.paused).toBe(false);
  c.show();
  expect(c.paused).toBe(true);
  t += 5000;
  expect(c.seconds()).toBe(15);
  c.attemptBegan();
  expect(c.paused).toBe(false);
  // (a clock started on a hidden page counts from when it is shown)
  const h = new RunningClock(() => t, true);
  t += 60_000;
  expect(h.seconds()).toBe(0);
  h.show();
  t += 2000;
  expect(h.seconds()).toBe(2);
});

test("the bounds: the offer after OFFER_AFTER_S of running time, the stop after STOP_AFTER_S, hidden time using none of them", () => {
  expect(OFFER_AFTER_S).toBe(30);
  expect(STOP_AFTER_S).toBe(300);
  expect(boundOf(0)).toBe("trying");
  expect(boundOf(29.9)).toBe("trying");
  expect(boundOf(30)).toBe("offer");
  expect(boundOf(299.9)).toBe("offer");
  expect(boundOf(300)).toBe("stop");
  let t = 0;
  const c = new RunningClock(() => t);
  t += 20_000;
  c.hide();
  t += 3_600_000;
  c.show();
  expect(boundOf(c.seconds())).toBe("trying");
  t += 10_000;
  expect(boundOf(c.seconds())).toBe("offer");
  t += 270_000;
  expect(boundOf(c.seconds())).toBe("stop");
  // (the end-to-end tests' rate reaches the bounds sooner)
  let r = 0;
  const fast = new RunningClock(() => r, false, () => 100);
  r += 3000;
  expect(boundOf(fast.seconds())).toBe("stop");
});

/** A page whose visibility a test sets, and a browser's screen wake lock that records what is held. */
function stubs() {
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  const set = (v: DocumentVisibilityState) => {
    doc.visibilityState = v;
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  const held = new Set<object>();
  let requests = 0;
  const nav = {
    wakeLock: {
      async request(type: "screen") {
        expect(type).toBe("screen");
        requests++;
        const s = { release: async () => void held.delete(s) };
        held.add(s);
        return s;
      },
    },
  };
  return { doc: doc as unknown as Document, set, nav, held, requests: () => requests };
}
const settle = () => new Promise((done) => setTimeout(done, 0));

test("the screen is held on from the start to the end, taken again when the page comes back, and let go always", async () => {
  const s = stubs();
  let t = 0;
  const m = startMaking({ now: () => t, doc: s.doc, nav: s.nav });
  await settle();
  expect(s.held.size).toBe(1);
  // hidden: the browser drops the lock (as it does), the clock stops
  t += 1000;
  s.set("hidden");
  s.held.clear();
  t += 60_000;
  s.set("visible");
  await settle();
  expect(s.requests()).toBe(2);
  expect(s.held.size).toBe(1);
  expect(m.clock.seconds()).toBe(1);
  expect(m.clock.paused).toBe(true);
  m.end();
  await settle();
  expect(s.held.size).toBe(0);
  // nothing taken after the end
  s.set("hidden");
  s.set("visible");
  await settle();
  expect(s.requests()).toBe(2);
  expect(s.held.size).toBe(0);
});

test("a lock that comes after the end is let go; a browser without wake locks still counts", async () => {
  const s = stubs();
  const m = startMaking({ now: () => 0, doc: s.doc, nav: s.nav });
  m.end();
  await settle();
  expect(s.held.size).toBe(0);
  let t = 0;
  const bare = startMaking({ now: () => t, doc: s.doc, nav: {} });
  t += 4000;
  expect(bare.clock.seconds()).toBe(4);
  bare.end();
});
