// The words that follow the pointer over the map (a force's refusal, a shelf object's "Place here", Select's count, the
// Block tool's reason): every one sits in the free view, the part of the map between the panels, the Items shelf and the
// bars, and flips to the pointer's other side when its first spot would run under one of them. One component and one
// function place them all, so a tool never has to know where the controls are.

import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** A rectangle in the map view's pixels. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What is not the free view: the controls laid over the map, found by their classes. */
export const OBSTRUCTIONS = [
  ".gen",
  ".map-bar",
  ".view3d-controls",
  ".view3d-corner",
  ".view3d-legend",
  ".legend-stack > *",
  ".minimap",
  ".objects-dock",
  ".dock-notes > *",
  ".bottom-left-stack > *",
];

/** The distance a note keeps from the pointer, and the least it keeps from a control. */
const FROM_POINTER = 16;
const FROM_CONTROL = 4;
const FROM_EDGE = 4;
/** The step of the search over the whole free view, when no corner or side is clear. */
const SCAN = 8;
/** How much farther from the pointer than the nearest clear spot a spot may be and still be taken, to keep the note's place. */
const NEAR = 24;

const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Where a note of `note`'s size goes: its first wish when that is clear of every control and inside `bounds`, else the
 *  pointer's other corners in turn (below left, above right, above left), else beside it above or below, so a note
 *  follows the pointer as closely as there is room. With none of the eight clear, the clear spots of the whole free
 *  view (FROM_POINTER clear of the pointer) within NEAR px of the nearest to the pointer, and of those the one
 *  nearest the spot the note has (`previous`, its offset from the pointer, so two strips at nearly the same distance
 *  do not trade the note back and forth as the pointer moves), else the spot covered least, pushed back inside
 *  `bounds`. Returns the note's top left. */
export function placeNote(
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
  for (const p of wishes) {
    const cost = costAt(p);
    if (cost === 0) return p;
    if (cost < least) [best, least] = [p, cost];
  }
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

/** The free view of a map view, in the pixels of `parent` (the box its notes are placed in): its own box, and the boxes of
 *  the controls over it that are showing. */
export function freeView(parent: HTMLElement): { bounds: Box; avoid: Box[] } {
  const at = parent.getBoundingClientRect();
  const root = parent.closest(".editor") ?? document;
  const avoid: Box[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(OBSTRUCTIONS.join(","))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) avoid.push({ x0: r.left - at.left, y0: r.top - at.top, x1: r.right - at.left, y1: r.bottom - at.top });
  }
  return { bounds: { x0: 0, y0: 0, x1: at.width, y1: at.height }, avoid };
}

/** A note beside the pointer. `x`, `y` are its first wish (its top left, in the view's pixels), `pointer` the pointer's place:
 *  the note is moved into the free view before it is drawn, never seen where it would be cut off. `own`: the first wish
 *  is the tool's own choice (clear of what it describes), so the note does not remember the place it had. */
export function PointerNote(p: { class: string; x: number; y: number; pointer: { x: number; y: number }; own?: boolean; children: ComponentChildren }) {
  const el = useRef<HTMLDivElement>(null);
  // (where it stands from the pointer now, so that it keeps its side while that is clear)
  const had = useRef<{ dx: number; dy: number } | null>(null);
  useLayoutEffect(() => {
    const n = el.current;
    const parent = n?.offsetParent;
    if (!n || !(parent instanceof HTMLElement)) return;
    // (measured at the corner, where nothing narrows it: a note beside the right edge would wrap otherwise)
    n.style.left = "0px";
    n.style.top = "0px";
    const { bounds, avoid } = freeView(parent);
    const at = placeNote({ x: p.x, y: p.y }, p.pointer, { w: n.offsetWidth, h: n.offsetHeight }, bounds, avoid, p.own ? null : had.current);
    had.current = p.own ? null : { dx: at.x - p.pointer.x, dy: at.y - p.pointer.y };
    n.style.left = `${at.x}px`;
    n.style.top = `${at.y}px`;
  });
  return (
    <div ref={el} class={p.class} role="status" style={{ left: `${p.x}px`, top: `${p.y}px` }}>
      {p.children}
    </div>
  );
}
