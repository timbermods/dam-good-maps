// The map generator (Kyler's pick, A, the sheet, 2026-10-04): one 640px panel over the map at the left, opened and
// closed by Map Generator in the header; opening it never resizes the map. It ends above the bar and its settings,
// vertically centred in the room between them and the header, and shows every setting at once, nothing scrolling: a
// title block (the next map's Name, Generate and Surprise me; Theme; Seed and Size), then the five groups in two columns
// (Terrain, Water and Hazards; Resources, Difficulty and what is on the map), each setting on one line.

import type { JSX } from "preact";
import type { MapCounts } from "../features";
import { tip } from "../../ui/Tooltip";
import { fitsHeaderTwoLines, limitName } from "../nameFit";
import { genFields, GROUPS, onThisMap, type GroupName } from "./fields";
import type { GeneratorModel } from "./model";

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

/** The name for the next map: the field shows the open map's name until something is typed, and what is typed names the
 *  map Generate makes next (Enter or leaving the field keeps it; Esc, or a name left blank or unchanged, drops it). The
 *  open map is never renamed here: the title does that (D443). One line, a box about 24 letters wide (Kyler, 2026-10-04:
 *  no map's name needs more); a longer name scrolls in it. */
function NameField(p: { name: string; next: string | null; onNext(name: string | null): void }) {
  const text = p.next ?? p.name;
  const settle = () => {
    if (p.next !== null && (!p.next.trim() || p.next.trim() === p.name)) p.onNext(null);
  };
  return (
    <div class="set plate line gen-name" {...tip("Name for the next map")}>
      <label class="set-label" for="map-name">
        Name
      </label>
      <input
        id="map-name"
        class="set-text"
        value={text}
        maxLength={80}
        spellcheck={false}
        autoComplete="off"
        onInput={(e) => p.onNext(limitName(e.target as HTMLInputElement, text, fitsHeaderTwoLines))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // (Enter keeps the name here; it never makes a new map)
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            p.onNext(null);
          }
        }}
        onBlur={settle}
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
}

export function GeneratorPanel({ model: m, counts: held, icon }: GeneratorPanelProps) {
  const f = genFields(m);
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
  return (
    <aside class={`gen${m.blank ? " blank" : ""}`} aria-label="Map Generator">
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
          <button type="submit" class="primary sheet-act" disabled={m.busy} {...tip(m.changed ? "Make a new map from the changed settings" : "Make a new map", "Enter")}>
            Generate
          </button>
          <div>{f.theme}</div>
          <button type="button" class="ghost sheet-act" disabled={m.busy} {...tip("Make a map of any kind")} onClick={m.onSurprise}>
            Surprise me
          </button>
          <div>{f.size}</div>
          {/* Another like this in Reset settings' place (Kyler, 2026-10-06): generated maps only, greyed on an opened one */}
          <button type="button" class="ghost sheet-act" disabled={m.busy || !m.canAnother} {...tip(m.canAnother ? "A new map like this one, on different land" : "Only for a generated map")} onClick={m.onAnother}>
            Another like this
          </button>
        </div>
        <div class="sheet-cols">
          <div class="sheet-col">
            {group("Terrain")}
            {group("Water")}
            {group("Hazards")}
          </div>
          <div class="sheet-col">
            {group("Resources")}
            {group("Difficulty")}
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
          </div>
        </div>
      </form>
    </aside>
  );
}
