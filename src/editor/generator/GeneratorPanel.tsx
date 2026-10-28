// The map generator (Kyler's pick, A, the sheet, 2026-10-04): one panel over the map at the left, opened and closed by
// Map Generator in the header; opening it never resizes the map. It ends above the bar and its settings and shows every
// setting at once, nothing scrolling: a title block (the next map's Name and Seed, Generate; Theme and Surprise me; Size
// and Another like this), then the five groups in columns (Terrain, Water and Hazards; Resources, Difficulty and what is
// on the map), each setting on one line. Showcase… at the foot of the last column opens Showcase mode's sheet over the
// columns (Showcase.tsx). Two columns 640px wide where the window is tall; three wider, and tighter in a short window,
// where it is not (panelFit.ts). Enter anywhere in it generates; Esc closes it.

import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { MapCounts } from "../features";
import { tip } from "../../ui/Tooltip";
import { fitsHeaderTwoLines, limitName } from "../nameFit";
import { genFields, GROUPS, onThisMap, type GroupName } from "./fields";
import type { GeneratorModel } from "./model";
import { usePanelShape } from "./panelFit";
import { ShowcaseButton, ShowcaseSheet } from "./Showcase";

/** Each group's picture, drawn as the bar's tools are (a 1.8 stroke). */
const GROUP_ICONS: Record<GroupName, JSX.Element> = {
  Terrain: <path d="M1.5 16.5l5-8 3 4.5 2.5-3.5 6.5 7z" />,
  Water: (
    <>
      <path d="M2 7c2.2-1.6 3.8-1.6 6 0s3.8 1.6 6 0 3.8-1.6 4 0" />
      <path d="M2 12c2.2-1.6 3.8-1.6 6 0s3.8 1.6 6 0 3.8-1.6 4 0" />
      <path d="M2 17c2.2-1.6 3.8-1.6 6 0s3.8 1.6 6 0 3.8-1.6 4 0" />
    </>
  ),
  Hazards: (
    <>
      <path d="M10 2.5l8 14.5H2z" />
      <path d="M10 8v4M10 14.5v.2" />
    </>
  ),
  Resources: (
    <>
      <path d="M10 2l5 7h-2.5l3.5 5H4l3.5-5H5z" />
      <path d="M10 14v4" />
    </>
  ),
  Difficulty: (
    <>
      <path d="M4.5 18V2.5" />
      <path d="M4.5 3h10l-2.5 3.5 2.5 3.5h-10" />
    </>
  ),
};

/** What each group holds, for its name's tooltip. */
const GROUP_TIPS: Record<GroupName, string> = {
  Terrain: "How the land rises, falls and terraces",
  Water: "Rivers, lakes, falls and the drought reserve",
  Hazards: "Badwater, thorns and unstable cores",
  Resources: "Forests, berries, ruins and mine sites",
  Difficulty: "What the start must have in reach",
};

/** The name for the next map: the field starts empty, the open map's name in grey in it, and what is typed names the map
 *  Generate makes next (Enter generates it; a name left blank is no name). The open map is never renamed here: the title
 *  does that (D443). One line, a box about 24 letters wide (Kyler, 2026-10-04: no map's name needs more); a longer name
 *  scrolls in it. */
function NameField(p: { name: string; next: string | null; onNext(name: string | null): void }) {
  const text = p.next ?? "";
  return (
    <div class="set plate line gen-name" {...tip("Names the next map")}>
      <label class="set-label" for="map-name">
        Name
      </label>
      <input
        id="map-name"
        class="set-text"
        value={text}
        placeholder={p.name}
        maxLength={80}
        spellcheck={false}
        autoComplete="off"
        onInput={(e) => {
          p.onNext(limitName(e.target as HTMLInputElement, text, fitsHeaderTwoLines) || null);
        }}
      />
    </div>
  );
}

export interface GeneratorPanelProps {
  model: GeneratorModel;
  /** What the map holds now, counted from its own objects (edits included). */
  counts: MapCounts;
  /** Each object's picture, once the view can draw it (what is on the map). */
  icon(template: string): string | null;
  /** Close the panel (Esc). */
  onClose(): void;
}

export function GeneratorPanel({ model: m, counts: held, icon, onClose }: GeneratorPanelProps) {
  const f = genFields(m);
  const shape = usePanelShape();
  // (the keys and the buttons read the model of the moment they are pressed: a size typed a moment ago has reached it)
  const latest = useRef({ m, onClose });
  latest.current = { m, onClose };
  // a short window cuts the panel and it scrolls inside itself: a soft fade at its foot says more lies below, and goes
  // once the foot is reached
  const root = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const look = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    look();
    el.addEventListener("scroll", look, { passive: true });
    const watch = new ResizeObserver(look);
    watch.observe(el);
    if (el.firstElementChild) watch.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", look);
      watch.disconnect();
    };
  }, []);
  // Esc closes the panel, and only the panel: with the focus in it, on the button that opened it, or on nothing (a held
  // brush stays in hand; a field, a menu or a dialog elsewhere keeps its own Esc, and so does the Showcase sheet, which
  // closes itself first). Heard before the editor's own keys, which would put the brush away too.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const at = e.target as HTMLElement | null;
      const mine = !at || at === document.body || !!root.current?.contains(at) || !!at.closest?.("header.editor-bar .new-map");
      if (!mine || document.querySelector(".dialog-backdrop") || at?.closest?.(".showcase, [role=\"dialog\"], [role=\"menu\"]")) return;
      e.preventDefault();
      e.stopPropagation();
      // (an open Showcase sheet closes first wherever the focus is: it takes the focus after it is drawn, and an Esc
      // pressed before that is still the sheet's)
      if (latest.current.m.showcase.open) latest.current.m.showcase.onOpen(false);
      else latest.current.onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  // Enter anywhere in the panel generates (a field, a slider, a button: Space presses a button, Enter never does). What is
  // typed in the field being left counts first: leaving it commits it, and Generate runs once the page has taken it.
  const generateKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if ((e.target as HTMLElement).closest(".showcase")) return;
    e.preventDefault();
    const at = document.activeElement;
    if (at instanceof HTMLInputElement && at.type === "text") at.blur();
    window.setTimeout(() => {
      if (!latest.current.m.busy) latest.current.m.onGenerate();
    }, 0);
  };
  const group = (name: GroupName) => (
    <section class="gen-group" aria-label={name} key={name}>
      <h3 {...tip(GROUP_TIPS[name])}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {GROUP_ICONS[name]}
        </svg>
        {name}
      </h3>
      {GROUPS.find((g) => g.name === name)!.keys.map((k) => (
        <div class="gen-item" key={k}>
          {f[k]}
        </div>
      ))}
    </section>
  );
  const counts = onThisMap(held);
  const sc = m.showcase;
  // (closing the sheet gives the focus back to the button that opened it, when the sheet had it)
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(sc.open);
  useEffect(() => {
    // (a short window scrolls the panel: the sheet opens from the panel's foot, so its head is brought into view)
    const cols = root.current?.querySelector<HTMLElement>(".sheet-cols");
    if (sc.open && !wasOpen.current && root.current && cols) root.current.scrollTop = Math.min(root.current.scrollTop, cols.offsetTop);
    const at = document.activeElement;
    if (wasOpen.current && !sc.open && (!at || at === document.body || root.current?.contains(at))) opener.current?.focus({ preventScroll: true });
    wasOpen.current = sc.open;
  }, [sc.open]);
  return (
    <aside ref={root} class={`gen gen-panel c${shape.cols}${shape.tight ? " tight" : ""}${m.blank ? " blank" : ""}`} aria-label="Map Generator" onKeyDown={generateKey}>
      <form
        class="sheet"
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          if (!m.busy) m.onGenerate();
        }}
      >
        {/* three rows (Kyler, 2026-10-04): Name and Seed, then Generate; Theme, then Surprise me; Size, then Reset
            settings; the three buttons one width, stacked, each level with its row */}
        <div class="sheet-top">
          <div class="sheet-row1">
            <NameField name={m.name} next={m.nextName} onNext={m.onNextName} />
            {f.seed}
          </div>
          <button type="submit" class="primary sheet-act" disabled={m.busy} {...tip(m.changed ? "Make a map from the settings as changed" : "Make a map from the settings shown", "Enter")}>
            Generate
          </button>
          <div>{f.theme}</div>
          <button type="button" class="ghost sheet-act" disabled={m.busy} {...tip("Make a map of any kind")} onClick={m.onSurprise}>
            Surprise me
          </button>
          <div>{f.size}</div>
          {/* Another like this in Reset settings' place (Kyler, 2026-10-06): generated maps only, greyed on an opened one */}
          <button type="button" class="ghost sheet-act" disabled={m.busy || !m.canAnother} {...tip(m.canAnother ? "The open map's own settings, on new land" : "Only for a generated map")} onClick={m.onAnother}>
            Another like this
          </button>
        </div>
        <div class={`sheet-cols${sc.open ? " covered" : ""}`}>
          <div class="sheet-col">
            {group("Terrain")}
            {shape.cols === 2 ? group("Water") : null}
            {group("Hazards")}
          </div>
          {shape.cols === 3 ? (
            <div class="sheet-col">
              {group("Water")}
              {group("Difficulty")}
            </div>
          ) : null}
          <div class="sheet-col">
            {group("Resources")}
            {shape.cols === 2 ? group("Difficulty") : null}
            <section class="gen-otm" aria-labelledby="gen-otm-head">
              {/* its heading's line holds Reset settings at the right (Kyler, 2026-10-06): the panel no taller */}
              <div class="gen-otm-head">
                <h3 id="gen-otm-head">
                  On this map
                </h3>
                <button type="button" class="ghost sheet-act" {...tip("Put every setting back to the theme's own")} onClick={m.onReset}>
                  Reset settings
                </button>
              </div>
              <ul>
                {counts.map(([t, name, n]) => {
                  const src = icon(t);
                  return (
                    <li key={t}>
                      {src ? <img src={src} alt="" width={20} height={20} /> : <span class="shelf-blank" aria-hidden="true" />}
                      <b>{n.toLocaleString("en-GB")}</b> {name}
                    </li>
                  );
                })}
              </ul>
            </section>
            {/* in the list's empty place at the column's foot, under Reset settings (the panel no taller) */}
            <ShowcaseButton m={sc} refEl={opener} />
          </div>
          {sc.open ? <ShowcaseSheet m={sc} /> : null}
        </div>
      </form>
      <div class={`gen-more${more ? " on" : ""}`} aria-hidden="true" />
    </aside>
  );
}
