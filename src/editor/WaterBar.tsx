// The water's time controls over the map (live editing, PLAN §20 D180 (8)): pause, speed, skip to
// the result, replay the last journey, follow the water with the camera, and a drought or a
// badtide to watch.
// Built from the shared bar and button styles (D176).

import { WATER_SPEEDS, type WaterPlayer, type WaterSpeed } from "./waterPlayer";
import type { Hazard } from "../core/sim/weather";

export interface WaterBarProps {
  player: WaterPlayer;
  /** The camera follows where the water moves most. */
  follow: boolean;
  onFollow(on: boolean): void;
  /** The hazard playing (a drought, a badtide), or null: pressing it again stops it (the map's
   *  own water at once). */
  weather: Hazard | null;
  onWeather(h: Hazard): void;
}

const SPEED_NAMES: Record<WaterSpeed, string> = { slower: "Slower", normal: "Normal", faster: "Faster", instant: "Instant" };

export function WaterBar({ player: p, follow, onFollow, weather, onWeather }: WaterBarProps) {
  const progress = p.progress;
  const status = p.words ?? (progress !== null ? `Water flowing… ${Math.round(progress * 100)}%` : "Water settled");
  return (
    <div class="map-bar water-bar" role="toolbar" aria-label="Water time">
      <span class="bar-status" role="status">
        {status}
      </span>
      <button type="button" class="icon-button" aria-pressed={p.paused} title={p.paused ? "Play the water" : "Pause the water"} onClick={() => p.pause(!p.paused)}>
        <span class="icon-word">{p.paused ? "Play" : "Pause"}</span>
      </button>
      <label class="bar-group" title="How fast the water flows after a change (Instant: straight to where it settles)">
        Speed
        <select aria-label="Water speed" value={p.speedName} onChange={(e) => p.setSpeed((e.target as HTMLSelectElement).value as WaterSpeed)}>
          {WATER_SPEEDS.map((v) => (
            <option key={v} value={v}>
              {SPEED_NAMES[v]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" class="icon-button" title="Skip to where the water settles" disabled={progress === null} onClick={() => p.skip()}>
        <span class="icon-word">Skip</span>
      </button>
      <button type="button" class="icon-button" title="Watch the last change's water again" disabled={!p.canReplay} onClick={() => p.replay()}>
        <span class="icon-word">Replay</span>
      </button>
      <button type="button" class="icon-button" aria-pressed={follow} title="The camera follows the water" onClick={() => onFollow(!follow)}>
        <span class="icon-word">Follow</span>
      </button>
      <button type="button" class="icon-button" aria-pressed={weather === "drought"} title={weather === "drought" ? "End the drought: the water as the map has it" : "Watch a drought: the sources stop, the water drains and dries, then comes back"} onClick={() => onWeather("drought")}>
        <span class="icon-word">Drought</span>
      </button>
      <button type="button" class="icon-button" aria-pressed={weather === "badtide"} title={weather === "badtide" ? "End the badtide: the water as the map has it" : "Watch a badtide: the clean sources give badwater, it spreads and poisons the ground, then washes out"} onClick={() => onWeather("badtide")}>
        <span class="icon-word">Badtide</span>
      </button>
    </div>
  );
}
