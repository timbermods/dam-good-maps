// The Maps drawer's settings (PLAN §5, §14.1): Terrain, Water, Hazards, Resources, Difficulty and Limits for this
// size, each a section that opens in place under its own row. Every field is the generator's settings page's as
// it was on dev (its name, its guard, PLAN §5.3), with no line under it (Kyler, 2026-10-03): the official maps'
// range a line gave is in the setting's tooltip. Difficulty holds the start rules; every map is made for Normal
// until the core drops difficulty after M9b's release.

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { clone } from "../../core/spec/mergepatch";
import type { MapSpec, Settings, ThemeId } from "../../core/spec/mapspec";
import { AREAS, BADWATER, band, BUILDABLE, CORES, FALLS, FLOWS, GROVES, LAKE_CHOICES, limitsText, OFF_SOME, reserveGuard, RESERVES, STYLES, type Choice } from "../../ui/settingsModel";

export interface SettingsProps {
  spec: MapSpec;
  seedText: string;
  onSeed(text: string): void;
  /** The seed is kept (typed, or from a link): Generate makes that map again. */
  seedPinned: boolean;
  onUnpinSeed(): void;
  /** Keep the seed in the box: Generate makes that map again. */
  onPinSeed(): void;
  onSize(size: { x: number; y: number }): void;
  onTheme(theme: ThemeId): void;
  onSettings(s: Settings): void;
  onReset(): void;
}

/** The sections, in the drawer's order. */
export const SECTIONS = ["Terrain", "Water", "Hazards", "Resources", "Difficulty", "Limits for this size"] as const;
export type Section = (typeof SECTIONS)[number];

/** What each section holds, for its line's tooltip (D351). */
export const SECTION_TIPS: Record<Section, string> = {
  Terrain: "How the land rises, falls and terraces",
  Water: "Rivers, lakes, falls and the drought reserve",
  Hazards: "Badwater, thorns and unstable cores",
  Resources: "Forests, berries, ruins and mine sites",
  Difficulty: "What the start must have in reach",
  "Limits for this size": "What a map this size can hold",
};

/** What each setting does, in one line, for its tooltip (D351). */
export const HINT: Record<string, string> = {
  seed: "The same seed and settings make the same map",
  size: "The map's size: the game's, or your own",
  "size-x": "The map's width in tiles (48 to 256)",
  "size-y": "The map's height in tiles (48 to 256)",
  relief: "How much the land rises and falls",
  verticality: "How steep and tall the cliffs and slopes are",
  highest: "The highest level the land may reach",
  terracing: "How much land is cut into terraces",
  buildable: "Flat land to build on",
  rivers: "How many rivers cross the map",
  "river-style": "How the rivers run: straight, meandering or braided",
  "river-flow": "Water the rivers carry",
  reserve: "Water kept to last through a drought",
  lakes: "How many lakes and basins the map has",
  falls: "How many waterfalls the rivers make",
  badwater: "Badwater on the map",
  "badwater-distance": "Badwater's distance from the start",
  thorns: "Thorns that block some ways",
  cores: "How many unstable cores the map has: an advanced hazard",
  forest: "How thickly trees grow",
  groves: "How big each grove is",
  "mix-pine": "How many of the trees are pines",
  "mix-birch": "How many of the trees are birches",
  "mix-oak": "How many of the trees are oaks",
  "mix-succulent": "How many of the trees are succulents",
  "berries-start": "Berry bushes near the start",
  berries: "Berry bushes elsewhere",
  ruins: "Ruins and scrap metal",
  relics: "How many relics are placed",
  geothermal: "Whether geothermal fields are placed, and how many",
  mines: "How many mine sites the map has",
  "start-area": "How roomy the land round the start is",
  "rule-water": "Longest walk to water",
  "rule-wood": "Logs the start reaches on foot",
  "rule-bushes": "Berry bushes in walking reach",
  "rule-ruins": "How far ruins stay from the start",
};

/** The official maps' range a setting's reference line gave, as a short phrase for its tooltip ("Official maps:
 *  9–15"; Kyler, 2026-10-03: no line under any setting, and nothing else of it moves into the tooltip). */
export function officialPhrase(band: string | undefined): string {
  // (to the sentence's end, a decimal point aside; the range only, in its shortest words)
  const m = /Official (?:maps|groves)(?:[^.]|\.(?=\d))*/.exec(band ?? "");
  if (!m) return "";
  return m[0]
    .split(", ")[0]
    .replace(/^Official maps this size:/, "Official maps:")
    .replace(/^Official groves: most about (\d+) trees/, "Official maps: about $1 trees")
    .replace(/^Official maps all top out at (\d+)/, "Official maps: $1")
    .replace(/ within 20 tiles' walk$/, "")
    .replace(/(most \d+) tiles$/, "$1")
    .replace(/ have some$/, "")
    .replace(/10,000 tiles$/, "10k tiles")
    .trim();
}

/** A setting's tooltip: what it does, then the official maps' range where it has one (D351). */
function tipOf(id: string, band?: string): string {
  const o = officialPhrase(band);
  return [HINT[id], o].filter(Boolean).join(" · ");
}

function Slider(props: { id: string; label: string; value: number; min: number; max: number; step?: number; unit?: string; band?: string; onChange(v: number): void }) {
  return (
    <label class="field" for={props.id} title={tipOf(props.id, props.band)}>
      <span class="field-head">
        {props.label}
        <output for={props.id}>
          {props.value}
          {props.unit ?? ""}
        </output>
      </span>
      <input id={props.id} type="range" min={props.min} max={props.max} step={props.step ?? 1} value={props.value} onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))} />
    </label>
  );
}

function Pick<T extends string>(props: { id: string; label: string; value: T; choices: Choice<T>[]; band?: string; onChange(v: T): void }) {
  return (
    <label class="field" for={props.id} title={tipOf(props.id, props.band)}>
      <span class="field-head">{props.label}</span>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as T)}>
        {props.choices.map((c) => (
          <option value={c.value} key={c.value} disabled={!!c.disabled}>
            {c.label}
            {c.disabled ? ` (${c.disabled})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Num(props: { id: string; label: string; value: number; min: number; max: number; band?: string; onChange(v: number): void }) {
  // what is typed stays until it is committed (Enter, Tab or leaving): the page redraws often (the water's
  // frames), and a redraw must not put the old number back mid-typing
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    setDraft(null);
    const v = Math.round(Number(text));
    if (text.trim() !== "" && Number.isFinite(v)) props.onChange(Math.min(props.max, Math.max(props.min, v)));
  };
  return (
    <label class="field" for={props.id} title={tipOf(props.id, props.band)}>
      <span class="field-head">{props.label}</span>
      <input
        id={props.id}
        type="number"
        min={props.min}
        max={props.max}
        value={draft ?? props.value}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onChange={(e) => commit((e.target as HTMLInputElement).value)}
        onBlur={(e) => draft !== null && commit((e.target as HTMLInputElement).value)}
      />
    </label>
  );
}

/** One section's fields, as its sheet shows them. */
export function SectionFields(p: SettingsProps & { section: Section }): ComponentChildren {
  const { spec } = p;
  const s = spec.settings;
  const W = spec.size.x;
  const H = spec.size.y;
  const set = (patch: (c: Settings) => void) => {
    const c = clone(s);
    patch(c);
    p.onSettings(c);
  };
  const reserves: Choice<Settings["water"]["droughtReserve"]>[] = RESERVES.map((c) => {
    const g = reserveGuard(spec.designedFor, c.value, W, H);
    return g.fits ? c : { ...c, disabled: "too big for this map size" };
  });
  switch (p.section) {
    case "Terrain":
      return (
        <>
          <Slider id="relief" label="Relief" value={s.terrain.relief} min={0} max={100} band={band("relief", spec)} onChange={(v) => set((c) => (c.terrain.relief = v))} />
          <Slider id="verticality" label="Verticality" value={s.terrain.verticality} min={0} max={100} band={band("verticality", spec)} onChange={(v) => set((c) => (c.terrain.verticality = v))} />
          <Slider id="highest" label="Highest terrain" value={s.terrain.highestTerrain} min={10} max={16} band={band("highestTerrain", spec)} onChange={(v) => set((c) => (c.terrain.highestTerrain = v))} />
          <Slider id="terracing" label="Terracing" value={s.terrain.terracing} min={0} max={100} band={band("terracing", spec)} onChange={(v) => set((c) => (c.terrain.terracing = v))} />
          <Pick id="buildable" label="Buildable land" value={s.terrain.buildableLand} choices={BUILDABLE} band={band("buildableLand", spec)} onChange={(v) => set((c) => (c.terrain.buildableLand = v))} />
        </>
      );
    case "Water":
      return (
        <>
          <Slider id="rivers" label="Rivers" value={s.water.rivers} min={0} max={3} band={band("rivers", spec)} onChange={(v) => set((c) => (c.water.rivers = v))} />
          <Pick id="river-style" label="River style" value={s.water.riverStyle} choices={STYLES} band={band("riverStyle", spec)} onChange={(v) => set((c) => (c.water.riverStyle = v))} />
          <Pick id="river-flow" label="River flow" value={s.water.riverFlow} choices={FLOWS} band={band("riverFlow", spec)} onChange={(v) => set((c) => (c.water.riverFlow = v))} />
          <Pick
            id="reserve"
            label="Drought reserve"
            value={s.water.droughtReserve}
            choices={reserves}
            band={band("droughtReserve", spec)}
            onChange={(v) => set((c) => (c.water.droughtReserve = v))}
          />
          <Pick id="lakes" label="Lakes and basins" value={s.water.lakes} choices={LAKE_CHOICES} band={band("lakes", spec)} onChange={(v) => set((c) => (c.water.lakes = v))} />
          <Pick id="falls" label="Waterfalls" value={s.water.waterfalls} choices={FALLS} band={band("waterfalls", spec)} onChange={(v) => set((c) => (c.water.waterfalls = v))} />
        </>
      );
    case "Hazards":
      return (
        <>
          <Pick id="badwater" label="Badwater" value={s.hazards.badwater} choices={BADWATER} band={band("badwater", spec)} onChange={(v) => set((c) => (c.hazards.badwater = v))} />
          <Slider
            id="badwater-distance"
            label="Badwater distance"
            value={s.hazards.badwaterDistance}
            min={8}
            max={60}
            unit=" tiles"
            band={band("badwaterDistance", spec)}
            onChange={(v) =>
              set((c) => {
                c.hazards.badwaterDistance = v;
                c.start.rules.badwaterWithin = v;
              })
            }
          />
          <Pick id="thorns" label="Thorn belts" value={s.hazards.thornBelts} choices={OFF_SOME} band={band("thornBelts", spec)} onChange={(v) => set((c) => (c.hazards.thornBelts = v))} />
          <Pick id="cores" label="Unstable cores (advanced)" value={s.hazards.unstableCores} choices={CORES} band={band("unstableCores", spec)} onChange={(v) => set((c) => (c.hazards.unstableCores = v))} />
        </>
      );
    case "Resources":
      return (
        <>
          <Slider id="forest" label="Forest density" value={s.resources.forestDensity} min={50} max={200} step={5} unit="%" band={band("forestDensity", spec)} onChange={(v) => set((c) => (c.resources.forestDensity = v))} />
          <Pick id="groves" label="Grove size" value={s.resources.groveSize} choices={GROVES} band={band("groveSize", spec)} onChange={(v) => set((c) => (c.resources.groveSize = v))} />
          <fieldset class="mix">
            <legend>Species mix</legend>
            {(["pine", "birch", "oak", "succulent"] as const).map((k) => (
              <Num key={k} id={`mix-${k}`} label={k[0].toUpperCase() + k.slice(1)} value={s.resources.speciesMix[k]} min={0} max={100} onChange={(v) => set((c) => (c.resources.speciesMix[k] = v))} />
            ))}
          </fieldset>
          <Slider id="berries-start" label="Berries near start" value={s.resources.berriesNearStart} min={20} max={100} band={band("berriesNearStart", spec)} onChange={(v) => set((c) => (c.resources.berriesNearStart = v))} />
          <Slider id="berries" label="Berry bushes elsewhere" value={s.resources.berryBushes} min={50} max={300} step={5} unit="%" band={band("berryBushes", spec)} onChange={(v) => set((c) => (c.resources.berryBushes = v))} />
          <Slider id="ruins" label="Ruins and scrap" value={s.resources.ruins} min={25} max={300} step={5} unit="%" band={band("ruins", spec)} onChange={(v) => set((c) => (c.resources.ruins = v))} />
          <Pick id="relics" label="Relics" value={s.resources.relics} choices={OFF_SOME} band={band("relics", spec)} onChange={(v) => set((c) => (c.resources.relics = v))} />
          <Pick id="geothermal" label="Geothermal fields" value={s.resources.geothermal} choices={OFF_SOME} band={band("geothermal", spec)} onChange={(v) => set((c) => (c.resources.geothermal = v))} />
          <Slider id="mines" label="Mine sites" value={s.resources.mineSites} min={1} max={4} band={band("mineSites", spec)} onChange={(v) => set((c) => (c.resources.mineSites = v))} />
        </>
      );
    case "Difficulty":
      return (
        <>
          <Num id="rule-wood" label="Starting wood" value={s.start.rules.woodWithin20} min={0} max={800} band={band("woodWithin20", spec)} onChange={(v) => set((c) => (c.start.rules.woodWithin20 = v))} />
          <Num id="rule-water" label="Max walk to water" value={s.start.rules.waterWithin} min={4} max={40} band={band("waterWithin", spec)} onChange={(v) => set((c) => (c.start.rules.waterWithin = v))} />
          <Num id="rule-bushes" label="Starting berries" value={s.start.rules.bushesWithin20} min={0} max={200} band={band("bushesWithin20", spec)} onChange={(v) => set((c) => (c.start.rules.bushesWithin20 = v))} />
          <Pick id="start-area" label="Start area" value={s.start.area} choices={AREAS} onChange={(v) => set((c) => (c.start.area = v))} />
          <Num id="rule-ruins" label="No ruins within" value={s.start.rules.ruinsWithin} min={0} max={60} band={band("ruinsWithin", spec)} onChange={(v) => set((c) => (c.start.rules.ruinsWithin = v))} />
        </>
      );
    case "Limits for this size":
      return (
        <ul class="limits">
          {limitsText(W, H).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      );
  }
}
