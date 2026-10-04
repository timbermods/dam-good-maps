// Every setting of the map generator as one control in the bar's control language (Kyler, 2026-10-04): a number is a
// slider with its value at the right of its name, a choice is the one segmented look, labels said once, keys only in
// tooltips. The layouts (the panel's arrangement) place these; nothing here knows where it sits. Each field's guard is
// the generator's settings page's (PLAN §5.3); its tooltip says what it does and the official maps' range.

import type { ComponentChildren, JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { clone } from "../../core/spec/mergepatch";
import {
  SIZE_PRESETS,
  THEME_NAMES,
  THEMES,
  type SizePreset,
  type Settings,
  type ThemeId,
} from "../../core/spec/mapspec";
import {
  AREAS,
  BADWATER,
  band,
  BUILDABLE,
  CORES,
  FALLS,
  FLOWS,
  GROVES,
  highestMax,
  LAKE_CHOICES,
  OFF_SOME,
  reserveGuard,
  RESERVES,
  setVerticality,
  SOURCES,
  STYLES,
  type Choice,
} from "../../ui/settingsModel";
import { tip } from "../../ui/Tooltip";
import { ChoiceSetting, NumberSetting } from "../settings";
import { HINT, tipOf, type SettingsProps } from "../drawer/settings";

/** What each theme leans toward, for its option's tooltip. */
const THEME_TIPS: Record<ThemeId, string> = {
  any: "Any kind of land",
  riverValley: "A river through rolling land",
  canyon: "Deep cuts between steep walls",
  highlands: "High, rugged ground",
  lakeBasin: "Lakes in a wide bowl",
  delta: "A river fanning out over flats",
  islands: "Land in open water",
};

/** A choice's options from the settings model's, with their words shortened where a group is narrow. */
function opts<T extends string>(
  choices: Choice<T>[],
  id: string,
  words: Partial<Record<T, string>> = {},
): [T, string, string, string | false][] {
  return choices.map((c) => [
    c.value,
    words[c.value] ?? c.label,
    `${HINT[id] ?? c.label}: ${c.label}`,
    c.disabled ?? false,
  ]);
}

/** The keys of every generator setting, as the layouts place them. */
export type FieldKey =
  | "theme"
  | "seed"
  | "size"
  | "relief"
  | "verticality"
  | "variety"
  | "highest"
  | "terracing"
  | "buildable"
  | "rivers"
  | "riverStyle"
  | "riverFlow"
  | "reserve"
  | "lakes"
  | "falls"
  | "sources"
  | "badwater"
  | "badwaterDistance"
  | "thorns"
  | "cores"
  | "forest"
  | "groves"
  | "mix"
  | "berriesStart"
  | "berries"
  | "ruins"
  | "relics"
  | "geothermal"
  | "mines"
  | "wood"
  | "walk"
  | "bushes"
  | "area"
  | "ruinsWithin";

/** The five groups and what each holds, in the generator's order (each a labelled group of equal weight). */
export const GROUPS: readonly {
  name: "Terrain" | "Water" | "Hazards" | "Resources" | "Difficulty";
  keys: readonly FieldKey[];
}[] = [
  {
    name: "Terrain",
    keys: [
      "relief",
      "verticality",
      "variety",
      "highest",
      "terracing",
      "buildable",
    ],
  },
  {
    name: "Water",
    keys: [
      "rivers",
      "riverStyle",
      "riverFlow",
      "reserve",
      "lakes",
      "falls",
      "sources",
    ],
  },
  {
    name: "Hazards",
    keys: ["badwater", "badwaterDistance", "thorns", "cores"],
  },
  {
    name: "Resources",
    keys: [
      "forest",
      "groves",
      "mix",
      "berriesStart",
      "berries",
      "ruins",
      "relics",
      "geothermal",
      "mines",
    ],
  },
  {
    name: "Difficulty",
    keys: ["wood", "walk", "bushes", "area", "ruinsWithin"],
  },
];

/** Every setting's control, by key. */
export function genFields(
  p: SettingsProps,
  o: { compactMix?: boolean } = {},
): Record<FieldKey, JSX.Element> {
  const { spec } = p;
  const s = spec.settings;
  const W = spec.size.x;
  const H = spec.size.y;
  const set = (patch: (c: Settings) => void) => {
    const c = clone(s);
    patch(c);
    p.onSettings(c);
  };
  const num = (
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
    o: { step?: number; unit?: string; bandKey?: string } = {},
  ) => (
    <NumberSetting
      label={label}
      title={tipOf(id, o.bandKey ? band(o.bandKey, spec) : undefined)}
      value={value}
      min={min}
      max={max}
      step={o.step ?? 1}
      words={`${value}${o.unit ?? ""}`}
      onChange={onChange}
    />
  );
  const pick = <T extends string>(
    id: string,
    label: string,
    value: T,
    options: [T, string, string, string | false][],
    onChange: (v: T) => void,
    bandKey?: string,
    fit?: boolean,
  ) => (
    <ChoiceSetting<T>
      label={label}
      title={tipOf(id, bandKey ? band(bandKey, spec) : undefined)}
      value={value}
      options={options}
      onChange={onChange}
      fit={fit}
    />
  );
  const reserves = RESERVES.map((c) =>
    reserveGuard(spec.designedFor, c.value, W, H).fits
      ? c
      : { ...c, disabled: "too big for this map size" },
  );
  const preset =
    (Object.entries(SIZE_PRESETS).find(([, v]) => v === W && v === H)?.[0] as
      SizePreset | undefined) ?? "custom";
  return {
    theme: (
      <ChoiceSetting<ThemeId>
        label="Theme"
        title="The kind of land the map leans toward"
        value={spec.theme}
        options={THEMES.map((t) => [t, THEME_NAMES[t], THEME_TIPS[t]] as const)}
        onChange={p.onTheme}
        fit
        extra={
          <button
            type="button"
            class="set-auto set-reset"
            {...tip("Put every setting back to the theme's own")}
            onClick={p.onReset}
          >
            Reset settings
          </button>
        }
      />
    ),
    seed: <SeedSetting {...p} />,
    size: (
      <ChoiceSetting<SizePreset | "custom">
        label="Size"
        title={HINT.size}
        value={preset}
        options={[
          ...(Object.keys(SIZE_PRESETS) as SizePreset[]).map(
            (k) =>
              [
                k,
                String(SIZE_PRESETS[k]),
                `${k[0].toUpperCase() + k.slice(1)}: ${SIZE_PRESETS[k]}×${SIZE_PRESETS[k]}`,
              ] as const,
          ),
          ["custom", "Custom", "Your own width and height"] as const,
        ]}
        fit
        onChange={(v) =>
          v === "custom"
            ? p.onSize({ x: W, y: H === W ? Math.max(48, W - 16) : H })
            : p.onSize({ x: SIZE_PRESETS[v], y: SIZE_PRESETS[v] })
        }
        extra={
          preset === "custom" ? (
            <SizeNumbers W={W} H={H} onSize={p.onSize} />
          ) : (
            <span class="set-value">
              {W} × {H}
            </span>
          )
        }
      />
    ),
    relief: num(
      "relief",
      "Relief",
      s.terrain.relief,
      0,
      100,
      (v) => set((c) => (c.terrain.relief = v)),
      { bandKey: "relief" },
    ),
    verticality: num(
      "verticality",
      "Verticality",
      s.terrain.verticality,
      0,
      100,
      (v) => set((c) => setVerticality(c.terrain, v)),
      { bandKey: "verticality" },
    ),
    variety: num(
      "variety",
      "Variety",
      s.terrain.variety,
      0,
      100,
      (v) => set((c) => (c.terrain.variety = v)),
      { bandKey: "variety" },
    ),
    highest: num(
      "highest",
      "Highest terrain",
      s.terrain.highestTerrain,
      10,
      highestMax(s.terrain.verticality),
      (v) => set((c) => (c.terrain.highestTerrain = v)),
      { bandKey: "highestTerrain" },
    ),
    terracing: num(
      "terracing",
      "Terracing",
      s.terrain.terracing,
      0,
      100,
      (v) => set((c) => (c.terrain.terracing = v)),
      { bandKey: "terracing" },
    ),
    buildable: pick(
      "buildable",
      "Buildable land",
      s.terrain.buildableLand,
      opts(BUILDABLE, "buildable"),
      (v) => set((c) => (c.terrain.buildableLand = v)),
      "buildableLand",
    ),
    rivers: num(
      "rivers",
      "Rivers",
      s.water.rivers,
      0,
      3,
      (v) => set((c) => (c.water.rivers = v)),
      { bandKey: "rivers" },
    ),
    riverStyle: pick(
      "river-style",
      "River style",
      s.water.riverStyle,
      opts(STYLES, "river-style"),
      (v) => set((c) => (c.water.riverStyle = v)),
      "riverStyle",
      true,
    ),
    riverFlow: pick(
      "river-flow",
      "River flow",
      s.water.riverFlow,
      opts(FLOWS, "river-flow"),
      (v) => set((c) => (c.water.riverFlow = v)),
      "riverFlow",
      true,
    ),
    reserve: pick(
      "reserve",
      "Drought reserve",
      s.water.droughtReserve,
      opts(reserves, "reserve"),
      (v) => set((c) => (c.water.droughtReserve = v)),
      "droughtReserve",
    ),
    lakes: pick(
      "lakes",
      "Lakes and basins",
      s.water.lakes,
      opts(LAKE_CHOICES, "lakes"),
      (v) => set((c) => (c.water.lakes = v)),
      "lakes",
    ),
    falls: pick(
      "falls",
      "Waterfalls",
      s.water.waterfalls,
      opts(FALLS, "falls"),
      (v) => set((c) => (c.water.waterfalls = v)),
      "waterfalls",
    ),
    sources: pick(
      "sources",
      "Sources",
      s.water.sources ?? "placed",
      opts(SOURCES, "sources"),
      (v) => set((c) => (c.water.sources = v)),
      "sources",
    ),
    badwater: pick(
      "badwater",
      "Badwater",
      s.hazards.badwater,
      opts(BADWATER, "badwater", { off: "Off" }),
      (v) => set((c) => (c.hazards.badwater = v)),
      "badwater",
      true,
    ),
    badwaterDistance: num(
      "badwater-distance",
      "Badwater distance",
      s.hazards.badwaterDistance,
      8,
      60,
      (v) =>
        set((c) => {
          c.hazards.badwaterDistance = v;
          c.start.rules.badwaterWithin = v;
        }),
      { unit: " tiles", bandKey: "badwaterDistance" },
    ),
    thorns: pick(
      "thorns",
      "Thorn belts",
      s.hazards.thornBelts,
      opts(OFF_SOME, "thorns"),
      (v) => set((c) => (c.hazards.thornBelts = v)),
      "thornBelts",
    ),
    cores: pick(
      "cores",
      "Unstable cores",
      s.hazards.unstableCores,
      opts(CORES, "cores"),
      (v) => set((c) => (c.hazards.unstableCores = v)),
      "unstableCores",
    ),
    forest: num(
      "forest",
      "Forest density",
      s.resources.forestDensity,
      50,
      200,
      (v) => set((c) => (c.resources.forestDensity = v)),
      { step: 5, unit: "%", bandKey: "forestDensity" },
    ),
    groves: pick(
      "groves",
      "Grove size",
      s.resources.groveSize,
      opts(GROVES, "groves"),
      (v) => set((c) => (c.resources.groveSize = v)),
      "groveSize",
      true,
    ),
    mix: (
      <MixSetting
        mix={s.resources.speciesMix}
        compact={o.compactMix}
        onChange={(m) => set((c) => (c.resources.speciesMix = m))}
      />
    ),
    berriesStart: num(
      "berries-start",
      "Berries near start",
      s.resources.berriesNearStart,
      20,
      100,
      (v) => set((c) => (c.resources.berriesNearStart = v)),
      { bandKey: "berriesNearStart" },
    ),
    berries: num(
      "berries",
      "Berry bushes elsewhere",
      s.resources.berryBushes,
      50,
      300,
      (v) => set((c) => (c.resources.berryBushes = v)),
      { step: 5, unit: "%", bandKey: "berryBushes" },
    ),
    ruins: num(
      "ruins",
      "Ruins and scrap",
      s.resources.ruins,
      25,
      300,
      (v) => set((c) => (c.resources.ruins = v)),
      { step: 5, unit: "%", bandKey: "ruins" },
    ),
    relics: pick(
      "relics",
      "Relics",
      s.resources.relics,
      opts(OFF_SOME, "relics"),
      (v) => set((c) => (c.resources.relics = v)),
      "relics",
    ),
    geothermal: pick(
      "geothermal",
      "Geothermal fields",
      s.resources.geothermal,
      opts(OFF_SOME, "geothermal"),
      (v) => set((c) => (c.resources.geothermal = v)),
      "geothermal",
    ),
    mines: num(
      "mines",
      "Mine sites",
      s.resources.mineSites,
      2,
      4,
      (v) => set((c) => (c.resources.mineSites = v)),
      { bandKey: "mineSites" },
    ),
    wood: num(
      "rule-wood",
      "Starting wood",
      s.start.rules.woodWithin20,
      0,
      800,
      (v) => set((c) => (c.start.rules.woodWithin20 = v)),
      { step: 10, bandKey: "woodWithin20" },
    ),
    walk: num(
      "rule-water",
      "Max walk to water",
      s.start.rules.waterWithin,
      4,
      40,
      (v) => set((c) => (c.start.rules.waterWithin = v)),
      { bandKey: "waterWithin" },
    ),
    bushes: num(
      "rule-bushes",
      "Starting berries",
      s.start.rules.bushesWithin20,
      0,
      200,
      (v) => set((c) => (c.start.rules.bushesWithin20 = v)),
      { bandKey: "bushesWithin20" },
    ),
    area: pick(
      "start-area",
      "Start area",
      s.start.area,
      opts(AREAS, "start-area", { small: "Tight", large: "Roomy" }),
      (v) => set((c) => (c.start.area = v)),
    ),
    ruinsWithin: num(
      "rule-ruins",
      "No ruins within",
      s.start.rules.ruinsWithin,
      0,
      60,
      (v) => set((c) => (c.start.rules.ruinsWithin = v)),
      { unit: " tiles", bandKey: "ruinsWithin" },
    ),
  };
}

/** The seed: a real text field (it takes a caret), and Keep, a toggle whose word sits centred in it. */
function SeedSetting(p: SettingsProps) {
  return (
    <div class="set plate" {...tip(HINT.seed)}>
      <div class="set-head">
        <label class="set-label" for="gen-seed">
          Seed
        </label>
      </div>
      <div class="set-line">
        <input
          id="gen-seed"
          class="set-text"
          value={p.seedText}
          maxLength={24}
          autoComplete="off"
          spellcheck={false}
          onInput={(e) => p.onSeed((e.target as HTMLInputElement).value)}
        />
        <button
          type="button"
          class="set-toggle"
          aria-pressed={p.seedPinned}
          {...tip(
            p.seedPinned
              ? "Generate makes this map again"
              : "Keep this seed for the next Generate",
          )}
          onClick={() => (p.seedPinned ? p.onUnpinSeed() : p.onPinSeed())}
        >
          Keep
        </button>
      </div>
    </div>
  );
}

/** A custom size's width and height, typed, on the name line (the plate keeps its shape). */
function SizeNumbers(p: {
  W: number;
  H: number;
  onSize(size: { x: number; y: number }): void;
}) {
  const box = (v: number, label: string, onSet: (n: number) => void) => (
    <input
      class="set-text set-num"
      aria-label={label}
      value={v}
      inputMode="numeric"
      onChange={(e) => {
        const n = Math.round(Number((e.target as HTMLInputElement).value));
        if (Number.isFinite(n)) onSet(Math.max(48, Math.min(256, n)));
      }}
    />
  );
  return (
    <span class="set-size">
      {box(p.W, "Width", (x) => p.onSize({ x, y: p.H }))}×
      {box(p.H, "Height", (y) => p.onSize({ x: p.W, y }))}
    </span>
  );
}

const SPECIES = ["pine", "birch", "oak", "succulent"] as const;
const SPECIES_NAMES = {
  pine: "Pine",
  birch: "Birch",
  oak: "Oak",
  succulent: "Succulent",
} as const;

/** The species mix: one bar of four shares, dragged at the three edges between them; each share's name and number
 *  under it. The generator reads the four as weights, so shares that sum to 100 make the same forests. */
export function MixSetting(p: {
  mix: Settings["resources"]["speciesMix"];
  onChange(m: Settings["resources"]["speciesMix"]): void;
  compact?: boolean;
  children?: ComponentChildren;
}) {
  const total = SPECIES.reduce((a, k) => a + p.mix[k], 0) || 1;
  const shares = SPECIES.map((k) => Math.round((p.mix[k] / total) * 100));
  const bar = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const edges = [
    shares[0],
    shares[0] + shares[1],
    shares[0] + shares[1] + shares[2],
  ];
  const move = (i: number, x: number) => {
    const r = bar.current!.getBoundingClientRect();
    const at = Math.round(
      Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100)),
    );
    const e = [...edges];
    e[i] = Math.max(i ? e[i - 1] : 0, Math.min(i < 2 ? e[i + 1] : 100, at));
    p.onChange({
      pine: e[0],
      birch: e[1] - e[0],
      oak: e[2] - e[1],
      succulent: 100 - e[2],
    });
  };
  return (
    <div
      class={`set plate mix${p.compact ? " compact" : ""}`}
      {...tip(
        p.compact
          ? SPECIES.map((k, i) => `${SPECIES_NAMES[k]} ${shares[i]}`).join(
              " · ",
            )
          : "How many of the trees are each kind",
      )}
    >
      <div class="set-head">
        <span class="set-label">Species mix</span>
        {p.compact ? (
          <span class="mix-head-words" aria-hidden="true">
            {SPECIES.map((k, i) => (
              <span key={k}>
                <i class={`mix-dot mix-${k}`} />
                {shares[i]}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <div class="mix-bar" ref={bar} role="group" aria-label="Species mix">
        {SPECIES.map((k, i) => (
          <span
            key={k}
            class={`mix-share mix-${k}`}
            style={{ width: `${shares[i]}%` }}
          />
        ))}
        {edges.map((e, i) => (
          <span
            key={i}
            class={`mix-edge${drag === i ? " held" : ""}`}
            role="slider"
            aria-label={`${SPECIES_NAMES[SPECIES[i]]} and ${SPECIES_NAMES[SPECIES[i + 1]]}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={e}
            tabIndex={0}
            style={{ left: `${e}%` }}
            onPointerDown={(ev) => {
              (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
              setDrag(i);
            }}
            onPointerMove={(ev) => drag === i && move(i, ev.clientX)}
            onPointerUp={() => setDrag(null)}
          />
        ))}
      </div>
      {p.compact ? null : (
        <div class="mix-words">
          {SPECIES.map((k, i) => (
            <span key={k}>
              <i class={`mix-dot mix-${k}`} />
              {SPECIES_NAMES[k]} <b>{shares[i]}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** What is on the open map: picture, number, name. */
export function onThisMap(
  features: { kind: string; params: unknown }[],
  trees: number,
): [string, string, number][] {
  const count = (pred: (f: { kind: string; params: unknown }) => boolean) =>
    features.filter(pred).length;
  return [
    [
      "UndergroundRuins",
      "Mine sites",
      count(
        (f) =>
          f.kind === "mapObject" &&
          (f.params as { kind?: string }).kind === "mineSite",
      ),
    ],
    ["RuinColumnH3", "Ruin fields", count((f) => f.kind === "ruinField")],
    ["BlueberryBush", "Berry patches", count((f) => f.kind === "berryPatch")],
    ["Pine", "Trees", trees],
    ["WaterSource", "Rivers", count((f) => f.kind === "river")],
  ];
}
