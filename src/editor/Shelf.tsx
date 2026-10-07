// The left shelf (PLAN §20 D184, D212): a clean grid of the game's placeable objects (the start, the
// water and badwater sources, the trees and the rest), each a small render of itself in the map's
// look, and nothing else. Built from the shared bar and button styles (D176).
//
// A click picks an object (its ghost follows the pointer over the map); a press that moves on
// drags it out (D323, item 11): the ghost follows the pointer, and letting go over the map places it
// there. The drag is the page's own pointer drag, never the browser's (which carries a file with an
// image and offered to open it).

import { useRef } from "preact/hooks";
import { SHELF, shelfTip, type ShelfItem } from "./shelfItems";
import { tip } from "../ui/Tooltip";

/** How far a press must move before it is a drag and not a click, in pixels. */
const DRAG_PX = 6;

export interface ShelfProps {
  /** The item picked, or null. */
  picked: string | null;
  onPick(item: ShelfItem | null): void;
  /** An item is dragged out of the shelf: it is picked and its ghost follows the pointer. */
  onDragStart(item: ShelfItem): void;
  /** The drag let go (`cancelled`: the browser lost the pointer): place it where the pointer is over
   *  the map, or end placement. */
  onDrop(item: ShelfItem, cancelled: boolean): void;
  /** Each object's picture, once the view can draw it. */
  icon(template: string): string | null;
  /** The map is still loading. */
  loading?: boolean;
}

export function Shelf(p: ShelfProps) {
  /** The press in progress. */
  const press = useRef<{ x: number; y: number; id: number; dragging: boolean } | null>(null);
  /** A click that follows a drag's release on the same button is not a pick. */
  const swallow = useRef(false);
  const latest = useRef(p);
  latest.current = p;

  function down(e: PointerEvent, it: ShelfItem) {
    swallow.current = false;
    if (e.button !== 0 || latest.current.loading) return;
    const s = { x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
    press.current = s;
    const move = (m: PointerEvent) => {
      if (press.current !== s || m.pointerId !== s.id) return;
      if (!s.dragging && Math.hypot(m.clientX - s.x, m.clientY - s.y) >= DRAG_PX) {
        s.dragging = true;
        latest.current.onDragStart(it);
      }
    };
    const end = (u: PointerEvent) => {
      if (u.pointerId !== s.id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", lost);
      if (press.current === s) press.current = null;
      if (s.dragging) {
        swallow.current = true;
        latest.current.onDrop(it, u.type === "pointercancel");
      }
    };
    // the window loses focus mid-drag (a screenshot tool): the release never comes, so it ends as a cancel (D361, item 5)
    const lost = () => end({ type: "pointercancel", pointerId: s.id } as PointerEvent);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", lost);
  }

  return (
    <nav class="shelf objects-menu" aria-label="Place">
      {/* its title (Kyler, 2026-10-06): one row of the items' height, the names' inset */}
      <h2 class="shelf-title">Items</h2>
      <div class="shelf-grid" role="toolbar" aria-label="Objects">
        {SHELF.map((it) => {
          const src = p.icon(it.template);
          return (
            <button
              type="button"
              key={it.id}
              class="shelf-item"
              aria-pressed={p.picked === it.id}
              aria-label={it.name}
              {...(p.loading ? tip("The map is still loading") : shelfTip(it))}
              disabled={p.loading}
              onPointerDown={(e) => down(e, it)}
              onDragStart={(e) => e.preventDefault()}
              onClick={() => {
                if (swallow.current) {
                  swallow.current = false;
                  return;
                }
                p.onPick(p.picked === it.id ? null : it);
              }}
            >
              {src ? <img src={src} alt="" width={28} height={28} draggable={false} /> : <span class="shelf-blank" aria-hidden="true" />}
              <span class="shelf-word">{it.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
