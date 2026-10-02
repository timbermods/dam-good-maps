// The words beside the pointer (D322): while F sizes the brush, its size shows and nothing replaces
// it. Kyler's editor showed "level 15" while F was held: a size stepped with [ a moment before had
// started a flash, and when the flash ended it put the brush's target back over the size
// (brushKit.spec's F sizing failed on CI with exactly that).

import { describe, expect, it } from "vitest";
import { PointerWords, type Timers } from "../../src/editor/pointerWords";

/** Timers run by hand. */
function clock(): Timers & { tick(ms: number): void } {
  let now = 0;
  const due: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  return {
    set(fn, ms) {
      const id = next++;
      due.push({ at: now + ms, fn, id });
      return id;
    },
    clear(t) {
      const k = due.findIndex((d) => d.id === t);
      if (k >= 0) due.splice(k, 1);
    },
    tick(ms) {
      now += ms;
      for (const d of due.filter((e) => e.at <= now)) {
        due.splice(due.indexOf(d), 1);
        d.fn();
      }
    },
  };
}

function words() {
  const c = clock();
  let shown: string | null = null;
  const w = new PointerWords((t) => (shown = t), () => true, c, 1200);
  return { w, c, shown: () => shown };
}

describe("the words beside the pointer (D322)", () => {
  it("while F is held the size shows, even when a flash started before it ends", () => {
    const { w, c, shown } = words();
    w.brush("level 15");
    // [ steps the size: a flash
    w.flash("size 4");
    c.tick(300);
    // F held: the ring's size follows the pointer
    w.sizing("size 6");
    w.sizing("size 7");
    // the brush's own words come while F is held (the ring redrawn): they wait
    w.brush("level 15");
    c.tick(1500);
    expect(shown()).toBe("size 7");
    // F let go: the brush's own words again
    w.sizing(null);
    expect(shown()).toBe("level 15");
  });

  it("a word flashed while F is held gives the size back when it ends", () => {
    const { w, c, shown } = words();
    w.brush("down to 4");
    w.sizing("size 9");
    w.flash("strength 3");
    c.tick(1300);
    expect(shown()).toBe("size 9");
  });

  it("a flash shows for a moment, then the brush's own words", () => {
    const { w, c, shown } = words();
    w.brush("up to 8");
    w.flash("strength 6");
    w.brush("up to 9");
    expect(shown()).toBe("strength 6");
    c.tick(1300);
    expect(shown()).toBe("up to 9");
  });

  it("the brush's words show only while a brush is out", () => {
    const c = clock();
    let shown: string | null = "x";
    let out = true;
    const w = new PointerWords((t) => (shown = t), () => out, c, 1200);
    w.brush("level 3");
    w.flash("size 5");
    out = false;
    c.tick(1300);
    expect(shown).toBeNull();
  });
});
