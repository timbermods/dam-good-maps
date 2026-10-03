// The editor's header (PLAN §20 D184): the map's name; Undo and Redo as two small icons; the quiet
// dot of the map's checks, green or amber, whose list opens under it (each problem shown on the
// map, with its fix; never a pop-up); one primary button, Save to Timberborn (Download .timber
// where the browser can't save to a folder); everything else in one small menu. Built from the
// shared buttons and bars (D176).

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { CheckItem, CheckProgress, ExportCheck, SessionInfo } from "../worker/session";
import { Items, type ItemActions } from "./panels";
import { tip } from "../ui/Tooltip";
import { GENERATOR_VERSION } from "../core/spec/mapspec";

const ICON = { width: 18, height: 18, viewBox: "0 0 20 20", "aria-hidden": "true" as const, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };

export interface ChecksState {
  check: ExportCheck | null;
  /** The problems the last edit made (the instant checks). */
  instant: CheckItem[];
  busy: boolean;
  progress: CheckProgress | null;
  flowing: number | null;
}

/** The dot's tone and words: checking, ready to play, or things to look at. */
export function dotOf(c: ChecksState): { tone: "wait" | "ok" | "warn"; words: string; count: number } {
  const count = c.instant.length + (c.check ? c.check.blocking.length + c.check.warnings.length : 0);
  if (c.instant.length) return { tone: "warn", words: count === 1 ? "1 thing to look at" : `${count} things to look at`, count };
  if (!c.check || c.busy) return { tone: "wait", words: c.flowing !== null ? "Checking, as the water flows" : c.progress?.stage === "water" ? "Settling the water" : "Checking the map", count };
  if (!count) return { tone: "ok", words: "Ready to play", count };
  return { tone: "warn", words: count === 1 ? "1 thing to look at" : `${count} things to look at`, count };
}

/** The quiet dot, and its list under it while it is open. */
export function ChecksDot(p: ChecksState & { open: boolean; onToggle(open: boolean): void; actions: ItemActions }) {
  const d = dotOf(p);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!p.open) return;
    const off = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) p.onToggle(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && p.onToggle(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", key);
    };
  }, [p.open]);
  const c = p.check;
  return (
    <span class="checks-dot-wrap" ref={wrap}>
      <button type="button" class={`checks-dot ${d.tone}`} aria-expanded={p.open} aria-label={`Checks: ${d.words}`} title={d.words} onClick={() => p.onToggle(!p.open)}>
        <span class="dot" aria-hidden="true" />
        {d.count ? <span class="dot-count">{d.count}</span> : null}
        <span class="dot-words">{d.words}</span>
      </button>
      {p.open ? (
        <div class="checks-list" role="region" aria-label="Checks">
          <p class="checks-head">{d.words}</p>
          {p.instant.length ? (
            <section>
              <h3>This edit made</h3>
              <Items items={p.instant} actions={p.actions} />
            </section>
          ) : null}
          {c?.blocking.length ? (
            <section class="bad">
              <h3>Fix these first</h3>
              <p class="note">The map can't be saved until they are fixed.</p>
              <Items items={c.blocking} actions={p.actions} />
            </section>
          ) : null}
          {c?.warnings.length ? (
            <section class="warn">
              <h3>Worth a look</h3>
              <p class="note">Saving notes them in the map's description.</p>
              <Items items={c.warnings} actions={p.actions} />
            </section>
          ) : null}
          {c && !c.blocking.length && !c.warnings.length && !p.instant.length ? <p class="ok-line">All {c.checks} checks pass.</p> : null}
          {c?.advisory.length ? (
            <section>
              <h3>Good to know</h3>
              <Items items={c.advisory} actions={p.actions} />
            </section>
          ) : null}
          {c?.existing.length ? (
            <section>
              <h3>In the map when you opened it</h3>
              <p class="note">These stay as they were, and never stop a save.</p>
              <Items items={c.existing} />
            </section>
          ) : null}
          {c?.approximate ? <p class="note">The water and start checks are approximate here: {c.approximate}.</p> : null}
        </div>
      ) : null}
    </span>
  );
}

export interface HeaderProps {
  info: SessionInfo;
  /** The map's name as the page keeps it (renamed in the drawer). */
  name: string;
  /** Why this browser isn't keeping the map, when it isn't; else empty. */
  saveState: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  /** The quiet dot. */
  dot: ComponentChildren;
  /** Save to Timberborn works here (the browser can save to a folder). */
  canFolder: boolean;
  /** A save in progress, and how far along. */
  saving: { kind: "timberborn" | "download"; progress: CheckProgress | null } | null;
  onSave(kind: "timberborn" | "download"): void;
  onOpenFile(file: File): void;
  onSaveProject(): void;
  /** Remove every source, tree, bush, ruin, object and the start (one undo step, D323 item 44). */
  onClearEverything(): void;
  historyOpen: boolean;
  onHistory(): void;
  /** The New map drawer: open, and its switch. */
  drawerOpen: boolean;
  onDrawer(): void;
  /** The look's menu (High or Standard, D284), beside More. */
  look?: ComponentChildren;
}

export function Header(p: HeaderProps) {
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  // the map's info sits at the window's exact centre and never overlaps the groups at the header's sides:
  // the header learns how far each side group reaches (--side-l, --side-r) and the info's width is capped
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const note = () => {
      const h = el.getBoundingClientRect();
      const l = el.querySelector(".new-map")?.getBoundingClientRect();
      const r = el.querySelector(".editor-actions")?.getBoundingClientRect();
      el.style.setProperty("--side-l", `${l ? Math.ceil(l.right - h.left) : 0}px`);
      el.style.setProperty("--side-r", `${r ? Math.ceil(h.right - r.left) : 0}px`);
    };
    note();
    const watch = new ResizeObserver(note);
    watch.observe(el);
    el.querySelectorAll(".new-map, .editor-actions").forEach((g) => watch.observe(g));
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const off = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", key);
    };
  }, [menu]);
  const pick = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const saving = p.saving;
  const primary = p.canFolder ? "timberborn" : "download";
  const savingWords = saving ? `Saving…${saving.progress ? ` ${Math.round(saving.progress.done * 100)}%` : ""}` : null;
  return (
    <header class="editor-bar" ref={bar}>
      <button type="button" class="ghost new-map" aria-pressed={p.drawerOpen} title={p.drawerOpen ? "Close the New map drawer" : "Make a new map: its settings open on the left"} onClick={p.onDrawer}>
        New map
      </button>
      <div class="editor-title">
        <h1 title={p.name}>{p.name}</h1>
        <span class="muted">{p.saveState || `${p.info.kind === "generated" && p.info.spec ? `seed ${p.info.spec.seed} · ` : ""}${p.info.W}×${p.info.H}`}</span>
      </div>
      <div class="editor-actions" role="toolbar" aria-label="Edit">
        <button type="button" class="ghost icon-button" onClick={p.onUndo} disabled={!p.canUndo} aria-label="Undo (Ctrl+Z)" {...tip("Undo", "Z", "Ctrl+Z")}>
          <svg {...ICON}>
            <path d="M7 5L3 9l4 4M3 9h9a5 5 0 0 1 0 10h-2" />
          </svg>
        </button>
        <button type="button" class="ghost icon-button" onClick={p.onRedo} disabled={!p.canRedo} aria-label="Redo (Ctrl+Y)" {...tip("Redo", "C", "Ctrl+Y")}>
          <svg {...ICON}>
            <path d="M13 5l4 4-4 4M17 9H8a5 5 0 0 0 0 10h2" />
          </svg>
        </button>
        {p.dot}
        <button type="button" class="primary" disabled={!!saving} onClick={() => p.onSave(primary)} title={p.canFolder ? "Save it into Timberborn's Maps folder" : "Download it for Timberborn's Maps folder"}>
          {saving?.kind === primary ? savingWords : p.canFolder ? "Save to Timberborn" : "Download .timber"}
        </button>
        {p.look}
        <div class="menu-wrap" ref={wrap}>
          <button type="button" class="ghost" aria-haspopup="menu" aria-expanded={menu} title="File: open, save, download, history, about" onClick={() => setMenu(!menu)}>
            File
          </button>
          {menu ? (
            <ul class="menu" role="menu" aria-label="File">
              <li role="none">
                <button type="button" role="menuitem" title="Open a map or project file" onClick={pick(() => file.current?.click())}>
                  Open…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" title="Save the map and its edits as a project" onClick={pick(p.onSaveProject)}>
                  Save project
                </button>
              </li>
              {p.canFolder ? (
                <li role="none">
                  <button type="button" role="menuitem" disabled={!!saving} title="Download the .timber file" onClick={pick(() => p.onSave("download"))}>
                    {saving?.kind === "download" ? savingWords : "Download .timber"}
                  </button>
                </li>
              ) : null}
              <li role="none">
                <button type="button" role="menuitem" title="Take away every object; the land stays" onClick={pick(p.onClearEverything)}>
                  Clear everything
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" aria-pressed={p.historyOpen} title="Every step of the map's history" onClick={pick(p.onHistory)}>
                  History{p.info.orphans.length ? ` (${p.info.orphans.length} to review)` : ""}
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" title="About Dam Good Maps: the version, the credits, the licences" onClick={pick(() => setAbout(true))}>
                  About
                </button>
              </li>
            </ul>
          ) : null}
          <input
            ref={file}
            type="file"
            class="visually-hidden"
            tabIndex={-1}
            accept=".timber,.json,.gz,application/json"
            aria-label="Open a map or project file"
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              const f = input.files?.[0];
              input.value = "";
              if (f) p.onOpenFile(f);
            }}
          />
        </div>
      </div>
      {about ? <About onClose={() => setAbout(false)} /> : null}
    </header>
  );
}

/** About (File → About): the version, the credits and the licences, in the page's dialog. */
function About(p: { onClose(): void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div class="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="dialog about" role="dialog" aria-modal="true" aria-labelledby="about-head">
        <h2 id="about-head">Dam Good Maps</h2>
        <p>Generator {GENERATOR_VERSION}.</p>
        <p>Free software under the GNU Affero General Public License v3. The maps you make are yours.</p>
        <p>Sounds: recorded CC0 foley. Real places: public elevation data, credited in the gallery.</p>
        <p>Timberborn is a game by Mechanistry; this project is not affiliated with Mechanistry.</p>
        <footer>
          <button type="button" class="ghost" title="The source code, on GitHub" onClick={() => window.open("https://github.com/timbermods/dam-good-maps", "_blank", "noopener")}>
            Source
          </button>
          <button type="button" class="primary" title="Close About" onClick={p.onClose} autoFocus>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
