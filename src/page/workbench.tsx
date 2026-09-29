// A workbench for the side panel's parts on their own (tests/e2e/page-parts.spec.ts), before the
// workspace puts them together. Built into the development and test builds only (vite.config.ts),
// never the site. `window.pg` lets a test drive the strip and read what the parts reported.

import { render } from "preact";
import { useEffect, useMemo, useReducer, useState } from "preact/hooks";
import { defaultSettings, makeSpec, seedFromText, type MapSpec, type Settings } from "../core/spec/mapspec";
import { SettingsPanel } from "../ui/SettingsPanel";
import { CandidatesStrip } from "./candidates/CandidatesStrip";
import { EMPTY_STRIP, strip, type CandidateMap, type StripEvent } from "./candidates/strip";
import { MapCard } from "./card/MapCard";
import { generatedCard, placeCard, type CardEntity, type LegendHighlight } from "./card/cardModel";
import { GenerateControls } from "./panel/GenerateControls";
import { settingsDiffer } from "./panel/generate";
import { SidePanel } from "./panel/SidePanel";
import type { PanelMode } from "./panel/panelState";
import { ReplacedNote } from "./QuietNote";
import { openYourMaps, storeProblem, type YourMapEntry } from "./yourMaps/store";
import { YourMaps } from "./yourMaps/YourMaps";
import { thumbnailDataUrl } from "./thumbnail";
import "../styles/app.css";

declare global {
  interface Window {
    pg?: {
      generated: number;
      highlights: (LegendHighlight | null)[];
      strip(ev: StripEvent): void;
      /** The background search found a version (sibling `variation`) for the map shown. */
      version(variation: number, note: string | null): void;
      /** A sibling More asked for finished. */
      sibling(variation: number): void;
      replaced(name: string): void;
      /** Keep a map in Your maps, edited `minutesAgo`. */
      addMap(id: string, name: string, minutesAgo: number, over?: Partial<YourMapEntry>): Promise<void>;
    };
  }
}

/** A small map for thumbnails: a slope with a river across it. */
function land(n: number, seed: number): { heights: Uint8Array; water: Float32Array } {
  const heights = new Uint8Array(n * n);
  const water = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      heights[i] = 3 + Math.round((x + y * (seed % 3)) / 6);
      if (Math.abs(y - n / 2 - Math.sin((x + seed) / 3) * 3) < 1.5) water[i] = 1;
    }
  return { heights, water };
}

/** A sibling of `spec` for the strip, on made-up land. */
function candidate(spec: MapSpec, variation: number): CandidateMap {
  const l = land(32, spec.seed + variation);
  return { spec: { ...spec, variation } as MapSpec, name: `Sibling ${variation}`, premise: "A river winds through a terraced valley.", W: 32, H: 32, heights: l.heights, water: l.water };
}

function entities(): CardEntity[] {
  const out: CardEntity[] = [];
  const put = (template: string, k: number, extra: Partial<CardEntity> = {}) => {
    for (let i = 0; i < k; i++) out.push({ template, x: 5 + ((i * 7) % 40), y: 5 + ((i * 11) % 40), orientation: "Cw0", ...extra });
  };
  put("WaterSource", 3);
  put("BadwaterSource", 1);
  put("UndergroundRuins", 2);
  put("RuinColumnH3", 5);
  put("BlueberryBush", 12);
  put("Pine", 40);
  put("Birch", 4, { dead: true });
  put("StartingLocation", 1);
  return out;
}

function Workbench() {
  const place = new URLSearchParams(location.search).has("place");
  const [mode, setMode] = useState<PanelMode>("generate");
  const [seedText, setSeedText] = useState("7");
  const [settings, setSettings] = useState<Settings>(() => defaultSettings("riverValley", "normal", { x: 128, y: 128 }));
  const panelSpec: MapSpec = useMemo(() => ({ ...makeSpec({ seed: seedFromText(seedText || "0"), theme: "riverValley", size: { x: 128, y: 128 } }), settings }), [seedText, settings]);
  const [shown, setShown] = useState<MapSpec | null>(place ? null : panelSpec);
  const [generated, setGenerated] = useState(0);
  const [stripState, dispatch] = useReducer(strip, EMPTY_STRIP);
  const [note, setNote] = useState<string | null>(null);
  const [maps, setMaps] = useState<YourMapEntry[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const store = useMemo(() => openYourMaps(), []);
  const removed = useMemo(() => new Map<string, Awaited<ReturnType<typeof store.remove>>>(), []);
  const ents = useMemo(entities, []);

  const reload = async () => setMaps(await store.list());
  useEffect(() => {
    void reload();
    dispatch({ type: "shown", map: place ? null : { spec: panelSpec }, generated: !place, offer: place ? null : { misses: { promise: true, water: false, standout: false }, note: "A version with its broad valley is ready" } });
  }, []);

  window.pg = {
    generated,
    highlights: window.pg?.highlights ?? [],
    strip: (ev) => dispatch(ev),
    version: (variation, note) => dispatch({ type: "version", forMap: stripState.forMap ?? "", map: candidate(shown ?? panelSpec, variation), note }),
    sibling: (variation) => dispatch({ type: "sibling", forMap: stripState.forMap ?? "", map: candidate(shown ?? panelSpec, variation) }),
    replaced: (name) => setNote(name),
    reloadMaps: reload,
    addMap: async (id, name, minutesAgo, over = {}) => {
      const t = new Date(Date.now() - minutesAgo * 60_000).toISOString();
      const l = land(32, id.length);
      const r = await store.put({ id, name, kind: "generated", createdAt: t, editedAt: t, starred: false, thumbnail: thumbnailDataUrl(l.heights, 32, 32, l.water), revision: 1, savedToTimberborn: null, bytes: 0, ...over }, new Uint8Array([1, 2, 3]));
      setProblem(storeProblem(r));
      await reload();
    },
  };

  const card = place
    ? placeCard({ name: "Near Yosemite Valley", plays: "A deep valley between granite walls; the river is the only way through.", W: 128, H: 128, signature: "Yosemite Valley's sheer granite walls" }, { entities: ents, walkReach: { trees: 120, logs: 260, farmland: 90, level: 150 }, levers: { farmland: 90, metal: 70, badwater: null, shelter: null, buildable: 150 } }, { text: "Elevation data: Terrain Tiles", href: "https://registry.opendata.aws/terrain-tiles/" })
    : generatedCard({ name: "Willow Bend", premise: "A river winds through a broad valley; the start sits on its inside bend.", spec: { seed: 7 }, W: 128, H: 128, entities: ents, walkReach: { trees: 182, logs: 640, farmland: 320, level: 420 }, levers: { farmland: 320, metal: 30, badwater: 12, shelter: 6, buildable: 420 } });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <SidePanel
        mode={mode}
        onMode={setMode}
        controls={{
          generate: (
            <GenerateControls
              differs={settingsDiffer(shown, panelSpec)}
              onGenerate={() => {
                setShown(panelSpec);
                setGenerated((g) => g + 1);
              }}
            >
              <SettingsPanel
                spec={panelSpec}
                seedText={seedText}
                onSeed={setSeedText}
                onDice={() => setSeedText(String(Math.floor(Math.random() * 1e6)))}
                onSize={() => undefined}
                onTheme={() => undefined}
                onDifficulty={() => undefined}
                onSettings={setSettings}
                onReset={() => setSettings(defaultSettings("riverValley", "normal", { x: 128, y: 128 }))}
              />
            </GenerateControls>
          ),
          places: <p class="pg-muted">The Real places gallery goes here.</p>,
          pick: null,
        }}
        strip={
          <CandidatesStrip
            state={stripState}
            onOpen={(it) => dispatch({ type: "open", id: it.id })}
            onMore={() => dispatch({ type: "more" })}
            onNoticeSeen={() => dispatch({ type: "noticeSeen" })}
          />
        }
        card={<MapCard card={card} onHighlight={(h) => window.pg!.highlights.push(h)} />}
        yourMaps={
          <YourMaps
            entries={maps}
            onOpen={() => undefined}
            onRename={async (id, name) => {
              setProblem(storeProblem(await store.rename(id, name)));
              await reload();
            }}
            onStar={async (id, on) => {
              setProblem(storeProblem(await store.star(id, on)));
              await reload();
            }}
            onCopy={async (id) => {
              const e = maps.find((m) => m.id === id);
              setProblem(storeProblem(await store.copy(id, { id: `${id}-copy`, name: `${e?.name ?? "Map"} (copy)`, at: new Date().toISOString() })));
              await reload();
            }}
            onDelete={async (id) => {
              removed.set(id, await store.remove(id));
              await reload();
            }}
            onUndoDelete={async (id) => {
              const r = removed.get(id);
              if (r) setProblem(storeProblem(await store.restore(r)));
              await reload();
            }}
            problem={problem}
          />
        }
      />
      <main style={{ flex: 1, padding: 16 }}>
        <p>
          Shown map: <output id="shown">{shown ? `seed ${shown.seed}` : "a real place"}</output>; generated <output id="generated">{generated}</output> times.
        </p>
        {note ? <ReplacedNote name={note} onDone={() => setNote(null)} /> : null}
        <img id="thumb" alt="" src={thumbnailDataUrl(land(32, 1).heights, 32, 32, land(32, 1).water) ?? ""} />
      </main>
    </div>
  );
}

render(<Workbench />, document.getElementById("app")!);
