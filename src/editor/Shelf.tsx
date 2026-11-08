// The left shelf (PLAN §20 D184, D212): a clean grid of the game's placeable objects (the start, the
// water and badwater sources, the trees and the rest), each a small render of itself in the map's
// look, and nothing else. Built from the shared bar and button styles (D176).
//
// A click picks an object (its ghost follows the pointer over the map); a press that moves on
// drags it out (D323, item 11): the ghost follows the pointer, and letting go over the map places it
// there. The drag is the page's own pointer drag, never the browser's (which carries a file with an
// image and offered to open it).

import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { SHELF, shelfTip, type ShelfItem } from "./shelfItems";
import { tip } from "../ui/Tooltip";

/** The first row of each group after the first: the water objects, the plants, the landmarks, the core and the reserves. */
const GROUP_FIRST = new Set(["WaterSeep", "Pine", "ruin", "UnstableCore"]);

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
  const grid = useRef<HTMLDivElement>(null);
  // the picked object's window opens above the list and shortens it: the list scrolls by what it shrank, so the row picked
  // stays under the pointer (the list never moves, EDITOR_PLAN), or, where the window took its place, just under the list's
  // title; a row picked from the keyboard is only kept in view
  const rowTop = useRef<{ id: string; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!p.picked) return;
    const settle = () => {
      const row = grid.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
      const menu = grid.current?.closest<HTMLElement>(".objects-menu");
      if (!row || !menu) return;
      const was = rowTop.current?.id === p.picked ? rowTop.current.top : null;
      if (was === null) row.scrollIntoView({ block: "nearest" });
      else {
        const delta = row.getBoundingClientRect().top - was;
        if (Math.abs(delta) > 0.5) menu.scrollTop += delta;
      }
      // a row the window's opening left no room for where it was (Start, at the list's top) is brought into view, under
      // the list's title, which stays at its top as the rows scroll under it
      const r = row.getBoundingClientRect();
      const top = menu.querySelector(".shelf-title")?.getBoundingClientRect().bottom ?? menu.getBoundingClientRect().top;
      const bottom = menu.getBoundingClientRect().bottom;
      if (r.top < top - 0.5) menu.scrollTop -= top - r.top;
      else if (r.bottom > bottom + 0.5) menu.scrollTop += r.bottom - bottom;
    };
    settle();
    // (the window's own height may settle a frame later)
    const id = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(id);
  }, [p.picked]);

  // the object put away, its window gone: put away by a click on its row, the list goes back to where it was before the window
  // opened (the row stays under the pointer); put away any other way (Esc), to its top, with Start and the sources in sight
  // (while the window was up the list was scrolled to keep the picked row under the pointer)
  const had = useRef(false);
  const home = useRef(0);
  const clicked = useRef(false);
  useEffect(() => {
    // (a key, Esc above all, puts the object away without the pointer)
    const key = () => (clicked.current = false);
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  useLayoutEffect(() => {
    const menu = grid.current?.closest<HTMLElement>(".objects-menu");
    if (menu && had.current && !p.picked) menu.scrollTop = clicked.current ? home.current : 0;
    if (!p.picked) clicked.current = false;
    had.current = !!p.picked;
  }, [p.picked]);

  function down(e: PointerEvent, it: ShelfItem) {
    swallow.current = false;
    rowTop.current = { id: it.id, top: (e.currentTarget as HTMLElement).getBoundingClientRect().top };
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
    <nav
      class="shelf objects-menu"
      aria-label="Place"
      onScroll={(e) => {
        // (the player's own scroll, while no window is open)
        if (!latest.current.picked) home.current = (e.currentTarget as HTMLElement).scrollTop;
      }}
      onPointerDown={() => (clicked.current = true)}
    >
      {/* its title (Kyler, 2026-10-06): one row of the items' height, the names' inset */}
      <h2 class="shelf-title">Items</h2>
      <div class="shelf-grid" role="toolbar" aria-label="Objects" ref={grid}>
        {SHELF.map((it) => {
          const src = p.icon(it.picture ? it.id : it.template);
          return (
            <button
              type="button"
              key={it.id}
              class={`shelf-item${GROUP_FIRST.has(it.id) ? " shelf-first" : ""}`}
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
