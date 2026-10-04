// Your maps (Kyler, 2026-10-04): its own panel, opened by Your maps in the header, in the map generator's place (640px
// at the left, over the map, between the header and the bar's settings). Every map's whole picture, four to a row,
// its name and size under it, newest first, the open map marked; a click opens one; a right-click gives Download
// .timber file, Rename (in place) and Delete (asked once). More maps than the panel holds scroll inside it.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { GeneratorModel } from "./model";

export function YourMaps({ model: m }: { model: GeneratorModel }) {
  // the right-click menu, and the map whose name is being renamed in place
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
  return (
    <aside class="gen maps-panel" aria-label="Your maps panel">
      <section class="your-maps" aria-label="Your maps">
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
