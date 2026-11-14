// The editor's markup. The parts that are long are plain functions of the bag (header.tsx,
// topBar.tsx, viewControls.tsx), called inline here, so the vnode tree is one.

import type { JSX } from "preact";
import { View3D } from "../../ui/View3D";
import { LookMenu } from "../../ui/LookMenu";
import { tip } from "../../ui/Tooltip";
import { HistoryPanel, StartIndicators } from "../panels";
import { LEGEND_TEMPLATES } from "../shelfItems";
import { measureInsets } from "../view/insets";
import { PointerNote } from "../view/pointerNote";
import { mapCounts } from "../features";
import { GeneratorPanel } from "../generator/GeneratorPanel";
import { YourMaps } from "../generator/YourMaps";
import { RealPlaces } from "../generator/RealPlaces";
import { Shelf } from "../Shelf";
import { ObjectWindow } from "../ObjectWindow";
import { LayerWidget } from "../LayerWidget";
import { Minimap } from "../Minimap";
import { ForceFloor, ObjectsButton } from "../TopBar";
import { WaterBar } from "../WaterBar";
import { surfaceWater } from "../../render3d/model";
import { coreNotes } from "../../core/sim/coreMoment";
import { startWaterNotes } from "../../core/sim/startWaterDay";
import { hazardDays } from "../../core/sim/weather";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";
import { DropTarget } from "./DropTarget";
import { fingerPress } from "../view/fingerPress";
import { header } from "./header";
import { heldLine, topBar } from "./topBar";
import { cornerButtons, FIRST_VIEW_KEY, firstViewOf, hideObjectsButton, hoverHandler, layerCaption, levelLinesButton, viewButtons } from "./viewControls";

export function editorView(ed: Ed, props: EditorProps) {
  const {
    floorContext, busy, shelf, pickShelf, dropShelf, icons, ready, forcer, view, info, onReady, layer, sliceLevel,
    renderer, hover, player, weather, toggleWeather, sourceMarkers, startHintTag, mirror, waterTick, heldTick,
    shapeNote, blockNote, startDrag, needs, startReach, showHistory, setShowHistory, presenceMarkers
  } = ed;
  const drawerOpen = props.drawerOpen;
  const { phone, tablet, phoneSheet, setPhoneSheet } = ed;
  // the phone's sheets: a phone's, or a tablet's (a big phone, planning 2026-11-14: Show, the objects and the menu's pages
  // as the phone has them, its dock and its minimap as they are)
  const sheets = !!phone || tablet;
  const waterBar = player.current ? <WaterBar weather={weather} onWeather={toggleWeather} day={ed.weatherDay} target={ed.weatherTarget} counting={ed.weatherCounting} onStep={ed.stepWeather} onDay={ed.holdWeatherDay} length={weather ? hazardDays(info.spec?.designedFor ?? "normal", weather) : null} coreNotes={weather ? [...coreNotes(info.features, info.spec?.designedFor ?? "normal", weather, ed.weatherTarget ?? ed.weatherDay), ...startWaterNotes(ed.startWater, weather, info.version)] : []} /> : null;
  const minimap = (
    <Minimap
      W={info.W}
      H={info.H}
      renderer={renderer.current}
      heights={() => (ed.compareFlipped && props.compare ? props.compare.view.heights : mirror.current.heights)}
      depth={() => (ed.compareFlipped && props.compare ? surfaceWater(info.W, info.H, props.compare.view.water).depth : (mirror.current.water?.depth ?? null))}
      stamp={`${info.version}:${waterTick}:${weather ?? ""}:${heldTick}:${ed.compareFlipped ? "other" : ""}`}
    />
  );
  // a phone's pages (#1074), and a tablet's: each of the menu's panels the whole view under the bar, over the dock, a plain
  // way back to the map at its top, scrolling as one page; the desktop's panels as they are
  const phonePage = (title: string, close: () => void, panel: JSX.Element) =>
    sheets ? (
      <div class="phone-page" role="region" aria-label={title}>
        <div class="phone-page-head">
          <button type="button" class="phone-back" {...tip("Back to the map")} onClick={close}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            <span>Map</span>
          </button>
          <h2 class="phone-page-title">{title}</h2>
        </div>
        <div class="phone-page-body">{panel}</div>
      </div>
    ) : (
      panel
    );
  // a phone's Show sheet (#1074): what to show and the camera, with Look and the minimap, the weather days, the sound; a
  // tablet's the same, its minimap staying on the map and Look in its header
  const phoneShow = sheets ? { open: phoneSheet === "show", weather: waterBar, minimap: phone ? minimap : null, look: phone ? <LookMenu renderer={renderer.current} buttonClass="ghost" /> : null } : null;

  return (
    <ForceFloor.Provider value={floorContext}>
    <div class={`editor${drawerOpen || props.mapsOpen || props.placesOpen ? " drawer-open" : ""}${drawerOpen ? " gen-open" : ""}`} data-phone={phone ?? undefined} data-tablet={tablet ? "" : undefined} data-sheet={sheets ? (phoneSheet ?? undefined) : undefined} data-tall={phone && ed.sheetTall ? "" : undefined} aria-busy={busy > 0} inert={props.replacing}>
      {header(ed, props)}
      <div class="editor-main">
        {drawerOpen ? phonePage("Map Generator", () => props.onDrawer(false), <GeneratorPanel model={props.drawer} icon={(t) => icons[t] ?? null} counts={mapCounts(mirror.current.entities)} onClose={() => props.onDrawer(false)} />) : null}
        {props.placesOpen ? phonePage("Real places", () => props.onPlaces(false), <RealPlaces onOpen={props.drawer.onOpenPlace} />) : null}
        {props.mapsOpen ? phonePage("Your maps", () => props.onMaps(false), <YourMaps model={props.drawer} />) : null}
        {/* History in the left panel's place, over the map, one panel at a time (Kyler, 2026-10-06) */}
        {showHistory ? phonePage("History", () => setShowHistory(false), <HistoryPanel info={info} onJump={(k, step) => void ed.jump(k, step)} onKeep={props.onKeepStep} onClose={() => setShowHistory(false)} />) : null}
        <section class="editor-map" aria-label="Map">
          <div class="editor-map-area">
            <View3D
              view={view}
              class="editor-view"
              label={`3D view of ${info.name}. Middle-drag to turn, right-drag to move, wheel to zoom toward the pointer.`}
              onReady={onReady}
              markersWanted={shelf?.id === "Slope"}
              markersToggle={ed.markersToggle}
              firstView={firstViewOf(ed)}
              firstViewCall={ed.firstViewCall}
              firstViewKey={FIRST_VIEW_KEY}
              togglesInButtons
              lookMenu={false}
              besideHeight={levelLinesButton(ed)}
              legendInCorner
              legendOpen={false}
              frameInsets={measureInsets}
              keepView={props.keepView}
              startMode={props.carry?.mode}
              legendIcon={(label) => (LEGEND_TEMPLATES[label] ? (icons[LEGEND_TEMPLATES[label]] ?? null) : null)}
              viewButtons={viewButtons(ed)}
              besideLegend={hideObjectsButton(ed)}
              caption={layerCaption(ed)}
              cornerLevel={<LayerWidget level={sliceLevel} highest={() => renderer.current?.topHiding() ?? 0} onSet={(level) => renderer.current?.setSlice(level)} />}
              cornerBelow={cornerButtons(ed)}
              phoneShow={phoneShow}

              onHover={hoverHandler(ed)}
              hoverText={hover}
            >
              {ed.compareFlipped ? null : sourceMarkers()}
              {presenceMarkers()}
              {ed.compareVeil()}
              {ed.compareFlipped ? null : startHintTag()}
              {topBar(ed, props)}
              {tablet ? <ObjectsButton class="tablet-objects-button" open={phoneSheet === "objects"} holding={!!shelf} onClick={() => setPhoneSheet(phoneSheet === "objects" ? null : "objects")} /> : null}
              {sheets ? (
                <button type="button" class="phone-show-button" aria-expanded={phoneSheet === "show"} {...tip(phoneSheet === "show" ? "Close what the map shows" : "Choose what the map shows")} onClick={() => setPhoneSheet(phoneSheet === "show" ? null : "show")}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 4l9 5-9 5-9-5z" />
                    <path d="M3 14l9 5 9-5" />
                  </svg>
                  <span class="icon-word">Show</span>
                </button>
              ) : null}
              {sheets ? null : waterBar}
              {/* the objects: the picked one's window directly above the list, the list never moving */}
              <div class="objects-dock">
                {/* (a phone's stands in the settings' sheet above the tool row, render/topBar.tsx) */}
                {/* (a tablet's object in hand from its sheet: the phone's row saying what it is, with Put it down, over its window) */}
                {tablet && shelf ? (
                  <div class="phone-held object-window" role="group" aria-label={`${shelf.name} in hand`}>
                    {heldLine(ed)}
                  </div>
                ) : null}
                {phone ? null : <ObjectWindow panel={ed.unleashRow() ? null : (ed.shelfRow() ?? ed.pickedRow())} />}
                <Shelf picked={shelf?.id ?? null} onPick={pickShelf} onDragStart={pickShelf} onDrop={dropShelf} icon={(t) => icons[t] ?? null} loading={!ready || !!forcer.current?.running} />
              </div>
              {phone ? null : minimap}
              {shapeNote ? (
                <PointerNote class={`map-note shape-note${shapeNote.ok ? (shapeNote.warn ? " warn" : "") : " error"}`} x={shapeNote.x + 16} y={shapeNote.y + 16} pointer={shapeNote}>
                  {shapeNote.text}
                </PointerNote>
              ) : null}
              {blockNote ? (
                <PointerNote class={`map-note shape-note${blockNote.ok ? " warn" : " error"}`} x={blockNote.x} y={blockNote.y} pointer={blockNote.pointer} own={blockNote.own}>
                  {blockNote.text}
                </PointerNote>
              ) : null}
              {fingerPress(ed)}
              {startDrag ? (
                <StartIndicators check={startDrag.check} rules={needs.rules} />
              ) : startReach ? (
                <div class={`start-reach${startReach.fading ? " fading" : ""}`}>
                  <StartIndicators check={startReach.check} rules={needs.rules} />
                </div>
              ) : null}
            </View3D>
          </div>
        </section>
      </div>
      <DropTarget onFile={props.onOpenFile} />
    </div>
    </ForceFloor.Provider>
  );
}
