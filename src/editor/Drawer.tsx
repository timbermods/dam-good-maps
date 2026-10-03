// The map generator's panel (the page is the editor, D330; Layout 2, Kyler, 2026-10-03): 352px at the left, opened
// and closed by Map Generator in the header; closed, the map takes the whole window. Generate and Surprise me are
// pinned at its top; under them, scrolling as one: the map's Name, Theme and Seed, Size, the six sections (each
// opening in place under its own row, several at once), what is on the map (picture, number, name), and Your maps,
// two to a row, each the map's whole picture. The page owns all of it (src/ui/App.tsx): the panel only shows it.

import { AVAILABLE_THEMES, SIZE_PRESETS, THEME_NAMES, THEMES, type SizePreset, type ThemeId } from "../core/spec/mapspec";
import type { SessionInfo } from "../worker/session";
import { useEffect, useRef, useState } from "preact/hooks";
import { tip } from "../ui/Tooltip";
import { HINT, Num, SECTION_TIPS, SectionFields, SECTIONS, type Section, type SettingsProps } from "./drawer/settings";

/** A tile of Your maps: its picture, name and dimensions. */
export interface YourMapRow {
  id: string;
  name: string;
  size?: { w: number; h: number };
  /** Your maps' stored picture (a PNG data URL), or none yet. */
  thumbnail: string | null;
}

/** What the page gives the drawer. */
export interface DrawerModel extends SettingsProps {
  /** A map is being made or opened, and what the button says meanwhile. */
  busy: boolean;
  busyWords: string;
  /** The settings differ from the current map's. */
  changed: boolean;
  onGenerate(): void;
  onSurprise(): void;
  maps: YourMapRow[];
  /** The open map's tile in Your maps. */
  current: string | null;
  onOpenMap(id: string): void;
  /** The sections open (the page keeps them across maps). */
  open: readonly Section[];
  onToggle(section: Section): void;
  /** The map's name (the title's), and renaming it through the core: null, or why not. */
  name: string;
  onRename(name: string): Promise<string | null>;
}

/** The map's name, the same as the title: Enter or leaving the field renames it through the core (D443); a name the
 *  core refuses goes back, its reason under the field's name for a moment. */
function NameField(p: { name: string; onRename(name: string): Promise<string | null> }) {
  const [text, setText] = useState(p.name);
  const [problem, setProblem] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => setText(p.name), [p.name]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = async () => {
    if (text.trim() === p.name) return setText(p.name);
    const why = await p.onRename(text);
    if (!why) return setProblem(null);
    setText(p.name);
    setProblem(why);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setProblem(null), 3000);
  };
  return (
    <div class="drawer-fields name-field">
      <label class="field wide" for="map-name" {...tip("The map's name: the title above the map")}>
        <span class={`field-head${problem ? " title-problem" : ""}`} role={problem ? "alert" : undefined}>
          {problem ?? "Name"}
        </span>
        <input
          id="map-name"
          value={text}
          maxLength={80}
          spellcheck={false}
          autoComplete="off"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // (Enter renames here; it never makes a new map)
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setText(p.name);
            }
          }}
          onBlur={() => void save()}
        />
      </label>
    </div>
  );
}

export interface DrawerProps {
  model: DrawerModel;
  info: SessionInfo;
  /** Each object's picture, once the view can draw it (what is on the map). */
  icon(template: string): string | null;
}

export function Drawer({ model: m, info, icon }: DrawerProps) {
  const { spec } = m;
  const W = spec.size.x;
  const H = spec.size.y;
  const preset = (Object.entries(SIZE_PRESETS).find(([, v]) => v === W && v === H)?.[0] as SizePreset | undefined) ?? "custom";
  // what is on this map, from its features
  const count = (pred: (f: SessionInfo["features"][number]) => boolean) => info.features.filter(pred).length;
  const legend: [string, string, number][] = [
    ["UndergroundRuins", "Mine sites", count((f) => f.kind === "mapObject" && (f.params as { kind?: string }).kind === "mineSite")],
    ["RuinColumnH3", "Ruin fields", count((f) => f.kind === "ruinField")],
    ["BlueberryBush", "Berry patches", count((f) => f.kind === "berryPatch")],
    ["Pine", "Forests", count((f) => f.kind === "forest")],
    ["WaterSource", "Rivers", count((f) => f.kind === "river")],
  ];
  return (
    <aside class="drawer" aria-label="Map Generator">
      <form
        class="drawer-form"
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          if (!m.busy) m.onGenerate();
        }}
      >
        <div class="drawer-go">
          <button type="submit" class="primary" disabled={m.busy} {...tip(m.changed ? "Make a new map from the changed settings" : "Make a new map", "Enter")}>
            {m.busy ? m.busyWords : "Generate"}
          </button>
          <button type="button" class="ghost" disabled={m.busy} title="Make a map of any kind" onClick={m.onSurprise}>
            Surprise me
          </button>
        </div>
        <div class="drawer-body">
          <NameField name={m.name} onRename={m.onRename} />
          <div class="drawer-fields">
            <label class="field" for="theme" {...tip("The kind of land the map leans toward")}>
              <span class="field-head">Theme</span>
              <select id="theme" value={spec.theme} onChange={(e) => m.onTheme((e.target as HTMLSelectElement).value as ThemeId)}>
                {THEMES.map((t) => (
                  <option value={t} key={t} disabled={!AVAILABLE_THEMES.includes(t)}>
                    {THEME_NAMES[t]}
                  </option>
                ))}
              </select>
            </label>
            <label class="field" for="seed" {...tip(HINT.seed)}>
              <span class="field-head">Seed</span>
              <span class="drawer-seed">
                <input id="seed" value={m.seedText} autoComplete="off" onInput={(e) => m.onSeed((e.target as HTMLInputElement).value)} />
                <button type="button" class="ghost seed-keep" aria-pressed={m.seedPinned} title={m.seedPinned ? "Generate makes this map again" : "Keep this seed for the next Generate"} onClick={() => (m.seedPinned ? m.onUnpinSeed() : m.onPinSeed())}>
                  Keep
                </button>
              </span>
            </label>
            <label class="field wide" for="size" {...tip(HINT.size)}>
              <span class="field-head">Size</span>
              <select
                id="size"
                value={preset}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  if (v in SIZE_PRESETS) m.onSize({ x: SIZE_PRESETS[v as SizePreset], y: SIZE_PRESETS[v as SizePreset] });
                  else m.onSize({ x: W, y: H === W ? Math.max(48, W - 16) : H });
                }}
              >
                {(Object.keys(SIZE_PRESETS) as SizePreset[]).map((k) => (
                  <option value={k} key={k}>
                    {k[0].toUpperCase() + k.slice(1)} ({SIZE_PRESETS[k]}×{SIZE_PRESETS[k]})
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </label>
            {preset === "custom" ? (
              <>
                <Num id="size-x" label="Width" value={W} min={48} max={256} onChange={(v) => m.onSize({ x: v, y: H })} />
                <Num id="size-y" label="Height" value={H} min={48} max={256} onChange={(v) => m.onSize({ x: W, y: v })} />
              </>
            ) : null}
          </div>
          <ul class="drawer-sections">
            {SECTIONS.map((s) => {
              const open = m.open.includes(s);
              const id = `section-${s.replace(/\W+/g, "-").toLowerCase()}`;
              return (
                <li key={s}>
                  <button type="button" class="ghost section-row" data-section={s} aria-expanded={open} aria-controls={id} {...tip(SECTION_TIPS[s])} onClick={() => m.onToggle(s)}>
                    {s}
                    <span class="chev" aria-hidden="true">
                      ›
                    </span>
                  </button>
                  {open ? (
                    <div class="settings section-fields" id={id} role="group" aria-label={`${s} settings`}>
                      <SectionFields {...m} section={s} />
                      {s === "Limits for this size" ? null : (
                        <button type="button" class="ghost wide" title="Put every setting back to the chosen theme's own" onClick={m.onReset}>
                          Reset to the theme's settings
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <ul class="drawer-legend" aria-label="On this map">
            {legend.map(([t, name, n]) => {
              const src = icon(t);
              return (
                <li key={t}>
                  {src ? <img src={src} alt="" width={24} height={24} /> : <span class="shelf-blank" aria-hidden="true" style={{ width: 24, height: 24 }} />}
                  <b>{n}</b> {name}
                </li>
              );
            })}
          </ul>
          <section class="your-maps" aria-labelledby="your-maps-head">
            <h3 id="your-maps-head">Your maps</h3>
            <ul>
              {m.maps.map((e) => {
                const here = e.id === m.current;
                return (
                  <li key={e.id}>
                    <button type="button" aria-current={here ? "true" : undefined} title={here ? "The map open now" : "Open this map"} onClick={() => !here && m.onOpenMap(e.id)}>
                      {e.thumbnail ? <img class="ym-pic" src={e.thumbnail} alt="" width={142} height={142} /> : <span class="ym-pic" aria-hidden="true" />}
                      <span class="ym-line">
                        <span class="ym-name">{e.name}</span>
                        {e.size ? (
                          <span class="ym-size">
                            {e.size.w}×{e.size.h}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </form>
    </aside>
  );
}
