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

import type { Remote } from "comlink";
import { useEffect, useRef } from "preact/hooks";
import { canSaveToTimberborn } from "../platform";
import type { TileHit } from "../render3d";
import { View3D } from "../ui/View3D";
import { LookMenu } from "../ui/LookMenu";
import type { GeneratorApi } from "../worker/generator.worker";
import type { SessionInfo, SessionOpen } from "../worker/session";
import { describeTile as describeTileFacts, tileWords } from "../core/doc/describeTile";
import { HistoryPanel, LayerLegend, LAYER_NAMES, StartIndicators, type LayerKind } from "./panels";
import { ChecksDot, Header } from "./Header";
import { Shelf } from "./Shelf";
import { FirstRun, saveFirstRun, type FirstStep } from "./FirstRun";
import { LayerWidget } from "./LayerWidget";
import { Minimap } from "./Minimap";
import { ForceFloor, TopBar } from "./TopBar";
import { WaterBar } from "./WaterBar";
import { sizeMax } from "./brushes";
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
import { useViewSync } from "./view/useViewSync";
import { useStart } from "./start/useStart";
import { useKeyboard } from "./keyboard/useKeyboard";
import { useTestHook } from "./testHook/useTestHook";
import { useSave } from "./save/useSave";

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
  Object.assign(ed, useViewSync(ed));
  Object.assign(ed, useStart(ed));
  useKeyboard(ed, props);
  Object.assign(ed, useTestHook(ed));
  Object.assign(ed, useSave(ed));

  const {
    api, info, view, mirror, renderer, ready, tool, shelf, icons, startDrag, busy, message, setMessage, setHover,
    hover, showHistory, setShowHistory, check, progress, layer, setLayer, waterLayers, waterTick, flowing,
    clearWater, setClearWater, sliceLevel, selecting, selectingRef, selection, setHoverObject, player, sound,
    setSound, weather, instant, firstRun, setFirstRun, minimap, setMinimap, dotOpen, setDotOpen, saving, noticesOpen,
    setNoticesOpen, viewTick, shapeNote, shelfRef, needs, run, toggleWeather, brushTool, brush, brushRef,
    brushToolRef, setBrush, localUndo, localRedo, undo, redo, pickTop, pickShelf, targetAt, targetSpot, setTargeted,
    startHere, objectUnder, objectTiles, hoverSources, sourceMarkers, startHintTag, flashNote, dropShelf,
    pageTileFacts, watch, setWatch, floorContext, forcer, unleashRow, pickedRow, shelfRow, forceRow, onReady,
    openSelect, closeSelect, selectChip, selectRow, toolRef, actions, startReach, hoverStart, exportProject, saveMap,
    notices, flags, importChanges
  } = ed;

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
