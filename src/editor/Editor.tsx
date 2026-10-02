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

import { proxy, type Remote } from "comlink";
import { useEffect, useRef, useState } from "preact/hooks";
import { cornerFor } from "../core/doc/tools";
import { startEntranceTile } from "../core/format/footprints";
import type { Point } from "../core/features/schema";
import { canSaveToTimberborn, saveFile, saveToTimberborn } from "../platform";
import { ORIENTATION_NAMES } from "../render3d/model";
import type { PointerTool, TileHit } from "../render3d";
import { View3D } from "../ui/View3D";
import { LookMenu } from "../ui/LookMenu";
import type { GeneratorApi } from "../worker/generator.worker";
import type { CheckProgress, SessionInfo, SessionOpen } from "../worker/session";
import { describeTile as describeTileFacts, tileWords } from "../core/doc/describeTile";
import { checkStartAt, sameStartCheck, startStatus, type StartCheck, type StartStatus } from "./features";
import { HistoryPanel, LayerLegend, LAYER_NAMES, plain, StartIndicators, whereOf, type ItemActions, type LayerKind } from "./panels";
import { ChecksDot, Header } from "./Header";
import { Shelf } from "./Shelf";
import { SHELF } from "./shelfItems";
import type { Verb } from "../core/forces/op";
import { FirstRun, saveFirstRun, type FirstStep } from "./FirstRun";
import { LayerWidget } from "./LayerWidget";
import { Minimap } from "./Minimap";
import { FORCES, ForceFloor, forceShown, TopBar } from "./TopBar";
import { WaterBar } from "./WaterBar";
import { keyHabit } from "./forceSize";
import { BRUSHES, sizeMax } from "./brushes";
import { GHOST_OK } from "./tools";
import { tip } from "../ui/Tooltip";
import type { Ed } from "./ed";
import { useSession } from "./session/useSession";
import { usePaint } from "./paint/usePaint";
import { useView } from "./view/useView";
import { useSourcePointer } from "./sources/useSourcePointer";
import { useMarkers } from "./sources/useMarkers";
import { useStartHint } from "./start/useStartHint";
import { useRemoveSources } from "./sources/useRemoveSources";
import { useShelf } from "./shelf/useShelf";
import { useDelete } from "./remove/useDelete";
import { useForcePrefs } from "./forces/useForcePrefs";
import { useForceRun } from "./forces/useForceRun";
import { useForcePointer } from "./forces/useForcePointer";
import { useRows } from "./rows/useRows";
import { useReady } from "./view/useReady";
import { useSelect } from "./selection/useSelect";

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

/** What the editor says once the map's last badwater spring is gone (D213). */
const NO_BADWATER_LINE = "No badwater: you removed the map's last badwater spring, so this is a peaceful map now. Badtides still come.";

/** The overlays' words on their view buttons. */
const OVERLAY_WORDS: Record<LayerKind, string> = { none: "None", badwater: "Badwater", roofed: "Under roofs" };

/** Dropping a .timber or project file on the editor opens it: only a file dragged in from outside
 *  the page (D323, item 11). A drag that began on the page (an icon, an image, a link) carries a
 *  file of its own in Chrome, and never opens anything. */
function DropTarget({ onFile }: { onFile(file: File): void }) {
  const latest = useRef(onFile);
  latest.current = onFile;
  useEffect(() => {
    /** A drag that began on this page is under way. */
    let inside = false;
    // (after the page's own handlers, so a drag they cancel is no drag at all)
    const began = (e: DragEvent) => {
      inside = !e.defaultPrevented;
    };
    const ended = () => {
      inside = false;
    };
    const over = (e: DragEvent) => {
      if (!inside && e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      const own = inside;
      inside = false;
      if (!file || own) return;
      e.preventDefault();
      latest.current(file);
    };
    window.addEventListener("dragstart", began);
    window.addEventListener("dragend", ended);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    // (a page's own drag that ends with no dragend: the next press starts clean)
    window.addEventListener("pointerdown", ended);
    return () => {
      window.removeEventListener("dragstart", began);
      window.removeEventListener("dragend", ended);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("pointerdown", ended);
    };
  }, []);
  return null;
}

export interface RestSlice {
  toolRef: { current: Verb | null };
  grabObjectRef: { current: (hit: TileHit | null) => PointerTool | null };
  startCalls: { current: { grabStart: (hit: TileHit | null) => PointerTool | null } };
  fitRef: { current: { tiles: number[]; problem: string | null; level?: number; status?: StartStatus | "pending" } | null };
}

export default function Editor(props: EditorProps) {
  const ed = {} as Ed;
  Object.assign(ed, useSession(ed, props));
  Object.assign(ed, usePaint(ed, props));
  Object.assign(ed, useView(ed));
  Object.assign(ed, useSourcePointer(ed));
  Object.assign(ed, useMarkers(ed));
  Object.assign(ed, useStartHint(ed));
  Object.assign(ed, useRemoveSources(ed));
  Object.assign(ed, useShelf(ed));
  Object.assign(ed, useDelete(ed));
  Object.assign(ed, useForcePrefs(ed));
  Object.assign(ed, useForceRun(ed));
  Object.assign(ed, useForcePointer(ed));
  Object.assign(ed, useRows(ed));
  Object.assign(ed, useReady(ed));
  Object.assign(ed, useSelect(ed));

  const {
    api, info, setInfo, view, mirror, renderer, ready, tool, setTool, flipRef, forceEscRef, gestureRef, shelf,
    setTurn, icons, setStartDrag, startDrag, busy, setMessage, message, setHover, hover, showHistory, setShowHistory,
    check, progress, layer, setLayer, waterLayers, waterTick, flowing, clearWater, setClearWater, sliceLevel,
    selecting, selectingRef, selection, setHoverObject, player, sound, juice, setSound, feel, weather, instant,
    firstRun, setFirstRun, minimap, setMinimap, setDotOpen, dotOpen, saving, setSaving, noticesOpen, setNoticesOpen,
    viewTick, fit, setPicked, setPickedObject, pickedObjectRef, pickedRef, shapeNote, queue, indexed, infoRef,
    shelfRef, turnRef, needs, enqueue, run, toggleWeather, brushTool, brush, brushRef, brushToolRef, setBrush,
    pendingTerrain, strokeMismatches, localUndo, localRedo, painter, undo, redo, pickTop, putDown, pickBrush,
    pickShelf, applyFix, targetAt, targetSpot, setTargeted, ctx, startHere, sourceInfo, sourceGrab, objectUnder,
    objectTiles, grabObject, hoverSources, sourceMarkers, startHintRef, startWorkerApi, hintMs, startHintTag,
    pickedSources, removeSources, flashNote, shelfTile, shelfHover, dropShelf, pageTileFacts, deleteCalls,
    quakeUiRef, setQuakeUi, watch, setWatch, floorContext, forcer, unleash, unleashRow, strokeRadius, forceSizing,
    fHeld, stepHabit, startForceSize, endForceSize, pickedRow, shelfRow, forceRow, glowCorners, onReady, openSelect,
    closeSelect, selectAll, selectCalls, selectChip, selectRow
  } = ed;

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
  // a size saved on a larger map: at most this map's largest (D322, item 42)
  useEffect(() => {
    const max = sizeMax(info.W, info.H);
    if (brushRef.current.size > max) setBrush({ ...brushRef.current, size: max }, false);
  }, [info.W, info.H]);
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
    return { x, y, check: checkStartAt(ctx(), x, y, door, bench, s.owner, needs) };
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
      reachCache.current = { version: info.version, check: startWorkerApi().check({ W: info.W, H: info.H, heights: m.heights, water: m.water, entities: m.entities, river: indexed?.river ?? null, x: s.x, y: s.y, door, bench, self: s.owner, needs }) };
    }
    const v = info.version;
    void reachCache.current.check.then((check) => {
      // (the same answer again changes nothing: the placed start keeps its colour until something about it changes, D361)
      if (infoRef.current.version === v && reachWanted.current) setStartReach((r) => (r && !r.fading && sameStartCheck(r.check, check) ? r : { check, fading: false }));
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
          renderer.current?.setGhost({ template: "StartingLocation", x: cx, y: cy, z: mirror.current.heights[p.y * W + p.x], orientation: ORIENTATION_NAMES.indexOf(s.orientation), ok: GHOST_OK[startStatus(p.check)] });
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
  const grabObjectRef = useRef(grabObject);
  grabObjectRef.current = grabObject;
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
      // (F held: the wheel sets the strength, D368 (11), even while a painted Lift is drawn)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "f") fHeld.current = true;
      // a force at work (D199, D202, D203, D206): Ctrl+Z (or Z) takes all of it back at any moment;
      // Esc cancels a painted Lift still being drawn, and skips a playing force to its end, kept as one
      // step (D344, A4; amends D341 (2)); Space holds a carve, V flips a painted Lift's side as it goes;
      // the other tools wait. In Slow forces (D321, item 29) a key of a new gesture jumps it to its end too
      const c = forcer.current;
      if (c?.running) {
        const watching = c.status!.speed === "watch" && !c.status!.painting;
        if (!ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === "z") {
          ev.preventDefault();
          c.cancel();
          return;
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          // (a painted Lift cancelled: its stroke goes too)
          if (c.escape() === "cancelled") forceEscRef.current?.();
          return;
        }
        if (ev.key === " ") {
          ev.preventDefault();
          c.pause(!c.status!.paused);
          return;
        }
        if (!mod && ev.key.toLowerCase() === "v" && toolRef.current === "quake") {
          flipRef.current?.();
          return;
        }
        // (a new gesture's key in Slow forces: the force jumps to its final land first)
        if (watching && !mod && (/^[0-9-]$/.test(ev.key) || ev.key.toLowerCase() === "m")) {
          void c.jump();
          return;
        }
        if (mod || /^[0-9]$/.test(ev.key) || ["m", "x", "z", "c", "v", "r", "f", "delete", "backspace", "arrowup", "arrowdown"].includes(ev.key.toLowerCase())) return;
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
      // the brushes: 1–5 pick one (again: it stays out), { and } size it, Esc cancels a stroke,
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
      // 7, 8, 9, 0, -: Carve, Craterize, Quake, Erupt, Glaciate (again: put it away)
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
      // one key habit for every tool (D368 (1), swapping D344 A1's): { and } step the Size, [ and ] the
      // strength (a force's Power; Smooth and Naturalize's strength; nothing on Raise, Lower and Flatten,
      // whose target level is theirs), each beside the pointer; a force's Size set so is off Auto
      const habit = !mod && !ev.altKey ? keyHabit(ev.key) : null;
      if (habit && stepHabit(habit)) {
        ev.preventDefault();
        return;
      }
      // F: hold and move the mouse to size the brush, a click sets it (D205); held, the wheel sets the
      // strength (D368 (11))
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "f") {
        ev.preventDefault();
        if (!ev.repeat && brushToolRef.current) painter.current?.startResize();
        else if (!ev.repeat) startForceSize();
        return;
      }
      if (ev.key === "Escape" && painter.current?.sizing) {
        painter.current.endResize(false);
        return;
      }
      if (ev.key === "Escape" && forceSizing.current) {
        endForceSize(false);
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
      // (with Quake picked, V flips the side of the fault that moves; X was its key before D323 item 16)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "v" && toolRef.current === "quake") {
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
      // Esc: a target set by hand follows the ground again (D322), then the brush goes
      if (ev.key === "Escape" && brushToolRef.current && brushRef.current.target !== null) {
        setBrush({ ...brushRef.current, target: null }, false);
        return;
      }
      if (ev.key === "Escape" && brushToolRef.current) {
        pickBrush(null);
        return;
      }
      // Z undoes and C redoes; X closes the selection as Esc does (D323 item 16); Ctrl+Z, Ctrl+Y and
      // Ctrl+Shift+Z keep working too. (Fields ignore all of them, above.)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        void undo();
        return;
      }
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "c") {
        ev.preventDefault();
        void redo();
        return;
      }
      // X puts down whatever is held (D345, B7): a brush, a force, the shelf's object, Select (and its
      // selection), a picked source or object: a plain pointer is left
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "x" && (brushToolRef.current || toolRef.current || shelfRef.current || selectingRef.current || selection.current.count || pickedRef.current || pickedObjectRef.current)) {
        ev.preventDefault();
        putDown();
        return;
      }
      // Up and Down with a selection open: raise or lower it one level, as the buttons do (D323 item 6)
      if (!mod && !ev.altKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown") && selection.current.count && !painter.current?.painting && !brushToolRef.current && !toolRef.current) {
        ev.preventDefault();
        selectCalls.current.action(ev.key === "ArrowUp" ? "raise" : "lower");
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
        setPickedObject(null);
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && selection.current.count && !painter.current?.painting) {
        // Select and Delete (D288): everything inside the selection, the start aside, one step
        ev.preventDefault();
        deleteCalls.current.deleteSelection();
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && pickedObjectRef.current && !pickedRef.current) {
        // an object picked with the plain pointer (D345, B7)
        ev.preventDefault();
        const o = pickedObjectRef.current;
        setPickedObject(null);
        void run(() => api.applyAll([{ op: "deleteEntities", params: { entities: [o.id] } }], "Remove an object"));
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
        // what the pointer is on (D288, D323 item 1): an object goes, one step; on bare ground, its
        // top level
        const hit = renderer.current.hoverHit;
        ev.preventDefault();
        deleteCalls.current.deleteHere([hit.y * infoRef.current.W + hit.x]);
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
      if (ev.key.toLowerCase() === "f") {
        fHeld.current = false;
        painter.current?.endResize(true);
        endForceSize(true);
      }
    };
    // the window loses focus (a screenshot tool, Alt+Tab): the keyup never comes, so F's size is set here
    // (the renderer lets go of the camera keys and ends a stroke in progress; D361, item 5)
    const onBlur = () => onKeyUp({ key: "f" } as KeyboardEvent);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
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
      edit: (op, label) => run(() => api.apply(op, "user", label)),
      startCheck: () => startDragRef.current?.check ?? null,
      worker: api,
      strokeMismatches: () => strokeMismatches.current,
      lastStroke: () => localUndo.current.at(-1)?.params ?? null,
      pendingTerrain: () => pendingTerrain.current,
      carve: () => (forcer.current?.status?.verb === "carve" ? { ...forcer.current.status } : null),
      force: () => (forcer.current?.status ? { ...forcer.current.status } : null),
      forceTiming: () => (forcer.current?.timing ? { ...forcer.current.timing } : null),
      startHint: () => (startHintRef.current ? { x: startHintRef.current.x, y: startHintRef.current.y, strong: startHintRef.current.strong, ms: hintMs.current } : null),
      sound: () => juice.current?.status() ?? null,
      sourceGlow: () => glowCorners.current.slice(),
      selection: () => selection.current.tiles(),
      gesture: () => {
        const g = gestureRef.current;
        return { stroke: g.forceStroke ? g.forceStroke.length : null, band: g.forceStroke ? strokeRadius.current : null, cursor: g.forceCursor, side: quakeUiRef.current.side, ring: g.forceRing ? g.forceRing.r : null };
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

  // D213: removing the map's last badwater spring makes it a No badwater map, said in a quiet line
  const notices = [...(info.badwaterRemoved ? [NO_BADWATER_LINE] : []), ...info.notices, ...(info.importReport?.changes.filter((c) => c.level === "warning").map((c) => c.message) ?? [])];
  const flags = info.importReport?.flags ?? [];
  const importChanges = info.importReport?.changes.length ?? 0;

  Object.assign(ed, { toolRef, grabObjectRef, startCalls, fitRef });
  return (
    <ForceFloor.Provider value={floorContext}>
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
        onClearEverything={() => void run(() => api.clearEverything(), (u) => u.ok && flashNote("Cleared: undo brings it all back"))}
        historyOpen={showHistory}
        onHistory={() => setShowHistory(!showHistory)}
        onBack={() => props.onBack(info)}
        look={<LookMenu renderer={renderer.current} buttonClass="ghost" />}
      />
      <div class="editor-main">
        <Shelf picked={shelf?.id ?? null} onPick={pickShelf} onDragStart={pickShelf} onDrop={dropShelf} icon={(t) => icons[t] ?? null} loading={!ready || !!forcer.current?.running} />
        <section class="editor-map" aria-label="Map">
          <div class="editor-map-area">
            <View3D
              view={view}
              class="editor-view"
              label={`3D view of ${info.name}. Drag to turn, right-drag to move, wheel to zoom.`}
              onReady={onReady}
              markersWanted={shelf?.id === "Slope"}
              togglesInButtons
              lookMenu={false}
              besideHeight={
                // a view switch (D248): what shows, never how a brush works; whatever tool is picked
                <button type="button" aria-pressed={brush.levelLines} onClick={() => setBrush({ ...brushRef.current, levelLines: !brushRef.current.levelLines })} title="A line at every level">
                  Level lines
                </button>
              }
              showLegend={layer !== "none"}
              viewButtons={
                <>
                  <button type="button" aria-pressed={clearWater} onClick={() => setClearWater(!clearWater)} {...tip("See through the water", "T")}>
                    Clear water
                  </button>
                  {(["badwater", ...(waterLayers?.roofed.length ? (["roofed"] as const) : [])] as LayerKind[]).map((k) => (
                    <button type="button" key={k} aria-pressed={layer === k} onClick={() => setLayer(layer === k ? "none" : k)} title={`Show ${LAYER_NAMES[k].toLowerCase()}`}>
                      {OVERLAY_WORDS[k]}
                    </button>
                  ))}
                  <button type="button" aria-pressed={minimap} onClick={() => setMinimap(!minimap)} title="A small picture of the map">
                    Minimap
                  </button>
                </>
              }
              cornerLevel={<LayerWidget level={sliceLevel} onStep={(dir) => renderer.current?.stepSlice(dir)} onReset={() => renderer.current?.setSlice(null)} />}
              cornerBelow={
                <>
                  <button type="button" aria-pressed={watch} onClick={() => setWatch(!watch)} title="Play forces out slowly">
                    Slow forces
                  </button>
                  <span class="reveal-group">
                    {/* (the volume opens beneath the speaker, so the cluster stays as it is) */}
                    <label class="slider-field reveal" title="Volume">
                      <input type="range" min="0" max="1" step="0.02" aria-label="Sound volume" value={sound.volume} disabled={!sound.on} onInput={(e) => setSound({ ...sound, volume: Number((e.target as HTMLInputElement).value) })} />
                    </label>
                    <button type="button" class="icon-button speaker" aria-label="Sound" aria-pressed={sound.on} onClick={() => setSound({ ...sound, on: !sound.on })} title={sound.on ? "Mute sounds" : "Turn sounds on"}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                        {sound.on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M3 3l18 18" class="crossed" />}
                      </svg>
                    </button>
                  </span>
                </>
              }

              onHover={(hit: TileHit | null) => {
                setHover(hit ? tileWords(describeTileFacts(pageTileFacts(), hit.x, hit.y)) : null);
                hoverSources(hit);
                // the source the pointer targets, whatever tool is picked (D249)
                const t = hit ? targetAt(hit.x, hit.y) : null;
                targetSpot.current = t;
                setTargeted(t ? t.k : null);
                // a source, and the start, can be picked up and moved
                const canvas = renderer.current?.canvas;
                const free = hit && !brushToolRef.current && !shelfRef.current && !toolRef.current && !selectingRef.current;
                const onStart = !!hit && !!startHere && Math.max(Math.abs(hit.x - startHere.x), Math.abs(hit.y - startHere.y)) <= 1;
                // the object it would pick, shown before the click (D360 a)
                const pick = hit && free && !t && !onStart && !selection.current.count ? objectUnder(hit.x, hit.y) : undefined;
                const tilesUnder = pick === undefined ? null : objectTiles(pick);
                setHoverObject((cur) => (cur === tilesUnder || (cur && tilesUnder && cur.length === tilesUnder.length && cur[0] === tilesUnder[0]) ? cur : tilesUnder));
                if (canvas) canvas.style.cursor = free && (t || onStart || pick !== undefined) ? "grab" : "";
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
                sizeMax={sizeMax(info.W, info.H)}
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
          </div>
          {/* the notices: a strip under the map, never over it, so they cover no control in any
              layout (a force's rows, the view buttons, the water bar), and what is above stays put */}
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
    </ForceFloor.Provider>
  );
}
