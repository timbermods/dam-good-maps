// The object window (Layout 2, Kyler's sitting, 2026-10-03): an object's settings in a small window directly above
// the objects list, its edges on the list's, the list's own panel look, each setting's name above its control as on
// the bar. It shows only while an object is picked (in the list to place, or on the map), and its height follows
// what that object has; the list itself never moves. A picked object's window ends with its Put it down (×).

import type { ComponentChildren } from "preact";
import { tip } from "../ui/Tooltip";

/** A number in the object window: the bar's own slider, its track filled to the value (EDITOR_PLAN §3: a number is a
 *  slider with its value, never a dropdown); the group's `value` says the value at the right of its name.
 *  `tipText` and `keys` are its tooltip (D351); `words` is the value as it reads, for a screen reader. */
export function ObjectSlider(p: { label: string; min: number; max: number; step: number; value: number; words: string; tipText: string; keys?: string[]; onInput(v: number): void }) {
  const fill = p.max > p.min ? Math.max(0, Math.min(100, ((p.value - p.min) / (p.max - p.min)) * 100)) : 0;
  return (
    <div class="slider-field">
      <input
        type="range"
        class="set-range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        aria-label={p.label}
        aria-valuetext={p.words}
        style={{ "--fill": `${fill}%` }}
        {...tip(p.tipText, ...(p.keys ?? []))}
        onInput={(e) => p.onInput(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}

/** A choice in the object window: the options side by side, the chosen one selected (never a dropdown). Each option
 *  is its value, its word, its tooltip and the key at its end, if it has one. */
export function ObjectChoice<T extends string | number>(p: { label: string; value: T; options: readonly (readonly [T, string, string, string?])[]; onPick(v: T): void }) {
  return (
    <div class="segmented" role="group" aria-label={p.label}>
      {p.options.map(([v, word, title, key]) => (
        <button type="button" key={String(v)} aria-pressed={p.value === v} {...tip(title, key)} onClick={() => p.onPick(v)}>
          {word}
        </button>
      ))}
    </div>
  );
}

/** One setting: its name above its control (none: the control alone, a row of buttons say). */
export interface ObjectGroup {
  key: string;
  label?: string;
  /** A number's value as it reads, at the right of its name (the bar's look: the name, its value, then the slider). */
  value?: string;
  node: ComponentChildren;
}

/** What the window holds for the object picked; `onClose` puts a picked object down (×). */
export interface ObjectPanel {
  label: string;
  groups: ObjectGroup[];
  onClose?: () => void;
}

export function ObjectWindow({ panel }: { panel: ObjectPanel | null }) {
  if (!panel) return null;
  const close = panel.onClose ? (
    <button type="button" class="linkish ow-close" aria-label="Put it down" {...tip("Put it down", "X", "Esc")} onClick={panel.onClose}>
      ×
    </button>
  ) : null;
  // (the × on the first setting's name line, at the window's right; with no name there, at the end of its controls)
  const first = panel.groups[0];
  return (
    <div class="object-window" role="group" aria-label={panel.label}>
      {panel.groups.map((g) => (
        <div class="ow-group" key={g.key}>
          {g.label ? (
            <span class="cell-head ow-head">
              <span class="ow-name">{g.label}</span>
              {g.value ? (
                <span class="ow-value" aria-hidden="true">
                  {g.value}
                </span>
              ) : null}
              {g === first ? close : null}
            </span>
          ) : null}
          <div class="cell-body ow-body">
            {g.node}
            {g === first && !g.label ? close : null}
          </div>
        </div>
      ))}
    </div>
  );
}
