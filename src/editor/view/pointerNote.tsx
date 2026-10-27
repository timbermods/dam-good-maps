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
  for (const p of wishes) {
    const cost = costAt(p);
    if (cost === 0) return p;
    if (cost < least) [best, least] = [p, cost];
  }
  // (no wish is clear: the clear spots of the free view, so a note near the foot of a narrow gap goes wherever there is
  // room, however far. The spots are a grid of SCAN px, a spot clear when it is the same box as a whole one inside the
  // view, off the pointer and over no control: found without trying every spot, nearest the pointer first)
  const xs: number[] = [];
  for (let x = inner.x0; x + w <= inner.x1; x += SCAN) xs.push(x);
  const ys: number[] = [];
  for (let y = inner.y0; y + h <= inner.y1; y += SCAN) ys.push(y);
  if (xs.length && ys.length) {
    const wh = w * h;
    const across = xs.map((x) => x + w - x);
    const down = ys.map((y) => y + h - y);
    // (per row, the controls in its way as [left, right, ...]: made when the row is first looked at)
    const rows: (number[] | undefined)[] = new Array(ys.length);
    const inWay = (j: number) => {
      let list = rows[j];
      if (!list) {
        list = [];
        const y = ys[j];
        for (const b of inflated) if (y < b.y1 && y + h > b.y0) list.push(b.x0, b.x1);
        rows[j] = list;
      }
      return list;
    };
    const clearAt = (k: number, j: number) => {
      const x = xs[k];
      const y = ys[j];
      if (x < pointer.x + FROM_POINTER && x + w > pointer.x - FROM_POINTER && y < pointer.y + FROM_POINTER && y + h > pointer.y - FROM_POINTER) return false;
      if (wh !== across[k] * down[j]) return false;
      const list = inWay(j);
      for (let i = 0; i < list.length; i += 2) if (x < list[i + 1] && x + w > list[i]) return false;
      return true;
    };
    const dyOf = (j: number) => ys[j] + h / 2 - pointer.y;
    // the grid column whose spot is centred nearest the pointer's x
    const centre = Math.min(xs.length - 1, Math.max(0, Math.round((pointer.x - w / 2 - xs[0]) / SCAN)));
    // 1. the nearest clear spot: rows from the pointer's own outward, each searched outward from the centre column, and
    // all of it stopped as soon as nothing farther out can be nearer
    let nearest = Infinity;
    // (the rows centred at or above the pointer's y are searched upward from the last of them, the rest downward, so each
    // side's rows only ever get farther)
    let up = Math.min(ys.length - 1, Math.max(0, Math.round((pointer.y - h / 2 - ys[0]) / SCAN)));
    while (up >= 0 && dyOf(up) > 0) up--;
    while (up + 1 < ys.length && dyOf(up + 1) <= 0) up++;
    let downward = up + 1;
    while (up >= 0 || downward < ys.length) {
      const goUp = up >= 0 && (downward >= ys.length || Math.abs(dyOf(up)) <= Math.abs(dyOf(downward)));
      const j = goUp ? up-- : downward++;
      const dy = dyOf(j);
      if (Math.abs(dy) > nearest) {
        // (this row and every one beyond it on its side are farther; the other side may still hold a nearer one)
        if (goUp) up = -1;
        else downward = ys.length;
        continue;
      }
      for (let m = 0; ; m++) {
        const left = centre - m;
        const right = centre + m;
        let reach = false;
        for (const k of m === 0 ? [left] : [left, right]) {
          if (k < 0 || k >= xs.length) continue;
          const dx = xs[k] + w / 2 - pointer.x;
          if (Math.abs(dx) <= nearest) reach = true;
          if (Math.abs(dx) > nearest || !clearAt(k, j)) continue;
          const d = Math.hypot(dx, dy);
          if (d < nearest) nearest = d;
        }
        if ((left < 0 && right >= xs.length) || (!reach && nearest < Infinity)) break;
      }
    }
    if (nearest < Infinity) {
      // 2. of the clear spots within NEAR of the nearest, the one nearest the kept place (else the pointer), the first in
      // reading order among equals
      const kept = previous ? { x: pointer.x + previous.dx, y: pointer.y + previous.dy } : null;
      const reach = nearest + NEAR;
      const from = Math.max(0, Math.floor((pointer.x - w / 2 - reach - xs[0]) / SCAN) - 1);
      const to = Math.min(xs.length - 1, Math.ceil((pointer.x - w / 2 + reach - xs[0]) / SCAN) + 1);
      let pick: { x: number; y: number } | null = null;
      let apart = Infinity;
      for (let j = 0; j < ys.length; j++) {
        const dy = dyOf(j);
        if (Math.abs(dy) > reach) continue;
        for (let k = from; k <= to; k++) {
          if (!clearAt(k, j)) continue;
          const d = Math.hypot(xs[k] + w / 2 - pointer.x, dy);
          if (d > reach) continue;
          const a = kept ? Math.hypot(xs[k] - kept.x, ys[j] - kept.y) : d;
          if (a < apart) [pick, apart] = [{ x: xs[k], y: ys[j] }, a];
        }
      }
      if (pick) return pick;
    }
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
