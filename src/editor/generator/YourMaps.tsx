// Your maps (Kyler, 2026-10-04): its own panel, opened by Your maps in the header, in the map generator's place (640px
// at the left, over the map, between the header and the bar's settings). Every kept map's whole picture, four to a
// row, its name and size under it, newest first, the open map marked; a click opens one; a right-click gives Download
// .timber file, Rename (in place) and Delete (asked once). More maps than the panel holds scroll inside it.
// Several maps are selected as on a desktop (Kyler, 2026-10-05): Ctrl-click toggles one, Shift-click a range from the
// last one clicked, neither opening a map; Rename and Delete on the heading row act on the selection, and the Delete
// key deletes it (or the map under the pointer) while the pointer is over the panel or a tile has the focus.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { GeneratorModel } from "./model";
import { tip } from "../../ui/Tooltip";

export function YourMaps({ model: m }: { model: GeneratorModel }) {
  // the right-click menu, and the map whose name is being renamed in place
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The maps selected, and the last tile clicked (a Shift-click's range runs from it). */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  // (maps gone from the list leave the selection)
  const ids = m.maps.map((e) => e.id).join("|");
  useEffect(() => {
    setSelected((was) => {
      const now = new Set([...was].filter((id) => m.maps.some((e) => e.id === id)));
      return now.size === was.size ? was : now;
    });
  }, [ids]);
  const click = (ev: MouseEvent, id: string, here: boolean) => {
    if (ev.ctrlKey || ev.metaKey) {
      const next = new Set(selected);
      if (!next.delete(id)) next.add(id);
      anchor.current = id;
      return setSelected(next);
    }
    if (ev.shiftKey) {
      const from = Math.max(0, m.maps.findIndex((e) => e.id === (anchor.current ?? id)));
      const to = m.maps.findIndex((e) => e.id === id);
      const [a, b] = from <= to ? [from, to] : [to, from];
      return setSelected(new Set(m.maps.slice(a, b + 1).map((e) => e.id)));
    }
    anchor.current = id;
    setSelected(new Set());
    if (!here) m.onOpenMap(id);
  };
  const chosen = m.maps.filter((e) => selected.has(e.id)).map((e) => e.id);
  const rename = () => {
    if (chosen.length !== 1) return;
    setProblem(null);
    setRenaming(chosen[0]);
  };
  const remove = () => chosen.length && m.onDeleteMaps(chosen);
  // the Delete key: the selected maps, or the map under the pointer, while the pointer is over Your maps or a tile has
  // the focus (over the land it keeps everything it does there)
  const latest = useRef({ chosen, deleteMaps: m.onDeleteMaps, renaming });
  latest.current = { chosen, deleteMaps: m.onDeleteMaps, renaming };
  useEffect(() => {
    // (where the pointer is, asked when the key is pressed: what is under it then decides)
    let at: { x: number; y: number } | null = null;
    const move = (ev: PointerEvent) => (at = { x: ev.clientX, y: ev.clientY });
    // (keyboard focus: the focus moved with Tab since the last press of the pointer; a tile just clicked has the focus
    // too, but not the keyboard's)
    let tabbed = false;
    const press = () => (tabbed = false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Tab") tabbed = true;
      if (ev.key !== "Delete" || ev.ctrlKey || ev.altKey || ev.metaKey || latest.current.renaming) return;
      const under = at ? document.elementFromPoint(at.x, at.y) : null;
      const overPanel = !!under && !!panel.current?.contains(under);
      const hovered = overPanel ? (under!.closest("li[data-id]")?.getAttribute("data-id") ?? null) : null;
      const f = document.activeElement as HTMLElement | null;
      const focused = tabbed && !!f && !!panel.current?.contains(f) && f.classList.contains("ym-tile");
      if (!overPanel && !focused) return;
      const l = latest.current;
      const which = l.chosen.length ? l.chosen : hovered ? [hovered] : [];
      if (!which.length) return;
      ev.preventDefault();
      ev.stopPropagation();
      l.deleteMaps(which);
    };
    window.addEventListener("pointermove", move, { capture: true, passive: true });
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("keydown", key, true);
    };
  }, []);
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
    { label: "Delete", title: "Delete this map from Your maps", run: () => m.onDeleteMaps([id]) },
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
  return (
    <aside ref={panel} class="gen maps-panel" aria-label="Your maps panel">
      <section class="your-maps" aria-label="Your maps">
        {/* the heading row: Rename and Delete at the tiles' right edge, always there, greyed until a selection fits */}
        <div class="ym-head">
          <h2 class="ym-title">Your maps</h2>
          <span class="ym-acts">
            <button type="button" class="ghost ym-act" disabled={chosen.length !== 1} {...tip("Rename the selected map")} onClick={rename}>
              Rename
            </button>
            <button type="button" class="ghost ym-act" disabled={!chosen.length} {...tip("Delete the selected maps", "Delete")} onClick={remove}>
              Delete
            </button>
          </span>
        </div>
        <ul>
          {m.maps.map((e) => {
            const here = e.id === m.current;
            const picked = selected.has(e.id);
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
              <li key={e.id} class={picked ? "selected" : undefined} data-id={e.id} onContextMenu={(ev) => openMenu(ev, e.id)}>
                {renaming === e.id ? (
                  // (an input can't sit in a button: the tile is drawn the same without one while it is renamed)
                  <div class="ym-tile" aria-current={here ? "true" : undefined}>
                    {inside}
                  </div>
                ) : (
                  <button
                    type="button"
                    class="ym-tile"
                    aria-current={here ? "true" : undefined}
                    {...tip(here ? "The map open now" : "Open this map", "Ctrl+click selects it", "Shift+click a range")}
                    onClick={(ev) => click(ev, e.id, here)}
                  >
                    {inside}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {menu ? <MapMenu at={menu} onClose={() => setMenu(null)} items={menuItems(menu.id)} /> : null}
    </aside>
  );
}

/** A map's name in Your maps renamed in place, at the name's own size and font: Enter or clicking away renames it,
 *  Esc cancels; a name refused stays in the field with its reason as its tooltip. */
/** Whether a name fits the two lines a tile keeps for it, as the tile shows it (in the open map's bold). */
function fitsTwoLines(field: HTMLElement, name: string): boolean {
  const line = field.parentElement;
  if (!line) return true;
  const probe = document.createElement("span");
  probe.className = "ym-name";
  probe.textContent = name;
  probe.style.cssText = `position: absolute; visibility: hidden; display: block; height: auto; -webkit-line-clamp: none; font-weight: 600; width: ${line.clientWidth}px`;
  line.appendChild(probe);
  const fits = probe.scrollHeight <= 2 * parseFloat(getComputedStyle(probe).lineHeight) + 0.5;
  probe.remove();
  return fits;
}

/** A name typed in Rename stops at what fits two lines (Kyler, 2026-10-05): a key past them does nothing, a paste
 *  keeps what fits. */
function fitTwoLines(field: HTMLInputElement, was: string): string {
  const v = field.value;
  if (fitsTwoLines(field, v)) return v;
  const at = field.selectionStart ?? v.length;
  let kept = was;
  if (v.length !== was.length + 1) {
    let lo = 0;
    let hi = v.length;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (fitsTwoLines(field, v.slice(0, m))) lo = m;
      else hi = m - 1;
    }
    kept = v.slice(0, lo);
  }
  field.value = kept;
  const caret = Math.min(kept.length, kept === was ? at - 1 : at);
  field.setSelectionRange(caret, caret);
  return kept;
}

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
      onInput={(e) => setText(fitTwoLines(e.target as HTMLInputElement, text))}
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
