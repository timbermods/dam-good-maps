// A file dragged onto the editor from outside the page opens.

import { useEffect, useRef } from "preact/hooks";

/** Dropping a .timber or project file on the editor opens it: only a file dragged in from outside
 *  the page (D323, item 11). A drag that began on the page (an icon, an image, a link) carries a
 *  file of its own in Chrome, and never opens anything. */
export function DropTarget({ onFile }: { onFile(file: File): void }) {
  const latest = useRef(onFile);
  latest.current = onFile;
  useEffect(() => {
    /** A drag that began on this page is under way. */
    let inside = false;
    // (after the page's own handlers, so a drag they cancel is no drag at all)
    const began = (e: DragEvent) => {
      inside = !e.defaultPrevented;
    };
    const ended = () => {
      inside = false;
    };
    const over = (e: DragEvent) => {
      if (!inside && e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      const own = inside;
      inside = false;
      if (!file || own) return;
      e.preventDefault();
      latest.current(file);
    };
    window.addEventListener("dragstart", began);
    window.addEventListener("dragend", ended);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    // (a page's own drag that ends with no dragend: the next press starts clean)
    window.addEventListener("pointerdown", ended);
    return () => {
      window.removeEventListener("dragstart", began);
      window.removeEventListener("dragend", ended);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("pointerdown", ended);
    };
  }, []);
  return null;
}
