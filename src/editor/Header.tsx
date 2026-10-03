// The editor's header (PLAN §20 D184): the map's name; Undo and Redo as two small icons; the quiet
// dot of the map's checks, green or amber, whose list opens under it (each problem shown on the
// map, with its fix; never a pop-up); one primary button, Save to Timberborn (Download .timber
// where the browser can't save to a folder); everything else in one small menu. Built from the
// shared buttons and bars (D176).

import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { CheckItem, CheckProgress, ExportCheck, SessionInfo } from "../worker/session";
import type { ImportFlag } from "../core/format/normalize";
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
  /** An opened file's import flags, each with its fix: counted with the problems (Kyler, 2026-10-03). */
  flags?: readonly ImportFlag[];
  /** The player removed the map's last badwater spring (D213): "No badwater" under Good to know, not counted. */
  badwaterRemoved?: boolean;
}

/** The dot's tone and words: checking, ready to play, or things to look at. */
export function dotOf(c: ChecksState): { tone: "wait" | "ok" | "warn"; words: string; count: number } {
  const flags = c.flags?.length ?? 0;
  const count = c.instant.length + flags + (c.check ? c.check.blocking.length + c.check.warnings.length : 0);
  if (c.instant.length || flags) return { tone: "warn", words: count === 1 ? "1 thing to look at" : `${count} things to look at`, count };
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
        {d.count ? (
          <span class="dot-count" aria-hidden="true">
            {d.count}
          </span>
        ) : null}
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
              <Items items={c.blocking} actions={p.actions} />
            </section>
          ) : null}
          {c?.warnings.length || p.flags?.length ? (
            <section class="warn">
              <h3>Worth a look</h3>
              {p.flags?.length ? (
                <ul>
                  {p.flags.map((f) => (
                    <li key={f.id}>
                      {f.message}{" "}
                      <button type="button" class="linkish" {...tip(f.fix.label, "Ctrl+Z undoes it")} onClick={() => p.actions.onFix([f.fix])}>
                        {f.fix.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {c?.warnings.length ? <Items items={c.warnings} actions={p.actions} /> : null}
            </section>
          ) : null}
          {c && !c.blocking.length && !c.warnings.length && !p.instant.length && !p.flags?.length ? <p class="ok-line">All {c.checks} checks pass.</p> : null}
          {c?.advisory.length || p.badwaterRemoved ? (
            <section>
              <h3>Good to know</h3>
              {p.badwaterRemoved ? (
                <ul>
                  <li>No badwater</li>
                </ul>
              ) : null}
              {c?.advisory.length ? <Items items={c.advisory} actions={p.actions} /> : null}
            </section>
          ) : null}
          {c?.existing.length ? (
            <section>
              <h3>In the map when you opened it</h3>
              <Items items={c.existing} />
            </section>
          ) : null}
          {c?.approximate ? <p class="note">The water and start checks are approximate here: {c.approximate}.</p> : null}
        </div>
      ) : null}
    </span>
  );
}

/** The map's name, renamed in place (Kyler, 2026-10-03): a click edits it at exactly the same place, size and font,
 *  so nothing moves; Enter or leaving the field saves through the core (never an undo step, D443), Esc cancels; a
 *  blank name is refused in the core's own words. */
function TitleName(p: { name: string; onRename(name: string): Promise<string | null>; onProblem(problem: string | null): void }) {
  const [text, setText] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef(0);
  // (focus is taken in the same task as the click that opens the field, so no key typed straight after it is lost)
  useLayoutEffect(() => {
    closing.current = false;
    if (text !== null) {
      input.current?.focus();
      input.current?.select();
    }
  }, [text !== null]);
  const say = (problem: string | null, forAWhile = false) => {
    clearTimeout(timer.current);
    p.onProblem(problem);
    if (problem && forAWhile) timer.current = window.setTimeout(() => p.onProblem(null), 3000);
  };
  /** (a save under way, or the field closed: the blur of the closing field saves nothing again) */
  const closing = useRef(false);
  const save = async (leaving: boolean) => {
    if (text === null || closing.current) return;
    closing.current = true;
    try {
      await saveText(text, leaving);
    } finally {
      closing.current = false;
    }
  };
  const saveText = async (text: string, leaving: boolean) => {
    if (text.trim() === p.name) {
      setText(null);
      return say(null);
    }
    const problem = await p.onRename(text);
    if (!problem) {
      setText(null);
      return say(null);
    }
    // refused: Enter keeps the field open with the core's words; leaving puts the name back and says why
    if (leaving) setText(null);
    say(problem, leaving);
  };
  if (text === null)
    return (
      <h1>
        <button type="button" class="title-button" title="Rename" onClick={() => setText(p.name)}>
          {p.name}
        </button>
      </h1>
    );
  // the name's own box stays (its text hidden, following what is typed), and the field lies exactly over it
  return (
    <h1 class="title-editing">
      <span class="title-wrap">
      <span class="title-button" aria-hidden="true">
        {text || " "}
      </span>
      <input
          ref={input}
          value={text}
          maxLength={80}
          spellcheck={false}
          autoComplete="off"
          aria-label="Map name"
          title="Rename"
          size={1}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save(false);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              closing.current = true;
              setText(null);
              say(null);
            }
          }}
          onBlur={() => void save(true)}
        />
      </span>
    </h1>
  );
}

export interface HeaderProps {
  info: SessionInfo;
  /** The map's name as the page keeps it. */
  name: string;
  /** Rename through the core (D443): null when stored, else the core's reason. */
  onRename(name: string): Promise<string | null>;
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
  /** The core's refusal of a name, said in the title's second line. */
  const [problem, setProblem] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  // the map's info sits at the window's exact centre and never overlaps the groups at the header's sides:
  // the header learns how far each side group reaches (--side-l, --side-r) and the info's width is capped
  // where the room is short (Kyler, 2026-10-02: below about 1,219px) the info drops its second line first, then
  // the name ellipsizes, down to about 80px
  const bar = useRef<HTMLElement>(null);
  const fit = useRef<() => void>(() => undefined);
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const note = () => {
      const h = el.getBoundingClientRect();
      const l = el.querySelector(".new-map")?.getBoundingClientRect();
      const r = el.querySelector(".editor-actions")?.getBoundingClientRect();
      const sl = l ? Math.ceil(l.right - h.left) : 0;
      const sr = r ? Math.ceil(h.right - r.left) : 0;
      el.style.setProperty("--side-l", `${sl}px`);
      el.style.setProperty("--side-r", `${sr}px`);
      const title = el.querySelector(".editor-title");
      const facts = title?.querySelector(".muted");
      if (title && facts) title.classList.toggle("no-facts", h.width - 2 * Math.max(sl, sr) - 24 < facts.scrollWidth);
    };
    fit.current = note;
    note();
    const watch = new ResizeObserver(note);
    watch.observe(el);
    el.querySelectorAll(".new-map, .editor-actions").forEach((g) => watch.observe(g));
    return () => watch.disconnect();
  }, []);
  useEffect(() => fit.current(), [p.name, p.saveState, p.info.spec?.seed, p.info.W, p.info.H]);
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
      <button type="button" class="ghost new-map" aria-pressed={p.drawerOpen} title={p.drawerOpen ? "Close Maps" : "New maps and your maps"} onClick={p.onDrawer}>
        Maps
      </button>
      <div class="editor-title">
        <TitleName name={p.name} onRename={p.onRename} onProblem={setProblem} />
        <span class={`muted${problem ? " title-problem" : ""}`} role={problem ? "alert" : undefined}>
          {problem || p.saveState || `${p.info.kind === "generated" && p.info.spec ? `Seed ${p.info.spec.seed} · ` : ""}${p.info.W}×${p.info.H}`}
        </span>
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
