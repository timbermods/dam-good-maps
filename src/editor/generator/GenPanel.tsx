// The map generator over the map (Kyler, 2026-10-04): one panel at the left, vertically centred between the header
// and the bar, every setting showing at once; opening it never resizes the map. Two structures for Kyler's pick
// (mockups, `?gen=a` and `?gen=b`): A, the sheet (a title block, then the five groups in three columns); B, the board
// (the bar's own 76px cells, each group a band headed by its name like a tool's cell).

import type { ComponentChildren, JSX } from "preact";
import type { SessionInfo } from "../../worker/session";
import { tip } from "../../ui/Tooltip";
import { NameField, type DrawerModel } from "../Drawer";
import { genFields, GROUPS, onThisMap, type FieldKey } from "./fields";

/** The structure the mockups show: A, the sheet; B, the board; null, the panel as built before. */
export const GEN_LAYOUT: "a" | "b" | null = (() => {
  if (typeof location === "undefined") return null;
  const v = new URLSearchParams(location.search).get("gen");
  return v === "a" || v === "b" ? v : null;
})();

export interface GenPanelProps {
  model: DrawerModel;
  info: SessionInfo;
  trees: number;
  icon(template: string): string | null;
}

const MAP_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
    <path d="M9 3v15M15 6v15" />
  </svg>
);

const MAPS_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
  </svg>
);

/** Each group's picture, drawn as the bar's tools are (20px, a 1.8 stroke). */
const GROUP_ICONS: Record<string, JSX.Element> = {
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

function GroupIcon({ name }: { name: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {GROUP_ICONS[name]}
    </svg>
  );
}

/** What each group holds, for its name's tooltip. */
const GROUP_TIPS: Record<string, string> = {
  Terrain: "How the land rises, falls and terraces",
  Water: "Rivers, lakes, falls and the drought reserve",
  Hazards: "Badwater, thorns and unstable cores",
  Resources: "Forests, berries, ruins and mine sites",
  Difficulty: "What the start must have in reach",
};

/** Generate and Surprise me. */
function GoButtons(p: { m: DrawerModel; tall?: boolean }) {
  return (
    <>
      <button
        type="submit"
        class="primary gen-generate"
        disabled={p.m.busy}
        {...tip(
          p.m.changed
            ? "Make a new map from the changed settings"
            : "Make a new map",
          "Enter",
        )}
      >
        {p.tall ? <span class="gen-go-icon">{MAP_ICON}</span> : null}
        Generate
      </button>
      <button
        type="button"
        class="ghost gen-surprise"
        disabled={p.m.busy}
        {...tip("Make a map of any kind")}
        onClick={p.m.onSurprise}
      >
        Surprise me
      </button>
    </>
  );
}

/** The panel's form: Enter generates. */
function GenForm(p: {
  m: DrawerModel;
  children: ComponentChildren;
  class: string;
}) {
  return (
    <form
      class={p.class}
      aria-label="Settings"
      onSubmit={(e) => {
        e.preventDefault();
        if (!p.m.busy) p.m.onGenerate();
      }}
    >
      {p.children}
    </form>
  );
}

/** What is on the map: picture, number, name. */
function OnThisMap(p: {
  rows: [string, string, number][];
  icon(t: string): string | null;
  line?: boolean;
}) {
  return (
    <section
      class={`gen-otm${p.line ? " line" : ""}`}
      aria-labelledby="gen-otm-head"
    >
      <h3 id="gen-otm-head">On this map</h3>
      <ul>
        {p.rows.map(([t, name, n]) => {
          const src = p.icon(t);
          return (
            <li key={t}>
              {src ? (
                <img src={src} alt="" width={20} height={20} />
              ) : (
                <span class="shelf-blank" aria-hidden="true" />
              )}
              <b>{n.toLocaleString("en-GB")}</b> {name}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A: the sheet. A title block (Name, Generate and Surprise me; Theme; Seed and Size), then the five groups in three
 *  columns, each group under its own name; On this map closes the third column. */
function Sheet({ model: m, info, trees, icon }: GenPanelProps) {
  const f = genFields(m);
  const group = (name: string) => {
    const g = GROUPS.find((x) => x.name === name)!;
    return (
      <section class="sheet-group" aria-label={name}>
        <h3 {...tip(GROUP_TIPS[name])}>
          <GroupIcon name={name} />
          {name}
        </h3>
        {g.keys.map((k) => (
          <div class="sheet-item" key={k}>
            {f[k]}
          </div>
        ))}
      </section>
    );
  };
  return (
    <GenForm m={m} class="sheet">
      <div class="sheet-top">
        <div class="sheet-name">
          <NameField name={m.name} onRename={m.onRename} />
        </div>
        <div class="sheet-go">
          <GoButtons m={m} />
        </div>
        <div class="sheet-theme">{f.theme}</div>
        <div class="sheet-seed">{f.seed}</div>
        <div class="sheet-size">{f.size}</div>
      </div>
      <div class="sheet-cols">
        <div class="sheet-col">
          {group("Terrain")}
          {group("Difficulty")}
        </div>
        <div class="sheet-col">
          {group("Water")}
          {group("Hazards")}
        </div>
        <div class="sheet-col">
          {group("Resources")}
          <OnThisMap rows={onThisMap(info.features, trees)} icon={icon} />
        </div>
      </div>
    </GenForm>
  );
}

/** Where each setting sits on the board: [field, first column (2–8), columns, row within its band]. */
const BOARD: Record<string, [FieldKey, number, number, number][]> = {
  Terrain: [
    ["relief", 2, 2, 1],
    ["verticality", 4, 3, 1],
    ["variety", 7, 2, 1],
    ["highest", 2, 2, 2],
    ["terracing", 4, 2, 2],
    ["buildable", 6, 3, 2],
  ],
  Water: [
    ["rivers", 2, 2, 1],
    ["riverStyle", 4, 3, 1],
    ["falls", 7, 2, 1],
    ["riverFlow", 2, 3, 2],
    ["lakes", 5, 4, 2],
    ["reserve", 2, 4, 3],
    ["sources", 6, 3, 3],
  ],
  Hazards: [
    ["badwater", 2, 4, 1],
    ["badwaterDistance", 6, 3, 1],
    ["thorns", 2, 3, 2],
    ["cores", 5, 4, 2],
  ],
  Resources: [
    ["forest", 2, 2, 1],
    ["groves", 4, 3, 1],
    ["mines", 7, 2, 1],
    ["mix", 2, 3, 2],
    ["ruins", 5, 2, 2],
    ["geothermal", 7, 2, 2],
    ["berriesStart", 2, 2, 3],
    ["berries", 4, 3, 3],
    ["relics", 7, 2, 3],
  ],
  Difficulty: [
    ["wood", 2, 2, 1],
    ["walk", 4, 3, 1],
    ["bushes", 7, 2, 1],
    ["area", 2, 4, 2],
    ["ruinsWithin", 6, 3, 2],
  ],
};

const at = (col: number, span: number, row: number, rows = 1) => ({
  gridColumn: `${col} / span ${span}`,
  gridRow: `${row} / span ${rows}`,
});

/** B: the board. The bar's own cells, eight across: the first column holds Generate, Surprise me and each group's name
 *  (its picture above it, as a tool's cell); the other seven hold the settings, each a plate on whole cells. */
function Board({ model: m, info, trees, icon }: GenPanelProps) {
  const f = genFields(m, { compactMix: true });
  return (
    <GenForm m={m} class="board">
      <div class="board-band board-top">
        <div class="board-go" style={at(1, 1, 1, 3)}>
          <GoButtons m={m} tall />
        </div>
        <div style={at(2, 7, 1)}>{f.theme}</div>
        <div class="board-name" style={at(2, 4, 2, 2)}>
          <NameField name={m.name} onRename={m.onRename} />
        </div>
        <div style={at(6, 3, 2)}>{f.seed}</div>
        <div style={at(6, 3, 3)}>{f.size}</div>
      </div>
      {GROUPS.map((g) => {
        const rows = Math.max(...BOARD[g.name].map((b) => b[3]));
        return (
          <section class="board-band" key={g.name} aria-label={g.name}>
            <h3
              class="board-head"
              style={at(1, 1, 1, rows)}
              {...tip(GROUP_TIPS[g.name])}
            >
              <GroupIcon name={g.name} />
              {g.name}
            </h3>
            {BOARD[g.name].map(([k, col, span, row]) => (
              <div key={k} style={at(col, span, row)}>
                {f[k]}
              </div>
            ))}
          </section>
        );
      })}
      <OnThisMap rows={onThisMap(info.features, trees)} icon={icon} line />
    </GenForm>
  );
}

/** The generator over the map, in the structure the mockups ask for. */
export function GenPanel(p: GenPanelProps & { layout: "a" | "b" }) {
  return (
    <aside class={`gen gen-${p.layout}`} aria-label="Map Generator">
      {p.layout === "a" ? <Sheet {...p} /> : <Board {...p} />}
    </aside>
  );
}

/** The named tabs on the window's left edge, at its centre: A, Map Generator and Your maps; B, Map Generator alone.
 *  Open, they ride the panel's right edge, the open one lit. */
export function GenTabs(p: {
  layout: "a" | "b";
  open: boolean;
  onToggle(): void;
}) {
  return (
    <div class={`gen-tabs${p.open ? " open" : ""}`}>
      <button
        type="button"
        class="gen-tab"
        aria-pressed={p.open}
        {...tip(
          p.open
            ? "Close the map generator"
            : "Make a new map and change its settings",
        )}
        onClick={p.onToggle}
      >
        {MAP_ICON}
        <span>Map Generator</span>
      </button>
      {p.layout === "a" ? (
        <button
          type="button"
          class="gen-tab"
          aria-pressed={false}
          {...tip("Your maps")}
        >
          {MAPS_ICON}
          <span>Your maps</span>
        </button>
      ) : null}
    </div>
  );
}

export { MAPS_ICON };
