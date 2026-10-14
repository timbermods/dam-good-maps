// Where the sources' labels stand: apart from one another and from the panels, merged when there is no room.

import { describe, expect, it } from "vitest";
import { GAP, labelWords, layoutLabels, type LabelIn, type LabelOut, type LayoutEnv, type Rect } from "../../src/editor/sources/labelLayout";

const env = (obstacles: Rect[] = [], w = 800, h = 600): LayoutEnv => ({ bounds: { w, h }, obstacles, width: (words) => words.length * 6.5 + 22, height: 24 });
const label = (id: number, ax: number, ay: number, extra: Partial<LabelIn> = {}): LabelIn => ({ id, ax, ay, count: 1, strength: 0.37, bad: false, priority: 0, ...extra });
const apart = (a: Rect, b: Rect) => a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h;
const drawn = (out: LabelOut[]) => out.filter((o) => !o.hidden);

describe("the sources' labels", () => {
  it("says a group as it always has", () => {
    expect(labelWords(1, 0.37, false)).toBe("0.37 water/s");
    expect(labelWords(3, 2, true)).toBe("3 sources, 2 badwater/s");
  });

  it("keeps a lone label where it is, over its source", () => {
    const [o] = layoutLabels([label(0, 300, 300)], env());
    expect(o.hidden).toBe(false);
    expect([o.x, o.y]).toEqual([300, 300]);
  });

  it("moves labels that stand on one another apart", () => {
    const out = drawn(layoutLabels([label(0, 300, 300), label(1, 300, 300), label(2, 305, 296), label(3, 310, 300, { bad: true })], env()));
    expect(out).toHaveLength(4);
    for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) expect(apart(out[a].box, out[b].box), `${a} and ${b}`).toBe(true);
  });

  it("keeps labels off an open panel, and draws none for a source behind one", () => {
    const panel: Rect = { x: 250, y: 100, w: 200, h: 250 };
    const out = layoutLabels([label(0, 300, 372), label(1, 300, 200)], env([panel]));
    expect(out[1].hidden).toBe(true);
    expect(out[0].hidden).toBe(false);
    expect(apart(out[0].box, panel)).toBe(true);
    // (and a gap clear of it)
    expect(out[0].box.y + out[0].box.h + GAP <= panel.y || out[0].box.y >= panel.y + panel.h + GAP || out[0].box.x + out[0].box.w + GAP <= panel.x || out[0].box.x >= panel.x + panel.w + GAP).toBe(true);
  });

  it("brings a label in from the view's edge, and draws none for a source outside it", () => {
    const out = layoutLabels([label(0, 5, 40), label(1, 900, 40)], env());
    expect(out[0].box.x).toBeGreaterThanOrEqual(0);
    expect(out[1].hidden).toBe(true);
  });

  it("merges the labels of one kind when there is no room, never losing a source or its water", () => {
    const crowd = Array.from({ length: 14 }, (_, i) => label(i, 100 + (i % 2), 60 + (i % 3), { strength: 0.5 }));
    const out = drawn(layoutLabels(crowd, env([], 240, 110)));
    expect(out.length).toBeLessThan(14);
    expect(out.reduce((n, o) => n + o.count, 0)).toBe(14);
    expect(Math.round(out.reduce((n, o) => n + o.strength, 0) * 100) / 100).toBe(7);
    expect(out.some((o) => o.count > 1 && o.words.startsWith(`${o.count} sources, `))).toBe(true);
  });

  it("never merges badwater into clean water", () => {
    const out = drawn(layoutLabels([...Array.from({ length: 6 }, (_, i) => label(i, 100, 60)), ...Array.from({ length: 6 }, (_, i) => label(10 + i, 102, 60, { bad: true }))], env([], 240, 110)));
    for (const o of out) expect(o.words.includes("badwater")).toBe(o.bad);
  });

  it("gives the same answer every time, and keeps the pointer's label in its place", () => {
    const labels = [label(0, 300, 300), label(1, 300, 300, { priority: 2 }), label(2, 300, 300)];
    const a = layoutLabels(labels, env());
    expect(layoutLabels(labels, env())).toEqual(a);
    expect([a[1].x, a[1].y]).toEqual([300, 300]);
  });
});
