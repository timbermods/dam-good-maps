// The water's time controls over the map (live editing, PLAN §20 D180 (8)): pause, speed, skip to
// the result, replay the last journey, and a drought or a badtide to watch. The camera never moves
// by itself (D265: no Follow).
// Built from the shared bar and button styles (D176).

import { useEffect, useRef } from "preact/hooks";
import { WATER_SPEEDS, type WaterPlayer, type WaterSpeed } from "./waterPlayer";
import type { Hazard } from "../core/sim/weather";

export interface WaterBarProps {
  player: WaterPlayer;
  /** The hazard playing (a drought, a badtide), or null: pressing it again stops it (the map's
   *  own water at once). */
  weather: Hazard | null;
  onWeather(h: Hazard): void;
}

const SPEED_NAMES: Record<WaterSpeed, string> = { slower: "Slower", normal: "Normal", faster: "Faster", instant: "Instant" };

export function WaterBar({ player: p, weather, onWeather }: WaterBarProps) {
  const progress = p.progress;
  const status = p.words ?? (progress !== null ? `Water flowing… ${Math.round(progress * 100)}%` : "Water settled");
  // the view reads the bar's height from --water-bar-h: the legend panel ends one gap above it
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    const view = el?.parentElement;
    if (!el || !view || typeof ResizeObserver === "undefined") return;
    const note = () => view.style.setProperty("--water-bar-h", `${el.getBoundingClientRect().height}px`);
    note();
    const watch = new ResizeObserver(note);
    watch.observe(el);
    return () => {
      watch.disconnect();
      view.style.removeProperty("--water-bar-h");
    };
  }, []);
  return (
    <div ref={bar} class="map-bar water-bar" role="toolbar" aria-label="Water time">
      <span class="bar-status" role="status">
        {status}
      </span>
      <button type="button" class="icon-button" aria-pressed={p.paused} disabled={progress === null && !p.paused} title={p.paused ? "Play the water" : progress === null ? "The water is settled" : "Pause the water"} onClick={() => p.pause(!p.paused)}>
        <span class="icon-word">{p.paused ? "Play water" : "Pause water"}</span>
      </button>
      {/* Speed: a segmented choice like the page's others, no native dropdown (Kyler, 2026-10-04) */}
      <span class="bar-group water-speed" title="How fast the water flows">
        <span class="bar-label">Speed</span>
        <span class="set-seg" role="group" aria-label="Water speed">
          {WATER_SPEEDS.map((v) => (
            <button type="button" key={v} aria-pressed={p.speedName === v} title={`The water at ${SPEED_NAMES[v].toLowerCase()} speed`} onClick={() => p.setSpeed(v)}>
              {SPEED_NAMES[v]}
            </button>
          ))}
        </span>
      </span>
      <button type="button" class="icon-button" title="Skip to where the water settles" disabled={progress === null} onClick={() => p.skip()}>
        <span class="icon-word">Skip</span>
      </button>
      <button type="button" class="icon-button" title="Play the last change's water again" disabled={!p.canReplay} onClick={() => p.replay()}>
        <span class="icon-word">Replay</span>
      </button>
      <button type="button" class="icon-button" aria-pressed={weather === "drought"} title={weather === "drought" ? "End the drought" : "Play a drought: the sources stop"} onClick={() => onWeather("drought")}>
        <span class="icon-word">Drought</span>
      </button>
      <button type="button" class="icon-button" aria-pressed={weather === "badtide"} title={weather === "badtide" ? "End the badtide" : "Play a badtide: clean sources turn bad"} onClick={() => onWeather("badtide")}>
        <span class="icon-word">Badtide</span>
      </button>
    </div>
  );
}
