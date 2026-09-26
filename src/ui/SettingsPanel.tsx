// The full settings panel (PLAN §5, §14.1): a theme strip on top, then Basics, and Terrain, Water,
// Hazards and Resources as collapsible sections, with Start rules under Advanced. Every control
// shows its reference band from the official maps, and the feasibility guards (PLAN §5.3) disable
// what cannot fit and say why.

import type { JSX } from "preact";
import { clone } from "../core/spec/mergepatch";
import {
  AVAILABLE_THEMES,
  DIFFICULTY_RULES,
  SIZE_PRESETS,
  THEME_NAMES,
  THEMES,
  type Difficulty,
  type MapSpec,
  type Settings,
  type SizePreset,
  type ThemeId,
} from "../core/spec/mapspec";
import {
  AREAS,
  BADWATER,
  band,
  BUILDABLE,
  CORES,
  FALLS,
  fallsRoom,
  FLOWS,
  GROVES,
  LAKE_CHOICES,
  limitsText,
  OFF_SOME,
  reserveGuard,
  RESERVES,
  STYLES,
  type Choice,
} from "./settingsModel";

export interface SettingsPanelProps {
  spec: MapSpec;
  seedText: string;
  onSeed(text: string): void;
  onDice(): void;
  onSize(size: { x: number; y: number }): void;
  onTheme(theme: ThemeId): void;
  onDifficulty(d: Difficulty): void;
  onSettings(s: Settings): void;
  onReset(): void;
}

const THEME_BLURB: Record<ThemeId, string> = {
  riverValley: "A river winds through a terraced valley.",
  canyon: "A river deep between cliff walls.",
  highlands: "Plateaus and cascades.",
  lakeBasin: "Rivers feed a central lake.",
  delta: "A braided river on a wide plain.",
  islands: "Islands in a sea.",
};

/** A small drawing of each layout for the theme strip. */
function ThemeGlyph({ theme }: { theme: ThemeId }) {
  const common = { width: 56, height: 32, viewBox: "0 0 56 32", "aria-hidden": true as const };
  switch (theme) {
    case "canyon":
      return (
        <svg {...common}>
          <path d="M0 9h56M0 23h56" class="g-land" />
          <path d="M0 16h56" class="g-water" />
        </svg>
      );
    case "lakeBasin":
      return (
        <svg {...common}>
          <ellipse cx="28" cy="16" rx="11" ry="8" class="g-lake" />
          <path d="M0 6l18 6M28 0v8M39 16h17" class="g-water" />
        </svg>
      );
    case "highlands":
      return (
        <svg {...common}>
          <path d="M0 26h14v-8h14v-8h14v-6h14" class="g-land" />
          <path d="M50 4l-6 22" class="g-water" />
        </svg>
      );
    case "delta":
      return (
        <svg {...common}>
          <path d="M0 16c14 0 18 0 26 0M26 16c10-8 18-10 30-12M26 16c10 0 18 0 30 0M26 16c10 8 18 10 30 12" class="g-water" />
        </svg>
      );
    case "islands":
      return (
        <svg {...common}>
          <rect x="0" y="0" width="56" height="32" class="g-sea" />
          <ellipse cx="16" cy="12" rx="7" ry="4" class="g-isle" />
          <ellipse cx="38" cy="21" rx="9" ry="5" class="g-isle" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M0 6c10 2 20 2 28 0s18-2 28 0M0 26c10-2 20-2 28 0s18 2 28 0" class="g-land" />
          <path d="M0 16c8-6 16-6 24 0s16 6 32-2" class="g-water" />
        </svg>
      );
  }
}

function Band({ id, text }: { id: string; text: string }) {
  return text ? (
    <span class="band" id={id}>
      {text}
    </span>
  ) : null;
}

function Slider(props: { id: string; label: string; value: number; min: number; max: number; step?: number; unit?: string; band?: string; onChange(v: number): void }) {
  const bandId = `${props.id}-band`;
  return (
    <label class="field" for={props.id}>
      <span class="field-head">
        {props.label}
        <output for={props.id}>
          {props.value}
          {props.unit ?? ""}
        </output>
      </span>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        aria-describedby={props.band ? bandId : undefined}
        onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))}
      />
      <Band id={bandId} text={props.band ?? ""} />
    </label>
  );
}

function Pick<T extends string>(props: { id: string; label: string; value: T; choices: Choice<T>[]; band?: string; note?: string; onChange(v: T): void }) {
  const bandId = `${props.id}-band`;
  return (
    <label class="field" for={props.id}>
      <span class="field-head">{props.label}</span>
      <select id={props.id} value={props.value} aria-describedby={props.band || props.note ? bandId : undefined} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as T)}>
        {props.choices.map((c) => (
          <option value={c.value} key={c.value} disabled={!!c.disabled}>
            {c.label}
            {c.disabled ? ` (${c.disabled})` : ""}
          </option>
        ))}
      </select>
      <Band id={bandId} text={[props.band, props.note].filter(Boolean).join(" ")} />
    </label>
  );
}

function Num(props: { id: string; label: string; value: number; min: number; max: number; band?: string; onChange(v: number): void }) {
  const bandId = `${props.id}-band`;
  return (
    <label class="field" for={props.id}>
      <span class="field-head">{props.label}</span>
      <input
        id={props.id}
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        aria-describedby={props.band ? bandId : undefined}
        onChange={(e) => {
          const v = Math.round(Number((e.target as HTMLInputElement).value));
          if (Number.isFinite(v)) props.onChange(Math.min(props.max, Math.max(props.min, v)));
        }}
      />
      <Band id={bandId} text={props.band ?? ""} />
    </label>
  );
}

function Section(props: { title: string; open?: boolean; children: JSX.Element | (JSX.Element | null)[] }) {
  return (
    <details class="section" open={props.open}>
      <summary>{props.title}</summary>
      <div class="section-body">{props.children}</div>
    </details>
  );
}

export function SettingsPanel(p: SettingsPanelProps) {
  const { spec } = p;
  const s = spec.settings;
  const W = spec.size.x;
  const H = spec.size.y;
  const set = (patch: (c: Settings) => void) => {
    const c = clone(s);
    patch(c);
    p.onSettings(c);
  };
  const preset = (Object.entries(SIZE_PRESETS).find(([, v]) => v === W && v === H)?.[0] as SizePreset | undefined) ?? "custom";
  const reserves: Choice<Settings["water"]["droughtReserve"]>[] = RESERVES.map((c) => {
    const g = reserveGuard(spec.designedFor, c.value, W, H);
    return g.fits ? c : { ...c, disabled: "too big for this map size" };
  });
  const reserveNote = reserveGuard(spec.designedFor, s.water.droughtReserve, W, H);
  const room = fallsRoom(s.terrain.highestTerrain);
  const fallsNote = s.water.waterfalls === "many" && room < 6 ? `Up to ${room} falls fit under highest terrain ${s.terrain.highestTerrain}.` : "";
  const d = DIFFICULTY_RULES[spec.designedFor];

  return (
    <div class="settings-panel">
      <fieldset class="themes">
        <legend>Theme</legend>
        {THEMES.map((t) => {
          const ok = AVAILABLE_THEMES.includes(t);
          return (
            <button
              type="button"
              key={t}
              class="theme"
              aria-pressed={spec.theme === t}
              disabled={!ok}
              title={ok ? THEME_BLURB[t] : `${THEME_NAMES[t]} comes in a later version`}
              onClick={() => p.onTheme(t)}
            >
              <ThemeGlyph theme={t} />
              <span class="theme-name">{THEME_NAMES[t]}</span>
              <span class="theme-note">{ok ? THEME_BLURB[t] : "Coming later"}</span>
            </button>
          );
        })}
      </fieldset>

      <h2>Map</h2>
      <label class="field" for="seed">
        <span class="field-head">Seed</span>
        <div class="row">
          <input id="seed" value={p.seedText} onInput={(e) => p.onSeed((e.target as HTMLInputElement).value)} aria-describedby="seed-band" />
          <button type="button" class="ghost" title="Pick a random seed" onClick={p.onDice}>
            Dice
          </button>
        </div>
        <Band id="seed-band" text="A number, or any word." />
      </label>
      <label class="field" for="size">
        <span class="field-head">Size</span>
        <select
          id="size"
          value={preset}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v in SIZE_PRESETS) p.onSize({ x: SIZE_PRESETS[v as SizePreset], y: SIZE_PRESETS[v as SizePreset] });
            else p.onSize({ x: W, y: H === W ? Math.max(48, W - 16) : H });
          }}
        >
          {(Object.keys(SIZE_PRESETS) as SizePreset[]).map((k) => (
            <option value={k} key={k}>
              {k[0].toUpperCase() + k.slice(1)} ({SIZE_PRESETS[k]}×{SIZE_PRESETS[k]})
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      {preset === "custom" ? (
        <div class="row two">
          <Num id="size-x" label="Width" value={W} min={48} max={256} onChange={(v) => p.onSize({ x: v, y: H })} />
          <Num id="size-y" label="Height" value={H} min={48} max={256} onChange={(v) => p.onSize({ x: W, y: v })} />
        </div>
      ) : null}
      <Pick
        id="designed-for"
        label="Designed for"
        value={spec.designedFor}
        choices={[
          { value: "easy", label: "Easy" },
          { value: "normal", label: "Normal" },
          { value: "hard", label: "Hard" },
        ]}
        band="The game difficulty the map is balanced for. It plays on any."
        onChange={(v) => p.onDifficulty(v)}
      />

      <Section title="Terrain">
        <Slider id="relief" label="Relief" value={s.terrain.relief} min={0} max={100} band={band("relief", spec)} onChange={(v) => set((c) => (c.terrain.relief = v))} />
        <Slider id="highest" label="Highest terrain" value={s.terrain.highestTerrain} min={10} max={16} band={band("highestTerrain", spec)} onChange={(v) => set((c) => (c.terrain.highestTerrain = v))} />
        <Slider id="terracing" label="Terracing" value={s.terrain.terracing} min={0} max={100} band={band("terracing", spec)} onChange={(v) => set((c) => (c.terrain.terracing = v))} />
        <Pick id="buildable" label="Buildable land" value={s.terrain.buildableLand} choices={BUILDABLE} band={band("buildableLand", spec)} onChange={(v) => set((c) => (c.terrain.buildableLand = v))} />
      </Section>

      <Section title="Water">
        <Slider id="rivers" label="Rivers" value={s.water.rivers} min={0} max={3} band={band("rivers", spec)} onChange={(v) => set((c) => (c.water.rivers = v))} />
        <Pick id="river-style" label="River style" value={s.water.riverStyle} choices={STYLES} band={band("riverStyle", spec)} onChange={(v) => set((c) => (c.water.riverStyle = v))} />
        <Pick id="river-flow" label="River flow" value={s.water.riverFlow} choices={FLOWS} band={band("riverFlow", spec)} onChange={(v) => set((c) => (c.water.riverFlow = v))} />
        <Pick
          id="reserve"
          label="Drought reserve"
          value={s.water.droughtReserve}
          choices={reserves}
          band={band("droughtReserve", spec)}
          note={reserveNote.fits ? reserveNote.note : `This reserve ${reserveNote.note}.`}
          onChange={(v) => set((c) => (c.water.droughtReserve = v))}
        />
        <Pick id="lakes" label="Lakes and basins" value={s.water.lakes} choices={LAKE_CHOICES} band={band("lakes", spec)} onChange={(v) => set((c) => (c.water.lakes = v))} />
        <Pick id="falls" label="Waterfalls" value={s.water.waterfalls} choices={FALLS} band={band("waterfalls", spec)} note={fallsNote} onChange={(v) => set((c) => (c.water.waterfalls = v))} />
      </Section>

      <Section title="Hazards">
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
      </Section>

      <Section title="Resources">
        <Slider id="forest" label="Forest density" value={s.resources.forestDensity} min={50} max={200} step={5} unit="%" band={band("forestDensity", spec)} onChange={(v) => set((c) => (c.resources.forestDensity = v))} />
        <Pick id="groves" label="Grove size" value={s.resources.groveSize} choices={GROVES} band={band("groveSize", spec)} onChange={(v) => set((c) => (c.resources.groveSize = v))} />
        <fieldset class="mix">
          <legend>Species mix</legend>
          {(["pine", "birch", "oak", "succulent"] as const).map((k) => (
            <Num key={k} id={`mix-${k}`} label={k[0].toUpperCase() + k.slice(1)} value={s.resources.speciesMix[k]} min={0} max={100} onChange={(v) => set((c) => (c.resources.speciesMix[k] = v))} />
          ))}
          <span class="band">Weights. Succulents grow only on dry soil.</span>
        </fieldset>
        <Slider id="berries-start" label="Berries near start" value={s.resources.berriesNearStart} min={20} max={100} band={band("berriesNearStart", spec)} onChange={(v) => set((c) => (c.resources.berriesNearStart = v))} />
        <Slider id="berries" label="Berry bushes elsewhere" value={s.resources.berryBushes} min={50} max={300} step={5} unit="%" band={band("berryBushes", spec)} onChange={(v) => set((c) => (c.resources.berryBushes = v))} />
        <Slider id="ruins" label="Ruins and scrap" value={s.resources.ruins} min={25} max={300} step={5} unit="%" band={band("ruins", spec)} onChange={(v) => set((c) => (c.resources.ruins = v))} />
        <Pick id="relics" label="Relics" value={s.resources.relics} choices={OFF_SOME} band={band("relics", spec)} onChange={(v) => set((c) => (c.resources.relics = v))} />
        <Pick id="geothermal" label="Geothermal fields" value={s.resources.geothermal} choices={OFF_SOME} band={band("geothermal", spec)} onChange={(v) => set((c) => (c.resources.geothermal = v))} />
        <Slider id="mines" label="Mine sites" value={s.resources.mineSites} min={1} max={4} band={band("mineSites", spec)} onChange={(v) => set((c) => (c.resources.mineSites = v))} />
      </Section>

      <Section title="Advanced: start rules">
        <Pick id="start-area" label="Start area" value={s.start.area} choices={AREAS} band="The flat bench round the district center, and the land you need nearby." onChange={(v) => set((c) => (c.start.area = v))} />
        <Num id="rule-water" label="Water without stairs (tiles)" value={s.start.rules.waterWithin} min={4} max={40} band={`${band("waterWithin", spec)} Default ${d.waterWithin}.`} onChange={(v) => set((c) => (c.start.rules.waterWithin = v))} />
        <Num id="rule-wood" label="Minimum starting wood (logs)" value={s.start.rules.woodWithin20} min={0} max={800} band={`${band("woodWithin20", spec)} Default ${d.woodWithin20}.`} onChange={(v) => set((c) => (c.start.rules.woodWithin20 = v))} />
        <Num id="rule-bushes" label="Minimum starting bushes" value={s.start.rules.bushesWithin20} min={0} max={200} band={`${band("bushesWithin20", spec)} Default ${d.bushesWithin20}.`} onChange={(v) => set((c) => (c.start.rules.bushesWithin20 = v))} />
        <Num id="rule-ruins" label="No ruins within (tiles)" value={s.start.rules.ruinsWithin} min={0} max={60} band={`${band("ruinsWithin", spec)} Default ${d.ruinsWithin}.`} onChange={(v) => set((c) => (c.start.rules.ruinsWithin = v))} />
      </Section>

      <details class="section">
        <summary>Limits for this size</summary>
        <ul class="limits">
          {limitsText(W, H).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
      <button type="button" class="ghost wide" onClick={p.onReset}>
        Reset to the theme's settings
      </button>
    </div>
  );
}
