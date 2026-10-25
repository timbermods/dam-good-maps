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
  it("covers a control as little as it can when every side is covered", () => {
    const wall: Box = { x0: 0, y0: 0, x1: 1600, y1: 900 };
    const at = placeNote(null, { x: 800, y: 450 }, note, view, [wall]);
    expect(inside(at)).toBe(true);
  });
});
