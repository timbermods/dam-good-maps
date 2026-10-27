// The note's placement as it was before the scan was made fast (D453): every spot of the grid tried one by one. Kept here so the
// fast one is held to the same answer over any scene (tests/unit/pointerNote.test.ts). Not used by the page.

import type { Box } from "../../src/editor/view/pointerNote";

/** The distance a note keeps from the pointer, and the least it keeps from a control. */
const FROM_POINTER = 16;
const FROM_CONTROL = 4;
const FROM_EDGE = 4;
/** The step of the search over the whole free view, when no corner or side is clear. */
const SCAN = 8;
/** How much farther from the pointer than the nearest clear spot a spot may be and still be taken, to keep the note's place. */
const NEAR = 24;

const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Where a note of `note`'s size goes: its first wish when that is clear of every control and inside `bounds`, else of
 *  the pointer's other corners and sides (below left, above right, above left, then beside it and above or below) that
 *  are clear the one nearest the spot the note has (`previous`), the first in that order when it has none, so a note
 *  follows the pointer as closely as there is room. With none of the eight clear, the clear spots of the whole free
 *  view (FROM_POINTER clear of the pointer) within NEAR px of the nearest to the pointer, and of those the one
 *  nearest the spot the note has (`previous`, its offset from the pointer, so two strips at nearly the same distance
 *  do not trade the note back and forth as the pointer moves), else the spot covered least, pushed back inside
 *  `bounds`. Returns the note's top left. */
export function placeNoteReference(
  want: { x: number; y: number } | null,
  pointer: { x: number; y: number },
  note: { w: number; h: number },
  bounds: Box,
  avoid: readonly Box[],
  previous: { dx: number; dy: number } | null = null,
): { x: number; y: number } {
  const { w, h } = note;
  const wishes = [
    ...(want ? [want] : []),
    { x: pointer.x + FROM_POINTER, y: pointer.y + FROM_POINTER },
    { x: pointer.x - FROM_POINTER - w, y: pointer.y + FROM_POINTER },
    { x: pointer.x + FROM_POINTER, y: pointer.y - FROM_POINTER - h },
    { x: pointer.x - FROM_POINTER - w, y: pointer.y - FROM_POINTER - h },
    // (no corner is clear: centred on the pointer's sides)
    { x: pointer.x + FROM_POINTER, y: pointer.y - h / 2 },
    { x: pointer.x - FROM_POINTER - w, y: pointer.y - h / 2 },
    { x: pointer.x - w / 2, y: pointer.y + FROM_POINTER },
    { x: pointer.x - w / 2, y: pointer.y - FROM_POINTER - h },
  ];
  const inflated = avoid.map((b) => ({ x0: b.x0 - FROM_CONTROL, y0: b.y0 - FROM_CONTROL, x1: b.x1 + FROM_CONTROL, y1: b.y1 + FROM_CONTROL }));
  const inner = { x0: bounds.x0 + FROM_EDGE, y0: bounds.y0 + FROM_EDGE, x1: bounds.x1 - FROM_EDGE, y1: bounds.y1 - FROM_EDGE };
  let best = wishes[0];
  let least = Infinity;
  // (the part outside the free view counts as covered, as the part under a control does)
  const costAt = (p: { x: number; y: number }) => {
    const at = { x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + h };
    return w * h - area(at, inner) + inflated.reduce((sum, b) => sum + area(at, b), 0);
  };
  const touchesPointer = (p: { x: number; y: number }) => p.x < pointer.x + FROM_POINTER && p.x + w > pointer.x - FROM_POINTER && p.y < pointer.y + FROM_POINTER && p.y + h > pointer.y - FROM_POINTER;
  const distance = (p: { x: number; y: number }) => Math.hypot(p.x + w / 2 - pointer.x, p.y + h / 2 - pointer.y);
  // (the first wish when it is clear; else, of the other clear wishes, the one nearest the kept place, the first in order when
  // there is none, so a note whose first spot has just been lost does not drop to a spot the pointer's next step undoes)
  const held = previous ? { x: pointer.x + previous.dx, y: pointer.y + previous.dy } : null;
  let clearWish: { x: number; y: number } | null = null;
  let apartWish = Infinity;
  for (const [i, p] of wishes.entries()) {
    const cost = costAt(p);
    if (cost === 0) {
      if (i === 0) return p;
      const a = held ? Math.hypot(p.x - held.x, p.y - held.y) : 0;
      if (a < apartWish) [clearWish, apartWish] = [p, a];
    } else if (cost < least) [best, least] = [p, cost];
  }
  if (clearWish) return clearWish;
  // (no wish is clear: every clear spot of the free view, so a note near the foot of a narrow gap goes wherever there
  // is room, however far)
  const clear: { p: { x: number; y: number }; d: number }[] = [];
  let nearest = Infinity;
  for (let y = inner.y0; y + h <= inner.y1; y += SCAN) {
    for (let x = inner.x0; x + w <= inner.x1; x += SCAN) {
      const p = { x, y };
      if (touchesPointer(p) || costAt(p) !== 0) continue;
      const d = distance(p);
      clear.push({ p, d });
      if (d < nearest) nearest = d;
    }
  }
  if (clear.length) {
    const kept = previous ? { x: pointer.x + previous.dx, y: pointer.y + previous.dy } : null;
    let pick = clear[0];
    let apart = Infinity;
    for (const c of clear) {
      if (c.d > nearest + NEAR) continue;
      const a = kept ? Math.hypot(c.p.x - kept.x, c.p.y - kept.y) : c.d;
      if (a < apart) [pick, apart] = [c, a];
    }
    return pick.p;
  }
  return { x: Math.max(inner.x0, Math.min(inner.x1 - w, best.x)), y: Math.max(inner.y0, Math.min(inner.y1 - h, best.y)) };
}
