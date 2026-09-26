// The editor (EDITOR_PLAN §3, PLAN §20 D184): the map fills the screen in the shared 3D view; the
// top bar shapes the land and the water (the brushes, Source, the forces, Remove), the left shelf places the
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
import { damLegendSwatch } from "../render3d/palette";
import type { MapRenderer, PointerTool, TileHit, ViewState } from "../render3d";
import { View3D } from "../ui/View3D";
import type { GeneratorApi } from "../worker/generator.worker";
import type { CheckItem, CheckProgress, DamSiteView, EditorEvent, EntityInfo, ExportCheck, ForceFrame, SessionInfo, SessionOpen, SessionUpdate, ToolRequest, ViewUpdate, WaterLayers } from "../worker/session";
import { checkStartAt, startProblemAt, describeTile, entitiesByTile, FeatureIndex, feedingGroups, newId, sourceGroups, type StartCheck, type TileContext } from "./features";
import { HistoryPanel, LayerLegend, LAYER_NAMES, plain, SourceOptions, StartIndicators, whereOf, type ItemActions, type LayerKind } from "./panels";
import { ChecksDot, Header } from "./Header";
import { removeKindOf, type RemoveKind } from "../core/features/objects";
import { Shelf } from "./Shelf";
import { DEFAULT_SHELF_OPTIONS, paintTiles, quietWord, SHELF, templateOf, type ShelfItem, type ShelfOptions } from "./shelfItems";
import { removeTool, shelfTool } from "./placeTools";
import { carveTouch, Juice, loadSound, type SoundSettings } from "./juice";
import { CarveDriver, type CarveStatus } from "./carveDriver";
import { CarveRow, carveSettingsOf, DEFAULT_CARVE, type CarveUi } from "./CarveRow";
import type { StartCheckApi } from "./startCheck.worker";
import { startSpots } from "./startHint";
import { FirstRun, loadFirstRun, saveFirstRun, type FirstStep } from "./FirstRun";
import { LayerWidget } from "./LayerWidget";
import { Minimap } from "./Minimap";
import { FORCES, forceShown, REMOVE_KINDS, TopBar, type TopTool } from "./TopBar";
import { SELECT_MODES, Selection, selectTool, sizeWords, type SelectMode } from "./select";
import { WaterBar } from "./WaterBar";
import { WaterPlayer } from "./waterPlayer";
import type { Hazard } from "../core/sim/weather";
import { OFFICIAL_FLOW } from "../core/gen/calibrated";
import { BRUSHES, BrushPainter, DEFAULT_BRUSH, nextSize, paste, type BrushSettings, type BrushTool, type Stroke } from "./brushes";
import { tilesToRuns } from "../core/math/grid";
import type { TerrainState } from "../core/features/raster/strokePreview";
import type { BrushParams } from "../core/features/raster/brush";
import { BAD, BADWATER_STRENGTHS, coordinatesAt, DAM, DEFAULT_OPTIONS, DRAWING, GOOD, MOVING, paintOverlay, PROBLEM, SELECTED, SOURCE_STRENGTHS, sourceRequest, type OverlayLayer, type ToolOptions } from "./tools";

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
      carve(): CarveStatus | null;
      /** The last stroke painted (its operation's params), or null. */
      lastStroke(): BrushParams | null;
      /** "The start fits here" after a Flatten stroke (D204), and how long its search took. */
      startHint(): { x: number; y: number; strong: boolean; ms: number } | null;

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
  /** Source or Carve, picked in the top bar (the brushes have their own state). */
  const [tool, setTool] = useState<"source" | "carve" | null>(null);
  /** Carve's Aim: its start once picked, and the tile the pointer is on (D199). */
  const [aimFrom, setAimFrom] = useState<[number, number] | null>(null);
  const aimRef = useRef(aimFrom);
  aimRef.current = aimFrom;
  const [aimTo, setAimTo] = useState<[number, number] | null>(null);
  const [options, setOptions] = useState<ToolOptions>(DEFAULT_OPTIONS);
  /** The object picked on the shelf, its options and its turn (D184). */
  const [shelf, setShelf] = useState<ShelfItem | null>(null);
  const [shelfOptions, setShelfOptions] = useState<ShelfOptions>(DEFAULT_SHELF_OPTIONS);
  const [turn, setTurn] = useState(0);
  /** Trees and bushes being painted by a drag: their tiles. */
  const [painted, setPainted] = useState<number[] | null>(null);
  /** Remove, picked in the top bar, what it takes, and the rectangle being dragged. */
  const [removing, setRemoving] = useState(false);
  const [removeKinds, setRemoveKinds] = useState<RemoveKind[]>(REMOVE_KINDS.map(([k]) => k));
  const [removeRect, setRemoveRect] = useState<number[] | null>(null);
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
  const feel = (kind: Parameters<Juice["play"]>[0], x: number, y: number, size = 1, soft = false) => juice.current?.play(kind, x, y, size, soft);
  const [, setPlayerTick] = useState(0);
  const [follow, setFollow] = useState(false);
  const followRef = useRef(follow);
  followRef.current = follow;
  /** A hazard playing (a drought or a badtide to watch), or null. */
  const [weather, setWeatherState] = useState<Hazard | null>(null);
  const weatherRef = useRef<Hazard | null>(null);
  const setWeather = (on: Hazard | null) => {
    weatherRef.current = on;
    setWeatherState(on);
  };
  /** Where the water stood in the frame shown before (the camera follows where it rises most). */
  const lastDepth = useRef<Float32Array | null>(null);
  player.current ??= new WaterPlayer({
    show: (f) => showWater(f.water),
    changed: () => {
      setPlayerTick((n) => n + 1);
      setFlowing(player.current!.progress);
    },
  });
  const [instant, setInstant] = useState<CheckItem[]>([]);
  const [damSites, setDamSites] = useState<DamSiteView[] | null>(null);
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
  const removeKindsRef = useRef(removeKinds);
  removeKindsRef.current = removeKinds;
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

  /** Run worker calls one after another; apply what changed to the view. (While a carve is at work
   *  the other edits wait: Stop keeps it, Esc takes it back.) */
  function run(fn: () => Promise<SessionUpdate>, onDone?: (u: SessionUpdate) => void): Promise<void> {
    if (carver.current?.running) {
      setMessage({ kind: "info", text: "A carve is at work: Stop keeps it, Esc takes it back." });
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

  /** Put water on the map (a frame of its journey, a draft's): the renderer, the page's copy, and
   *  with Follow on, the camera drifting to where the water rises most. */
  function showWater(w: WaterView) {
    const r = renderer.current;
    r?.updateWater(w);
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    mirror.current.water = r?.mapState()?.surface ?? surfaceWater(W, H, w);
    mirror.current.waterView = w;
    const depth = new Float32Array(W * H);
    for (let k = 0; k < w.count; k++) depth[w.tile[k]] = Math.max(depth[w.tile[k]], w.depth[k]);
    const before = lastDepth.current;
    lastDepth.current = depth;
    if (!followRef.current || !r || !before || before.length !== depth.length) return;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < depth.length; i++) {
      const rise = depth[i] - before[i];
      if (rise < 0.05) continue;
      sx += (i % W) * rise;
      sy += Math.floor(i / W) * rise;
      n += rise;
    }
    if (n < 0.5) return;
    const v = r.getView();
    const tx = sx / n + 0.5;
    const tz = -(sy / n + 0.5);
    r.setView({ target: [v.target[0] + (tx - v.target[0]) * 0.15, v.target[1], v.target[2] + (tz - v.target[2]) * 0.15] });
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
    if (carver.current?.running) return carver.current.cancel();
    if (painter.current?.painting) return painter.current.cancel();
    const s = localUndo.current.pop();
    if (!s) return run(() => api.undo());
    showStroke(s, "before");
    localRedo.current.push(s);
    sendTerrain(() => api.undo());
  };
  const redo = () => {
    if (painter.current?.painting || carver.current?.running) return;
    const s = localRedo.current.pop();
    if (!s) return run(() => api.redo());
    showStroke(s, "after");
    localUndo.current.push(s);
    sendTerrain(() => api.redo());
  };

  /** The top bar: a brush, Source, Carve, Remove, or nothing; the shelf's object goes back. */
  function pickTop(t: TopTool | null) {
    if (carver.current?.running) return;
    // a force this build doesn't show can't be picked (release.ts, D219)
    if (t === "carve" && !forceShown("carve")) return;
    setAimFrom(null);
    if (t === "source" || t === "remove" || t === "carve") {
      pickBrush(null);
      pickShelf(null);
      setTool(t === "remove" ? null : t);
      setRemoving(t === "remove");
      setPicked(null);
      return;
    }
    if (t === null) {
      setTool(null);
      setRemoving(false);
    }
    pickBrush(t);
  }

  function pickBrush(t: BrushTool | null) {
    painter.current?.end();
    setShapeNote(null);
    setBrushTool(t);
    if (t) {
      setTool(null);
      setRemoving(false);
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
    setRemoving(false);
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
          // (a carve at work shows its own water: the map's comes after it)
          if (carver.current?.running) {
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

  // the dam-site layer, measured again after each change while it is shown
  const showDams = damSites !== null;
  useEffect(() => {
    if (!showDams) return;
    // (a layer put away before its sites arrive stays away)
    void enqueue(() => api.damSites()).then((d) => setDamSites((shown) => (shown === null ? null : d.sites)));
  }, [showDams, info.version]);

  useEffect(() => props.onChange(info), []);

  // the worker's own news between its answers: the water as it flows after an edit, then the
  // settled water with the soil and plants on it (live editing: an edit never waits on the water)
  useEffect(() => {
    void api.listen(
      proxy((e: EditorEvent) => {
        if (e.version !== infoRef.current.version) return;
        // a carve at work shows its own water; the map's settled view comes after it
        if (carver.current?.running) {
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
          player.current?.push({ water: e.view.water ?? mirror.current.mapWater, done: 1, final: () => applyView(e.view) });
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
  const ctx = (): TileContext => ({ W: info.W, H: info.H, heights: mirror.current.heights, water: mirror.current.water, entities: mirror.current.entities, entitiesAt: entitiesAt(), index: indexed, soil: mirror.current.soil, editor: true });

  // where the start is: its feature, or an imported map's own StartingLocation
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

  // overlay: the water layer, dam sites, the footprint of the object under the pointer (green where
  // it fits, red where it doesn't), trees being painted, Remove's rectangle, the source picked, the
  // start while it moves, a source being dragged, the selection, the problems an edit made
  useEffect(() => {
    const r = renderer.current;
    const data = r?.overlayData();
    if (!r || !data) return;
    const layers: OverlayLayer[] = [];
    if (waterLayers && layer !== "none") layers.push(...layerOverlay(waterLayers, layer));
    if (damSites) for (const d of damSites) layers.push({ tiles: d.tiles.filter(([x, y]) => x >= 0 && y >= 0 && x < info.W && y < info.H).map(([x, y]) => y * info.W + x), color: DAM });
    if (painted) layers.push({ tiles: painted, color: GOOD });
    else if (fit) layers.push({ tiles: fit.tiles, color: fit.problem ? BAD : GOOD });
    if (removeRect) layers.push({ tiles: removeRect, color: BAD });
    if (picked) layers.push({ tiles: [picked.y * info.W + picked.x], color: SELECTED });
    if (startDrag) layers.push({ tiles: [...startDrag.check.tiles, startDrag.check.door], color: startDrag.check.problem || !startDrag.check.meets ? BAD : GOOD });
    if (sourceDrag) layers.push({ tiles: sourceDrag, color: MOVING });
    if (selection.current.count) layers.push({ tiles: selection.current.tiles(), color: SELECTED, outline: true });
    if (selectDraw) layers.push({ tiles: selectDraw, color: DRAWING });
    if (aimFrom) {
      layers.push({ tiles: aimTo ? lineTiles(aimFrom, aimTo, info.W) : [], color: DRAWING });
      layers.push({ tiles: [aimFrom[1] * info.W + aimFrom[0]], color: SELECTED });
    }
    for (const c of instant) for (const [x, y] of c.where?.tiles ?? []) layers.push({ tiles: [y * info.W + x], color: PROBLEM });
    paintOverlay(data, info.W, info.H, layers);
    r.commitOverlay();
  }, [fit, picked, startDrag, damSites, instant, ready, waterLayers, layer, sourceDrag, selectionTick, selectDraw, painted, removeRect, aimFrom, aimTo]);

  // ------------------------------------------------------------------------------ the pointer

  /** Where the pointer is, for the words beside it (flatten's level, a source's strength). */
  const pointerAt = useRef({ x: 0, y: 0 });

  /** Where the pointer is over the map, for the words beside it. */
  function notePointer(ev: PointerEvent) {
    const box = renderer.current?.canvas.getBoundingClientRect();
    if (box) pointerAt.current = { x: ev.clientX - box.left, y: ev.clientY - box.top };
  }

  // ---------------------------------------------------------------------------- water sources

  /** A water or badwater source placed with a click: its water spreads at once (live editing),
   *  one undo step. Sources go anywhere in the editor (D184). */
  function placeSource(x: number, y: number) {
    const req = sourceRequest(optionsRef.current, x, y);
    void run(
      () => api.applyTool(req, newId()),
      (u) => {
        if (!u.ok) return;
        feel("source", x, y);
        firstDone("water");
      },
    );
  }

  /** The source's own record (its id, place and strength), from the worker. */
  function sourceInfo(x: number, y: number): Promise<EntityInfo | null> {
    return enqueue(() => api.entitiesAt(x, y)).then((list) => list.find((e) => e.template === "WaterSource" || e.template === "BadwaterSource") ?? null);
  }

  /** A source dragged somewhere else (D184): its footprint follows the pointer, and the drop is one
   *  undo step; a click without a drag selects it; Esc puts it back. Brushes paint over sources. */
  const sourceGrab = useRef<{ cancel(): void } | null>(null);
  function grabSource(hit: TileHit | null): PointerTool | null {
    if (!hit || brushToolRef.current || shelfRef.current || removingRef.current) return null;
    const src = sourceAt(hit.x, hit.y);
    if (!src) return null;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const from: [number, number] = [hit.x, hit.y];
    let to = from;
    let done = false;
    const record = sourceInfo(hit.x, hit.y);
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
        if (!dx && !dy) return pickTile(from[0], from[1]);
        void record.then((e) => {
          if (!e) return;
          const name = e.template === "BadwaterSource" ? "badwater source" : "water source";
          void run(() => api.apply({ op: "moveEntity", params: { id: e.id, x: e.x + dx, y: e.y + dy } }, "user", `Move a ${name}`));
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
  /** Which markers show: every one with Source picked or **Markers** on; else those near the
   *  pointer and those its water comes from. */
  const shownGroups = tool === "source" || markersOn ? groups.map((_, k) => k) : [...new Set([...nearSources, ...feeding])];
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
            <span key={k} class={`map-note source-marker${g.bad ? " bad" : ""}${feeding.includes(k) ? " feeding" : ""}`} style={{ left: `${p.x}px`, top: `${p.y}px` }}>
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
    const z = cx >= 0 && cy >= 0 && cx < W && cy < info.H ? h[cy * W + cx] : h[y * W + x];
    const g = { template, x: cx, y: cy, z, orientation: turnRef.current };
    const same = ghostAt.current && ghostAt.current.template === template && ghostAt.current.x === cx && ghostAt.current.y === cy && ghostAt.current.orientation === g.orientation;
    ghostAt.current = g;
    if (!same) r.setGhost({ ...g, ok: null });
    checkFit({ tool: "entity", template, x: cx, y: cy, orientation: o }, (f) => {
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
          feel("place", cx, cy);
          // there is one start: it goes back on the shelf
          pickShelf(null);
        },
      );
      return;
    }
    const template = templateOf(item, shelfOptionsRef.current);
    const o = ORIENTATION_NAMES[turnRef.current] as Orientation;
    const [cx, cy] = coordinatesAt(template, x, y, o);
    void run(
      () => api.applyTool({ tool: "entity", template, x: cx, y: cy, orientation: o }, newId()),
      (u) => {
        if (!u.ok) return;
        feel("place", cx, cy);
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
        feel("place", planted[0] % W, Math.floor(planted[0] / W));
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

  // ------------------------------------------------------------------------------ Remove

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
  /** The corner tiles of the objects on these tiles that Remove's filters take (never the start). */
  function removableOn(tiles: readonly number[]): number[] {
    const e = mirror.current.entities;
    const at = coverAt();
    const kinds = removeKindsRef.current;
    const out = new Set<number>();
    for (const i of tiles)
      for (const k of at.get(i) ?? []) {
        const kind = removeKindOf(e.templates[e.template[k]]);
        if (kind && kinds.includes(kind)) out.add(e.y[k] * info.W + e.x[k]);
      }
    return [...out];
  }
  /** Remove's click or drag: what the filters take there goes, one step, with its whuff; the start
   *  stays (a word beside the pointer says so). */
  function removeOn(tiles: number[]) {
    const corners = removableOn(tiles);
    if (!corners.length) {
      const e = mirror.current.entities;
      const start = tiles.some((i) => (coverAt().get(i) ?? []).some((k) => e.templates[e.template[k]] === "StartingLocation"));
      if (start) flashNote("The start stays: pick it on the shelf to move it");
      return;
    }
    const W = info.W;
    void run(
      () => api.removeAt(tiles, removeKindsRef.current),
      (u) => u.ok && feel("remove", corners[0] % W, Math.floor(corners[0] / W)),
    );
  }
  const removeCalls = useRef({ removableOn, removeOn });
  removeCalls.current = { removableOn, removeOn };
  const removingRef = useRef(removing);
  removingRef.current = removing;
  // Remove takes the map's left button while it is picked
  useEffect(() => {
    const r = renderer.current;
    if (!r || !removing) return;
    const t = removeTool({
      W: info.W,
      H: info.H,
      objectsOn: (tiles) => removeCalls.current.removableOn(tiles),
      highlight: (corners) => r.highlightObjects(corners),
      drawing: (tiles, ev) => {
        setRemoveRect(tiles);
        if (ev) notePointer(ev);
        if (!tiles) return setShapeNote(null);
        const n = removeCalls.current.removableOn(tiles).length;
        setShapeNote({ text: n === 1 ? "1 object" : `${n} objects`, ok: true, warn: false, ...pointerAt.current });
      },
      remove: (tiles) => removeCalls.current.removeOn(tiles),
    });
    r.tool = t;
    if (r.hoverHit) r.highlightObjects(removeCalls.current.removableOn([r.hoverHit.y * info.W + r.hoverHit.x]));
    return () => {
      if (r.tool === t) r.tool = null;
      r.highlightObjects(null);
      setRemoveRect(null);
    };
  }, [removing, ready, info.W, info.H]);

  // ------------------------------------------------------------------------------ Source

  // Source takes the map's clicks while it is picked: each places a source (D184)
  useEffect(() => {
    const r = renderer.current;
    if (!r || tool !== "source") return;
    const t: PointerTool = {
      down: (hit, ev) => ev.button === 0 && !!hit,
      move: () => undefined,
      up: (hit) => {
        if (hit) placeSource(hit.x, hit.y);
      },
      hover: (_hit, ev) => notePointer(ev),
    };
    r.tool = t;
    return () => {
      if (r.tool === t) r.tool = null;
    };
  }, [tool, ready]);

  // ------------------------------------------------------------------------------ Carve

  /** Carve's options for the next carve (D199; kept for the visit), Aim's start, and the tile the
   *  pointer is on while aiming. */
  const [carveUi, setCarveUi] = useState<CarveUi>(DEFAULT_CARVE);
  const carveUiRef = useRef(carveUi);
  carveUiRef.current = carveUi;
  const [, setCarveTick] = useState(0);
  /** The map's own views that came while a carve was at work (the settled water, a check's): they
   *  go on the map just before the carve's own answer. */
  const deferred = useRef<ViewUpdate[]>([]);
  /** The carve to start next: where, and the layer showing (D207: only the land showing is carved). */
  const carveReq = useRef<{ origin: [number, number]; end?: [number, number]; cut: number | null } | null>(null);

  /** A frame of the carve at work: the ground near its head, its water, the objects it took. */
  function showForceFrame(f: ForceFrame) {
    const r = renderer.current;
    const m = mirror.current;
    if (f.heights && f.rect) {
      m.heights = f.heights;
      r?.updateTerrainRect(f.heights, f.rect);
    }
    if (f.water) {
      r?.updateWater(f.water);
      m.water = r?.mapState()?.surface ?? surfaceWater(infoRef.current.W, infoRef.current.H, f.water);
      m.waterView = f.water;
    }
    if (f.entities) {
      m.entities = f.entities;
      m.entitiesAt = null;
      m.coverAt = null;
      r?.updateEntities(f.entities);
    }
  }

  function flushDeferred() {
    const list = deferred.current;
    deferred.current = [];
    for (const v of list) applyView(v);
  }

  // (the driver lives as long as the editor; it calls the latest of these)
  const carveCalls = useRef<{ keep(): Promise<void>; drop(): Promise<void>; show(f: ForceFrame): void; click(x: number, y: number): void; hover(hit: TileHit | null, ev: PointerEvent): void } | null>(null);
  carveCalls.current = {
    keep: () =>
      enqueue(async () => {
        setBusy((b) => b + 1);
        try {
          const u = await api.carveStop();
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
        const v = await api.carveCancel();
        if (!mounted.current) return;
        flushDeferred();
        applyView(v);
        renderer.current?.refreshShadows();
      }),
    show: showForceFrame,
    click: carveClick,
    hover: carveHover,
  };
  const carver = useRef<CarveDriver | null>(null);
  carver.current ??= new CarveDriver({
    start: (again) =>
      enqueue(() => {
        const q = carveReq.current;
        if (again || !q) return api.carveAgain();
        return api.carveStart({ settings: carveSettingsOf(carveUiRef.current), origin: q.origin, ...(q.end ? { end: q.end } : {}), cut: q.cut });
      }),
    advance: (steps) => enqueue(() => api.carveAdvance(steps)),
    keep: () => carveCalls.current!.keep(),
    drop: () => carveCalls.current!.drop(),
    renderer: () => renderer.current,
    speed: () => player.current?.speedName ?? "normal",
    follow: () => carveUiRef.current.follow,
    show: (f) => carveCalls.current!.show(f),
    changed: () => setCarveTick((n) => n + 1),
    error: (text) => setMessage({ kind: "error", text: plain(text) }),
    feel: (x, y, size) => juice.current?.play("carve", x, y, size),
  });
  // (a carve at work when the editor closes goes with it)
  useEffect(() => () => carver.current?.cancel(), []);

  /** The water's journey and a weather run give way to the carve's own water. */
  function clearForCarve() {
    player.current?.clear();
    if (weatherRef.current) setWeather(null);
    setPicked(null);
    setShapeNote(null);
    setMessage(null);
  }

  /** Unleash: a click starts it there. Aim: a click picks its start, the next its end. */
  function carveClick(x: number, y: number) {
    const c = carver.current;
    if (!c || c.running) return;
    if (carveUiRef.current.mode === "aim") {
      const from = aimRef.current;
      if (!from) {
        setAimFrom([x, y]);
        setAimTo(null);
        return;
      }
      if (from[0] === x && from[1] === y) return;
      setAimFrom(null);
      setAimTo(null);
      startCarve(from, [x, y]);
      return;
    }
    startCarve([x, y]);
  }

  function startCarve(origin: [number, number], end?: [number, number]) {
    carveReq.current = { origin, ...(end ? { end } : {}), cut: renderer.current?.slice ?? null };
    clearForCarve();
    void carver.current?.start(false);
  }

  /** Try another path: the last carve again, from the same land, another way. */
  function carveAgain() {
    if (!carver.current || carver.current.running) return;
    clearForCarve();
    void carver.current.start(true);
  }

  /** Aim: the line to the pointer, and what it will do there (tools read intent, D204: an end
   *  uphill says so before the click). */
  function carveHover(hit: TileHit | null, ev: PointerEvent) {
    notePointer(ev);
    const from = aimRef.current;
    if (!hit || carver.current?.running || carveUiRef.current.mode !== "aim") {
      if (from) setAimTo(null);
      setShapeNote(null);
      return;
    }
    if (!from) {
      setShapeNote({ text: "Click where it starts", ok: true, warn: false, ...pointerAt.current });
      return;
    }
    setAimTo([hit.x, hit.y]);
    const h = mirror.current.heights;
    const W = infoRef.current.W;
    const uphill = h[hit.y * W + hit.x] > h[from[1] * W + from[0]];
    const n = Math.round(Math.hypot(hit.x - from[0], hit.y - from[1]));
    const defy = carveUiRef.current.defyGravity;
    const text = uphill ? (defy ? `${n} tiles, uphill: Defy gravity cuts through` : `${n} tiles, uphill: turn on Defy gravity`) : `${n} tiles: click where it ends`;
    setShapeNote({ text, ok: true, warn: uphill && !defy, ...pointerAt.current });
  }

  // Carve takes the map's clicks while it is picked (a click, not a drag)
  useEffect(() => {
    const r = renderer.current;
    if (!r || tool !== "carve") return;
    let down: TileHit | null = null;
    const t: PointerTool = {
      down: (hit, ev) => {
        if (ev.button !== 0 || !hit || carver.current?.running) return false;
        down = hit;
        return true;
      },
      move: () => undefined,
      up: (hit) => {
        if (hit && down && Math.max(Math.abs(hit.x - down.x), Math.abs(hit.y - down.y)) <= 1) carveCalls.current!.click(hit.x, hit.y);
        down = null;
      },
      hover: (hit, ev) => carveCalls.current!.hover(hit, ev),
      cancel: () => {
        down = null;
      },
    };
    r.tool = t;
    return () => {
      if (r.tool === t) r.tool = null;
      setAimFrom(null);
      setAimTo(null);
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

  function onReady(r: MapRenderer) {
    renderer.current = r;
    setReady(r);
    juice.current ??= new Juice(() => renderer.current, sound);
    juice.current.register("carve", carveTouch, 380);
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
        const done = sendTerrain(() => api.apply({ op: "brush", params: stroke.params }, "user", stroke.label));
        // a Flatten stroke: where its level ground could take the start, once it is on the map
        if (stroke.params.tool === "flatten") void done.then(() => lookForStartRef.current(stroke.params));
      },
      picked: (level, what) => setBrush(what === "stop" ? { ...brushRef.current, stop: level } : { ...brushRef.current, level }),
      keep: () => keptTiles(),
      footprints: () => objectFootprints(),
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
      feel: (kind, x, y, size, soft) => feel(kind, x, y, size, soft),
      // F held: the size follows the pointer, saved once it is set (D205)
      resize: (size, ev, done) => {
        setBrush({ ...brushRef.current, size }, done);
        if (ev) flashNote(`size ${size}`, ev);
      },
      // a new stroke puts away the last one's start hint (its water flows while it is painted, D197)
      painting: (on) => {
        if (!on) return;
        hintJob.current++;
        setStartHint(null);
      },
      note: (text, ev) => {
        if (!text) return setShapeNote(null);
        if (ev) notePointer(ev);
        setShapeNote({ text, ok: true, warn: false, ...pointerAt.current });
      },
      wet: (x, y) => (mirror.current.water?.depth[y * infoRef.current.W + x] ?? 0) > 0.05,
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
      if (hit && sourceAt(hit.x, hit.y)) return pickTile(hit.x, hit.y);
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
    };
  }
  // the Select tool takes the map's left button while it is open and no brush is out
  useEffect(() => {
    const r = renderer.current;
    if (!r || !selecting || brushTool) return;
    const t = selectTool(selection.current, selectHost());
    r.tool = t;
    return () => {
      if (r.tool === t) r.tool = null;
    };
  }, [selecting, brushTool, ready]);
  function closeSelect() {
    selection.current.clear();
    setSelecting(null);
    setSelectDraw(null);
    setSelectionTick((n) => n + 1);
  }
  /** What the Select tool does to the selection: one operation, one undo step each. */
  function selectAction(what: "raise" | "lower" | "flatten" | "dig" | "clear", level?: number) {
    const h = mirror.current.heights;
    // under a cut (D207), only the visible land: the ground above the cut stays as it is
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    if (!tiles.length) return;
    const cells = tilesToRuns(tiles, info.W);
    const n = tiles.length;
    if (what === "clear") {
      // everything standing there but the start and the sources (the water is theirs)
      const at = entitiesAt();
      const ids: string[] = [];
      void (async () => {
        for (const i of tiles) {
          if (!at.get(i)?.length) continue;
          const list = await enqueue(() => api.entitiesAt(i % info.W, Math.floor(i / info.W)));
          for (const x of list) if (x.template !== "StartingLocation" && x.template !== "WaterSource" && x.template !== "BadwaterSource" && !ids.includes(x.id)) ids.push(x.id);
        }
        if (!ids.length) return setMessage({ kind: "info", text: "Nothing stands there to clear." });
        void run(() => api.apply({ op: "deleteEntities", params: { entities: ids } }, "user", `Clear ${ids.length} object${ids.length > 1 ? "s" : ""}`));
      })();
      return;
    }
    let op: EditOp;
    let label: string;
    if (what === "raise" || what === "lower") {
      // (raised under a cut: up to it, never past it)
      let top = 0;
      for (const i of tiles) top = Math.max(top, h[i]);
      const amount = what === "raise" && cut !== null ? Math.min(selectAmount, cut - top) : selectAmount;
      if (amount <= 0) return flashNote("Nothing can rise under the cut: show a layer more");
      op = { op: "sculpt", params: { mode: what, cells, amount } };
      label = `${what === "raise" ? "Raise" : "Lower"} ${n} tiles by ${amount}`;
    } else if (what === "dig") {
      // dig out: down to the selection's lowest ground
      let lo = 99;
      for (const i of tiles) lo = Math.min(lo, h[i]);
      op = { op: "sculpt", params: { mode: "flatten", cells, level: lo } };
      label = `Dig out ${n} tiles to level ${lo}`;
    } else {
      op = { op: "sculpt", params: { mode: "flatten", cells, level: level! } };
      label = `Set ${n} tiles to level ${level}`;
    }
    // the land's answer, at the selection's middle
    let sx = 0;
    let sy = 0;
    for (const i of tiles) {
      sx += i % info.W;
      sy += Math.floor(i / info.W);
    }
    const mid: [number, number] = [Math.round(sx / n), Math.round(sy / n)];
    const size = Math.max(1, Math.sqrt(n) / 2);
    void run(
      () => api.apply(op, "user", label),
      (u) => u.ok && feel(what === "raise" ? "raise" : what === "lower" || what === "dig" ? "lower" : "shape", mid[0], mid[1], size),
    );
  }
  /** The selection's middle level (flatten's default). */
  function selectMedian(): number {
    const h = mirror.current.heights;
    const v = selection.current.tiles().map((i) => h[i]).sort((a, b) => a - b);
    return v.length ? v[v.length >> 1] : 0;
  }
  const [flattenTo, setFlattenTo] = useState<number | null>(null);
  function selectRow() {
    if (!selecting && !selection.current.count) return null;
    void selectionTick;
    const z = selection.current.size();
    const level = flattenTo ?? selectMedian();
    return (
      <div class="bar-group">
        <span class="bar-status" role="status">
          {z ? sizeWords(z) : "Select: drag on the map (Shift adds, Alt subtracts)"}
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
            <label>
              to level
              <select aria-label="Level" value={String(level)} onChange={(e) => setFlattenTo(Number((e.target as HTMLSelectElement).value))}>
                {Array.from({ length: 17 }, (_, k) => k).map((k) => (
                  <option key={k} value={String(k)}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => selectAction("flatten", level)}>
              Set level
            </button>
            <button type="button" title="Down to the selection's lowest ground" onClick={() => selectAction("dig")}>
              Dig out
            </button>
            <button type="button" title="Trees, bushes, ruins and the other objects there (not the start or the sources)" onClick={() => selectAction("clear")}>
              Clear objects
            </button>
          </>
        ) : null}
        <button type="button" class="linkish" aria-label="Close the selection" title="Close (Esc)" onClick={closeSelect}>
          ×
        </button>
      </div>
    );
  }

  /** The tiles a precise hold never digs out from under (D193): the start's footprint and the
   *  objects standing there (trees and bushes follow the ground), as runs. */
  /** The tiles of each object on more than one tile (a Flatten stroke keeps them level, D204). */
  function objectFootprints(): number[][] {
    const e = mirror.current.entities;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const out: number[][] = [];
    for (let k = 0; k < e.count; k++) {
      const template = e.templates[e.template[k]];
      const tl = footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 });
      if (tl.length < 2) continue;
      const g = tl.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H).map(([x, y]) => y * W + x);
      if (g.length > 1) out.push(g);
    }
    return out;
  }
  function keptTiles(): [number, number, number][] {
    const e = mirror.current.entities;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const tiles: number[] = [];
    for (let k = 0; k < e.count; k++) {
      const template = e.templates[e.template[k]];
      if (/^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Coffee|BlueberryBush|Dandelion|Cattail|Spadderdock|Succulent)/.test(template)) continue;
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
  // any tool picked makes the water see-through, so the bed and the sources show (D196)
  //   (Carve: the river forming is the show, so its water stays as it is)
  useEffect(() => renderer.current?.setClearWater(clearWater || !!brushTool || tool === "source" || !!selecting || !!shelf || removing), [clearWater, brushTool, tool, selecting, shelf, removing, ready]);

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
    if (!hit || !s || brushToolRef.current || shelfRef.current || removingRef.current) return null;
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
      // a carve at work (D199): Esc or Ctrl+Z takes it back, Space holds it; the other tools wait
      const c = carver.current;
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
        if (mod || /^[1-9]$/.test(ev.key) || ["m", "x", "r", "f", "delete", "backspace"].includes(ev.key.toLowerCase())) return;
      }
      // Aim's start picked: Esc lets it go
      if (ev.key === "Escape" && aimRef.current) {
        setAimFrom(null);
        return;
      }
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
      // 6: Source; 7: Carve; M: the Select tool
      if (!mod && !ev.altKey && ev.key === "6" && painter.current) {
        pickTop(toolRef.current === "source" ? null : "source");
        return;
      }
      if (!mod && !ev.altKey && ev.key === "7" && painter.current && forceShown("carve")) {
        pickTop(toolRef.current === "carve" ? null : "carve");
        return;
      }
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "m") {
        if (selectingRef.current) closeSelect();
        else {
          pickBrush(null);
          setTool(null);
          setSelecting("rect");
        }
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
      // R turns the shelf's object (D184); X picks Remove
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
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "x") {
        pickTop(removingRef.current ? null : "remove");
        return;
      }
      if (ev.key === "Escape" && shelfRef.current) {
        pickShelf(null);
        return;
      }
      if (ev.key === "Escape" && removingRef.current) {
        setRemoving(false);
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
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && pickedSources().length) {
        // a picked source: its water recedes live (D196)
        ev.preventDefault();
        removeSources(pickedSources());
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
      carve: () => (carver.current?.status ? { ...carver.current.status } : null),
      startHint: () => (startHintRef.current ? { x: startHintRef.current.x, y: startHintRef.current.y, strong: startHintRef.current.strong, ms: hintMs.current } : null),
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

  // the dam sites' line in the legend, with their tiles (a click on it points to them)
  const legendExtra = useMemo(
    () => (damSites ? [{ swatch: damLegendSwatch(), label: "Dam sites", markers: true, tiles: damSites.flatMap((d) => d.tiles.filter(([x, y]) => x >= 0 && y >= 0 && x < info.W && y < info.H).map(([x, y]) => y * info.W + x)) }] : []),
    [damSites, info.W, info.H],
  );
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
        <Shelf picked={shelf?.id ?? null} onPick={pickShelf} icon={(t) => icons[t] ?? null} loading={!ready || !!carver.current?.running} />
        <section class="editor-map" aria-label="Map">
          <View3D
            view={view}
            class="editor-view"
            label={`3D view of ${info.name}. Drag to turn, right-drag to move, wheel to zoom.`}
            onReady={onReady}
            legendExtra={legendExtra}
            markersWanted={damSites !== null || shelf?.id === "Slope"}
            togglesInButtons
            showLegend={layer !== "none" || damSites !== null}
            viewButtons={
              <>
                <button type="button" aria-pressed={clearWater} onClick={() => setClearWater(!clearWater)} title="See through the water to the bed and the sources (T). Any tool picked does it too.">
                  Clear water
                </button>
                {(["moisture", "badwater", "drought", ...(waterLayers?.roofed.length ? (["roofed"] as const) : [])] as LayerKind[]).map((k) => (
                  <button type="button" key={k} aria-pressed={layer === k} onClick={() => setLayer(layer === k ? "none" : k)} title={`Show ${LAYER_NAMES[k].toLowerCase()} on the map`}>
                    {OVERLAY_WORDS[k]}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={damSites !== null}
                  onClick={() => setDamSites(damSites === null ? [] : null)}
                  title="Show the dam sites: where a short dam holds the most water"
                >
                  Dam sites
                </button>
                <LayerWidget level={sliceLevel} onStep={(dir) => renderer.current?.stepSlice(dir)} onReset={() => renderer.current?.setSlice(null)} />
                <button type="button" aria-pressed={minimap} onClick={() => setMinimap(!minimap)} title="A small picture of the whole map in the corner: click it to go there">
                  Minimap
                </button>
                <span class="reveal-group">
                  <button type="button" aria-pressed={sound.on} onClick={() => setSound({ ...sound, on: !sound.on })} title="The editor's little sounds: on or off (the volume beside it)">
                    Sound
                  </button>
                  <label class="slider-field reveal" title="Volume">
                    <input type="range" min="0" max="1" step="0.05" aria-label="Sound volume" value={sound.volume} disabled={!sound.on} onInput={(e) => setSound({ ...sound, volume: Number((e.target as HTMLInputElement).value) })} />
                  </label>
                </span>
              </>
            }

            onHover={(hit: TileHit | null) => {
              setHover(hit ? describeTile(ctx(), hit.x, hit.y) : null);
              hoverSources(hit);
              // a source, and the start, can be picked up and moved
              const canvas = renderer.current?.canvas;
              const free = hit && !brushToolRef.current && !shelfRef.current && !removingRef.current && !toolRef.current;
              const onStart = !!hit && !!startHere && Math.max(Math.abs(hit.x - startHere.x), Math.abs(hit.y - startHere.y)) <= 1;
              if (canvas) canvas.style.cursor = free && (sourceAt(hit.x, hit.y) || onStart) ? "grab" : "";
              hoverStart(!!free && onStart);
            }}
            hoverText={hover}
          >
            <TopBar
              active={brushTool}
              source={tool === "source"}
              force={tool === "carve" ? "carve" : null}
              forceAtWork={!!carver.current?.running}
              forceRow={
                tool === "carve" ? (
                  <CarveRow
                    force={FORCES.find((f) => f.id === "carve")!}
                    ui={carveUi}
                    onUi={(u) => {
                      setCarveUi(u);
                      if (u.mode !== carveUi.mode) setAimFrom(null);
                    }}
                    status={carver.current?.status ?? null}
                    canAgain={info.carveAgain}
                    onAgain={() => void carveAgain()}
                    onPause={() => carver.current?.pause(!carver.current.status?.paused)}
                    onStop={() => void carver.current?.stop()}
                    onRevert={() => carver.current?.cancel()}
                  />
                ) : null
              }
              remove={removing}
              removeKinds={removeKinds}
              onRemoveKinds={setRemoveKinds}
              row={shelfRow() ?? pickedRow()}
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
              sourceOptions={<SourceOptions options={options} onOptions={setOptions} />}
              selectRow={selectRow()}
            />
            {player.current ? <WaterBar player={player.current} follow={follow} onFollow={setFollow} weather={weather} onWeather={toggleWeather} /> : null}
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
const OVERLAY_WORDS: Record<LayerKind, string> = { none: "None", moisture: "Moisture", badwater: "Badwater", drought: "Drought", roofed: "Under roofs" };

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
    };
  } catch {
    return DEFAULT_BRUSH;
  }
}

function saveBrush(s: BrushSettings): void {
  try {
    localStorage.setItem(BRUSH_KEY, JSON.stringify({ size: s.size, strength: s.strength }));
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
    case "moisture":
      return [
        { tiles: pick(l.moisture, 1), color: [120, 200, 110, 70] },
        { tiles: pick(l.moisture, 2), color: [70, 180, 90, 120] },
        { tiles: pick(l.moisture, 3), color: [30, 150, 70, 165] },
      ];
    case "badwater":
      return [
        { tiles: pick(l.badwater, 2), color: [190, 140, 70, 120] },
        { tiles: pick(l.badwater, 1), color: [120, 70, 30, 200] },
      ];
    case "drought":
      return [
        { tiles: pick(l.drought, 1), color: [50, 110, 235, 170] },
        { tiles: pick(l.drought, 2), color: [245, 150, 40, 170] },
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

/** The tiles on a straight line from a to b (Aim's line). */
function lineTiles(a: [number, number], b: [number, number], W: number): number[] {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  const out: number[] = [];
  for (let k = 0; k <= n; k++) {
    const x = Math.round(a[0] + ((b[0] - a[0]) * k) / (n || 1));
    const y = Math.round(a[1] + ((b[1] - a[1]) * k) / (n || 1));
    out.push(y * W + x);
  }
  return out;
}
