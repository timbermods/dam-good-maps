// Carve's options row (PLAN §20 D194, D199, D226, D289, D309): Power (a creek to a catastrophe), Size
// (how wide it cuts: following Power, or set by hand), its one choice, Keep river or Dry canyon, Try
// another path once a carve is kept, and a small More button for its other settings. More opens
// wander, walls, Canyon depth and Banks, each on Auto (drawn from the land and the seed,
// core/forces/nature.ts) until the player sets one, which pins it with a small way back to Auto (D309;
// the controls themselves are back from before D289), and River depth (D321 item 17: 2 unless set, or
// Off) beside Canyon depth (item 25). Try another re-rolls only the details still on Auto. The
// gesture decides the rest of how it runs: a click unleashes it where the cursor is, a drag aims it
// that way, cutting through rises on its way. While it runs, the row is Pause, the hint "Esc to skip ·
// Ctrl+Z to undo" (D344, A4) and Revert; it keeps itself when it ends. Built from the shared bar styles (D176).

import type { CarveSettings } from "../core/forces/carve/run";
import { naturalDepth, naturalWidth } from "../core/forces/carve/character";
import { BANKS_MAX, DEPTH_MAX, DEPTH_MIN } from "../core/forces/carve/run";
import { CEILING } from "../core/format/world";

import { wanderWord, type ForceStatus } from "./forceDriver";
import { FloorSetting, SIZE_KEYS, STRENGTH_KEYS, type Force } from "./TopBar";
import { ButtonSetting, ChoiceSetting, NumberSetting, SettingsGrid, Words } from "./settings";
import { SOURCES_DEFAULT, SourcesSetting, type ForceSources } from "./ForceRows";
import { tip } from "../ui/Tooltip";

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
  /** Canyon depth (item 25): levels below the land at most, or null: drawn from the land and the
   *  seed, or (still Auto and never yet run) the run's own default from Power and width (D309). */
  depth: number | null;
  /** River depth (D321, item 17): its water never deeper than this, or null: Off. */
  riverDepth: number | null;
  /** Banks (item 18): tiles of flat land each side, or null: drawn from the land and the seed. */
  banks: number | null;
  /** Sources it reaches: ride with the ground, or cleared (the default). */
  sources: ForceSources;
}

/** River depth's default (item 17): most of Timberborn's rivers are one or two levels deep. */
export const RIVER_DEPTH_DEFAULT = 2;

export const DEFAULT_CARVE: CarveUi = { power: 65, width: null, dry: false, wander: null, walls: null, depth: null, riverDepth: RIVER_DEPTH_DEFAULT, banks: null, sources: SOURCES_DEFAULT };

/** The row's current detail pins (D309), sent with Try another: `null` for a detail still on Auto
 *  (nature draws it again), or the value the player pinned (nature leaves it). */
export function carveDetails(u: CarveUi): Record<string, unknown> {
  return { wander: u.wander, walls: u.walls, depth: u.depth, banks: u.banks, riverDepth: u.riverDepth };
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
    riverDepth: u.riverDepth,
    banks: u.banks,
    seed: 0,
    walls: u.walls,
    sources: u.sources,
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
  /** The settings the last carve actually ran with (D309): what an Auto detail shows until pinned. */
  drawn: CarveSettings | null;
}

export function CarveRow(p: CarveRowProps) {
  const u = p.ui;
  const set = (patch: Partial<CarveUi>) => p.onUi({ ...u, ...patch });
  const st = p.status;
  if (st) {
    return (
      <SettingsGrid
        label="Carve at work"
        groups={[
          {
            key: "status",
            row: 1,
            at: 1,
            span: 9,
            rows: 2,
            centre: true,
            node: <Words status>{st.stopping ? "Keeping the carve…" : st.paused ? "Paused" : "Carving…"}</Words>,
          },
          {
            key: "pause",
            row: 1,
            at: 10,
            span: 2,
            rows: 2,
            centre: true,
            node: (
              <button type="button" class="set-button" disabled={st.stopping} onClick={p.onPause} {...tip(st.paused ? "Carry on" : "Hold it here", "Space")}>
                {st.paused ? "Resume" : "Pause"}
              </button>
            ),
          },
          {
            key: "revert",
            row: 1,
            at: 12,
            span: 2,
            rows: 2,
            centre: true,
            node: (
              <button type="button" class="set-button" onClick={p.onRevert} {...tip("Take all of it back", "Ctrl+Z", "Esc skips to its end")}>
                Revert
              </button>
            ),
          },
        ]}
      />
    );
  }
  const width = u.width ?? naturalWidth(u.power);
  const drawn = p.drawn;
  const wander = u.wander ?? drawn?.wander ?? 35;
  const walls = u.walls ?? drawn?.walls ?? "steep";
  const depth = u.depth ?? drawn?.depth ?? naturalDepth(u.power, width);
  const banks = u.banks ?? drawn?.banks ?? 0;
  const OFF = CEILING + 1;
  return (
    <SettingsGrid
      label="Carve options"
      groups={[
        {
          key: "power",
          row: 1,
          at: 1,
          span: 3,
          node: <NumberSetting label="Power" title="How hard it cuts" keys={STRENGTH_KEYS} value={u.power} words={String(u.power)} min={0} max={100} step={5} onChange={(power) => set({ power })} />,
        },
        {
          key: "size",
          row: 1,
          at: 4,
          span: 2,
          node: (
            <NumberSetting
              label="Size"
              title="How wide it cuts"
              keys={SIZE_KEYS}
              value={Math.round(width)}
              words={u.width === null ? width.toFixed(1) : String(u.width)}
              min={2}
              max={24}
              step={1}
              onChange={(v) => set({ width: v })}
              auto={{ on: u.width === null, onAuto: (on) => set({ width: on ? null : Math.round(width) }), title: u.width === null ? "Size follows Power" : "Let the size follow Power", follows: "Power" }}
            />
          ),
        },
        {
          key: "leaves",
          row: 1,
          at: 6,
          span: 2,
          node: (
            <ChoiceSetting<"river" | "canyon">
              label="What it leaves"
              value={u.dry ? "canyon" : "river"}
              options={[
                ["river", "River", "A river that keeps flowing"],
                ["canyon", "Canyon", "A dry canyon"],
              ]}
              onChange={(v) => set({ dry: v === "canyon" })}
            />
          ),
        },
        {
          key: "walls",
          row: 1,
          at: 8,
          span: 2,
          node: (
            <ChoiceSetting<"steep" | "wide">
              label="Walls"
              value={walls}
              options={[
                ["steep", "Steep", "Steep walls"],
                ["wide", "Wide", "Wide walls"],
              ]}
              onChange={(v) => set({ walls: v })}
              auto={{ on: u.walls === null, onAuto: (on) => set({ walls: on ? null : walls }) }}
            />
          ),
        },
        {
          key: "wander",
          row: 1,
          at: 10,
          span: 4,
          node: <NumberSetting label="Wander" title="How much it winds" value={wander} words={wanderWord(wander)} min={0} max={100} step={5} onChange={(v) => set({ wander: v })} auto={{ on: u.wander === null, onAuto: (on) => set({ wander: on ? null : wander }) }} />,
        },
        {
          key: "depth",
          row: 2,
          at: 1,
          span: 3,
          node: (
            <NumberSetting
              label="Canyon depth"
              title="How deep the canyon cuts"
              value={depth}
              min={DEPTH_MIN}
              max={DEPTH_MAX}
              step={1}
              onChange={(v) => set({ depth: v })}
              auto={{ on: u.depth === null, onAuto: (on) => set({ depth: on ? null : depth }) }}
            />
          ),
        },
        {
          key: "river",
          row: 2,
          at: 4,
          span: 2,
          node: (
            <NumberSetting
              label="River depth"
              title="How deep the river's water may be"
              value={u.riverDepth ?? OFF}
              words={u.riverDepth === null ? "Off" : String(u.riverDepth)}
              min={1}
              max={OFF}
              step={1}
              onChange={(v) => set({ riverDepth: v >= OFF ? null : v })}
            />
          ),
        },
        {
          key: "banks",
          row: 2,
          at: 6,
          span: 2,
          node: <NumberSetting label="Banks" title="Flat land beside the water" value={banks} words={banks ? String(banks) : "None"} min={0} max={BANKS_MAX} step={1} onChange={(v) => set({ banks: v })} auto={{ on: u.banks === null, onAuto: (on) => set({ banks: on ? null : banks }) }} />,
        },
        { key: "floor", row: 2, at: 8, span: 2, node: <FloorSetting /> },
        { key: "sources", row: 2, at: 10, span: 2, node: <SourcesSetting value={u.sources} onChange={(v) => set({ sources: v })} /> },
        { key: "again", row: 2, at: 12, span: 2, node: <ButtonSetting label="Try another" title="Carve it another way" disabled={!p.canAgain} onClick={p.onAgain} /> },
      ]}
    />
  );
}
