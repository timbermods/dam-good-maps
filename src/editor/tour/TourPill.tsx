// The tour's one small caption (D377) and the shield that keeps the player's own input out while it plays. Shared by the
// page (the moment the tour is asked for, while its copy of the map opens) and the layer over the tour's editor.

import { useEffect } from "preact/hooks";
import { tip } from "../../ui/Tooltip";

/** What the caption says now: the keys held or pressed, and a few words. */
export interface Says {
  keys: string[];
  words: string;
  /** The wheel is part of this one: a small wheel ticks with each notch. */
  wheel?: boolean;
}

/** Where the caption sits: lined up with the water row above it (its left, its width), a gap of 8px under it, and as
 *  high as the controls in the right column (36px); null when the page has no such row (it is centred then). */
export function pillBox(): { left: number; top: number; width: number } | null {
  const row = document.querySelector<HTMLElement>(".editor-view .water-bar");
  if (!row) return null;
  const r = row.getBoundingClientRect();
  if (!r.width) return null;
  return { left: r.left, top: r.bottom + 8, width: r.width };
}

/** The player's own keys and pointer stay out while the tour plays or opens (it is watched, not driven), but for Esc.
 *  The browser marks the events a script makes as untrusted: those, the tour's own, pass. */
const SHIELDED = ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "mousemove", "click", "dblclick", "auxclick", "contextmenu", "wheel", "dragstart", "dragenter", "dragover", "drop", "touchstart", "touchmove", "touchend"];

export function useShield(onEsc: () => void): void {
  useEffect(() => {
    const stop = (ev: Event) => {
      if (!ev.isTrusted) return;
      // (the caption's own Stop is for a player with only a mouse)
      if ((ev.target as Element | null)?.closest?.(".tour-stop")) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      if (ev.type === "keydown" && (ev as KeyboardEvent).key === "Escape") onEsc();
    };
    for (const t of SHIELDED) window.addEventListener(t, stop, { capture: true, passive: false });
    return () => {
      for (const t of SHIELDED) window.removeEventListener(t, stop, { capture: true });
    };
  }, []);
}

/** A small mouse with a wheel that ticks (restarted by `tick`). */
function Wheel(p: { tick: number }) {
  return (
    <svg class="tour-wheel" width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
      <rect x="1" y="1" width="12" height="18" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
      <rect key={p.tick} class="tour-wheel-tick" x="6" y="4" width="2" height="5" rx="1" fill="currentColor" />
    </svg>
  );
}

export function TourPill(p: { says: Says | null; down: ReadonlySet<string>; wheelTick: number; onStop(): void; box: { left: number; top: number; width: number } | null }) {
  const style = p.box ? { left: `${p.box.left}px`, top: `${p.box.top}px`, width: `${p.box.width}px` } : { left: "50%", top: "120px", width: "250px", transform: "translateX(-50%)" };
  return (
    <div class="tour-pill" role="status" aria-live="polite" style={style}>
      <span class="tour-says">
        {p.says?.keys.map((k, i) => (
          <span key={k + i} class="tour-key">
            {i ? <span class="tour-plus">+</span> : null}
            <kbd class={`cap${p.down.has(k) ? " down" : ""}`}>{k}</kbd>
          </span>
        ))}
        {p.says?.wheel ? <Wheel tick={p.wheelTick} /> : null}
        <span class="tour-words">{p.says?.words ?? "The 20-second tour"}</span>
      </span>
      <button type="button" class="tour-stop" {...tip("Stop the tour", "Esc")} onClick={p.onStop}>
        Stop
      </button>
    </div>
  );
}

/** The tour has been asked for and its copy of the map is opening: the caption is up at once, the player's own input is
 *  held back, and Stop (or Esc) takes the tour back before it begins. */
export function TourOpening(p: { onStop(): void }) {
  useShield(p.onStop);
  return (
    <div class="tour">
      <div class="tour-shield" aria-hidden="true" />
      <TourPill says={null} down={new Set()} wheelTick={0} box={pillBox()} onStop={p.onStop} />
    </div>
  );
}
