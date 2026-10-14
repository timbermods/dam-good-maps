// Where the sources' labels stand: apart from one another and from the panels, merged when there is no room, and
// steady while the camera moves.

import { describe, expect, it } from "vitest";
import { GAP, labelWords, layoutLabels, type LabelIn, type LabelOut, type LayoutEnv, type Rect } from "../../src/editor/sources/labelLayout";

const env = (obstacles: Rect[] = [], w = 800, h = 600): LayoutEnv => ({ bounds: { w, h }, obstacles, width: (words) => words.length * 6.5 + 22, height: 24 });
const label = (id: number, ax: number, ay: number, extra: Partial<LabelIn> = {}): LabelIn => ({ id, ax, ay, count: 1, strength: 0.37, bad: false, feeding: false, target: false, ...extra });
const apart = (a: Rect, b: Rect) => a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h;
const drawn = (out: LabelOut[]) => out.filter((o) => !o.hidden);
const noneOver = (out: LabelOut[]) => {
  const d = drawn(out);
  for (let a = 0; a < d.length; a++) for (let b = a + 1; b < d.length; b++) expect(apart(d[a].box, d[b].box), `${d[a].words} and ${d[b].words}`).toBe(true);
};

describe("the sources' labels", () => {
  it("says a group as it always has, and labels merged on the screen as nearby", () => {
    expect(labelWords(1, 0.37, false)).toBe("0.37 water/s");
    expect(labelWords(3, 2, true)).toBe("3 sources, 2 badwater/s");
    expect(labelWords(5, 2.5, false, true)).toBe("5 sources nearby, 2.5 water/s");
  });

  it("keeps a lone label where it is, over its source", () => {
    const [o] = layoutLabels([label(0, 300, 300)], env());
    expect(o.hidden).toBe(false);
    expect([o.x, o.y]).toEqual([300, 300]);
  });

  it("moves labels that stand on one another apart", () => {
    const out = layoutLabels([label(0, 300, 300), label(1, 300, 300), label(2, 305, 296), label(3, 310, 300, { bad: true })], env());
    expect(drawn(out).reduce((n, o) => n + o.count, 0)).toBe(4);
    noneOver(out);
  });

  it("keeps labels off an open panel, and draws none for a plain source behind one", () => {
    const panel: Rect = { x: 250, y: 100, w: 200, h: 250 };
    const out = layoutLabels([label(0, 300, 372), label(1, 300, 200)], env([panel]));
    expect(out[1].hidden).toBe(true);
    expect(out[0].hidden).toBe(false);
    expect(apart(out[0].box, panel)).toBe(true);
    expect(out[0].box.y + out[0].box.h + GAP <= panel.y || out[0].box.y >= panel.y + panel.h + GAP || out[0].box.x + out[0].box.w + GAP <= panel.x || out[0].box.x >= panel.x + panel.w + GAP).toBe(true);
  });

  it("moves the pointer's label and a feeding one clear of a panel its source is under, never hiding them", () => {
    const panel: Rect = { x: 250, y: 100, w: 200, h: 250 };
    const out = layoutLabels([label(0, 300, 200, { target: true }), label(1, 400, 150, { feeding: true }), label(2, 320, 220)], env([panel]));
    for (const k of [0, 1]) {
      expect(out[k].hidden).toBe(false);
      expect(apart(out[k].box, panel)).toBe(true);
    }
    expect(out[2].hidden).toBe(true);
  });

  it("brings a label in from the view's edge, and draws none for a source outside it", () => {
    const out = layoutLabels([label(0, 5, 40), label(1, 900, 40)], env());
    expect(out[0].box.x).toBeGreaterThanOrEqual(0);
    expect(out[1].hidden).toBe(true);
  });

  const crowd = () => Array.from({ length: 14 }, (_, i) => label(i, 100 + (i % 2), 60 + (i % 3), { strength: 0.5 }));

  it("merges the labels of one kind when there is no room, never losing a source or its water", () => {
    const out = layoutLabels(crowd(), env([], 240, 110));
    const d = drawn(out);
    expect(d.length).toBeLessThan(14);
    expect(d.reduce((n, o) => n + o.count, 0)).toBe(14);
    expect(Math.round(d.reduce((n, o) => n + o.strength, 0) * 100) / 100).toBe(7);
    expect(d.some((o) => o.count > 1 && o.words.startsWith(`${o.count} sources nearby, `))).toBe(true);
    noneOver(out);
  });

  it("never merges badwater into clean water, or feeding into plain, or anything into or out of the pointer's label", () => {
    const many = (from: number, extra: Partial<LabelIn>) => Array.from({ length: 6 }, (_, i) => label(from + i, 100 + i, 60, extra));
    const out = layoutLabels([...many(0, {}), ...many(10, { bad: true }), ...many(20, { feeding: true }), label(30, 101, 60, { target: true, strength: 0.5 })], env([], 240, 110));
    for (const o of drawn(out)) expect(o.words.includes("badwater")).toBe(o.bad);
    const mine = out.find((o) => o.id === 30)!;
    expect(mine.hidden).toBe(false);
    expect([mine.count, mine.strength, mine.words]).toEqual([1, 0.5, "0.5 water/s"]);
    expect(mine.merged).toEqual([]);
    expect(out.every((o) => o.into !== 30)).toBe(true);
    const ids = (o: LabelOut) => [o.id, ...o.merged];
    for (const o of drawn(out)) {
      const kinds = new Set(ids(o).map((k) => (k >= 20 && k < 30 ? "feeding" : k >= 10 && k < 20 ? "bad" : k === 30 ? "target" : "plain")));
      expect(kinds.size).toBe(1);
    }
  });

  it("does not merge labels whose sources are far apart", () => {
    // (a strip too narrow for them, their sources 300px apart: they cannot merge, so they are left as they are)
    const out = layoutLabels([label(0, 20, 60), label(1, 320, 60)], env([], 340, 40));
    expect(out.every((o) => o.into === null)).toBe(true);
  });

  it("raises a crowded label that has no partner of its kind, so it is placed and the others give way", () => {
    // a lone badwater in the middle of a clean crowd, in a view with room for only a few labels
    const clean = Array.from({ length: 8 }, (_, i) => label(i, 120 + (i % 3), 64, { strength: 0.5 }));
    const out = layoutLabels([...clean, label(99, 120, 64, { bad: true, strength: 2 })], env([], 260, 120));
    const lone = out.find((o) => o.id === 99)!;
    expect(lone.hidden).toBe(false);
    noneOver(out);
    expect(drawn(out).reduce((n, o) => n + o.count, 0)).toBe(9);
  });

  it("gives the same answer every time, and keeps the pointer's label in its place", () => {
    const labels = [label(0, 300, 300), label(1, 300, 300, { target: true }), label(2, 300, 300)];
    const a = layoutLabels(labels, env());
    expect(layoutLabels(labels, env())).toEqual(a);
    expect([a[1].x, a[1].y]).toEqual([300, 300]);
  });

  it("keeps a label where it stood while it is still clear, and its merge too, as the camera moves", () => {
    const frame = (dx: number, prev: LabelOut[] | null) => layoutLabels([label(0, 300 + dx, 300), label(1, 300 + dx, 300.4), label(2, 300 + dx, 301)].map((l) => ({ ...l, prev: prev?.find((o) => o.id === l.id) ?? null })), env());
    let prev = frame(0, null);
    const first = prev.map((o) => [o.dx, o.dy, o.hidden]);
    for (let k = 1; k <= 40; k++) {
      // (a hundredth of a pixel and a pixel and a half)
      prev = frame(k % 2 ? 0.01 * k : 1.6, prev);
      expect(prev.map((o) => [o.dx, o.dy, o.hidden])).toEqual(first);
    }
    // (and the same with labels merged: the crowd keeps its merges)
    const dense = (dx: number, prev: LabelOut[] | null) => layoutLabels(crowd().map((l) => ({ ...l, ax: l.ax + dx, prev: prev?.find((o) => o.id === l.id) ?? null })), env([], 240, 110));
    let p = dense(0, null);
    const merges = p.map((o) => [o.into, o.hidden, o.words]);
    for (let k = 1; k <= 20; k++) {
      p = dense(k % 2 ? 1.6 : 0, p);
      expect(p.map((o) => [o.into, o.hidden, o.words])).toEqual(merges);
    }
  });

  it("puts a moved label back at its own spot, and lets a merge go, once the crowd has cleared", () => {
    const withPrev = (ls: LabelIn[], prev: LabelOut[] | null): LabelIn[] =>
      ls.map((l) => {
        const o = prev?.find((q) => q.id === l.id);
        return { ...l, prev: o ? { dx: o.dx, dy: o.dy, into: o.into } : null };
      });
    // two labels, one nudged off the other; then pulled 300px apart
    const near = layoutLabels(withPrev([label(0, 300, 300), label(1, 300, 300)], null), env());
    expect(near.some((o) => o.dx !== 0 || o.dy !== 0)).toBe(true);
    const far = layoutLabels(withPrev([label(0, 300, 300), label(1, 600, 300)], near), env());
    expect(far.map((o) => [o.dx, o.dy])).toEqual([[0, 0], [0, 0]]);
    // a crowd of eight merged into a few labels; then spread out to about 150px apart
    const tight = layoutLabels(withPrev(Array.from({ length: 8 }, (_, i) => label(i, 400 + (i % 2), 60 + (i % 3), { strength: 0.5 })), null), env([], 1700, 110));
    expect(drawn(tight).length).toBeLessThan(8);
    const spread = layoutLabels(withPrev(Array.from({ length: 8 }, (_, i) => label(i, 100 + i * 150, 60, { strength: 0.5 })), tight), env([], 1700, 110));
    expect(drawn(spread)).toHaveLength(8);
    expect(spread.every((o) => o.dx === 0 && o.dy === 0 && o.into === null)).toBe(true);
  });

  it("never runs a moved label's line behind another label, or ends it under one", () => {
    // (a line's points, tested against the other labels' boxes)
    const through = (o: LabelOut, r: Rect) => {
      const x2 = Math.max(o.box.x, Math.min(o.ax, o.box.x + o.box.w));
      const y2 = Math.max(o.box.y, Math.min(o.ay, o.box.y + o.box.h));
      for (let t = 0; t <= 1; t += 0.02) {
        const x = o.ax + (x2 - o.ax) * t;
        const y = o.ay + (y2 - o.ay) * t;
        if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
      }
      return false;
    };
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let round = 0; round < 40; round++) {
      const ls = Array.from({ length: 4 + Math.floor(rnd() * 8) }, (_, i) => label(i, 60 + rnd() * 280, 50 + rnd() * 90, { bad: rnd() < 0.3, strength: Math.round(rnd() * 300) / 100 }));
      const out = drawn(layoutLabels(ls, env([], 420, 180)));
      for (const o of out) {
        if (Math.hypot(o.dx, o.dy) <= 24) continue;
        for (const q of out) if (q !== o) expect(through(o, q.box), `round ${round}: the line of ${o.words} behind ${q.words}`).toBe(false);
      }
    }
  });
});
