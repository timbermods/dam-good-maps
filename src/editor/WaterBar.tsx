// The water's time controls over the map (live editing, PLAN §20 D180 (8)): pause, speed, skip to
// the result, replay the last journey, and a drought or a badtide to watch. The camera never moves
// by itself (D265: no Follow).
// Built from the shared bar and button styles (D176).

import { useEffect, useRef } from "preact/hooks";
import type { WaterPlayer } from "./waterPlayer";
import type { Hazard } from "../core/sim/weather";
import { tip } from "../ui/Tooltip";

export interface WaterBarProps {
  player: WaterPlayer;
  /** The hazard held (a drought, a badtide), or null: pressing it again brings the map's own water back. */
  weather: Hazard | null;
  onWeather(h: Hazard): void;
  /** The day shown (0: the map's own water), the day asked for (the box reads it at once), and how far that day is
   *  worked out (0 to 1, the box's quiet fill), or null once it shows. */
  day: number | null;
  target: number | null;
  counting: number | null;
  onStep(delta: -1 | 1): void;
}


export function WaterBar({ player: p, weather, onWeather, day, target, counting, onStep }: WaterBarProps) {
  const shown = target ?? day;
  const progress = p.progress;
  const status = p.words ?? (progress !== null ? `Water flowing… ${Math.round(progress * 100)}%` : "Water settled");
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
      {/* (greyed while a weather day is held: it says how the map's own water stands, not the day shown) */}
      <span class={`bar-status${weather ? " off" : ""}`} role="status">
        {status}
      </span>
      <button type="button" class="icon-button" aria-pressed={p.paused} disabled={progress === null && !p.paused} title={p.paused ? "Play the water" : progress === null ? "The water is settled" : "Pause the water"} onClick={() => p.pause(!p.paused)}>
        <span class="icon-word">{p.paused ? "Play water" : "Pause water"}</span>
      </button>
      {/* (Skip and Replay control the water's journey after an edit: greyed while a weather day is held; the water
          always plays at one pace, Kyler, 2026-10-04: no Speed beside the weather) */}
      <button type="button" class="icon-button" title="Skip to where the water settles" disabled={progress === null || !!weather} onClick={() => p.skip()}>
        <span class="icon-word">Skip</span>
      </button>
      <button type="button" class="icon-button" title="Play the last change's water again" disabled={!p.canReplay || !!weather} onClick={() => p.replay()}>
        <span class="icon-word">Replay</span>
      </button>
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
        {/* the day asked for, at once (Kyler, 2026-10-04: never counting); a quiet fill inside the box until it shows */}
        <span class={`day-label${weather && counting !== null ? " working" : ""}`} aria-live="polite">
          {weather && counting !== null ? <span class="day-fill" style={{ width: `${Math.round(counting * 100)}%` }} aria-hidden="true" /> : null}
          <span class="day-words">{!weather || shown === null ? "Day –" : `Day ${shown}`}</span>
        </span>
        <button type="button" class="day-step" aria-label="Day on" disabled={!weather} {...tip("A day on", "→")} onClick={() => onStep(1)}>
          ▶
        </button>
      </span>
    </div>
  );
}
