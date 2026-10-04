// The map generator's panel (the page is the editor, D330; Layout 2, Kyler, 2026-10-03): 352px at the left, opened
// and closed by Map Generator in the header; closed, the map takes the whole window. Generate and Surprise me are
// pinned at its top; under them, scrolling as one: the map's Name, Theme and Seed, Size, the six sections (each
// opening in place under its own row, several at once), what is on the map (picture, number, name), and Your maps,
// two to a row, each the map's whole picture. The page owns all of it (src/ui/App.tsx): the panel only shows it.

import { AVAILABLE_THEMES, SIZE_PRESETS, THEME_NAMES, THEMES, type SizePreset, type ThemeId } from "../core/spec/mapspec";
import type { SessionInfo } from "../worker/session";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
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
  /** A map is being made or opened (the modal says which). */
  busy: boolean;
  /** The settings differ from the current map's. */
  changed: boolean;
  onGenerate(): void;
  onSurprise(): void;
  maps: YourMapRow[];
  /** The open map's tile in Your maps. */
  current: string | null;
  onOpenMap(id: string): void;
  /** A map of Your maps, open or not: its .timber downloaded; renamed (null, or why not); deleted (asked first). */
  onDownloadMap(id: string): void;
  onRenameMap(id: string, name: string): Promise<string | null>;
  onDeleteMap(id: string): void;
  /** The sections open (the page keeps them across maps). */
  open: readonly Section[];
  onToggle(section: Section): void;
  /** The map's name (the title's), and renaming it through the core: null, or why not. */
  name: string;
  onRename(name: string): Promise<string | null>;
}

/** The map's name, the same as the title: Enter or leaving the field renames it through the core (D443); a name the
 *  core refuses goes back, its reason under the field's name for a moment. */
export function NameField(p: { name: string; onRename(name: string): Promise<string | null> }) {
  const [text, setText] = useState(p.name);
  const [problem, setProblem] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => setText(p.name), [p.name]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const area = useRef<HTMLTextAreaElement>(null);
  // as tall as its lines
  useLayoutEffect(() => {
    const a = area.current;
    if (!a) return;
    a.style.height = "auto";
    a.style.height = `${a.scrollHeight + a.offsetHeight - a.clientHeight}px`;
  }, [text]);
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
        {/* (a long name wraps onto more lines: the field always shows its whole value) */}
        <textarea
          id="map-name"
          ref={area}
          rows={1}
          value={text}
          maxLength={80}
          spellcheck={false}
          autoComplete="off"
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value.replace(/\n/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // (Enter renames here; it never makes a new map)
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
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
  /** The living trees on the map as it is now, edits included (dead ones aren't counted). */
  trees: number;
  /** Each object's picture, once the view can draw it (what is on the map). */
  icon(template: string): string | null;
}

export function Drawer({ model: m, info, icon, trees }: DrawerProps) {
  const { spec } = m;
  // Your maps' right-click menu, and the map whose name is being renamed in place
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const openMenu = (ev: MouseEvent, id: string) => {
    ev.preventDefault();
    setMenu({ id, x: ev.clientX, y: ev.clientY });
  };
  const menuItems = (id: string) => [
    { label: "Download .timber file", title: "Download it for Timberborn's Maps folder", run: () => m.onDownloadMap(id) },
    {
      label: "Rename",
      title: "Rename this map",
      run: () => {
        setProblem(null);
        setRenaming(id);
      },
    },
    { label: "Delete", title: "Delete this map from Your maps", run: () => m.onDeleteMap(id) },
  ];
  const finishRename = async (id: string, name: string | null, leaving: boolean) => {
    const was = m.maps.find((e) => e.id === id)?.name;
    if (name === null || name.trim() === was) {
      setProblem(null);
      return setRenaming(null);
    }
    const why = await m.onRenameMap(id, name);
    // refused: Enter keeps the field open with the reason; clicking away puts the name back
    if (why && !leaving) return setProblem(why);
    setProblem(null);
    setRenaming(null);
  };
  const W = spec.size.x;
  const H = spec.size.y;
  const preset = (Object.entries(SIZE_PRESETS).find(([, v]) => v === W && v === H)?.[0] as SizePreset | undefined) ?? "custom";
  // what is on this map, from its features
  const count = (pred: (f: SessionInfo["features"][number]) => boolean) => info.features.filter(pred).length;
  const legend: [string, string, number][] = [
    ["UndergroundRuins", "Mine sites", count((f) => f.kind === "mapObject" && (f.params as { kind?: string }).kind === "mineSite")],
    ["RuinColumnH3", "Ruin fields", count((f) => f.kind === "ruinField")],
    ["BlueberryBush", "Berry patches", count((f) => f.kind === "berryPatch")],
    ["Pine", "Trees", trees],
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
            Generate
          </button>
          <button type="button" class="ghost" disabled={m.busy} title="Make a map of any kind" onClick={m.onSurprise}>
            Surprise me
          </button>
        </div>
        <div class="drawer-body">
          <NameField name={m.name} onRename={m.onRename} />
          <div class="drawer-fields">
            <label class="field wide" for="theme" {...tip("The kind of land the map leans toward")}>
              <span class="field-head">Theme</span>
              <select id="theme" value={spec.theme} onChange={(e) => m.onTheme((e.target as HTMLSelectElement).value as ThemeId)}>
                {THEMES.map((t) => (
                  <option value={t} key={t} disabled={!AVAILABLE_THEMES.includes(t)}>
                    {THEME_NAMES[t]}
                  </option>
                ))}
              </select>
            </label>
            <label class="field wide" for="seed" {...tip(HINT.seed)}>
              <span class="field-head">Seed</span>
              <span class="drawer-seed">
                <input id="seed" value={m.seedText} maxLength={24} autoComplete="off" onInput={(e) => m.onSeed((e.target as HTMLInputElement).value)} />
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
          <h3 class="drawer-head" id="on-this-map-head">
            On this map
          </h3>
          <ul class="drawer-legend" aria-labelledby="on-this-map-head">
            {legend.map(([t, name, n]) => {
              const src = icon(t);
              return (
                <li key={t}>
                  {src ? <img src={src} alt="" width={24} height={24} /> : <span class="shelf-blank" aria-hidden="true" style={{ width: 24, height: 24 }} />}
                  <b>{n.toLocaleString("en-GB")}</b> {name}
                </li>
              );
            })}
          </ul>
          <section class="your-maps" aria-labelledby="your-maps-head">
            <h3 id="your-maps-head">Your maps</h3>
            <ul>
              {m.maps.map((e) => {
                const here = e.id === m.current;
                const inside = (
                  <>
                    {e.thumbnail ? <img class="ym-pic" src={e.thumbnail} alt="" width={142} height={142} draggable={false} /> : <span class="ym-pic" aria-hidden="true" />}
                    <span class="ym-line">
                      {renaming === e.id ? <TileName name={e.name} onDone={(n, leaving) => void finishRename(e.id, n, leaving)} problem={problem} /> : <span class="ym-name">{e.name}</span>}
                      {e.size ? (
                        <span class="ym-size">
                          {e.size.w}×{e.size.h}
                        </span>
                      ) : null}
                    </span>
                  </>
                );
                return (
                  <li key={e.id} onContextMenu={(ev) => openMenu(ev, e.id)}>
                    {renaming === e.id ? (
                      // (an input can't sit in a button: the tile is drawn the same without one while it is renamed)
                      <div class="ym-tile" aria-current={here ? "true" : undefined}>
                        {inside}
                      </div>
                    ) : (
                      <button type="button" class="ym-tile" aria-current={here ? "true" : undefined} title={here ? "The map open now" : "Open this map"} onClick={() => !here && m.onOpenMap(e.id)}>
                        {inside}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          {menu ? <MapMenu at={menu} onClose={() => setMenu(null)} items={menuItems(menu.id)} /> : null}
        </div>
      </form>
    </aside>
  );
}

/** A map's name in Your maps renamed in place, at the name's own size and font: Enter or clicking away renames it,
 *  Esc cancels; a name refused stays in the field with its reason as its tooltip. */
function TileName(p: { name: string; onDone(name: string | null, leaving: boolean): void; problem: string | null }) {
  const [text, setText] = useState(p.name);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (name: string | null, leaving = false) => {
    if (done.current) return;
    done.current = true;
    p.onDone(name, leaving);
  };
  useEffect(() => {
    // (refused: the field stays open for another try)
    if (p.problem) done.current = false;
  }, [p.problem]);
  return (
    <input
      ref={input}
      class={`ym-name ym-rename${p.problem ? " refused" : ""}`}
      value={text}
      maxLength={80}
      spellcheck={false}
      autoComplete="off"
      aria-label="Map name"
      title={p.problem ?? "Rename"}
      onInput={(e) => setText((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(text);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      }}
      onBlur={() => finish(text, true)}
    />
  );
}

/** The right-click menu of a map in Your maps (the File menu's look): at the pointer, kept on the screen; Esc or a
 *  click elsewhere closes it. */
function MapMenu(p: { at: { x: number; y: number }; items: { label: string; title: string; run(): void }[]; onClose(): void }) {
  const box = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ left: p.at.x, top: p.at.y });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(p.at.x, window.innerWidth - r.width - 4));
    const top = Math.max(4, Math.min(p.at.y, window.innerHeight - r.height - 4));
    setPos({ left, top });
    (el.querySelector("button") as HTMLButtonElement | null)?.focus();
  }, [p.at.x, p.at.y]);
  useEffect(() => {
    const off = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) p.onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        p.onClose();
      }
    };
    window.addEventListener("pointerdown", off, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", p.onClose);
    return () => {
      window.removeEventListener("pointerdown", off, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", p.onClose);
    };
  }, []);
  return (
    <ul ref={box} class="menu ym-menu" role="menu" aria-label="Map" style={{ left: `${pos.left}px`, top: `${pos.top}px` }} onContextMenu={(e) => e.preventDefault()}>
      {p.items.map((it) => (
        <li role="none" key={it.label}>
          <button
            type="button"
            role="menuitem"
            title={it.title}
            onClick={() => {
              p.onClose();
              it.run();
            }}
          >
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
