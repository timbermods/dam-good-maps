// The options rows of Craterize, Erupt and Quake (PLAN §20 D202, D203, D206, D219, D226, D289, D309):
// every force's row is Power, Size, at most one signature choice, Try another and a small More button
// for its other settings. Craterize: Power, Size (following Power, or set by hand), Try another; a
// click strikes, and a drag strikes once where it began (D368 (7): a crater is one impact). Erupt: Power, Size (its breadth), Try another; a click
// vents, a drag opens a fissure. Quake: its one choice, Lift or Slide, and Power (its drawn line sets
// its length); V flips the side that moves. More opens the rest of each force's character (Craterize's
// walls, centre, debris and rays; Erupt's shape, summit, flows and ridges; Quake's scarp), each on
// Auto (drawn from the land and the seed, core/forces/nature.ts) until the player sets one, which pins
// it with a small way back to Auto (D309; the controls themselves are back from before D289); Try
// another re-rolls only the details still on Auto. While a force is at work its row is its status, the
// hint "Esc to skip · Ctrl+Z to undo" (D344, A4) and Revert. Glaciate: Power, Size and its one choice, Meltwater (a click Flows, a drag Aims),
// and behind More its benches, its steps, its tarn and its scree. Carve's row is its own (CarveRow.tsx). Built from the shared bar styles (D176).

import { CRATER_DEFAULTS, naturalSize as craterSize, type CraterSettings } from "../core/forces/craterize";
import { ERUPT_DEFAULTS, ERUPT_SIZE_MAX, ERUPT_SIZE_MIN, naturalBreadth, type EruptSettings } from "../core/forces/erupt";
import { QUAKE_DEFAULTS, slideTiles, type QuakeSettings } from "../core/forces/quake";
import { GLACIATE_DEFAULTS, GLACIATE_SIZE_MAX, GLACIATE_SIZE_MIN, sizeOf as glacierSize, type GlaciateSettings } from "../core/forces/glaciate/model";
import { RIFT_DEFAULTS, RIFT_SIZE_MAX, RIFT_SIZE_MIN, riftWidth, type RiftSettings } from "../core/forces/rift";
import { DEPOSIT_DEFAULTS, DEPOSIT_SIZE_MAX, DEPOSIT_SIZE_MIN, depositWidth, type DepositSettings } from "../core/forces/deposit";
import { type ForceStatus } from "./forceDriver";
import { FloorSetting, MODE_TITLES, SIZE_KEYS, STRENGTH_KEYS, type Force } from "./TopBar";
import { ButtonSetting, ChoiceSetting, NumberSetting, OnOffSetting, SettingsGrid, Words } from "./settings";
import { tip } from "../ui/Tooltip";

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
  /** The side of the stroke that moves: 1 its left, -1 its right (V flips it). */
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

export interface GlaciateUi {
  power: number;
  /** The trough's width in tiles, or null: it follows Power (D226). */
  size: number | null;
  meltwater: boolean;
  /** Its details (D309), each null while drawn from the land and the seed. */
  benches: "none" | "some" | "many" | null;
  steps: "few" | "some" | "many" | null;
  tarn: boolean | null;
  scree: boolean | null;
}
export const DEFAULT_GLACIATE: GlaciateUi = { power: GLACIATE_DEFAULTS.power, size: GLACIATE_DEFAULTS.size, meltwater: GLACIATE_DEFAULTS.meltwater, benches: null, steps: null, tarn: null, scree: null };
export const glaciateDetails = (u: GlaciateUi): Record<string, unknown> => ({ benches: u.benches, steps: u.steps, tarn: u.tarn, scree: u.scree });

export interface RiftUi {
  power: number;
  /** How wide it drops, tiles across, or null: it follows Power. */
  size: number | null;
  /** Sheer or stepped walls, or null: the land decides. */
  walls: "sheer" | "stepped" | null;
}
export const DEFAULT_RIFT: RiftUi = { power: RIFT_DEFAULTS.power, size: null, walls: null };
export const riftDetails = (u: RiftUi): Record<string, unknown> => ({ walls: u.walls });

export interface DepositUi {
  power: number;
  /** How broad the fan spreads, tiles across, or null: it follows Power. */
  size: number | null;
  /** Few or many channels, or null: the land decides. */
  channels: "few" | "many" | null;
}
export const DEFAULT_DEPOSIT: DepositUi = { power: DEPOSIT_DEFAULTS.power, size: null, channels: null };
export const depositDetails = (u: DepositUi): Record<string, unknown> => ({ channels: u.channels });

/** A new series' settings (its first personality: the prototypes' own default seeds). The choices
 *  the rows don't show are drafts (D309): `null` where still on Auto, for nature.ts to draw once the
 *  force starts; the gesture sets the mode: `aimed` a glancing impact (no gesture of the editor's
 *  makes one since D368 (7); the engine keeps it for the operations already saved); `fissure` a
 *  painted fissure. */
export const craterSettingsOf = (u: CraterUi, aimed = false): CraterSettings => ({ mode: aimed ? "aim" : "strike", power: u.power, size: u.size, walls: u.walls, centre: u.centre, debris: u.debris, rays: u.rays, seed: CRATER_DEFAULTS.seed }) as CraterSettings;
export const eruptSettingsOf = (u: EruptUi, fissure = false): EruptSettings => ({ mode: fissure ? "fissure" : "vent", power: u.power, size: u.size, shape: u.shape, summit: u.summit, flows: u.flows, ridges: u.ridges, seed: ERUPT_DEFAULTS.seed }) as EruptSettings;
export const quakeSettingsOf = (u: QuakeUi): QuakeSettings => ({ mode: u.mode, power: u.power, scarp: u.scarp, seed: QUAKE_DEFAULTS.seed }) as QuakeSettings;
/** (A glacier's mode is its gesture's: the worker sets it, D258; its details as the row has them, D309.) */
export const glaciateSettingsOf = (u: GlaciateUi): GlaciateSettings => ({ mode: "flow", power: u.power, size: u.size, meltwater: u.meltwater, benches: u.benches, steps: u.steps, tarn: u.tarn, scree: u.scree, seed: GLACIATE_DEFAULTS.seed }) as GlaciateSettings;

/** A rift's and a deposit's settings (their gesture's line is the worker's; Auto is the land's: "auto"). */
export const riftSettingsOf = (u: RiftUi): RiftSettings => ({ ...RIFT_DEFAULTS, power: u.power, size: u.size, walls: u.walls ?? "auto" });
export const depositSettingsOf = (u: DepositUi): DepositSettings => ({ ...DEPOSIT_DEFAULTS, power: u.power, size: u.size, channels: u.channels ?? "auto" });

/** A force at work: what it is doing, the keys (Esc skips it to its end, Ctrl+Z takes it back; a painted
 *  Lift still drawn: Esc cancels it), and Revert. */
export function ForceAtWork(p: { force: Force; status: ForceStatus; onRevert(): void }) {
  const st = p.status;
  const doing = p.force.id === "craterize" ? "Striking…" : p.force.id === "erupt" ? "Erupting…" : p.force.id === "glaciate" ? "The ice is moving…" : p.force.id === "deposit" ? "Sediment is settling…" : st.painting ? "Paint the fault, then let go to keep it" : "The ground is moving…";
  return (
    <SettingsGrid
      label={`${p.force.name} at work`}
      groups={[
        { key: "status", row: 1, at: 1, span: 11, rows: 2, centre: true, node: <Words status>{st.stopping ? "Settling…" : doing}</Words> },
        {
          key: "revert",
          row: 1,
          at: 12,
          span: 2,
          rows: 2,
          centre: true,
          node: (
            <button type="button" class="set-button" onClick={p.onRevert} {...(st.painting && !st.stopping ? tip("Take the fault back", "Esc") : tip("Take all of it back", "Ctrl+Z", "Esc skips to its end"))}>
              Revert
            </button>
          ),
        },
      ]}
    />
  );
}

function power(verb: "craterize" | "erupt" | "quake" | "glaciate" | "rift" | "deposit", value: number, onChange: (v: number) => void, title: string) {
  return <NumberSetting label="Power" title={title} keys={STRENGTH_KEYS} value={value} words={String(value)} min={0} max={100} step={5} onChange={onChange} />;
}

/** Try another: always in its place, ready once a run is kept. */
function again(p: { canAgain: boolean; onAgain(): void }, what: string) {
  return <ButtonSetting label="Try another" title={`Another ${what}, same land`} disabled={!p.canAgain} onClick={p.onAgain} />;
}

/** A force's Size: following Power (Auto) until the player sets it. */
function size(label: string, title: string, value: number, words: string, min: number, max: number, step: number, auto: boolean, onSize: (v: number | null) => void) {
  return <NumberSetting label={label} title={title} keys={SIZE_KEYS} value={value} words={words} min={min} max={max} step={step} onChange={(v) => onSize(v)} auto={{ on: auto, onAuto: (on) => onSize(on ? null : value), title: auto ? `${label} follows Power` : `Let the ${label.toLowerCase()} follow Power`, follows: "Power" }} />;
}

export interface RowProps<U, S> {
  force: Force;
  ui: U;
  onUi(u: U): void;
  /** Try another is there. */
  canAgain: boolean;
  onAgain(): void;
  /** The settings the last run actually ran with (D309): what an Auto detail shows until pinned. */
  drawn: S | null;
}

export function CraterizeRow(p: RowProps<CraterUi, CraterSettings>) {
  const u = p.ui;
  const set = (patch: Partial<CraterUi>) => p.onUi({ ...u, ...patch });
  const sz = u.size ?? craterSize(u.power);
  const drawn = p.drawn;
  const walls = u.walls ?? drawn?.walls ?? "steep";
  const centre = u.centre ?? drawn?.centre ?? "auto";
  const debris = u.debris ?? drawn?.debris ?? "light";
  const rays = u.rays ?? drawn?.rays ?? false;
  return (
    <SettingsGrid
      label="Craterize options"
      groups={[
        { key: "power", row: 1, at: 1, span: 3, node: power("craterize", u.power, (v) => set({ power: v }), "How hard it hits") },
        { key: "size", row: 1, at: 4, span: 3, node: size("Size", "The crater's width", Math.round(sz / 2) * 2, String(Math.round(sz / 2) * 2), 4, 180, 2, u.size === null, (v) => set({ size: v })) },
        {
          key: "walls",
          row: 1,
          at: 7,
          span: 3,
          node: (
            <ChoiceSetting<"steep" | "terraced">
              label="Walls"
              value={walls}
              options={[
                ["steep", "Steep", "Steep walls"],
                ["terraced", "Terraced", "Terraced walls"],
              ]}
              onChange={(v) => set({ walls: v })}
              auto={{ on: u.walls === null, onAuto: (on) => set({ walls: on ? null : walls }) }}
            />
          ),
        },
        {
          key: "centre",
          row: 1,
          at: 10,
          span: 4,
          node: (
            <ChoiceSetting<string>
              label="Centre"
              value={centre === "auto" ? null : centre}
              options={[
                ["bowl", "Bowl", "A bowl in the middle"],
                ["peak", "Peak", "A peak in the middle"],
                ["ring", "Ring", "A ring in the middle"],
                ["flat", "Flat", "A flat floor"],
              ]}
              onChange={(v) => set({ centre: v as CraterUi["centre"] })}
              auto={{ on: u.centre === null, onAuto: (on) => set({ centre: on ? null : centre }) }}
            />
          ),
        },
        {
          key: "debris",
          row: 2,
          at: 1,
          span: 3,
          node: (
            <ChoiceSetting<"light" | "heavy">
              label="Debris"
              value={debris}
              options={[
                ["light", "Light", "A thin skirt of debris"],
                ["heavy", "Heavy", "A thick apron of debris"],
              ]}
              onChange={(v) => set({ debris: v })}
              auto={{ on: u.debris === null, onAuto: (on) => set({ debris: on ? null : debris }) }}
            />
          ),
        },
        { key: "rays", row: 2, at: 4, span: 3, node: <OnOffSetting label="Rays" title="Streaks of debris" on={rays} onChange={(v) => set({ rays: v })} auto={{ on: u.rays === null, onAuto: (on) => set({ rays: on ? null : rays }) }} /> },
        { key: "floor", row: 2, at: 7, span: 4, node: <FloorSetting /> },
        { key: "again", row: 2, at: 11, span: 3, node: again(p, "impact") },
      ]}
    />
  );
}

export function EruptRow(p: RowProps<EruptUi, EruptSettings>) {
  const u = p.ui;
  const set = (patch: Partial<EruptUi>) => p.onUi({ ...u, ...patch });
  const drawn = p.drawn;
  const shape = u.shape ?? drawn?.shape ?? "steep";
  const summit = u.summit ?? drawn?.summit ?? "auto";
  const flows = u.flows ?? drawn?.flows ?? "heavy";
  const ridges = u.ridges ?? drawn?.ridges ?? true;
  // (the preview breadth needs a concrete shape and summit, same as before D289: naturalBreadth branches on them, D226)
  const breadth = u.size ?? Math.max(ERUPT_SIZE_MIN, Math.min(ERUPT_SIZE_MAX, Math.round(naturalBreadth({ ...eruptSettingsOf(u), shape, summit }) / 2) * 2));
  return (
    <SettingsGrid
      label="Erupt options"
      groups={[
        { key: "power", row: 1, at: 1, span: 3, node: power("erupt", u.power, (v) => set({ power: v }), "How high it throws") },
        { key: "size", row: 1, at: 4, span: 3, node: size("Size", "How broad it spreads", breadth, String(breadth), ERUPT_SIZE_MIN, ERUPT_SIZE_MAX, 2, u.size === null, (v) => set({ size: v })) },
        {
          key: "shape",
          row: 1,
          at: 7,
          span: 3,
          node: (
            <ChoiceSetting<"steep" | "broad">
              label="Shape"
              value={shape}
              options={[
                ["steep", "Steep", "A tall, steep cone"],
                ["broad", "Broad", "A broad, gentle shield"],
              ]}
              onChange={(v) => set({ shape: v })}
              auto={{ on: u.shape === null, onAuto: (on) => set({ shape: on ? null : shape }) }}
            />
          ),
        },
        {
          key: "summit",
          row: 1,
          at: 10,
          span: 4,
          node: (
            <ChoiceSetting<string>
              label="Summit"
              value={summit === "auto" ? null : summit}
              options={[
                ["peak", "Peak", "A peak at its top"],
                ["crater", "Crater", "A crater at its top"],
                ["caldera", "Caldera", "A caldera at its top"],
              ]}
              onChange={(v) => set({ summit: v as EruptUi["summit"] })}
              auto={{ on: u.summit === null, onAuto: (on) => set({ summit: on ? null : summit }) }}
            />
          ),
        },
        {
          key: "flows",
          row: 2,
          at: 1,
          span: 3,
          node: (
            <ChoiceSetting<"light" | "heavy">
              label="Flows"
              value={flows}
              options={[
                ["light", "Light", "Short lava flows"],
                ["heavy", "Heavy", "Long lava flows"],
              ]}
              onChange={(v) => set({ flows: v })}
              auto={{ on: u.flows === null, onAuto: (on) => set({ flows: on ? null : flows }) }}
            />
          ),
        },
        { key: "ridges", row: 2, at: 4, span: 3, node: <OnOffSetting label="Ridges" title="Ridges down its sides" on={ridges} onChange={(v) => set({ ridges: v })} auto={{ on: u.ridges === null, onAuto: (on) => set({ ridges: on ? null : ridges }) }} /> },
        { key: "floor", row: 2, at: 7, span: 4, node: <FloorSetting /> },
        { key: "again", row: 2, at: 11, span: 3, node: again(p, "eruption") },
      ]}
    />
  );
}

export function QuakeRow(p: RowProps<QuakeUi, QuakeSettings>) {
  const u = p.ui;
  const set = (patch: Partial<QuakeUi>) => p.onUi({ ...u, ...patch });
  const scarp = u.scarp ?? p.drawn?.scarp ?? "sheer";
  return (
    <SettingsGrid
      label="Quake options"
      groups={[
        {
          key: "mode",
          row: 1,
          at: 1,
          span: 4,
          node: (
            <ChoiceSetting<"lift" | "slide">
              label="Mode"
              value={u.mode === "slide" ? "slide" : "lift"}
              options={[
                ["lift", "Lift", MODE_TITLES.Lift],
                ["slide", "Slide", MODE_TITLES.Slide],
              ]}
              onChange={(v) => set({ mode: v })}
            />
          ),
        },
        { key: "power", row: 1, at: 5, span: 5, node: power("quake", u.power, (v) => set({ power: v }), u.mode === "slide" ? `How far it slides: ${slideTiles(u.power)} tiles` : "How high the land lifts") },
        {
          key: "side",
          row: 1,
          at: 10,
          span: 4,
          node: (
            <ChoiceSetting<1 | -1>
              label="Side"
              keys={["V"]}
              value={u.side}
              options={[
                [1, "Left", "The fault's left side moves"],
                [-1, "Right", "The fault's right side moves"],
              ]}
              onChange={(v) => set({ side: v })}
            />
          ),
        },
        {
          key: "scarp",
          row: 2,
          at: 1,
          span: 4,
          node: (
            <ChoiceSetting<"sheer" | "stepped">
              label="Scarp"
              value={scarp}
              options={[
                ["sheer", "Sheer", "One sheer cliff"],
                ["stepped", "Stepped", "Benches stepping down"],
              ]}
              onChange={(v) => set({ scarp: v })}
              auto={{ on: u.scarp === null, onAuto: (on) => set({ scarp: on ? null : scarp }) }}
            />
          ),
        },
        { key: "floor", row: 2, at: 5, span: 5, node: <FloorSetting /> },
        { key: "again", row: 2, at: 10, span: 4, node: again(p, "quake") },
      ]}
    />
  );
}

/** Glaciate's settings (D289, D309): Power, Size, Meltwater, its benches, its steps, its tarn and its scree, each
 *  detail on Auto until pinned. */
export function GlaciateRow(p: RowProps<GlaciateUi, GlaciateSettings>) {
  const u = p.ui;
  const set = (patch: Partial<GlaciateUi>) => p.onUi({ ...u, ...patch });
  const sz = u.size ?? glacierSize(u);
  const drawn = p.drawn;
  const benches = u.benches ?? drawn?.benches ?? "some";
  const steps = u.steps ?? drawn?.steps ?? "some";
  const tarn = u.tarn ?? drawn?.tarn ?? true;
  const scree = u.scree ?? drawn?.scree ?? true;
  return (
    <SettingsGrid
      label="Glaciate options"
      groups={[
        { key: "power", row: 1, at: 1, span: 3, node: power("glaciate", u.power, (v) => set({ power: v }), "How deep the ice carves") },
        { key: "size", row: 1, at: 4, span: 3, node: size("Size", "How wide the valley is", Math.round(sz / 2) * 2, String(Math.round(sz / 2) * 2), GLACIATE_SIZE_MIN, GLACIATE_SIZE_MAX, 2, u.size === null, (v) => set({ size: v })) },
        { key: "melt", row: 1, at: 7, span: 3, node: <OnOffSetting label="Meltwater" title="Springs, falls and lakes" on={u.meltwater} onChange={(v) => set({ meltwater: v })} /> },
        {
          key: "benches",
          row: 1,
          at: 10,
          span: 4,
          node: (
            <ChoiceSetting<"none" | "some" | "many">
              label="Benches"
              value={benches}
              options={[
                ["none", "None", "Sheer walls all along"],
                ["some", "Some", "Benches along some of the walls"],
                ["many", "Many", "Benches along most of the walls"],
              ]}
              onChange={(v) => set({ benches: v })}
              auto={{ on: u.benches === null, onAuto: (on) => set({ benches: on ? null : benches }) }}
            />
          ),
        },
        {
          key: "steps",
          row: 2,
          at: 1,
          span: 3,
          node: (
            <ChoiceSetting<"few" | "some" | "many">
              label="Steps"
              value={steps}
              options={[
                ["few", "Few", "Long level reaches, few steps"],
                ["some", "Some", "A step every so often"],
                ["many", "Many", "Short reaches, many steps"],
              ]}
              onChange={(v) => set({ steps: v })}
              auto={{ on: u.steps === null, onAuto: (on) => set({ steps: on ? null : steps }) }}
            />
          ),
        },
        { key: "tarn", row: 2, at: 4, span: 2, node: <OnOffSetting label="Tarn" title="A small lake at its head" on={tarn} onChange={(v) => set({ tarn: v })} auto={{ on: u.tarn === null, onAuto: (on) => set({ tarn: on ? null : tarn }) }} /> },
        { key: "scree", row: 2, at: 6, span: 2, node: <OnOffSetting label="Scree" title="Fallen rock at the walls' feet" on={scree} onChange={(v) => set({ scree: v })} auto={{ on: u.scree === null, onAuto: (on) => set({ scree: on ? null : scree }) }} /> },
        { key: "floor", row: 2, at: 8, span: 3, node: <FloorSetting /> },
        { key: "again", row: 2, at: 11, span: 3, node: again(p, "glacier") },
      ]}
    />
  );
}

/** Rift's settings (D352, D438): Power, Size and its walls, on Auto until pinned. */
export function RiftRow(p: RowProps<RiftUi, RiftSettings>) {
  const u = p.ui;
  const set = (patch: Partial<RiftUi>) => p.onUi({ ...u, ...patch });
  const sz = u.size ?? Math.round(riftWidth(u.power) / 2) * 2;
  const drawn = p.drawn?.walls;
  const walls = u.walls ?? (drawn === "sheer" || drawn === "stepped" ? drawn : null);
  return (
    <SettingsGrid
      label="Rift options"
      groups={[
        { key: "power", row: 1, at: 1, span: 4, node: power("rift", u.power, (v) => set({ power: v }), "How far the land drops") },
        { key: "size", row: 1, at: 5, span: 4, node: size("Size", "How wide it opens", sz, String(sz), RIFT_SIZE_MIN, RIFT_SIZE_MAX, 2, u.size === null, (v) => set({ size: v })) },
        {
          key: "walls",
          row: 1,
          at: 9,
          span: 5,
          node: (
            <ChoiceSetting<"sheer" | "stepped">
              label="Walls"
              value={walls}
              options={[
                ["sheer", "Sheer", "Sheer walls"],
                ["stepped", "Stepped", "Ledges stepping down"],
              ]}
              onChange={(v) => set({ walls: v })}
              auto={{ on: u.walls === null, onAuto: (on) => set({ walls: on ? null : (walls ?? "sheer") }) }}
            />
          ),
        },
        { key: "floor", row: 2, at: 1, span: 8, node: <FloorSetting /> },
        { key: "again", row: 2, at: 9, span: 5, node: again(p, "rift") },
      ]}
    />
  );
}

/** Deposit's settings (D352, D438): Power, Size and its channels, on Auto until pinned. */
export function DepositRow(p: RowProps<DepositUi, DepositSettings>) {
  const u = p.ui;
  const set = (patch: Partial<DepositUi>) => p.onUi({ ...u, ...patch });
  const sz = u.size ?? Math.round(depositWidth(u.power) / 2) * 2;
  const drawn = p.drawn?.channels;
  const channels = u.channels ?? (drawn === "few" || drawn === "many" ? drawn : null);
  return (
    <SettingsGrid
      label="Deposit options"
      groups={[
        { key: "power", row: 1, at: 1, span: 4, node: power("deposit", u.power, (v) => set({ power: v }), "How much sediment it lays") },
        { key: "size", row: 1, at: 5, span: 4, node: size("Size", "How far the fan spreads", sz, String(sz), DEPOSIT_SIZE_MIN, DEPOSIT_SIZE_MAX, 2, u.size === null, (v) => set({ size: v })) },
        {
          key: "channels",
          row: 1,
          at: 9,
          span: 5,
          node: (
            <ChoiceSetting<"few" | "many">
              label="Channels"
              value={channels}
              options={[
                ["few", "Few", "A few channels across the fan"],
                ["many", "Many", "Many channels across the fan"],
              ]}
              onChange={(v) => set({ channels: v })}
              auto={{ on: u.channels === null, onAuto: (on) => set({ channels: on ? null : (channels ?? "few") }) }}
            />
          ),
        },
        { key: "floor", row: 2, at: 1, span: 8, node: <FloorSetting /> },
        { key: "again", row: 2, at: 9, span: 5, node: again(p, "fan") },
      ]}
    />
  );
}
