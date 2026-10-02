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

import { proxy, transfer, type Remote } from "comlink";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { EditOp } from "../core/doc/ops";
import { cornerFor } from "../core/doc/tools";
import { footprintTiles, startEntranceTile, type Orientation } from "../core/format/footprints";
import { groundUnderObjects } from "../core/features/raster/objectGround";
import type { Point } from "../core/features/schema";
import { canSaveToTimberborn, saveFile, saveToTimberborn } from "../platform";
import { FLIPPED, ORIENTATION_NAMES, surfaceWater } from "../render3d/model";
import type { MapRenderer, PointerTool, TileHit, ViewState } from "../render3d";
import { View3D } from "../ui/View3D";
import { LookMenu } from "../ui/LookMenu";
import type { GeneratorApi } from "../worker/generator.worker";
import type { CheckProgress, EntityInfo, SessionInfo, SessionOpen } from "../worker/session";
import { describeTile as describeTileFacts, tileWords } from "../core/doc/describeTile";
import { checkStartAt, newId, sameStartCheck, sourceStrengths, sourceStrengthWords, startStatus, type StartCheck, type StartStatus } from "./features";
import { HistoryPanel, LayerLegend, LAYER_NAMES, plain, StartIndicators, SourceReadout, StrengthSlider, whereOf, type ItemActions, type LayerKind } from "./panels";
import { ChecksDot, Header } from "./Header";
import { Shelf } from "./Shelf";
import { SHELF, type ShelfOptions } from "./shelfItems";
import { Juice, type StrokeSound } from "./juice";
import { powerWord } from "./forceDriver";
import { CarveRow, carveSettingsOf } from "./CarveRow";
import { craterSettingsOf, CraterizeRow, EruptRow, eruptSettingsOf, ForceAtWork, QuakeRow, quakeSettingsOf } from "./ForceRows";
import { GlaciateRow } from "./ForceRows";
import type { GlaciateSettings } from "../core/forces/glaciate/model";
import type { Verb } from "../core/forces/op";
import { FirstRun, saveFirstRun, type FirstStep } from "./FirstRun";
import { LayerWidget } from "./LayerWidget";
import { Minimap } from "./Minimap";
import { FORCES, ForceFloor, forceShown, TopBar } from "./TopBar";
import { deleteGroupOf, DELETE_GROUPS, DELETE_KINDS, depthLevels, SELECT_MODES, selectTool, sizeWords, type DeleteGroup } from "./select";
import { ModeIcon, WholeMapIcon } from "./SelectIcons";
import { WaterBar } from "./WaterBar";
import { keyHabit } from "./forceSize";
import { BRUSHES, BRUSH_NAMES, BrushPainter, hasTarget, sizeMax, targetWords } from "./brushes";
import { tilesToRuns } from "../core/math/grid";
import { isSource, sourcesPressed } from "./sourceSpots";
import { BRUSH_MAX_LEVEL, type BrushParams } from "../core/features/raster/brush";
import { BAD, BADWATER_STRENGTHS, GHOST_OK, LOWERS, MOVING, RAISES, SOURCE_STRENGTHS, sourceRequest } from "./tools";
import { tip } from "../ui/Tooltip";
import { ALL_KINDS } from "./remove/kinds";
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
  pickTile: (x: number, y: number) => void;
  reglow: () => void;
  closeSelect: () => void;
  workingArea: () => [number, number, number][] | null;
  checkDepthRef: { current: () => void };
  toolRef: { current: Verb | null };
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

  const {
    api, info, setInfo, view, mirror, renderer, setReady, ready, tool, setTool, flipRef, forceEscRef, gestureRef,
    options, setOptions, shelf, shelfOptions, setShelfOptions, setTurn, icons, setStartDrag, startDrag, busy,
    setMessage, message, setHover, hover, showHistory, setShowHistory, check, progress, layer, setLayer, waterLayers,
    waterTick, flowing, setMarkersOn, clearWater, setClearWater, setSliceLevel, sliceLevel, setSelecting, selecting,
    selectingRef, selection, setSelectionTick, selectionTick, setSelectDraw, setSelectPreview, deleteMenu,
    setDeleteMenu, setDeleteCounts, deleteCounts, setHoverObject, player, sound, juice, setSound, feel, weather,
    weatherRef, instant, firstRun, setFirstRun, firstDoneRef, minimap, setMinimap, minimapRef, setDotOpen, dotOpen,
    saving, setSaving, noticesOpen, setNoticesOpen, setViewTick, viewTick, fit, setPicked, picked, pickedObject,
    setPickedObject, pickedObjectRef, pickedRef, setShapeNote, shapeNote, queue, indexed, infoRef, shelfRef, turnRef,
    optionsRef, needs, enqueue, run, toggleWeather, brushTool, brush, brushRef, brushToolRef, setBrush, terrain,
    pendingTerrain, strokeMismatches, localUndo, localRedo, painter, sendTerrain, undo, redo, pickTop, putDown,
    pickBrush, pickShelf, applyFix, spots, targetAt, targetSpot, setTargeted, ctx, startHere, pointerAt, notePointer,
    sourceInfo, sourceGrab, grabSource, objectUnder, objectTiles, grabObject, strengthOfEntity, liveStrength,
    entityIndexOf, wheelSource, groupsRef, hoverSources, pointedWords, markerRef, sourceMarkers, setStartHint,
    hintRef, startHintRef, hintJob, startWorkerApi, hintMs, lookForStartRef, startHintTag, pickedSources,
    removeSources, pointerWords, flashNote, shelfTile, shelfHover, dropShelf, pageTileFacts, coverAt, deleteOn,
    deleteGround, deleteCalls, carveUi, setCarveUi, craterUi, setCraterUi, eruptUi, setEruptUi, quakeUi, quakeUiRef,
    setQuakeUi, glaciateUi, setGlaciateUi, moreOpen, setMoreOpen, watch, setWatch, floorContext, forcer, lastUnleash,
    unleashPower, setUnleashPower, unleash, unleashAgain, unleashDown, unleashRow, strokeRadius, forceAgain,
    forceSizing, fHeld, stepHabit, wheelHabit, startForceSize, endForceSize
  } = ed;

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
    // its water answers each step, and one adjustment is one undo step; its label and row show it at once (D368 (4))
    const op: EditOp = { op: "setEntityProps", params: { id: e.id, components: { WaterSource: { SpecifiedStrength: v, CurrentStrength: v } } } };
    const name = e.template === "BadwaterSource" ? "Badwater source" : "Water source";
    liveStrength(e, v);
    void run(
      () => api.applyStep(op, `${name}: ${v} water/s`, `strength:${e.id}`),
      (u) => {
        if (u.ok) pickTile(at[0], at[1]);
      },
    ).finally(() => liveStrength(e, null));
  }
  /** A picked source's strength: the one number its label shows too (D361 (6), D368 (4)), never the record's. */
  function pickedStrength(e: EntityInfo): number {
    const k = entityIndexOf(e);
    return k >= 0 ? strengthOfEntity(k) : Number((e.components.WaterSource as { SpecifiedStrength?: number } | undefined)?.SpecifiedStrength ?? 1);
  }
  /** A picked source's strength in words, as its marker's label says it (D361, item 6). */
  function pickedWords(e: EntityInfo): string {
    const k = entityIndexOf(e);
    const s = k >= 0 ? sourceStrengths(groupsRef.current, strengthOfEntity, k) : null;
    return s ? sourceStrengthWords(s) : `${pickedStrength(e)} ${e.template === "BadwaterSource" ? "badwater" : "water"}/s`;
  }
  /** The row beneath the top bar for a picked source: its strength, its water, Remove. */
  function pickedRow(): { label: string; content: ComponentChildren } | null {
    if (pickedObject && !picked) {
      const o = pickedObject;
      const name = o.template === "UndergroundRuins" ? "Mine site" : o.template.replace(/([a-z])([A-Z])/g, "$1 $2");
      return {
        label: `${name}, selected`,
        content: (
          <>
            <span class="bar-status">Drag it to move it</span>
            <button
              type="button"
              {...tip("Delete it", "Delete")}
              onClick={() => {
                setPickedObject(null);
                void run(() => api.applyAll([{ op: "deleteEntities", params: { entities: [o.id] } }], `Remove ${name.toLowerCase()}`));
              }}
            >
              Delete
            </button>
            <button type="button" class="linkish" aria-label="Put it down" {...tip("Put it down", "X", "Esc")} onClick={() => setPickedObject(null)}>
              ×
            </button>
          </>
        ),
      };
    }
    const e = picked?.list[0];
    if (!e) return null;
    const bad = e.template === "BadwaterSource";
    const steps = bad ? BADWATER_STRENGTHS : SOURCE_STRENGTHS;
    const strength = pickedStrength(e);
    return {
      label: `${bad ? "Badwater" : "Water"} source, selected`,
      content: (
        <>
          <label {...tip("Water a second", "Ctrl+scroll over it")}>
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
          <SourceReadout label="This source" words={pickedWords(e)} />
          <label title="Clean water or badwater">
            Water
            <select aria-label="Water" value={bad ? "bad" : "clean"} onChange={(ev) => changeSource(e, { kind: (ev.target as HTMLSelectElement).value as "clean" | "bad" })}>
              <option value="clean">Clean</option>
              <option value="bad">Badwater</option>
            </select>
          </label>
          <button type="button" {...tip("Remove this source", "Delete")} onClick={() => removeSources(picked!.list)}>
            Remove
          </button>
          <span class="bar-divider" aria-hidden="true" />
          <button
            type="button"
            class="unleash-button"
            {...tip("Carve a river from it", "U")}
            onPointerDown={(ev) => unleashDown(ev as unknown as PointerEvent, e)}
            onClick={() => unleash(e)}
          >
            Unleash
          </button>
          <label class="slider-field" title="How hard its river cuts">
            Power
            <input type="range" min={0} max={100} step={5} aria-label="Unleash power" aria-valuetext={`${unleashPower}, ${powerWord(unleashPower)}`} value={unleashPower} onInput={(ev) => setUnleashPower(Number((ev.target as HTMLInputElement).value))} />
            <output>{powerWord(unleashPower)}</output>
          </label>
          {info.forceAgain === "carve" && lastUnleash.current === e.id ? (
            <button type="button" onClick={() => unleashAgain(e)} title="Another course, same source">
              Try another
            </button>
          ) : null}
          <button type="button" class="linkish" aria-label="Put it down" {...tip("Put it down", "X", "Esc")} onClick={() => setPicked(null)}>
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
      // the strength of the next one (over a placed source, Ctrl+scroll sets its own, D322)
      return {
        label: `${shelf.name} options`,
        content: (
          <>
            <StrengthSlider label="Next source" value={value} steps={steps} onChange={(v) => setOptions({ ...optionsRef.current, ...(bad ? { badwaterStrength: v } : { sourceStrength: v }) })} />
            {pointedWords ? <SourceReadout label="Pointing at" words={pointedWords} /> : null}
          </>
        ),
      };
    }
    if (shelf.id === "ruin")
      return {
        label: "Ruin options",
        content: (
          <label title="How tall the ruin is">
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
          <label title="How big the relic is">
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
    const more = moreOpen[tool as Verb] ?? false;
    const onMore = (open: boolean) => setMoreOpen((m) => ({ ...m, [tool as Verb]: open }));
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
          more={more}
          onMore={onMore}
          drawn={forcer.current?.lastSettings.carve as ReturnType<typeof carveSettingsOf> | undefined ?? null}
        />
      );
    if (st) return <ForceAtWork force={force} status={st} onRevert={() => forcer.current?.cancel()} />;
    const again = () => void forceAgain();
    if (tool === "craterize") return <CraterizeRow force={force} ui={craterUi} onUi={setCraterUi} canAgain={canAgain} onAgain={again} more={more} onMore={onMore} drawn={(forcer.current?.lastSettings.craterize as ReturnType<typeof craterSettingsOf> | undefined) ?? null} />;
    if (tool === "erupt") return <EruptRow force={force} ui={eruptUi} onUi={setEruptUi} canAgain={canAgain} onAgain={again} more={more} onMore={onMore} drawn={(forcer.current?.lastSettings.erupt as ReturnType<typeof eruptSettingsOf> | undefined) ?? null} />;
    if (tool === "glaciate") return <GlaciateRow force={force} ui={glaciateUi} onUi={setGlaciateUi} canAgain={canAgain} onAgain={again} more={more} onMore={onMore} drawn={(forcer.current?.lastSettings.glaciate as GlaciateSettings | undefined) ?? null} />;
    return <QuakeRow force={force} ui={quakeUi} onUi={setQuakeUi} canAgain={canAgain} onAgain={again} more={more} onMore={onMore} drawn={(forcer.current?.lastSettings.quake as ReturnType<typeof quakeSettingsOf> | undefined) ?? null} />;
  }

  /** Sources: Clear (D249, D322): the sources under the ring glow red before the stroke reaches them,
   *  and those it has passed over stay red until it is let go. */
  const clearing = useRef<{ of: readonly number[]; dabs: number; taken: Set<number> } | null>(null);
  const glowing = useRef(false);
  const glowAt = useRef<[number, number] | null>(null);
  const glowCorners = useRef<number[]>([]);
  function clearGlow(at: [number, number] | null, stroke: { settings: Omit<BrushParams, "dabs">; dabs: readonly number[] } | null) {
    const r = renderer.current;
    if (!r) return;
    glowAt.current = stroke ? null : at;
    const b = brushRef.current;
    const bt = brushToolRef.current;
    if (!bt || b.sources[bt] !== "clear" || !at) {
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
    // (a target's brush presses with hard edges, D322)
    const shape = stroke ? stroke.settings : { size: b.size, ...(b.square ? { shape: "square" as const } : {}), ...(hasTarget(bt) && b.target !== "free" ? { target: 0 } : {}) };
    const q = (v: number, n: number) => Math.max(0, Math.min(4 * n - 1, Math.round(v * 4)));
    for (const sp of sourcesPressed(list, shape, [q(at[0], W), q(at[1], H)], W)) if (inArea(sp.tiles)) glow.add(sp.corner);
    glowCorners.current = [...glow];
    if (!glow.size && !glowing.current) return;
    r.highlightObjects(glow.size ? [...glow] : null);
    glowing.current = glow.size > 0;
  }
  /** The brush out clears the sources it passes over (Sources: Clear, D322). */
  const clears = () => !!brushToolRef.current && brushRef.current.sources[brushToolRef.current] === "clear";
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
        // Sources: Clear (D249, D322): the sources the brush pressed on go with the stroke, one step
        const clear = clears() ? sourcesPressed(spots(), stroke.params, stroke.params.dabs, infoRef.current.W).filter((c) => inArea(c.tiles)) : [];
        endClearGlow();
        const op: EditOp = { op: "brush", params: stroke.params };
        const done = sendTerrain(() => (clear.length ? api.strokeClearing(op, stroke.label, clear.flatMap((c) => c.tiles)) : api.apply(op, "user", stroke.label)));
        if (clear.length) void done.then(() => feel("remove", clear[0].x, clear[0].y));
        // a Flatten stroke: where its level ground could take the start, once it is on the map
        if (stroke.params.tool === "flatten") void done.then(() => lookForStartRef.current(stroke.params));
      },
      // a stroke that changed no ground still takes the sources it pressed with Clear sources on
      // (item 15: a Flatten at the ground's own level or a Smooth over flat land left them), one step
      unchanged: (params) => {
        const clear = clears() ? sourcesPressed(spots(), params, params.dabs, infoRef.current.W).filter((c) => inArea(c.tiles)) : [];
        endClearGlow();
        if (!clear.length) return;
        firstDoneRef.current("paint");
        void run(
          () => api.strokeClearing({ op: "brush", params }, BRUSH_NAMES[params.tool], clear.flatMap((c) => c.tiles)),
          (u) => u.ok && feel("remove", clear[0].x, clear[0].y),
        );
      },
      // Ctrl+click: the land's level is the target (D322), until the tool changes or Esc
      picked: (level) => {
        setBrush({ ...brushRef.current, target: level }, false);
        const t = brushToolRef.current;
        if (t && hasTarget(t)) flashNote(targetWords(t, level));
      },
      footprints: () => objectFootprints(),
      // sources ride a stroke's ground (D249): a 3 × 3 one whole and level (with Keep they stay, with
      // Clear they go, D322)
      rides: () => (brushToolRef.current && brushRef.current.sources[brushToolRef.current] === "ride" ? spots().filter((c) => c.tiles.length > 1 && inArea(c.tiles)).map((c) => c.rect) : []),
      // Keep (D322): every source's own tiles
      sourceGround: () => tilesToRuns([...new Set(spots().flatMap((c) => c.tiles))].sort((a, b) => a - b), infoRef.current.W),
      // Naturalize leaves the ground under every source and object as it is (D368 (8))
      objectGround: () => {
        const e = mirror.current.entities;
        const list = [];
        for (let k = 0; k < e.count; k++) list.push({ template: e.templates[e.template[k]], x: e.x[k], y: e.y[k], orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 });
        return groundUnderObjects(list);
      },
      maxSize: () => sizeMax(infoRef.current.W, infoRef.current.H),
      // a mode's water (D322): the map's own, never a drought's or a badtide's shown now
      water: () => (weatherRef.current ? surfaceWater(infoRef.current.W, infoRef.current.H, mirror.current.mapWater).surface : (mirror.current.water?.surface ?? null)),
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
      // Shift+scroll: the target (D322), shown beside the pointer as it always is
      target: (value) => setBrush({ ...brushRef.current, target: value }, false),
      feel: (kind, x, y, size, soft) => {
        feel(kind, x, y, size, soft);
        // the stroke's own texture while it paints (Flatten, Smooth and Naturalize each have theirs)
        const b = brushToolRef.current;
        const sound: StrokeSound = kind === "raise" || kind === "lower" ? kind : b === "smooth" ? "smooth" : b === "naturalize" ? "naturalize" : "flatten";
        juice.current?.strokeSound(sound, x, y, size, Math.min(1, brushRef.current.strength / 10));
      },
      // F held: the size follows the pointer, beside it while F is held, saved once it is set (D205,
      // D322)
      resize: (size, ev, done) => {
        setBrush({ ...brushRef.current, size }, done);
        if (ev) notePointer(ev);
        pointerWords.current!.sizing(done ? null : `size ${size}`);
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
        if (ev) notePointer(ev);
        pointerWords.current!.brush(text);
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
    r.grab = (hit, ev) => grabSource(hit, ev) ?? startCalls.current.grabStart(hit) ?? grabObjectRef.current(hit);
    r.onWheel = (ev, hit) => wheelHabit(ev) || wheelSource(ev, hit);
    // a click with no tool out: a water or badwater source is picked, its strength and its water to
    // change (the water answers live); anything else puts it down
    r.onClick = (hit) => {
      const t = hit ? targetAt(hit.x, hit.y) : null;
      if (t) return pickTile(t.x, t.y);
      setPicked(null);
      setPickedObject(null);
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
      changed: () => {
        setFlattenTo(null);
        setSelectionTick((n) => n + 1);
      },
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
      // Ctrl+click on the land: the Level number (as Flatten's sampling)
      sample: (level: number) => {
        setFlattenTo(level);
        flashNote(`level ${level}`);
      },
      // Shift+scroll: the Level number a step at a time (as for the brushes' target, D345 B8)
      dial: (step: 1 | -1, ev: WheelEvent) => {
        const now = flattenRef.current ?? selectLowest();
        const level = Math.max(0, Math.min(BRUSH_MAX_LEVEL, now + step));
        setFlattenTo(level);
        notePointer(ev);
        flashNote(`level ${level}`);
      },
    };
  }
  // Up and Down raise and lower an open selection, so the camera leaves them alone then (D323 item 6)
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.claimKey = (ev) => (ev.key === "ArrowUp" || ev.key === "ArrowDown") && selection.current.count > 0 && !brushToolRef.current && !toolRef.current;
    return () => {
      if (r.claimKey) r.claimKey = null;
    };
  }, [ready]);
  // the Delete menu closes on a click anywhere else
  useEffect(() => {
    if (!deleteMenu) return;
    const off = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".select-menu, [aria-haspopup='menu']")) setDeleteMenu(false);
    };
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [deleteMenu]);
  // while the menu is open, the core says what stands in the selection (D345, B5)
  useEffect(() => {
    if (!deleteMenu) return setDeleteCounts(null);
    let live = true;
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    void api.objectsInArea(tiles).then((r) => live && setDeleteCounts(r));
    return () => {
      live = false;
    };
  }, [deleteMenu, selectionTick, info.version]);
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
    setDeleteMenu(false);
    setSelectPreview(null);
    setFlattenTo(null);
    selection.current.clear();
    setSelecting(null);
    setSelectDraw(null);
    setSelectionTick((n) => n + 1);
  }
  /** Ctrl+A (D264): the whole map, in the Select tool or with any brush out. */
  function selectAll() {
    const N = infoRef.current.W * infoRef.current.H;
    selection.current.apply(Array.from({ length: N }, (_, i) => i), "set");
    setFlattenTo(null);
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
  function selectAction(what: "raise" | "lower" | "flatten" | "cut" | "fill" | "depth", level?: number) {
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
      const amount = what === "raise" && cut !== null ? Math.min(1, cut - top) : 1;
      if (amount <= 0) return flashNote("Nothing can rise under the cut: show a layer more");
      ops = [{ op: "sculpt", params: { mode: what, cells: tilesToRuns(tiles, W), amount } }];
      label = `${what === "raise" ? "Raise" : "Lower"} ${count(tiles.length)} tiles by ${amount}`;
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
      label = what === "cut" ? `Cut ${count(tiles.length)} tiles down to level ${L}` : what === "fill" ? `Fill ${count(tiles.length)} tiles up to level ${L}` : `Flatten ${count(tiles.length)} tiles to level ${L}`;
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
    const lowers = what === "lower" || what === "cut";
    setSelectPreview(null);
    void run(
      () => api.applySelection(ops, label, tiles),
      (u) => u.ok && feel(what === "raise" || what === "fill" ? "raise" : lowers ? "lower" : "shape", mid[0], mid[1], size),
    );
  }
  const selectCalls = useRef({ action: selectAction });
  selectCalls.current = { action: selectAction };
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
  /** The selection's lowest level (the level number starts there, D323 item 6). */
  function selectLowest(): number {
    const h = mirror.current.heights;
    let lo = Infinity;
    for (const i of selection.current.tiles()) lo = Math.min(lo, h[i]);
    return Number.isFinite(lo) ? lo : 0;
  }
  /** The level number: null until the player sets it (or Ctrl+clicks the land), then it starts at the
   *  selection's lowest again with each new selection. */
  const [flattenTo, setFlattenTo] = useState<number | null>(null);
  const flattenRef = useRef<number | null>(null);
  flattenRef.current = flattenTo;
  const [maxDepth, setMaxDepth] = useState(2);
  /** The deepest water in the selection (Max water depth's top). */
  function deepestIn(): number {
    const w = mirror.current.water;
    let d = 0;
    if (w) for (const i of selection.current.tiles()) if (w.depth[i] > d) d = w.depth[i];
    return Math.floor(d);
  }
  /** What hovering a Select action shows on the land inside the selection: the tiles it would change
   *  (D323 item 6), the same ones the action then changes. */
  function selectPreviewOf(what: "raise" | "lower" | "flatten" | "cut" | "fill", level: number): void {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    let tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    if (what === "raise") {
      let top = 0;
      for (const i of tiles) top = Math.max(top, h[i]);
      if (cut !== null && cut - top <= 0) tiles = [];
    }
    if (what === "lower") tiles = tiles.filter((i) => h[i] > 0);
    if (what === "cut") tiles = tiles.filter((i) => h[i] > level);
    if (what === "fill") tiles = tiles.filter((i) => h[i] < level);
    if (what === "flatten") tiles = tiles.filter((i) => h[i] !== level);
    setSelectPreview({ tiles, color: what === "raise" || what === "fill" ? RAISES : what === "flatten" ? MOVING : LOWERS });
  }
  /** The kinds of thing Delete can take in the selection, with how many of each stand there (the
   *  objects, not their tiles), and the ground (D323 item 1). */
  function deleteChoices(): { group: DeleteGroup | "ground"; name: string; count: number }[] {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    // (what stands there is the core's answer, the objects under water counted too: D345, B5)
    const counts = new Map<DeleteGroup, number>();
    for (const [template, n] of Object.entries(deleteCounts?.counts ?? {})) {
      const g = deleteGroupOf(template);
      if (g) counts.set(g, (counts.get(g) ?? 0) + n);
    }
    const out: { group: DeleteGroup | "ground"; name: string; count: number }[] = [];
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total) out.push({ group: "everything", name: "Everything", count: total });
    for (const [g, name] of DELETE_GROUPS) if (counts.get(g)) out.push({ group: g, name, count: counts.get(g)! });
    if (tiles.some((i) => h[i] > 0)) out.push({ group: "ground", name: "Ground (one level)", count: tiles.filter((i) => h[i] > 0).length });
    return out;
  }
  /** What a Delete menu choice does, in one line (D351). */
  function deleteTitle(group: DeleteGroup | "ground", name: string): string {
    if (group === "ground") return "Lower the ground one level";
    if (group === "everything") return "Delete every object here";
    if (group === "start") return "Delete the start";
    return `Delete the ${name.toLowerCase()}`;
  }
  /** Delete one kind of thing (or everything) in the selection, or its ground one level down. */
  function deleteChoice(group: DeleteGroup | "ground") {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    setDeleteMenu(false);
    setSelectPreview(null);
    if (!tiles.length) return;
    if (group === "ground") return deleteGround(tiles);
    deleteOn(tiles, false, group === "everything" ? ALL_KINDS : (DELETE_KINDS[group] ?? []), true);
  }
  /** The tiles the pointer's hover over a Delete menu choice would clear: the objects' footprints, or
   *  the ground tiles. */
  function deletePreview(group: DeleteGroup | "ground"): void {
    const h = mirror.current.heights;
    const cut = renderer.current?.slice ?? null;
    const tiles = selection.current.tiles().filter((i) => cut === null || h[i] <= cut);
    if (group === "ground") return setSelectPreview({ tiles: tiles.filter((i) => h[i] > 0), color: LOWERS });
    const e = mirror.current.entities;
    const at = coverAt();
    const out = new Set<number>();
    for (const i of tiles)
      for (const k of at.get(i) ?? []) {
        const g = deleteGroupOf(e.templates[e.template[k]]);
        if (g && (group === "everything" || g === group)) out.add(i);
      }
    setSelectPreview({ tiles: [...out], color: BAD });
  }
  /** With a brush or a force out, the Select row is a small chip (D259: one row at a time); a click
   *  on it opens the Select tool again. */
  function selectChip(): ComponentChildren {
    const z = selection.current.size();
    if (!z || (!brushTool && !tool)) return null;
    void selectionTick;
    return (
      <button type="button" class="select-chip" {...tip("Select an area", "M")} onClick={openSelect}>
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
    const level = Math.max(0, Math.min(BRUSH_MAX_LEVEL, flattenTo ?? selectLowest()));
    const deepest = z ? deepestIn() : 0;
    const depth = Math.max(1, Math.min(maxDepth, Math.max(1, deepest)));
    const way = (what: "raise" | "lower" | "flatten" | "cut" | "fill") => ({
      onMouseEnter: () => selectPreviewOf(what, level),
      onFocus: () => selectPreviewOf(what, level),
      onMouseLeave: () => setSelectPreview(null),
      onBlur: () => setSelectPreview(null),
    });
    const choices = deleteMenu && z ? deleteChoices() : [];
    return (
      <div class="bar-group">
        <span class="bar-status" role="status">
          {z ? sizeWords(z) : "Select: drag on the map (Shift adds, Alt takes away)"}
        </span>
        <span class="segmented" role="group" aria-label="How to select">
          {SELECT_MODES.map(([v, name, hint]) => (
            <button type="button" class="icon-button" key={v} aria-label={name} aria-pressed={(selecting ?? "rect") === v} title={`${name}: ${hint}`} onClick={() => setSelecting(v)}>
              <ModeIcon mode={v} />
            </button>
          ))}
          <button type="button" class="icon-button" aria-label="Whole map" {...tip("Select the whole map", "Ctrl+A")} onClick={selectAll}>
            <WholeMapIcon />
          </button>
        </span>
        {z ? (
          <>
            <button type="button" {...tip("Raise the selection one level", "Up")} {...way("raise")} onClick={() => selectAction("raise")}>
              Up 1
            </button>
            <button type="button" {...tip("Lower the selection one level", "Down")} {...way("lower")} onClick={() => selectAction("lower")}>
              Down 1
            </button>
            <label {...tip("The level", "Ctrl+click", "Shift+scroll")}>
              Level
              <input
                type="number"
                aria-label="Level"
                min={0}
                max={BRUSH_MAX_LEVEL}
                step={1}
                value={level}
                onInput={(e) => setFlattenTo(Math.max(0, Math.min(BRUSH_MAX_LEVEL, Math.round(Number((e.target as HTMLInputElement).value) || 0))))}
              />
            </label>
            <button type="button" title="Set the area to this level" {...way("flatten")} onClick={() => selectAction("flatten", level)}>
              Flatten
            </button>
            <button type="button" title="Cut the ground above this level" {...way("cut")} onClick={() => selectAction("cut", level)}>
              Cut down
            </button>
            <button type="button" title="Fill the ground below this level" {...way("fill")} onClick={() => selectAction("fill", level)}>
              Fill up
            </button>
            <span class="menu-wrap">
              <button type="button" aria-haspopup="menu" aria-expanded={deleteMenu} {...tip("Delete what stands here", "Delete")} onClick={() => setDeleteMenu(!deleteMenu)}>
                Delete
              </button>
              {deleteMenu ? (
                <ul class="menu select-menu" role="menu" aria-label="Delete">
                  {!deleteCounts ? (
                    <li role="none">
                      <span class="muted">Counting…</span>
                    </li>
                  ) : choices.length ? (
                    choices.map((c) => (
                      <li role="none" key={c.group}>
                        <button
                          type="button"
                          role="menuitem"
                          title={deleteTitle(c.group, c.name)}
                          onClick={() => deleteChoice(c.group)}
                          onMouseEnter={() => deletePreview(c.group)}
                          onFocus={() => deletePreview(c.group)}
                          onMouseLeave={() => setSelectPreview(null)}
                          onBlur={() => setSelectPreview(null)}
                        >
                          {c.group === "ground" ? c.name : `${c.name} (${c.count.toLocaleString("en-GB")})`}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li role="none">
                      <span class="muted">Nothing to delete here</span>
                    </li>
                  )}
                </ul>
              ) : null}
            </span>
            {deepest >= 1 ? (
              <>
                <label title="The deepest the water may be">
                  water
                  <input type="number" aria-label="Max water depth" min={1} max={deepest} step={1} value={depth} onInput={(e) => setMaxDepth(Math.max(1, Math.min(deepest, Math.round(Number((e.target as HTMLInputElement).value) || 1))))} />
                </label>
                <button type="button" title="Make the water no deeper than this" onClick={() => selectAction("depth", depth)}>
                  Max water depth
                </button>
              </>
            ) : null}
          </>
        ) : null}
        <button type="button" class="linkish" aria-label="Close the selection" {...tip("Close", "Esc", "X")} onClick={closeSelect}>
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

  Object.assign(ed, { pickTile, reglow, closeSelect, workingArea, checkDepthRef, toolRef, fitRef });
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
