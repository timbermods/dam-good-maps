// The bar (PLAN §20 D184, D212; Layout 2): Select, the shaping tools, Raise, Lower, Flatten, Smooth, Naturalize, a
// hairline, then the forces (D194, D202, D203, D206, D246, D438: Carve, Craterize, Erupt, Rift, Quake, Deposit, Glaciate,
// Kyler 2026-10-06; keys 1 Select, 2–6 the brushes, Shift+1–7 the forces), and directly above it the held tool's settings (settings.tsx, Kyler's option B, 2026-10-03): one panel at
// the bar's width and one height for every tool, every setting always shown (More is gone). The brushes: Size, Level
// (Raise, Lower and Flatten's target, D322 item 37: Auto follows the ground, Free sculpts softly) or Strength
// (Smooth, Naturalize), Mode (item 2), Sources (item 31), Brush (round, square or straight lines, one at a time) and
// Flatten's Steps. A walkable edge is the shelf's Slope (D247, D322). Level lines are a view switch (D248). While a
// force is at work the other tools wait.

import { createContext, type ComponentChildren } from "preact";
import { useContext, useLayoutEffect, useRef } from "preact/hooks";
import { FirstRunSizer } from "./FirstRun";
import { FLOOR_MIN } from "../core/forces/floor";
import { CEILING } from "../core/format/world";
import { BRUSHES, hasTarget, type BrushMode, type BrushSettings, type BrushTool, type SourcesChoice } from "./brushes";
import { BRUSH_MAX_LEVEL, BRUSH_SIZE_MIN } from "../core/features/raster/brush";
import { forcesShownIn } from "./release";
import { tip } from "../ui/Tooltip";
import { ChoiceSetting, NumberSetting, SettingsGrid, type Group } from "./settings";
import type { Verb } from "../core/forces/op";

const ICON = { width: 20, height: 20, viewBox: "0 0 20 20", "aria-hidden": "true" as const, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };

/** The tools' icons: an arrow up, an arrow down, a level line, a wave, a weathered peak; a river
 *  cut through a gorge, a crater and its falling star, a fault splitting the ground, a volcano, a
 *  U-shaped valley under its ice; a dashed frame. */
function Icon({ tool }: { tool: BrushTool | "select" | Verb }) {
  switch (tool) {
    case "raise":
      return (
        <svg {...ICON}>
          <path d="M3 16h14M10 13V4M6 8l4-4 4 4" />
        </svg>
      );
    case "lower":
      return (
        <svg {...ICON}>
          <path d="M3 4h14M10 7v9M6 12l4 4 4-4" />
        </svg>
      );
    case "flatten":
      return (
        <svg {...ICON}>
          <path d="M2 10h16M4 6l2 2M16 6l-2 2M4 14l2-2M16 14l-2-2" />
        </svg>
      );
    case "smooth":
      return (
        <svg {...ICON}>
          <path d="M2 12c2.5-5 5-5 8 0s5.5 5 8 0" />
        </svg>
      );
    case "naturalize":
      return (
        <svg {...ICON}>
          <path d="M2 16l4-6 2 2 3-6 3 4 2-2 2 8" />
        </svg>
      );
    case "carve":
      return (
        <svg {...ICON}>
          <path d="M2 4l4 12M18 4l-4 12M11 3c-3 3 2 5-1 8s1 4 0 6" />
        </svg>
      );
    case "craterize":
      return (
        <svg {...ICON}>
          <path d="M2 14c2 0 3-3 8-3s6 3 8 3M5 14c1 2 3 3 5 3s4-1 5-3M13 2l-3 5M15 5l-2 1" />
        </svg>
      );
    case "quake":
      return (
        <svg {...ICON}>
          <path d="M2 11h5l2-3 2 5 2-3h5M3 15h4M13 15h4M3 7h3M14 7h3" />
        </svg>
      );
    case "erupt":
      return (
        <svg {...ICON}>
          <path d="M2 17l5-8h6l5 8M8 9l1-2h2l1 2M9 5c0-2 2-2 2-4M12 5c1-1 3-1 3-3" />
        </svg>
      );
    case "glaciate":
      return (
        <svg {...ICON}>
          <path d="M2 4c2 0 3 2 3 6s2 6 5 6 5-2 5-6 1-6 3-6M7 4c1 2 2 3 3 3s2-1 3-3" />
        </svg>
      );
    case "rift":
      return (
        <svg {...ICON}>
          <path d="M2 6h5l1 3 2-1 2 3 1-5h5M7 6v9h6V6M8 11l2 1 2-1" />
        </svg>
      );
    case "deposit":
      return (
        <svg {...ICON}>
          <path d="M10 3v5M10 8c-3 2-6 5-8 9M10 8c3 2 6 5 8 9M10 8c-1 3-2 6-2 9M10 8c1 3 2 6 2 9" />
        </svg>
      );
    case "select":
      return (
        <svg {...ICON}>
          <path d="M3 3h3M9 3h2M14 3h3v3M17 9v2M17 14v3h-3M11 17H9M6 17H3v-3M3 11V9M3 6V3" />
        </svg>
      );
  }
}

/** A tool the top bar picks. */
export type TopTool = BrushTool | Verb;

/** The forces (D203, D206): their slots in the bar, each hidden until it is ready. One shared core
 *  builds them once adopted; the bar needs only a force's name, whether it is ready, and its one
 *  signature choice where it has one (D289: the gesture decides the rest). */
export interface Force {
  id: Verb;
  name: string;
  ready: boolean;
  /** Its one choice as a switch that starts its options row (the first is the default): Quake's
   *  Lift or Slide. The others' click or drag is their mode (D289). */
  modes?: readonly [string, string];
  /** Its key, and what it does, for its button's title. */
  key?: string;
  hint?: string;
}
/** The forces row's order, by prominence (D352): three clusters in one row. A new player meets the most
 *  rewarding forces first: (1) the most prominent, immediately understood; (2) the ground breaking and
 *  moving; (3) the slower processes that reward experience. **The one list**: a force not adopted yet takes
 *  its place here when it arrives (it needs only its entry in `FORCES` below); the row, its clusters and
 *  the tooltips follow. */
export const FORCE_GROUPS: readonly (readonly string[])[] = [
  ["carve", "craterize", "erupt"],
  ["rift", "quake", "deposit"],
  // (Glaciate last: Kyler, 2026-10-06)
  ["glaciate", "erode"],
];

const FORCE_LIST: readonly Force[] = [
  // (the keys, Kyler 2026-10-06: Shift and the number of its place in the bar, matched on the key's code)
  { id: "carve", name: "Carve", ready: true, key: "Shift+1", hint: "carve a river" },
  { id: "craterize", name: "Craterize", ready: true, key: "Shift+2", hint: "an impact crater" },
  { id: "erupt", name: "Erupt", ready: true, key: "Shift+3", hint: "a volcano" },
  { id: "quake", name: "Quake", ready: true, modes: ["Lift", "Slide"], key: "Shift+5", hint: "a fault that lifts or slides the land" },
  { id: "glaciate", name: "Glaciate", ready: true, key: "Shift+7", hint: "a glacier carves a valley" },
  { id: "rift", name: "Rift", ready: true, key: "Shift+4", hint: "the land cracks open and drops" },
  { id: "deposit", name: "Deposit", ready: true, key: "Shift+6", hint: "a fan of sediment at a valley's mouth" },
];

/** The forces in the row's order (`FORCE_GROUPS`; one not listed there goes last). */
export const FORCES: readonly Force[] = [...FORCE_LIST].sort((a, b) => {
  const at = (f: Force) => {
    const g = FORCE_GROUPS.findIndex((grp) => grp.includes(f.id));
    return g < 0 ? [FORCE_GROUPS.length, 0] : [g, FORCE_GROUPS[g].indexOf(f.id)];
  };
  const [ag, ai] = at(a);
  const [bg, bi] = at(b);
  return ag - bg || ai - bi;
});

/** The forces this build shows: the ready ones, and none on the public site until their release
 *  (release.ts, D219). */
export const SHOWN_FORCES: readonly Force[] = forcesShownIn({ mode: import.meta.env.MODE, base: import.meta.env.BASE_URL }) ? FORCES.filter((f) => f.ready) : [];

/** The shown forces as the row's clusters (D352): one cluster per group that has a force shown. */
export const FORCE_CLUSTERS: readonly (readonly Force[])[] = FORCE_GROUPS.map((g) => SHOWN_FORCES.filter((f) => g.includes(f.id))).concat([SHOWN_FORCES.filter((f) => !FORCE_GROUPS.some((g) => g.includes(f.id)))]).filter((c) => c.length);

/** This build shows the force `id`. */
export const forceShown = (id: string) => SHOWN_FORCES.some((f) => f.id === id);

/** Quake's Lift or Slide, one line each (D351); V flips the side, its own setting (Side). */
export const MODE_TITLES: Record<string, string> = {
  Lift: "Lift one side of the fault",
  Slide: "Slide one side along the fault",
};

/** A phrase as a tooltip starts it. */
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A size's keys (D368 (1)): hold F and move the mouse, or { and }. */
export const SIZE_KEYS = ["F", "{", "}"] as const;
/** A strength's or a Power's keys (D368 (1)). */
export const STRENGTH_KEYS = ["F+scroll", "[", "]"] as const;

/** The tooltips of the tools, the forces and Select (D368 (6)): what it is for, then its key as a key cap. */
export const brushTip = (b: { hint: string; key: string }) => tip(capital(b.hint), b.key);
export const forceTip = (f: Force) => tip(capital(f.hint ?? f.name), f.key);
export const SELECT_TIP = tip("Mark an area to change", "1");

export interface TopBarProps {
  /** The brush out, or null. */
  active: BrushTool | null;
  settings: BrushSettings;
  onPick(tool: TopTool | null): void;
  /** The force picked (its id), its settings, and whether one is at work (the other tools wait). */
  force?: string | null;
  forceRow?: ComponentChildren;
  forceAtWork?: boolean;
  onSettings(s: BrushSettings): void;
  /** The largest brush this map takes: half its width (D322, item 42). */
  sizeMax?: number;
  /** The map is still loading: the tools wait until they can work. */
  loading?: boolean;
  /** Select's settings (its shapes; a selection's size and actions), when it is in hand. */
  selectRow?: ComponentChildren;
  /** With a brush or a force out while a selection is open: the working area, said above the panel (D259). */
  selectChip?: ComponentChildren;
  /** The Select tool is open (its button, D259), and its button's click. */
  selecting?: boolean;
  onSelect?(): void;
  /** Other settings above the bar: a source unleashed at work. */
  row?: { label: string; groups: Group[] } | null;
  /** The first run's hints, above the panel. */
  hints?: ComponentChildren;
  /** The messages (the editor's and the page's), centred above the hints and the settings: never over the bar. */
  notes?: ComponentChildren;
}

/** The forces' Floor (D321, item 40): one level every force that digs keeps to, set in any force's settings and
 *  shared by all of them; null when there is no editor to keep it. */
export const ForceFloor = createContext<{ value: number; set(v: number): void } | null>(null);

/** The Floor (D321, item 40): the lowest level a force cuts down to, 1 up to the height ceiling; a rule the player
 *  keeps, never Auto. */
export function FloorSetting() {
  const f = useContext(ForceFloor);
  if (!f) return null;
  return <NumberSetting label="Floor" title="The lowest level forces cut to" value={f.value} min={FLOOR_MIN} max={CEILING} step={1} onChange={(v) => f.set(v)} />;
}

/** The force at work's words while it plays (D344, A4); Esc and Ctrl+Z are in its buttons' tooltips. */
export const FORCE_KEYS = "Esc to skip · Ctrl+Z to undo";

/** The target's words for players coming from the game's editor (D322, item 37). */
const TARGET_TITLE: Record<"raise" | "lower" | "flatten", string> = {
  raise: "Raise to this level",
  lower: "Lower to this level",
  flatten: "Set to this level",
};

/** What a Level on Auto follows: the ground, a level above or below it. */
const FOLLOWS: Record<"raise" | "lower" | "flatten", string> = { raise: "+1", lower: "−1", flatten: "Ground" };

/** The brushes' settings on the bar's cells: Size, Level (Raise, Lower, Flatten) or Strength (Smooth, Naturalize),
 *  Mode; Sources, Brush, and Flatten's Steps. */
function brushGroups(t: BrushTool, s: BrushSettings, set: (patch: Partial<BrushSettings>) => void, sizeMax: number, lastLevel: { current: number }): Group[] {
  const size: Group = {
    key: "size",
    row: 1,
    at: 1,
    span: 4,
    node: <NumberSetting label="Size" title="The brush's size" keys={SIZE_KEYS} value={s.size} min={BRUSH_SIZE_MIN} max={sizeMax} step={0.5} onChange={(size) => set({ size })} />,
  };
  const free = t === "raise" || t === "lower";
  const FREE = BRUSH_MAX_LEVEL + 1;
  if (typeof s.target === "number") lastLevel.current = s.target;
  const second: Group = hasTarget(t)
    ? {
        key: "level",
        row: 1,
        at: 5,
        span: 5,
        node: (
          <NumberSetting
            label="Level"
            title={TARGET_TITLE[t]}
            keys={["Shift+scroll", "Ctrl+click"]}
            value={s.target === null ? lastLevel.current : s.target === "free" ? FREE : s.target}
            words={s.target === null ? FOLLOWS[t] : s.target === "free" ? "Free" : String(s.target)}
            min={0}
            max={free ? FREE : BRUSH_MAX_LEVEL}
            step={1}
            onChange={(v) => set({ target: free && v === FREE ? "free" : v })}
            auto={{ on: s.target === null, onAuto: (on) => set({ target: on ? null : lastLevel.current }), title: s.target === null ? "The level follows the ground" : "Let the level follow the ground", follows: "the ground" }}
          />
        ),
      }
    : {
        key: "strength",
        row: 1,
        at: 5,
        span: 5,
        node: <NumberSetting label="Strength" title={t === "smooth" ? "How strongly it smooths" : "How strongly it weathers"} keys={["Shift+scroll", "[", "]"]} value={s.strength} min={1} max={10} step={1} onChange={(strength) => set({ strength })} />,
      };
  const mode: Group = {
    key: "mode",
    row: 1,
    at: 10,
    span: 4,
    node: (
      <ChoiceSetting<BrushMode>
        label="Mode"
        value={s.modes[t]}
        options={[
          ["ground", "Ground", "Change only dry land"],
          ["water", "Water", "Change only the ground under water"],
          ["both", "Both", "Change everything"],
        ]}
        onChange={(m) => set({ modes: { ...s.modes, [t]: m } })}
      />
    ),
  };
  const flatten = t === "flatten";
  const sources: Group = {
    key: "sources",
    row: 2,
    at: 1,
    span: 4,
    node: (
      <ChoiceSetting<SourcesChoice>
        label="Sources"
        value={s.sources[t]}
        options={[
          ["ride", "Ride", "Sources move with the ground"],
          ["keep", "Keep", "Sources stay where they are"],
          ["clear", "Clear", "Remove the sources the brush passes"],
        ]}
        onChange={(v) => set({ sources: { ...s.sources, [t]: v } })}
      />
    ),
  };
  const shape = s.square ? "square" : s.straight ? "straight" : "round";
  const brush: Group = {
    key: "brush",
    row: 2,
    at: 5,
    span: flatten ? 5 : 9,
    node: (
      <ChoiceSetting<"round" | "square" | "straight">
        label="Brush"
        value={shape}
        options={[
          ["round", "Round", "A round brush"],
          ["square", "Square", "A square brush"],
          ["straight", "Lines", "Draw straight lines"],
        ]}
        onChange={(v) => set({ square: v === "square", straight: v === "straight" })}
      />
    ),
  };
  const groups = [size, second, mode, sources, brush];
  if (flatten)
    groups.push({
      key: "steps",
      row: 2,
      at: 10,
      span: 4,
      node: (
        <ChoiceSetting<number>
          label="Steps"
          value={s.steps ?? 0}
          options={[
            [0, "Off", "No terraces"],
            [2, "2", "A terrace every 2 levels"],
            [3, "3", "A terrace every 3 levels"],
            [4, "4", "A terrace every 4 levels"],
          ]}
          onChange={(v) => set({ steps: v ? v : null })}
        />
      ),
    });
  return groups;
}

export function TopBar(p: TopBarProps) {
  const s = p.settings;
  const set = (patch: Partial<BrushSettings>) => p.onSettings({ ...s, ...patch });
  const t = p.active;
  /** The level a Level last had by hand: where it comes back to off Auto. */
  const lastLevel = useRef(0);
  // a force at work: the other tools wait until it is kept or taken back
  const off = p.loading || p.forceAtWork;
  const why = p.loading ? tip("The map is still loading") : tip("A force is at work", "Esc skips it");
  // one panel, one grid at a time: the brush's, the force's, a source unleashed at work, or Select's
  const grid = t ? (
    <SettingsGrid label={`${BRUSHES.find((b) => b.tool === t)!.name} options`} groups={brushGroups(t, s, set, p.sizeMax ?? 24, lastLevel)} />
  ) : p.force && p.forceRow ? (
    p.forceRow
  ) : p.row ? (
    <SettingsGrid label={p.row.label} groups={p.row.groups} />
  ) : (
    (p.selectRow ?? null)
  );
  const button = (tool: BrushTool | "select" | Verb, name: string, label: string, pressed: boolean, title: ReturnType<typeof tip>, disabled: boolean | undefined, onClick: () => void) => (
    <button type="button" key={tool} class="icon-button" aria-pressed={pressed} aria-label={label} {...title} disabled={disabled} onClick={onClick}>
      <Icon tool={tool} />
      <span class="icon-word">{name}</span>
    </button>
  );
  // the hints' and the messages' one width: the hints' own with all three lines, in whole pixels, once the fonts are in
  const dock = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const d = dock.current;
    const sizer = d?.querySelector<HTMLElement>(".note-sizer");
    if (!d || !sizer) return;
    const set = () => d.style.setProperty("--note-w", `${Math.ceil(sizer.getBoundingClientRect().width)}px`);
    set();
    void document.fonts?.ready.then(set);
  }, []);
  return (
    <div class="tool-dock" ref={dock}>
      <FirstRunSizer />
      {p.notes ? <div class="dock-notes">{p.notes}</div> : null}
      {p.hints ?? null}
      {p.selectChip ? <div class="working-note">{p.selectChip}</div> : null}
      {grid ? <div class="map-bar tool-settings">{grid}</div> : null}
      <div class="map-bar tool-bar" role="toolbar" aria-label="Tools">
        {p.onSelect ? button("select", "Select", "Select (1)", !!p.selecting, off ? why : SELECT_TIP, off, p.onSelect) : null}
        {BRUSHES.map((b) => button(b.tool, b.name, `${b.name} brush (${b.key})`, p.active === b.tool, off ? why : brushTip(b), off, () => p.onPick(p.active === b.tool ? null : b.tool)))}
        {SHOWN_FORCES.length ? <span class="tool-sep" aria-hidden="true" /> : null}
        {SHOWN_FORCES.length ? (
          // (a group of its own, laid out on the bar's cells as if it weren't there)
          <span class="tool-group" role="group" aria-label="Forces">
            {SHOWN_FORCES.map((f) =>
              button(
                f.id,
                f.name,
                f.key ? `${f.name} (${f.key})` : f.name,
                p.force === f.id,
                p.loading ? tip("The map is still loading") : forceTip(f),
                p.loading || (p.forceAtWork && p.force !== f.id),
                () => !p.forceAtWork && p.onPick(p.force === f.id ? null : (f.id as TopTool)),
              ),
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
