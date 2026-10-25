// The editor's state and its calls to the worker: what the page holds (the open map's info, the
// renderer, the tools picked, the panels' state, the sounds, the water's player) and the queue that
// sends every edit to the worker and shows what comes back.

import { proxy, type Remote } from "comlink";
import { useEffect, useMemo, useRef, useState, type Dispatch, type StateUpdater } from "preact/hooks";
import { rulesFor, type Rules } from "../../core/validate/playability";
import { surfaceWater, type MapView, type SoilView, type WaterView } from "../../render3d/model";
import type { MapRenderer } from "../../render3d";
import type { GeneratorApi } from "../../worker/generator.worker";
import type { CheckItem, CheckProgress, DroughtLineNews, EntityInfo, ExportCheck, SessionInfo, SessionUpdate, ViewUpdate, WaterLayers } from "../../worker/session";
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
import { hazardDays, type Hazard } from "../../core/sim/weather";
import { describeTile as describeTileFacts, tileWords } from "../../core/doc/describeTile";
import type { TerrainState } from "../../core/features/raster/strokePreview";
import { DEFAULT_OPTIONS, type Rgba, type ToolOptions } from "../tools";
import { type Mirror, mirrorOf } from "./mirror";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** An editor note: a refusal (error) goes with the next action; `keep` holds a note until it is dismissed (a save that failed). `action` is a
 *  quiet button beside it ("See it" on a shared session's water note). */
export interface EditorNote {
  kind: "error" | "info";
  text: string;
  keep?: boolean;
  /** One thing the note offers to do (an info note: Undo, after a force cleared sources). It is for the step the history stood
   *  at (`step`, the steps applied) and goes the moment another step lands, so it only ever takes back that step. */
  action?: { label: string; tip: string; step?: number; run: () => void };
}

export interface SessionSlice {
  api: Remote<GeneratorApi>;
  info: SessionInfo;
  setInfo: Dispatch<StateUpdater<SessionInfo>>;
  view: MapView;
  /** The map's voxel columns as the renderer holds them (a map with caves, Erode's hollows): a force's frames add the
   *  tiles they changed to these (D281). */
  columnsRef: { current: MapView["columns"] };
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
  setMessage: Dispatch<StateUpdater<EditorNote | null>>;
  message: EditorNote | null;
  setHover: Dispatch<StateUpdater<string | null>>;
  hover: string | null;
  showHistory: boolean;
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
  /** Changes when a held weather day's water is put on the map (the minimap draws it). */
  heldTick: number;
  flowing: boolean;
  markersOn: boolean;
  setMarkersOn: Dispatch<StateUpdater<boolean>>;
  /** The Show row's Markers toggle, as its click does it (the 3D view puts it here): M's way to it. */
  markersToggle: { current: (() => void) | null };
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
  /** The other version is on show (the compare key is held, useCompare). */
  comparing: { current: boolean };
  /** Whatever draws the open map on the renderer (an edit coming in, an undo, a water frame, a force's frame) first puts the
   *  open map back, ending the flip: the two maps are never on screen at once. */
  endFlip: () => void;
  /** Set by useCompare: how the flip ends. */
  flipEnd: { current: (() => void) | null };
  setWeather: (on: Hazard | null) => void;
  /** The weather day shown (0 the map's own water), its hazard's default length, how far the day asked for is worked
   *  out (0 to 1, the day box's fill), or null once it shows, and the day asked for (the day box reads it at once). */
  weatherDay: number | null;
  weatherDays: number | null;
  weatherCounting: number | null;
  weatherTarget: number | null;
  setWeatherDay: (day: number | null) => void;
  setWeatherDays: (days: number | null) => void;
  setWeatherCounting: (day: number | null) => void;
  /** The day the page asked the worker for last (null: the hazard's default last day). */
  heldDay: { current: number | null };
  /** Step the held day back or on (◀ ▶, ← →). */
  stepWeather: (delta: -1 | 1) => void;
  /** Show a typed day (the day box, double-clicked). */
  holdWeatherDay: (day: number) => void;
  /** Ask the worker for the held day again (after an edit's water has settled: it re-runs from it). */
  requestHeldDay: () => void;
  lastHover: { current: { x: number; y: number; level?: number } | null };
  rehover: () => void;
  /** Work out both weather hazards' days once Kyler has been idle a moment with the water settled (the worker stops
   *  the moment he acts). */
  idlePrep: () => void;
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
  /** A change of the map's size is being opened again: this editor sends the worker nothing more (D340). */
  resizing: { current: boolean };
  setDotOpen: Dispatch<StateUpdater<boolean>>;
  dotOpen: boolean;
  saving: { kind: "timberborn" | "download"; progress: CheckProgress | null } | null;
  setSaving: Dispatch<StateUpdater<{ kind: "timberborn" | "download"; progress: CheckProgress | null } | null>>;
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
  showWater: (w: WaterView, soon?: boolean, held?: boolean) => void;
  toggleWeather: (hazard: Hazard) => void;
  showSoil: (soil: SoilView, withered?: Int32Array, day?: number) => void;
  showWithered: (tiles: Int32Array) => void;
  applyUpdate: (u: SessionUpdate) => void;
  applyView: (v: ViewUpdate) => void;
  /** The worker's latest land, put in place once the page has no stroke of its own in flight. */
  takeLand: () => void;
}

export function useSession(ed: Ed, props: EditorProps): SessionSlice {
  const { api } = props;
  const [info, setInfo] = useState<SessionInfo>(props.opened.info);
  // the map as opened; later changes go to the renderer as updates (the page re-mounts the
  // editor for another map)
  const view = props.opened.view;
  const mirror = useRef<Mirror>(mirrorOf(view));
  const columnsRef = useRef<MapView["columns"]>(view.columns);
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
  const [message, setMessage] = useState<EditorNote | null>(null);
  // a note that offers to take a step back goes when the history moves on (a stroke, another force, an undo or a redo)
  const stepsApplied = info.history.filter((h) => h.applied).length;
  useEffect(() => setMessage((m) => (m?.action && m.action.step !== undefined && m.action.step !== stepsApplied ? null : m)), [stepsApplied]);
  const [hover, setHover] = useState<string | null>(null);
  /** The tile under the pointer, and the readout said again for it when the water shown changes under a still
   *  pointer (a weather day landing). */
  const lastHover = useRef<{ x: number; y: number; level?: number } | null>(null);
  const rehover = () => {
    const h = lastHover.current;
    if (h && ed.pageTileFacts) setHover(tileWords(describeTileFacts(ed.pageTileFacts(), h.x, h.y, h.level)));
  };
  // A refusal's note goes with the next thing the player does (a press, a key, a tool picked, the layer or the view
  // changed); only a save that failed stays until it is dismissed or the map is saved. An edit's own note
  // (info) stays until its × or the next kept edit.
  const dropRefusal = () => setMessage((m) => (m && m.kind === "error" && !m.keep ? null : m));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) dropRefusal();
    };
    // (a press on the note itself is its ×'s: that closes it)
    const press = (e: PointerEvent) => {
      // (the camera's drags, middle and right, leave it: a player looks around to see why)
      if (e.button === 0 && !(e.target instanceof Element && e.target.closest(".editor-message"))) dropRefusal();
    };
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("keydown", key, true);
    };
  }, []);
  const [showHistory, setShowHistory] = useState(props.carry?.history ?? false);
  const resizing = useRef(false);
  const [check, setCheck] = useState<ExportCheck | null>(null);
  // the background check's progress (the canonical settle, then the checks), and the water layer
  const [progress, setProgress] = useState<CheckProgress | null>(null);
  const [layer, setLayer] = useState<LayerKind>(props.carry?.layer ?? "none");
  const [waterLayers, setLayers] = useState<WaterLayers | null>(null);
  const [waterTick, setWaterTick] = useState(0);
  const [heldTick, setHeldTick] = useState(0);
  /** The water is flowing into an edit's new shape (the dot says "Settling…"): set as a journey starts and ends, never
   *  per frame, so the editor isn't drawn again for every frame of the water's journey. */
  const [flowing, setFlowing] = useState(false);
  /** **Markers** is on (every source shows its marker then, D196). */
  const [markersOn, setMarkersOn] = useState(false);
  const markersToggle = useRef<(() => void) | null>(null);
  /** The source groups near the pointer, and those the pointer's water comes from (D196). */
  const [nearSources, setNearSources] = useState<number[]>([]);
  const [feeding, setFeeding] = useState<number[]>([]);
  /** Clear water (D196): T or the view button; any tool picked clears the water too. */
  const [clearWater, setClearWater] = useState(props.carry?.clearWater ?? false);
  /** The layer the world is cut at (Alt+scroll, Alt+click), or null. */
  const [sliceLevel, setSliceLevel] = useState<number | null>(null);
  useEffect(dropRefusal, [tool, shelf?.id, layer, sliceLevel]);
  /** The Select tool (D184): open with M or a Ctrl+drag; its way of picking tiles. */
  // Select is always in hand (Kyler's choice at the v4 verdict): held when a map opens, and whatever is put down
  // returns to it
  const [selecting, setSelecting] = useState<SelectMode | null>("rect");
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
  /** A hazard playing (a drought or a badtide to watch), or null. */
  const [weather, setWeatherState] = useState<Hazard | null>(null);
  const weatherRef = useRef<Hazard | null>(null);
  const comparing = useRef(false);
  const flipEnd = useRef<(() => void) | null>(null);
  const endFlip = () => {
    if (comparing.current) flipEnd.current?.();
  };
  // the drought line (D133): the worker's channel, drawn in the normal view only (never while a day is held) and only
  // for the map's own version, so an edit puts it away until the new map's comes
  const droughtNews = useRef<DroughtLineNews | null>(null);
  const syncDroughtLine = () => {
    const n = droughtNews.current;
    renderer.current?.setDroughtLine(n && n.version === infoRef.current.version && !weatherRef.current ? n.line : null);
  };
  useEffect(() => {
    if (!ready) return;
    const take = (n: DroughtLineNews) => {
      droughtNews.current = n;
      syncDroughtLine();
    };
    const news = proxy(take);
    void api.watchDroughtLine(news).then((n) => n && take(n));
    // (a map just opened has its line worked out too, not only after the first press: the worker waits for the water)
    idlePrep();
    return () => {
      droughtNews.current = null;
      void api.watchDroughtLine(null);
    };
  }, [ready]);
  const setWeather = (on: Hazard | null) => {
    weatherRef.current = on;
    setWeatherState(on);
    syncDroughtLine();
  };
  const [weatherDay, setWeatherDay] = useState<number | null>(null);
  const [weatherDays, setWeatherDays] = useState<number | null>(null);
  const [weatherCounting, setWeatherCounting] = useState<number | null>(null);
  const [weatherTarget, setWeatherTarget] = useState<number | null>(null);
  const heldDay = useRef<number | null>(null);
  // the weather's days worked out in the background (Kyler, 2026-10-04): from the moment the water settles, Drought's
  // days then Badtide's; any press or key stops it at once, and it picks up again when the press ends with the water
  // settled (an edit's water settling picks it up too)
  const idlePrep = () => void api.prepareWeather();
  /** A press or a key is held (the prep waits for it to end). */
  const pressed = useRef(false);
  useEffect(() => {
    const stop = () => {
      pressed.current = true;
      void api.stopWeatherPrep();
    };
    const resume = () => {
      pressed.current = false;
      if (player.current?.progress === null) idlePrep();
    };
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", stop, true);
    window.addEventListener("pointerup", resume, true);
    window.addEventListener("keyup", resume, true);
    // (a cancelled touch, or a window left with a key down (Alt+Tab), never sends its up: nothing is held then,
    // and the background work carries on)
    window.addEventListener("pointercancel", resume, true);
    window.addEventListener("blur", resume);
    return () => {
      window.removeEventListener("pointercancel", resume, true);
      window.removeEventListener("blur", resume);
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", stop, true);
      window.removeEventListener("pointerup", resume, true);
      window.removeEventListener("keyup", resume, true);
    };
  }, []);
  player.current ??= new WaterPlayer({
    // (the journey's frames mesh a few chunks a frame too; its last, the settled water, at once; a held weather day
    // stays on screen meanwhile)
    show: (f) => showWater(f.water, !f.final),
    changed: () => setFlowing(player.current!.progress !== null),
  });
  // what the worker says about the water, and the bar that reads it (waterJourney.ts, D345 B14)
  const applyViewRef = useRef<(v: ViewUpdate) => void>(() => undefined);
  applyViewRef.current = applyView;
  const journey = useRef<WaterJourney | null>(null);
  journey.current ??= new WaterJourney(player.current, {
    applyView: (v) => applyViewRef.current(v),
    mapWater: () => mirror.current.mapWater,
    // (Max water depth's few words, once the water has settled, D264; a held weather day runs again from it)
    settledInPlace: () => {
      ed.checkDepthRef.current();
      if (weatherRef.current) requestHeldDay();
    },
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
  const [minimap, setMinimap] = useState(() => props.carry?.minimap ?? (info.W >= 256 && info.H >= 256));
  const minimapRef = useRef(minimap);
  minimapRef.current = minimap;
  /** The quiet dot's list is open; a save in progress (D184). */
  const [dotOpen, setDotOpen] = useState(false);
  const [saving, setSaving] = useState<{ kind: "timberborn" | "download"; progress: CheckProgress | null } | null>(null);
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
    // (the map is being opened again after a crop: what the player does meanwhile waits for the new editor)
    if (resizing.current) return Promise.resolve();
    if (ed.forcer.current?.running) {
      setMessage({ kind: "info", text: "A force is at work: it is kept when it ends. Skip it to its end or take it back first." });
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
  function showWater(w: WaterView, soon = false, held = false) {
    // (a held weather day stays on screen: only the day itself replaces it, Kyler, 2026-10-04)
    if (weatherRef.current && !held) return;
    // (the other version on show: the water that arrives waits in the page's copy and is drawn when the key lets go)
    if (comparing.current) {
      const W = infoRef.current.W;
      const H = infoRef.current.H;
      mirror.current.water = surfaceWater(W, H, w);
      mirror.current.waterView = w;
      return;
    }
    const r = renderer.current;
    // (water on its way, a stroke's or the journey's: its chunks meshed a few a frame, so painting
    // and turning the view keep the display's rate)
    if (soon) r?.updateWaterSoon(w);
    else r?.updateWater(w);
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    mirror.current.water = r?.mapState()?.surface ?? surfaceWater(W, H, w);
    mirror.current.waterView = w;
    if (held) setHeldTick((t) => t + 1);
  }

  /** The soil's colours from `from` to `to` over about two seconds (the last step is `to` itself). */
  const soilTimer = useRef(0);
  // (a map opened while the soil still grows: this map's colours never land on the next one)
  useEffect(() => () => clearTimeout(soilTimer.current), []);
  function growSoil(r: MapRenderer, from: SoilView, to: SoilView) {
    clearTimeout(soilTimer.current);
    const n = to.moisture.length;
    // (no tile's moisture moves, as after most edits away from the water: the new soil goes in at once, one frame, not
    // two seconds of frames that each draw the same colours)
    let moves = false;
    for (let i = 0; i < n && !moves; i++) moves = from.moisture[i] !== to.moisture[i];
    if (!moves) return r.updateSoil(to);
    const t0 = performance.now();
    const moisture = new Uint8Array(n);
    let first = true;
    const step = () => {
      // (the other version on show: the soil stops here, and the open map's own comes back with it when the key lets go)
      if (comparing.current) return;
      const t = Math.min(1, (performance.now() - t0) / 2000);
      if (t >= 1) {
        r.updateSoil(to);
        return;
      }
      let changed = first;
      first = false;
      for (let i = 0; i < n; i++) {
        const a = from.moisture[i];
        const b = to.moisture[i];
        // wetter tiles start sooner: moisture spreads out from the water
        const v = a === b ? b : Math.round(a + (b - a) * Math.max(0, Math.min(1, t * 1.6 - (1 - Math.max(a, b) / 255) * 0.6)));
        if (moisture[i] !== v) {
          moisture[i] = v;
          changed = true;
        }
      }
      // (a step that moves no tile draws nothing new: no frame for it)
      if (changed) r.updateSoil({ moisture, contamination: to.contamination });
      soilTimer.current = window.setTimeout(step, 100);
    };
    step();
  }

  /** A drought or a badtide held on a day (Kyler, 2026-10-04): the first click shows its last day and holds it (the
   *  days before it simulated first, the map as it is meanwhile, the label counting); the other hazard's button
   *  switches straight to it; the same button again brings the map's own water back. No playing, no jumping back. */
  function toggleWeather(hazard: Hazard) {
    if (weatherRef.current !== hazard) {
      // (the journey's settled water is put in place first: the day runs from the map's own water)
      journey.current?.flush();
      player.current?.skip();
      setWeather(hazard);
      // (the other hazard's withered plants are not this one's)
      renderer.current?.setWithered(null);
      heldDay.current = null;
      setWeatherDay(null);
      // (working from the click until the day shows: the box's fill starts empty)
      setWeatherCounting(0);
      // (the day box reads the day at once, the hazard's length for the map's difficulty, Kyler, 2026-10-04)
      setWeatherTarget(hazardDays(infoRef.current.spec?.designedFor ?? "normal", hazard));
      askWeatherDay(hazard, null);
    } else weatherOff();
  }
  /** The map's own water back: no hazard shown, the button unpressed, the day box gone. */
  function weatherOff() {
    setWeather(null);
    heldDay.current = null;
    setWeatherDay(null);
    setWeatherCounting(null);
    setWeatherTarget(null);
    mirror.current.daySoil = null;
    renderer.current?.setWithered(null);
    renderer.current?.setSeason(null, null);
    void api.stopWeather().then((v) => {
      player.current?.clear();
      applyView(v);
      if (mirror.current.soil) renderer.current?.updateSoil(mirror.current.soil);
      ed.rehover();
    });
  }
  /** Ask the worker for a day of `hazard`; a failure shows its one line, as an edit's refusal does, and the map's own
   *  water comes back. */
  function askWeatherDay(hazard: Hazard, day: number | null) {
    api.showWeatherDay(hazard, day).catch((e: unknown) => {
      if (weatherRef.current === hazard) weatherOff();
      setMessage({ kind: "error", text: String(e instanceof Error ? e.message : e) });
    });
  }
  /** Step the held day back (to Day 0, the map's own water) or on (past the default length, simulated as asked). */
  function stepWeather(delta: -1 | 1) {
    const h = weatherRef.current;
    if (!h) return;
    const from = heldDay.current ?? weatherTarget ?? weatherDay ?? 0;
    const day = Math.max(0, from + delta);
    if (day === from && heldDay.current !== null) return;
    holdWeatherDay(day);
  }
  /** Hold a day of the hazard shown: at once when it is kept, or worked out first (the box's fill meanwhile). */
  function holdWeatherDay(day: number) {
    const h = weatherRef.current;
    if (!h) return;
    heldDay.current = day;
    setWeatherTarget(day);
    setWeatherCounting(0);
    askWeatherDay(h, day);
  }
  function requestHeldDay() {
    const h = weatherRef.current;
    if (h) askWeatherDay(h, heldDay.current);
  }
  /** The soil's colours during a weather run (the map's own soil stays the page's copy). */
  function showWithered(tiles: Int32Array) {
    renderer.current?.setWithered(tiles);
  }
  function showSoil(soil: SoilView, withered?: Int32Array, day = 1) {
    endFlip();
    renderer.current?.updateSoil(soil);
    // (the plants the days up to this one have surely killed, drawn withered in High, D250: a day that comes without its list
    // keeps the last one until the new one arrives, so after an edit the dead plants never flash alive; cleared only when the
    // hazard changes or ends, or the map does)
    if (withered) renderer.current?.setWithered(withered);
    // (the High look's dry ground, heat and sky: the day's soil against the map's own, the page's copy of it)
    // (Day 0 is the map as it is: no dust, no shimmer, no sky)
    renderer.current?.setSeason(day > 0 ? weatherRef.current : null, mirror.current.soil ?? null);
  }

  function applyUpdate(u: SessionUpdate): void {
    // (a shared session's answer to an edit: the session orders the edit, and the map's news comes as its own update)
    if (u.routed && !Object.keys(u.view).length) return;
    // a crop, or the undo or redo of one, made the map another size (D340): the page opens the session's map again, which
    // fits the camera and the minimap to it and clears the selection; nothing of this update goes into the old view
    if (u.ok && (u.info.W !== infoRef.current.W || u.info.H !== infoRef.current.H)) {
      infoRef.current = u.info;
      props.onChange(u.info);
      if (resizing.current) return;
      // from here this editor sends nothing more; what it had queued still reaches the worker first, and the new editor
      // opens from the worker's map after it (App.tsx `resized`). A held drought or badtide is stopped cleanly: its days were
      // the old map's.
      resizing.current = true;
      // (a compare's flip ends first: the other version's map is not this one's size)
      endFlip();
      if (weatherRef.current) void enqueue(() => api.stopWeather());
      props.onResized({ history: showHistory, mode: renderer.current?.getView().mode ?? "orbit", layer, clearWater, minimap });
      return;
    }
    // (its view goes in through the journey, after the settled parts it still holds, D341)
    // an edit: its water's journey starts from the water right after it

    // (the worker says whether a settle is running: an undo back to settled water starts no journey, the bar
    // says "Water settled" at once; the news that came first is played now, D345 B14)
    journey.current?.update(u, u.info.version);
    // (a held weather day: an edit whose water is already settled runs it again at once; otherwise the settled water
    // does, once it is in place)
    if (u.ok && weatherRef.current && u.waterSettled) requestHeldDay();
    // (an edit that left the water settled has no settling to wait for: its drought line is worked out now)
    else if (u.ok && u.waterSettled && !pressed.current) idlePrep();
    // the instant checks: the problems this edit made, in the region it changed (with the checks
    // worker they come as an event a moment later)
    if (u.instant) setInstant(u.instant.items.filter((c) => c.here && c.class === "load"));
    // the same features keep the page's own copy (its index and lists are not worked out again)
    const i = u.info.featuresKey === infoRef.current.featuresKey ? { ...u.info, features: infoRef.current.features } : u.info;
    // (at once: the worker's news for this version can come before the page renders it)
    infoRef.current = i;
    setInfo(i);
    props.onChange(i);
    syncDroughtLine();
  }

  /** The worker's latest land and terrain, held while the page's own is ahead of it (`takeLand`). */
  const heldLand = useRef<{ heights?: Uint8Array; columns?: ViewUpdate["columns"]; terrain?: TerrainState }>({});
  /** Put the worker's latest land in place once nothing the page painted is its own alone: no stroke being painted
   *  and none on its way to the worker. Until then the page's land is ahead of the worker's, and the worker's would
   *  take away what the page shows (#410). When it goes in, the page's strokes are checked against it: the same,
   *  byte for byte. */
  function takeLand(): void {
    const held = heldLand.current;
    if (!held.heights && !held.terrain && !held.columns) return;
    if (held.heights) endFlip();
    if (ed.pendingTerrain.current > 0 || ed.painter.current?.busy) return;
    heldLand.current = {};
    const m = mirror.current;
    if (held.heights) {
      if (ed.checkStroke.current) {
        ed.checkStroke.current = false;
        if (!sameBytes(m.heights, held.heights)) {
          ed.strokeMismatches.current++;
          console.warn("a stroke painted on the page differs from the map the worker built; the worker's is shown");
        }
      }
      m.heights = held.heights;
      renderer.current?.updateTerrain(held.heights, held.columns);
    } else if (held.columns) renderer.current?.updateTerrain(m.heights, held.columns);
    if (held.terrain) ed.terrain.current = held.terrain;
  }

  /** Apply what changed on the map to the mirror and the renderer. While strokes the page painted
   *  are on their way to the worker, or one is being painted, the page's own terrain is ahead of the
   *  worker's: the worker's waits for them (it is the same, byte for byte). */
  function applyView(v: ViewUpdate): void {
    // (new land ends the flip; water, soil and objects arriving while the other version is on show wait in the page's
    // copy, and are drawn when the key lets go)
    if (v.heights) endFlip();
    const flipped = comparing.current;
    const r = flipped ? null : renderer.current;
    const m = mirror.current;
    // (a stroke being painted, or on its way to the worker, is ahead of the worker's land: the worker's latest
    // land and terrain wait until the page has nothing of its own in flight, then go in, #410)
    if (v.heights) heldLand.current.heights = v.heights;
    // (a roof's top an edit reshaped: its columns go in with the land, D487)
    if (v.columns) {
      heldLand.current.columns = v.columns;
      columnsRef.current = v.columns;
    }
    if (v.terrain) heldLand.current.terrain = v.terrain;
    takeLand();
    if (v.water && weatherRef.current) m.mapWater = v.water;
    else if (v.water) {
      // (the renderer works out the surface water: the page reads it from there)
      r?.updateWater(v.water);
      m.water = r?.mapState()?.surface ?? surfaceWater(infoRef.current.W, infoRef.current.H, v.water);
      m.waterView = v.water;
      m.mapWater = v.water;
    }
    // the soil follows the water (the preview's, then the exact settle's): the ground's colours,
    // and the ivy on ruins, so it comes before the objects
    if (v.soil && weatherRef.current) m.soil = v.soil;
    else if (v.soil) {
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
      if (!flipped) {
        ed.reglow();
        ed.sourcesChanged();
      }
    }
    if (v.water || v.entities) setWaterTick((t) => t + 1);
  }

  return {
    api, info, setInfo, view, columnsRef, mirror, renderer, ready, setReady, setTool, tool, anchorRef, flipRef, repaintRef,
    forceEscRef, forceStroke, setForceStroke, forceCursor, setForceCursor, forceRing, setForceRing, gestureRef,
    options, setOptions, setShelf, shelf, shelfOptions, setShelfOptions, setTurn, turn, setPainted, painted,
    setIcons, icons, startDrag, setStartDrag, setBusy, busy, setMessage, message, setHover, hover, showHistory,
    setShowHistory, setCheck, check, setProgress, progress, layer, setLayer, setLayers, waterLayers, waterTick, heldTick,
    flowing, markersOn, setMarkersOn, markersToggle, setNearSources, nearSources, setFeeding, feeding, clearWater, setClearWater,
    setSliceLevel, sliceLevel, setSelecting, selecting, selectingRef, selection, selectionTick, setSelectionTick,
    selectDraw, setSelectDraw, selectPreview, setSelectPreview, deleteMenu, setDeleteMenu, setDeleteCounts,
    deleteCounts, sourceDrag, setSourceDrag, hoverObject, setHoverObject, player, mounted, sound, juice, setSound,
    feel, weather, weatherRef, comparing, endFlip, flipEnd, setWeather, weatherDay, weatherDays, weatherCounting, weatherTarget, setWeatherDay, setWeatherDays,
    setWeatherCounting, heldDay, stepWeather, holdWeatherDay, requestHeldDay, lastHover, rehover, idlePrep, journey, setInstant, instant, firstRun, setFirstRun, firstDone,
    firstDoneRef, minimap, setMinimap, minimapRef, resizing, setDotOpen, dotOpen, saving, setSaving,
    viewTick, setViewTick, setFit, fit, setPicked, picked, setPickedObject, pickedObject,
    pickedObjectRef, pickedRef, setShapeNote, shapeNote, queue, indexed, infoRef, shelfRef, shelfOptionsRef, turnRef,
    optionsRef, needs, enqueue, run, draftWater, showWater, toggleWeather, showSoil, showWithered, applyUpdate, applyView, takeLand
  };
}
