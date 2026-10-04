// The top bar (PLAN §20 D184, D212): the shaping tools, Raise, Lower, Flatten, Smooth, Naturalize |
// Select (D259; with Delete it removes what stands in the selection, D288) | the forces, and a small
// row beneath with only the picked tool's options (the sources are on the left shelf). The brush's
// size is its ring on the land ({ and }, hold F: D368 (1)), and first in its row, a number and a slider up to
// half the map (D226, D322 item 42). Raise, Lower and Flatten have a target level (D322, item 37),
// shown beside the pointer and in the row, as the game's editor: Shift+scroll or Ctrl+click sets it,
// Free (Raise and Lower) sculpts softly; Smooth and Naturalize's strength shows only while it changes
// (Shift+scroll, [ and ]). Every brush has its mode, Ground, Water or Both (item 2), and what it does
// to the sources it passes, Ride, Keep or Clear (item 31), each remembered per brush. The kit's
// toggles are off by default: square and straight lines; Flatten has "in steps". A walkable edge is
// the shelf's Slope (D247, D322). Level lines are a view switch (D248). The forces (D194, D202, D203, D206, D246: Carve, Craterize,
// Quake, Erupt, Glaciate; keys 7, 8, 9, 0 and -) are a group of their own on one shared core, each row Power,
// Size, at most one choice and Try another, the gesture deciding the rest (D289); all five are ready (D216, D219), and the public site shows none
// until their release (release.ts, D219). While a force is at work the other tools wait. A small
// More button at each row's end opens its other settings, each on Auto until pinned (`AutoDetail`,
// `MoreButton`, `MoreRow`, D309). Built from the shared bar and button styles (D176).

import { createContext, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { FLOOR_DEFAULT, FLOOR_MIN } from "../core/forces/floor";
import { CEILING } from "../core/format/world";
import { BRUSHES, hasTarget, type BrushMode, type BrushSettings, type BrushTool, type SourcesChoice } from "./brushes";
import { BRUSH_MAX_LEVEL, BRUSH_SIZE_MIN } from "../core/features/raster/brush";
import { forcesShownIn } from "./release";
import { tip } from "../ui/Tooltip";
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
  ["rift", "quake", "glaciate"],
  ["erode", "deposit"],
];

const FORCE_LIST: readonly Force[] = [
  { id: "carve", name: "Carve", ready: true, key: "7", hint: "carve a river" },
  { id: "craterize", name: "Craterize", ready: true, key: "8", hint: "an impact crater" },
  { id: "erupt", name: "Erupt", ready: true, key: "0", hint: "a volcano" },
  { id: "quake", name: "Quake", ready: true, modes: ["Lift", "Slide"], key: "9", hint: "a fault that lifts or slides the land" },
  { id: "glaciate", name: "Glaciate", ready: true, key: "-", hint: "a glacier carves a valley" },
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

/** What a force's mode switch does, one line each (D351), V's flip at its end (D368 (6)). */
const MODE_TITLES: Record<string, string> = {
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
export const SELECT_TIP = tip("Mark an area to change", "M");

/** A force's options row on the bar's cells (D289; Layout 2): Power 3, Size 3, its one choice 3 (What it leaves,
 *  Quake's Lift or Slide, Glaciate's Meltwater), then Try another and More 2; each in its place on every force, an
 *  empty place left empty. */
export function ForceOptions(p: {
  force: Force;
  mode?: string;
  onMode?(mode: string): void;
  power: ComponentChildren;
  size?: ComponentChildren;
  /** Its one choice, with its name. */
  choice?: { label: string; node: ComponentChildren };
  again?: ComponentChildren;
  more: ComponentChildren;
}) {
  const choice = p.force.modes
    ? {
        label: "Mode",
        node: (
          <div class="segmented" role="group" aria-label="Mode">
            {p.force.modes.map((m) => (
              <button type="button" key={m} aria-pressed={p.mode === m} {...tip(MODE_TITLES[m] ?? m, "V flips it")} onClick={() => p.onMode?.(m)}>
                {m}
              </button>
            ))}
          </div>
        ),
      }
    : p.choice;
  const cells: Cell[] = [{ key: "power", at: 1, span: 3, label: "Power", node: p.power }];
  if (p.size) cells.push({ key: "size", at: 4, span: 3, label: "Size", node: p.size });
  if (choice) cells.push({ key: "choice", at: 7, span: 3, label: choice.label, node: choice.node });
  cells.push({
    key: "more",
    at: 10,
    span: 2,
    node: (
      <span class="cell-end">
        {p.again}
        {p.more}
      </span>
    ),
  });
  return <CellRow label={`${p.force.name} options`} cells={cells} />;
}

export interface TopBarProps {
  /** The brush out, or null. */
  active: BrushTool | null;
  settings: BrushSettings;
  onPick(tool: TopTool | null): void;
  /** The force picked (its id), its options row, and whether one is at work (the other tools wait). */
  force?: string | null;
  forceRow?: ComponentChildren;
  forceAtWork?: boolean;
  onSettings(s: BrushSettings): void;
  /** The largest brush this map takes: half its width (D322, item 42). */
  sizeMax?: number;
  /** The map is still loading: the tools wait until they can work. */
  loading?: boolean;
  /** Select's rows (its shapes, the selection's size and actions), when it is in hand. */
  selectRow?: ComponentChildren;
  /** With a brush or a force out while a selection is open: the Select row as a chip (D259). */
  selectChip?: ComponentChildren;
  /** The Select tool is open (its button, D259), and its button's click. */
  selecting?: boolean;
  onSelect?(): void;
  /** Another row above the bar: the shelf's object's options (a source's strength), a selected
   *  source's, on the bar's cells. */
  row?: { label: string; cells: Cell[] } | null;
  /** The first run's hints, under the rows. */
  hints?: ComponentChildren;
}

// ------------------------------------------------------------------ the settings on the bar's cells
// Layout 2 (Kyler, 2026-10-03): the held tool's settings sit directly above the bar at its exact width, on a grid
// whose columns are the bar's cells: each group spans whole cells, its name above its control, on one row; more
// rows (More, a selection's actions) stack upward inside the panel, so the bar never moves.

/** The bar's cells: six tools, the hairline, five forces. */
export const BAR_CELLS = 11;
const TOOLS_CELLS = 6;
/** A cell's grid column: the hairline takes a column of its own after the tools. */
const column = (cell: number) => (cell <= TOOLS_CELLS ? cell : cell + 1);

/** A group on the grid: `span` whole cells from `at` (1–11; the next free cell when left out), its name above its
 *  control (none: the line is kept, so every control lines up). */
export interface Cell {
  key: string;
  span: number;
  at?: number;
  label?: string;
  /** Centred across its cells and down, with no name line (Select's instruction). */
  centre?: boolean;
  node: ComponentChildren;
}

/** The groups in rows of the bar's cells, in order; a group is never split, and one that doesn't fit starts the
 *  next row. */
export function cellRows(cells: readonly Cell[]): Cell[][] {
  const rows: Cell[][] = [[]];
  let next = 1;
  for (const c of cells) {
    let at = c.at ?? next;
    if (at + c.span - 1 > BAR_CELLS) {
      rows.push([]);
      at = 1;
    }
    rows[rows.length - 1].push({ ...c, at });
    next = at + c.span;
  }
  return rows.filter((r) => r.length);
}

/** One row of groups on the bar's cells (or several, the first lowest, when they don't fit on one). */
export function CellRow(p: { label?: string; cells: readonly Cell[] }) {
  return (
    <div class="cell-rows" role={p.label ? "group" : undefined} aria-label={p.label}>
      {cellRows(p.cells).map((row, k) => (
        <div class="cell-row" key={k}>
          {row.map((c) => (
            <div key={c.key} class={`cell-group${c.centre ? " centre" : ""}`} style={{ gridColumn: `${column(c.at!)} / ${column(c.at! + c.span - 1) + 1}` }}>
              {c.centre ? null : <span class="cell-head">{c.label ?? ""}</span>}
              <div class="cell-body">{c.node}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The hint line while a force plays (D344, A4): Esc skips it to its end, undo takes it back. */
export const FORCE_KEYS = "Esc to skip · Ctrl+Z to undo";

export function ForceKeys() {
  return (
    <span class="bar-status force-keys" title="Esc skips it, Ctrl+Z takes it back">
      {FORCE_KEYS}
    </span>
  );
}

/** A toggle in the options row: a checkbox and its word. */
export function Toggle(p: { label: string; title: string; on: boolean; onChange(on: boolean): void }) {
  return (
    <label class="check" {...tip(p.title)}>
      <input type="checkbox" checked={p.on} onChange={() => p.onChange(!p.on)} />
      {p.label}
    </label>
  );
}

/** A size on a slider with its number (D226): a brush's (hold F to drag it too), and each force's
 *  size, which follows Power (Auto, pressed) until the slider sets it by hand; Auto puts it back. */
export function SizeControl(p: {
  label: string;
  title: string;
  /** Its keys, as key caps at the end of its tooltip (D368 (6)). */
  keys?: readonly string[];
  value: number;
  min: number;
  max: number;
  step: number;
  /** What the number reads (the value, by default). */
  words?: string;
  onChange(v: number): void;
  /** A force's: it follows Power while `on`; `onAuto` switches. */
  auto?: { on: boolean; onAuto(on: boolean): void };
}) {
  // (always a number, D344 A2: on Auto, the number Power gives, as "Auto (68)")
  const number = p.words ?? String(p.value);
  const words = p.auto?.on ? `Auto (${number})` : number;
  return (
    <span class="size-control">
      <label class="slider-field" {...tip(p.title, ...(p.keys ?? []))}>
        <input
          type="range"
          min={p.min}
          max={p.max}
          step={p.step}
          aria-label={p.label}
          aria-valuetext={p.auto?.on ? `${number}, following Power` : number}
          value={p.value}
          onInput={(e) => p.onChange(Number((e.target as HTMLInputElement).value))}
        />
        <output>{words}</output>
      </label>
      {p.auto ? (
        <button type="button" class="auto-button" aria-pressed={p.auto.on} aria-label={`${p.label} follows Power`} title={p.auto.on ? `${p.label} follows Power` : `Let ${p.label.toLowerCase()} follow Power`} onClick={() => p.auto!.onAuto(!p.auto!.on)}>
          Auto
        </button>
      ) : null}
    </span>
  );
}

/** A switch between a few choices, side by side (a force's detail, D289's mode switches). */
export function Segmented<T extends string>(p: { label: string; value: T; options: readonly [T, string, string][]; onChange(v: T): void }) {
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

/** A force's detail behind More (D309): on Auto until pinned, with a small way back, the same idiom
 *  as Size's own Auto (D226) but for a choice drawn from the land instead of a number. */
export function AutoDetail(p: { label: string; on: boolean; onAuto(on: boolean): void; children: ComponentChildren }) {
  return (
    <span class="size-control">
      {p.children}
      <button type="button" class="auto-button" aria-pressed={p.on} aria-label={`${p.label} follows the land`} title={p.on ? `${p.label}: drawn from the land` : `Draw ${p.label.toLowerCase()} from the land`} onClick={() => p.onAuto(!p.on)}>
        Auto
      </button>
    </span>
  );
}

/** A force's More button (D309): closed by default, at the end of its row; its details sit in a
 *  second row of their own, the same shape as the first. */
export function MoreButton(p: { open: boolean; onToggle(): void }) {
  return (
    <button type="button" class="more-button" aria-expanded={p.open} onClick={p.onToggle} title={p.open ? "Hide the other settings" : "More settings"}>
      {p.open ? "Less" : "More"}
    </button>
  );
}

/** The forces' Floor (D321, item 40): one level every force that digs keeps to, set in any force's
 *  More and shared by all of them; null when there is no editor to keep it. */
export const ForceFloor = createContext<{ value: number; set(v: number): void } | null>(null);

/** The Floor in a force's More (D321, item 40): the lowest level it cuts down to, 1 up to the height
 *  ceiling; a rule, never Auto: set, it is kept (the player's editor preferences), and Default puts
 *  it back to 1. */
export function FloorControl() {
  const f = useContext(ForceFloor);
  if (!f) return null;
  return (
    <span class="size-control">
      <label class="slider-field" title="The lowest level forces cut to">
        <input type="range" min={FLOOR_MIN} max={CEILING} step={1} aria-label="Floor" value={f.value} onInput={(e) => f.set(Number((e.target as HTMLInputElement).value))} />
        <output>{f.value}</output>
      </label>
      {f.value !== FLOOR_DEFAULT ? (
        <button type="button" class="auto-button" aria-label="Floor back to 1" title="Back to level 1" onClick={() => f.set(FLOOR_DEFAULT)}>
          Default
        </button>
      ) : null}
    </span>
  );
}

/** A force's details (D309): shown above its options row while More is open, each three cells with its name above
 *  it, as many rows as they take; the forces' shared Floor ends them (D321, item 40). */
export function MoreRow(p: { force: Force; details: { label: string; span?: number; node: ComponentChildren }[] }) {
  const floor = useContext(ForceFloor);
  const all = [...p.details, ...(floor ? [{ label: "Floor", node: <FloorControl /> }] : [])];
  return <CellRow label={`${p.force.name} details`} cells={all.map((d) => ({ key: d.label, span: d.span ?? 3, label: d.label, node: d.node }))} />;
}

/** The target's words for players coming from the game's editor (D322, item 37). */
const TARGET_TITLE: Record<"raise" | "lower" | "flatten", string> = {
  raise: "Raise to this level",
  lower: "Lower to this level",
  flatten: "Set to this level",
};

export function TopBar(p: TopBarProps) {
  const s = p.settings;
  const set = (patch: Partial<BrushSettings>) => p.onSettings({ ...s, ...patch });
  const t = p.active;
  // a force at work: the other tools wait until it is kept or taken back
  const off = p.loading || p.forceAtWork;
  const why = p.loading ? tip("The map is still loading") : tip("A force is at work", "Esc skips it");
  const brushRows = t ? (
    <div class="cell-stack" role="group" aria-label={`${BRUSHES.find((b) => b.tool === t)!.name} options`}>
      {t === "flatten" ? (
        <CellRow
          cells={[
            {
              key: "steps",
              at: 9,
              span: 3,
              label: "Steps",
              node: (
                <>
                  <Toggle label="In steps" title="Terraces every few levels" on={s.steps !== null} onChange={(on) => set({ steps: on ? 2 : null })} />
                  {s.steps !== null ? (
                    <select aria-label="Steps apart" title="Levels between terraces" value={String(s.steps)} onChange={(e) => set({ steps: Number((e.target as HTMLSelectElement).value) })}>
                      {[2, 3, 4].map((k) => (
                        <option key={k} value={String(k)}>
                          every {k}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </>
              ),
            },
          ]}
        />
      ) : null}
      <CellRow
        cells={[
          {
            key: "size",
            at: 1,
            span: hasTarget(t) ? 1 : 4,
            label: "Size",
            node: <SizeControl label="Size" title="The brush's size" keys={SIZE_KEYS} value={s.size} min={BRUSH_SIZE_MIN} max={p.sizeMax ?? 24} step={0.5} onChange={(size) => set({ size })} />,
          },
          ...(hasTarget(t)
            ? [
                {
                  key: "level",
                  at: 2,
                  span: 3,
                  label: "Level",
                  node: (
                    <select
                      aria-label="Target level"
                      {...tip(TARGET_TITLE[t], "Shift+scroll", "Ctrl+click")}
                      value={s.target === null ? "follow" : String(s.target)}
                      onChange={(e) => {
                        const v = (e.target as HTMLSelectElement).value;
                        set({ target: v === "follow" ? null : v === "free" ? "free" : Number(v) });
                      }}
                    >
                      <option value="follow">{t === "flatten" ? "The ground's" : t === "raise" ? "A level above the ground" : "A level below the ground"}</option>
                      {Array.from({ length: BRUSH_MAX_LEVEL + 1 }, (_, k) => k).map((k) => (
                        <option key={k} value={String(k)}>
                          {k}
                        </option>
                      ))}
                      {t !== "flatten" ? <option value="free">Free</option> : null}
                    </select>
                  ),
                },
              ]
            : []),
          {
            key: "mode",
            at: 5,
            span: 2,
            label: "Mode",
            node: (
              <Segmented<BrushMode>
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
          },
          {
            key: "sources",
            at: 7,
            span: 2,
            label: "Sources",
            node: (
              <Segmented<SourcesChoice>
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
          },
          {
            key: "brush",
            at: 9,
            span: 3,
            label: "Brush",
            node: (
              <>
                <Toggle label="Square" title="A square brush" on={s.square} onChange={(square) => set({ square })} />
                <Toggle label="Straight lines" title="Draw straight lines" on={s.straight} onChange={(straight) => set({ straight })} />
              </>
            ),
          },
        ]}
      />
    </div>
  ) : null;
  const rows = [
    brushRows,
    p.force && p.forceRow ? p.forceRow : null,
    p.row ? <CellRow label={p.row.label} cells={p.row.cells} /> : null,
    p.selectRow ?? null,
    p.selectChip ? <CellRow label="Working area" cells={[{ key: "chip", at: 1, span: BAR_CELLS, centre: true, node: p.selectChip }]} /> : null,
  ].filter(Boolean);
  const button = (tool: BrushTool | "select" | Verb, name: string, label: string, pressed: boolean, title: ReturnType<typeof tip>, disabled: boolean | undefined, onClick: () => void) => (
    <button type="button" key={tool} class="icon-button" aria-pressed={pressed} aria-label={label} {...title} disabled={disabled} onClick={onClick}>
      <Icon tool={tool} />
      <span class="icon-word">{name}</span>
    </button>
  );
  return (
    <div class="tool-dock">
      {p.hints ?? null}
      {/* (later rows stack upward: the first sits on the bar) */}
      {rows.length ? <div class="map-bar options-row tool-settings">{rows}</div> : null}
      <div class="map-bar tool-bar" role="toolbar" aria-label="Tools">
        {p.onSelect ? button("select", "Select", "Select (M)", !!p.selecting, off ? why : SELECT_TIP, off, p.onSelect) : null}
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
