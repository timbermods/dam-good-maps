// Where the words beside the pointer go (the Items shelf, the panels and the bars are not the free view): the first spot
// when it is clear, the pointer's other sides when it is not, and never off the view.

import { describe, expect, it } from "vitest";
import { placeNote, type Box } from "../../src/editor/view/pointerNote";

const view: Box = { x0: 0, y0: 0, x1: 1600, y1: 900 };
// (the Items shelf down the right edge, a bar across the foot, the panel at the left)
const shelf: Box = { x0: 1410, y0: 165, x1: 1590, y1: 890 };
const bar: Box = { x0: 204, y0: 702, x1: 1396, y1: 890 };
const panel: Box = { x0: 10, y0: 56, x1: 650, y1: 400 };
const avoid = [shelf, bar, panel];
const note = { w: 300, h: 40 };

const hits = (n: { x: number; y: number }, b: Box) => n.x < b.x1 && n.x + note.w > b.x0 && n.y < b.y1 && n.y + note.h > b.y0;
const inside = (n: { x: number; y: number }) => n.x >= 0 && n.y >= 0 && n.x + note.w <= view.x1 && n.y + note.h <= view.y1;

describe("a note beside the pointer", () => {
  it("sits below and right of the pointer when that is free", () => {
    expect(placeNote(null, { x: 800, y: 300 }, note, view, avoid)).toEqual({ x: 816, y: 316 });
  });
  it("flips to the pointer's left when the shelf is on its right", () => {
    const at = placeNote(null, { x: 1300, y: 300 }, note, view, avoid);
    expect(hits(at, shelf)).toBe(false);
    expect(at).toEqual({ x: 1300 - 16 - note.w, y: 316 });
  });
  it("goes above the pointer when the bar is below it, and flips both ways in the corner", () => {
    const above = placeNote(null, { x: 800, y: 690 }, note, view, avoid);
    expect(hits(above, bar)).toBe(false);
    expect(above.y).toBeLessThan(690);
    const corner = placeNote(null, { x: 1380, y: 690 }, note, view, avoid);
    for (const b of avoid) expect(hits(corner, b)).toBe(false);
    expect(inside(corner)).toBe(true);
  });
  it("takes a tool's own wish when it is clear and moves it when it is not", () => {
    expect(placeNote({ x: 700, y: 500 }, { x: 800, y: 300 }, note, view, avoid)).toEqual({ x: 700, y: 500 });
    const moved = placeNote({ x: 1350, y: 400 }, { x: 1300, y: 300 }, note, view, avoid);
    expect(hits(moved, shelf)).toBe(false);
  });
  it("never leaves the view, whatever the pointer does", () => {
    for (const x of [0, 5, 800, 1595, 1600]) for (const y of [0, 5, 450, 895, 900]) expect(inside(placeNote(null, { x, y }, note, view, []))).toBe(true);
  });
  it("tries the sides farther off before it settles on a covered spot (the corner between the settings, a message and the shelf)", () => {
    // (the bar's settings row below, the shelf on the right, and a message over the map above the settings row)
    const settings: Box = { x0: 204, y0: 702, x1: 1396, y1: 890 };
    const message: Box = { x0: 700, y0: 600, x1: 1390, y1: 698 };
    const at = placeNote(null, { x: 1386, y: 690 }, note, view, [shelf, settings, message, panel]);
    for (const b of [shelf, settings, message, panel]) expect(hits(at, b), `under ${JSON.stringify(b)}`).toBe(false);
    expect(inside(at)).toBe(true);
  });
  it("searches the whole free view when no side near the pointer is clear, taking the clear spot nearest it", () => {
    // (the nearest room is farther than any of the sides tried: 600 px off)
    const wide: Box = { x0: 0, y0: 0, x1: 2400, y1: 1080 };
    const wall: Box = { x0: 0, y0: 0, x1: 1500, y1: 1080 };
    const at = placeNote(null, { x: 900, y: 540 }, note, wide, [wall]);
    expect(at.x).toBeGreaterThanOrEqual(1500);
    expect(at.x).toBeLessThan(1520);
    expect(at.x + note.w <= wide.x1 && at.y >= 0 && at.y + note.h <= wide.y1).toBe(true);
  });
  it("does not jump away and back as the pointer moves down the gap beside the shelf", () => {
    // (1920 × 1080: the bar's settings row and tool row end at x 1716, the shelf starts at 1730; a message stands over the foot)
    const big: Box = { x0: 0, y0: 0, x1: 1920, y1: 1080 };
    const gapShelf: Box = { x0: 1730, y0: 165, x1: 1910, y1: 1070 };
    const bars: Box = { x0: 204, y0: 892, x1: 1716, y1: 1070 };
    const message: Box = { x0: 560, y0: 830, x1: 1380, y1: 880 };
    for (const x of [1723, 1700, 1500]) {
      let last: { x: number; y: number } | null = null;
      let lastPointer = x;
      let jumps = 0;
      let reversals = 0;
      let before: { x: number; y: number } | null = null;
      for (let y = 180; y <= 1060; y += 6) {
        // (the note keeps the side it had, as the page's component does)
        const at = placeNote(null, { x, y }, note, big, [gapShelf, bars, message, panel], last && { dx: last.x - lastPointer, dy: last.y - (y - 6) });
        if (last) {
          const m = { x: at.x - last.x, y: at.y - last.y };
          if (Math.hypot(m.x, m.y) >= 20) {
            if (before && m.x * before.x + m.y * before.y < 0) reversals++;
            before = m;
          }
        }
        // (never far from the pointer, never under a control)
        expect(Math.hypot(at.x + note.w / 2 - x, at.y + note.h / 2 - y), `x ${x} y ${y}`).toBeLessThan(700);
        if (last && Math.hypot(at.x - last.x, at.y - last.y) > 100) jumps++;
        last = at;
      }
      // (a flip from one side of the pointer to the other is one jump; away and back three times is not allowed)
      expect(jumps, `pointer down x ${x}`).toBeLessThanOrEqual(2);
      expect(reversals, `pointer down x ${x}: moves that undo the one before`).toBe(0);
    }
  });
  it("keeps the strip it has when another is hardly nearer, crossing the midpoint between the two", () => {
    // (a wall with a clear strip above it and one below, the pointer in a gap in the middle of it: the strips' midpoint is y 348)
    const wide: Box = { x0: 0, y0: 0, x1: 1000, y1: 700 };
    const wall: Box = { x0: 0, y0: 100, x1: 1000, y1: 600 };
    let last: { x: number; y: number } | null = null;
    let lastPointer = { x: 500, y: 350 };
    const strips = new Set<string>();
    for (const [px, py] of [[500, 350], [500, 340], [500, 352], [500, 338], [500, 356], [500, 346], [500, 351]] as const) {
      const at = placeNote(null, { x: px, y: py }, note, wide, [wall], last && { dx: last.x - lastPointer.x, dy: last.y - lastPointer.y });
      strips.add(at.y < 300 ? "above" : "below");
      last = at;
      lastPointer = { x: px, y: py };
    }
    expect(strips.size, "the strip it started on, every step").toBe(1);
  });
  it("comes back beside the pointer as soon as there is room, whatever far spot it was at", () => {
    // (the foot of a narrow gap: the nearest clear spot is far; then the pointer leaves it for open ground)
    const big: Box = { x0: 0, y0: 0, x1: 1920, y1: 1080 };
    const walls: Box[] = [{ x0: 1730, y0: 165, x1: 1910, y1: 1070 }, { x0: 204, y0: 892, x1: 1556, y1: 1070 }, { x0: 560, y0: 830, x1: 1380, y1: 880 }];
    const foot = { x: 1643, y: 1050 };
    const far = placeNote(null, foot, note, big, walls, null);
    expect(Math.hypot(far.x + note.w / 2 - foot.x, far.y + note.h / 2 - foot.y)).toBeGreaterThan(100);
    const rel = { dx: far.x - foot.x, dy: far.y - foot.y };
    for (const open of [{ x: 1303, y: 600 }, { x: 1143, y: 600 }]) {
      const at = placeNote({ x: open.x + 16, y: open.y + 16 }, open, note, big, walls, rel);
      expect(at, `pointer ${open.x},${open.y}`).toEqual({ x: open.x + 16, y: open.y + 16 });
    }
  });
  it("makes no flip that undoes the one before within 48 px of the pointer's way down the gap in the 1280 scene, whatever the step", () => {
    // (1280 × 720, Block settings 194–1086 × 522–642, the page's message 381–898 × 437–478 over them, the shelf from x 1090; a note 211 × 30)
    const view: Box = { x0: 0, y0: 0, x1: 1280, y1: 720 };
    const scene: Box[] = [
      { x0: 0, y0: 0, x1: 1280, y1: 130 },
      { x0: 1090, y0: 165, x1: 1270, y1: 710 },
      { x0: 194, y0: 522, x1: 1086, y1: 642 },
      { x0: 194, y0: 648, x1: 1086, y1: 710 },
      { x0: 381, y0: 437, x1: 898, y1: 478 },
    ];
    const small = { w: 211, h: 30 };
    for (const step of [1, 2, 3, 4, 6]) {
      for (let phase = 0; phase < step; phase++) {
        let last: { x: number; y: number } | null = null;
        let lastPointer = { x: 1086, y: 0 };
        let before: { x: number; y: number; at: number } | null = null;
        let undone = 0;
        for (let y = 330 + phase; y <= 560; y += step) {
          const pointer = { x: 1086, y };
          const at = placeNote({ x: pointer.x + 16, y: pointer.y + 16 }, pointer, small, view, scene, last && { dx: last.x - lastPointer.x, dy: last.y - lastPointer.y });
          if (last) {
            const m = { x: at.x - last.x, y: at.y - last.y };
            if (Math.hypot(m.x, m.y) >= 40) {
              // (a control in the pointer's way makes one flip over it and one back past it; two strips of nearly the same
              // distance made it flip down, up and down within a few pixels of the pointer's way)
              if (before && y - before.at <= 48 && m.x * before.x + m.y * before.y < 0) undone++;
              before = { ...m, at: y };
            }
          }
          last = at;
          lastPointer = pointer;
        }
        expect(undone, `step ${step}, phase ${phase}: flips that undo the one before`).toBe(0);
      }
    }
  });
  it("covers a control as little as it can when every side is covered", () => {
    const wall: Box = { x0: 0, y0: 0, x1: 1600, y1: 900 };
    const at = placeNote(null, { x: 800, y: 450 }, note, view, [wall]);
    expect(inside(at)).toBe(true);
  });
});
