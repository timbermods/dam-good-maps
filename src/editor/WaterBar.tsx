// The water row over the map (live editing, PLAN §20 D180 (8)): a drought or a badtide held on a day, the day stepped
// with ◀ ▶ or typed into its box. The water plays into place after every edit with no controls (undo and redo show a
// change again), and the header's dot says "Settling…" while it does (Kyler, 2026-10-04: one status). The camera never moves by itself (D265: no Follow).
// Built from the shared bar and button styles (D176).

import { useEffect, useRef, useState } from "preact/hooks";
import type { Hazard } from "../core/sim/weather";
import { tip } from "../ui/Tooltip";

export interface WaterBarProps {
  /** The hazard held (a drought, a badtide), or null: pressing it again brings the map's own water back. */
  weather: Hazard | null;
  onWeather(h: Hazard): void;
  /** The day shown (0: the map's own water), the day asked for (the box reads it at once), and how far that day is
   *  worked out (0 to 1, the box's quiet fill), or null once it shows. */
  day: number | null;
  target: number | null;
  counting: number | null;
  onStep(delta: -1 | 1): void;
  /** Show a typed day (0 to 99). */
  onDay(day: number): void;
}

/** The days the box takes typed. */
const DAY_MAX = 99;


export function WaterBar({ weather, onWeather, day, target, counting, onStep, onDay }: WaterBarProps) {
  const shown = target ?? day;
  /** The day being typed into the box (Kyler, 2026-10-04: a double-click on it while a hazard is shown), or null. */
  const [typing, setTypingState] = useState<string | null>(null);
  // (the field's words as typed, read when it closes: Esc empties it first, so the blur that follows shows nothing)
  const typed = useRef<string | null>(null);
  const setTyping = (t: string | null) => {
    typed.current = t;
    setTypingState(t);
  };
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (typing !== null) field.current?.select();
  }, [typing !== null]);
  // (the hazard put away: the typing goes with it)
  useEffect(() => {
    if (!weather) setTyping(null);
  }, [weather]);
  const commit = () => {
    const t = typed.current;
    if (t === null) return;
    const n = Number(t);
    setTyping(null);
    if (t !== "" && Number.isInteger(n) && n >= 0 && n <= DAY_MAX && n !== shown) onDay(n);
  };
  // the view reads the bar's height from --water-bar-h: the legend panel ends one gap above it
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    const view = el?.parentElement;
    if (!el || !view || typeof ResizeObserver === "undefined") return;
    const note = () => {
      const b = el.getBoundingClientRect();
      view.style.setProperty("--water-bar-h", `${b.height}px`);
      // (Legend centres in the gap between the row's right edge and Top-down's left)
      view.style.setProperty("--water-bar-w", `${b.width}px`);
    };
    note();
    const watch = new ResizeObserver(note);
    watch.observe(el);
    return () => {
      watch.disconnect();
      view.style.removeProperty("--water-bar-h");
      view.style.removeProperty("--water-bar-w");
    };
  }, []);
  return (
    <div ref={bar} class="map-bar water-bar" role="toolbar" aria-label="Water time">
      <button type="button" class="icon-button" aria-pressed={weather === "drought"} title={weather === "drought" ? "Back to the map's own water" : "Hold a drought's last day: the sources stop"} onClick={() => onWeather("drought")}>
        <span class="icon-word">Drought</span>
      </button>
      <button type="button" class="icon-button" aria-pressed={weather === "badtide"} title={weather === "badtide" ? "Back to the map's own water" : "Hold a badtide's last day: clean sources turn bad"} onClick={() => onWeather("badtide")}>
        <span class="icon-word">Badtide</span>
      </button>
      {/* the day held (Kyler, 2026-10-04): ◀ back to Day 0 (the map's own water), ▶ on past the default length;
          greyed and "Day –" with neither on; the label two digits wide, so the row never changes shape */}
      <span class="bar-group day-stepper" role="group" aria-label="Weather day">
        <button type="button" class="day-step" aria-label="Day back" disabled={!weather || shown === 0} {...tip("A day back", "←")} onClick={() => onStep(-1)}>
          ◀
        </button>
        {/* the day asked for, at once (Kyler, 2026-10-04: never counting); a quiet fill inside the box until it shows;
            double-clicked while a hazard is shown, a field in its place for a typed day (Enter or clicking away shows it,
            Esc cancels), the box's size and place unchanged */}
        <span
          class={`day-label${weather && counting !== null ? " working" : ""}${typing !== null ? " typing" : ""}`}
          aria-live="polite"
          // (no tooltip while a day is typed: it would open on the field's focus, a box under the day box)
          {...(typing === null ? tip("Type a day", "Double-click") : {})}
          onDblClick={() => weather && setTyping(shown === null ? "" : String(shown))}
        >
          {weather && counting !== null && typing === null ? <span class="day-fill" style={{ width: `${Math.round(counting * 100)}%` }} aria-hidden="true" /> : null}
          {typing !== null ? (
            <input
              ref={field}
              class="day-field"
              type="text"
              inputMode="numeric"
              maxLength={2}
              aria-label="Day"
              value={typing}
              onInput={(e) => setTyping((e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 2))}
              onKeyDown={(e) => {
                // (the editor's keys wait while a day is typed)
                e.stopPropagation();
                if (e.key === "Enter") commit();
                else if (e.key === "Escape") setTyping(null);
              }}
              onBlur={commit}
            />
          ) : (
            <span class="day-words">{!weather || shown === null ? "Day –" : `Day ${shown}`}</span>
          )}
        </span>
        <button type="button" class="day-step" aria-label="Day on" disabled={!weather} {...tip("A day on", "→")} onClick={() => onStep(1)}>
          ▶
        </button>
      </span>
    </div>
  );
}
