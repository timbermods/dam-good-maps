// The object window (Layout 2, Kyler's sitting, 2026-10-03): an object's settings in a small window directly above
// the objects list, its edges on the list's, the list's own panel look, each setting's name above its control as on
// the bar. It shows only while an object is picked (in the list to place, or on the map), and its height follows
// what that object has; the list itself never moves. A picked object's window ends with its Put it down (×).

import type { ComponentChildren } from "preact";
import { tip } from "../ui/Tooltip";

/** One setting: its name above its control (none: the control alone, a row of buttons say). */
export interface ObjectGroup {
  key: string;
  label?: string;
  node: ComponentChildren;
}

/** What the window holds for the object picked; `onClose` puts a picked object down (×). */
export interface ObjectPanel {
  label: string;
  groups: ObjectGroup[];
  onClose?: () => void;
}

export function ObjectWindow({ panel }: { panel: ObjectPanel | null }) {
  if (!panel) return null;
  const close = panel.onClose ? (
    <button type="button" class="linkish ow-close" aria-label="Put it down" {...tip("Put it down", "X", "Esc")} onClick={panel.onClose}>
      ×
    </button>
  ) : null;
  // (the × on the first setting's name line, at the window's right; with no name there, at the end of its controls)
  const first = panel.groups[0];
  return (
    <div class="object-window" role="group" aria-label={panel.label}>
      {panel.groups.map((g) => (
        <div class="ow-group" key={g.key}>
          {g.label ? (
            <span class="cell-head ow-head">
              {g.label}
              {g === first ? close : null}
            </span>
          ) : null}
          <div class="cell-body ow-body">
            {g.node}
            {g === first && !g.label ? close : null}
          </div>
        </div>
      ))}
    </div>
  );
}
