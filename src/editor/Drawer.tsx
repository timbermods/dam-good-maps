// The New map drawer (the page is the editor, D330; Kyler's option 1 and his v8 verdict): in the palette's place
// while it is open. Top to bottom: the current map's name, which Kyler can change; Theme, Seed, Size and Designed
// for; the six sections of settings, each opening as a sheet over the drawer's lower part; Generate and Surprise
// me; the map card (its premise, then what is on the map with counts); Your maps, newest first, the current map
// marked, a click opening one. The page owns all of it (src/ui/App.tsx): the drawer only shows it.

import { useEffect, useRef, useState } from "preact/hooks";
import { AVAILABLE_THEMES, SIZE_PRESETS, THEME_NAMES, THEMES, type SizePreset, type ThemeId } from "../core/spec/mapspec";
import type { SessionInfo } from "../worker/session";
import { tip } from "../ui/Tooltip";
import { HINT, Num, SECTION_TIPS, SectionFields, SECTIONS, type Section, type SettingsProps } from "./drawer/settings";

/** A row of Your maps: its name and its dimensions (absent only for a map whose project can't be read). */
export interface YourMapRow {
  id: string;
  name: string;
  size?: { w: number; h: number };
}

/** What the page gives the drawer. */
export interface DrawerModel extends SettingsProps {
  /** The current map's name: the header's title shows it, Your maps keeps it, Save to Timberborn uses it. */
  name: string;
  onRename(name: string): void;
  /** A map is being made or opened, and what the button says meanwhile. */
  busy: boolean;
  busyWords: string;
  /** The settings differ from the current map's. */
  changed: boolean;
  onGenerate(): void;
  onSurprise(): void;
  maps: YourMapRow[];
  /** The open map's row in Your maps. */
  current: string | null;
  onOpenMap(id: string): void;
  /** The settings section open as a sheet, or none (the page keeps it across maps). */
  section: Section | null;
  onSection(section: Section | null): void;
}

export interface DrawerProps {
  model: DrawerModel;
  info: SessionInfo;
  /** Each object's picture, once the view can draw it (the card's legend). */
  icon(template: string): string | null;
}

const Chevron = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** The name field: a rename shows at once in the header; an empty field puts the name back when it is left. */
function NameField(p: { name: string; onRename(name: string): void }) {
  const kept = useRef(p.name);
  const [text, setText] = useState(p.name);
  useEffect(() => {
    if (p.name === kept.current) return;
    kept.current = p.name;
    setText(p.name);
  }, [p.name]);
  return (
    <label class="field wide" for="map-name" {...tip("The map's name: Save to Timberborn uses it")}>
      <span class="field-head">Name</span>
      <input
        id="map-name"
        class="map-name"
        value={text}
        maxLength={80}
        spellcheck={false}
        autoComplete="off"
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setText(v);
          if (v.trim()) {
            kept.current = v.trim();
            p.onRename(kept.current);
          }
        }}
        onBlur={() => setText(kept.current)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.stopPropagation();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

export function Drawer({ model: m, info, icon }: DrawerProps) {
  const section = m.section;
  const setSection = m.onSection;
  const sheet = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const opener = useRef<Section | null>(null);
  // the sheet takes the focus when it opens; Esc closes it, back to its line in the list
  useEffect(() => {
    if (!section) {
      const was = opener.current;
      opener.current = null;
      if (was) (list.current?.querySelector(`[data-section="${was}"]`) as HTMLElement | null)?.focus();
      return;
    }
    opener.current = section;
    (sheet.current?.querySelector("button") as HTMLElement | null)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSection(null);
      }
    };
    const el = sheet.current;
    el?.addEventListener("keydown", key);
    return () => el?.removeEventListener("keydown", key);
  }, [section]);

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
    <aside class="drawer" aria-label="New map">
      <div class="drawer-fields drawer-head">
        <NameField name={m.name} onRename={m.onRename} />
      </div>
      <form
        class="drawer-form"
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          if (!m.busy) m.onGenerate();
        }}
      >
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
              {m.seedPinned ? (
                <button type="button" class="ghost icon-button" aria-label="Seed kept: click to unlock" title="Seed kept: click to unlock it" onClick={m.onUnpinSeed}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </button>
              ) : null}
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
          <div class="field wide">
            <span class="field-head" id="drawer-designed-for">
              Designed for
            </span>
            <div class="segmented" role="group" aria-labelledby="drawer-designed-for">
              {(["easy", "normal", "hard"] as const).map((d) => (
                <button type="button" key={d} aria-pressed={spec.designedFor === d} title={`Balance the map for ${d[0].toUpperCase() + d.slice(1)}`} onClick={() => m.onDifficulty(d)}>
                  {d[0].toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ul class="drawer-sections" ref={list}>
          {SECTIONS.map((s) => (
            <li key={s}>
              <button type="button" class="ghost" data-section={s} aria-haspopup="dialog" aria-expanded={section === s} {...tip(SECTION_TIPS[s])} onClick={() => setSection(section === s ? null : s)}>
                {s}
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
        <div class="drawer-go">
          <button type="submit" class="primary" disabled={m.busy} {...tip(m.changed ? "Make a new map from the changed settings" : "Make a new map", "Enter")}>
            {m.busy ? m.busyWords : m.changed ? "Generate (settings changed)" : "Generate"}
          </button>
          <button type="button" class="ghost" disabled={m.busy} title="Make a map of any kind" onClick={m.onSurprise}>
            Surprise me
          </button>
        </div>
      </form>
      <div class="drawer-lower">
        <section class="drawer-card" aria-label="This map">
          {info.premise ? <p class="premise">{info.premise}</p> : null}
          <ul class="drawer-legend">
            {legend
              .filter(([, , n]) => n > 0)
              .map(([t, name, n]) => {
                const src = icon(t);
                return (
                  <li key={t}>
                    {src ? <img src={src} alt="" width={24} height={24} /> : <span class="shelf-blank" aria-hidden="true" style={{ width: 24, height: 24 }} />}
                    <b>{n}</b> {name}
                  </li>
                );
              })}
          </ul>
        </section>
        <section class="your-maps" aria-labelledby="your-maps-head">
          <h3 id="your-maps-head">Your maps</h3>
          <ul>
            {m.maps.map((e) => {
              const here = e.id === m.current;
              return (
                <li key={e.id}>
                  <button type="button" aria-current={here ? "true" : undefined} title={here ? "The map open now" : "Open this map"} onClick={() => !here && m.onOpenMap(e.id)}>
                    <span class="ym-name">{e.name}</span>
                    {e.size ? (
                      <span class="ym-size">
                        {e.size.w}×{e.size.h}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        {section ? (
          <div class="drawer-sheet" role="dialog" aria-label={`${section} settings`} ref={sheet}>
            <button type="button" class="ghost sheet-back" title="Back to the list of settings" onClick={() => setSection(null)}>
              <Chevron d="m14 6-6 6 6 6" />
              {section}
            </button>
            <div class="settings sheet-body">
              <SectionFields {...m} section={section} />
              {section === "Limits for this size" ? null : (
                <button type="button" class="ghost wide" title="Put every setting back to the chosen theme's own" onClick={m.onReset}>
                  Reset to the theme's settings
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
