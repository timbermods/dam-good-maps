// The editor's help: the keyboard shortcuts and the help (File menu → Keyboard shortcuts, Help; ? opens the
// shortcuts), each a dialog over the editor like About. One panel shows at a time; Esc and its Close button end it,
// and while it shows the editor's keys wait. The panels read their words from here and their keys from
// shortcuts.ts, so a new tool shows up without a change.

import { useEffect, useState } from "preact/hooks";
import { tip, keyParts } from "../../ui/Tooltip";
import { shortcutGroups } from "./shortcuts";

/** The repository's issue chooser: where a problem is reported (M13). */
export const REPORT_URL = "https://github.com/timbermods/dam-good-maps/issues/new/choose";
/** The README's install help, linked from Help. */
export const INSTALL_URL = "https://github.com/timbermods/dam-good-maps#install-a-map";

/** Report a problem's tooltip, on the menu entry and the Help dialog's button alike. */
export const REPORT_TIP = "Report a bug or an idea on GitHub";

export type HelpPanel = "shortcuts" | "help";

let shown: HelpPanel | null = null;
const listeners = new Set<() => void>();
/** Show a panel, or (null) close it. */
export function showHelpPanel(p: HelpPanel | null): void {
  shown = p;
  listeners.forEach((l) => l());
}
/** The panel showing now, or null. */
export const helpPanelShown = (): HelpPanel | null => shown;

/** Open the report page in a new tab. */
export function reportProblem(): void {
  window.open(REPORT_URL, "_blank", "noopener");
}

/** Hold the editor's keys while a panel shows: Esc closes it, Tab moves inside it, every other key waits. */
function useHeld(onClose: () => void) {
  useEffect(() => {
    const hold = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key !== "Tab" && e.key !== "Enter" && e.key !== " ") e.stopPropagation();
    };
    window.addEventListener("keydown", hold, true);
    return () => window.removeEventListener("keydown", hold, true);
  }, []);
}

/** The panel showing, if any: mounted once, in the header. */
export function HelpPanels() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const close = () => showHelpPanel(null);
  return shown === "shortcuts" ? <Shortcuts onClose={close} /> : shown === "help" ? <Help onClose={close} /> : null;
}

function Shortcuts(p: { onClose(): void }) {
  useHeld(p.onClose);
  const groups = shortcutGroups();
  return (
    <div class="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="dialog help-dialog shortcuts" role="dialog" aria-modal="true" aria-labelledby="shortcuts-head">
        <h2 id="shortcuts-head">Keyboard shortcuts</h2>
        <div class="shortcut-groups">
          {groups.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map((r) => (
                  <div key={r.what + r.keys.join()}>
                    <dt>{r.what}</dt>
                    <dd>
                      {r.keys.map((k) => (
                        <kbd class="cap" key={k}>
                          {keyParts(k).cap}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <footer>
          <button type="button" class="primary" {...tip("Close the shortcuts", "Esc")} onClick={p.onClose} autoFocus>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function Help(p: { onClose(): void }) {
  useHeld(p.onClose);
  return (
    <div class="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="dialog help-dialog help" role="dialog" aria-modal="true" aria-labelledby="help-head">
        <h2 id="help-head">Help</h2>
        <p>Dam Good Maps makes Timberborn maps. Generate one, shape it in your browser, then save it as a map the game loads.</p>
        <h3>Make a map</h3>
        <ol>
          <li>
            Open <strong>Map Generator</strong>, pick a theme and a size, then press <strong>Generate</strong>. Or open <strong>Real places</strong> and pick a map made from real land.
          </li>
          <li>
            Shape it. The brushes and forces are in the bar at the bottom, the trees, sources and ruins on the right. Pick one, then click the map.
          </li>
          <li>The dot at the top is green when the map is ready to play. Amber means something to look at: click it.</li>
        </ol>
        <h3>Save it to Timberborn</h3>
        <ol>
          <li>
            Press <strong>Save to Timberborn</strong>. The first time, pick <code>Documents\Timberborn\Maps</code>. In a browser that can't save to a folder, <strong>Download .timber</strong> instead and move the file there.
          </li>
          <li>
            In Timberborn, choose <strong>New game</strong> and pick the map. <a href={INSTALL_URL} target="_blank" rel="noopener" {...tip("Install help on GitHub")}>More about installing a map</a>.
          </li>
        </ol>
        <h3>Controls</h3>
        <ul>
          <li>Middle-drag turns the view, right-drag moves it, scroll zooms toward the pointer.</li>
          <li>Drag on the map to paint with the tool in hand.</li>
          <li>
            <strong>Undo</strong> and <strong>Redo</strong> are at the top right. <strong>History</strong> lists every step.
          </li>
          <li>
            Every shortcut is in <strong>File → Keyboard shortcuts</strong>.
          </li>
        </ul>
        <footer>
          <button type="button" class="ghost" {...tip(REPORT_TIP)} onClick={reportProblem}>
            Report a problem
          </button>
          <button type="button" class="primary" {...tip("Close the help", "Esc")} onClick={p.onClose} autoFocus>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
