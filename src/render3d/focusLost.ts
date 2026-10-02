// The window loses focus (a screenshot tool, Alt+Tab, a dialog) while a key or the mouse button is
// down: the keyup and the pointerup go to another window and never arrive, so nothing may keep acting
// as if Shift, a camera key or the mouse were still held (PLAN §20 D361, item 5). This releases the
// lot: the keys held, Shift's speed, and a drag in progress is ended as a released button would end
// it, at the pointer's last place, so a stroke is kept as far as it went and never left open.

import type { Glide } from "./cameraGlide";

export interface Dragging {
  kind: string;
  id: number;
  x: number;
  y: number;
}

/** Release everything held; `end` finishes the drag in progress (if any) as a pointer release. */
export function focusLost(held: Set<string>, glide: Glide, drag: Dragging | null, end: (d: Dragging) => void): void {
  held.clear();
  glide.fast = false;
  if (drag) end(drag);
}
