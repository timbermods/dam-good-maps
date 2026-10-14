// The editor as the player has it, taken before the tour and put back after it (D377): the tool in hand and its
// settings (a brush's Size, strength, level and mode; a force's Power, Size and mode), the shelf's object, the
// selection (its way of marking and the tiles), the panels and toggles that are open, a held Drought or Badtide day,
// and where the focus was. The map, its history and the camera come back by themselves (the player's worker is never
// touched, and the view is kept); this is the page's own state, which a new editor would otherwise start afresh.

import type { Ed } from "../ed";
import type { BrushSettings, BrushTool } from "../brushes";
import type { CarveUi } from "../CarveRow";
import type { CraterUi, DepositUi, EruptUi, GlaciateUi, QuakeUi, RiftUi } from "../ForceRows";
import type { ShelfItem, ShelfOptions } from "../shelfItems";
import type { SelectMode } from "../select";
import type { LayerKind } from "../panels";
import type { Verb } from "../../core/forces/op";
import type { Hazard } from "../../core/sim/weather";
import type { ViewState } from "../../render3d";
import type { EntityInfo } from "../../worker/session";

/** Where the focus was: the map, or a button of the header or the hints (found again by its words). */
type Focus = { on: "map" } | { on: "button"; within: string; name: string } | null;

export interface UiState {
  force: Verb | null;
  brushTool: BrushTool | null;
  brush: BrushSettings;
  shelf: ShelfItem | null;
  shelfOptions: ShelfOptions;
  turn: number;
  selecting: SelectMode | null;
  selection: { W: number; H: number; tiles: number[] };
  /** The Select row's Level number and Max water depth. */
  level: number | null;
  maxDepth: number;
  /** A source picked (where, to be picked again with its strength as the map has it) or an object picked. */
  pickedSource: { x: number; y: number } | null;
  pickedObject: EntityInfo | null;
  carve: CarveUi;
  crater: CraterUi;
  erupt: EruptUi;
  quake: QuakeUi;
  glaciate: GlaciateUi;
  rift: RiftUi;
  deposit: DepositUi;
  showHistory: boolean;
  dotOpen: boolean;
  layer: LayerKind;
  clearWater: boolean;
  sliceLevel: number | null;
  weather: { hazard: Hazard; day: number | null } | null;
  focus: Focus;
  /** The camera, put on the map the moment it is drawn again. */
  view: ViewState | null;
}

const BUTTON_PARTS: [string, string][] = [
  ["header.editor-bar", "header"],
  [".first-run", "hints"],
  [".tool-dock", "dock"],
];

/** Where the focus was before the File menu was opened (the tour is started from it, and the click took the focus): the
 *  last place it rested that was not the menu or its button. */
let before: Focus = null;

/** Follow the focus, from the editor being on the page until it is not; the editor's own, never the tour's. */
export function followFocus(canvas: () => HTMLElement | null): () => void {
  const seen = (ev: FocusEvent) => {
    const el = ev.target as HTMLElement | null;
    if (!el || el.closest(".menu-wrap") || el.closest(".tour")) return;
    before = describe(el, canvas());
  };
  document.addEventListener("focusin", seen);
  return () => document.removeEventListener("focusin", seen);
}

function describe(el: HTMLElement, canvas: HTMLElement | null): Focus {
  if (el === document.body) return null;
  if (el === canvas) return { on: "map" };
  for (const [selector, within] of BUTTON_PARTS) {
    if (el.closest(selector) && el.tagName === "BUTTON") return { on: "button", within, name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "" };
  }
  return null;
}

function focusOf(canvas: HTMLElement | null): Focus {
  const el = document.activeElement as HTMLElement | null;
  // (a menu item or the File button itself: the focus was elsewhere before the menu opened)
  if (!el || el.closest(".menu-wrap")) return before;
  return describe(el, canvas);
}

function refocus(f: Focus, canvas: HTMLElement | null): void {
  if (!f) return;
  if (f.on === "map") return canvas?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  const selector = BUTTON_PARTS.find(([, w]) => w === f.within)![0];
  const found = [...document.querySelectorAll<HTMLElement>(`${selector} button`)].find((b) => (b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "") === f.name);
  // (without a focus ring: the player did not tab there, and nothing is drawn round it that was not before)
  found?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}

/** The editor's state as it is now. */
export function takeUi(ed: Ed): UiState {
  const sel = ed.selection.current;
  return {
    force: ed.toolRef.current,
    brushTool: ed.brushToolRef.current,
    brush: { ...ed.brushRef.current },
    shelf: ed.shelfRef.current,
    shelfOptions: { ...ed.shelfOptionsRef.current },
    turn: ed.turnRef.current,
    selecting: ed.selectingRef.current,
    selection: { W: sel.W, H: sel.H, tiles: sel.tiles() },
    level: ed.flattenRef.current,
    maxDepth: ed.maxDepthRef.current,
    pickedSource: ed.pickedRef.current ? { x: ed.pickedRef.current.x, y: ed.pickedRef.current.y } : null,
    pickedObject: ed.pickedObjectRef.current,
    carve: { ...ed.carveUiRef.current },
    crater: { ...ed.craterUiRef.current },
    erupt: { ...ed.eruptUiRef.current },
    quake: { ...ed.quakeUiRef.current },
    glaciate: { ...ed.glaciateUiRef.current },
    rift: { ...ed.riftUiRef.current },
    deposit: { ...ed.depositUiRef.current },
    showHistory: ed.showHistory,
    dotOpen: ed.dotOpen,
    layer: ed.layer,
    clearWater: ed.clearWater,
    sliceLevel: ed.renderer.current?.slice ?? null,
    weather: ed.weatherRef.current ? { hazard: ed.weatherRef.current, day: ed.heldDay.current } : null,
    focus: focusOf(ed.renderer.current?.canvas ?? null),
    view: ed.renderer.current?.getView() ?? null,
  };
}

/** Put it back, once the new editor is ready (its map drawn, its brush and its forces able to be picked). */
export function putUiBack(ed: Ed, s: UiState): void {
  // the forces' settings first (picking a force draws its ring from them), then the tool in hand
  ed.setCarveUi((ed.carveUiRef.current = s.carve));
  ed.setCraterUi((ed.craterUiRef.current = s.crater));
  ed.setEruptUi((ed.eruptUiRef.current = s.erupt));
  ed.setQuakeUi(s.quake);
  ed.setGlaciateUi((ed.glaciateUiRef.current = s.glaciate));
  ed.setRiftUi(s.rift);
  ed.setDepositUi(s.deposit);
  if (s.force) ed.pickTop(s.force);
  else if (s.brushTool) ed.pickBrush(s.brushTool);
  else if (s.shelf) ed.pickShelf(s.shelf);
  // (the brush's own settings after its pick, which lets go of a target: the target comes back with them)
  ed.setBrush(s.brush, false);
  if (s.shelf) {
    ed.setShelfOptions(s.shelfOptions);
    ed.setTurn(s.turn);
  }
  ed.setSelecting(s.selecting);
  if (ed.selection.current.W === s.selection.W && ed.selection.current.H === s.selection.H) ed.selection.current.apply(s.selection.tiles, "set");
  ed.setSelectionTick((n) => n + 1);
  ed.setFlattenTo(s.level);
  ed.setMaxDepth(s.maxDepth);
  // (after the tool: picking one puts a picked source or object away)
  if (s.pickedSource) ed.pickTile(s.pickedSource.x, s.pickedSource.y);
  else if (s.pickedObject) ed.setPickedObject(s.pickedObject);
  ed.setShowHistory(s.showHistory);
  ed.setDotOpen(s.dotOpen);
  ed.setLayer(s.layer);
  ed.setClearWater(s.clearWater);
  if (s.sliceLevel !== null) ed.renderer.current?.setSlice(s.sliceLevel);
  if (s.weather) {
    ed.toggleWeather(s.weather.hazard);
    if (s.weather.day !== null) ed.holdWeatherDay(s.weather.day);
  }
  // (after the editor has drawn what it was given)
  requestAnimationFrame(() => refocus(s.focus, ed.renderer.current?.canvas ?? null));
}
