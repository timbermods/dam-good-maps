// Carve's options row (PLAN §20 D194, D199, D206): its mode switch first (Unleash: click a spot;
// Aim: its start, then where it ends), then Power (a creek to a catastrophe), Width (following
// Power, or set by hand: a slot canyon, a wide lazy river), Wander (straight to winding), Walls
// (steep or wide), Keep river or Dry canyon, Defy gravity (aimed, to cut uphill), Follow (the
// camera after its head), and Try another path once a carve is kept. While it runs, the row is its
// controls: Pause, Stop (keep what's carved) and Revert (Esc). Built from the shared bar styles
// (D176).

import type { CarveSettings } from "../core/forces/carve/run";
import { naturalWidth } from "../core/forces/carve/character";
import { STEPS_PER_SECOND } from "../core/forces/force";
import { powerWord, wanderWord, type CarveStatus } from "./carveDriver";
import { ForceOptions, Toggle, type Force } from "./TopBar";

/** What the player set for the next carve (the page keeps it for the visit). */
export interface CarveUi {
  mode: "unleash" | "aim";
  power: number;
  /** Tiles, or null: it follows Power. */
  width: number | null;
  wander: number;
  walls: "steep" | "wide";
  dry: boolean;
  defyGravity: boolean;
  /** The camera follows its head. */
  follow: boolean;
}

export const DEFAULT_CARVE: CarveUi = { mode: "unleash", power: 65, width: null, wander: 35, walls: "steep", dry: false, defyGravity: false, follow: false };

/** The run's settings for a new carve (a new series: seed 0; the rock's layers always on). */
export function carveSettingsOf(u: CarveUi): CarveSettings {
  return { mode: u.mode, power: u.power, wander: u.wander, width: u.width, seed: 0, walls: u.walls, defyGravity: u.mode === "aim" && u.defyGravity, dry: u.dry, layers: true };
}

export interface CarveRowProps {
  force: Force;
  ui: CarveUi;
  onUi(u: CarveUi): void;
  /** The carve at work, or null. */
  status: CarveStatus | null;
  /** Try another path is there. */
  canAgain: boolean;
  onAgain(): void;
  onPause(): void;
  onStop(): void;
  onRevert(): void;
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
          <button type="button" disabled={st.stopping} onClick={p.onStop} title="Keep what's carved so far: one undo step">
            Stop
          </button>
          <button type="button" disabled={st.stopping} onClick={p.onRevert} title="Take all of it back (Esc)">
            Revert
          </button>
        </div>
      </div>
    );
  }
  const width = u.width ?? naturalWidth(u.power);
  return (
    <ForceOptions force={p.force} mode={u.mode === "aim" ? "Aim" : "Unleash"} onMode={(m) => set({ mode: m === "Aim" ? "aim" : "unleash" })}>
      <label class="slider-field" title="How hard it cuts and how far it runs: a creek to a catastrophe">
        Power
        <input type="range" min={0} max={100} step={5} aria-label="Power" aria-valuetext={`${u.power}, ${powerWord(u.power)}`} value={u.power} onInput={(e) => set({ power: Number((e.target as HTMLInputElement).value) })} />
        <output>{powerWord(u.power)}</output>
      </label>
      <Toggle label="Width follows Power" title="Untick to set the width yourself: narrow for a slot canyon, wide for a lazy river" on={u.width === null} onChange={(on) => set({ width: on ? null : Math.round(width) })} />
      <label class="slider-field" title={u.width === null ? "The width Power gives (untick Width follows Power to set it)" : "How wide it cuts, in tiles"}>
        Width
        <input type="range" min={2} max={24} step={1} aria-label="Width" value={Math.round(width)} disabled={u.width === null} onInput={(e) => set({ width: Number((e.target as HTMLInputElement).value) })} />
        <output>{u.width === null ? width.toFixed(1) : u.width}</output>
      </label>
      <label class="slider-field" title="Straight to winding">
        Wander
        <input type="range" min={0} max={100} step={5} aria-label="Wander" aria-valuetext={`${u.wander}, ${wanderWord(u.wander)}`} value={u.wander} onInput={(e) => set({ wander: Number((e.target as HTMLInputElement).value) })} />
        <output>{wanderWord(u.wander)}</output>
      </label>
      <label title="Steep: a gorge. Wide: broad terraces">
        Walls
        <select aria-label="Walls" value={u.walls} onChange={(e) => set({ walls: (e.target as HTMLSelectElement).value as CarveUi["walls"] })}>
          <option value="steep">Steep</option>
          <option value="wide">Wide</option>
        </select>
      </label>
      <div class="segmented" role="group" aria-label="What it leaves">
        <button type="button" aria-pressed={!u.dry} title="A source at its start keeps the river flowing (its strength follows the width)" onClick={() => set({ dry: false })}>
          Keep river
        </button>
        <button type="button" aria-pressed={u.dry} title="No source: a dry canyon" onClick={() => set({ dry: true })}>
          Dry canyon
        </button>
      </div>
      {u.mode === "aim" ? <Toggle label="Defy gravity" title="Cut through to an end point uphill, on a floor that never rises" on={u.defyGravity} onChange={(defyGravity) => set({ defyGravity })} /> : null}
      <Toggle label="Follow" title="The camera follows the river's head" on={u.follow} onChange={(follow) => set({ follow })} />
      {p.canAgain ? (
        <button type="button" onClick={p.onAgain} title="The same carve from the same land, another way (it replaces the last one)">
          Try another path
        </button>
      ) : null}
    </ForceOptions>
  );
}
