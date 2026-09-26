// The top bar (PLAN §20 D184): Raise, Lower, Flatten, Smooth, Naturalize | Source | Remove, and a small row
// beneath with only the picked tool's options. The brush's size is its ring on the land ([ and ]),
// its strength shows only while it changes (Shift+scroll, { and }). The brush kit's toggles are off
// by default: square, precise (with "stop at" for a hold, D193), straight lines, level lines;
// Flatten has "in steps" and its edges, Smooth "make walkable". After Source come the forces (D194,
// D202, D203, D206: Carve, Craterize, Quake, Erupt), a group of their own on one shared core, each
// options row starting with its mode switch; each slot stays empty until Kyler says its prototype
// is ready (Carve is). While a force is at work the other tools wait. Built from the shared bar and
// button styles (D176).

import type { ComponentChildren } from "preact";
import { BRUSHES, type BrushSettings, type BrushTool } from "./brushes";
import type { RemoveKind } from "../core/features/objects";
import { forcesShownIn } from "./release";

const ICON = { width: 20, height: 20, viewBox: "0 0 20 20", "aria-hidden": "true" as const, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };

/** The tools' icons: an arrow up, an arrow down, a level line, a wave, a weathered peak; a drop; a
 *  river cut through a gorge; a cross. */
function Icon({ tool }: { tool: BrushTool | "source" | "remove" | "carve" }) {
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
    case "source":
      return (
        <svg {...ICON}>
          <path d="M10 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z" />
        </svg>
      );
    case "carve":
      return (
        <svg {...ICON}>
          <path d="M2 4l4 12M18 4l-4 12M11 3c-3 3 2 5-1 8s1 4 0 6" />
        </svg>
      );
    case "remove":
      return (
        <svg {...ICON}>
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      );
  }
}

/** A tool the top bar picks. */
export type TopTool = BrushTool | "source" | "remove" | "carve";

/** What Remove takes (its filters), and their words. */
export const REMOVE_KINDS: readonly [RemoveKind, string][] = [
  ["trees", "Trees"],
  ["bushes", "Bushes"],
  ["ruins", "Ruins"],
  ["objects", "Objects"],
  ["slopes", "Slopes"],
  ["sources", "Sources"],
];

/** The forces (D203, D206): their slots in the bar, each hidden until it is ready. One shared core
 *  builds them once adopted; the bar needs only a force's name, whether it is ready, and its modes:
 *  every force's options row starts with its mode switch. */
export interface Force {
  id: string;
  name: string;
  ready: boolean;
  /** The mode switch that starts its options row (the first mode is the default). */
  modes: readonly [string, string];
  /** Its key, and what it does, for its button's title. */
  key?: string;
  hint?: string;
}
export const FORCES: readonly Force[] = [
  { id: "carve", name: "Carve", ready: true, modes: ["Unleash", "Aim"], key: "7", hint: "unleash a river where you click, or aim it from one spot to another. Stop keeps it, Esc takes it back" },
  { id: "craterize", name: "Craterize", ready: false, modes: ["Strike", "Aim"] },
  { id: "quake", name: "Quake", ready: false, modes: ["Lift", "Slide"] },
  { id: "erupt", name: "Erupt", ready: false, modes: ["Vent", "Fissure"] },
];

/** The forces this build shows: the ready ones, and none on the public site until their release
 *  (release.ts, D219). */
export const SHOWN_FORCES: readonly Force[] = forcesShownIn({ mode: import.meta.env.MODE, base: import.meta.env.BASE_URL }) ? FORCES.filter((f) => f.ready) : [];

/** This build shows the force `id`. */
export const forceShown = (id: string) => SHOWN_FORCES.some((f) => f.id === id);

/** A force's options row: its mode switch first, then the force's own options. */
export function ForceOptions(p: { force: Force; mode: string; onMode(mode: string): void; children?: ComponentChildren }) {
  return (
    <div class="map-bar options-row" role="group" aria-label={`${p.force.name} options`}>
      <div class="segmented" role="group" aria-label="Mode">
        {p.force.modes.map((m) => (
          <button type="button" key={m} aria-pressed={p.mode === m} onClick={() => p.onMode(m)}>
            {m}
          </button>
        ))}
      </div>
      {p.children ? <div class="bar-group">{p.children}</div> : null}
    </div>
  );
}

export interface TopBarProps {
  /** The brush out, or null. */
  active: BrushTool | null;
  /** Source is picked. */
  source: boolean;
  /** Remove is picked, and what it takes. */
  remove: boolean;
  removeKinds: readonly RemoveKind[];
  onRemoveKinds(kinds: RemoveKind[]): void;
  settings: BrushSettings;
  onPick(tool: TopTool | null): void;
  /** The force picked (its id), its options row, and whether one is at work (the other tools wait). */
  force?: string | null;
  forceRow?: ComponentChildren;
  forceAtWork?: boolean;
  onSettings(s: BrushSettings): void;
  /** The map is still loading: the tools wait until they can work. */
  loading?: boolean;
  /** Source's options (clean or bad, its strength), from the editor's shared fields. */
  sourceOptions?: ComponentChildren;
  /** A selection's own row (its size, its actions), when there is one. */
  selectRow?: ComponentChildren;
  /** Another row beneath the bar: the shelf's object's options, a selected source's. */
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
        <span class="bar-divider" aria-hidden="true" />
        <button
          type="button"
          class="icon-button"
          aria-pressed={p.source}
          aria-label="Source (6)"
          title={off ? why : "Source (6): click where water starts. Over a source, Shift+scroll sets its strength; drag it to move it."}
          disabled={off}
          onClick={() => p.onPick(p.source ? null : "source")}
        >
          <Icon tool="source" />
          <span class="icon-word">Source</span>
        </button>
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
                  {f.id === "carve" ? <Icon tool="carve" /> : null}
                  <span class="icon-word">{f.name}</span>
                </button>
              ))}
            </span>
          </>
        ) : null}
        <span class="bar-divider" aria-hidden="true" />
        <button
          type="button"
          class="icon-button"
          aria-pressed={p.remove}
          aria-label="Remove (X)"
          title={off ? why : "Remove (X): click an object, or drag over many. It never changes the ground; the start stays."}
          disabled={off}
          onClick={() => p.onPick(p.remove ? null : "remove")}
        >
          <Icon tool="remove" />
          <span class="icon-word">Remove</span>
        </button>
      </div>
      {t ? (
        <div class="map-bar options-row" role="group" aria-label={`${BRUSHES.find((b) => b.tool === t)!.name} options`}>
          <div class="bar-group">
            <Toggle label="Square" title="A square brush instead of a round one" on={s.square} onChange={(square) => set({ square })} />
            <Toggle label="Precise" title="Hard edges and straight walls, a level at a time: hold still to dig or build a level more" on={s.precise} onChange={(precise) => set({ precise })} />
            <Toggle label="Straight lines" title="The stroke runs straight from where you press to the pointer; its length shows beside it" on={s.straight} onChange={(straight) => set({ straight })} />
            <Toggle label="Level lines" title="A thin line wherever the ground steps down a level" on={s.levelLines} onChange={(levelLines) => set({ levelLines })} />
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
                    {Array.from({ length: 17 }, (_, k) => k).map((k) => (
                      <option key={k} value={String(k)}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {t === "smooth" ? <Toggle label="Make walkable" title="Wear steps to one level and put the game's natural slopes on them, so beavers can walk up" on={s.walkable} onChange={(walkable) => set({ walkable })} /> : null}
            {s.precise && heaps ? (
              <>
                <Toggle label="Stop at" title={`A hold stops at this level (a ${t === "lower" ? "floor" : "ceiling"}): Ctrl+click the map to pick it (on water, its bed)`} on={s.stop !== null} onChange={(on) => set({ stop: on ? (t === "lower" ? 2 : 10) : null })} />
                {s.stop !== null ? (
                  <label>
                    level
                    <select aria-label="Stop level" value={String(s.stop)} onChange={(e) => set({ stop: Number((e.target as HTMLSelectElement).value) })}>
                      {Array.from({ length: 17 }, (_, k) => k).map((k) => (
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
      {p.remove ? (
        <div class="map-bar options-row" role="group" aria-label="Remove options">
          <div class="bar-group">
            {REMOVE_KINDS.map(([k, word]) => (
              <Toggle
                key={k}
                label={word}
                title={`Remove takes ${word.toLowerCase()}`}
                on={p.removeKinds.includes(k)}
                onChange={(on) => p.onRemoveKinds(on ? [...p.removeKinds, k] : p.removeKinds.filter((x) => x !== k))}
              />
            ))}
          </div>
        </div>
      ) : null}
      {p.row ? (
        <div class="map-bar options-row" role="group" aria-label={p.row.label}>
          <div class="bar-group">{p.row.content}</div>
        </div>
      ) : null}
      {p.source && p.sourceOptions ? (
        <div class="map-bar options-row" role="group" aria-label="Source options">
          <div class="bar-group">{p.sourceOptions}</div>
        </div>
      ) : null}
      {p.selectRow ? (
        <div class="map-bar options-row" role="group" aria-label="Selection">
          {p.selectRow}
        </div>
      ) : null}
      {p.hints ?? null}
    </div>
  );
}
