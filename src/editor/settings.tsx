// The held tool's settings above the bar (Kyler's option B, 2026-10-03): one panel at the bar's exact width and one
// fixed height for every tool, three rows on one grid (Kyler, 2026-10-05: the third for the forces' Sources), the
// bar's own 13 cells, every group spanning whole cells, so
// each edge in one row lines up with the other and with the bar's cells below; no empty cells. One look per kind of
// control: a number is a slider with its value at the right of its name; a choice is one segmented look (a toggle is
// Off and On); Auto is one small word in the same place on every control that has it, and Auto's pick is outlined
// where the player's is filled; labels said once; keys only in tooltips.

import type { ComponentChildren } from "preact";
import { tip } from "../ui/Tooltip";

/** The bar's cells: six tools, the hairline, seven forces. */
export const BAR_CELLS = 13;
const TOOLS_CELLS = 6;
/** A cell's grid column: the hairline takes a column of its own after the tools. */
const column = (cell: number) => (cell <= TOOLS_CELLS ? cell : cell + 1);

/** A group on the grid: `span` whole cells from `at` (1–13) on `row` (1 to 3), and `rows` rows down from it. */
export interface Group {
  key: string;
  row: 1 | 2 | 3;
  at: number;
  span: number;
  rows?: 2 | 3;
  node: ComponentChildren;
  /** Centred across its cells and down (a force at work's words). */
  centre?: boolean;
}

/** The settings of the tool in hand: its groups on the two rows of the bar's cells. */
export function SettingsGrid(p: { label: string; groups: readonly Group[] }) {
  return (
    <div class="settings-grid" role="group" aria-label={p.label}>
      {p.groups.map((g) => (
        <div
          key={g.key}
          class={`set-group${g.centre ? " centre" : ""}`}
          style={{ gridColumn: `${column(g.at)} / ${column(g.at + g.span - 1) + 1}`, gridRow: `${g.row} / ${g.row + (g.rows ?? 1)}` }}
        >
          {g.node}
        </div>
      ))}
    </div>
  );
}

/** A setting the land decides until the player sets it: Auto, lit while it decides. */
export interface Auto {
  on: boolean;
  onAuto(on: boolean): void;
  /** What Auto's tooltip says it follows ("Size follows Power"). */
  title?: string;
  /** What it follows when on, for its name ("Size follows Power"; the land, by default). */
  follows?: string;
}

function AutoChip(p: { label: string; auto: Auto }) {
  return (
    <button type="button" class="set-auto" aria-pressed={p.auto.on} aria-label={`${p.label} follows ${p.auto.follows ?? "the land"}`} title={p.auto.title ?? (p.auto.on ? `${p.label}: the land decides` : `Let the land decide ${p.label.toLowerCase()}`)} onClick={() => p.auto.onAuto(!p.auto.on)}>
      Auto
    </button>
  );
}

/** A number: its name, its value and Auto on one line, the slider under them across the whole group. On Auto the
 *  slider shows the value the land gives, hollow, until the player moves it. */
export function NumberSetting(p: {
  label: string;
  title: string;
  keys?: readonly string[];
  value: number;
  min: number;
  max: number;
  step: number;
  /** What the value reads (the number, by default). */
  words?: string;
  onChange(v: number): void;
  auto?: Auto;
  disabled?: boolean;
  /** On one line: the name, the slider, then the value (the map generator). */
  line?: boolean;
}) {
  const fill = p.max > p.min ? ((p.value - p.min) / (p.max - p.min)) * 100 : 0;
  const words = p.words ?? String(p.value);
  const value = (
    <span class="set-value" aria-hidden="true">
      {words}
    </span>
  );
  return (
    <div class={`set plate${p.line ? " line" : ""}${p.auto?.on ? " auto" : ""}${p.disabled ? " off" : ""}`} {...tip(p.title, ...(p.keys ?? []))}>
      {p.line ? (
        <span class="set-label">{p.label}</span>
      ) : (
        <div class="set-head">
          <span class="set-label">{p.label}</span>
          <span class="set-right">
            {value}
            {p.auto ? <AutoChip label={p.label} auto={p.auto} /> : null}
          </span>
        </div>
      )}
      <input
        type="range"
        class="set-range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        disabled={p.disabled}
        aria-label={p.label}
        aria-valuetext={p.auto?.on ? `${words}, Auto` : words}
        style={{ "--fill": `${Math.max(0, Math.min(100, fill))}%` }}
        onInput={(e) => p.onChange(Number((e.target as HTMLInputElement).value))}
      />
      {p.line ? value : null}
    </div>
  );
}

/** A choice: its name and Auto on one line, its options side by side under them. On Auto, the option the land took
 *  is outlined; the player's pick is filled. */
export function ChoiceSetting<T extends string | number>(p: {
  label: string;
  title?: string;
  keys?: readonly string[];
  value: T | null;
  /** Each option: its value, its word, its tooltip, and why it can't be picked now (if it can't). */
  options: readonly (readonly [T, string, string, (string | false)?])[];
  onChange(v: T): void;
  auto?: Auto;
  /** Something small at the right of the name line (Reset, a size's own numbers). */
  extra?: ComponentChildren;
  /** The options as wide as their words, not equal (long words in a narrow group). */
  fit?: boolean;
  /** On one line: the name, the options, then the extra (the map generator). */
  line?: boolean;
}) {
  return (
    <div class={`set plate${p.line ? ` line choice${p.extra ? " has-extra" : ""}` : ""}${p.auto?.on ? " auto" : ""}`} {...(p.title ? tip(p.title, ...(p.keys ?? [])) : {})}>
      {p.line ? (
        <span class="set-label">{p.label}</span>
      ) : (
        <div class="set-head">
          <span class="set-label">{p.label}</span>
          <span class="set-right">
            {p.extra}
            {p.auto ? <AutoChip label={p.label} auto={p.auto} /> : null}
          </span>
        </div>
      )}
      <div class={`set-seg${p.fit ? " fit" : ""}`} role="group" aria-label={p.label}>
        {p.options.map(([v, word, title, off]) => (
          <button type="button" key={String(v)} aria-pressed={p.value === v} disabled={!!off} {...tip(off ? `${title}: ${off}` : title, ...(p.keys ?? []))} onClick={() => p.onChange(v)}>
            {word}
          </button>
        ))}
      </div>
      {p.line ? p.extra : null}
    </div>
  );
}

/** A button filling its cells, a plate of its own (as the bar's buttons are). */
export function ButtonSetting(p: { label: string; title: string; keys?: readonly string[]; onClick(): void; disabled?: boolean; pressed?: boolean; ariaLabel?: string; class?: string; onPointerDown?(e: PointerEvent): void }) {
  return (
    <div class="set">
      <button type="button" class={`set-button${p.class ? ` ${p.class}` : ""}`} aria-label={p.ariaLabel} aria-pressed={p.pressed} disabled={p.disabled} {...tip(p.title, ...(p.keys ?? []))} onClick={p.onClick} onPointerDown={p.onPointerDown}>
        {p.label}
      </button>
    </div>
  );
}

/** Words across a group, centred (a force at work says what it is doing). */
export function Words(p: { children: ComponentChildren; status?: boolean }) {
  return (
    <span class="set-words" role={p.status ? "status" : undefined}>
      {p.children}
    </span>
  );
}

/** A toggle: Off and On, the one choice look. */
export function OnOffSetting(p: { label: string; title: string; on: boolean; onChange(on: boolean): void; auto?: Auto }) {
  return (
    <ChoiceSetting<"off" | "on">
      label={p.label}
      value={p.on ? "on" : "off"}
      options={[
        ["off", "Off", `${p.title}: off`],
        ["on", "On", p.title],
      ]}
      onChange={(v) => p.onChange(v === "on")}
      auto={p.auto}
    />
  );
}
