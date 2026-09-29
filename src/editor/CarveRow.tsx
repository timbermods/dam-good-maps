// Carve's options row (PLAN §20 D194, D199, D226, D289, D309): Power (a creek to a catastrophe), Size
// (how wide it cuts: following Power, or set by hand), its one choice, Keep river or Dry canyon, Try
// another path once a carve is kept, and a small More button for its other settings. More opens
// wander, walls and depth, each on Auto (drawn from the land and the seed, core/forces/nature.ts)
// until the player sets one, which pins it with a small way back to Auto (D309; the controls
// themselves are back from before D289). Try another re-rolls only the details still on Auto. The
// gesture decides the rest of how it runs: a click unleashes it where the cursor is, a drag aims it
// that way, cutting through rises on its way. While it runs, the row is Pause and Revert (Esc); it
// keeps itself when it ends. Built from the shared bar styles (D176).

import type { CarveSettings } from "../core/forces/carve/run";
import { naturalDepth, naturalWidth } from "../core/forces/carve/character";
import { DEPTH_MAX, DEPTH_MIN } from "../core/forces/carve/run";
import { STEPS_PER_SECOND } from "../core/forces/force";
import { powerWord, wanderWord, type ForceStatus } from "./forceDriver";
import { AutoDetail, ForceOptions, MoreButton, MoreRow, SizeControl, type Force } from "./TopBar";

/** What the player set for the next carve (the page keeps it for the visit). Its details (wander,
 *  walls, depth), behind More, start on Auto (null) until the player pins one (D309). */
export interface CarveUi {
  power: number;
  /** Tiles, or null: it follows Power. */
  width: number | null;
  dry: boolean;
  /** Straight to winding, or null: drawn from the land and the seed (D309). */
  wander: number | null;
  /** A gorge or wide terraces, or null: drawn from the land and the seed (D309). */
  walls: "steep" | "wide" | null;
  /** Levels below the land at most, or null: drawn from the land and the seed, or (still Auto and
   *  never yet run) the run's own default from Power and width (D309). */
  depth: number | null;
}

export const DEFAULT_CARVE: CarveUi = { power: 65, width: null, dry: false, wander: null, walls: null, depth: null };

/** The row's current detail pins (D309), sent with Try another: `null` for a detail still on Auto
 *  (nature draws it again), or the value the player pinned (nature leaves it). */
export function carveDetails(u: CarveUi): Record<string, unknown> {
  return { wander: u.wander, walls: u.walls, depth: u.depth };
}

/** The run's settings for a new carve (a new series: seed 0; the rock's layers always on). `aimed`:
 *  a drag gave it a direction, and it cuts through rises to get there (D289). Its wander, walls and
 *  depth carry the row's pins, `null` where still on Auto, for nature.ts to draw once the force
 *  starts (D309; the cast is that draft, not yet the force's own settings). */
export function carveSettingsOf(u: CarveUi, aimed = false): CarveSettings {
  return {
    mode: aimed ? "aim" : "unleash",
    power: u.power,
    wander: u.wander,
    width: u.width,
    depth: u.depth,
    seed: 0,
    walls: u.walls,
    defyGravity: aimed,
    dry: u.dry,
    layers: true,
  } as CarveSettings;
}

export interface CarveRowProps {
  force: Force;
  ui: CarveUi;
  onUi(u: CarveUi): void;
  /** The carve at work, or null. */
  status: ForceStatus | null;
  /** Try another path is there. */
  canAgain: boolean;
  onAgain(): void;
  onPause(): void;
  onRevert(): void;
  /** More is open (D309): closed by default, remembered while it stays open. */
  more: boolean;
  onMore(open: boolean): void;
  /** The settings the last carve actually ran with (D309): what an Auto detail shows until pinned. */
  drawn: CarveSettings | null;
}

export function CarveRow(p: CarveRowProps) {
  const u = p.ui;
  const set = (patch: Partial<CarveUi>) => p.onUi({ ...u, ...patch });
  const st = p.status;
  if (st) {
    const secs = (st.steps / STEPS_PER_SECOND).toFixed(1);
    return (
      <div class="map-bar options-row" role="group" aria-label="Carve at work">
        <div class="bar-group">
          <span class="bar-status" role="status">
            {st.stopping ? "Keeping the carve…" : st.paused ? `Paused at ${secs} s` : `Carving… ${secs} s`}
          </span>
          <button type="button" disabled={st.stopping} onClick={p.onPause} title={st.paused ? "Carry on (Space)" : "Hold it where it is (Space)"}>
            {st.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" disabled={st.stopping} onClick={p.onRevert} title="Take all of it back (Esc)">
            Revert
          </button>
        </div>
      </div>
    );
  }
  const width = u.width ?? naturalWidth(u.power);
  const drawn = p.drawn;
  const wander = u.wander ?? drawn?.wander ?? 35;
  const walls = u.walls ?? drawn?.walls ?? "steep";
  const depth = u.depth ?? drawn?.depth ?? naturalDepth(u.power, width);
  return (
    <>
      <ForceOptions force={p.force}>
        <label class="slider-field" title="How hard it cuts and how far it runs: a creek to a catastrophe">
          Power
          <input type="range" min={0} max={100} step={5} aria-label="Power" aria-valuetext={`${u.power}, ${powerWord(u.power)}`} value={u.power} onInput={(e) => set({ power: Number((e.target as HTMLInputElement).value) })} />
          <output>{powerWord(u.power)}</output>
        </label>
        <SizeControl
          label="Size"
          title="How wide it cuts, in tiles: narrow for a slot canyon, wide for a lazy river (Auto: the width Power gives)"
          value={Math.round(width)}
          words={u.width === null ? width.toFixed(1) : String(u.width)}
          min={2}
          max={24}
          step={1}
          onChange={(v) => set({ width: v })}
          auto={{ on: u.width === null, onAuto: (on) => set({ width: on ? null : Math.round(width) }) }}
        />
        <div class="segmented" role="group" aria-label="What it leaves">
          <button type="button" aria-pressed={!u.dry} title="A row of sources at its start keeps the river flowing (their strength follows the width)" onClick={() => set({ dry: false })}>
            Keep river
          </button>
          <button type="button" aria-pressed={u.dry} title="No source: a dry canyon" onClick={() => set({ dry: true })}>
            Dry canyon
          </button>
        </div>
        {p.canAgain ? (
          <button type="button" onClick={p.onAgain} title="The same carve from the same land, another way, with another character (it replaces the last one)">
            Try another path
          </button>
        ) : null}
        <MoreButton open={p.more} onToggle={() => p.onMore(!p.more)} />
      </ForceOptions>
      {p.more ? (
        <MoreRow force={p.force}>
          <AutoDetail label="Wander" on={u.wander === null} onAuto={(on) => set({ wander: on ? null : wander })}>
            <label class="slider-field" title="Straight to winding (Auto: drawn from the land and the seed)">
              Wander
              <input type="range" min={0} max={100} step={5} aria-label="Wander" aria-valuetext={`${wander}, ${wanderWord(wander)}`} value={wander} onInput={(e) => set({ wander: Number((e.target as HTMLInputElement).value) })} />
              <output>{wanderWord(wander)}</output>
            </label>
          </AutoDetail>
          <AutoDetail label="Walls" on={u.walls === null} onAuto={(on) => set({ walls: on ? null : walls })}>
            <label title="Steep: a gorge. Wide: broad terraces (Auto: drawn from the land and the seed)">
              Walls
              <select aria-label="Walls" value={walls} onChange={(e) => set({ walls: (e.target as HTMLSelectElement).value as CarveUi["walls"] })}>
                <option value="steep">Steep</option>
                <option value="wide">Wide</option>
              </select>
            </label>
          </AutoDetail>
          <SizeControl
            label="Depth"
            title="How deep it cuts at most, in levels below the land it runs through (Auto: drawn from the land and the seed)"
            value={depth}
            min={DEPTH_MIN}
            max={DEPTH_MAX}
            step={1}
            onChange={(v) => set({ depth: v })}
            auto={{ on: u.depth === null, onAuto: (on) => set({ depth: on ? null : depth }) }}
          />
        </MoreRow>
      ) : null}
    </>
  );
}
