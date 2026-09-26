// The 3D view on the page (PLAN §14.2, EDITOR_PLAN §4): the shared renderer on a canvas, with the
// view buttons (orbit, top-down, reset), a compass that always shows north, the hover readout, and
// beside the map a slim legend of what the colours mean (Map look, D86) with the **Height colours**
// and **Markers** toggles. The legend lists only what is on the map shown; a click on a line
// points to those things on the map. It folds to a strip that stays on screen. The view is clean
// by default, close to the game; **Markers** turns on the information layer (dam sites, slope
// arrows, level lines, small far-off objects drawn larger), and so does a tool that needs it. The
// generator's 3D preview and the editor both use it; the editor puts its handles on top.

import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { MapRenderer, type BuildStats, type MapView, type TileHit, type ViewMode } from "../render3d";
import { legendEntries, objectLegend, type GroundMode, type LegendEntry } from "../render3d/palette";
import { presentEntries, type PresentEntry } from "./legendMap";

declare global {
  interface Window {
    /** Test hook: the 3D view on the page (tests/e2e). */
    dgm3d?: { renderer: MapRenderer; build: BuildStats };
  }
}

export interface View3DProps {
  view: MapView;
  label: string;
  onReady?(r: MapRenderer, stats: BuildStats): void;
  onHover?(hit: TileHit | null): void;
  hoverText?: string | null;
  /** More legend lines for what the page draws on the map (a dam site, say; `markers` for the
   *  lines that show only with **Markers** on), with the tiles they mark. */
  legendExtra?: (LegendEntry & { tiles?: number[] })[];
  /** Turn **Markers** on while true (a tool that needs them, or a layer the player turned on). */
  markersWanted?: boolean;
  /** Whether the legend starts open (the editor starts it closed, to keep its map clear). */
  legendOpen?: boolean;
  children?: ComponentChildren;
  /** Extra class on the frame (the editor fills its area). */
  class?: string;
  /** More view buttons beside the camera's (the editor's **Clear water**). */
  viewButtons?: ComponentChildren;
  /** **Height colours** and **Markers** among the view buttons, not in the legend (the editor's
   *  layout, D184). */
  togglesInButtons?: boolean;
  /** Whether the legend shows (the editor: only while an overlay is on, D184). */
  showLegend?: boolean;
}

const GROUND_KEY = "dgm.groundColours";

/** The ground colours the viewer last chose (moisture unless they chose height). */
function savedGround(): GroundMode {
  try {
    return localStorage.getItem(GROUND_KEY) === "height" ? "height" : "moisture";
  } catch {
    return "moisture";
  }
}

function saveGround(mode: GroundMode): void {
  try {
    localStorage.setItem(GROUND_KEY, mode);
  } catch {
    // the choice lasts for this view only
  }
}

const MARKERS_KEY = "dgm.markers";
const LEGEND_KEY = "dgm.legend";

/** Whether the viewer last left the legend open (the page's default until they choose). */
function savedLegend(fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(LEGEND_KEY);
    return v === null ? fallback : v === "open";
  } catch {
    return fallback;
  }
}

function saveLegend(open: boolean): void {
  try {
    localStorage.setItem(LEGEND_KEY, open ? "open" : "folded");
  } catch {
    // the choice lasts for this view only
  }
}

/** Whether the viewer last turned **Markers** on (off unless they did). */
function savedMarkers(): boolean {
  try {
    return localStorage.getItem(MARKERS_KEY) === "on";
  } catch {
    return false;
  }
}

function saveMarkers(on: boolean): void {
  try {
    localStorage.setItem(MARKERS_KEY, on ? "on" : "off");
  } catch {
    // the choice lasts for this view only
  }
}

export function View3D(props: View3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const compass = useRef<HTMLDivElement>(null);
  const renderer = useRef<MapRenderer | null>(null);
  const [mode, setMode] = useState<ViewMode>("orbit");
  const [ground, setGround] = useState<GroundMode>(savedGround);
  const [markers, setMarkers] = useState<boolean>(() => savedMarkers() || !!props.markersWanted);
  const [error, setError] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState<boolean>(() => savedLegend(props.legendOpen ?? true));
  /** The legend's line pointed to on the map, and the map's changes (the legend reads them). */
  const [pointed, setPointed] = useState<string | null>(null);
  const [mapTick, setMapTick] = useState(0);
  const onHover = useRef(props.onHover);
  onHover.current = props.onHover;

  useEffect(() => {
    let r: MapRenderer;
    try {
      r = new MapRenderer(canvas.current!);
    } catch (e) {
      setError("The 3D view needs WebGL, which this browser has turned off. The 2D view still works.");
      console.warn(e);
      return;
    }
    renderer.current = r;
    r.setGroundMode(ground);
    r.setMarkers(markers);
    r.onHover = (hit) => onHover.current?.(hit);
    // the legend reads the map again a moment after it changes, when the page is idle (never
    // while a brush paints or the water flows)
    let t = 0;
    r.onMapChange = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        if (idle) idle(() => setMapTick((n) => n + 1), { timeout: 2000 });
        else setMapTick((n) => n + 1);
      }, 400);
    };
    r.onView = (v) => {
      const el = compass.current;
      if (el) el.style.transform = `rotate(${v.mode === "top" ? 0 : (v.yaw * 180) / Math.PI}deg)`;
    };
    return () => {
      renderer.current = null;
      if (window.dgm3d?.renderer === r) delete window.dgm3d;
      r.dispose();
    };
  }, []);

  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    const stats = r.setMap(props.view);
    // the legend reads the new map now
    setMapTick((n) => n + 1);
    setMode("orbit");
    r.setMode("orbit");
    window.dgm3d = { renderer: r, build: stats };
    props.onReady?.(r, stats);
  }, [props.view]);

  const pick = (m: ViewMode) => {
    setMode(m);
    renderer.current?.setMode(m);
  };

  // a tool or layer that needs the markers turns them on; when it is done, the viewer's own choice
  // comes back
  const wanted = !!props.markersWanted;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const on = wanted || savedMarkers();
    setMarkers(on);
    renderer.current?.setMarkers(on);
  }, [wanted]);

  const toggleMarkers = () => {
    const next = !markers;
    setMarkers(next);
    saveMarkers(next);
    renderer.current?.setMarkers(next);
  };

  const legendId = useMemo(() => `legend-${Math.random().toString(36).slice(2, 8)}`, []);

  const toggleGround = () => {
    const next: GroundMode = ground === "height" ? "moisture" : "height";
    setGround(next);
    saveGround(next);
    renderer.current?.setGroundMode(next);
  };

  // only what is on this map: the renderer's map, read again when it changes
  const present = useMemo(
    () => presentEntries([...legendEntries(ground), ...objectLegend(), ...(props.legendExtra ?? [])], renderer.current?.mapState() ?? null),
    [mapTick, ground, props.legendExtra, props.view],
  );
  const clean = present.filter((e) => !e.markers);
  const marked = present.filter((e) => e.markers);

  // a line points to its things on the map until the next click on the map, Esc, or the line again
  // (the listeners are there from the start, reading a ref: an Esc right after the click counts)
  const pointedRef = useRef<string | null>(null);
  const point = (e: PresentEntry | null) => {
    const next = e && e.key !== pointedRef.current ? e : null;
    pointedRef.current = next?.key ?? null;
    setPointed(pointedRef.current);
    renderer.current?.setHighlight(next ? next.tiles : null);
  };
  useEffect(() => {
    const off = () => {
      if (pointedRef.current) point(null);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && off();
    const c = canvas.current;
    c?.addEventListener("pointerdown", off);
    window.addEventListener("keydown", onKey);
    return () => {
      c?.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  // a new map drops the highlight
  useEffect(() => {
    pointedRef.current = null;
    setPointed(null);
  }, [props.view]);

  const item = (e: PresentEntry) => (
    <li key={e.label}>
      {e.tiles.length ? (
        <button type="button" class="pick-line" aria-pressed={pointed === e.key} onClick={() => point(e)} title="Show these on the map">
          <span class="swatch" style={{ background: e.swatch }} aria-hidden="true" />
          {e.label}
        </button>
      ) : (
        <span class="pick-line">
          <span class="swatch" style={{ background: e.swatch }} aria-hidden="true" />
          {e.label}
        </span>
      )}
    </li>
  );
  const fold = (open: boolean) => {
    setLegendOpen(open);
    saveLegend(open);
  };
  const showLegend = props.showLegend ?? true;
  const toggles = (
    <>
      <button type="button" aria-pressed={ground === "height"} onClick={toggleGround} title="Colour the ground by height instead of by soil">
        Height colours
      </button>
      <button type="button" aria-pressed={markers} onClick={toggleMarkers} title="Show dam sites, slope arrows and a line at every level, and draw small far-off objects larger">
        Markers
      </button>
    </>
  );

  return (
    <div class={`view3d-frame ${showLegend && legendOpen ? "legend-open" : showLegend ? "legend-folded" : "legend-none"} ${props.class ?? ""}`}>
      <div class="view3d">
      <canvas ref={canvas} aria-label={props.label} />
      {error ? <p class="view3d-error">{error}</p> : null}
      <div class="view3d-controls" role="group" aria-label="View">
        <button type="button" aria-pressed={mode === "orbit"} onClick={() => pick("orbit")} title="Drag to turn, right-drag to move, wheel to zoom">
          Orbit
        </button>
        <button type="button" aria-pressed={mode === "top"} onClick={() => pick("top")} title="North up. Drag to move, wheel to zoom">
          Top-down
        </button>
        <button type="button" onClick={() => renderer.current?.resetView()}>
          Reset view
        </button>
        {props.togglesInButtons ? toggles : null}
        {props.viewButtons}
      </div>
      <div class="compass" aria-label="Compass: north is the top of the top-down view" role="img">
        <div ref={compass} class="needle">
          <span>N</span>
        </div>
      </div>
      {props.hoverText ? (
        <div class="readout" role="status">
          {props.hoverText}
        </div>
      ) : null}
      {props.children}
      </div>
      {error || !showLegend ? null : (
        <aside class={`side-panel view3d-legend${legendOpen ? "" : " folded"}`} aria-label="Legend">
          <button type="button" class="side-panel-fold" aria-expanded={legendOpen} aria-controls={legendId} onClick={() => fold(!legendOpen)} title={legendOpen ? "Fold the legend" : "Open the legend"}>
            <span>Legend</span>
          </button>
          {legendOpen ? (
            <div class="side-panel-body" id={legendId}>
              {props.togglesInButtons ? null : (
                <div class="toggle-row" role="group" aria-label="Map colours">
                  {toggles}
                </div>
              )}
              <ul class="pick-list">{clean.map(item)}</ul>
              {marked.length ? (
                <>
                  <p class="panel-head">
                    With <b>Markers</b> on:
                  </p>
                  <ul class="pick-list">{marked.map(item)}</ul>
                  <p class="note">From afar, dead trees, slope arrows and the start are drawn larger, and dam sites wider.</p>
                </>
              ) : null}
              <p class="note">Click a line to show it on the map.</p>
            </div>
          ) : null}
        </aside>
      )}
    </div>
  );
}
