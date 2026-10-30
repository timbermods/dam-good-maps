// Seeing the land behind every object (render3d/objectFade.ts `setObjectsHidden`, an editing aid in its own channel,
// D496/D497's rule: the look itself never changes). Hold H and every object goes, its shadow with it; let go and they are
// back. The Show row's "Hide objects" keeps them hidden until it is clicked again. Letting go of the window (Alt+Tab, a
// hidden tab) lets go of the key, so it never sticks. Nothing here changes the map; pictures never show it.

import { useEffect, useState } from "preact/hooks";
import type { Ed } from "../ed";

/** The key held to hide the objects (by its code, so any keyboard layout works). */
export const HIDE_OBJECTS_KEY = "H";

export interface HideObjectsSlice {
  /** The objects are hidden now: the key held, or the Show row's toggle on. */
  objectsHidden: boolean;
  /** The Show row's toggle: keep them hidden, or bring them back. */
  toggleObjectsHidden: () => void;
}

export function useHideObjects(ed: Ed): HideObjectsSlice {
  const { renderer, ready } = ed;
  const [held, setHeld] = useState(false);
  const [kept, setKept] = useState(false);
  const hidden = held || kept;

  useEffect(() => renderer.current?.setObjectsHidden(hidden), [hidden, ready]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code !== "KeyH" || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
      if (document.querySelector<HTMLElement>(".editor")?.inert) return;
      // (typing in a field keeps its keys; a toggle just clicked does not)
      const t = ev.target as HTMLElement | null;
      const kind = t?.tagName === "INPUT" ? (t as HTMLInputElement).type : "";
      if (t && !["checkbox", "radio", "button"].includes(kind) && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      ev.preventDefault();
      setHeld(true);
    };
    const onUp = (ev: KeyboardEvent) => {
      if (ev.code === "KeyH") setHeld(false);
    };
    const off = () => setHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", off);
    document.addEventListener("visibilitychange", off);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", off);
      document.removeEventListener("visibilitychange", off);
    };
  }, []);

  return { objectsHidden: hidden, toggleObjectsHidden: () => setKept((k) => !k) };
}
