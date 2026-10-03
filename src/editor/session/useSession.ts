// The editor's state and its calls to the worker: what the page holds (the open map's info, the
// renderer, the tools picked, the panels' state, the sounds, the water's player) and the queue that
// sends every edit to the worker and shows what comes back.

import type { Remote } from "comlink";
import { useEffect, useMemo, useRef, useState, type Dispatch, type StateUpdater } from "preact/hooks";
import { rulesFor, type Rules } from "../../core/validate/playability";
import { surfaceWater, type MapView, type SoilView, type WaterView } from "../../render3d/model";
import type { MapRenderer } from "../../render3d";
import type { GeneratorApi } from "../../worker/generator.worker";
import type { CheckItem, CheckProgress, EntityInfo, ExportCheck, SessionInfo, SessionUpdate, ViewUpdate, WaterLayers } from "../../worker/session";
import { FeatureIndex, type StartCheck, type StartStatus } from "../features";
import { plain, type LayerKind } from "../panels";
import { DEFAULT_SHELF_OPTIONS, type ShelfItem, type ShelfOptions } from "../shelfItems";
import { Juice, loadSound, type SoundSettings } from "../juice";
import type { Verb } from "../../core/forces/op";
import type { Point as QuakePoint } from "../../core/forces/quake";
import { loadFirstRun, saveFirstRun, type FirstStep } from "../FirstRun";
import { Selection, type SelectMode } from "../select";
import { WaterJourney } from "../waterJourney";
import { WaterPlayer } from "../waterPlayer";
import type { Hazard } from "../../core/sim/weather";
import { DEFAULT_OPTIONS, type Rgba, type ToolOptions } from "../tools";
import { type Mirror, mirrorOf } from "./mirror";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface SessionSlice {
  api: Remote<GeneratorApi>;
  info: SessionInfo;
  setInfo: Dispatch<StateUpdater<SessionInfo>>;
  view: MapView;
  mirror: { current: Mirror };
  renderer: { current: MapRenderer | null };
  ready: MapRenderer | null;
  setReady: Dispatch<StateUpdater<MapRenderer | null>>;
  setTool: Dispatch<StateUpdater<Verb | null>>;
  tool: Verb | null;
  anchorRef: { current: QuakePoint | null };
  flipRef: { current: (() => void) | null };
  repaintRef: { current: (() => void) | null };
  forceEscRef: { current: (() => boolean) | null };
  forceStroke: number[] | null;
  setForceStroke: Dispatch<StateUpdater<number[] | null>>;
  forceCursor: [number, number] | null;
  setForceCursor: Dispatch<StateUpdater<[number, number] | null>>;
  forceRing: { x: number; y: number; r: number } | null;
  setForceRing: Dispatch<StateUpdater<{ x: number; y: number; r: number } | null>>;
  gestureRef: { current: { forceStroke: number[] | null; forceCursor: [number, number] | null; forceRing: { x: number; y: number; r: number } | null } };
  options: ToolOptions;
  setOptions: Dispatch<StateUpdater<ToolOptions>>;
  setShelf: Dispatch<StateUpdater<ShelfItem | null>>;
  shelf: ShelfItem | null;
  shelfOptions: ShelfOptions;
  setShelfOptions: Dispatch<StateUpdater<ShelfOptions>>;
  setTurn: Dispatch<StateUpdater<number>>;
  turn: number;
  setPainted: Dispatch<StateUpdater<number[] | null>>;
  painted: number[] | null;
  setIcons: Dispatch<StateUpdater<Record<string, string>>>;
  icons: Record<string, string>;
  startDrag: { x: number; y: number; check: StartCheck } | null;
  setStartDrag: Dispatch<StateUpdater<{ x: number; y: number; check: StartCheck } | null>>;
  setBusy: Dispatch<StateUpdater<number>>;
  busy: number;
  setMessage: Dispatch<StateUpdater<{ kind: "error" | "info"; text: string } | null>>;
  message: { kind: "error" | "info"; text: string } | null;
  setHover: Dispatch<StateUpdater<string | null>>;
  hover: string | null;
  showHistory: boolean;
  /** The New map drawer is open, in the palette's place. */
  drawerOpen: boolean;
  setDrawerOpen: Dispatch<StateUpdater<boolean>>;
  setShowHistory: Dispatch<StateUpdater<boolean>>;
  setCheck: Dispatch<StateUpdater<ExportCheck | null>>;
  check: ExportCheck | null;
  setProgress: Dispatch<StateUpdater<CheckProgress | null>>;
  progress: CheckProgress | null;
  layer: LayerKind;
  setLayer: Dispatch<StateUpdater<LayerKind>>;
  setLayers: Dispatch<StateUpdater<WaterLayers | null>>;
  waterLayers: WaterLayers | null;
  waterTick: number;
  flowing: number | null;
  markersOn: boolean;
  setMarkersOn: Dispatch<StateUpdater<boolean>>;
  setNearSources: Dispatch<StateUpdater<number[]>>;
  nearSources: number[];
  setFeeding: Dispatch<StateUpdater<number[]>>;
  feeding: number[];
  clearWater: boolean;
  setClearWater: Dispatch<StateUpdater<boolean>>;
  setSliceLevel: Dispatch<StateUpdater<number | null>>;
  sliceLevel: number | null;
  setSelecting: Dispatch<StateUpdater<SelectMode | null>>;
  selecting: SelectMode | null;
  selectingRef: { current: SelectMode | null };
  selection: { current: Selection };
  selectionTick: number;
  setSelectionTick: Dispatch<StateUpdater<number>>;
  selectDraw: number[] | null;
  setSelectDraw: Dispatch<StateUpdater<number[] | null>>;
  selectPreview: { tiles: number[]; color: Rgba } | null;
  setSelectPreview: Dispatch<StateUpdater<{ tiles: number[]; color: Rgba } | null>>;
  deleteMenu: boolean;
  setDeleteMenu: Dispatch<StateUpdater<boolean>>;
  setDeleteCounts: Dispatch<StateUpdater<{ counts: Record<string, number> } | null>>;
  deleteCounts: { counts: Record<string, number> } | null;
  sourceDrag: number[] | null;
  setSourceDrag: Dispatch<StateUpdater<number[] | null>>;
  hoverObject: number[] | null;
  setHoverObject: Dispatch<StateUpdater<number[] | null>>;
  player: { current: WaterPlayer | null };
  mounted: { current: boolean };
  sound: SoundSettings;
  juice: { current: Juice | null };
  setSound: (s: SoundSettings) => void;
  feel: (kind: Parameters<Juice["play"]>[0], x: number, y: number, size?: number, soft?: boolean, what?: string) => void | undefined;
  weather: Hazard | null;
  weatherRef: { current: Hazard | null };
  setWeather: (on: Hazard | null) => void;
  journey: { current: WaterJourney | null };
  setInstant: Dispatch<StateUpdater<CheckItem[]>>;
  instant: CheckItem[];
  firstRun: Set<FirstStep>;
  setFirstRun: Dispatch<StateUpdater<Set<FirstStep>>>;
  firstDone: (step: FirstStep) => void;
  firstDoneRef: { current: (step: FirstStep) => void };
  minimap: boolean;
  setMinimap: Dispatch<StateUpdater<boolean>>;
  minimapRef: { current: boolean };
  setDotOpen: Dispatch<StateUpdater<boolean>>;
  dotOpen: boolean;
  saving: { kind: "timberborn" | "download"; progress: CheckProgress | null } | null;
  setSaving: Dispatch<StateUpdater<{ kind: "timberborn" | "download"; progress: CheckProgress | null } | null>>;
  noticesOpen: boolean;
  setNoticesOpen: Dispatch<StateUpdater<boolean>>;
  viewTick: number;
  setViewTick: Dispatch<StateUpdater<number>>;
  setFit: Dispatch<StateUpdater<{ tiles: number[]; problem: string | null; level?: number; status?: StartStatus | "pending" } | null>>;
  fit: { tiles: number[]; problem: string | null; level?: number; status?: StartStatus | "pending" } | null;
  setPicked: Dispatch<StateUpdater<{ x: number; y: number; list: EntityInfo[] } | null>>;
  picked: { x: number; y: number; list: EntityInfo[] } | null;
  setPickedObject: Dispatch<StateUpdater<EntityInfo | null>>;
  pickedObject: EntityInfo | null;
  pickedObjectRef: { current: EntityInfo | null };
  pickedRef: { current: { x: number; y: number; list: EntityInfo[] } | null };
  setShapeNote: Dispatch<StateUpdater<{ text: string; ok: boolean; warn: boolean; x: number; y: number } | null>>;
  shapeNote: { text: string; ok: boolean; warn: boolean; x: number; y: number } | null;
  queue: { current: Promise<unknown> };
  indexed: FeatureIndex;
  infoRef: { current: SessionInfo };
  shelfRef: { current: ShelfItem | null };
  shelfOptionsRef: { current: ShelfOptions };
  turnRef: { current: number };
  optionsRef: { current: ToolOptions };
  needs: { rules: Rules; reachMin: number };
  enqueue: <T>(fn: () => Promise<T>) => Promise<T>;
  run: (fn: () => Promise<SessionUpdate>, onDone?: (u: SessionUpdate) => void) => Promise<void>;
  draftWater: { current: WaterView | null };
  showWater: (w: WaterView, soon?: boolean) => void;
  toggleWeather: (hazard: Hazard) => void;
  showSoil: (soil: SoilView) => void;
  applyUpdate: (u: SessionUpdate) => void;
  applyView: (v: ViewUpdate) => void;
}

export function useSession(ed: Ed, props: EditorProps): SessionSlice {
  const { api } = props;
  const [info, setInfo] = useState<SessionInfo>(props.opened.info);
  // the map as opened; later changes go to the renderer as updates (the page re-mounts the
  // editor for another map)
  const view = props.opened.view;
  const mirror = useRef<Mirror>(mirrorOf(view));
  const renderer = useRef<MapRenderer | null>(null);
  const [ready, setReady] = useState<MapRenderer | null>(null);
  /** The force picked in the top bar (the brushes have their own state; the sources are on the
   *  shelf). */
  const [tool, setTool] = useState<Verb | null>(null);
  /** Where the last painted stroke ended (Shift+press paints a straight line on from it), V's flip of
   *  a quake's side while it is picked, and Esc for a stroke still being drawn. */
  const anchorRef = useRef<QuakePoint | null>(null);
  const flipRef = useRef<(() => void) | null>(null);
  /** A painted Lift's Power changed while it is painted: it is painted again with it (D361 (1)). */
  const repaintRef = useRef<(() => void) | null>(null);
  const forceEscRef = useRef<(() => boolean) | null>(null);
  /** What a force draws (D258: clean gestures, never a prediction): the line the player draws (a
   *  travelling force's path, Quake's fault, Erupt's fissure: the gesture itself,
   *  D321 item 41), and where the cursor is (its tile), round which one calm ring shows the force's
   *  size (D312, item 13), on the water's surface over water. */
  const [forceStroke, setForceStroke] = useState<number[] | null>(null);
  const [forceCursor, setForceCursor] = useState<[number, number] | null>(null);
  /** The force's reach round the cursor (D312): its ring, its radius from Power and Size. */
  const [forceRing, setForceRing] = useState<{ x: number; y: number; r: number } | null>(null);
  const gestureRef = useRef({ forceStroke, forceCursor, forceRing });
  gestureRef.current = { forceStroke, forceCursor, forceRing };
  const [options, setOptions] = useState<ToolOptions>(DEFAULT_OPTIONS);
  /** The object picked on the shelf, its options and its turn (D184). */
  const [shelf, setShelf] = useState<ShelfItem | null>(null);
  const [shelfOptions, setShelfOptions] = useState<ShelfOptions>(DEFAULT_SHELF_OPTIONS);
  const [turn, setTurn] = useState(0);
  /** Trees and bushes being painted by a drag: their tiles. */
  const [painted, setPainted] = useState<number[] | null>(null);
  /** The shelf's icons, drawn by the view once it is ready. */
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [startDrag, setStartDrag] = useState<{ x: number; y: number; check: StartCheck } | null>(null);
  const [busy, setBusy] = useState(0);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [check, setCheck] = useState<ExportCheck | null>(null);
  // the background check's progress (the canonical settle, then the checks), and the water layer
  const [progress, setProgress] = useState<CheckProgress | null>(null);
  const [layer, setLayer] = useState<LayerKind>("none");
  const [waterLayers, setLayers] = useState<WaterLayers | null>(null);
  const [waterTick, setWaterTick] = useState(0);
  /** The water is flowing into an edit's new shape (how far it has come, 0–1), or null. */
  const [flowing, setFlowing] = useState<number | null>(null);
  /** **Markers** is on (every source shows its marker then, D196). */
  const [markersOn, setMarkersOn] = useState(false);
  /** The source groups near the pointer, and those the pointer's water comes from (D196). */
  const [nearSources, setNearSources] = useState<number[]>([]);
  const [feeding, setFeeding] = useState<number[]>([]);
  /** Clear water (D196): T or the view button; any tool picked clears the water too. */
  const [clearWater, setClearWater] = useState(false);
  /** The layer the world is cut at (Alt+scroll, Alt+click), or null. */
  const [sliceLevel, setSliceLevel] = useState<number | null>(null);
  /** The Select tool (D184): open with M or a Ctrl+drag; its way of picking tiles. */
  const [selecting, setSelecting] = useState<SelectMode | null>(null);
  const selectingRef = useRef(selecting);
  selectingRef.current = selecting;
  const selection = useRef(new Selection(info.W, info.H));
  const [selectionTick, setSelectionTick] = useState(0);
  /** The tiles being drawn, before they join the selection. */
  const [selectDraw, setSelectDraw] = useState<number[] | null>(null);
  /** The tiles hovering a Select action would change (D323 item 6), and the Delete menu's state. */
  const [selectPreview, setSelectPreview] = useState<{ tiles: number[]; color: Rgba } | null>(null);
  const [deleteMenu, setDeleteMenu] = useState(false);
  /** What the core says stands in the selection while Delete's menu is open (objects under water too). */
  const [deleteCounts, setDeleteCounts] = useState<{ counts: Record<string, number> } | null>(null);
  /** A water source being dragged to a new place: its footprint there (D184). */
  const [sourceDrag, setSourceDrag] = useState<number[] | null>(null);
  /** The tiles of the object the plain pointer would pick where it is (D360 a): a quiet highlight. */
  const [hoverObject, setHoverObject] = useState<number[] | null>(null);
  /** The water's journey, played at a pace the eye can follow; its controls; a drought to watch. */
  const player = useRef<WaterPlayer | null>(null);
  /** The editor is on the page (answers from the worker that come after it closed are dropped). */
  const mounted = useRef(true);
  /** The little feedback on every action (D205): its sounds, and the land's effects. */
  const [sound, setSoundState] = useState<SoundSettings>(loadSound);
  const juice = useRef<Juice | null>(null);
  useEffect(
    () => () => {
      mounted.current = false;
      juice.current?.dispose();
    },
    [],
  );
  const setSound = (s: SoundSettings) => {
    setSoundState(s);
    juice.current?.setSound(s);
  };
  /** Feedback for an action at tile (x, y). */
  const feel = (kind: Parameters<Juice["play"]>[0], x: number, y: number, size = 1, soft = false, what?: string) => juice.current?.play(kind, x, y, size, soft, what);
  const [, setPlayerTick] = useState(0);
  /** A hazard playing (a drought or a badtide to watch), or null. */
  const [weather, setWeatherState] = useState<Hazard | null>(null);
  const weatherRef = useRef<Hazard | null>(null);
  const setWeather = (on: Hazard | null) => {
    weatherRef.current = on;
    setWeatherState(on);
  };
  player.current ??= new WaterPlayer({
    // (the journey's frames mesh a few chunks a frame too; its last, the settled water, at once)
    show: (f) => showWater(f.water, !f.final),
    changed: () => {
      setPlayerTick((n) => n + 1);
      setFlowing(player.current!.progress);
    },
  });
  // what the worker says about the water, and the bar that reads it (waterJourney.ts, D345 B14)
  const applyViewRef = useRef<(v: ViewUpdate) => void>(() => undefined);
  applyViewRef.current = applyView;
  const journey = useRef<WaterJourney | null>(null);
  journey.current ??= new WaterJourney(player.current, {
    applyView: (v) => applyViewRef.current(v),
    mapWater: () => mirror.current.mapWater,
    // (Max water depth's few words, once the water has settled, D264)
    settledInPlace: () => ed.checkDepthRef.current(),
  });
  const [instant, setInstant] = useState<CheckItem[]>([]);
  /** The first run's hints (D184): the steps done so far. */
  const [firstRun, setFirstRun] = useState<Set<FirstStep>>(loadFirstRun);
  const firstDone = (step: FirstStep) =>
    setFirstRun((d) => {
      if (d.has(step)) return d;
      const next = new Set(d).add(step);
      saveFirstRun(next);
      return next;
    });
  const firstDoneRef = useRef(firstDone);
  firstDoneRef.current = firstDone;
  /** The minimap (D205): on by default on 256² maps. */
  const [minimap, setMinimap] = useState(() => info.W >= 256 && info.H >= 256);
  const minimapRef = useRef(minimap);
  minimapRef.current = minimap;
  /** The quiet dot's list is open; a save in progress (D184). */
  const [dotOpen, setDotOpen] = useState(false);
  const [saving, setSaving] = useState<{ kind: "timberborn" | "download"; progress: CheckProgress | null } | null>(null);
  const [noticesOpen, setNoticesOpen] = useState(true);
  // (the quiet line opens again when the last badwater spring goes, D213)
  useEffect(() => {
    if (info.badwaterRemoved) setNoticesOpen(true);
  }, [info.badwaterRemoved]);
  const [viewTick, setViewTick] = useState(0);
  // the footprint under the pointer (an object from the shelf) and the source clicked (D196)
  const [fit, setFit] = useState<{ tiles: number[]; problem: string | null; level?: number; status?: StartStatus | "pending" } | null>(null);
  const [picked, setPicked] = useState<{ x: number; y: number; list: EntityInfo[] } | null>(null);
  /** An object picked with the plain pointer (D345, B7): a mine site, a relic and the like. */
  const [pickedObject, setPickedObject] = useState<EntityInfo | null>(null);
  const pickedObjectRef = useRef(pickedObject);
  pickedObjectRef.current = pickedObject;
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  /** What the shape being dragged says, where the pointer is, and what it covers (live shapes). */
  const [shapeNote, setShapeNote] = useState<{ text: string; ok: boolean; warn: boolean; x: number; y: number } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const index = useMemo(() => new FeatureIndex(info.W, info.H), [info.W, info.H, view]);
  const indexed = useMemo(() => {
    index.update(info.features);
    return index;
  }, [index, info.features]);
  const infoRef = useRef(info);
  infoRef.current = info;
  const shelfRef = useRef(shelf);
  shelfRef.current = shelf;
  const shelfOptionsRef = useRef(shelfOptions);
  shelfOptionsRef.current = shelfOptions;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  // the tools read the latest options when they act (an option changed just before a click counts)
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // the start requirements and targets of this map: its settings, or its difficulty's defaults
  const needs = useMemo(() => {
    const r = rulesFor(info.spec, info.designedFor);
    return { rules: r, reachMin: r.reachMin };
  }, [info.spec, info.designedFor]);
  // ------------------------------------------------------------------------------ worker calls

  /** Queue a worker call after the ones before it (edits and plans stay in order). */
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = queue.current.then(fn);
    queue.current = next.catch(() => undefined);
    return next;
  }

  /** Run worker calls one after another; apply what changed to the view. (While a force is at work
   *  the other edits wait: it is kept when it ends, Esc skips it to its end, Ctrl+Z takes it back.) */
  function run(fn: () => Promise<SessionUpdate>, onDone?: (u: SessionUpdate) => void): Promise<void> {
    if (ed.forcer.current?.running) {
      setMessage({ kind: "info", text: "A force is at work: it is kept when it ends. Esc skips it to its end, Ctrl+Z takes it back." });
      return Promise.resolve();
    }
    const next = queue.current.then(async () => {
      setBusy((b) => b + 1);
      try {
        const u = await fn();
        // an edit other than a stroke: the strokes the page could undo on its own are no longer
        // the latest steps of the history
        if (u.ok) {
          ed.localUndo.current = [];
          ed.localRedo.current = [];
        }
        applyUpdate(u);
        if (!u.ok && u.errors.length) setMessage({ kind: "error", text: plain(u.errors[0]) });
        else if (u.ok) setMessage(null);
        onDone?.(u);
      } catch (e) {
        setMessage({ kind: "error", text: String(e instanceof Error ? e.message : e) });
      } finally {
        setBusy((b) => b - 1);
      }
    });
    queue.current = next;
    return next;
  }

  /** Put water on the map (a frame of its journey, a draft's): the renderer and the page's copy (the
   *  camera stays where the player left it, D265). */
  /** A stroke's water waiting for the next frame (the latest wins). */
  const draftWater = useRef<WaterView | null>(null);
  function showWater(w: WaterView, soon = false) {
    const r = renderer.current;
    // (water on its way, a stroke's or the journey's: its chunks meshed a few a frame, so painting
    // and turning the view keep the display's rate)
    if (soon) r?.updateWaterSoon(w);
    else r?.updateWater(w);
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    mirror.current.water = r?.mapState()?.surface ?? surfaceWater(W, H, w);
    mirror.current.waterView = w;
  }

  /** The soil's colours from `from` to `to` over about two seconds (the last step is `to` itself). */
  const soilTimer = useRef(0);
  function growSoil(r: MapRenderer, from: SoilView, to: SoilView) {
    clearTimeout(soilTimer.current);
    const t0 = performance.now();
    const n = to.moisture.length;
    const moisture = new Uint8Array(n);
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 2000);
      if (t >= 1) {
        r.updateSoil(to);
        return;
      }
      for (let i = 0; i < n; i++) {
        const a = from.moisture[i];
        const b = to.moisture[i];
        if (a === b) {
          moisture[i] = b;
          continue;
        }
        // wetter tiles start sooner: moisture spreads out from the water
        const k = Math.max(0, Math.min(1, t * 1.6 - (1 - Math.max(a, b) / 255) * 0.6));
        moisture[i] = Math.round(a + (b - a) * k);
      }
      r.updateSoil({ moisture, contamination: to.contamination });
      soilTimer.current = window.setTimeout(step, 100);
    };
    step();
  }

  /** A drought or a badtide to watch, or the map's own water back at once. */
  function toggleWeather(hazard: Hazard) {
    if (weatherRef.current !== hazard) {
      setWeather(hazard);
      journey.current?.flush();
      player.current?.begin(null, true);
      void api.startWeather(hazard);
    } else {
      setWeather(null);
      void api.stopWeather().then((v) => {
        player.current?.clear();
        applyView(v);
        if (mirror.current.soil) renderer.current?.updateSoil(mirror.current.soil);
      });
    }
  }
  /** The soil's colours during a weather run (the map's own soil stays the page's copy). */
  function showSoil(soil: SoilView) {
    renderer.current?.updateSoil(soil);
  }

  function applyUpdate(u: SessionUpdate): void {
    // (its view goes in through the journey, after the settled parts it still holds, D341)
    // an edit: its water's journey starts from the water right after it
    if (u.ok) {
      if (weatherRef.current) setWeather(null);
    }
    // (the worker says whether a settle is running: an undo back to settled water starts no journey, the bar
    // says "Water settled" at once; the news that came first is played now, D345 B14)
    journey.current?.update(u, u.info.version);
    // the instant checks: the problems this edit made, in the region it changed (with the checks
    // worker they come as an event a moment later)
    if (u.instant) setInstant(u.instant.items.filter((c) => c.here && c.class === "load"));
    // the same features keep the page's own copy (its index and lists are not worked out again)
    const i = u.info.featuresKey === infoRef.current.featuresKey ? { ...u.info, features: infoRef.current.features } : u.info;
    // (at once: the worker's news for this version can come before the page renders it)
    infoRef.current = i;
    setInfo(i);
    props.onChange(i);
  }

  /** Apply what changed on the map to the mirror and the renderer. While strokes the page painted
   *  are on their way to the worker, the page's own terrain is ahead of the worker's: its
   *  terrain waits for the last of them (it is the same, byte for byte). */
  function applyView(v: ViewUpdate): void {
    const r = renderer.current;
    const m = mirror.current;
    if (v.heights && ed.pendingTerrain.current === 0) {
      if (ed.checkStroke.current) {
        ed.checkStroke.current = false;
        if (!sameBytes(m.heights, v.heights)) {
          ed.strokeMismatches.current++;
          console.warn("a stroke painted on the page differs from the map the worker built; the worker's is shown");
        }
      }
      m.heights = v.heights;
      r?.updateTerrain(v.heights);
    }
    if (v.terrain && ed.pendingTerrain.current === 0) ed.terrain.current = v.terrain;
    if (v.water) {
      // (the renderer works out the surface water: the page reads it from there)
      r?.updateWater(v.water);
      m.water = r?.mapState()?.surface ?? surfaceWater(infoRef.current.W, infoRef.current.H, v.water);
      m.waterView = v.water;
      m.mapWater = v.water;
    }
    // the soil follows the water (the preview's, then the exact settle's): the ground's colours,
    // and the ivy on ruins, so it comes before the objects
    if (v.soil) {
      // the land comes alive with the water (D181): the soil's colours move to the new moisture
      // over about two seconds, the tiles that end wettest (by the water) first
      const from = m.soil;
      m.soil = v.soil;
      if (r && from && from.moisture.length === v.soil.moisture.length) growSoil(r, from, v.soil);
      else r?.updateSoil(v.soil);
    }
    if (v.entities) {
      m.entities = v.entities;
      m.entitiesAt = null;
      m.coverAt = null;
      r?.updateEntities(v.entities);
      ed.reglow();
      ed.sourcesChanged();
    }
    if (v.water || v.entities) setWaterTick((t) => t + 1);
  }

  return {
    api, info, setInfo, view, mirror, renderer, ready, setReady, setTool, tool, anchorRef, flipRef, repaintRef,
    forceEscRef, forceStroke, setForceStroke, forceCursor, setForceCursor, forceRing, setForceRing, gestureRef,
    options, setOptions, setShelf, shelf, shelfOptions, setShelfOptions, setTurn, turn, setPainted, painted,
    setIcons, icons, startDrag, setStartDrag, setBusy, busy, setMessage, message, setHover, hover, showHistory,
    drawerOpen, setDrawerOpen,
    setShowHistory, setCheck, check, setProgress, progress, layer, setLayer, setLayers, waterLayers, waterTick,
    flowing, markersOn, setMarkersOn, setNearSources, nearSources, setFeeding, feeding, clearWater, setClearWater,
    setSliceLevel, sliceLevel, setSelecting, selecting, selectingRef, selection, selectionTick, setSelectionTick,
    selectDraw, setSelectDraw, selectPreview, setSelectPreview, deleteMenu, setDeleteMenu, setDeleteCounts,
    deleteCounts, sourceDrag, setSourceDrag, hoverObject, setHoverObject, player, mounted, sound, juice, setSound,
    feel, weather, weatherRef, setWeather, journey, setInstant, instant, firstRun, setFirstRun, firstDone,
    firstDoneRef, minimap, setMinimap, minimapRef, setDotOpen, dotOpen, saving, setSaving, noticesOpen,
    setNoticesOpen, viewTick, setViewTick, setFit, fit, setPicked, picked, setPickedObject, pickedObject,
    pickedObjectRef, pickedRef, setShapeNote, shapeNote, queue, indexed, infoRef, shelfRef, shelfOptionsRef, turnRef,
    optionsRef, needs, enqueue, run, draftWater, showWater, toggleWeather, showSoil, applyUpdate, applyView
  };
}
