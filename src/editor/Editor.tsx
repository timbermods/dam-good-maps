// The editor (EDITOR_PLAN §3, PLAN §20 D184): the map fills the screen in the shared 3D view; the
// top bar shapes the land and the water (the brushes, the forces, Select), the left shelf places the
// game's objects (each with its ghost under the pointer), the view buttons show the overlays;
// undo, redo, history, the map's health and export always visible. The document itself lives in
// the worker (src/worker/session.ts): every edit is an operation sent there, and only what changed
// comes back.
//
// Every edit is live (D179): a stroke, a click or a drag is applied at once, one undo step. After
// every edit the instant checks come back with it; the problems it made are shown at once with
// their fixes.

import { proxy, transfer, wrap, type Remote } from "comlink";
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { EditOp } from "../core/doc/ops";
import { cornerFor } from "../core/doc/tools";
import { footprintTiles, startEntranceTile, type Orientation } from "../core/format/footprints";
import type { Point } from "../core/features/schema";
import type { FixOp } from "../core/validate/report";
import { rulesFor } from "../core/validate/playability";
import { canSaveToTimberborn, saveFile, saveToTimberborn } from "../platform";
import { FLIPPED, ORIENTATION_NAMES, surfaceWater, type EntityView, type MapView, type SoilView, type SurfaceWater, type WaterView } from "../render3d/model";
import type { MapRenderer, PointerTool, TileHit, ViewState } from "../render3d";
import { View3D } from "../ui/View3D";
import type { GeneratorApi } from "../worker/generator.worker";
import type { CheckItem, CheckProgress, EditorEvent, EntityInfo, ExportCheck, ForceFrame, ForceRequest, SessionInfo, SessionOpen, SessionUpdate, ToolRequest, ViewUpdate, WaterLayers } from "../worker/session";
import { checkStartAt, startProblemAt, describeTile, entitiesByTile, FeatureIndex, feedingGroups, newId, sourceGroups, type StartCheck, type TileContext } from "./features";
import { HistoryPanel, LayerLegend, LAYER_NAMES, plain, StartIndicators, StrengthSlider, whereOf, type ItemActions, type LayerKind } from "./panels";
import { ChecksDot, Header } from "./Header";
import { removeKindOf, type RemoveKind } from "../core/features/objects";

/** Delete takes every kind (D288): objects and sources, the start aside. */
const ALL_KINDS: RemoveKind[] = ["trees", "bushes", "ruins", "objects", "slopes", "sources"];
import { Shelf } from "./Shelf";
import { DEFAULT_SHELF_OPTIONS, paintTiles, quietWord, SHELF, templateOf, type ShelfItem, type ShelfOptions } from "./shelfItems";
import { shelfTool } from "./placeTools";
import { Juice, loadSound, type SoundSettings, type StrokeSound } from "./juice";
import { ForceDriver, powerWord, type ForceStatus } from "./forceDriver";
import { CarveRow, carveSettingsOf, DEFAULT_CARVE, type CarveUi } from "./CarveRow";
import { craterSettingsOf, CraterizeRow, DEFAULT_CRATER, DEFAULT_ERUPT, DEFAULT_QUAKE, EruptRow, eruptSettingsOf, ForceAtWork, QuakeRow, quakeSettingsOf, type CraterUi, type EruptUi, type QuakeUi } from "./ForceRows";
import { eruptAnatomy } from "../core/forces/erupt";
import { eruptNature } from "../core/forces/nature";
import { forceCeiling, STEPS_PER_SECOND } from "../core/forces/force";
import type { Verb } from "../core/forces/op";
import { FaultBrush, type Point as QuakePoint } from "../core/forces/quake";
import type { ForceCue } from "../core/forces/runs";
import type { StartCheckApi } from "./startCheck.worker";
import { startSpots } from "./startHint";
import { FirstRun, loadFirstRun, saveFirstRun, type FirstStep } from "./FirstRun";
import { LayerWidget } from "./LayerWidget";
import { Minimap } from "./Minimap";
import { FORCES, forceShown, TopBar, type TopTool } from "./TopBar";
import { depthLevels, SELECT_MODES, Selection, selectTool, sizeWords, type SelectMode } from "./select";
import { WaterBar } from "./WaterBar";
import { WaterPlayer } from "./waterPlayer";
import type { Hazard } from "../core/sim/weather";
import { OFFICIAL_FLOW } from "../core/gen/calibrated";
import { BRUSHES, BrushPainter, DEFAULT_BRUSH, nextSize, paste, type BrushSettings, type BrushTool, type Stroke } from "./brushes";
import { tilesToRuns } from "../core/math/grid";
import { isSource, sourceSpots, sourcesPressed, targetSource, type SourceSpot } from "./sourceSpots";
import type { TerrainState } from "../core/features/raster/strokePreview";
import { BRUSH_MAX_LEVEL, type BrushParams } from "../core/features/raster/brush";
import { BAD, BADWATER_STRENGTHS, coordinatesAt, DEFAULT_OPTIONS, DRAWING, GOOD, LOCKED, MOVING, paintOverlay, PROBLEM, SELECTED, SOURCE_STRENGTHS, sourceRequest, type OverlayLayer, type ToolOptions } from "./tools";

export interface EditorProps {
  api: Remote<GeneratorApi>;
  opened: SessionOpen;
  /** "Back to settings" (generated maps) or "New map" (imported ones). */
  onBack(info: SessionInfo): void;
  /** After every change (autosave keys on `info.version`). */
  onChange(info: SessionInfo): void;
  /** Open another file (the page confirms before replacing unsaved work). */
  onOpenFile(file: File): void;
  saveState: string;
}

interface Mirror {
  heights: Uint8Array;
  water: SurfaceWater;
  /** The water on screen, as the worker sent it. */
  waterView: WaterView;
  /** The map's water: the last the worker put in place (a journey's frames pass over it). */
  mapWater: WaterView;
  entities: EntityView;
  /** The objects on each tile, made when first asked for after the objects change. */
  entitiesAt: Map<number, number[]> | null;
  /** The objects covering each tile (their footprints), likewise. */
  coverAt?: Map<number, number[]> | null;
  soil?: SoilView;
}

declare global {
  interface Window {
    /** Test hook: the open editor (tests/e2e). */
    dgmEditor?: {
      info: () => SessionInfo;
      tileToClient(x: number, y: number): { x: number; y: number };
      idle(): Promise<void>;
      /** The problems the last edit made. */
      instant(): CheckItem[];
      /** The footprint under the pointer (an object from the shelf): its tiles, and why the game would
       *  refuse it there. */
      fit(): { tiles: number[]; problem: string | null } | null;
      /** The start's check while it moves (its footprint and the three start requirements). */
      startCheck(): StartCheck | null;
      /** The worker, for timing its answers (tests/e2e/preview.spec.ts). */
      worker: Remote<GeneratorApi>;
      /** Strokes whose painted terrain differed from the worker's build (0 when all is well). */
      strokeMismatches(): number;
      /** Strokes, undos and redos on their way to the worker. */
      pendingTerrain(): number;
      /** The carve at work (D199), or null. */
      carve(): ForceStatus | null;
      /** Any force at work (D202, D203, D206), or null. */
      force(): ForceStatus | null;
      /** The last stroke painted (its operation's params), or null. */
      lastStroke(): BrushParams | null;
      /** "The start fits here" after a Flatten stroke (D204), and how long its search took. */
      startHint(): { x: number; y: number; strong: boolean; ms: number } | null;
      /** The editor's sounds (D226): the recorded bank ready, and recordings playing now. */
      sound(): { ready: boolean; playing: number } | null;
      /** What the force picked draws (D258): the stroke being painted (its tiles), the cursor's tile,
       *  and Aim's arrow (from a tile to the pointer), each null when not shown; and the side of a
       *  fault that moves (1 its left, -1 its right: X flips it, D289). */
      gesture(): { stroke: number | null; cursor: [number, number] | null; arrow: { from: [number, number]; to: { x: number; y: number } } | null; side: 1 | -1 };
      /** The sources glowing red for Clear sources (D249), by their corner tiles (the view draws the
       *  glow only with a GPU: this is what it asks for). */
      sourceGlow(): number[];
      /** The Select tool's selection (the working area while it is open, D259), its tiles. */
      selection(): number[];

    };
  }
}

/** The start's middle tile, its facing and the entity or feature it belongs to. */
interface StartHere {
  x: number;
  y: number;
  orientation: Orientation;
  /** The start feature (generated maps), or null for an imported map's own StartingLocation. */
  feature: string | null;
  owner: string;
}

export default function Editor(props: EditorProps) {
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
  /** Where the last painted stroke ended (Shift+press paints a straight line on from it), X's flip of
   *  a quake's side while it is picked, and Esc for a stroke still being drawn. */
  const anchorRef = useRef<QuakePoint | null>(null);
  const flipRef = useRef<(() => void) | null>(null);
  const forceEscRef = useRef<(() => boolean) | null>(null);
  /** What a force draws (D258: clean gestures, never a prediction): the stroke the player paints
   *  (Quake's fault, Erupt's fissure: the gesture itself), a small cursor where a click would act,
   *  and Aim's thin arrow from where the drag began (a tile) to the pointer (the page's point). */
  const [forceStroke, setForceStroke] = useState<number[] | null>(null);
  const [forceCursor, setForceCursor] = useState<[number, number] | null>(null);
  const [aimArrow, setAimArrow] = useState<{ from: [number, number]; to: { x: number; y: number } } | null>(null);
  const gestureRef = useRef({ forceStroke, forceCursor, aimArrow });
  gestureRef.current = { forceStroke, forceCursor, aimArrow };
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
  const [selectAmount, setSelectAmount] = useState(1);
  /** A water source being dragged to a new place: its footprint there (D184). */
  const [sourceDrag, setSourceDrag] = useState<number[] | null>(null);
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
    show: (f) => showWater(f.water),
    changed: () => {
      setPlayerTick((n) => n + 1);
      setFlowing(player.current!.progress);
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
  const [minimap, setMinimap] = useState(() => info.W >= 256 && info.H >= 256);
  const minimapRef = useRef(minimap);
  minimapRef.current = minimap;
  /** The quiet dot's list is open; a save in progress (D184). */
  const [dotOpen, setDotOpen] = useState(false);
  const [saving, setSaving] = useState<{ kind: "timberborn" | "download"; progress: CheckProgress | null } | null>(null);
  const [noticesOpen, setNoticesOpen] = useState(true);
  const [viewTick, setViewTick] = useState(0);
  // the footprint under the pointer (an object from the shelf) and the source clicked (D196)
  const [fit, setFit] = useState<{ tiles: number[]; problem: string | null } | null>(null);
  const [picked, setPicked] = useState<{ x: number; y: number; list: EntityInfo[] } | null>(null);
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
   *  the other edits wait: it is kept when it ends, Esc takes it back.) */
  function run(fn: () => Promise<SessionUpdate>, onDone?: (u: SessionUpdate) => void): Promise<void> {
    if (forcer.current?.running) {
      setMessage({ kind: "info", text: "A force is at work: it is kept when it ends, Esc takes it back." });
      return Promise.resolve();
    }
    const next = queue.current.then(async () => {
      setBusy((b) => b + 1);
      try {
        const u = await fn();
        // an edit other than a stroke: the strokes the page could undo on its own are no longer
        // the latest steps of the history
        if (u.ok) {
          localUndo.current = [];
          localRedo.current = [];
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
  function showWater(w: WaterView) {
    const r = renderer.current;
    r?.updateWater(w);
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
    applyView(u.view);
    // an edit: its water's journey starts from the water right after it
    if (u.ok) {
      if (weatherRef.current) setWeather(null);
      player.current?.begin(u.view.water ? { water: u.view.water, done: 0 } : null);
    }
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
    if (v.heights && pendingTerrain.current === 0) {
      if (checkStroke.current) {
        checkStroke.current = false;
        if (!sameBytes(m.heights, v.heights)) {
          strokeMismatches.current++;
          console.warn("a stroke painted on the page differs from the map the worker built; the worker's is shown");
        }
      }
      m.heights = v.heights;
      r?.updateTerrain(v.heights);
    }
    if (v.terrain && pendingTerrain.current === 0) terrain.current = v.terrain;
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
      reglow();
      sourcesChanged();
    }
    if (v.water || v.entities) setWaterTick((t) => t + 1);
  }

  // ------------------------------------------------------------------------------ the brushes

  const [brushTool, setBrushTool] = useState<BrushTool | null>(null);
  const [brush, setBrushState] = useState<BrushSettings>(loadBrush);
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const brushToolRef = useRef(brushTool);
  brushToolRef.current = brushTool;
  const setBrush = (s: BrushSettings, save = true) => {
    // (at once: the ring and the next stroke read it before the page renders)
    brushRef.current = s;
    setBrushState(s);
    if (save) saveBrush(s);
  };
  /** The terrain the page paints strokes on (the build's, from the worker), and the strokes on
   *  their way to the worker. */
  const terrain = useRef<TerrainState>(props.opened.terrain);
  const pendingTerrain = useRef(0);
  const checkStroke = useRef(false);
  const strokeMismatches = useRef(0);
  /** Strokes at the top of the history, which the page undoes and redoes at once. */
  const localUndo = useRef<Stroke[]>([]);
  const localRedo = useRef<Stroke[]>([]);
  const painter = useRef<BrushPainter | null>(null);

  /** Put a stroke's terrain before or after it back on the map, at once. */
  function showStroke(s: Stroke, which: "before" | "after") {
    const r = renderer.current;
    const W = infoRef.current.W;
    const snap = s[which];
    paste(mirror.current.heights, snap.shown, s.rect, W);
    const pre = terrain.current.pre;
    paste(pre, snap.pre, s.rect, W);
    if (r) {
      r.updateTerrainRect(mirror.current.heights, s.rect);
      r.refreshShadows();
    }
  }

  /** Send the worker a stroke, an undo or a redo of one; the page has shown it already. */
  function sendTerrain(fn: () => Promise<SessionUpdate>): Promise<void> {
    pendingTerrain.current++;
    const next = queue.current.then(async () => {
      setBusy((b) => b + 1);
      try {
        const u = await fn();
        pendingTerrain.current--;
        if (pendingTerrain.current === 0) checkStroke.current = true;
        if (!u.ok) {
          // the worker refused it: the page takes the worker's terrain again
          localUndo.current = [];
          localRedo.current = [];
          if (u.errors.length) setMessage({ kind: "error", text: plain(u.errors[0]) });
          const now = await api.terrainNow();
          if (pendingTerrain.current === 0) {
            mirror.current.heights = now.heights;
            terrain.current = now.terrain;
            renderer.current?.updateTerrain(now.heights);
          }
        }
        applyUpdate(u);
      } catch (e) {
        pendingTerrain.current = Math.max(0, pendingTerrain.current - 1);
        setMessage({ kind: "error", text: String(e instanceof Error ? e.message : e) });
      } finally {
        setBusy((b) => b - 1);
      }
    });
    queue.current = next;
    return next;
  }

  const undo = () => {
    if (forcer.current?.running) return forcer.current.cancel();
    if (painter.current?.painting) return painter.current.cancel();
    const s = localUndo.current.pop();
    if (!s) return run(() => api.undo(), (u) => u.ok && juice.current?.undo());
    juice.current?.undo();
    showStroke(s, "before");
    localRedo.current.push(s);
    sendTerrain(() => api.undo());
  };
  const redo = () => {
    if (painter.current?.painting || forcer.current?.running) return;
    const s = localRedo.current.pop();
    if (!s) return run(() => api.redo());
    showStroke(s, "after");
    localUndo.current.push(s);
    sendTerrain(() => api.redo());
  };

  /** The top bar: a brush, a force, or nothing; the shelf's object goes back. */
  function pickTop(t: TopTool | null) {
    if (forcer.current?.running) return;
    // a force this build doesn't show can't be picked (release.ts, D219)
    const force = t && FORCES.some((f) => f.id === t) ? (t as Verb) : null;
    if (force && !forceShown(force)) return;
    setAimArrow(null);
    if (force) {
      pickBrush(null);
      pickShelf(null);
      setTool(force);
      setPicked(null);
      return;
    }
    if (t === null) setTool(null);
    pickBrush(t as BrushTool | null);
  }

  function pickBrush(t: BrushTool | null) {
    painter.current?.end();
    setShapeNote(null);
    setBrushTool(t);
    if (t) {
      setTool(null);
      pickShelf(null);
      setPicked(null);
    }
  }

  /** The shelf (D184): an object to place, its ghost under the pointer, or none. */
  function pickShelf(item: ShelfItem | null) {
    setShelf(item);
    setTurn(0);
    setFit(null);
    fitWant.current = null;
    setPainted(null);
    setShapeNote(null);
    renderer.current?.setGhost(null);
    if (!item) return;
    painter.current?.end();
    setBrushTool(null);
    setTool(null);
    setPicked(null);
  }
  const applyFix = (fix: FixOp[]) => run(() => api.applyAll(fix.map(({ label: _l, ...op }) => op as EditOp), fix[0]?.label || "Fix", "fix"));

  // the map's health (export profile), checked in the background a moment after each change
  // (EDITOR_PLAN §6): the canonical settle runs in slices and replaces the preview's water, then
  // every check runs; a newer edit drops it. It is not queued, so edits never wait for it.
  useEffect(() => {
    setCheck((c) => (c && c.version === info.version ? c : null));
    setProgress(null);
    let live = true;
    const t = setTimeout(() => {
      void api
        .backgroundCheck(proxy((p: CheckProgress) => live && setProgress(p)))
        .then((r) => {
          if (!r || !mounted.current) return;
          // (a force at work shows its own water: the map's comes after it)
          if (forcer.current?.running) {
            deferred.current.push(r.view);
            return;
          }
          // the exact settle's water ends the journey in progress (eased into), or shows at once.
          // The worker put it in place and sends it once, so it shows even when the page moved on
          // while the check ran (the check started as an edit went in): only the report waits
          if (r.view.water && player.current?.hasJourney) player.current.push({ water: r.view.water, done: 1, final: () => applyView(r.view) });
          else applyView(r.view);
          if (!live || r.check.version !== infoRef.current.version) return;
          setCheck(r.check);
          setProgress(null);
        })
        .catch(() => {
          // the check is advisory here: export runs it again
        });
    }, 700);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [info.version]);

  // the water layer on show: fetched again after every change of the map or its water
  useEffect(() => {
    if (layer === "none") return setLayers(null);
    let live = true;
    void enqueue(() => api.waterLayers()).then((l) => live && setLayers(l));
    return () => {
      live = false;
    };
  }, [layer, info.version, waterTick, check?.version]);


  useEffect(() => props.onChange(info), []);

  // the worker's own news between its answers: the water as it flows after an edit, then the
  // settled water with the soil and plants on it (live editing: an edit never waits on the water)
  useEffect(() => {
    void api.listen(
      proxy((e: EditorEvent) => {
        if (e.version !== infoRef.current.version) return;
        // a force at work shows its own water; the map's settled view comes after it
        if (forcer.current?.running) {
          if (e.kind === "settled") deferred.current.push(e.view);
          return;
        }
        if (e.kind === "water" && e.draft) {
          // the water on a stroke being painted: shown as it comes (D197)
          if (player.current?.hasJourney) player.current.clear();
          showWater(e.water);
        } else if (e.kind === "water") {
          // an edit's water plays at a pace the eye can follow
          player.current?.push({ water: e.water, done: e.done });
        } else if (e.kind === "settled") {
          // (no water in it: the map's water was sent before, so it is the last put in place, not the
          // frame on screen)
          player.current?.push({
            water: e.view.water ?? mirror.current.mapWater,
            done: 1,
            final: () => {
              applyView(e.view);
              // (Max water depth's few words, once the water has settled, D264)
              checkDepthRef.current();
            },
          });
        } else if (e.kind === "weather") {
          const w = weatherRef.current;
          if (!w) return;
          const day = `day ${Math.max(1, Math.ceil(e.day))} of ${e.days}`;
          const words = e.phase === "drought" ? `Drought: ${day}` : e.phase === "badtide" ? `Badtide: ${day}` : e.phase === "return" ? (w === "badtide" ? "The water runs clean again" : "The water comes back") : undefined;
          const soil = e.soil;
          const show = soil ? () => showSoil(soil) : undefined;
          const final = e.phase === "end" ? () => (soil && showSoil(soil), setWeather(null)) : show;
          player.current?.push({ water: e.water, done: e.phase === "return" || e.phase === "end" ? 0.5 : e.day / e.days / 2, ...(words ? { words } : {}), ...(final ? { final } : {}) });
        } else setInstant(e.instant.items.filter((c) => c.here && c.class === "load"));
      }),
    );
    return () => void api.listen(null);
  }, []);

  // ------------------------------------------------------------------------------- the view

  const entitiesAt = (): Map<number, number[]> => {
    const m = mirror.current;
    m.entitiesAt ??= entitiesByTile(m.entities, info.W);
    return m.entitiesAt;
  };
  /** The water or badwater source covering tile (x, y) (a badwater source covers 3 × 3): where it
   *  stands and its tiles. */
  const sourceAt = (x: number, y: number): { x: number; y: number; bad: boolean; tiles: [number, number][] } | null => {
    const m = mirror.current.entities;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const at = entitiesAt();
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        for (const k of at.get(ny * W + nx) ?? []) {
          const template = m.templates[m.template[k]];
          if (template !== "WaterSource" && template !== "BadwaterSource") continue;
          const tiles = footprintTiles(template, { template, x: nx, y: ny, z: 0, orientation: ORIENTATION_NAMES[m.orientation[k]] as Orientation, flipped: false });
          if (tiles.some(([tx, ty]) => tx === x && ty === y)) return { x: nx, y: ny, bad: template === "BadwaterSource", tiles };
        }
      }
    return null;
  };
  /** The map's sources (D249), made when first asked for after the objects change. */
  const spotCache = useRef<{ of: EntityView | null; list: SourceSpot[] }>({ of: null, list: [] });
  const spots = (): SourceSpot[] => {
    const e = mirror.current.entities;
    if (spotCache.current.of !== e) spotCache.current = { of: e, list: sourceSpots(e, infoRef.current.W, infoRef.current.H) };
    return spotCache.current.list;
  };
  /** The source the pointer on tile (x, y) targets (D249): one standing there; else, over water or
   *  bare ground, the nearest within about two tiles (another object standing there wins). */
  const targetAt = (x: number, y: number): SourceSpot | null => {
    const W = infoRef.current.W;
    const e = mirror.current.entities;
    const covered = (coverAt().get(y * W + x) ?? []).some((k) => !isSource(e.templates[e.template[k]]));
    return targetSource(spots(), x, y, W, covered);
  };
  /** The source the pointer targets now (D249), for Delete and its marker. */
  const targetSpot = useRef<SourceSpot | null>(null);
  const [targeted, setTargeted] = useState<number | null>(null);
  const ctx = (): TileContext => ({ W: info.W, H: info.H, heights: mirror.current.heights, water: mirror.current.water, entities: mirror.current.entities, entitiesAt: entitiesAt(), index: indexed, soil: mirror.current.soil, editor: true });

  // where the start is: its feature, or an imported map's own StartingLocation
  const startHereRef = useRef<StartHere | null>(null);
  const startHere = useMemo((): StartHere | null => {
    const f = info.features.find((g) => g.kind === "start");
    if (f && f.kind === "start") return { x: f.params.position[0], y: f.params.position[1], orientation: f.params.orientation, feature: f.id, owner: f.id };
    const e = mirror.current.entities;
    for (let k = 0; k < e.count; k++) {
      if (e.templates[e.template[k]] !== "StartingLocation") continue;
      const o = ORIENTATION_NAMES[e.orientation[k]] as Orientation;
      const [cx, cy] = cornerToCentre(e.x[k], e.y[k], o);
      return { x: cx, y: cy, orientation: o, feature: null, owner: e.owners[e.owner[k]] };
    }
    return null;
  }, [info.features, info.version]);
  startHereRef.current = startHere;

  // overlay: the water layer, dam sites, the footprint of the object under the pointer (green where
  // it fits, red where it doesn't), trees being painted, Remove's rectangle, the source picked, the
  // start while it moves, a source being dragged, the selection, the problems an edit made
  useEffect(() => {
    const r = renderer.current;
    const data = r?.overlayData();
    if (!r || !data) return;
    const layers: OverlayLayer[] = [];
    if (waterLayers && layer !== "none") layers.push(...layerOverlay(waterLayers, layer));
    if (painted) layers.push({ tiles: painted, color: GOOD });
    else if (fit) layers.push({ tiles: fit.tiles, color: fit.problem ? BAD : GOOD });
    if (picked) layers.push({ tiles: [picked.y * info.W + picked.x], color: SELECTED });
    if (startDrag) layers.push({ tiles: [...startDrag.check.tiles, startDrag.check.door], color: startDrag.check.problem || !startDrag.check.meets ? BAD : GOOD });
    if (sourceDrag) layers.push({ tiles: sourceDrag, color: MOVING });
    if (selection.current.count) {
      // the working area (D254): the land outside it is locked, and dimmed
      const out: number[] = [];
      const mask = selection.current.mask;
      for (let i = 0; i < mask.length; i++) if (!mask[i]) out.push(i);
      if (out.length) layers.push({ tiles: out, color: LOCKED });
      layers.push({ tiles: selection.current.tiles(), color: SELECTED, outline: true });
    }
    if (selectDraw) layers.push({ tiles: selectDraw, color: DRAWING });
    // a force's painted stroke (the gesture itself), and its small cursor where a click would act
    if (forceStroke) layers.push({ tiles: forceStroke, color: DRAWING });
    if (forceCursor) layers.push({ tiles: rimTiles(forceCursor[0], forceCursor[1], 1.5, 1.5, 0), color: DRAWING });
    for (const c of instant) for (const [x, y] of c.where?.tiles ?? []) layers.push({ tiles: [y * info.W + x], color: PROBLEM });
    paintOverlay(data, info.W, info.H, layers);
    r.commitOverlay();
  }, [fit, picked, startDrag, instant, ready, waterLayers, layer, sourceDrag, selectionTick, selectDraw, painted, forceStroke, forceCursor]);

  // ------------------------------------------------------------------------------ the pointer

  /** Where the pointer is, for the words beside it (flatten's level, a source's strength). */
  const pointerAt = useRef({ x: 0, y: 0 });

  /** Where the pointer is over the map, for the words beside it. */
  function notePointer(ev: PointerEvent) {
    const box = renderer.current?.canvas.getBoundingClientRect();
    if (box) pointerAt.current = { x: ev.clientX - box.left, y: ev.clientY - box.top };
  }

  // ---------------------------------------------------------------------------- water sources

  /** The source the shelf's Water source or Badwater source places at tile (x, y), at the strength
   *  its options row sets. */
  const sourceAtTile = (bad: boolean, x: number, y: number) => sourceRequest({ ...optionsRef.current, sourceBad: bad }, x, y);
  /** A water or badwater source placed with a click from the shelf (D212): its water spreads at once
   *  (live editing), one undo step. Sources go anywhere in the editor (D184). */
  function placeSource(bad: boolean, x: number, y: number) {
    const req = sourceAtTile(bad, x, y);
    void run(
      () => api.applyTool(req, newId()),
      (u) => {
        if (!u.ok) return;
        feel("source", x, y, 1, false, bad ? "badwater" : undefined);
        firstDone("water");
      },
    );
  }

  /** The source's own record (its id, place and strength), from the worker. */
  function sourceInfo(x: number, y: number): Promise<EntityInfo | null> {
    return enqueue(() => api.entitiesAt(x, y)).then((list) => list.find((e) => e.template === "WaterSource" || e.template === "BadwaterSource") ?? null);
  }

  /** A source dragged somewhere else (D184): its footprint follows the pointer, and the drop is one
   *  undo step; a click without a drag selects it; Esc puts it back. Brushes paint over sources;
   *  with a source picked on the shelf, a press on a placed one still grabs it. */
  const sourceGrab = useRef<{ cancel(): void } | null>(null);
  function grabSource(hit: TileHit | null): PointerTool | null {
    // (a force picked takes the map's clicks, a source's too: D257)
    if (!hit || brushToolRef.current || (shelfRef.current && !shelfRef.current.source) || toolRef.current) return null;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    // with nothing picked, a source within about two tiles is the one pressed (D249); with the
    // shelf's source, a press on a placed one (a new one can go right beside it)
    const free = !shelfRef.current && !toolRef.current && !selectingRef.current;
    const spot = free ? targetAt(hit.x, hit.y) : null;
    const src = spot ? { x: spot.x, y: spot.y, bad: spot.bad, tiles: spot.tiles.map((i): [number, number] => [i % W, Math.floor(i / W)]) } : sourceAt(hit.x, hit.y);
    if (!src) return null;
    const from: [number, number] = [hit.x, hit.y];
    let to = from;
    let done = false;
    const record = sourceInfo(src.x, src.y);
    const canvas = renderer.current?.canvas;
    if (canvas) canvas.style.cursor = "grabbing";
    const end = () => {
      done = true;
      sourceGrab.current = null;
      setSourceDrag(null);
      if (canvas) canvas.style.cursor = "";
    };
    sourceGrab.current = { cancel: end };
    return {
      down: () => true,
      move(h) {
        if (!h || done) return;
        to = [h.x, h.y];
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        setSourceDrag(dx || dy ? src.tiles.map(([x, y]) => [x + dx, y + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H).map(([x, y]) => y * W + x) : null);
      },
      up() {
        if (done) return;
        end();
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        if (!dx && !dy) {
          // a click selects it (its strength in the row); the shelf's source goes back
          if (shelfRef.current?.source) pickShelf(null);
          return pickTile(src.x, src.y);
        }
        void record.then((e) => {
          if (!e) return;
          const name = e.template === "BadwaterSource" ? "badwater source" : "water source";
          // (a badwater source cuts its own spring pool where it lands on uneven ground, D290)
          void run(() => api.applyAll([{ op: "moveEntity", params: { id: e.id, x: e.x + dx, y: e.y + dy } }], `Move a ${name}`));
        });
      },
      cancel: end,
    };
  }

  /** Shift+scroll over a source (D184, D196): its strength a step up or down, the water answering
   *  at once, the new strength beside the pointer; one adjustment is one undo step. */
  const sourceWheel = useRef<{ key: string; record: Promise<EntityInfo | null>; value: number | null; sent: number | null; busy: boolean } | null>(null);
  const wheelNoteTimer = useRef(0);
  function wheelSource(ev: WheelEvent, hit: TileHit | null): boolean {
    if (!ev.shiftKey || !hit) return false;
    const src = sourceAt(hit.x, hit.y);
    if (!src) return false;
    const key = `${src.x},${src.y}`;
    let w = sourceWheel.current;
    if (!w || w.key !== key) w = sourceWheel.current = { key, record: sourceInfo(hit.x, hit.y), value: null, sent: null, busy: false };
    // (browsers turn a Shift+wheel sideways)
    const up = (ev.deltaY || ev.deltaX) < 0;
    const box = renderer.current?.canvas.getBoundingClientRect();
    const at = box ? { x: ev.clientX - box.left, y: ev.clientY - box.top } : pointerAt.current;
    const state = w;
    void state.record.then((e) => {
      if (!e || sourceWheel.current !== state) return;
      const steps = e.template === "BadwaterSource" ? BADWATER_STRENGTHS : SOURCE_STRENGTHS;
      const now = state.value ?? ((e.components.WaterSource as { SpecifiedStrength?: number } | undefined)?.SpecifiedStrength ?? steps[0]);
      const k = steps.reduce((best, f, j) => (Math.abs(f - now) < Math.abs(steps[best] - now) ? j : best), 0);
      const value = steps[Math.max(0, Math.min(steps.length - 1, k + (up ? 1 : -1)))];
      state.value = value;
      const over = value > OFFICIAL_FLOW;
      setShapeNote({ text: over ? `${value} water/s: stronger than any official map` : `${value} water/s`, ok: true, warn: over, ...at });
      clearTimeout(wheelNoteTimer.current);
      wheelNoteTimer.current = window.setTimeout(() => {
        setShapeNote(null);
        if (sourceWheel.current === state && !state.busy) sourceWheel.current = null;
      }, 1500);
      const send = () => {
        if (state.busy || state.value === state.sent || state.value === null) return;
        const v = state.value;
        state.busy = true;
        state.sent = v;
        const name = e.template === "BadwaterSource" ? "Badwater source" : "Water source";
        const op: EditOp = { op: "setEntityProps", params: { id: e.id, components: { WaterSource: { SpecifiedStrength: v, CurrentStrength: v } } } };
        void run(
          () => api.applyStep(op, `${name}: ${v} water/s`, `strength:${e.id}`),
          (u) => {
            const p = pickedRef.current;
            if (u.ok && p && p.list.some((x) => x.id === e.id)) pickTile(p.x, p.y);
          },
        ).finally(() => {
          state.busy = false;
          send();
        });
      };
      send();
    });
    return true;
  }

  // ------------------------------------------------------------------------ the sources' markers

  /** The map's sources as markers (a river's mouth is one), from the page's view of the objects. */
  const groups = useMemo(() => sourceGroups(mirror.current.entities, info.W, mirror.current.heights), [info.version, ready]);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  /** Near the pointer: the groups within two tiles; over water: the groups it comes from. */
  const hoverKey = useRef("");
  function hoverSources(hit: TileHit | null) {
    const key = hit ? `${hit.x},${hit.y}` : "";
    if (key === hoverKey.current) return;
    hoverKey.current = key;
    const gs = groupsRef.current;
    const r = renderer.current;
    if (!hit) {
      setNearSources([]);
      setFeeding([]);
      r?.setSourceGlow([]);
      return;
    }
    const near: number[] = [];
    gs.forEach((g, k) => {
      if (g.tiles.some((t) => Math.abs((t % info.W) - hit.x) <= 2 && Math.abs(Math.floor(t / info.W) - hit.y) <= 2)) near.push(k);
    });
    setNearSources(near);
    const feed = mirror.current.water ? (feedingGroups(mirror.current.water, gs, info.W, info.H, hit.x, hit.y) ?? []) : [];
    setFeeding(feed);
    r?.setSourceGlow(feed.flatMap((k) => gs[k].tiles));
  }
  const hoverSourcesRef = useRef(hoverSources);
  hoverSourcesRef.current = hoverSources;
  /** The objects changed: the sources near the pointer and those feeding its water are found again
   *  at once, so a removed source's marker, label and glow go with it (D260), never after the water
   *  or the background check. */
  function sourcesChanged() {
    // (the groups as the objects are now: the page's memo follows at its next render)
    groupsRef.current = sourceGroups(mirror.current.entities, infoRef.current.W, mirror.current.heights);
    hoverKey.current = "";
    hoverSourcesRef.current(renderer.current?.hoverHit ?? null);
  }
  /** Which markers show: every one with a source picked on the shelf or **Markers** on; else those
   *  near the pointer and those its water comes from. */
  const targetGroup = targeted === null ? -1 : groups.findIndex((g) => g.members.includes(targeted));
  const shownGroups = shelf?.source || markersOn ? groups.map((_, k) => k) : [...new Set([...nearSources, ...feeding, ...(targetGroup >= 0 ? [targetGroup] : [])])];
  const markerRef = useRef(false);
  markerRef.current = shownGroups.length > 0;

  function sourceMarkers() {
    const r = renderer.current;
    if (!r || !shownGroups.length) return null;
    void viewTick;
    return (
      <div class="source-markers" aria-hidden="true">
        {shownGroups.map((k) => {
          const g = groups[k];
          if (!g) return null;
          const p = r.project(g.x + 0.5, g.z + 0.6, -(g.y + 0.5));
          if (!p.visible) return null;
          const n = g.members.length;
          const words = `${n > 1 ? `${n} sources, ` : ""}${g.strength} ${g.bad ? "badwater" : "water"}/s`;
          return (
            <span key={k} class={`map-note source-marker${g.bad ? " bad" : ""}${feeding.includes(k) ? " feeding" : ""}${k === targetGroup ? " target" : ""}`} style={{ left: `${p.x}px`, top: `${p.y}px` }}>
              {words}
            </span>
          );
        })}
      </div>
    );
  }

  // "the start fits here" (D204): after a Flatten stroke, a spot on its level ground for the district
  // center, looked for once the stroke is on the map and the page is idle; a click moves the start
  // there (one step)
  const [startHint, setStartHint] = useState<{ x: number; y: number; z: number; strong: boolean } | null>(null);
  const hintRef = useRef(false);
  hintRef.current = startHint !== null;
  const startHintRef = useRef(startHint);
  startHintRef.current = startHint;
  const hintJob = useRef(0);
  const hintTimer = useRef(0);
  function lookForStart(p: BrushParams) {
    const job = hintJob.current;
    const idle = (fn: () => void) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(fn, { timeout: 1500 }) : window.setTimeout(fn, 100));
    idle(() => {
      if (job !== hintJob.current || !mounted.current) return;
      // (never while painting: it waits for the stroke to end)
      if (painter.current?.painting) return;
      lookForStartRef.current(p, job, true);
    });
  }
  /** The start's full check, off the page (made at the first hint). */
  const startChecker = useRef<Remote<StartCheckApi> | null>(null);
  const startWorker = useRef<Worker | null>(null);
  useEffect(() => () => startWorker.current?.terminate(), []);
  function startWorkerApi(): Remote<StartCheckApi> {
    if (!startChecker.current) {
      startWorker.current = new Worker(new URL("./startCheck.worker.ts", import.meta.url), { type: "module" });
      startChecker.current = wrap<StartCheckApi>(startWorker.current);
    }
    return startChecker.current;
  }
  function findStart(p: BrushParams, job: number) {
    const s = startHere;
    const m = mirror.current;
    if (!s || !m.water) return;
    const t0 = performance.now();
    const W = info.W;
    // the quick part here: a spot on the stroke's level ground where the district center stands
    const spots = startSpots(p, m.heights, m.water.depth, W, info.H, s.orientation, s);
    const c = ctx();
    for (const sp of spots) {
      const [cx, cy] = cornerFor(sp.x, sp.y, s.orientation);
      const door = startEntranceTile(cx, cy, s.orientation);
      if (startProblemAt(c, sp.x, sp.y, door, null, s.owner)) continue;
      hintMs.current = Math.round(performance.now() - t0);
      const z = m.heights[sp.y * W + sp.x];
      setStartHint({ x: sp.x, y: sp.y, z, strong: false });
      clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setStartHint(null), 9000);
      // the start's requirements there (a walk over the whole map), in the background
      const f = s.feature ? info.features.find((g) => g.id === s.feature) : undefined;
      const bench = f && f.kind === "start" ? { level: z, radius: f.params.benchRadius } : null;
      void startWorkerApi()
        .check({ W, H: info.H, heights: m.heights, water: m.water, entities: m.entities, river: indexed?.river ?? null, x: sp.x, y: sp.y, door, bench, self: s.owner, needs })
        .then((check) => {
          if (job !== hintJob.current || !mounted.current) return;
          hintMs.current = Math.round(performance.now() - t0);
          if (check.problem) return setStartHint(null);
          if (check.meets) setStartHint((h) => (h && h.x === sp.x && h.y === sp.y ? { ...h, strong: true } : h));
        })
        .catch(() => undefined);
      return;
    }
    hintMs.current = Math.round(performance.now() - t0);
  }
  const hintMs = useRef(0);
  const lookForStartRef = useRef<(p: BrushParams, job?: number, now?: boolean) => void>(() => undefined);
  lookForStartRef.current = (p, job, now) => (now ? findStart(p, job ?? hintJob.current) : lookForStart(p));
  function startHintTag() {
    const r = renderer.current;
    const h = startHint;
    if (!r || !h) return null;
    void viewTick;
    const at = r.project(h.x + 0.5, h.z + 0.3, -(h.y + 0.5));
    if (!at.visible) return null;
    return (
      <button
        type="button"
        class={`map-note map-tag start-hint${h.strong ? " strong" : ""}`}
        style={{ left: `${at.x}px`, top: `${at.y}px` }}
        title="Move the start here"
        onClick={() => {
          setStartHint(null);
          void run(() => api.moveStartTo(h.x, h.y));
        }}
      >
        {h.strong ? "The start fits here, with water, wood and berries in reach" : "The start fits here"}
      </button>
    );
  }

  /** The sources in the objects picked on a tile (a click on a source). */
  function pickedSources(): EntityInfo[] {
    return pickedRef.current?.list.filter((e) => e.template === "WaterSource" || e.template === "BadwaterSource") ?? [];
  }

  /** Remove sources: their water recedes live; one undo step. */
  function removeSources(list: EntityInfo[]) {
    const bad = list.every((e) => e.template === "BadwaterSource");
    void run(
      () => api.apply({ op: "deleteEntities", params: { entities: list.map((e) => e.id) } }, "user", list.length > 1 ? `Remove ${list.length} sources` : bad ? "Remove a badwater source" : "Remove a water source"),
      (u) => {
        if (!u.ok) return;
        setPicked(null);
        for (const e of list) feel("remove", e.x, e.y);
      },
    );
  }

  /** A word beside the pointer for a moment (a strength, a size). */
  const flashTimer = useRef(0);
  function flashNote(text: string, ev?: MouseEvent) {
    if (ev) {
      const box = renderer.current?.canvas.getBoundingClientRect();
      if (box) pointerAt.current = { x: ev.clientX - box.left, y: ev.clientY - box.top };
    }
    setShapeNote({ text, ok: true, warn: false, ...pointerAt.current });
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setShapeNote(null), 1200);
  }

  // the footprint under the pointer: one check in flight, then the latest tile
  const fitWant = useRef<string | null>(null);
  const fitBusy = useRef(false);
  /** The worker's footprint check of an object at a spot, a request at a time (the latest wins). */
  function checkFit(req: ToolRequest, then: (f: { tiles: number[]; problem: string | null }) => void) {
    const key = JSON.stringify(req);
    if (fitWant.current === key) return;
    fitWant.current = key;
    if (fitBusy.current) return;
    const next = (r: ToolRequest, k: string) => {
      fitBusy.current = true;
      void api
        .footprintCheck(r)
        .then((f) => {
          if (fitWant.current === k) then(f);
        })
        .catch(() => setFit(null))
        .finally(() => {
          fitBusy.current = false;
          const want = fitWant.current;
          if (want && want !== k) next(JSON.parse(want) as ToolRequest, want);
        });
    };
    next(req, key);
  }
  useEffect(() => {
    fitWant.current = null;
    setFit(null);
  }, [shelf, shelfOptions, turn, info.version]);

  // ------------------------------------------------------------------------------ the shelf

  /** Where the ghost stands, and the tile the pointer was last over (R turns it there). */
  const ghostAt = useRef<{ template: string; x: number; y: number; z: number; orientation: number } | null>(null);
  const shelfTile = useRef<[number, number] | null>(null);
  /** The shelf's object over tile (x, y): its ghost there at once, then whether it fits (the
   *  worker's footprint check; the start's own check on the page), with the reason beside the
   *  pointer when it doesn't. */
  function shelfHover(x: number, y: number) {
    const item = shelfRef.current;
    const r = renderer.current;
    if (!item || !r) return;
    shelfTile.current = [x, y];
    const W = info.W;
    const h = mirror.current.heights;
    if (item.id === "start") {
      const s = startHere;
      if (!s) return;
      const o = startTurned(s);
      const [cx, cy] = cornerFor(x, y, o);
      const door = startEntranceTile(cx, cy, o);
      const f = s.feature ? info.features.find((g) => g.id === s.feature) : undefined;
      const bench = f && f.kind === "start" ? { level: Math.max(1, h[y * W + x]), radius: f.params.benchRadius } : null;
      const problem = startProblemAt(ctx(), x, y, door, bench, s.owner);
      const tiles: number[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < info.H) tiles.push((y + dy) * W + x + dx);
      setFit({ tiles: [...tiles, door[1] * W + door[0]], problem });
      shelfWord(problem);
      ghostAt.current = { template: "StartingLocation", x: cx, y: cy, z: bench ? bench.level : h[y * W + x], orientation: ORIENTATION_NAMES.indexOf(o) };
      r.setGhost({ ...ghostAt.current, ok: !problem });
      return;
    }
    const template = templateOf(item, shelfOptionsRef.current);
    const o = ORIENTATION_NAMES[turnRef.current] as Orientation;
    const [cx, cy] = coordinatesAt(template, x, y, o);
    // a source stands on the ground in its middle (a badwater source is 3 × 3)
    const z = item.source ? h[y * W + x] : cx >= 0 && cy >= 0 && cx < W && cy < info.H ? h[cy * W + cx] : h[y * W + x];
    const g = { template, x: cx, y: cy, z, orientation: turnRef.current };
    const same = ghostAt.current && ghostAt.current.template === template && ghostAt.current.x === cx && ghostAt.current.y === cy && ghostAt.current.orientation === g.orientation;
    ghostAt.current = g;
    if (!same) r.setGhost({ ...g, ok: null });
    checkFit(item.source ? sourceAtTile(item.source === "bad", x, y) : { tool: "entity", template, x: cx, y: cy, orientation: o }, (f) => {
      setFit(f);
      shelfWord(f.problem);
      const now = ghostAt.current;
      if (now && now.template === template && now.x === cx && now.y === cy) renderer.current?.setGhost({ ...now, ok: !f.problem });
    });
  }
  /** Why the shelf's object can't stand under the pointer, in a quiet word beside it (none: it fits). */
  function shelfWord(problem: string | null) {
    if (!problem) return setShapeNote((n) => (n?.warn ? null : n));
    setShapeNote({ text: quietWord(problem), ok: true, warn: true, ...pointerAt.current });
  }
  /** The start's facing with the shelf's turns (R). */
  const startTurned = (s: StartHere): Orientation => ORIENTATION_NAMES[(ORIENTATION_NAMES.indexOf(s.orientation) + turnRef.current) % 4] as Orientation;
  /** A click with an object from the shelf: placed there, one step (the start moves there), with
   *  its pop; where it doesn't fit, the reason beside the pointer and nothing else. */
  function placeShelf(x: number, y: number) {
    const item = shelfRef.current;
    if (!item) return;
    const f = fitRef.current;
    if (f?.problem) return flashNote(`Can't go here: ${quietWord(f.problem)}`);
    if (item.id === "start") {
      const s = startHere;
      if (!s) return;
      const o = startTurned(s);
      const [cx, cy] = cornerFor(x, y, o);
      void run(
        () => api.moveStartTo(x, y, o),
        (u) => {
          if (!u.ok) return;
          feel("place", cx, cy, 1, false, "StartingLocation");
          // there is one start: it goes back on the shelf
          pickShelf(null);
        },
      );
      return;
    }
    if (item.source) return placeSource(item.source === "bad", x, y);
    const template = templateOf(item, shelfOptionsRef.current);
    const o = ORIENTATION_NAMES[turnRef.current] as Orientation;
    const [cx, cy] = coordinatesAt(template, x, y, o);
    void run(
      () => api.applyTool({ tool: "entity", template, x: cx, y: cy, orientation: o }, newId()),
      (u) => {
        if (!u.ok) return;
        feel("place", cx, cy, 1, false, template);
        firstDone("place");
      },
    );
  }
  /** Trees and bushes painted by a drag: planted where they can grow, one step, each with its pop. */
  function plantShelf(tiles: number[]) {
    const item = shelfRef.current;
    if (!item || !tiles.length) return;
    const template = templateOf(item, shelfOptionsRef.current);
    void run(
      () => api.plantAt(template, tiles),
      (u) => {
        const planted = (u as SessionUpdate & { planted?: number[] }).planted ?? [];
        if (!u.ok || !planted.length) return;
        const W = infoRef.current.W;
        feel("place", planted[0] % W, Math.floor(planted[0] / W), 1, false, template);
        renderer.current?.wiggle(planted);
        firstDone("place");
      },
    );
  }
  const paintSeed = useRef((Math.random() * 0x7fffffff) | 0);
  const shelfCalls = useRef({ shelfHover, placeShelf, plantShelf });
  shelfCalls.current = { shelfHover, placeShelf, plantShelf };
  // the shelf's object takes the map's left button while it is picked
  useEffect(() => {
    const r = renderer.current;
    if (!r || !shelf) return;
    const W = info.W;
    const H = info.H;
    const t = shelfTool({
      W,
      H,
      hover: (hit, ev) => {
        notePointer(ev);
        if (!hit) {
          r.setGhost(null);
          ghostAt.current = null;
          fitWant.current = null;
          setFit(null);
          setShapeNote(null);
          return;
        }
        shelfCalls.current.shelfHover(hit.x, hit.y);
      },
      place: (x, y) => shelfCalls.current.placeShelf(x, y),
      paintAround: (x, y) => {
        const it = shelfRef.current;
        return it?.fill ? paintTiles(x, y, 2, it.fill, paintSeed.current, W, H) : null;
      },
      painting: (tiles) => {
        setPainted(tiles);
        if (!tiles) paintSeed.current = (Math.random() * 0x7fffffff) | 0;
      },
      plant: (tiles) => shelfCalls.current.plantShelf(tiles),
    });
    r.tool = t;
    // (the pointer resting on the map: the ghost shows there at once)
    if (r.hoverHit) shelfCalls.current.shelfHover(r.hoverHit.x, r.hoverHit.y);
    return () => {
      if (r.tool === t) r.tool = null;
      r.setGhost(null);
      ghostAt.current = null;
    };
  }, [shelf, ready, info.W, info.H]);
  // the shelf's icons: each object drawn once by the view, when the page is idle
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    let live = true;
    const templates = [...new Set(SHELF.map((it) => it.template))];
    const draw = (k: number) => {
      if (!live || k >= templates.length) return;
      const url = r.thumbnail(templates[k]);
      if (url) setIcons((m) => ({ ...m, [templates[k]]: url }));
      const idle = typeof window.requestIdleCallback === "function" ? (fn: () => void) => window.requestIdleCallback(fn, { timeout: 500 }) : (fn: () => void) => window.setTimeout(fn, 30);
      idle(() => draw(k + 1));
    };
    draw(0);
    return () => {
      live = false;
    };
  }, [ready]);

  // ------------------------------------------------------------------------------ Delete (D288)

  /** Each object's tiles (its footprint), made when first asked for after the objects change. */
  const coverAt = (): Map<number, number[]> => {
    const m = mirror.current;
    if (m.coverAt) return m.coverAt;
    const e = m.entities;
    const W = info.W;
    const out = new Map<number, number[]>();
    for (let k = 0; k < e.count; k++) {
      const template = e.templates[e.template[k]];
      for (const [x, y] of footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 })) {
        if (x < 0 || y < 0 || x >= W || y >= info.H) continue;
        const i = y * W + x;
        const list = out.get(i);
        if (list) list.push(k);
        else out.set(i, [k]);
      }
    }
    m.coverAt = out;
    return out;
  };
  /** The corner tiles of the objects standing on these tiles, the start's aside. */
  function objectsOn(tiles: readonly number[]): number[] {
    const e = mirror.current.entities;
    const at = coverAt();
    const out = new Set<number>();
    for (const i of tiles) for (const k of at.get(i) ?? []) if (removeKindOf(e.templates[e.template[k]])) out.add(e.y[k] * info.W + e.x[k]);
    return [...out];
  }
  /** Whether the start stands on one of these tiles. */
  function startOn(tiles: readonly number[]): boolean {
    const e = mirror.current.entities;
    const at = coverAt();
    return tiles.some((i) => (at.get(i) ?? []).some((k) => e.templates[e.template[k]] === "StartingLocation"));
  }
  /** Delete everything standing on these tiles, objects and sources (never the start), as one
   *  step with its whuff; the start says it stays. `quiet`: nothing there says nothing. */
  function deleteOn(tiles: number[], quiet = false): boolean {
    const corners = objectsOn(tiles);
    if (!corners.length) {
      if (startOn(tiles)) flashNote("The start stays: pick it on the shelf to move it");
      else if (!quiet) setMessage({ kind: "info", text: "Nothing stands there to delete." });
      return startOn(tiles);
    }
    const W = info.W;
    void run(
      () => api.removeAt(tiles, ALL_KINDS),
      (u) => u.ok && feel("remove", corners[0] % W, Math.floor(corners[0] / W)),
    );
    return true;
  }
  /** Select and Delete (D288): everything inside the selection (under a cut, on the visible land). */
  function deleteSelection() {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    if (tiles.length) deleteOn(tiles);
  }
  const deleteCalls = useRef({ deleteOn, deleteSelection });
  deleteCalls.current = { deleteOn, deleteSelection };

  // ------------------------------------------------------------------------------ the forces

  /** Each force's options for the next one (D199, D202, D203, D206; kept for the visit), Aim's start,
   *  and the tile the pointer is on while aiming. */
  const [carveUi, setCarveUi] = useState<CarveUi>(DEFAULT_CARVE);
  const carveUiRef = useRef(carveUi);
  carveUiRef.current = carveUi;
  const [craterUi, setCraterUi] = useState<CraterUi>(DEFAULT_CRATER);
  const craterUiRef = useRef(craterUi);
  craterUiRef.current = craterUi;
  const [eruptUi, setEruptUi] = useState<EruptUi>(DEFAULT_ERUPT);
  const eruptUiRef = useRef(eruptUi);
  eruptUiRef.current = eruptUi;
  const [quakeUi, setQuakeUiState] = useState<QuakeUi>(DEFAULT_QUAKE);
  const quakeUiRef = useRef(quakeUi);
  quakeUiRef.current = quakeUi;
  const setQuakeUi = (u: QuakeUi) => {
    quakeUiRef.current = u;
    setQuakeUiState(u);
  };
  const [, setForceTick] = useState(0);
  /** The map's own views that came while a force was at work (the settled water, a check's): they
   *  go on the map just before the force's own answer. */
  const deferred = useRef<ViewUpdate[]>([]);
  /** The force to start next: which, how and where, and the layer showing (D207: only the land
   *  showing changes). */
  const forceReq = useRef<ForceRequest | null>(null);
  /** The last moment shown (an eruption's cooling hiss starts from it). */
  const lastCue = useRef<ForceCue | null>(null);

  /** A frame of a force at work: the ground it changed, its water, its objects. */
  /** A force's water and objects waiting for the next animation frames (the latest of each), so
   *  the land's change, its water and its objects never all land in one frame (each is a whole
   *  map's update). */
  const forceView = useRef<{ water: WaterView | null; entities: EntityView | null; frame: number }>({ water: null, entities: null, frame: 0 });

  function flushForceView(drop = false) {
    const v = forceView.current;
    if (v.frame) cancelAnimationFrame(v.frame);
    v.frame = 0;
    if (drop) {
      v.water = null;
      v.entities = null;
      return;
    }
    const r = renderer.current;
    const m = mirror.current;
    // the water first, the objects a frame later
    if (v.water) {
      const w = v.water;
      v.water = null;
      r?.updateWater(w);
      m.water = r?.mapState()?.surface ?? surfaceWater(infoRef.current.W, infoRef.current.H, w);
      m.waterView = w;
    } else if (v.entities) {
      const e = v.entities;
      v.entities = null;
      m.entities = e;
      m.entitiesAt = null;
      m.coverAt = null;
      r?.updateEntities(e);
      reglow();
      sourcesChanged();
    }
    if (v.water || v.entities) v.frame = requestAnimationFrame(() => flushForceView());
  }

  function showForceFrame(f: ForceFrame) {
    const r = renderer.current;
    const m = mirror.current;
    if (f.heights && f.rect) {
      m.heights = f.heights;
      r?.updateTerrainRect(f.heights, f.rect);
    }
    const v = forceView.current;
    if (f.water) v.water = f.water;
    if (f.entities) v.entities = f.entities;
    if ((f.water || f.entities) && !v.frame) v.frame = requestAnimationFrame(() => flushForceView());
    if (f.heat) r?.setHeat(f.heat);
  }

  function flushDeferred() {
    const list = deferred.current;
    deferred.current = [];
    for (const v of list) applyView(v);
  }

  // (the driver lives as long as the editor; it calls the latest of these)
  const forceCalls = useRef<{ keep(): Promise<void>; drop(): Promise<void>; show(f: ForceFrame): void; carve(origin: [number, number], end?: [number, number]): void } | null>(null);
  forceCalls.current = {
    keep: () =>
      enqueue(async () => {
        setBusy((b) => b + 1);
        try {
          const u = await api.forceStop();
          // (the kept map's own view replaces the force's last frames)
          flushForceView(true);
          flushDeferred();
          localUndo.current = [];
          localRedo.current = [];
          applyUpdate(u);
          renderer.current?.refreshShadows();
          if (!u.ok && u.errors.length) setMessage({ kind: "info", text: plain(u.errors[0]) });
          else if (u.ok) setMessage(null);
        } finally {
          setBusy((b) => b - 1);
        }
      }),
    drop: () =>
      enqueue(async () => {
        const v = await api.forceCancel();
        if (!mounted.current) return;
        flushForceView(true);
        flushDeferred();
        applyView(v);
        renderer.current?.refreshShadows();
      }),
    show: showForceFrame,
    carve: startCarve,
  };
  const forcer = useRef<ForceDriver | null>(null);
  forcer.current ??= new ForceDriver({
    start: (again) =>
      enqueue(() => {
        const q = forceReq.current;
        if (again || !q) return api.forceAgain();
        return api.forceStart(q);
      }),
    advance: (steps) => enqueue(() => api.forceAdvance(steps)),
    paint: (path, side) => enqueue(() => api.forcePaint(path, side)),
    keep: () => forceCalls.current!.keep(),
    drop: () => forceCalls.current!.drop(),
    renderer: () => renderer.current,
    show: (f) => forceCalls.current!.show(f),
    changed: () => setForceTick((n) => n + 1),
    error: (text) => setMessage({ kind: "error", text: plain(text) }),
    moment: (f) => {
      lastCue.current = f.cue;
      renderer.current?.setForceMoment(f.cue);
      juice.current?.forceMoment(f.cue, f.head);
    },
    ended: (kept) => {
      if (kept) renderer.current?.forceDone();
      else renderer.current?.clearForce();
      juice.current?.forceEnded(kept, lastCue.current ?? undefined);
      lastCue.current = null;
      // an unleashed source (D239): picked again, with Try another once kept
      const u = unleashRef.current;
      if (u) {
        unleashRef.current = null;
        setUnleashing(false);
        if (kept) lastUnleash.current = u.id;
        pickTile(u.x, u.y);
      }
    },
  });
  // (a force at work when the editor closes goes with it)
  useEffect(() => () => forcer.current?.cancel(), []);

  // ------------------------------------------------------------------------ Unleash, on a source

  /** The source being unleashed (D239): its id and its tile, while its carve works. */
  const unleashRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const [unleashing, setUnleashing] = useState(false);
  /** The source last unleashed and kept (its row offers Try another). */
  const lastUnleash = useRef<string | null>(null);
  const [unleashPower, setUnleashPower] = useState(DEFAULT_CARVE.power);
  const unleashPowerRef = useRef(unleashPower);
  unleashPowerRef.current = unleashPower;

  /** Unleash a placed source (D239): it carves its own course downhill with Carve's engine (from a
   *  pool, breaking out where it would spill over), or to `end`, aimed; its strength sets the width,
   *  Power how hard it cuts, the rest Carve's defaults; the source stays its origin. */
  function unleash(e: EntityInfo, end?: [number, number]) {
    if (forcer.current?.running) return;
    const x = e.template === "BadwaterSource" ? e.x + 1 : e.x;
    const y = e.template === "BadwaterSource" ? e.y + 1 : e.y;
    unleashRef.current = { id: e.id, x, y };
    setUnleashing(true);
    const settings = { ...carveSettingsOf({ ...DEFAULT_CARVE, power: unleashPowerRef.current }, !!end), defyGravity: false };
    startForce({ verb: "carve", settings, origin: [x, y], ...(end ? { end } : {}), cut: renderer.current?.slice ?? null, source: e.id });
  }

  /** Try another for an unleashed source: another course from the same land, in its place. */
  function unleashAgain(e: EntityInfo) {
    if (forcer.current?.running) return;
    unleashRef.current = { id: e.id, x: e.template === "BadwaterSource" ? e.x + 1 : e.x, y: e.template === "BadwaterSource" ? e.y + 1 : e.y };
    setUnleashing(true);
    forceAgain();
  }

  /** Unleash's button: a click unleashes it downhill; pressed and dragged out onto the land, it aims
   *  that way (D258: only a thin arrow from the source to the pointer; the source's own drag still
   *  moves it). */
  function unleashDown(ev: PointerEvent, e: EntityInfo) {
    if (ev.button !== 0 || forcer.current?.running) return;
    ev.preventDefault();
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const from: [number, number] = [e.template === "BadwaterSource" ? e.x + 1 : e.x, e.template === "BadwaterSource" ? e.y + 1 : e.y];
    let aim: [number, number] | null = null;
    let moved = false;
    const move = (m: PointerEvent) => {
      if (Math.hypot(m.clientX - x0, m.clientY - y0) > 6) moved = true;
      if (!moved) return;
      const hit = renderer.current?.pick(m.clientX, m.clientY) ?? null;
      const onMap = hit && document.elementFromPoint(m.clientX, m.clientY)?.tagName === "CANVAS";
      aim = onMap && hit && Math.hypot(hit.x - from[0], hit.y - from[1]) >= 2 ? [hit.x, hit.y] : null;
      setAimArrow({ from, to: { x: m.clientX, y: m.clientY } });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setAimArrow(null);
      // (a click starts it from the button's own click: starting it here would put the row's
      // controls under the pointer before the click lands)
      if (moved && aim) unleash(e, aim);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** The row while an unleashed source's carve works: Carve's own controls. */
  function unleashRow(): { label: string; content: ComponentChildren } | null {
    const st = forcer.current?.status ?? null;
    if (!unleashing || !st) return null;
    const secs = (st.steps / STEPS_PER_SECOND).toFixed(1);
    return {
      label: "Unleash at work",
      content: (
        <>
          <span class="bar-status" role="status">
            {st.stopping ? "Keeping the river…" : st.paused ? `Paused at ${secs} s` : `The source carves its way… ${secs} s`}
          </span>
          <button type="button" disabled={st.stopping} onClick={() => forcer.current?.pause(!forcer.current.status?.paused)} title={st.paused ? "Carry on (Space)" : "Hold it where it is (Space)"}>
            {st.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" disabled={st.stopping} onClick={() => forcer.current?.cancel()} title="Take all of it back (Esc)">
            Revert
          </button>
        </>
      ),
    };
  }

  /** The water's journey and a weather run give way to the force's own water. */
  function clearForForce() {
    player.current?.clear();
    if (weatherRef.current) setWeather(null);
    setPicked(null);
    setShapeNote(null);
    setMessage(null);
  }

  /** Start the force picked with `req`. */
  function startForce(req: ForceRequest, painting = false) {
    // the working area (D254, D259): outside it the land is unbreakable rock to the force
    const area = workingArea();
    if (area) req = { ...req, area };
    // the choices the row doesn't show come from the land and the seed (D289)
    req = { ...req, natural: true };
    forceReq.current = req;
    clearForForce();
    // (the arrow goes as the force starts; a painted Lift keeps its stroke while it is painted)
    setAimArrow(null);
    setForceCursor(null);
    if (!painting) setForceStroke(null);
    void forcer.current?.start(false, painting);
  }

  function startCarve(origin: [number, number], end?: [number, number]) {
    startForce({ verb: "carve", settings: carveSettingsOf(carveUiRef.current, !!end), origin, ...(end ? { end } : {}), cut: renderer.current?.slice ?? null });
  }

  /** Try another: the last force again, from the same land, another way. */
  function forceAgain() {
    if (!forcer.current || forcer.current.running) return;
    clearForForce();
    void forcer.current.start(true);
  }

  /** The small cursor where a force's click would act (D258: the cursor, never a footprint), at most
   *  once a frame. */
  const cursorFrame = useRef(0);
  function showForceCursor(at: [number, number] | null) {
    cancelAnimationFrame(cursorFrame.current);
    cursorFrame.current = requestAnimationFrame(() => {
      const now = gestureRef.current.forceCursor;
      if (now === at || (now && at && now[0] === at[0] && now[1] === at[1])) return;
      setForceCursor(at);
    });
  }

  // Carve takes the map's clicks and drags while it is picked (D258, D289: the gesture is the mode): a
  // click unleashes it where the cursor is; a drag aims it, with only a thin arrow from where it
  // began to the pointer, and on release the carve goes that way, cutting through rises on its way
  useEffect(() => {
    const r = renderer.current;
    if (!r || tool !== "carve") return;
    let down: TileHit | null = null;
    /** The drag has left the tile it began on: it aims (a click stays within a tile of it). */
    let aiming = false;
    const t: PointerTool = {
      down: (hit, ev) => {
        if (ev.button !== 0 || !hit || forcer.current?.running) return false;
        down = hit;
        aiming = false;
        showForceCursor(null);
        return true;
      },
      move: (hit, ev) => {
        notePointer(ev);
        if (!down) return;
        if (!aiming && hit && Math.hypot(hit.x - down.x, hit.y - down.y) >= 2) aiming = true;
        if (aiming) setAimArrow({ from: [down.x, down.y], to: { x: ev.clientX, y: ev.clientY } });
      },
      up: (hit) => {
        const d = down;
        const aimed = aiming;
        down = null;
        aiming = false;
        setAimArrow(null);
        if (!d || !hit) return;
        if (!aimed || Math.hypot(hit.x - d.x, hit.y - d.y) < 2) {
          if (Math.max(Math.abs(hit.x - d.x), Math.abs(hit.y - d.y)) <= 1) forceCalls.current!.carve([d.x, d.y]);
          return;
        }
        forceCalls.current!.carve([d.x, d.y], [hit.x, hit.y]);
      },
      hover: (hit, ev) => {
        notePointer(ev);
        showForceCursor(hit && !forcer.current?.running ? [hit.x, hit.y] : null);
      },
      cancel: () => {
        down = null;
        aiming = false;
        setAimArrow(null);
      },
    };
    r.tool = t;
    forceEscRef.current = () => {
      if (!down) return false;
      down = null;
      aiming = false;
      setAimArrow(null);
      return true;
    };
    return () => {
      if (r.tool === t) r.tool = null;
      forceEscRef.current = null;
      cancelAnimationFrame(cursorFrame.current);
      setAimArrow(null);
      setForceCursor(null);
      setShapeNote(null);
    };
  }, [tool, ready]);

  /** The page's map's ceiling for the forces (the worker's rule), worked out once per map state. */
  const ceilingOf = useRef<{ heights: Uint8Array | null; top: number }>({ heights: null, top: 16 });

  /** Why a vent clicked at (x, y) would not erupt at all (D258: the one word Erupt shows: no room to
   *  rise, even on its flank), from the worker's own fit on the same ground; null when it will. */
  function eruptRefusal(x: number, y: number): string | null {
    const { W, H } = infoRef.current;
    const heights = mirror.current.heights;
    const c = ceilingOf.current;
    if (c.heights !== heights) {
      c.heights = heights;
      c.top = forceCeiling(heights);
    }
    try {
      eruptAnatomy({ W, H, heights, maxHeight: c.top }, eruptNature(eruptSettingsOf(eruptUiRef.current), { W, H, heights, at: y * W + x }), { origin: y * W + x });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /** The tiles of a line through the points (the painted fault or fissure, drawn on the land). */
  function strokeTiles(points: readonly { x: number; y: number }[]): number[] {
    const { W, H } = infoRef.current;
    const out = new Set<number>();
    for (let k = 0; k < points.length; k++) {
      const a = points[Math.max(0, k - 1)];
      const b = points[k];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
      for (let t = 0; t <= n; t++) {
        const x = Math.round(a.x + ((b.x - a.x) * t) / n);
        const y = Math.round(a.y + ((b.y - a.y) * t) / n);
        if (x >= 0 && y >= 0 && x < W && y < H) out.add(y * W + x);
      }
    }
    return [...out];
  }

  /** An ellipse's rim on the land (the force cursor's small ring). */
  function rimTiles(cx: number, cy: number, a: number, b: number, angle: number): number[] {
    const { W, H } = infoRef.current;
    const out = new Set<number>();
    const n = Math.max(24, Math.ceil((a + b) * 3));
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2;
      const u = Math.cos(t) * a;
      const v = Math.sin(t) * b;
      const x = Math.round(cx + u * Math.cos(angle) - v * Math.sin(angle));
      const y = Math.round(cy + u * Math.sin(angle) + v * Math.cos(angle));
      if (x >= 0 && y >= 0 && x < W && y < H) out.add(y * W + x);
    }
    return [...out];
  }

  // Craterize, Erupt and Quake take the map's clicks and drags while picked (D258: clean gestures):
  // a click strikes or erupts at once, where the small cursor is; Craterize's Aim is a drag in a
  // direction, with only a thin arrow from the impact to the pointer; a fissure or a fault is painted,
  // its stroke drawn as it is painted (the gesture itself), and letting go starts it (a Lift shows its
  // result as it is painted, and is kept when let go). Nothing predicts the result on the land; the
  // only word is Erupt's when a vent can't rise at all.
  useEffect(() => {
    const r = renderer.current;
    if (!r || !tool || tool === "carve") return;
    const verb = tool;
    let down: TileHit | null = null;
    let brush: FaultBrush | null = null;
    let lastMove = 0;
    let painting = false;
    let strokeFrame = 0;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const cut = () => renderer.current?.slice ?? null;
    const point = (hit: TileHit) => ({ x: Math.max(0, Math.min(W - 1, hit.x)), y: Math.max(0, Math.min(H - 1, hit.y)) });
    /** Quake is painted; Erupt's drag paints a fissure (a click vents, D289). */
    const painted = () => verb === "quake" || verb === "erupt";
    /** The drag has left the tile it began on (Craterize: it aims; Erupt: a fissure). */
    let dragged = false;
    const showStroke = (path: readonly QuakePoint[] | null) => {
      cancelAnimationFrame(strokeFrame);
      strokeFrame = requestAnimationFrame(() => setForceStroke(path ? strokeTiles(path) : null));
    };
    /** Erupt's one word, once a frame at most (it reads the ground round the vent). */
    let wordFrame = 0;
    const eruptWord = (x: number, y: number) => {
      cancelAnimationFrame(wordFrame);
      wordFrame = requestAnimationFrame(() => {
        const why = eruptRefusal(x, y);
        setShapeNote(why ? { text: why, ok: false, warn: false, ...pointerAt.current } : null);
      });
    };
    const sendPaint = () => {
      if (!brush) return;
      const intent = brush.intent();
      showStroke(intent.path);
      if (!painting) {
        if (intent.path.length < 2 || Math.hypot(intent.path.at(-1)!.x - intent.path[0].x, intent.path.at(-1)!.y - intent.path[0].y) < 1) return;
        painting = true;
        startForce({ verb: "quake", settings: quakeSettingsOf(quakeUiRef.current), path: intent.path, side: intent.side, cut: cut(), painting: true }, true);
      } else forcer.current?.paint(intent.path, intent.side);
    };
    flipRef.current = () => {
      const side = quakeUiRef.current.side === 1 ? -1 : 1;
      setQuakeUi({ ...quakeUiRef.current, side });
      if (brush) {
        brush.side = side;
        if (quakeUiRef.current.mode === "lift") sendPaint();
      }
    };
    const t: PointerTool = {
      down: (hit, ev) => {
        if (ev.button !== 0 || !hit || forcer.current?.running) return false;
        cancelAnimationFrame(wordFrame);
        down = hit;
        dragged = false;
        notePointer(ev);
        showForceCursor(null);
        setShapeNote(null);
        if (painted()) {
          const p = point(hit);
          // Shift: a straight line on from where the last stroke ended
          const from = ev.shiftKey && anchorRef.current ? anchorRef.current : p;
          brush = new FaultBrush(from, W, H, quakeUiRef.current.side);
          brush.aim(p);
          if (ev.shiftKey && anchorRef.current) brush.advance(0, true);
          lastMove = performance.now();
          // (Erupt's stroke shows once the drag leaves its tile: until then it is a click, a vent)
          if (verb === "quake") showStroke(brush.intent().path);
        }
        return true;
      },
      move: (hit, ev) => {
        notePointer(ev);
        if (!hit || !down) return;
        const p = point(hit);
        if (!dragged && Math.hypot(p.x - down.x, p.y - down.y) >= 2) dragged = true;
        if (brush) {
          const now = performance.now();
          brush.aim(p);
          brush.advance((now - lastMove) / 1000);
          lastMove = now;
          if (verb === "quake" && quakeUiRef.current.mode === "lift") sendPaint();
          else if (verb === "quake" || dragged) showStroke(brush.intent().path);
          return;
        }
        // Craterize: a drag aims a glancing blow, with only a thin arrow
        if (dragged) setAimArrow({ from: [down.x, down.y], to: { x: ev.clientX, y: ev.clientY } });
      },
      up: (hit) => {
        const d = down;
        down = null;
        setAimArrow(null);
        if (!d) return;
        const p = hit ? point(hit) : null;
        if (brush) {
          const b = brush;
          brush = null;
          if (p) b.aim(p);
          b.advance(0, true);
          const intent = b.intent();
          anchorRef.current = intent.path.at(-1) ?? null;
          if (verb === "quake" && quakeUiRef.current.mode === "lift") {
            showStroke(null);
            if (painting) void forcer.current?.stop();
            painting = false;
            return;
          }
          let length = 0;
          for (let k = 1; k < intent.path.length; k++) length += Math.hypot(intent.path[k].x - intent.path[k - 1].x, intent.path[k].y - intent.path[k - 1].y);
          if (verb === "erupt") {
            showStroke(null);
            // a click (or a drag too short to be a fissure) vents where it began
            if (!dragged || length < 3) {
              anchorRef.current = null;
              return startForce({ verb: "erupt", settings: eruptSettingsOf(eruptUiRef.current), origin: [d.x, d.y], cut: cut() });
            }
            const o = intent.path[0];
            startForce({ verb: "erupt", settings: eruptSettingsOf(eruptUiRef.current, true), origin: [Math.round(o.x), Math.round(o.y)], path: intent.path, cut: cut() });
          } else startForce({ verb: "quake", settings: quakeSettingsOf(quakeUiRef.current), path: intent.path, side: intent.side, cut: cut() });
          return;
        }
        if (!p) return;
        // Craterize: a drag is a glancing blow that way; a click strikes where it began
        const glancing = dragged && Math.hypot(p.x - d.x, p.y - d.y) > 1;
        if (!glancing && Math.max(Math.abs(p.x - d.x), Math.abs(p.y - d.y)) > 1) return;
        startForce({ verb: "craterize", settings: craterSettingsOf(craterUiRef.current, glancing), origin: [d.x, d.y], ...(glancing ? { end: [p.x, p.y] as [number, number] } : {}), cut: cut() });
      },
      hover: (hit, ev) => {
        notePointer(ev);
        if (!hit || forcer.current?.running || down) {
          if (!hit) showForceCursor(null);
          return;
        }
        // a painted fault has no cursor: the stroke is the gesture (Erupt's click vents: it has one)
        if (verb === "quake") {
          showForceCursor(null);
          return;
        }
        showForceCursor([hit.x, hit.y]);
        if (verb === "erupt") eruptWord(hit.x, hit.y);
      },
      cancel: () => {
        down = null;
        dragged = false;
        brush = null;
        if (painting) forcer.current?.cancel();
        painting = false;
        setAimArrow(null);
        showStroke(null);
      },
    };
    r.tool = t;
    forceEscRef.current = () => {
      if (!down && !brush) return false;
      down = null;
      brush = null;
      setAimArrow(null);
      showStroke(null);
      setShapeNote(null);
      return true;
    };
    return () => {
      if (r.tool === t) r.tool = null;
      cancelAnimationFrame(strokeFrame);
      cancelAnimationFrame(wordFrame);
      cancelAnimationFrame(cursorFrame.current);
      flipRef.current = null;
      forceEscRef.current = null;
      if (painting) forcer.current?.cancel();
      setForceStroke(null);
      setForceCursor(null);
      setAimArrow(null);
      setShapeNote(null);
    };
  }, [tool, ready]);

  /** A source clicked (D196): it is picked, with its strength and its water in the row beneath the
   *  top bar. */
  function pickTile(x: number, y: number) {
    void enqueue(() => api.entitiesAt(x, y)).then((list) => {
      const sources = list.filter((e) => e.template === "WaterSource" || e.template === "BadwaterSource");
      setPicked(sources.length ? { x, y, list: sources } : null);
    });
  }
  /** A picked source's water (clean or bad) or strength changed. */
  function changeSource(e: EntityInfo, c: { kind?: "clean" | "bad"; strength?: number }) {
    if (!picked) return;
    const at: [number, number] = [picked.x, picked.y];
    if (c.kind) {
      // clean or bad is the source's own (D196): a new source of the other kind in its place
      const bad = c.kind === "bad";
      const cx = e.template === "BadwaterSource" ? e.x + 1 : e.x;
      const cy = e.template === "BadwaterSource" ? e.y + 1 : e.y;
      const s0 = Number((e.components.WaterSource as { SpecifiedStrength?: number } | undefined)?.SpecifiedStrength ?? 1);
      const req = sourceRequest({ ...optionsRef.current, sourceBad: bad, sourceStrength: Math.min(8, s0), badwaterStrength: s0 }, cx, cy);
      const place: EditOp = { op: "placeEntity", params: { id: newId(), template: req.template, x: req.x, y: req.y, orientation: req.orientation, ...(req.components ? { components: req.components } : {}) } };
      void run(
        () => api.applyAll([{ op: "deleteEntities", params: { entities: [e.id] } }, place], bad ? "Make a source badwater" : "Make a source clean"),
        (u) => {
          if (!u.ok) return;
          pickTile(cx, cy);
          feel("source", cx, cy);
        },
      );
      return;
    }
    if (c.strength === undefined) return;
    const v = c.strength;
    // its water answers each step, and one adjustment is one undo step
    const op: EditOp = { op: "setEntityProps", params: { id: e.id, components: { WaterSource: { SpecifiedStrength: v, CurrentStrength: v } } } };
    const name = e.template === "BadwaterSource" ? "Badwater source" : "Water source";
    void run(
      () => api.applyStep(op, `${name}: ${v} water/s`, `strength:${e.id}`),
      (u) => {
        if (u.ok) pickTile(at[0], at[1]);
      },
    );
  }
  /** The row beneath the top bar for a picked source: its strength, its water, Remove. */
  function pickedRow(): { label: string; content: ComponentChildren } | null {
    const e = picked?.list[0];
    if (!e) return null;
    const bad = e.template === "BadwaterSource";
    const steps = bad ? BADWATER_STRENGTHS : SOURCE_STRENGTHS;
    const strength = Number((e.components.WaterSource as { SpecifiedStrength?: number } | undefined)?.SpecifiedStrength ?? steps[0]);
    return {
      label: `${bad ? "Badwater" : "Water"} source, selected`,
      content: (
        <>
          <label>
            Strength
            <select aria-label="Strength" value={String(strength)} onChange={(ev) => changeSource(e, { strength: Number((ev.target as HTMLSelectElement).value) })}>
              {[...new Set([...steps, strength])]
                .sort((a, b) => a - b)
                .map((v) => (
                  <option key={v} value={String(v)}>
                    {v} water/s
                  </option>
                ))}
            </select>
          </label>
          <label>
            Water
            <select aria-label="Water" value={bad ? "bad" : "clean"} onChange={(ev) => changeSource(e, { kind: (ev.target as HTMLSelectElement).value as "clean" | "bad" })}>
              <option value="clean">Clean</option>
              <option value="bad">Badwater</option>
            </select>
          </label>
          <button type="button" onClick={() => removeSources(picked!.list)}>
            Remove
          </button>
          <span class="bar-divider" aria-hidden="true" />
          <button
            type="button"
            class="unleash-button"
            title="Unleash (U): the source carves its own river downhill, its width from its strength (from a pool, it breaks out where the water would spill over). Drag from here onto the land to aim it."
            onPointerDown={(ev) => unleashDown(ev as unknown as PointerEvent, e)}
            onClick={() => unleash(e)}
          >
            Unleash
          </button>
          <label class="slider-field" title="How hard its river cuts: a creek to a catastrophe">
            Power
            <input type="range" min={0} max={100} step={5} aria-label="Unleash power" aria-valuetext={`${unleashPower}, ${powerWord(unleashPower)}`} value={unleashPower} onInput={(ev) => setUnleashPower(Number((ev.target as HTMLInputElement).value))} />
            <output>{powerWord(unleashPower)}</output>
          </label>
          {info.forceAgain === "carve" && lastUnleash.current === e.id ? (
            <button type="button" onClick={() => unleashAgain(e)} title="The same source, another course (it replaces the last one)">
              Try another
            </button>
          ) : null}
          <button type="button" class="linkish" aria-label="Put it down" onClick={() => setPicked(null)}>
            ×
          </button>
        </>
      ),
    };
  }
  /** The row beneath the top bar for the shelf's object: its own options, if it has any. */
  function shelfRow(): { label: string; content: ComponentChildren } | null {
    if (!shelf) return null;
    if (shelf.source) {
      const bad = shelf.source === "bad";
      const steps = bad ? BADWATER_STRENGTHS : SOURCE_STRENGTHS;
      const value = bad ? options.badwaterStrength : options.sourceStrength;
      // the strength of the next one (over a placed source, Shift+scroll sets its own)
      return {
        label: `${shelf.name} options`,
        content: <StrengthSlider value={value} steps={steps} onChange={(v) => setOptions({ ...optionsRef.current, ...(bad ? { badwaterStrength: v } : { sourceStrength: v }) })} />,
      };
    }
    if (shelf.id === "ruin")
      return {
        label: "Ruin options",
        content: (
          <label>
            Height
            <select aria-label="Height" value={String(shelfOptions.ruinHeight)} onChange={(ev) => setShelfOptions({ ...shelfOptions, ruinHeight: Number((ev.target as HTMLSelectElement).value) })}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
                <option key={k} value={String(k)}>
                  {k} {k === 1 ? "level" : "levels"}
                </option>
              ))}
            </select>
          </label>
        ),
      };
    if (shelf.id === "relic")
      return {
        label: "Relic options",
        content: (
          <label>
            Size
            <select aria-label="Size" value={shelfOptions.relicSize} onChange={(ev) => setShelfOptions({ ...shelfOptions, relicSize: (ev.target as HTMLSelectElement).value as ShelfOptions["relicSize"] })}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
        ),
      };
    return null;
  }

  /** The options row of the force picked (Power, Size, its one choice, Try another: D289), or its
   *  status while it works. */
  function forceRow(): ComponentChildren {
    if (!tool) return null;
    const force = FORCES.find((f) => f.id === tool)!;
    const st = forcer.current?.status ?? null;
    const canAgain = info.forceAgain === tool;
    if (tool === "carve")
      return (
        <CarveRow
          force={force}
          ui={carveUi}
          onUi={(u) => {
            setCarveUi(u);
          }}
          status={st}
          canAgain={canAgain}
          onAgain={() => void forceAgain()}
          onPause={() => forcer.current?.pause(!forcer.current.status?.paused)}
          onRevert={() => forcer.current?.cancel()}
        />
      );
    if (st) return <ForceAtWork force={force} status={st} onRevert={() => forcer.current?.cancel()} />;
    const again = () => void forceAgain();
    if (tool === "craterize") return <CraterizeRow force={force} ui={craterUi} onUi={setCraterUi} canAgain={canAgain} onAgain={again} />;
    if (tool === "erupt") return <EruptRow force={force} ui={eruptUi} onUi={setEruptUi} canAgain={canAgain} onAgain={again} />;
    return <QuakeRow force={force} ui={quakeUi} onUi={setQuakeUi} canAgain={canAgain} onAgain={again} />;
  }

  /** Clear sources (D249): the sources under the ring glow red before the stroke reaches them, and
   *  those it has passed over stay red until it is let go. */
  const clearing = useRef<{ of: readonly number[]; dabs: number; taken: Set<number> } | null>(null);
  const glowing = useRef(false);
  const glowAt = useRef<[number, number] | null>(null);
  const glowCorners = useRef<number[]>([]);
  function clearGlow(at: [number, number] | null, stroke: { settings: Omit<BrushParams, "dabs">; dabs: readonly number[] } | null) {
    const r = renderer.current;
    if (!r) return;
    glowAt.current = stroke ? null : at;
    const b = brushRef.current;
    if (!b.clearSources || !at || !brushToolRef.current) {
      glowCorners.current = [];
      if (!stroke) clearing.current = null;
      if (glowing.current) r.highlightObjects(null);
      glowing.current = false;
      return;
    }
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const list = spots();
    const glow = new Set<number>();
    if (stroke) {
      let c = clearing.current;
      // (a straight line is painted again from its start each time)
      if (!c || c.of !== stroke.dabs || c.dabs > stroke.dabs.length) c = clearing.current = { of: stroke.dabs, dabs: 0, taken: new Set() };
      for (const sp of sourcesPressed(list, stroke.settings, stroke.dabs.slice(c.dabs), W)) if (inArea(sp.tiles)) c.taken.add(sp.corner);
      c.dabs = stroke.dabs.length;
      for (const k of c.taken) glow.add(k);
    } else clearing.current = null;
    const shape = stroke ? stroke.settings : { size: b.size, ...(b.square ? { shape: "square" as const } : {}), ...(b.precise ? { precise: true } : {}) };
    const q = (v: number, n: number) => Math.max(0, Math.min(4 * n - 1, Math.round(v * 4)));
    for (const sp of sourcesPressed(list, shape, [q(at[0], W), q(at[1], H)], W)) if (inArea(sp.tiles)) glow.add(sp.corner);
    glowCorners.current = [...glow];
    if (!glow.size && !glowing.current) return;
    r.highlightObjects(glow.size ? [...glow] : null);
    glowing.current = glow.size > 0;
  }
  function endClearGlow() {
    clearing.current = null;
    glowCorners.current = [];
    if (glowing.current) renderer.current?.highlightObjects(null);
    glowing.current = false;
  }
  /** The objects were drawn again (their highlight went with them): the ring's glow again. */
  function reglow() {
    if (glowAt.current && !painter.current?.painting) clearGlow(glowAt.current, null);
  }

  function onReady(r: MapRenderer) {
    renderer.current = r;
    setReady(r);
    juice.current ??= new Juice(() => renderer.current, sound);
    painter.current = new BrushPainter({
      renderer: r,
      W: infoRef.current.W,
      H: infoRef.current.H,
      heights: () => mirror.current.heights,
      terrain: () => terrain.current,
      settings: () => ({ ...brushRef.current, tool: brushToolRef.current ?? "raise" }),
      commit: (stroke, pre, protect) => {
        terrain.current = { ...terrain.current, pre, protect };
        localUndo.current.push(stroke);
        localRedo.current = [];
        firstDoneRef.current("paint");
        hintJob.current++;
        setStartHint(null);
        // Clear sources (D249): the sources the brush pressed on go with the stroke, one step
        const clear = brushRef.current.clearSources ? sourcesPressed(spots(), stroke.params, stroke.params.dabs, infoRef.current.W).filter((c) => inArea(c.tiles)) : [];
        endClearGlow();
        const op: EditOp = { op: "brush", params: stroke.params };
        const done = sendTerrain(() => (clear.length ? api.strokeClearing(op, stroke.label, clear.flatMap((c) => c.tiles)) : api.apply(op, "user", stroke.label)));
        if (clear.length) void done.then(() => feel("remove", clear[0].x, clear[0].y));
        // a Flatten stroke: where its level ground could take the start, once it is on the map
        if (stroke.params.tool === "flatten") void done.then(() => lookForStartRef.current(stroke.params));
      },
      picked: (level, what) => setBrush(what === "stop" ? { ...brushRef.current, stop: level } : { ...brushRef.current, level }),
      keep: () => keptTiles(),
      footprints: () => objectFootprints(),
      // sources ride a stroke's ground (D249): a 3 × 3 one whole and level (with Clear sources on,
      // every one the stroke changes goes with it instead)
      rides: () => (brushRef.current.clearSources ? [] : spots().filter((c) => c.tiles.length > 1 && inArea(c.tiles)).map((c) => c.rect)),
      // the working area (D254, D259): the open selection
      area: () => workingArea(),
      ring: (at, stroke) => clearGlow(at, stroke),
      select: (hit, ev) => {
        // Ctrl+drag: a rectangle (the Select tool opens with it)
        setSelecting((m) => m ?? "rect");
        void ev;
        void hit;
        return selectTool(selection.current, selectHost(), "rect");
      },
      strength: (value, ev) => {
        setBrush({ ...brushRef.current, strength: value });
        if (ev) flashNote(`strength ${value}`, ev);
      },
      feel: (kind, x, y, size, soft) => {
        feel(kind, x, y, size, soft);
        // the stroke's own texture while it paints (Flatten, Smooth and Naturalize each have theirs)
        const b = brushToolRef.current;
        const sound: StrokeSound = kind === "raise" || kind === "lower" ? kind : b === "smooth" ? "smooth" : b === "naturalize" ? "naturalize" : "flatten";
        juice.current?.strokeSound(sound, x, y, size, Math.min(1, brushRef.current.strength / 10));
      },
      // F held: the size follows the pointer, saved once it is set (D205)
      resize: (size, ev, done) => {
        setBrush({ ...brushRef.current, size }, done);
        if (ev) flashNote(`size ${size}`, ev);
      },
      // a new stroke puts away the last one's start hint (its water flows while it is painted, D197)
      painting: (on) => {
        if (!on) {
          juice.current?.strokeEnd();
          return;
        }
        hintJob.current++;
        setStartHint(null);
      },
      note: (text, ev) => {
        if (!text) return setShapeNote(null);
        if (ev) notePointer(ev);
        setShapeNote({ text, ok: true, warn: false, ...pointerAt.current });
      },
      wet: (x, y) => (mirror.current.water?.depth[y * infoRef.current.W + x] ?? 0) > 0.05,
      depth: (x, y) => mirror.current.water?.depth[y * infoRef.current.W + x] ?? 0,
      // the water flows on the stroke while it is painted (D197)
      draft: (rect, heights) => void api.draftStroke(rect, transfer(heights, [heights.buffer as ArrayBuffer])),
      cancelDraft: () => void api.cancelDraft(),
    });
    r.onSlice = (level) => setSliceLevel(level);
    r.onMarkers = (on) => setMarkersOn(on);
    setMarkersOn(r.markers);
    r.grab = (hit) => grabSource(hit) ?? startCalls.current.grabStart(hit);
    r.onWheel = (ev, hit) => wheelSource(ev, hit);
    // a click with no tool out: a water or badwater source is picked, its strength and its water to
    // change (the water answers live); anything else puts it down
    r.onClick = (hit) => {
      const t = hit ? targetAt(hit.x, hit.y) : null;
      if (t) return pickTile(t.x, t.y);
      setPicked(null);
    };
    const onView = r.onView;
    let pending = false;
    r.onView = (v: ViewState) => {
      onView?.(v);
      // the sources' markers and the start's hint follow the view; with none on the map, the page need
      // not redraw
      if (pending || (!markerRef.current && !hintRef.current && !minimapRef.current)) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        setViewTick((n) => n + 1);
      });
    };
    setViewTick((n) => n + 1);
  }
  // ------------------------------------------------------------------------------ the Select tool

  function selectHost() {
    return {
      W: infoRef.current.W,
      H: infoRef.current.H,
      heights: () => mirror.current.heights,
      mode: () => selectingRef.current ?? "rect",
      changed: () => setSelectionTick((n) => n + 1),
      drawing: (tiles: number[] | null, words: string | null, ev: PointerEvent | null) => {
        setSelectDraw(tiles);
        if (!words) return setShapeNote(null);
        if (ev) notePointer(ev);
        setShapeNote({ text: words, ok: true, warn: false, ...pointerAt.current });
      },
      // Wand on water (D261): the tiles the view draws as water, clean or bad
      wet: (i: number) => {
        const w = mirror.current.water;
        return !!w && w.surface[i] === w.surface[i];
      },
      brushSize: () => brushRef.current.size,
      ring: (at: [number, number] | null, radius: number) => {
        if (brushToolRef.current) return;
        renderer.current?.setBrushCursor(at ? { x: at[0], y: at[1], radius, tool: "flatten", level: null } : null);
      },
      // Ctrl+click on the land: Set level's target (as Flatten's sampling)
      sample: (level: number) => {
        setFlattenTo(level);
        flashNote(`level ${level}`);
      },
    };
  }
  // the Select tool takes the map's left button while it is open and no brush or force is out
  useEffect(() => {
    const r = renderer.current;
    if (!r || !selecting || brushTool || tool) return;
    const t = selectTool(selection.current, selectHost());
    r.tool = t;
    return () => {
      if (r.tool === t) r.tool = null;
      if (!brushToolRef.current) r.setBrushCursor(null);
    };
  }, [selecting, brushTool, tool, ready]);
  /** Open the Select tool (its button, M): the brush or force out goes back, the selection stays. */
  function openSelect() {
    pickTop(null);
    pickShelf(null);
    setSelecting((m) => m ?? "rect");
  }
  function closeSelect() {
    selection.current.clear();
    setSelecting(null);
    setSelectDraw(null);
    setSelectionTick((n) => n + 1);
  }
  /** Ctrl+A (D264): the whole map, in the Select tool or with any brush out. */
  function selectAll() {
    const N = infoRef.current.W * infoRef.current.H;
    selection.current.apply(Array.from({ length: N }, (_, i) => i), "set");
    if (!brushToolRef.current && !toolRef.current) setSelecting((m) => m ?? "rect");
    setSelectionTick((n) => n + 1);
  }
  /** The working area (D254, D259): the open selection as runs, or null. */
  function workingArea(): [number, number, number][] | null {
    return selection.current.count ? tilesToRuns(selection.current.tiles(), infoRef.current.W) : null;
  }
  /** Whether every tile of these lies in the working area (or there is none). */
  const inArea = (tiles: readonly number[]) => !selection.current.count || tiles.every((i) => selection.current.mask[i]);
  /** A water depth Max water depth's check waits for once the water settles (D264). */
  const depthCheck = useRef<{ tiles: number[]; depth: number } | null>(null);
  /** What the Select tool does to the selection: exact, one undo step each; the start is carried
   *  only if its own ground can no longer hold it (D264). */
  function selectAction(what: "raise" | "lower" | "flatten" | "cut" | "fill" | "dig" | "depth", level?: number) {
    const h = mirror.current.heights;
    const W = info.W;
    // under a cut (D207), only the visible land: the ground above the cut stays as it is
    const cut = renderer.current?.slice ?? null;
    let tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    if (!tiles.length) return;
    const count = (n: number) => n.toLocaleString("en-GB");
    let ops: EditOp[];
    let label: string;
    if (what === "raise" || what === "lower") {
      // (raised under a cut: up to it, never past it)
      let top = 0;
      for (const i of tiles) top = Math.max(top, h[i]);
      const amount = what === "raise" && cut !== null ? Math.min(selectAmount, cut - top) : selectAmount;
      if (amount <= 0) return flashNote("Nothing can rise under the cut: show a layer more");
      ops = [{ op: "sculpt", params: { mode: what, cells: tilesToRuns(tiles, W), amount } }];
      label = `${what === "raise" ? "Raise" : "Lower"} ${count(tiles.length)} tiles by ${amount}`;
    } else if (what === "dig") {
      // dig out: down to the selection's lowest ground
      let lo = 99;
      for (const i of tiles) lo = Math.min(lo, h[i]);
      ops = [{ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(tiles, W), level: lo } }];
      label = `Dig out ${count(tiles.length)} tiles to level ${lo}`;
    } else if (what === "depth") {
      // water no deeper than `level` (D264): the ground under deeper water rises so the water sits
      // that deep; shallower water, and the land, as they are; the water settles again after
      const w = mirror.current.water;
      const D = level!;
      if (!w) return;
      const by = depthLevels(tiles, h, w.depth, w.surface, D);
      const raised = [...by.values()].flat();
      if (!raised.length) return flashNote(`No water there is deeper than ${D}`);
      ops = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([to, list]) => ({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(list, W), level: to } }) as EditOp);
      label = `Water no deeper than ${D} on ${count(raised.length)} tiles`;
      depthCheck.current = { tiles: raised, depth: D };
      tiles = raised;
    } else {
      // Set (cut and fill), Cut down (only the ground above the level) or Fill up (only below it)
      const L = level!;
      if (what === "cut") tiles = tiles.filter((i) => h[i] > L);
      if (what === "fill") tiles = tiles.filter((i) => h[i] < L);
      if (!tiles.length) return flashNote(what === "cut" ? `No ground there is above level ${L}` : `No ground there is below level ${L}`);
      ops = [{ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(tiles, W), level: L } }];
      label = what === "cut" ? `Cut ${count(tiles.length)} tiles down to level ${L}` : what === "fill" ? `Fill ${count(tiles.length)} tiles up to level ${L}` : `Set ${count(tiles.length)} tiles to level ${L}`;
    }
    // the land's answer, at the selection's middle
    let sx = 0;
    let sy = 0;
    for (const i of tiles) {
      sx += i % W;
      sy += Math.floor(i / W);
    }
    const n = tiles.length;
    const mid: [number, number] = [Math.round(sx / n), Math.round(sy / n)];
    const size = Math.max(1, Math.sqrt(n) / 2);
    const lowers = what === "lower" || what === "dig" || what === "cut";
    void run(
      () => api.applySelection(ops, label, tiles),
      (u) => u.ok && feel(what === "raise" || what === "fill" ? "raise" : lowers ? "lower" : "shape", mid[0], mid[1], size),
    );
  }
  /** After Max water depth, once the water has settled again: a few words if any of it ended deeper
   *  than asked (a river's surface can rise a little, D264). */
  function checkDepth() {
    const c = depthCheck.current;
    const w = mirror.current.water;
    if (!c || !w) return;
    depthCheck.current = null;
    let deeper = 0;
    for (const i of c.tiles) if (w.depth[i] > c.depth + 0.25) deeper++;
    if (deeper) setMessage({ kind: "info", text: `The water rose a little: ${deeper.toLocaleString("en-GB")} tile${deeper > 1 ? "s are" : " is"} still deeper than ${c.depth}.` });
  }
  const checkDepthRef = useRef(checkDepth);
  checkDepthRef.current = checkDepth;
  /** The selection's middle level (Set level's default). */
  function selectMedian(): number {
    const h = mirror.current.heights;
    const v = selection.current.tiles().map((i) => h[i]).sort((a, b) => a - b);
    return v.length ? v[v.length >> 1] : 0;
  }
  const [flattenTo, setFlattenTo] = useState<number | null>(null);
  /** Set level's way (D264): Set (cut and fill), Cut down, Fill up. */
  const [levelWay, setLevelWay] = useState<"flatten" | "cut" | "fill">("flatten");
  const [maxDepth, setMaxDepth] = useState(2);
  /** The deepest water in the selection (Max water depth's top). */
  function deepestIn(): number {
    const w = mirror.current.water;
    let d = 0;
    if (w) for (const i of selection.current.tiles()) if (w.depth[i] > d) d = w.depth[i];
    return Math.floor(d);
  }
  /** With a brush or a force out, the Select row is a small chip (D259: one row at a time); a click
   *  on it opens the Select tool again. */
  function selectChip(): ComponentChildren {
    const z = selection.current.size();
    if (!z || (!brushTool && !tool)) return null;
    void selectionTick;
    return (
      <button type="button" class="select-chip" title="Open the Select tool (the brush or force goes back)" onClick={openSelect}>
        Working inside {z.w} × {z.h} · Esc to clear
      </button>
    );
  }
  function selectRow() {
    if (!selecting && !selection.current.count) return null;
    // (with a brush or a force out, only the chip)
    if (brushTool || tool) return null;
    void selectionTick;
    const z = selection.current.size();
    const level = flattenTo ?? selectMedian();
    const deepest = z ? deepestIn() : 0;
    const depth = Math.max(1, Math.min(maxDepth, Math.max(1, deepest)));
    return (
      <div class="bar-group">
        <span class="bar-status" role="status">
          {z ? sizeWords(z) : "Select: drag on the map (Shift adds, Alt takes away; Ctrl+A: the whole map)"}
        </span>
        <label>
          Select
          <select aria-label="How to select" value={selecting ?? "rect"} onChange={(e) => setSelecting((e.target as HTMLSelectElement).value as SelectMode)}>
            {SELECT_MODES.map(([v, name]) => (
              <option key={v} value={v}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {z ? (
          <>
            <label>
              by
              <select aria-label="Levels" value={String(selectAmount)} onChange={(e) => setSelectAmount(Number((e.target as HTMLSelectElement).value))}>
                {[1, 2, 3, 4, 5, 6, 8].map((k) => (
                  <option key={k} value={String(k)}>
                    {k} level{k > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => selectAction("raise")}>
              Raise
            </button>
            <button type="button" onClick={() => selectAction("lower")}>
              Lower
            </button>
            <label title="Ctrl+click the land to take its level">
              to level
              <select aria-label="Level" value={String(level)} onChange={(e) => setFlattenTo(Number((e.target as HTMLSelectElement).value))}>
                {Array.from({ length: BRUSH_MAX_LEVEL + 1 }, (_, k) => k).map((k) => (
                  <option key={k} value={String(k)}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <span class="segmented" role="group" aria-label="Set level's way">
              {(
                [
                  ["flatten", "Set", "Cut the ground above the level and fill the ground below it"],
                  ["cut", "Cut down", "Only lower the ground above the level; the ground below stays"],
                  ["fill", "Fill up", "Only raise the ground below the level; the ground above stays"],
                ] as const
              ).map(([v, word, title]) => (
                <button type="button" key={v} aria-pressed={levelWay === v} title={title} onClick={() => setLevelWay(v)}>
                  {word}
                </button>
              ))}
            </span>
            <button type="button" onClick={() => selectAction(levelWay, level)}>
              Set level
            </button>
            <button type="button" title="Down to the selection's lowest ground" onClick={() => selectAction("dig")}>
              Dig out
            </button>
            <button type="button" title="Everything standing there, objects and sources; the start stays (Delete)" onClick={deleteSelection}>
              Delete
            </button>
            {deepest >= 1 ? (
              <>
                <label title="Where the water is deeper, the ground under it rises so the water sits this deep">
                  water
                  <input type="number" aria-label="Max water depth" min={1} max={deepest} step={1} value={depth} onInput={(e) => setMaxDepth(Math.max(1, Math.min(deepest, Math.round(Number((e.target as HTMLInputElement).value) || 1))))} />
                </label>
                <button type="button" onClick={() => selectAction("depth", depth)}>
                  Max water depth
                </button>
              </>
            ) : null}
          </>
        ) : null}
        <button type="button" class="linkish" aria-label="Close the selection" title="Close (Esc)" onClick={closeSelect}>
          ×
        </button>
      </div>
    );
  }

  /** The tiles of each object on more than one tile (a Flatten stroke keeps them level, D204). */
  function objectFootprints(): number[][] {
    const e = mirror.current.entities;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const out: number[][] = [];
    for (let k = 0; k < e.count; k++) {
      const template = e.templates[e.template[k]];
      // (a source rides a stroke whole instead: `rides`, D249)
      if (isSource(template)) continue;
      const tl = footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 });
      if (tl.length < 2) continue;
      const g = tl.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H).map(([x, y]) => y * W + x);
      if (g.length > 1) out.push(g);
    }
    return out;
  }
  /** The tiles a precise hold never digs out from under (D193): the start and the objects standing
   *  there, not the plants (they ride the ground) nor the sources (they ride it too, D249). */
  function keptTiles(): [number, number, number][] {
    const e = mirror.current.entities;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const tiles: number[] = [];
    for (let k = 0; k < e.count; k++) {
      const template = e.templates[e.template[k]];
      if (/^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Coffee|BlueberryBush|Dandelion|Cattail|Spadderdock|Succulent)/.test(template) || isSource(template)) continue;
      const tl = footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: false });
      for (const [x, y] of tl) if (x >= 0 && y >= 0 && x < W && y < H) tiles.push(y * W + x);
    }
    return tilesToRuns([...new Set(tiles)].sort((a, b) => a - b), W);
  }

  // a brush out takes the map's left button; put away, the brush under the cursor goes
  useEffect(() => {
    const r = renderer.current;
    const p = painter.current;
    if (!r || !p) return;
    if (brushTool) {
      r.tool = p.tool;
      p.showCursor();
    } else {
      if (r.tool === p.tool) r.tool = null;
      p.hideCursor();
    }
  }, [brushTool, ready]);
  // a new size, strength or level shows on the brush under the cursor at once
  useEffect(() => painter.current?.showCursor(), [brush]);
  // level lines while the toggle is on (the brush kit)
  useEffect(() => renderer.current?.setLevelLines(brush.levelLines), [brush.levelLines, ready]);
  // clear water (D212): T or Clear water makes all of it see-through; otherwise only the water under
  // and right round the brush (or the shelf's ghost) clears, while it is over water (the view
  // decides, renderer.ts clearNear), and on dry land the water stays as it is
  useEffect(() => renderer.current?.setClearWater(clearWater), [clearWater, ready]);

  const toolRef = useRef(tool);
  toolRef.current = tool;

  /** Fly the camera to a tile (a problem's "Show"). */
  function showTile(x: number, y: number) {
    const r = renderer.current;
    if (!r) return;
    r.setView({ target: [x + 0.5, r.heightAt(x, y), -(y + 0.5)], distance: Math.min(r.getView().distance, 60) });
  }

  const entityAt = (id: string): [number, number] | null => {
    // the page's view has no entity ids: a problem's entities are found by the worker's "where"
    void id;
    return null;
  };
  const actions: ItemActions = {
    onFix: (fix) => void applyFix(fix),
    onShow: (c) => {
      const at = whereOf(c, entityAt);
      if (at) showTile(at[0], at[1]);
    },
    canShow: (c) => !!whereOf(c, entityAt),
  };

  // ------------------------------------------------------------------------------ the start

  /** The start's footprint check at a move of (dx, dy) tiles. */
  function startPreview(dx: number, dy: number): { x: number; y: number; check: StartCheck } | null {
    const s = startHere;
    if (!s) return null;
    const x = s.x + dx;
    const y = s.y + dy;
    const [cx, cy] = cornerFor(x, y, s.orientation);
    const door = startEntranceTile(cx, cy, s.orientation);
    const f = s.feature ? info.features.find((g) => g.id === s.feature) : undefined;
    let bench: { level: number; radius: number; bank?: Point } | null = null;
    const moved = dx !== 0 || dy !== 0;
    if (f && f.kind === "start") {
      // a generated start's bench takes the ground's level there; where it stands, it keeps the
      // bench it has (a project saved before the water rule changed may run it to a bank)
      const level = moved ? Math.max(1, mirror.current.heights[y * info.W + x]) : f.params.benchLevel;
      const bank = moved ? undefined : f.params.bank;
      bench = { level, radius: f.params.benchRadius, ...(bank ? { bank } : {}) };
    }
    return { x, y, check: checkStartAt(ctx(), x, y, door, bench, s.owner, needs, moved) };
  }

  /** The start's reach (D184): its three requirements where it stands, shown while the pointer is on
   *  it (no tool out), then fading; the walks run in the start's own worker, once per version. */
  const [startReach, setStartReach] = useState<{ check: StartCheck; fading: boolean } | null>(null);
  const reachCache = useRef<{ version: number; check: Promise<StartCheck> } | null>(null);
  const reachFade = useRef(0);
  /** The pointer is on the start (its reach shows when the walks come back). */
  const reachWanted = useRef(false);
  function hoverStart(on: boolean) {
    reachWanted.current = on;
    if (!on) {
      if (!startReach || startReach.fading) return;
      setStartReach((r) => (r ? { ...r, fading: true } : r));
      reachFade.current = window.setTimeout(() => setStartReach(null), 700);
      return;
    }
    clearTimeout(reachFade.current);
    const s = startHere;
    const m = mirror.current;
    if (!s || !m.water) return;
    if (!reachCache.current || reachCache.current.version !== info.version) {
      const [cx, cy] = cornerFor(s.x, s.y, s.orientation);
      const door = startEntranceTile(cx, cy, s.orientation);
      const f = s.feature ? info.features.find((g) => g.id === s.feature) : undefined;
      const bench = f && f.kind === "start" ? { level: f.params.benchLevel, radius: f.params.benchRadius, ...(f.params.bank ? { bank: f.params.bank } : {}) } : null;
      reachCache.current = { version: info.version, check: startWorkerApi().check({ W: info.W, H: info.H, heights: m.heights, water: m.water, entities: m.entities, river: indexed?.river ?? null, x: s.x, y: s.y, door, bench, self: s.owner, needs, moved: false }) };
    }
    const v = info.version;
    void reachCache.current.check.then((check) => {
      if (infoRef.current.version === v && reachWanted.current) setStartReach({ check, fading: false });
    });
  }

  /** The start dragged on the map (no tool out): its footprint and the start's requirements follow
   *  the pointer, the drop moves it (one step); Esc puts it back. */
  const startGrab = useRef<{ cancel(): void } | null>(null);
  function grabStart(hit: TileHit | null): PointerTool | null {
    const s = startHere;
    // (a force picked takes the map's clicks, the start's ground too: D257)
    if (!hit || !s || brushToolRef.current || shelfRef.current || toolRef.current) return null;
    if (Math.max(Math.abs(hit.x - s.x), Math.abs(hit.y - s.y)) > 1) return null;
    const from: [number, number] = [hit.x, hit.y];
    let d: [number, number] = [0, 0];
    let done = false;
    const W = info.W;
    const H = info.H;
    const canvas = renderer.current?.canvas;
    if (canvas) canvas.style.cursor = "grabbing";
    // (the reach while it stood: the drag shows the reach where it goes)
    clearTimeout(reachFade.current);
    reachWanted.current = false;
    setStartReach(null);
    const end = () => {
      done = true;
      startGrab.current = null;
      setStartDrag(null);
      renderer.current?.setGhost(null);
      if (canvas) canvas.style.cursor = "";
    };
    startGrab.current = { cancel: end };
    return {
      down: () => true,
      move(h) {
        if (!h || done) return;
        const dx = Math.max(2 - s.x, Math.min(W - 3 - s.x, h.x - from[0]));
        const dy = Math.max(2 - s.y, Math.min(H - 3 - s.y, h.y - from[1]));
        if (dx === d[0] && dy === d[1]) return;
        d = [dx, dy];
        const p = startPreview(dx, dy);
        setStartDrag(p);
        if (p) {
          const [cx, cy] = cornerFor(p.x, p.y, s.orientation);
          renderer.current?.setGhost({ template: "StartingLocation", x: cx, y: cy, z: mirror.current.heights[p.y * W + p.x], orientation: ORIENTATION_NAMES.indexOf(s.orientation), ok: !p.check.problem });
        }
      },
      up() {
        if (done) return;
        end();
        if (!d[0] && !d[1]) return;
        const [x, y] = [s.x + d[0], s.y + d[1]];
        void run(
          () => api.moveStartTo(x, y),
          (u) => {
            if (!u.ok) return;
            const [cx, cy] = cornerFor(x, y, s.orientation);
            feel("place", cx, cy);
          },
        );
      },
      cancel: end,
    };
  }
  const startCalls = useRef({ grabStart });
  startCalls.current = { grabStart };

  // ------------------------------------------------------------------------------ keyboard

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      // typing in a field or choosing from a list keeps its keys; a toggle just clicked does not
      const toggle = target?.tagName === "INPUT" && ["checkbox", "radio", "button"].includes((target as HTMLInputElement).type);
      if (target && !toggle && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      const mod = ev.ctrlKey || ev.metaKey;
      // a force at work (D199, D202, D203, D206): Esc or Ctrl+Z takes it back, Space holds a carve,
      // X flips a painted Lift's side as it goes; the other tools wait
      const c = forcer.current;
      if (c?.running) {
        if (ev.key === "Escape" || (mod && ev.key.toLowerCase() === "z")) {
          ev.preventDefault();
          c.cancel();
          return;
        }
        if (ev.key === " ") {
          ev.preventDefault();
          c.pause(!c.status!.paused);
          return;
        }
        if (!mod && ev.key.toLowerCase() === "x" && toolRef.current === "quake") {
          flipRef.current?.();
          return;
        }
        if (mod || /^[0-9]$/.test(ev.key) || ["m", "x", "r", "f", "delete", "backspace"].includes(ev.key.toLowerCase())) return;
      }
      // a fault or a fissure still being drawn: Esc lets it go
      if (ev.key === "Escape" && forceEscRef.current?.()) return;
      // camera bookmarks (D205): Ctrl+Shift+1–9 keeps the view in that slot, Shift+1–9 glides back
      // to it (the number keys alone pick the brushes)
      const digit = /^Digit([1-9])$/.exec(ev.code);
      if (digit && ev.shiftKey && !ev.altKey) {
        ev.preventDefault();
        const slot = Number(digit[1]);
        const r = renderer.current;
        if (!r) return;
        if (mod) {
          const v = r.getView();
          const views = [...infoRef.current.views.filter((b) => b.slot !== slot), { slot, ...v }].sort((a, b) => a.slot - b.slot);
          void api.setViews(views).then((i) => {
            infoRef.current = { ...infoRef.current, views: i.views };
            setInfo((cur) => ({ ...cur, views: i.views }));
            props.onChange({ ...infoRef.current, views: i.views });
          });
          flashNote(`View ${slot} saved: Shift+${slot} comes back to it`);
        } else {
          const b = infoRef.current.views.find((v) => v.slot === slot);
          if (b) r.glideTo(b);
          else flashNote(`No view in ${slot} yet: Ctrl+Shift+${slot} keeps this one`);
        }
        return;
      }
      // the brushes: 1–5 pick one (again: it stays out), [ and ] size it, Esc cancels a stroke,
      // then puts it away
      if (!mod && !ev.altKey && /^[1-5]$/.test(ev.key)) {
        const b = BRUSHES[Number(ev.key) - 1].tool;
        if (painter.current && brushToolRef.current !== b) pickBrush(b);
        return;
      }
      // 6: the shelf's Water source (D212); 7: Carve; M: the Select tool
      if (!mod && !ev.altKey && ev.key === "6" && painter.current) {
        pickShelf(shelfRef.current?.id === "water-source" ? null : SHELF.find((it) => it.id === "water-source")!);
        return;
      }
      // 7, 8, 9, 0: Carve, Craterize, Quake, Erupt (again: put it away)
      const forceKey = FORCES.find((f) => f.key === ev.key);
      if (!mod && !ev.altKey && forceKey && painter.current && forceShown(forceKey.id)) {
        pickTop(toolRef.current === forceKey.id ? null : forceKey.id);
        return;
      }
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "m") {
        if (selectingRef.current && !brushToolRef.current && !toolRef.current) closeSelect();
        else openSelect();
        return;
      }
      // Ctrl+A (D264): the whole map, in the Select tool or with any brush out
      if (mod && !ev.altKey && ev.key.toLowerCase() === "a" && (selectingRef.current || brushToolRef.current)) {
        ev.preventDefault();
        selectAll();
        return;
      }
      // { and }: the strength (as Shift+scroll)
      if (!mod && (ev.key === "{" || ev.key === "}") && brushToolRef.current) {
        ev.preventDefault();
        const strength = Math.max(1, Math.min(10, brushRef.current.strength + (ev.key === "}" ? 1 : -1)));
        setBrush({ ...brushRef.current, strength });
        flashNote(`strength ${strength}`);
        return;
      }
      if (!mod && (ev.key === "[" || ev.key === "]") && brushToolRef.current) {
        ev.preventDefault();
        const size = nextSize(brushRef.current.size, ev.key === "]" ? 1 : -1);
        setBrush({ ...brushRef.current, size });
        flashNote(`size ${size}`);
        return;
      }
      // F: hold and move the mouse to size the brush, a click sets it (D205; F does nothing else)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "f") {
        ev.preventDefault();
        if (!ev.repeat && brushToolRef.current) painter.current?.startResize();
        return;
      }
      if (ev.key === "Escape" && painter.current?.sizing) {
        painter.current.endResize(false);
        return;
      }
      if (ev.key === "Escape" && painter.current?.painting) {
        painter.current.cancel();
        return;
      }
      if (ev.key === "Escape" && sourceGrab.current) {
        sourceGrab.current.cancel();
        return;
      }
      if (ev.key === "Escape" && startGrab.current) {
        startGrab.current.cancel();
        return;
      }
      // R turns the shelf's object (D184)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "r" && shelfRef.current) {
        if (shelfRef.current.turns) {
          const next = (turnRef.current + 1) % 4;
          turnRef.current = next;
          setTurn(next);
          const at = shelfTile.current;
          if (at) shelfHover(at[0], at[1]);
        }
        return;
      }
      // (with Quake picked, X flips the side of the fault that moves)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "x" && toolRef.current === "quake") {
        if (flipRef.current) flipRef.current();
        else setQuakeUi({ ...quakeUiRef.current, side: quakeUiRef.current.side === 1 ? -1 : 1 });
        return;
      }
      if (ev.key === "Escape" && shelfRef.current) {
        pickShelf(null);
        return;
      }
      if (ev.key === "Escape" && (selectingRef.current || selection.current.count)) {
        closeSelect();
        return;
      }
      if (ev.key === "Escape" && brushToolRef.current) {
        pickBrush(null);
        return;
      }
      if (mod && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        void (ev.shiftKey ? redo() : undo());
      } else if (mod && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        void redo();
      } else if (ev.key === "Escape") {
        setTool(null);
        setPicked(null);
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && selection.current.count && !painter.current?.painting) {
        // Select and Delete (D288): everything inside the selection, the start aside, one step
        ev.preventDefault();
        deleteCalls.current.deleteSelection();
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && pickedSources().length) {
        // a picked source: its water recedes live (D196)
        ev.preventDefault();
        removeSources(pickedSources());
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && targetSpot.current && renderer.current?.hoverHit && !painter.current?.painting) {
        // the source the pointer targets, whatever tool is picked (D249): one step, its water
        // receding live
        ev.preventDefault();
        const t = targetSpot.current;
        void sourceInfo(t.x, t.y).then((e) => e && removeSources([e]));
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && renderer.current?.hoverHit && !painter.current?.painting) {
        // the object the pointer is on (D288): it goes, one step; the start stays
        const hit = renderer.current.hoverHit;
        if (deleteCalls.current.deleteOn([hit.y * infoRef.current.W + hit.x], true)) ev.preventDefault();
      } else if (!mod && !ev.altKey && ev.key.toLowerCase() === "u" && pickedSources().length && !forcer.current?.running) {
        // U: a picked source carves its own course (D239)
        ev.preventDefault();
        unleash(pickedSources()[0]);
      } else if (!mod && !ev.altKey && ev.key.toLowerCase() === "t") {
        // T: clear water, as the game (D196)
        setClearWater((on) => !on);
      }
    };
    // F let go: the size is set
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() === "f") painter.current?.endResize(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  // ------------------------------------------------------------------------------ test hook

  useEffect(() => {
    window.dgmEditor = {
      info: () => infoRef.current,
      tileToClient: (x, y) => renderer.current!.tileToClient(x, y),
      idle: () => queue.current.then(() => undefined),
      instant: () => instantRef.current,
      fit: () => fitRef.current,
      startCheck: () => startDragRef.current?.check ?? null,
      worker: api,
      strokeMismatches: () => strokeMismatches.current,
      lastStroke: () => localUndo.current.at(-1)?.params ?? null,
      pendingTerrain: () => pendingTerrain.current,
      carve: () => (forcer.current?.status?.verb === "carve" ? { ...forcer.current.status } : null),
      force: () => (forcer.current?.status ? { ...forcer.current.status } : null),
      startHint: () => (startHintRef.current ? { x: startHintRef.current.x, y: startHintRef.current.y, strong: startHintRef.current.strong, ms: hintMs.current } : null),
      sound: () => juice.current?.status() ?? null,
      sourceGlow: () => glowCorners.current.slice(),
      selection: () => selection.current.tiles(),
      gesture: () => {
        const g = gestureRef.current;
        return { stroke: g.forceStroke ? g.forceStroke.length : null, cursor: g.forceCursor, arrow: g.aimArrow, side: quakeUiRef.current.side };
      },
    };
    return () => {
      delete window.dgmEditor;
    };
  }, []);
  const instantRef = useRef(instant);
  instantRef.current = instant;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const startDragRef = useRef(startDrag);
  startDragRef.current = startDrag;

  // ------------------------------------------------------------------------------ export

  async function exportProject() {
    const p = await api.project();
    saveFile(p.bytes, p.fileName, "application/gzip");
  }

  /** Save the map for Timberborn (D184): the canonical settle and every check, with progress on the
   *  button; problems that would stop the map loading open the quiet dot's list instead; warnings
   *  go into the map's description (never a confirmation). Into the game's Maps folder where the
   *  browser can, else a download. */
  async function saveMap(kind: "timberborn" | "download") {
    if (saving) return;
    setSaving({ kind, progress: null });
    setMessage(null);
    try {
      const onProgress = proxy((q: CheckProgress) => setSaving((s) => (s ? { ...s, progress: q } : s)));
      const r = await enqueue(() => api.exportTimber(true, onProgress));
      if (!r.ok) {
        setDotOpen(true);
        setMessage({ kind: "error", text: `Not saved: ${plain(r.errors[0] ?? "the map has problems to fix first")}` });
        return;
      }
      if (kind === "download") {
        saveFile(r.bytes, r.fileName);
        setMessage({ kind: "info", text: `Saved ${r.fileName}. Move the file to Documents\\Timberborn\\Maps, then start a new game and pick the map.` });
        return;
      }
      const v = await saveToTimberborn(r.bytes, r.fileName);
      setMessage({ kind: "info", text: v.via === "fsa" ? `Saved ${v.savedAs ?? r.fileName} to ${v.folder}. It'll show up in Timberborn's custom maps.` : `Saved ${r.fileName}. Move the file to Documents\\Timberborn\\Maps, then start a new game and pick the map.` });
    } catch (e) {
      setMessage({ kind: "error", text: String(e instanceof Error ? e.message : e) });
    } finally {
      setSaving(null);
    }
  }

  const notices = [...info.notices, ...(info.importReport?.changes.filter((c) => c.level === "warning").map((c) => c.message) ?? [])];
  const flags = info.importReport?.flags ?? [];
  const importChanges = info.importReport?.changes.length ?? 0;

  return (
    <div class="editor" aria-busy={busy > 0}>
      <Header
        info={info}
        saveState={props.saveState}
        canUndo={info.canUndo || !!localUndo.current.length}
        canRedo={info.canRedo || !!localRedo.current.length}
        onUndo={() => void undo()}
        onRedo={() => void redo()}
        dot={<ChecksDot check={check} instant={instant} busy={busy > 0} progress={progress} flowing={flowing} open={dotOpen} onToggle={setDotOpen} actions={actions} />}
        canFolder={canSaveToTimberborn()}
        saving={saving}
        onSave={(kind) => void saveMap(kind)}
        onOpenFile={props.onOpenFile}
        onSaveProject={() => void exportProject()}
        historyOpen={showHistory}
        onHistory={() => setShowHistory(!showHistory)}
        onBack={() => props.onBack(info)}
      />
      <div class="editor-main">
        <Shelf picked={shelf?.id ?? null} onPick={pickShelf} icon={(t) => icons[t] ?? null} loading={!ready || !!forcer.current?.running} />
        <section class="editor-map" aria-label="Map">
          <View3D
            view={view}
            class="editor-view"
            label={`3D view of ${info.name}. Drag to turn, right-drag to move, wheel to zoom.`}
            onReady={onReady}
            markersWanted={shelf?.id === "Slope"}
            togglesInButtons
            besideHeight={
              // a view switch (D248): what shows, never how a brush works; whatever tool is picked
              <button type="button" aria-pressed={brush.levelLines} onClick={() => setBrush({ ...brushRef.current, levelLines: !brushRef.current.levelLines })} title="A thin line wherever the ground steps down a level">
                Level lines
              </button>
            }
            showLegend={layer !== "none"}
            viewButtons={
              <>
                <button type="button" aria-pressed={clearWater} onClick={() => setClearWater(!clearWater)} title="See through all the water to the bed and the sources (T). A brush over water clears the water round it on its own.">
                  Clear water
                </button>
                {(["badwater", ...(waterLayers?.roofed.length ? (["roofed"] as const) : [])] as LayerKind[]).map((k) => (
                  <button type="button" key={k} aria-pressed={layer === k} onClick={() => setLayer(layer === k ? "none" : k)} title={`Show ${LAYER_NAMES[k].toLowerCase()} on the map`}>
                    {OVERLAY_WORDS[k]}
                  </button>
                ))}
                <LayerWidget level={sliceLevel} onStep={(dir) => renderer.current?.stepSlice(dir)} onReset={() => renderer.current?.setSlice(null)} />
                <button type="button" aria-pressed={minimap} onClick={() => setMinimap(!minimap)} title="A small picture of the whole map in the corner: click it to go there">
                  Minimap
                </button>
                <span class="reveal-group">
                  <button type="button" aria-pressed={sound.on} onClick={() => setSound({ ...sound, on: !sound.on })} title="The editor's little sounds: on or off (the volume beside it)">
                    Sound
                  </button>
                  <label class="slider-field reveal" title="Volume">
                    <input type="range" min="0" max="1" step="0.02" aria-label="Sound volume" value={sound.volume} disabled={!sound.on} onInput={(e) => setSound({ ...sound, volume: Number((e.target as HTMLInputElement).value) })} />
                  </label>
                </span>
              </>
            }

            onHover={(hit: TileHit | null) => {
              setHover(hit ? describeTile(ctx(), hit.x, hit.y) : null);
              hoverSources(hit);
              // the source the pointer targets, whatever tool is picked (D249)
              const t = hit ? targetAt(hit.x, hit.y) : null;
              targetSpot.current = t;
              setTargeted(t ? t.k : null);
              // a source, and the start, can be picked up and moved
              const canvas = renderer.current?.canvas;
              const free = hit && !brushToolRef.current && !shelfRef.current && !toolRef.current && !selectingRef.current;
              const onStart = !!hit && !!startHere && Math.max(Math.abs(hit.x - startHere.x), Math.abs(hit.y - startHere.y)) <= 1;
              if (canvas) canvas.style.cursor = free && (t || onStart) ? "grab" : "";
              hoverStart(!!free && onStart);
            }}
            hoverText={hover}
          >
            <TopBar
              active={brushTool}
              force={tool}
              forceAtWork={!!forcer.current?.running}
              forceRow={forceRow()}
              row={unleashRow() ?? shelfRow() ?? pickedRow()}
              hints={
                <FirstRun
                  done={firstRun}
                  onClose={() => {
                    const all = new Set<FirstStep>(["paint", "place", "water"]);
                    saveFirstRun(all);
                    setFirstRun(all);
                  }}
                />
              }
              settings={brush}
              onPick={pickTop}
              onSettings={setBrush}
              loading={!ready}
              selectRow={selectRow()}
              selectChip={selectChip()}
              selecting={!!selecting && !brushTool && !tool}
              onSelect={() => (selectingRef.current && !brushToolRef.current && !toolRef.current ? closeSelect() : openSelect())}
            />
            {player.current ? <WaterBar player={player.current} weather={weather} onWeather={toggleWeather} /> : null}
            {sourceMarkers()}
            {startHintTag()}
            {minimap ? (
              <Minimap
                W={info.W}
                H={info.H}
                renderer={renderer.current}
                heights={() => mirror.current.heights}
                depth={() => mirror.current.water?.depth ?? null}
                stamp={`${info.version}:${waterTick}`}
                viewTick={viewTick}
              />
            ) : null}
            {aimArrow ? <AimArrow from={aimArrow.from} to={aimArrow.to} renderer={renderer.current} /> : null}
            {shapeNote ? (
              <div class={`map-note shape-note${shapeNote.ok ? (shapeNote.warn ? " warn" : "") : " error"}`} role="status" style={{ left: `${shapeNote.x + 16}px`, top: `${shapeNote.y + 16}px` }}>
                {shapeNote.text}
              </div>
            ) : null}
            {startDrag ? (
              <StartIndicators check={startDrag.check} rules={needs.rules} />
            ) : startReach ? (
              <div class={`start-reach${startReach.fading ? " fading" : ""}`}>
                <StartIndicators check={startReach.check} rules={needs.rules} />
              </div>
            ) : null}
            {busy > 0 ? (
              <div class="working" role="status">
                Working…
              </div>
            ) : null}
          </View3D>
          {layer !== "none" && waterLayers ? <LayerLegend kind={layer} layers={waterLayers} /> : null}
          {message ? (
            <div class={`editor-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
              {message.text}
              <button type="button" class="linkish" onClick={() => setMessage(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          ) : null}
          {noticesOpen && (notices.length || flags.length || importChanges) ? (
            <div class="editor-notices" role="status">
              {info.importReport && importChanges ? (
                <p>
                  Opened {info.name}. {importChanges} change{importChanges > 1 ? "s were" : " was"} needed to bring it to the current game version
                  {info.importReport.changes.some((c) => c.level === "warning") ? ":" : "."}
                </p>
              ) : null}
              <ul>
                {notices.map((n) => (
                  <li key={n}>{n}</li>
                ))}
                {flags.map((f) => (
                  <li key={f.id}>
                    {f.message}{" "}
                    <button type="button" class="linkish" onClick={() => void run(() => api.applyAll([f.fix], f.fix.label, "fix"))}>
                      {f.fix.label}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" class="linkish" onClick={() => setNoticesOpen(false)}>
                Hide
              </button>
            </div>
          ) : null}
        </section>
        {showHistory ? <HistoryPanel info={info} onJump={(k) => void run(() => api.jump(k))} onClose={() => setShowHistory(false)} /> : null}
      </div>
      <DropTarget onFile={props.onOpenFile} />
    </div>
  );
}

/** The overlays' words on their view buttons. */
const OVERLAY_WORDS: Record<LayerKind, string> = { none: "None", badwater: "Badwater", roofed: "Under roofs" };

const BRUSH_KEY = "dgm.brush";

/** The brush the viewer last used: its size, strength and water option (not its level). */
function loadBrush(): BrushSettings {
  try {
    const s = JSON.parse(localStorage.getItem(BRUSH_KEY) ?? "null") as Partial<BrushSettings> | null;
    if (!s) return DEFAULT_BRUSH;
    return {
      ...DEFAULT_BRUSH,
      size: typeof s.size === "number" ? Math.min(24, Math.max(1, s.size)) : DEFAULT_BRUSH.size,
      strength: typeof s.strength === "number" ? Math.min(10, Math.max(1, Math.round(s.strength))) : DEFAULT_BRUSH.strength,
      clearSources: s.clearSources === true,
    };
  } catch {
    return DEFAULT_BRUSH;
  }
}

function saveBrush(s: BrushSettings): void {
  try {
    localStorage.setItem(BRUSH_KEY, JSON.stringify({ size: s.size, strength: s.strength, ...(s.clearSources ? { clearSources: true } : {}) }));
  } catch {
    // the brush lasts for this visit only
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The overlay of a water layer: moisture in three greens, badwater brown and the soil it spoils
 *  lighter, the drought's kept water blue and the water that dries up orange, the tiles under
 *  roofs violet. */
function layerOverlay(l: WaterLayers, kind: LayerKind): OverlayLayer[] {
  const pick = (codes: Uint8Array, code: number) => {
    const out: number[] = [];
    for (let i = 0; i < codes.length; i++) if (codes[i] === code) out.push(i);
    return out;
  };
  switch (kind) {
    case "badwater":
      return [
        { tiles: pick(l.badwater, 2), color: [190, 140, 70, 120] },
        { tiles: pick(l.badwater, 1), color: [120, 70, 30, 200] },
      ];
    case "roofed":
      return [{ tiles: Array.from(l.roofed), color: [170, 90, 220, 150] }];
    default:
      return [];
  }
}

/** The middle tile of a StartingLocation at Coordinates (x, y) facing o. */
function cornerToCentre(x: number, y: number, o: Orientation): [number, number] {
  switch (o) {
    case "Cw0":
      return [x + 1, y + 1];
    case "Cw90":
      return [x + 1, y - 1];
    case "Cw180":
      return [x - 1, y - 1];
    case "Cw270":
      return [x - 1, y + 1];
  }
}

function mirrorOf(v: MapView): Mirror {
  return { heights: v.heights, water: surfaceWater(v.W, v.H, v.water), waterView: v.water, mapWater: v.water, entities: v.entities, entitiesAt: null, soil: v.soil };
}

/** Dropping a .timber or project file on the editor opens it. */
function DropTarget({ onFile }: { onFile(file: File): void }) {
  const latest = useRef(onFile);
  latest.current = onFile;
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      latest.current(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return null;
}

/** Aim's arrow (D258): a thin straight arrow from where the drag began (a tile on the land) to the
 *  pointer, showing only its direction and distance; it goes as the force starts. */
function AimArrow(p: { from: [number, number]; to: { x: number; y: number }; renderer: MapRenderer | null }) {
  const r = p.renderer;
  if (!r) return null;
  const a = r.tileToClient(p.from[0], p.from[1]);
  const box = r.canvas.getBoundingClientRect();
  const x0 = a.x - box.left;
  const y0 = a.y - box.top;
  const x1 = p.to.x - box.left;
  const y1 = p.to.y - box.top;
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 4) return null;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const head = Math.min(14, len / 2);
  const bx = x1 - ux * head;
  const by = y1 - uy * head;
  const wing = head * 0.45;
  const tip = `${x1},${y1} ${bx - uy * wing},${by + ux * wing} ${bx + uy * wing},${by - ux * wing}`;
  return (
    <svg class="aim-arrow" aria-hidden="true" width={box.width} height={box.height}>
      <line x1={x0} y1={y0} x2={bx} y2={by} class="aim-arrow-edge" />
      <polygon points={tip} class="aim-arrow-edge" />
      <line x1={x0} y1={y0} x2={bx} y2={by} class="aim-arrow-line" />
      <polygon points={tip} class="aim-arrow-head" />
    </svg>
  );
}
