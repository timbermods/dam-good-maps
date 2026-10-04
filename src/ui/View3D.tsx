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
import { MapRenderer, type BuildStats, type FrameInsets, type MapView, type TileHit, type ViewMode } from "../render3d";
import { takePreparedRenderer } from "../render3d/prepared";
import { LookMenu } from "./LookMenu";
import { legendEntries, objectLegend, type GroundMode, type LegendEntry } from "../render3d/palette";
import { presentEntries, type PresentEntry } from "./legendMap";
import { tip } from "./Tooltip";

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
  /** A water overlay's caption while it is on (the Show column's key, under the column). */
  caption?: ComponentChildren;
  /** The top-right corner beside the compass (D345, B3): the level control, and under it a row of
   *  switches (Slow forces, Sound). */
  cornerLevel?: ComponentChildren;
  cornerBelow?: ComponentChildren;
  /** **Height colours** and **Markers** among the view buttons, not in the legend (the editor's
   *  layout, D184). */
  togglesInButtons?: boolean;
  /** A view switch right beside **Height colours** (the editor's **Level lines**, D248). */
  besideHeight?: ComponentChildren;
  /** Whether the legend shows beside the view (the editor has it in its corner instead). */
  showLegend?: boolean;
  /** The legend as the editor's: a named **Legend** button under the corner's switches, lit while
   *  open, and the panel under it over the map, from the button's edges down to the water bar
   *  (Kyler, 2026-10-02). The open state is remembered as the docked legend's is. */
  legendInCorner?: boolean;
  /** The look's menu among the view's buttons (the editor has it in its header instead). */
  lookMenu?: boolean;
  /** An object's picture for its legend line (the objects menu's own), by the line's name; null keeps its
   *  swatch. */
  legendIcon?(label: string): string | null;
  /** The edges of the view the page's controls cover, measured on the view, so a new map is framed clear of them
   *  (`setFrameInsets`; the page keeps them up to date as the controls change). */
  frameInsets?(view: HTMLElement): Partial<FrameInsets>;
  /** The first map keeps the view the kept renderer had (the same map back). */
  keepView?: boolean;
}

/** The renderer the last view left when it closed (a new map re-mounts the editor): the next view takes it, its
 *  canvas, WebGL context and compiled programs, instead of making another (the page's work, done once). */
let kept: MapRenderer | null = null;

/** Take the kept renderer, if any, with nothing of the last map's editor left on it. */
function takeKept(): MapRenderer | null {
  const r = kept;
  kept = null;
  if (!r) return null;
  r.tool = null;
  r.claimKey = null;
  r.onClick = null;
  r.onWheel = null;
  r.onSlice = null;
  r.onMarkers = null;
  r.grab = null;
  r.setSlice(null);
  r.setGhost(null);
  r.setBrushCursor(null);
  r.setHighlight(null);
  r.highlightObjects(null);
  r.setSourceGlow([]);
  r.setHoverTile(null);
  r.hoverHit = null;
  return r;
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
  const controls = useRef<HTMLDivElement>(null);
  const renderer = useRef<MapRenderer | null>(null);
  /** The renderer, for the look's menu (High or Standard, D284). */
  const [made, setMade] = useState<MapRenderer | null>(null);
  const [mode, setMode] = useState<ViewMode>("orbit");
  const [ground, setGround] = useState<GroundMode>(savedGround);
  const [markers, setMarkers] = useState<boolean>(() => savedMarkers() || !!props.markersWanted);
  const [flow, setFlow] = useState<boolean>(() => {
    try {
      return localStorage.getItem("dgm.flow") === "on";
    } catch {
      return false;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState<boolean>(() => savedLegend(props.legendOpen ?? true));
  /** The legend's line pointed to on the map, and the map's changes (the legend reads them). */
  const [pointed, setPointed] = useState<string | null>(null);
  const [mapTick, setMapTick] = useState(0);
  /** The tile under the pointer, in the game's order (Layout 2's coordinates): written straight to its line, so a
   *  pointer moving over the map never re-renders the view. */
  const coordsEl = useRef<HTMLDivElement>(null);
  const coordsRef = useRef<string>("");
  const onHover = useRef(props.onHover);
  onHover.current = props.onHover;

  // the view bar wraps before the compass; what sits under it (the editor's brush bar) reads its
  // height from --view-controls-h
  useEffect(() => {
    const el = controls.current;
    const frame = el?.parentElement;
    if (!el || !frame || typeof ResizeObserver === "undefined") return;
    const note = () => frame.style.setProperty("--view-controls-h", `${el.offsetHeight}px`);
    note();
    const watch = new ResizeObserver(note);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    let r: MapRenderer;
    // the renderer warmed while the map loaded (D367, part 1), its canvas in this one's place; else a new one
    // (or the one the last map's view left: a new map keeps the page's renderer)
    const own = canvas.current!;
    const again = takeKept();
    const taken = again ?? takePreparedRenderer(own.parentElement!);
    if (taken) {
      own.before(taken.canvas);
      own.remove();
      taken.canvas.setAttribute("aria-label", own.getAttribute("aria-label") ?? "");
      canvas.current = taken.canvas;
      if (again) again.adopted();
      r = taken;
    } else
      try {
        r = new MapRenderer(own);
      } catch (e) {
        setError("The 3D view needs WebGL, which this browser has turned off. The 2D view still works.");
        console.warn(e);
        return;
      }
    renderer.current = r;
    setMade(r);
    r.setGroundMode(ground);
    r.setMarkers(markers);
    // the Flow view as the player left it (D353; off by default), where the editor has its switch
    if (props.togglesInButtons && (flow || again)) r.setFlow(flow);
    r.onHover = (hit) => {
      onHover.current?.(hit);
      if (!props.legendInCorner) return;
      const k = hit ? `X ${hit.x} · Y ${hit.y} · Z ${r.heightAt(hit.x, hit.y)}` : "";
      if (k === coordsRef.current) return;
      coordsRef.current = k;
      const el = coordsEl.current;
      if (!el) return;
      el.textContent = k;
      el.hidden = !k;
    };
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
      setMade(null);
      clearTimeout(t);
      if (window.dgm3d?.renderer === r) delete window.dgm3d;
      // the editor's view keeps its renderer for the next map's (a new map re-mounts the editor); any other view's goes
      if (props.legendInCorner) {
        r.onHover = null;
        r.onMapChange = null;
        r.onView = null;
        kept?.dispose();
        kept = r;
        return;
      }
      r.dispose();
    };
  }, []);

  // (the canvas may be the warmed renderer's: its name follows the view's)
  useEffect(() => canvas.current?.setAttribute("aria-label", props.label), [props.label]);

  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    const view = canvas.current?.parentElement;
    if (view && props.frameInsets) r.setFrameInsets(props.frameInsets(view));
    const keep = !!props.keepView && mapsShown.current === 0;
    mapsShown.current++;
    const stats = r.setMap(props.view, keep);
    // the legend reads the new map now
    setMapTick((n) => n + 1);
    // (the same map back keeps its view, top-down or not)
    const m: ViewMode = keep ? r.getView().mode : "orbit";
    setMode(m);
    if (!keep) r.setMode("orbit");
    window.dgm3d = { renderer: r, build: stats };
    props.onReady?.(r, stats);
  }, [props.view]);

  /** The maps this view has shown (a kept view applies to its first only). */
  const mapsShown = useRef(0);
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
    // no focus ring on the map from the mouse; a keyboard's focus (Tab) shows it
    const byMouse = () => c?.setAttribute("data-mouse", "");
    const notMouse = () => c?.removeAttribute("data-mouse");
    const onTab = (ev: KeyboardEvent) => ev.key === "Tab" && notMouse();
    c?.addEventListener("pointerdown", off);
    c?.addEventListener("pointerdown", byMouse);
    c?.addEventListener("blur", notMouse);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onTab, true);
    return () => {
      c?.removeEventListener("pointerdown", off);
      c?.removeEventListener("pointerdown", byMouse);
      c?.removeEventListener("blur", notMouse);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onTab, true);
    };
  }, []);
  // a new map drops the highlight
  useEffect(() => {
    pointedRef.current = null;
    setPointed(null);
  }, [props.view]);

  const item = (e: PresentEntry) => {
    // an object's line shows the objects menu's own picture of it (Kyler, 2026-10-03); the ground, the water and the
    // markers keep their swatches
    const pic = props.legendIcon?.(e.label) ?? null;
    const mark = pic ? <img class="swatch pic" src={pic} alt="" aria-hidden="true" /> : <span class="swatch" style={{ background: e.swatch }} aria-hidden="true" />;
    return (
      <li key={e.label}>
        {e.tiles.length ? (
          <button type="button" class="pick-line" aria-pressed={pointed === e.key} onClick={() => point(e)} title="Show on the map">
            {mark}
            {e.label}
          </button>
        ) : (
          <span class="pick-line">
            {mark}
            {e.label}
          </span>
        )}
      </li>
    );
  };
  const fold = (open: boolean) => {
    setLegendOpen(open);
    saveLegend(open);
  };
  const showLegend = !props.legendInCorner && (props.showLegend ?? true);
  const column = !!props.legendInCorner;
  // the map's lowest and highest level, for Heights' own legend
  const range = useMemo(() => {
    const m = renderer.current?.mapState();
    if (!m || !column) return null;
    let lo = 255;
    let hi = 0;
    for (const h of m.heights) {
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    return [lo, hi] as const;
  }, [mapTick, props.view, column]);
  const heightSwatch = legendEntries("height")[0].swatch;
  const toggleFlow = () => {
    const next = !flow;
    setFlow(next);
    try {
      localStorage.setItem("dgm.flow", next ? "on" : "off");
    } catch {
      // the choice lasts for this view only
    }
    renderer.current?.setFlow(next);
  };
  const toggles = column ? (
    <>
      <ShowRow on={ground === "height"} onToggle={toggleGround} tip={tip("Colour the ground by height")}>
        Heights
      </ShowRow>
      {props.besideHeight}
      <ShowRow on={markers} onToggle={toggleMarkers} tip={tip("Show sources, slope arrows and level lines")}>
        Markers
      </ShowRow>
      <ShowRow on={flow} onToggle={toggleFlow} tip={tip("Show the water's currents")}>
        Flow
      </ShowRow>
    </>
  ) : (
    <>
      <button type="button" aria-pressed={ground === "height"} onClick={toggleGround} title="Colour the ground by height instead of by soil">
        Height colours
      </button>
      {props.besideHeight}
      <button type="button" aria-pressed={markers} onClick={toggleMarkers} title="Show sources, slope arrows and level lines">
        Markers
      </button>
    </>
  );

  // the legend's lines: what is on the map, then what Markers adds
  const legendBody = (
    <>
      {props.togglesInButtons ? null : (
        <div class="toggle-row" role="group" aria-label="Map colours">
          {toggles}
        </div>
      )}
      <ul class="pick-list">{clean.map(item)}</ul>
      {marked.length ? (
        <>
          <p class="panel-head">Markers on:</p>
          <ul class="pick-list">{marked.map(item)}</ul>
        </>
      ) : null}
    </>
  );
  const compassDial = (
    <div class="compass" aria-label="Compass: north is the top of the top-down view" role="img">
      <div ref={compass} class="needle">
        <span>N</span>
      </div>
    </div>
  );
  const topDown = (
    <button type="button" aria-pressed={mode === "top"} onClick={() => pick(mode === "top" ? "orbit" : "top")} title={mode === "top" ? "Looking straight down: click to turn the view" : "Look straight down, north up"}>
      Top-down
    </button>
  );
  const reset = (
    <button type="button" title="Frame the whole map again" onClick={() => renderer.current?.resetView()}>
      Reset view
    </button>
  );
  if (column)
    // Layout 2 (Kyler, 2026-10-03): the Show toggles as one column of checkbox rows at the map's top left, Legend
    // last, its legend under them while ticked; the camera group at the top right, the slice, Slow forces and the
    // sound under it; the coordinates over the readout at the bottom left
    return (
      <div class={`view3d-frame legend-none ${props.class ?? ""}`}>
        <div class="view3d">
          <canvas ref={canvas} aria-label={props.label} />
          {error ? <p class="view3d-error">{error}</p> : null}
          <div class="show-stack">
            <div ref={controls} class="view3d-controls show-column" role="group" aria-label="Show">
              {toggles}
              {props.viewButtons}
              <ShowRow on={legendOpen} onToggle={() => fold(!legendOpen)} tip={tip("What the map's colours mean")} controls={legendId}>
                Legend
              </ShowRow>
            </div>
            {/* the column's key, under it at its width (Kyler, 2026-10-04: nothing reaches past the column, so the map
                generator opens beside it): the legend while Legend is ticked, an overlay's caption at its top (the
                legend holds Heights' own line); or, with Legend off, the overlays' captions alone */}
            {legendOpen ? (
              <aside class="legend-panel in-column" id={legendId} aria-label="Legend">
                {props.caption ? <div class="key-caption">{props.caption}</div> : null}
                {legendBody}
              </aside>
            ) : (ground === "height" && range) || props.caption ? (
              <div class="show-key" role="note" aria-label="Key">
                {ground === "height" && range ? (
                  <div class="overlay-legend">
                    <p class="ol-head">Ground height</p>
                    <div class="ol-ramp" style={{ background: heightSwatch }} />
                    <div class="ol-ends">
                      <span>Low {range[0]}</span>
                      <span>High {range[1]}</span>
                    </div>
                  </div>
                ) : null}
                {props.caption}
              </div>
            ) : null}
          </div>
          <div class="view3d-corner" role="group" aria-label="Camera and switches">
            <div class="camera-group" role="group" aria-label="Camera">
              {topDown}
              {reset}
              {compassDial}
            </div>
            <div class="corner-level">{props.cornerLevel}</div>
            {props.cornerBelow}
          </div>
          <div ref={coordsEl} class="coords" aria-label="Coordinates" hidden />
          {props.hoverText ? (
            <div class="readout" role="status">
              {props.hoverText}
            </div>
          ) : null}
          {props.children}
        </div>
      </div>
    );
  return (
    <div class={`view3d-frame ${showLegend && legendOpen ? "legend-open" : showLegend ? "legend-folded" : "legend-none"} ${props.class ?? ""}`}>
      <div class="view3d">
      <canvas ref={canvas} aria-label={props.label} />
      {error ? <p class="view3d-error">{error}</p> : null}
      <div ref={controls} class="view3d-controls" role="group" aria-label="View">
        {topDown}
        {reset}
        {props.togglesInButtons ? toggles : null}
        {props.viewButtons}
        {props.lookMenu === false ? null : <LookMenu renderer={made} />}
      </div>
      {compassDial}
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
              {legendBody}
            </div>
          ) : null}
        </aside>
      )}
    </div>
  );
}

/** A row of the Show column (Layout 2): a 14px checkbox at the left of its name, as in Timberborn's settings; the
 *  row itself is never lit, a click anywhere on it toggles it. An overlay's own legend sits beside it while it is
 *  on. */
export function ShowRow(p: { on: boolean; onToggle(): void; tip: { title: string; "data-keys"?: string }; children: ComponentChildren; legend?: ComponentChildren; controls?: string }) {
  return (
    <div class="show-item">
      <button type="button" class="show-row" role="checkbox" aria-checked={p.on} aria-controls={p.controls} {...p.tip} onClick={p.onToggle}>
        <span class={`cb${p.on ? " on" : ""}`} aria-hidden="true">
          {p.on ? (
            <svg viewBox="0 0 12 12">
              <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          ) : null}
        </span>
        <span class="cb-word">{p.children}</span>
      </button>
      {p.on && p.legend ? p.legend : null}
    </div>
  );
}
