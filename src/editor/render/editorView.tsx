// The editor's markup. The parts that are long are plain functions of the bag (header.tsx,
// topBar.tsx, viewControls.tsx), called inline here, so the vnode tree is one.

import { View3D } from "../../ui/View3D";
import { HistoryPanel, StartIndicators } from "../panels";
import { LEGEND_TEMPLATES } from "../shelfItems";
import { measureInsets } from "../view/insets";
import { Drawer } from "../Drawer";
import { Shelf } from "../Shelf";
import { ObjectWindow } from "../ObjectWindow";
import { LayerWidget } from "../LayerWidget";
import { Minimap } from "../Minimap";
import { ForceFloor } from "../TopBar";
import { WaterBar } from "../WaterBar";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";
import { DropTarget } from "./DropTarget";
import { header } from "./header";
import { topBar } from "./topBar";
import { cornerButtons, hoverHandler, levelLinesButton, viewButtons } from "./viewControls";

export function editorView(ed: Ed, props: EditorProps) {
  const {
    floorContext, busy, shelf, pickShelf, dropShelf, icons, ready, forcer, view, info, onReady, layer, sliceLevel,
    renderer, hover, player, weather, toggleWeather, sourceMarkers, startHintTag, mirror, waterTick, viewTick,
    shapeNote, startDrag, needs, startReach, message, setMessage, showHistory, setShowHistory, run, api
  } = ed;
  const drawerOpen = props.drawerOpen;

  return (
    <ForceFloor.Provider value={floorContext}>
    <div class={`editor${drawerOpen ? " drawer-open" : ""}`} aria-busy={busy > 0}>
      {header(ed, props)}
      <div class="editor-main">
        {drawerOpen ? <Drawer model={props.drawer} info={info} icon={(t) => icons[t] ?? null} /> : null}
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
              besideHeight={levelLinesButton(ed)}
              legendInCorner
              legendOpen={false}
              frameInsets={measureInsets}
              keepView={props.keepView}
              legendIcon={(label) => (LEGEND_TEMPLATES[label] ? (icons[LEGEND_TEMPLATES[label]] ?? null) : null)}
              viewButtons={viewButtons(ed)}
              cornerLevel={<LayerWidget level={sliceLevel} highest={() => renderer.current?.topHiding() ?? 0} onSet={(level) => renderer.current?.setSlice(level)} />}
              cornerBelow={cornerButtons(ed)}

              onHover={hoverHandler(ed)}
              hoverText={hover}
            >
              {sourceMarkers()}
              {startHintTag()}
              {topBar(ed)}
              {player.current ? <WaterBar player={player.current} weather={weather} onWeather={toggleWeather} /> : null}
              {/* the objects: the picked one's window directly above the list, the list never moving */}
              <div class="objects-dock">
                <ObjectWindow panel={ed.unleashRow() ? null : (ed.shelfRow() ?? ed.pickedRow())} />
                <Shelf picked={shelf?.id ?? null} onPick={pickShelf} onDragStart={pickShelf} onDrop={dropShelf} icon={(t) => icons[t] ?? null} loading={!ready || !!forcer.current?.running} />
              </div>
              <Minimap
                W={info.W}
                H={info.H}
                renderer={renderer.current}
                heights={() => mirror.current.heights}
                depth={() => mirror.current.water?.depth ?? null}
                stamp={`${info.version}:${waterTick}`}
                viewTick={viewTick}
              />
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
            {message ? (
              <div class={`editor-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
                {message.text}
                <button type="button" class="linkish" onClick={() => setMessage(null)} aria-label="Dismiss">
                  ×
                </button>
              </div>
            ) : null}
          </div>
        </section>
        {showHistory ? <HistoryPanel info={info} onJump={(k) => void run(() => api.jump(k))} onClose={() => setShowHistory(false)} /> : null}
      </div>
      <DropTarget onFile={props.onOpenFile} />
    </div>
    </ForceFloor.Provider>
  );
}
