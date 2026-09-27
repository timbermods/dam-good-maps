// The top bar (PLAN §20 D184, D212): the shaping tools, Raise, Lower, Flatten, Smooth, Naturalize |
// Select (D259; with Delete it removes what stands in the selection, D288) | the forces, and a small
// row beneath with only the picked tool's options (the sources are on the left shelf). The brush's size is its ring on the land ([ and ]), its strength shows only
// while it changes (Shift+scroll, { and }); its size is also first in its row, a number and a
// slider (D226). The brush kit's toggles are off by default: square, precise (with "stop at" for a
// hold, D193), straight lines, Clear sources (D249: the sources a stroke passes over go with it);
// Flatten has "in steps" and its edges; Smooth has none (D247: the
// shelf's Slope puts a slope where wanted). Level lines are a view switch (D248). The forces (D194, D202, D203, D206: Carve, Craterize,
// Quake, Erupt; keys 7, 8, 9 and 0) are a group of their own on one shared core, each row Power,
// Size, at most one choice and Try another, the gesture deciding the rest (D289); all four are ready (D216, D219), and the public site shows none
// until their release (release.ts, D219). While a force is at work the other tools wait. A small
// More button at each row's end opens its other settings, each on Auto until pinned (`AutoDetail`,
// `MoreButton`, `MoreRow`, D309). Built from the shared bar and button styles (D176).

import type { ComponentChildren } from "preact";
import { BRUSHES, type BrushSettings, type BrushTool } from "./brushes";
import { BRUSH_MAX_LEVEL, BRUSH_SIZE_MAX, BRUSH_SIZE_MIN } from "../core/features/raster/brush";
import { forcesShownIn } from "./release";
import type { Verb } from "../core/forces/op";

const ICON = { width: 20, height: 20, viewBox: "0 0 20 20", "aria-hidden": "true" as const, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };

/** The tools' icons: an arrow up, an arrow down, a level line, a wave, a weathered peak; a river
 *  cut through a gorge, a crater and its falling star, a fault splitting the ground, a volcano; a
 *  dashed frame. */
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
export const FORCES: readonly Force[] = [
  { id: "carve", name: "Carve", ready: true, key: "7", hint: "unleash a river where you click, or drag the way it runs to aim it. Esc takes it back" },
  { id: "craterize", name: "Craterize", ready: true, key: "8", hint: "a giant impact where you click, or drag the way it travels for a glancing blow. Esc takes it back" },
  { id: "quake", name: "Quake", ready: true, modes: ["Lift", "Slide"], key: "9", hint: "paint a fault: one side lifts, or slides along it (X flips the side). Esc takes it back" },
  { id: "erupt", name: "Erupt", ready: true, key: "0", hint: "a volcano where you click, or drag to open a fissure. Esc takes it back" },
];

/** The forces this build shows: the ready ones, and none on the public site until their release
 *  (release.ts, D219). */
export const SHOWN_FORCES: readonly Force[] = forcesShownIn({ mode: import.meta.env.MODE, base: import.meta.env.BASE_URL }) ? FORCES.filter((f) => f.ready) : [];

/** This build shows the force `id`. */
export const forceShown = (id: string) => SHOWN_FORCES.some((f) => f.id === id);

/** A force's options row: its one choice first where it has one (Quake's Lift or Slide), then Power,
 *  Size and Try another (D289). */
export function ForceOptions(p: { force: Force; mode?: string; onMode?(mode: string): void; children?: ComponentChildren }) {
  return (
    <div class="map-bar options-row force-options" role="group" aria-label={`${p.force.name} options`}>
      {p.force.modes ? (
        <div class="segmented" role="group" aria-label="Mode">
          {p.force.modes.map((m) => (
            <button type="button" key={m} aria-pressed={p.mode === m} onClick={() => p.onMode?.(m)}>
              {m}
            </button>
          ))}
        </div>
      ) : null}
      {p.children ? <div class="bar-group">{p.children}</div> : null}
    </div>
  );
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
  /** The map is still loading: the tools wait until they can work. */
  loading?: boolean;
  /** A selection's own row (its size, its actions), when there is one. */
  selectRow?: ComponentChildren;
  /** With a brush or a force out while a selection is open: the Select row as a chip (D259). */
  selectChip?: ComponentChildren;
  /** The Select tool is open (its button, D259), and its button's click. */
  selecting?: boolean;
  onSelect?(): void;
  /** Another row beneath the bar: the shelf's object's options (a source's strength), a selected
   *  source's. */
  row?: { label: string; content: ComponentChildren } | null;
  /** The first run's hints, under the rows. */
  hints?: ComponentChildren;
}

/** A toggle in the options row: a checkbox and its word. */
export function Toggle(p: { label: string; title: string; on: boolean; onChange(on: boolean): void }) {
  return (
    <label class="check" title={p.title}>
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
  const words = p.words ?? String(p.value);
  return (
    <span class="size-control">
      <label class="slider-field" title={p.title}>
        {p.label}
        <input
          type="range"
          min={p.min}
          max={p.max}
          step={p.step}
          aria-label={p.label}
          aria-valuetext={p.auto?.on ? `${words}, following Power` : words}
          value={p.value}
          onInput={(e) => p.onChange(Number((e.target as HTMLInputElement).value))}
        />
        <output>{words}</output>
      </label>
      {p.auto ? (
        <button type="button" class="auto-button" aria-pressed={p.auto.on} aria-label={`${p.label} follows Power`} title={p.auto.on ? `${p.label} follows Power: move the slider to set it yourself` : `Let ${p.label.toLowerCase()} follow Power again`} onClick={() => p.auto!.onAuto(!p.auto!.on)}>
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
      <button type="button" class="auto-button" aria-pressed={p.on} aria-label={`${p.label} follows the land`} title={p.on ? `${p.label}: drawn from the land; set it yourself to pin it` : `Let ${p.label.toLowerCase()} be drawn from the land again`} onClick={() => p.onAuto(!p.on)}>
        Auto
      </button>
    </span>
  );
}

/** A force's More button (D309): closed by default, at the end of its row; its details sit in a
 *  second row of their own, the same shape as the first. */
export function MoreButton(p: { open: boolean; onToggle(): void }) {
  return (
    <button type="button" aria-expanded={p.open} onClick={p.onToggle} title={p.open ? "Hide its other settings" : "Its other settings: how it looks, drawn from the land unless you set them"}>
      {p.open ? "Less" : "More"}
    </button>
  );
}

/** A force's details row (D309): shown under its options row while More is open, the same shape. */
export function MoreRow(p: { force: Force; children: ComponentChildren }) {
  return (
    <div class="map-bar options-row force-options" role="group" aria-label={`${p.force.name} details`}>
      <div class="bar-group">{p.children}</div>
    </div>
  );
}

export function TopBar(p: TopBarProps) {
  const s = p.settings;
  const set = (patch: Partial<BrushSettings>) => p.onSettings({ ...s, ...patch });
  const t = p.active;
  const heaps = t === "raise" || t === "lower";
  // a force at work: the other tools wait until it is kept or taken back
  const off = p.loading || p.forceAtWork;
  const why = p.loading ? "The map is still loading" : "A force is at work: Stop keeps it, Esc takes it back";
  return (
    <div class="brush-bar-wrap">
      <div class="map-bar" role="toolbar" aria-label="Tools">
        {BRUSHES.map((b) => (
          <button
            type="button"
            key={b.tool}
            class="icon-button"
            aria-pressed={p.active === b.tool}
            aria-label={`${b.name} brush (${b.key})`}
            title={off ? why : `${b.name} (${b.key}): ${b.hint}`}
            disabled={off}
            onClick={() => p.onPick(p.active === b.tool ? null : b.tool)}
          >
            <Icon tool={b.tool} />
            <span class="icon-word">{b.name}</span>
          </button>
        ))}
        {p.onSelect ? (
          <button
            type="button"
            class="icon-button"
            aria-pressed={!!p.selecting}
            aria-label="Select (M)"
            title={off ? why : "Select (M): mark an area, then set it to a level, work only inside it, or press Delete to clear what stands there (Ctrl+A: the whole map)"}
            disabled={off}
            onClick={p.onSelect}
          >
            <Icon tool="select" />
            <span class="icon-word">Select</span>
          </button>
        ) : null}
        {SHOWN_FORCES.length ? (
          <>
            <span class="bar-divider" aria-hidden="true" />
            <span class="bar-group" role="group" aria-label="Forces">
              {SHOWN_FORCES.map((f) => (
                <button
                  type="button"
                  key={f.id}
                  class="icon-button"
                  aria-pressed={p.force === f.id}
                  aria-label={f.key ? `${f.name} (${f.key})` : f.name}
                  title={p.loading ? "The map is still loading" : `${f.name}${f.key ? ` (${f.key})` : ""}: ${f.hint ?? ""}`}
                  disabled={p.loading || (p.forceAtWork && p.force !== f.id)}
                  onClick={() => !p.forceAtWork && p.onPick(p.force === f.id ? null : (f.id as TopTool))}
                >
                  <Icon tool={f.id} />
                  <span class="icon-word">{f.name}</span>
                </button>
              ))}
            </span>
          </>
        ) : null}
      </div>
      {t ? (
        <div class="map-bar options-row" role="group" aria-label={`${BRUSHES.find((b) => b.tool === t)!.name} options`}>
          <div class="bar-group">
            <SizeControl label="Size" title="The brush's size, in tiles from its middle ([ and ] step it; hold F and drag to size it on the map)" value={s.size} min={BRUSH_SIZE_MIN} max={BRUSH_SIZE_MAX} step={0.5} onChange={(size) => set({ size })} />
            <Toggle label="Square" title="A square brush instead of a round one" on={s.square} onChange={(square) => set({ square })} />
            <Toggle label="Precise" title="Hard edges and straight walls, a level at a time: hold still to dig or build a level more" on={s.precise} onChange={(precise) => set({ precise })} />
            <Toggle label="Straight lines" title="The stroke runs straight from where you press to the pointer; its length shows beside it" on={s.straight} onChange={(straight) => set({ straight })} />
            <Toggle label="Clear sources" title="The water sources the brush passes over go with the stroke (they glow red under the ring first)" on={s.clearSources} onChange={(clearSources) => set({ clearSources })} />
            {t === "flatten" ? (
              <>
                <Toggle label="In steps" title="Terraces: benches every few levels from the flatten level" on={s.steps !== null} onChange={(on) => set({ steps: on ? 2 : null })} />
                {s.steps !== null ? (
                  <label>
                    every
                    <select aria-label="Steps apart" value={String(s.steps)} onChange={(e) => set({ steps: Number((e.target as HTMLSelectElement).value) })}>
                      {[2, 3, 4].map((k) => (
                        <option key={k} value={String(k)}>
                          {k} levels
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label title="Cliff: the flat ground ends in a step. Ramped: its rim steps down to the land round it, with the game's natural slopes, so beavers can walk up">
                  Edges
                  <select aria-label="Edges" value={s.ramped ? "ramped" : "cliff"} onChange={(e) => set({ ramped: (e.target as HTMLSelectElement).value === "ramped" })}>
                    <option value="cliff">Cliff</option>
                    <option value="ramped">Ramped</option>
                  </select>
                </label>
                <label title="The level it flattens to: Ctrl+click the map to pick one (on water, its bed)">
                  Level
                  <select aria-label="Flatten level" value={s.level === null ? "start" : String(s.level)} onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    set({ level: v === "start" ? null : Number(v) });
                  }}>
                    <option value="start">Where I start</option>
                    {Array.from({ length: BRUSH_MAX_LEVEL + 1 }, (_, k) => k).map((k) => (
                      <option key={k} value={String(k)}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {s.precise && heaps ? (
              <>
                <Toggle label="Stop at" title={`A hold stops at this level (a ${t === "lower" ? "floor" : "ceiling"}): Ctrl+click the map to pick it (on water, its bed)`} on={s.stop !== null} onChange={(on) => set({ stop: on ? (t === "lower" ? 2 : 10) : null })} />
                {s.stop !== null ? (
                  <label>
                    level
                    <select aria-label="Stop level" value={String(s.stop)} onChange={(e) => set({ stop: Number((e.target as HTMLSelectElement).value) })}>
                      {Array.from({ length: BRUSH_MAX_LEVEL + 1 }, (_, k) => k).map((k) => (
                        <option key={k} value={String(k)}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {p.force && p.forceRow ? p.forceRow : null}
      {p.row ? (
        <div class="map-bar options-row" role="group" aria-label={p.row.label}>
          <div class="bar-group">{p.row.content}</div>
        </div>
      ) : null}
      {p.selectRow ? (
        <div class="map-bar options-row" role="group" aria-label="Selection">
          {p.selectRow}
        </div>
      ) : null}
      {p.selectChip ? <div class="map-bar select-chip-bar">{p.selectChip}</div> : null}
      {p.hints ?? null}
    </div>
  );
}
