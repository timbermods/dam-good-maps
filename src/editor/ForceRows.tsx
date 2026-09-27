// The options rows of Craterize, Erupt and Quake (PLAN §20 D202, D203, D206, D219, D226, D289, D309):
// every force's row is Power, Size, at most one signature choice, Try another and a small More button
// for its other settings. Craterize: Power, Size (following Power, or set by hand), Try another; a
// click strikes, a drag aims a glancing blow. Erupt: Power, Size (its breadth), Try another; a click
// vents, a drag opens a fissure. Quake: its one choice, Lift or Slide, and Power (its drawn line sets
// its length); X flips the side that moves. More opens the rest of each force's character (Craterize's
// walls, centre, debris and rays; Erupt's shape, summit, flows and ridges; Quake's scarp), each on
// Auto (drawn from the land and the seed, core/forces/nature.ts) until the player sets one, which pins
// it with a small way back to Auto (D309; the controls themselves are back from before D289); Try
// another re-rolls only the details still on Auto. While a force is at work its row is its status and
// Revert (Esc). Carve's row is its own (CarveRow.tsx). Built from the shared bar styles (D176).

import { autoCentre, CRATER_DEFAULTS, naturalSize as craterSize, type CraterSettings } from "../core/forces/craterize";
import { autoSummit, ERUPT_DEFAULTS, ERUPT_SIZE_MAX, ERUPT_SIZE_MIN, naturalBreadth, type EruptSettings } from "../core/forces/erupt";
import { QUAKE_DEFAULTS, slideTiles, type QuakeSettings } from "../core/forces/quake";
import { forcePowerWord, type ForceStatus } from "./forceDriver";
import { AutoDetail, ForceOptions, MoreButton, MoreRow, Segmented, SizeControl, Toggle, type Force } from "./TopBar";

/** What the player set for the next impact (kept for the visit). Its details (walls, centre, debris,
 *  rays), behind More, start on Auto (null) until the player pins one (D309). */
export interface CraterUi {
  power: number;
  size: number | null;
  walls: "steep" | "terraced" | null;
  centre: CraterSettings["centre"] | null;
  debris: "light" | "heavy" | null;
  rays: boolean | null;
}
export const DEFAULT_CRATER: CraterUi = { power: CRATER_DEFAULTS.power, size: CRATER_DEFAULTS.size, walls: null, centre: null, debris: null, rays: null };

export interface EruptUi {
  power: number;
  /** Its breadth, tiles across, or null: it follows Power (D226). */
  size: number | null;
  /** A steep cone or a broad shield, or null: drawn from the land and the seed (D309). */
  shape: "steep" | "broad" | null;
  summit: EruptSettings["summit"] | null;
  flows: "light" | "heavy" | null;
  ridges: boolean | null;
}
export const DEFAULT_ERUPT: EruptUi = { power: ERUPT_DEFAULTS.power, size: null, shape: null, summit: null, flows: null, ridges: null };

export interface QuakeUi {
  mode: "lift" | "slide";
  power: number;
  /** The side of the stroke that moves: 1 its left, -1 its right (X flips it). */
  side: 1 | -1;
  /** Sheer or stepped, or null: drawn from the land and the seed (D309). */
  scarp: "sheer" | "stepped" | null;
}
export const DEFAULT_QUAKE: QuakeUi = { mode: QUAKE_DEFAULTS.mode, power: QUAKE_DEFAULTS.power, side: 1, scarp: null };

/** The row's current detail pins (D309), sent with Try another: `null` for a detail still on Auto
 *  (nature draws it again), or the value the player pinned (nature leaves it). */
export const craterDetails = (u: CraterUi): Record<string, unknown> => ({ walls: u.walls, centre: u.centre, debris: u.debris, rays: u.rays });
export const eruptDetails = (u: EruptUi): Record<string, unknown> => ({ shape: u.shape, summit: u.summit, flows: u.flows, ridges: u.ridges });
export const quakeDetails = (u: QuakeUi): Record<string, unknown> => ({ scarp: u.scarp });

/** A new series' settings (its first personality: the prototypes' own default seeds). The choices
 *  the rows don't show are drafts (D309): `null` where still on Auto, for nature.ts to draw once the
 *  force starts; the gesture sets the mode: `aimed` a dragged, glancing impact; `fissure` a painted
 *  fissure. */
export const craterSettingsOf = (u: CraterUi, aimed = false): CraterSettings => ({ mode: aimed ? "aim" : "strike", power: u.power, size: u.size, walls: u.walls, centre: u.centre, debris: u.debris, rays: u.rays, seed: CRATER_DEFAULTS.seed }) as CraterSettings;
export const eruptSettingsOf = (u: EruptUi, fissure = false): EruptSettings => ({ mode: fissure ? "fissure" : "vent", power: u.power, size: u.size, shape: u.shape, summit: u.summit, flows: u.flows, ridges: u.ridges, seed: ERUPT_DEFAULTS.seed }) as EruptSettings;
export const quakeSettingsOf = (u: QuakeUi): QuakeSettings => ({ mode: u.mode, power: u.power, scarp: u.scarp, seed: QUAKE_DEFAULTS.seed }) as QuakeSettings;

/** A force at work: what it is doing, and Revert (Esc). */
export function ForceAtWork(p: { force: Force; status: ForceStatus; onRevert(): void }) {
  const st = p.status;
  const doing = p.force.id === "craterize" ? "Striking…" : p.force.id === "erupt" ? "Erupting…" : st.painting ? "Paint the fault; let go to keep it (X flips the side that moves)" : "The ground is moving…";
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

function Again(p: { show: boolean; onAgain(): void; what: string }) {
  return p.show ? (
    <button type="button" onClick={p.onAgain} title={`The same ${p.what} from the same land, another way, with another character (it replaces the last one)`}>
      Try another
    </button>
  ) : null;
}

export interface RowProps<U, S> {
  force: Force;
  ui: U;
  onUi(u: U): void;
  /** Try another is there. */
  canAgain: boolean;
  onAgain(): void;
  /** More is open (D309): closed by default, remembered while it stays open. */
  more: boolean;
  onMore(open: boolean): void;
  /** The settings the last run actually ran with (D309): what an Auto detail shows until pinned. */
  drawn: S | null;
}

export function CraterizeRow(p: RowProps<CraterUi, CraterSettings>) {
  const u = p.ui;
  const set = (patch: Partial<CraterUi>) => p.onUi({ ...u, ...patch });
  const size = u.size ?? craterSize(u.power);
  const drawn = p.drawn;
  const walls = u.walls ?? drawn?.walls ?? "steep";
  const centreRaw = u.centre ?? drawn?.centre ?? "auto";
  const centre = centreRaw === "auto" ? autoCentre(size) : centreRaw;
  const debris = u.debris ?? drawn?.debris ?? "light";
  const rays = u.rays ?? drawn?.rays ?? false;
  return (
    <>
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
        <MoreButton open={p.more} onToggle={() => p.onMore(!p.more)} />
      </ForceOptions>
      {p.more ? (
        <MoreRow force={p.force}>
          <AutoDetail label="Walls" on={u.walls === null} onAuto={(on) => set({ walls: on ? null : walls })}>
            <label title="Steep: one cliff all round. Terraced: broad benches stepping down (Auto: drawn from the land and the seed)">
              Walls
              <select aria-label="Walls" value={walls} onChange={(e) => set({ walls: (e.target as HTMLSelectElement).value as Exclude<CraterUi["walls"], null> })}>
                <option value="steep">Steep</option>
                <option value="terraced">Terraced</option>
              </select>
            </label>
          </AutoDetail>
          <AutoDetail label="Centre" on={u.centre === null} onAuto={(on) => set({ centre: on ? null : centreRaw })}>
            <label title={`What stands in the middle (Auto: ${centre} for this size)`}>
              Centre
              <select aria-label="Centre" value={centreRaw} onChange={(e) => set({ centre: (e.target as HTMLSelectElement).value as Exclude<CraterUi["centre"], null> })}>
                <option value="auto">Auto</option>
                <option value="bowl">Bowl</option>
                <option value="peak">Peak</option>
                <option value="ring">Ring</option>
                <option value="flat">Flat</option>
              </select>
            </label>
          </AutoDetail>
          <AutoDetail label="Debris" on={u.debris === null} onAuto={(on) => set({ debris: on ? null : debris })}>
            <Segmented
              label="Debris"
              value={debris}
              onChange={(debris) => set({ debris })}
              options={[
                ["light", "Light debris", "A thin skirt of debris round the rim"],
                ["heavy", "Heavy debris", "A thick apron of debris thrown far round it"],
              ]}
            />
          </AutoDetail>
          <AutoDetail label="Rays" on={u.rays === null} onAuto={(on) => set({ rays: on ? null : rays })}>
            <Toggle label="Rays" title="Streaks of debris thrown out in a starburst" on={rays} onChange={(rays) => set({ rays })} />
          </AutoDetail>
        </MoreRow>
      ) : null}
    </>
  );
}

export function EruptRow(p: RowProps<EruptUi, EruptSettings>) {
  const u = p.ui;
  const set = (patch: Partial<EruptUi>) => p.onUi({ ...u, ...patch });
  const drawn = p.drawn;
  const shape = u.shape ?? drawn?.shape ?? "steep";
  const summitRaw = u.summit ?? drawn?.summit ?? "auto";
  const flows = u.flows ?? drawn?.flows ?? "heavy";
  const ridges = u.ridges ?? drawn?.ridges ?? true;
  // (the preview breadth needs a concrete shape and summit, same as before D289: naturalBreadth
  // branches on them, D226)
  const breadth = u.size ?? Math.max(ERUPT_SIZE_MIN, Math.min(ERUPT_SIZE_MAX, Math.round(naturalBreadth({ ...eruptSettingsOf(u), shape, summit: summitRaw }) / 2) * 2));
  return (
    <>
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
        <MoreButton open={p.more} onToggle={() => p.onMore(!p.more)} />
      </ForceOptions>
      {p.more ? (
        <MoreRow force={p.force}>
          <AutoDetail label="Shape" on={u.shape === null} onAuto={(on) => set({ shape: on ? null : shape })}>
            <Segmented
              label="Shape"
              value={shape}
              onChange={(shape) => set({ shape })}
              options={[
                ["steep", "Steep", "A tall, steep cone"],
                ["broad", "Broad", "A broad, gentle shield"],
              ]}
            />
          </AutoDetail>
          <AutoDetail label="Summit" on={u.summit === null} onAuto={(on) => set({ summit: on ? null : summitRaw })}>
            <label title={`Its top (Auto: ${summitRaw === "auto" ? autoSummit(u.power) : summitRaw} at this power)`}>
              Summit
              <select aria-label="Summit" value={summitRaw} onChange={(e) => set({ summit: (e.target as HTMLSelectElement).value as Exclude<EruptUi["summit"], null> })}>
                <option value="auto">Auto</option>
                <option value="peak">Peak</option>
                <option value="crater">Crater</option>
                <option value="caldera">Caldera</option>
              </select>
            </label>
          </AutoDetail>
          <AutoDetail label="Flows" on={u.flows === null} onAuto={(on) => set({ flows: on ? null : flows })}>
            <Segmented
              label="Flows"
              value={flows}
              onChange={(flows) => set({ flows })}
              options={[
                ["light", "Light flows", "Short lava flows"],
                ["heavy", "Heavy flows", "Long lava flows that can dam rivers"],
              ]}
            />
          </AutoDetail>
          <AutoDetail label="Ridges" on={u.ridges === null} onAuto={(on) => set({ ridges: on ? null : ridges })}>
            <Toggle label="Ridges" title="The flows set into ridges down its sides" on={ridges} onChange={(ridges) => set({ ridges })} />
          </AutoDetail>
        </MoreRow>
      ) : null}
    </>
  );
}

export function QuakeRow(p: RowProps<QuakeUi, QuakeSettings>) {
  const u = p.ui;
  const set = (patch: Partial<QuakeUi>) => p.onUi({ ...u, ...patch });
  const scarp = u.scarp ?? p.drawn?.scarp ?? "sheer";
  return (
    <>
      <ForceOptions force={p.force} mode={u.mode === "slide" ? "Slide" : "Lift"} onMode={(m) => set({ mode: m === "Slide" ? "slide" : "lift" })}>
        <Power verb="quake" value={u.power} onChange={(power) => set({ power })} title={u.mode === "slide" ? `How far the land slides: ${slideTiles(u.power)} tiles` : "How high the land lifts, and how far the shaking reaches"} />
        <Again show={p.canAgain} onAgain={p.onAgain} what="quake" />
        <MoreButton open={p.more} onToggle={() => p.onMore(!p.more)} />
      </ForceOptions>
      {p.more ? (
        <MoreRow force={p.force}>
          <AutoDetail label="Scarp" on={u.scarp === null} onAuto={(on) => set({ scarp: on ? null : scarp })}>
            <Segmented
              label="Scarp"
              value={scarp}
              onChange={(scarp) => set({ scarp })}
              options={[
                ["sheer", "Sheer", "One sheer cliff along the fault"],
                ["stepped", "Stepped", "Benches stepping down from the fault"],
              ]}
            />
          </AutoDetail>
        </MoreRow>
      ) : null}
    </>
  );
}
