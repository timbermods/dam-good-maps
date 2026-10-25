// Compare (showcase: fearless iteration): another version from Your maps, the same size as the open map, flips with it
// at the same camera. Hold the key (or the note's button) and the land, the objects and the water of the other map
// stand where the open map's are; let go and the open map is back. The other map is read once, settled (the page
// opens it in a worker of its own); nothing here changes either map.

import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { tip } from "../../ui/Tooltip";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";

/** The key that holds the other version on show. */
export const COMPARE_KEY = "B";

export interface CompareSlice {
  /** The other version is on show now. */
  compareFlipped: boolean;
  /** The quiet note in the notes dock while comparing: the flip button and Stop. */
  compareNote: () => ComponentChildren;
  /** While flipped: names the version on show and keeps the pointer from editing it. */
  compareVeil: () => ComponentChildren;
}

export function useCompare(ed: Ed, props: EditorProps): CompareSlice {
  const { renderer, mirror, comparing, infoRef, flipEnd } = ed;
  const compare = props.compare ?? null;
  const [flipped, setFlipped] = useState(false);
  const show = useRef<(on: boolean) => void>(() => undefined);

  useEffect(() => {
    if (!compare) {
      show.current = () => undefined;
      flipEnd.current = null;
      return;
    }
    flipEnd.current = () => show.current(false);
    show.current = (on) => {
      if (comparing.current === on) return;
      const r = renderer.current;
      const info = infoRef.current;
      if (!r || (on && (compare.view.W !== info.W || compare.view.H !== info.H))) return;
      comparing.current = on;
      setFlipped(on);
      // (the open map is put back from the page's copy of it, which kept every change that came while it was away)
      const m = mirror.current;
      // (a held weather day's soil is what the open map shows then)
      const v = on ? { heights: compare.view.heights, water: compare.view.water, entities: compare.view.entities, soil: compare.view.soil } : { heights: m.heights, water: m.waterView, entities: m.entities, soil: m.daySoil ?? m.soil };
      r.updateTerrain(v.heights);
      // (the water with its land in the same frame: a flip compares the two at a glance)
      r.updateWater(v.water, true);
      r.updateEntities(v.entities);
      if (v.soil) r.updateSoil(v.soil);
      if (!on) {
        // (what came while the other version was on show is in the page's copy: its surface, and its objects' glow)
        m.water = r.mapState()?.surface ?? m.water;
        ed.reglow();
        ed.sourcesChanged();
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code !== "KeyB" || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey || ev.repeat) return;
      if (document.querySelector<HTMLElement>(".editor")?.inert) return;
      // (a stroke being painted or a force at work draws the open map: the other version waits)
      if (ed.painter.current?.painting || ed.forcer.current?.running) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      ev.preventDefault();
      show.current(true);
    };
    const onUp = (ev: KeyboardEvent) => {
      if (ev.code === "KeyB") show.current(false);
    };
    const off = () => show.current(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", off);
    document.addEventListener("visibilitychange", off);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", off);
      document.removeEventListener("visibilitychange", off);
      show.current(false);
      flipEnd.current = null;
    };
  }, [compare]);

  const compareNote = () =>
    compare ? (
      <div class="editor-message info compare-note" role="status">
        <button
          type="button"
          class="linkish compare-flip"
          {...tip("Hold to see the other version", COMPARE_KEY)}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            show.current(true);
          }}
          onPointerUp={() => show.current(false)}
          onPointerCancel={() => show.current(false)}
        >
          Comparing with {compare.name}
        </button>
        <button type="button" class="linkish" {...tip("Stop comparing")} onClick={props.onStopCompare}>
          Stop
        </button>
      </div>
    ) : null;

  const compareVeil = () =>
    compare && flipped ? (
      <div class="compare-veil" role="status">
        <span class="compare-name">{compare.name}</span>
      </div>
    ) : null;

  return { compareFlipped: flipped, compareNote, compareVeil };
}
