// The options rows of Craterize, Erupt and Quake (PLAN §20 D202, D203, D206, D219), each starting
// with its mode switch (ForceOptions): Craterize's Strike or Aim, Power, Size (following Power, or
// set), Steep or Terraced walls, its centre, Light or Heavy debris and Rays; Erupt's Vent or Fissure,
// Power, Steep or Broad, its summit, Light or Heavy flows and Ridges; Quake's Lift or Slide, Power,
// Sheer or Stepped scarp and the side that moves (X flips it). Try another once one is kept. While a
// force is at work its row is its status and Revert (Esc). Carve's row is its own (CarveRow.tsx).
// Built from the shared bar styles (D176).

import { autoCentre, CRATER_DEFAULTS, naturalSize as craterSize, type CraterSettings } from "../core/forces/craterize";
import { autoSummit, ERUPT_DEFAULTS, type EruptSettings } from "../core/forces/erupt";
import { QUAKE_DEFAULTS, slideTiles, type QuakeSettings } from "../core/forces/quake";
import { forcePowerWord, type ForceStatus } from "./forceDriver";
import { ForceOptions, Toggle, type Force } from "./TopBar";

/** What the player set for the next impact (kept for the visit). */
export interface CraterUi {
  mode: "strike" | "aim";
  power: number;
  size: number | null;
  walls: "steep" | "terraced";
  centre: CraterSettings["centre"];
  debris: "light" | "heavy";
  rays: boolean;
}
export const DEFAULT_CRATER: CraterUi = { mode: CRATER_DEFAULTS.mode, power: CRATER_DEFAULTS.power, size: CRATER_DEFAULTS.size, walls: CRATER_DEFAULTS.walls, centre: CRATER_DEFAULTS.centre, debris: CRATER_DEFAULTS.debris, rays: CRATER_DEFAULTS.rays };

export interface EruptUi {
  mode: "vent" | "fissure";
  power: number;
  shape: "steep" | "broad";
  summit: EruptSettings["summit"];
  flows: "light" | "heavy";
  ridges: boolean;
}
export const DEFAULT_ERUPT: EruptUi = { mode: ERUPT_DEFAULTS.mode, power: ERUPT_DEFAULTS.power, shape: ERUPT_DEFAULTS.shape, summit: ERUPT_DEFAULTS.summit, flows: ERUPT_DEFAULTS.flows, ridges: ERUPT_DEFAULTS.ridges };

export interface QuakeUi {
  mode: "lift" | "slide";
  power: number;
  scarp: "sheer" | "stepped";
  /** The side of the stroke that moves: 1 its left, -1 its right (X flips it). */
  side: 1 | -1;
}
export const DEFAULT_QUAKE: QuakeUi = { mode: QUAKE_DEFAULTS.mode, power: QUAKE_DEFAULTS.power, scarp: QUAKE_DEFAULTS.scarp, side: 1 };

/** A new series' settings (its first personality: the prototypes' own default seeds). */
export const craterSettingsOf = (u: CraterUi): CraterSettings => ({ ...u, seed: CRATER_DEFAULTS.seed });
export const eruptSettingsOf = (u: EruptUi): EruptSettings => ({ ...u, seed: ERUPT_DEFAULTS.seed });
export const quakeSettingsOf = (u: QuakeUi): QuakeSettings => ({ mode: u.mode, power: u.power, scarp: u.scarp, seed: QUAKE_DEFAULTS.seed });

/** A force at work: what it is doing, and Revert (Esc). */
export function ForceAtWork(p: { force: Force; status: ForceStatus; onRevert(): void }) {
  const st = p.status;
  const doing = p.force.id === "craterize" ? "Striking…" : p.force.id === "erupt" ? "Erupting…" : st.painting ? "Paint the fault; let go to keep it" : "The ground is moving…";
  return (
    <div class="map-bar options-row" role="group" aria-label={`${p.force.name} at work`}>
      <div class="bar-group">
        <span class="bar-status" role="status">
          {st.stopping ? "Settling…" : doing}
        </span>
        <button type="button" disabled={st.stopping} onClick={p.onRevert} title="Take all of it back (Esc)">
          Revert
        </button>
      </div>
    </div>
  );
}

function Power(p: { verb: "craterize" | "erupt" | "quake"; value: number; onChange(v: number): void; title: string }) {
  const word = forcePowerWord(p.verb, p.value);
  return (
    <label class="slider-field" title={p.title}>
      Power
      <input type="range" min={0} max={100} step={5} aria-label="Power" aria-valuetext={`${p.value}, ${word}`} value={p.value} onInput={(e) => p.onChange(Number((e.target as HTMLInputElement).value))} />
      <output>{word}</output>
    </label>
  );
}

function Segmented<T extends string>(p: { label: string; value: T; options: readonly [T, string, string][]; onChange(v: T): void }) {
  return (
    <div class="segmented" role="group" aria-label={p.label}>
      {p.options.map(([v, word, title]) => (
        <button type="button" key={v} aria-pressed={p.value === v} title={title} onClick={() => p.onChange(v)}>
          {word}
        </button>
      ))}
    </div>
  );
}

function Again(p: { show: boolean; onAgain(): void; what: string }) {
  return p.show ? (
    <button type="button" onClick={p.onAgain} title={`The same ${p.what} from the same land, another way (it replaces the last one)`}>
      Try another
    </button>
  ) : null;
}

export interface RowProps<U> {
  force: Force;
  ui: U;
  onUi(u: U): void;
  /** Try another is there. */
  canAgain: boolean;
  onAgain(): void;
}

export function CraterizeRow(p: RowProps<CraterUi>) {
  const u = p.ui;
  const set = (patch: Partial<CraterUi>) => p.onUi({ ...u, ...patch });
  const size = u.size ?? craterSize(u.power);
  const centre = u.centre === "auto" ? autoCentre(size) : u.centre;
  return (
    <ForceOptions force={p.force} mode={u.mode === "aim" ? "Aim" : "Strike"} onMode={(m) => set({ mode: m === "Aim" ? "aim" : "strike" })}>
      <Power verb="craterize" value={u.power} onChange={(power) => set({ power })} title="How hard it hits: deeper, wider, with more debris" />
      <Toggle label="Size follows Power" title="Untick to set the crater's size yourself" on={u.size === null} onChange={(on) => set({ size: on ? null : size })} />
      <label class="slider-field" title={u.size === null ? "The size Power gives (untick Size follows Power to set it)" : "The crater's width, in tiles"}>
        Size
        <input type="range" min={4} max={180} step={2} aria-label="Size" value={size} disabled={u.size === null} onInput={(e) => set({ size: Number((e.target as HTMLInputElement).value) })} />
        <output>{size}</output>
      </label>
      <label title="Steep: one cliff all round. Terraced: broad benches stepping down">
        Walls
        <select aria-label="Walls" value={u.walls} onChange={(e) => set({ walls: (e.target as HTMLSelectElement).value as CraterUi["walls"] })}>
          <option value="steep">Steep</option>
          <option value="terraced">Terraced</option>
        </select>
      </label>
      <label title={`What stands in the middle (Auto: ${centre} for this size)`}>
        Centre
        <select aria-label="Centre" value={u.centre} onChange={(e) => set({ centre: (e.target as HTMLSelectElement).value as CraterUi["centre"] })}>
          <option value="auto">Auto</option>
          <option value="bowl">Bowl</option>
          <option value="peak">Peak</option>
          <option value="ring">Ring</option>
          <option value="flat">Flat</option>
        </select>
      </label>
      <Segmented
        label="Debris"
        value={u.debris}
        onChange={(debris) => set({ debris })}
        options={[
          ["light", "Light debris", "A thin skirt of debris round the rim"],
          ["heavy", "Heavy debris", "A thick apron of debris thrown far round it"],
        ]}
      />
      <Toggle label="Rays" title="Streaks of debris thrown out in a starburst" on={u.rays} onChange={(rays) => set({ rays })} />
      <Again show={p.canAgain} onAgain={p.onAgain} what="impact" />
    </ForceOptions>
  );
}

export function EruptRow(p: RowProps<EruptUi>) {
  const u = p.ui;
  const set = (patch: Partial<EruptUi>) => p.onUi({ ...u, ...patch });
  return (
    <ForceOptions force={p.force} mode={u.mode === "fissure" ? "Fissure" : "Vent"} onMode={(m) => set({ mode: m === "Fissure" ? "fissure" : "vent" })}>
      <Power verb="erupt" value={u.power} onChange={(power) => set({ power })} title="How much it throws up: a small cone to a towering volcano" />
      <Segmented
        label="Shape"
        value={u.shape}
        onChange={(shape) => set({ shape })}
        options={[
          ["steep", "Steep", "A tall, steep cone"],
          ["broad", "Broad", "A broad, gentle shield"],
        ]}
      />
      <label title={`Its top (Auto: ${u.summit === "auto" ? autoSummit(u.power) : u.summit} at this power)`}>
        Summit
        <select aria-label="Summit" value={u.summit} onChange={(e) => set({ summit: (e.target as HTMLSelectElement).value as EruptUi["summit"] })}>
          <option value="auto">Auto</option>
          <option value="peak">Peak</option>
          <option value="crater">Crater</option>
          <option value="caldera">Caldera</option>
        </select>
      </label>
      <Segmented
        label="Flows"
        value={u.flows}
        onChange={(flows) => set({ flows })}
        options={[
          ["light", "Light flows", "Short lava flows"],
          ["heavy", "Heavy flows", "Long lava flows that can dam rivers"],
        ]}
      />
      <Toggle label="Ridges" title="The flows set into ridges down its sides" on={u.ridges} onChange={(ridges) => set({ ridges })} />
      <Again show={p.canAgain} onAgain={p.onAgain} what="eruption" />
    </ForceOptions>
  );
}

export function QuakeRow(p: RowProps<QuakeUi>) {
  const u = p.ui;
  const set = (patch: Partial<QuakeUi>) => p.onUi({ ...u, ...patch });
  return (
    <ForceOptions force={p.force} mode={u.mode === "slide" ? "Slide" : "Lift"} onMode={(m) => set({ mode: m === "Slide" ? "slide" : "lift" })}>
      <Power verb="quake" value={u.power} onChange={(power) => set({ power })} title={u.mode === "slide" ? `How far the land slides: ${slideTiles(u.power)} tiles` : "How high the land lifts, and how far the shaking reaches"} />
      <Segmented
        label="Scarp"
        value={u.scarp}
        onChange={(scarp) => set({ scarp })}
        options={[
          ["sheer", "Sheer", "One sheer cliff along the fault"],
          ["stepped", "Stepped", "Benches stepping down from the fault"],
        ]}
      />
      <Segmented
        label="Side that moves"
        value={u.side === 1 ? "left" : "right"}
        onChange={(v) => set({ side: v === "left" ? 1 : -1 })}
        options={[
          ["left", "Left", "The land on the left of the stroke moves (X flips it)"],
          ["right", "Right", "The land on the right of the stroke moves (X flips it)"],
        ]}
      />
      <Again show={p.canAgain} onAgain={p.onAgain} what="quake" />
    </ForceOptions>
  );
}
