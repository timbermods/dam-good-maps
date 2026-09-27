// The water's time controls over the map (live editing, PLAN §20 D180 (8), D268): the status,
// Pause, Skip to the result, Replay the last journey, and Drought and Badtide. The water after an
// edit always plays at one brisk pace: no speed control here (D268). The camera never moves by
// itself (D265: no Follow).
//
// While a drought or a badtide is shown (D267), the bar carries its day strip: Day 0 (the map as it
// is) to the last day, previous and next, a click on any day, Play through the days, Speed (it
// appears only here) and the hazard's length; the day the start's water is gone (or badwater
// reaches it) is marked. Pause and Skip then act on the step between days.
// Built from the shared bar and button styles (D176).

import type { Hazard } from "../core/sim/weather";
import { HAZARD_MAX_DAYS, HAZARD_MIN_DAYS } from "../core/sim/hazard";
import { DAY_SPEEDS, type DayPlayer, type DaySpeed } from "./dayPlayer";
import type { WaterPlayer } from "./waterPlayer";

/** A hazard on the bar: being worked out (`working`, 0–1), or shown day by day (`player`). */
export interface HazardBar {
  hazard: Hazard;
  /** How far it has been worked out (0–1), or null once shown. */
  working: number | null;
  /** Its length in days (the strip's setting). */
  days: number;
  player: DayPlayer | null;
  /** The start's marker: its day and words ("Day 6: your start's water is gone"), or null. */
  marker: { day: number; words: string } | null;
  /** Words when there is no marker ("Your start's water lasts the drought"), or null. */
  note: string | null;
}

export interface WaterBarProps {
  player: WaterPlayer;
  hazard: HazardBar | null;
  /** Drought or Badtide pressed: shown, or (pressed again) the map's own water at once. */
  onHazard(h: Hazard): void;
  /** The hazard's length changed (1–30 days). */
  onLength(h: Hazard, days: number): void;
  speed: DaySpeed;
  onSpeed(s: DaySpeed): void;
}

const SPEED_NAMES: Record<DaySpeed, string> = { slower: "Slower", normal: "Normal", faster: "Faster", instant: "Instant" };
const NAMES: Record<Hazard, string> = { drought: "Drought", badtide: "Badtide" };

export function WaterBar({ player: p, hazard: hz, onHazard, onLength, speed, onSpeed }: WaterBarProps) {
  const dp = hz?.player ?? null;
  const progress = p.progress;
  let status: string;
  if (hz && hz.working !== null) status = `Working out the ${hz.hazard}… ${Math.round(hz.working * 100)}%`;
  else if (hz && dp) status = `${NAMES[hz.hazard]}: day ${dp.target ?? dp.day} of ${dp.days}`;
  else status = progress !== null ? `Water flowing… ${Math.round(progress * 100)}%` : "Water settled";
  const paused = dp ? dp.paused : p.paused;
  const canSkip = dp ? dp.target !== null || dp.playing : progress !== null;
  return (
    <div class="map-bar water-bar" role="toolbar" aria-label="Water time">
      <span class="bar-status" role="status">
        {status}
      </span>
      <button type="button" class="icon-button" aria-pressed={paused} title={paused ? "Play the water" : "Pause the water"} onClick={() => (dp ? dp.pause(!dp.paused) : p.pause(!p.paused))}>
        <span class="icon-word">{paused ? "Play" : "Pause"}</span>
      </button>
      <button type="button" class="icon-button" title={dp ? "Straight to the day" : "Skip to where the water settles"} disabled={!canSkip} onClick={() => (dp ? dp.skip() : p.skip())}>
        <span class="icon-word">Skip</span>
      </button>
      <button type="button" class="icon-button" title="Watch the last change's water again" disabled={!!hz || !p.canReplay} onClick={() => p.replay()}>
        <span class="icon-word">Replay</span>
      </button>
      <button type="button" class="icon-button" aria-pressed={hz?.hazard === "drought"} title={hz?.hazard === "drought" ? "Back to the map's own water" : "Show a drought: the sources stop and the water dries, day by day"} onClick={() => onHazard("drought")}>
        <span class="icon-word">Drought</span>
      </button>
      <button type="button" class="icon-button" aria-pressed={hz?.hazard === "badtide"} title={hz?.hazard === "badtide" ? "Back to the map's own water" : "Show a badtide: the clean sources turn bad and it spreads, day by day"} onClick={() => onHazard("badtide")}>
        <span class="icon-word">Badtide</span>
      </button>
      {hz ? <DayStrip hz={hz} onLength={onLength} speed={speed} onSpeed={onSpeed} /> : null}
    </div>
  );
}

function DayStrip({ hz, onLength, speed, onSpeed }: { hz: HazardBar; onLength: WaterBarProps["onLength"]; speed: DaySpeed; onSpeed(s: DaySpeed): void }) {
  const dp = hz.player;
  const on = dp ? (dp.target ?? dp.day) : null;
  const days = dp ? dp.days : hz.days;
  return (
    <div class="day-strip" role="group" aria-label={`${NAMES[hz.hazard]} days`}>
      <button type="button" class="icon-button" title="The day before" aria-label="Previous day" disabled={!dp || on === 0} onClick={() => dp?.prev()}>
        ‹
      </button>
      <span class="days">
        {Array.from({ length: days + 1 }, (_, d) => (
          <button
            type="button"
            key={d}
            class={`day${hz.marker?.day === d ? " marked" : ""}`}
            aria-label={`Day ${d}`}
            aria-current={on === d ? "true" : undefined}
            title={d === 0 ? "Day 0: the map as it is" : hz.marker?.day === d ? hz.marker.words : `Day ${d}`}
            disabled={!dp}
            onClick={() => dp?.goTo(d)}
          >
            {d}
          </button>
        ))}
      </span>
      <button type="button" class="icon-button" title="The next day" aria-label="Next day" disabled={!dp || on === days} onClick={() => dp?.next()}>
        ›
      </button>
      <button type="button" class="icon-button" aria-pressed={!!dp?.playing} title={dp?.playing ? "Stop on this day" : "Play through the days"} disabled={!dp} onClick={() => dp?.play()}>
        <span class="icon-word">{dp?.playing ? "Stop" : "Play days"}</span>
      </button>
      <label class="bar-group" title="How fast a day's water moves (Instant: straight to the day)">
        Speed
        <select aria-label="Speed" value={speed} onChange={(e) => onSpeed((e.target as HTMLSelectElement).value as DaySpeed)}>
          {DAY_SPEEDS.map((v) => (
            <option key={v} value={v}>
              {SPEED_NAMES[v]}
            </option>
          ))}
        </select>
      </label>
      <label class="bar-group" title={`How many days the ${hz.hazard} lasts (1 to 30)`}>
        Days
        <input
          type="number"
          aria-label="Days"
          min={HAZARD_MIN_DAYS}
          max={HAZARD_MAX_DAYS}
          step={1}
          value={hz.days}
          onChange={(e) => {
            const n = Math.round(Number((e.target as HTMLInputElement).value));
            if (Number.isFinite(n)) onLength(hz.hazard, Math.max(HAZARD_MIN_DAYS, Math.min(HAZARD_MAX_DAYS, n)));
          }}
        />
      </label>
      {hz.marker || hz.note ? <span class={`strip-note${hz.marker ? " marked" : ""}`}>{hz.marker?.words ?? hz.note}</span> : null}
    </div>
  );
}
