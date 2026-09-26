// The left shelf (PLAN §20 D184, D212): a clean grid of the game's placeable objects (the start, the
// water and badwater sources, the trees and the rest), each a small render of itself in the map's
// look, and nothing else. Built from the shared bar and button styles (D176).

import { SHELF, type ShelfItem } from "./shelfItems";

export interface ShelfProps {
  /** The item picked, or null. */
  picked: string | null;
  onPick(item: ShelfItem | null): void;
  /** Each object's picture, once the view can draw it. */
  icon(template: string): string | null;
  /** The map is still loading. */
  loading?: boolean;
}

export function Shelf(p: ShelfProps) {
  return (
    <nav class="shelf" aria-label="Place">
      <div class="shelf-grid" role="toolbar" aria-label="Objects">
        {SHELF.map((it) => {
          const src = p.icon(it.template);
          return (
            <button
              type="button"
              key={it.id}
              class="shelf-item"
              aria-pressed={p.picked === it.id}
              aria-label={it.key ? `${it.name} (${it.key})` : it.name}
              title={p.loading ? "The map is still loading" : `${it.name}${it.key ? ` (${it.key})` : ""}: ${it.hint}${it.turns ? " (R turns it)" : ""}. Esc puts it back.`}
              disabled={p.loading}
              onClick={() => p.onPick(p.picked === it.id ? null : it)}
            >
              {src ? <img src={src} alt="" width={48} height={48} /> : <span class="shelf-blank" aria-hidden="true" />}
              <span class="shelf-word">{it.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
