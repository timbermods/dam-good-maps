// Save as… (Kyler, 2026-11-18: "I want the ability to save as, where I can name it"): a small field holding the map's
// name, selected, with the name its file will get under it as it is typed; Enter saves, Esc leaves. Saving renames the
// map to that name through the core (one name, D443: never an undo step) and saves it as Save does, into Timberborn's
// Maps folder or as a download. The naming rule is the core's (`fileStemOf`); this only shows it.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cleanMapName } from "../../core/doc/document";
import { fileStemOf } from "../../core/format/fileName";
import { tip } from "../../ui/Tooltip";
import { fitsHeaderTwoLines, limitName } from "../nameFit";

/** The shortcut that opens it, Ctrl+Shift+S (Cmd+Shift+S on a Mac). */
export const SAVE_AS_KEY = "Ctrl+Shift+S";

export function isSaveAsKey(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === "KeyS";
}

export function SaveAs(p: {
  name: string;
  /** Saving into the Maps folder (else a download). */
  toFolder: boolean;
  /** Why the name can't be changed here (a guest's: the host names the shared map), when it can't. */
  locked?: string;
  /** The name the save would give a file of this name, a number added where the Maps folder has one; null when it can't be known. */
  peek?: (fileName: string) => Promise<string | null>;
  onSave(name: string): void;
  onClose(): void;
}) {
  const [text, setText] = useState(p.name);
  const [taken, setTaken] = useState<{ asked: string; free: string | null } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFormElement>(null);
  // (focus and the selection in the same task as the click or key that opened it, so nothing typed straight after is lost)
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  // a press outside leaves it, as a menu does
  useEffect(() => {
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && p.onClose();
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, []);
  const name = text.trim();
  const clean = cleanMapName(text);
  const stem = fileStemOf(name);
  const file = stem.ok ? `${stem.stem}.timber` : null;
  const changed = name !== p.name;
  // the Maps folder asked quietly whether that name is taken (never a prompt: the save asks when it must)
  useEffect(() => {
    if (!p.toFolder || !p.peek || !file) return;
    let live = true;
    const t = window.setTimeout(() => void p.peek!(file).then((free) => live && setTaken({ asked: file, free })), 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [file, p.toFolder]);
  const refused = changed && p.locked ? p.locked : !clean.ok ? clean.reason : null;
  const free = taken && taken.asked === file ? taken.free : null;
  const line = refused ?? (free && free !== file ? `A map called ${file} is in Maps: saves as ${free}` : `Saves as ${file}`);
  const save = () => {
    if (refused) return;
    p.onClose();
    p.onSave(name);
  };
  return (
    <form
      ref={box}
      class="save-as"
      role="dialog"
      aria-label="Save as"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          p.onClose();
        }
      }}
    >
      <div class="save-as-row">
        <input
          ref={input}
          class={`save-as-input${refused ? " refused" : ""}`}
          value={text}
          maxLength={80}
          spellcheck={false}
          autoComplete="off"
          enterKeyHint="done"
          aria-label="Map name"
          aria-describedby="save-as-file"
          {...tip("The map's name, and its file's")}
          onInput={(e) => setText(limitName(e.target as HTMLInputElement, text, fitsHeaderTwoLines))}
        />
        <button type="submit" class="primary save-as-go" disabled={!!refused} {...tip(p.toFolder ? "Save it into Timberborn's Maps folder under this name" : "Download it under this name")}>
          Save
        </button>
      </div>
      <span id="save-as-file" class={`save-as-file${refused ? " refused" : ""}`} role={refused ? "alert" : "status"}>
        {line}
      </span>
    </form>
  );
}
