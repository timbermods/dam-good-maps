// The editor's help: the keyboard shortcuts and the help (File menu → Keyboard shortcuts, Help; ? opens the
// shortcuts), each a dialog over the editor like About. One panel shows at a time; Esc and its Close button end it,
// and while it shows the editor's keys wait. The panels read their words from here and their keys from
// shortcuts.ts, so a new tool shows up without a change. Help speaks to the pointer in hand (#1074): to a finger, the
// gestures first (EDITOR_PLAN §7, "Touch"); on a phone, the gestures alone, with no mouse and no keys.

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

/** How Help speaks: to a mouse, to a finger with the desktop's layout (a tablet), or to a finger on a phone. */
type Reader = "mouse" | "touch" | "phone";

function reader(): Reader {
  if (typeof document !== "undefined" && document.documentElement.dataset.phone) return "phone";
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? "touch" : "mouse";
}

/** What a finger does, first on a touch screen (EDITOR_PLAN §7, "Touch"; the double tap as #1074's ruling has it). */
function TouchLines(p: { phone: boolean }) {
  return (
    <>
      <li>Tap the map to read a tile. With a tool in hand, tap or drag on the map to use it.</li>
      <li>Drag one finger to move the view while nothing is in hand.</li>
      <li>Pinch to zoom. Turn two fingers to turn the view, and move them up or down together to tilt it.</li>
      <li>Double tap to zoom in where you tap. On an object, the first tap also selects it.</li>
      <li>Tap with two fingers to undo, with three to redo.</li>
      <li>A second finger stops a stroke, and nothing is changed.</li>
      <li>
        Hold a finger on a button to see what it does. In <strong>Your maps</strong>, hold a map to select several.
      </li>
      {p.phone ? (
        <li>
          The tools are in a row at the foot, or down the left side when the phone is on its side. Tap a tool again to put it
          down. <strong>Show</strong> and <strong>Objects</strong> open their own sheets.
        </li>
      ) : null}
    </>
  );
}

function Help(p: { onClose(): void }) {
  useHeld(p.onClose);
  // (read once, as it opens: the page's layout comes from the screen's own size, which nothing on the page changes,
  // ui/phoneRoot.ts)
  const [who] = useState(reader);
  if (who !== "mouse") return <TouchHelp onClose={p.onClose} phone={who === "phone"} />;
  return (
    <div class="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="dialog help-dialog help" role="dialog" aria-modal="true" aria-labelledby="help-head">
        <h2 id="help-head">Help</h2>
        <p>Dam Good Maps makes Timberborn maps. Generate one, shape it in your browser, then save it as a map the game loads.</p>
        <h3>Make a map</h3>
        <ol>
          <li>
            Open <strong>Map Generator</strong>, pick a theme and a size, then press <strong>Generate</strong>. For a map with a story, press <strong>Showcase…</strong> at the panel's foot: it searches for a few minutes and offers the best three. Or open <strong>Real places</strong> and pick a map made from real land.
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
            On a phone, <strong>Save</strong> opens the share sheet. Send the file to the computer that plays, then move it there.
          </li>
          <li>
            In Timberborn, choose <strong>New game</strong> and pick the map. <a href={INSTALL_URL} target="_blank" rel="noopener" {...tip("Install help on GitHub")}>More about installing a map</a>.
          </li>
        </ol>
        <h3>Controls</h3>
        <ul>
          <li>Middle-drag turns the view, right-drag moves it, scroll zooms toward the pointer.</li>
          <li>On a touch screen, two fingers move, zoom, turn and tilt the view, and one finger moves it with nothing in hand. A two-finger tap undoes, a three-finger tap redoes.</li>
          <li>Drag on the map to paint with the tool in hand.</li>
          <li>
            Select an area first, and the brushes and forces stay inside it. A brush in hand can mark one too.
          </li>
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

/** Help to a finger (#1074): the gestures first (Controls), then making a map and saving it, every step a tap. On a phone the
 *  steps follow the phone's layout and nothing names a mouse or a key; a tablet keeps the mouse and the keys after them. */
function TouchHelp(p: { onClose(): void; phone: boolean }) {
  return (
    <div class="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="dialog help-dialog help" role="dialog" aria-modal="true" aria-labelledby="help-head">
        <h2 id="help-head">Help</h2>
        <p>Dam Good Maps makes Timberborn maps. Generate one, shape it in your browser, then save it as a map the game loads.</p>
        <h3>Controls</h3>
        <ul>
          <TouchLines phone={p.phone} />
          <li>Select an area first, and the brushes and forces stay inside it. A brush in hand can mark one too.</li>
          {p.phone ? (
            <li>
              <strong>Undo</strong> and <strong>Redo</strong> are in the bar at the top. <strong>History</strong>, in the menu, lists every step.
            </li>
          ) : (
            <>
              <li>
                <strong>Undo</strong> and <strong>Redo</strong> are at the top right. <strong>History</strong> lists every step.
              </li>
              <li>With a mouse, middle-drag turns the view, right-drag moves it and scroll zooms toward the pointer.</li>
              <li>
                Every shortcut is in <strong>File → Keyboard shortcuts</strong>.
              </li>
            </>
          )}
        </ul>
        <h3>Make a map</h3>
        <ol>
          <li>
            {p.phone ? "Open the menu, then " : "Open "}
            <strong>Map Generator</strong>, pick a theme and a size, then tap <strong>Generate</strong>. For a map with a story, tap <strong>Showcase…</strong>: it searches for a few minutes and offers the best three. Or open <strong>Real places</strong> and pick a map made from real land.
          </li>
          {p.phone ? (
            <li>
              Shape it. The tools are in the row at the foot, the trees, sources and ruins under <strong>Objects</strong>. Pick one, then tap or drag on the map.
            </li>
          ) : (
            <li>Shape it. The brushes and forces are in the bar at the bottom, the trees, sources and ruins on the right. Pick one, then tap or drag on the map.</li>
          )}
          <li>The dot at the top is green when the map is ready to play. Amber means something to look at: tap it.</li>
        </ol>
        <h3>Save it to Timberborn</h3>
        <ol>
          {p.phone ? (
            <li>
              Tap <strong>Save</strong>. It opens the share sheet: send the file to the computer that plays, then move it to <code>Documents\Timberborn\Maps</code>.
            </li>
          ) : (
            <li>
              Tap <strong>Save to Timberborn</strong>. The first time, pick <code>Documents\Timberborn\Maps</code>. In a browser that can't save to a folder, <strong>Download .timber</strong> instead and move the file there.
            </li>
          )}
          <li>
            In Timberborn, choose <strong>New game</strong> and pick the map. <a href={INSTALL_URL} target="_blank" rel="noopener" {...tip("Install help on GitHub")}>More about installing a map</a>.
          </li>
        </ol>
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
