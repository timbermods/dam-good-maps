// The options rows of Craterize, Erupt and Quake (PLAN §20 D202, D203, D206, D219, D226, D289): every
// force's row is Power, Size, at most one signature choice and Try another. Craterize: Power, Size
// (following Power, or set by hand), Try another; a click strikes, a drag aims a glancing blow.
// Erupt: Power, Size (its breadth), Try another; a click vents, a drag opens a fissure. Quake: its
// one choice, Lift or Slide, and Power (its drawn line sets its length); X flips the side that moves.
// The rest of each force's character (Craterize's walls, centre, debris and rays; Erupt's shape,
// summit, flows and ridges; Quake's scarp) comes from the land and the seed (core/forces/nature.ts),
// which Try another re-rolls. Glaciate: Power, Size and its one choice, Meltwater; a click Flows, a
// drag Aims. While a force is at work its row is its status and Revert (Esc).
// Carve's row is its own (CarveRow.tsx). Built from the shared bar styles (D176).

import { CRATER_DEFAULTS, naturalSize as craterSize, type CraterSettings } from "../core/forces/craterize";
import { ERUPT_DEFAULTS, ERUPT_SIZE_MAX, ERUPT_SIZE_MIN, naturalBreadth, type EruptSettings } from "../core/forces/erupt";
import { QUAKE_DEFAULTS, slideTiles, type QuakeSettings } from "../core/forces/quake";
import { GLACIATE_DEFAULTS, GLACIATE_SIZE_MAX, GLACIATE_SIZE_MIN, sizeOf as glacierSize, type GlaciateSettings } from "../core/forces/glaciate/model";
import { forcePowerWord, type ForceStatus } from "./forceDriver";
import { ForceOptions, SizeControl, Toggle, type Force } from "./TopBar";

/** What the player set for the next impact (kept for the visit). */
export interface CraterUi {
  power: number;
  size: number | null;
}
export const DEFAULT_CRATER: CraterUi = { power: CRATER_DEFAULTS.power, size: CRATER_DEFAULTS.size };

export interface EruptUi {
  power: number;
  /** Its breadth, tiles across, or null: it follows Power (D226). */
  size: number | null;
}
export const DEFAULT_ERUPT: EruptUi = { power: ERUPT_DEFAULTS.power, size: null };

export interface QuakeUi {
  mode: "lift" | "slide";
  power: number;
  /** The side of the stroke that moves: 1 its left, -1 its right (X flips it). */
  side: 1 | -1;
}
export const DEFAULT_QUAKE: QuakeUi = { mode: QUAKE_DEFAULTS.mode, power: QUAKE_DEFAULTS.power, side: 1 };

export interface GlaciateUi {
  power: number;
  /** The trough's width in tiles, or null: it follows Power (D226). */
  size: number | null;
  meltwater: boolean;
}
export const DEFAULT_GLACIATE: GlaciateUi = { power: GLACIATE_DEFAULTS.power, size: GLACIATE_DEFAULTS.size, meltwater: GLACIATE_DEFAULTS.meltwater };

/** A new series' settings (its first personality: the prototypes' own default seeds). The choices
 *  the rows don't show are placeholders the worker draws from the land and the seed (D289); the
 *  gesture sets the mode: `aimed` a dragged, glancing impact; `fissure` a painted fissure. */
export const craterSettingsOf = (u: CraterUi, aimed = false): CraterSettings => ({ ...CRATER_DEFAULTS, mode: aimed ? "aim" : "strike", power: u.power, size: u.size, seed: CRATER_DEFAULTS.seed });
export const eruptSettingsOf = (u: EruptUi, fissure = false): EruptSettings => ({ ...ERUPT_DEFAULTS, mode: fissure ? "fissure" : "vent", power: u.power, size: u.size, seed: ERUPT_DEFAULTS.seed });
export const quakeSettingsOf = (u: QuakeUi): QuakeSettings => ({ mode: u.mode, power: u.power, scarp: QUAKE_DEFAULTS.scarp, seed: QUAKE_DEFAULTS.seed });
/** (A glacier's mode is its gesture's: the worker sets it, D258.) */
export const glaciateSettingsOf = (u: GlaciateUi): GlaciateSettings => ({ mode: "flow", power: u.power, size: u.size, meltwater: u.meltwater, seed: GLACIATE_DEFAULTS.seed });

/** A force at work: what it is doing, and Revert (Esc). */
export function ForceAtWork(p: { force: Force; status: ForceStatus; onRevert(): void }) {
  const st = p.status;
  const doing = p.force.id === "craterize" ? "Striking…" : p.force.id === "erupt" ? "Erupting…" : p.force.id === "glaciate" ? "The ice is moving…" : st.painting ? "Paint the fault; let go to keep it (X flips the side that moves)" : "The ground is moving…";
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

function Power(p: { verb: "craterize" | "erupt" | "quake" | "glaciate"; value: number; onChange(v: number): void; title: string }) {
  const word = forcePowerWord(p.verb, p.value);
  return (
    <label class="slider-field" title={p.title}>
      Power
      <input type="range" min={0} max={100} step={5} aria-label="Power" aria-valuetext={`${p.value}, ${word}`} value={p.value} onInput={(e) => p.onChange(Number((e.target as HTMLInputElement).value))} />
      <output>{word}</output>
    </label>
  );
}

function Again(p: { show: boolean; onAgain(): void; what: string }) {
  return p.show ? (
    <button type="button" onClick={p.onAgain} title={`The same ${p.what} from the same land, another way, with another character (it replaces the last one)`}>
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
  return (
    <ForceOptions force={p.force}>
      <Power verb="craterize" value={u.power} onChange={(power) => set({ power })} title="How hard it hits: deeper, wider, with more debris" />
      <SizeControl
        label="Size"
        title="The crater's width, in tiles (Auto: the size Power gives; a bigger crater is shallower for the same Power)"
        value={Math.round(size / 2) * 2}
        min={4}
        max={180}
        step={2}
        onChange={(v) => set({ size: v })}
        auto={{ on: u.size === null, onAuto: (on) => set({ size: on ? null : Math.round(size / 2) * 2 }) }}
      />
      <Again show={p.canAgain} onAgain={p.onAgain} what="impact" />
    </ForceOptions>
  );
}

export function EruptRow(p: RowProps<EruptUi>) {
  const u = p.ui;
  const set = (patch: Partial<EruptUi>) => p.onUi({ ...u, ...patch });
  const breadth = u.size ?? Math.max(ERUPT_SIZE_MIN, Math.min(ERUPT_SIZE_MAX, Math.round(naturalBreadth(eruptSettingsOf(u)) / 2) * 2));
  return (
    <ForceOptions force={p.force}>
      <Power verb="erupt" value={u.power} onChange={(power) => set({ power })} title="How high it throws: a small cone to a towering volcano" />
      <SizeControl
        label="Size"
        title="How broad the volcano spreads, in tiles across (Auto: the breadth Power gives)"
        value={breadth}
        min={ERUPT_SIZE_MIN}
        max={ERUPT_SIZE_MAX}
        step={2}
        onChange={(v) => set({ size: v })}
        auto={{ on: u.size === null, onAuto: (on) => set({ size: on ? null : breadth }) }}
      />
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
      <Again show={p.canAgain} onAgain={p.onAgain} what="quake" />
    </ForceOptions>
  );
}

/** Glaciate's row (D289): Power, Size, Meltwater and Try another; nothing else. */
export function GlaciateRow(p: RowProps<GlaciateUi>) {
  const u = p.ui;
  const set = (patch: Partial<GlaciateUi>) => p.onUi({ ...u, ...patch });
  const size = u.size ?? glacierSize(u);
  return (
    <ForceOptions force={p.force}>
      <Power verb="glaciate" value={u.power} onChange={(power) => set({ power })} title="How much ice: a deeper, longer valley" />
      <SizeControl
        label="Size"
        title="The valley's width, in tiles (Auto: the width Power gives)"
        value={Math.round(size / 2) * 2}
        min={GLACIATE_SIZE_MIN}
        max={GLACIATE_SIZE_MAX}
        step={2}
        onChange={(v) => set({ size: v })}
        auto={{ on: u.size === null, onAuto: (on) => set({ size: on ? null : Math.round(size / 2) * 2 }) }}
      />
      <Toggle label="Meltwater" title="Springs feed its river, its falls and its lakes; off, the valley is left dry" on={u.meltwater} onChange={(meltwater) => set({ meltwater })} />
      <Again show={p.canAgain} onAgain={p.onAgain} what="glacier" />
    </ForceOptions>
  );
}
