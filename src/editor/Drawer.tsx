// The New map drawer (the page is the editor, D330; the design's option 1): the generator's settings, Generate,
// Surprise me and the map card, in the palette's place while it is open. The prototype's controls are inert:
// they show where everything goes, and Generate does nothing until the page's wiring is built.

import { useState } from "preact/hooks";
import { SIZE_PRESETS, THEME_NAMES, THEMES } from "../core/spec/mapspec";
import type { SessionInfo } from "../worker/session";
import { tip } from "../ui/Tooltip";

const SECTIONS = ["Terrain", "Water", "Hazards", "Resources", "Advanced: start rules", "Limits for this size"] as const;

export interface DrawerProps {
  info: SessionInfo;
  /** Each object's picture, once the view can draw it (the card's legend). */
  icon(template: string): string | null;
}

export function Drawer(p: DrawerProps) {
  const spec = p.info.spec;
  const [theme, setTheme] = useState(spec?.theme ?? "any");
  const [designedFor, setDesignedFor] = useState(p.info.designedFor);
  const preset = (Object.entries(SIZE_PRESETS).find(([, v]) => v === p.info.W && v === p.info.H)?.[0] ?? "custom") as keyof typeof SIZE_PRESETS | "custom";
  const [size, setSize] = useState<string>(preset);
  // what is on this map, from its features (the card's legend proper comes with the page's wiring)
  const count = (pred: (f: SessionInfo["features"][number]) => boolean) => p.info.features.filter(pred).length;
  const legend: [string, string, number][] = [
    ["UndergroundRuins", "Mine sites", count((f) => f.kind === "mapObject" && (f.params as { kind?: string }).kind === "mineSite")],
    ["RuinColumnH3", "Ruin fields", count((f) => f.kind === "ruinField")],
    ["BlueberryBush", "Berry patches", count((f) => f.kind === "berryPatch")],
    ["Pine", "Forests", count((f) => f.kind === "forest")],
    ["WaterSource", "Rivers", count((f) => f.kind === "river")],
  ];
  return (
    <aside class="drawer" aria-label="New map">
      <div class="drawer-head">
        <h2>New map</h2>
      </div>
      <div class="drawer-fields">
        <label class="field" for="drawer-theme" {...tip("The kind of land the map leans toward")}>
          <span class="field-head">Theme</span>
          <select id="drawer-theme" value={theme} onChange={(e) => setTheme((e.target as HTMLSelectElement).value as typeof theme)}>
            {THEMES.map((t) => (
              <option value={t} key={t}>
                {THEME_NAMES[t]}
              </option>
            ))}
          </select>
        </label>
        <label class="field" for="drawer-seed" {...tip("The same seed and settings make the same map")}>
          <span class="field-head">Seed</span>
          <input id="drawer-seed" value={spec ? String(spec.seed) : ""} readOnly />
        </label>
        <label class="field wide" for="drawer-size" {...tip("The map's size: the game's, or your own")}>
          <span class="field-head">Size</span>
          <select id="drawer-size" value={size} onChange={(e) => setSize((e.target as HTMLSelectElement).value)}>
            {(Object.keys(SIZE_PRESETS) as (keyof typeof SIZE_PRESETS)[]).map((k) => (
              <option value={k} key={k}>
                {k[0].toUpperCase() + k.slice(1)} ({SIZE_PRESETS[k]}×{SIZE_PRESETS[k]})
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        <div class="field wide">
          <span class="field-head" id="drawer-designed-for">
            Designed for
          </span>
          <div class="segmented" role="group" aria-labelledby="drawer-designed-for">
            {(["easy", "normal", "hard"] as const).map((d) => (
              <button type="button" key={d} aria-pressed={designedFor === d} title={`Balance the map for ${d[0].toUpperCase() + d.slice(1)}`} onClick={() => setDesignedFor(d)}>
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ul class="drawer-sections">
        {SECTIONS.map((s) => (
          <li key={s}>
            <button type="button" class="ghost" title={`The ${s.toLowerCase()} settings`}>
              {s}
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      <div class="drawer-go">
        <button type="button" class="primary" {...tip("Make a new map", "Enter")}>
          Generate
        </button>
        <button type="button" class="ghost" title="Make a map of any kind">
          Surprise me
        </button>
      </div>
      <section class="drawer-card" aria-label="This map">
        <p class="premise">{p.info.premise}</p>
        <ul class="drawer-legend">
          {legend
            .filter(([, , n]) => n > 0)
            .map(([t, name, n]) => {
              const src = p.icon(t);
              return (
                <li key={t} title={`Show the ${name.toLowerCase()} on the map`}>
                  {src ? <img src={src} alt="" width={24} height={24} /> : <span class="shelf-blank" aria-hidden="true" style={{ width: 24, height: 24 }} />}
                  <b>{n}</b> {name}
                </li>
              );
            })}
        </ul>
      </section>
    </aside>
  );
}
