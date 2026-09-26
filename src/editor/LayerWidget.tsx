// The visible layers (PLAN §20 D207), as the game shows them (`LevelVisibilitySystemUI`): the layer
// showing, ∞ when the whole world shows, with a step up and a step down; held and dragged up or
// down, the number steps with the pointer; the ∞ button shows the whole world again. It sits with
// the view buttons, quiet at ∞ until used. Alt+scroll and Alt+middle-click do the same on the map.

import { useRef } from "preact/hooks";

export interface LayerWidgetProps {
  /** The layer the world is cut at, or null (the whole world). */
  level: number | null;
  onStep(dir: 1 | -1): void;
  onReset(): void;
}

/** Pixels of drag for a layer, as the game's level button takes the mouse. */
const DRAG_PX = 14;

export function LayerWidget(p: LayerWidgetProps) {
  const drag = useRef<{ y: number; acc: number } | null>(null);
  const at = p.level === null;
  return (
    <span class={`layer-widget${at ? " quiet" : ""}`} role="group" aria-label="Visible layers">
      <button type="button" aria-label="Lower the visible layer" title="Cut the world a layer lower (Alt+scroll down)" onClick={() => p.onStep(-1)} disabled={p.level === 0}>
        ▾
      </button>
      <output
        aria-label="Visible layer"
        title="The layer showing: drag up or down to change it"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, acc: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          d.acc += d.y - e.clientY;
          d.y = e.clientY;
          while (Math.abs(d.acc) >= DRAG_PX) {
            const dir = d.acc > 0 ? 1 : -1;
            d.acc -= dir * DRAG_PX;
            p.onStep(dir);
          }
        }}
        onPointerUp={() => void (drag.current = null)}
        onPointerCancel={() => void (drag.current = null)}
      >
        {at ? "∞" : p.level}
      </output>
      <button type="button" aria-label="Raise the visible layer" title="Show a layer more (Alt+scroll up)" onClick={() => p.onStep(1)} disabled={at}>
        ▴
      </button>
      {at ? null : (
        <button type="button" aria-label="Show every layer" title="Show the whole world" onClick={p.onReset}>
          ∞
        </button>
      )}
    </span>
  );
}
