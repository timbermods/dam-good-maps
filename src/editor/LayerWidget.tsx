// The visible layers (PLAN §20 D207; Kyler, 2026-10-03): one control, ▾ [value] ▴, at one fixed width so nothing
// in the right column ever moves. The value runs up to 22 (the game's highest terrain), then ∞, on every map: the
// first step down from ∞ goes straight to the map's highest level, and stepping up runs through every level to 22,
// then ∞. A click on the value shows the whole world again; held and dragged up or down, it steps with the pointer.
// Alt+scroll and Alt+middle-click do the game's own stepping on the map.

import { useRef } from "preact/hooks";
import { tip } from "../ui/Tooltip";

/** The game's highest terrain: the control's last level before ∞. */
export const TOP_LEVEL = 22;

export interface LayerWidgetProps {
  /** The layer the world is cut at, or null (the whole world). */
  level: number | null;
  /** The map's highest level (its highest ground). */
  highest(): number;
  /** Cut the world at a level, or null for the whole world. */
  onSet(level: number | null): void;
}

/** Pixels of drag for a layer, as the game's level button takes the mouse. */
const DRAG_PX = 14;

/** The next value of the control, one step up or down. */
export function stepLevel(level: number | null, dir: 1 | -1, highest: number): number | null {
  if (level === null) return dir < 0 ? Math.min(TOP_LEVEL, highest) : null;
  if (dir < 0) return Math.max(0, level - 1);
  return level + 1 > TOP_LEVEL ? null : level + 1;
}

export function LayerWidget(p: LayerWidgetProps) {
  const drag = useRef<{ y: number; acc: number; stepped: boolean } | null>(null);
  const at = p.level === null;
  // (a drag steps from where it is, the steps' values read as they go)
  const now = useRef(p.level);
  now.current = p.level;
  const step = (dir: 1 | -1) => {
    const next = stepLevel(now.current, dir, p.highest());
    now.current = next;
    p.onSet(next);
  };
  return (
    <span class={`layer-widget${at ? " quiet" : ""}`} role="group" aria-label="Visible layers">
      <button type="button" aria-label="Lower the visible layer" {...tip("Cut the world a layer lower", "Alt+scroll down")} onClick={() => step(-1)} disabled={p.level === 0}>
        ▾
      </button>
      <output
        aria-label="Visible layer"
        title="Show the whole world"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, acc: 0, stepped: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          d.acc += d.y - e.clientY;
          d.y = e.clientY;
          while (Math.abs(d.acc) >= DRAG_PX) {
            const dir = d.acc > 0 ? 1 : -1;
            d.acc -= dir * DRAG_PX;
            d.stepped = true;
            step(dir);
          }
        }}
        onPointerUp={() => {
          // a click, not a drag: the whole world again
          if (drag.current && !drag.current.stepped) p.onSet(null);
          drag.current = null;
        }}
        onPointerCancel={() => void (drag.current = null)}
      >
        {at ? "∞" : p.level}
      </output>
      <button type="button" aria-label="Raise the visible layer" {...tip("Show a layer more", "Alt+scroll up")} onClick={() => step(1)} disabled={at}>
        ▴
      </button>
    </span>
  );
}
