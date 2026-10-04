// The map generator (Kyler's pick, A, the sheet, 2026-10-04): one 640px panel over the map at the left, opened and
// closed by Map Generator in the header; opening it never resizes the map. It ends above the bar and its settings,
// vertically centred in the room between them and the header, and shows every setting at once, nothing scrolling: a
// title block (the map's Name, Generate and Surprise me; Theme; Seed and Size), then the five groups in two columns
// (Terrain, Water and Hazards; Resources, Difficulty and what is on the map), each setting on one line.

import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { SessionInfo } from "../../worker/session";
import { tip } from "../../ui/Tooltip";
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

/** The map's name, the same as the title: Enter or leaving the field renames it through the core (D443); a name the
 *  core refuses goes back, its reason in the field's name for a moment. Two lines kept, so a long name (up to 80
 *  letters) shows whole and never changes the panel. */
function NameField(p: { name: string; onRename(name: string): Promise<string | null> }) {
  const [text, setText] = useState(p.name);
  const [problem, setProblem] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => setText(p.name), [p.name]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = async () => {
    if (text.trim() === p.name) return setText(p.name);
    const why = await p.onRename(text);
    if (!why) return setProblem(null);
    setText(p.name);
    setProblem(why);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setProblem(null), 3000);
  };
  return (
    <div class="set plate gen-name" {...tip(problem ?? "The map's name: the title above the map")}>
      <label class={`set-label${problem ? " title-problem" : ""}`} for="map-name" role={problem ? "alert" : undefined}>
        Name
      </label>
      <textarea
        id="map-name"
        rows={2}
        value={text}
        maxLength={80}
        spellcheck={false}
        autoComplete="off"
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // (Enter renames here; it never makes a new map)
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setText(p.name);
          }
        }}
        onBlur={() => void save()}
      />
    </div>
  );
}

export interface GeneratorPanelProps {
  model: GeneratorModel;
  info: SessionInfo;
  /** The living trees on the map as it is now, edits included (dead ones aren't counted). */
  trees: number;
  /** Each object's picture, once the view can draw it (what is on the map). */
  icon(template: string): string | null;
}

export function GeneratorPanel({ model: m, info, trees, icon }: GeneratorPanelProps) {
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
  const counts = onThisMap(info.features, trees);
  return (
    <aside class="gen" aria-label="Map Generator">
      <form
        class="sheet"
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          if (!m.busy) m.onGenerate();
        }}
      >
        <div class="sheet-top">
          <NameField name={m.name} onRename={m.onRename} />
          <div class="sheet-go">
            <button type="submit" class="primary" disabled={m.busy} {...tip(m.changed ? "Make a new map from the changed settings" : "Make a new map", "Enter")}>
              Generate
            </button>
            <button type="button" class="ghost" disabled={m.busy} {...tip("Make a map of any kind")} onClick={m.onSurprise}>
              Surprise me
            </button>
          </div>
          <div class="sheet-wide">{f.theme}</div>
          <div>{f.seed}</div>
          <div>{f.size}</div>
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
              <h3 id="gen-otm-head">
                On this map
              </h3>
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
