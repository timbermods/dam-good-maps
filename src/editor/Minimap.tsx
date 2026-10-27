// The minimap (PLAN §20 D205): a small top-down picture of the whole map in a corner, the Real
// places look (`core/render/shade.ts`: height and a hillshade, water blue), drawn again when the
// page is idle after an edit settles, never per frame; a click or a drag on it moves the camera there. It draws no
// outline of the view (Kyler, 2026-10-04: with the whole map on screen only one edge of it crossed the picture).

import { useEffect, useRef } from "preact/hooks";
import { groundShade, shadeRgba } from "../core/render/shade";
import type { MapRenderer } from "../render3d";
import { minimapSize } from "./minimapSize";

export interface MinimapProps {
  W: number;
  H: number;
  renderer: MapRenderer | null;
  /** The map as it stands (read when it is drawn). */
  heights(): Uint8Array;
  depth(): ArrayLike<number> | null;
  /** Changes when the map's ground or water has settled after an edit: it is drawn again. */
  stamp: string;
}

export function Minimap(p: MinimapProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  const { w, h } = minimapSize(p.W, p.H);

  // the picture: one pixel a tile, north up, drawn when the page is idle. The land's colours are kept while the land is
  // the same, and so are the pixels the water hasn't moved on: as the water flows, a draw shades and puts only the rows
  // it changed (a 256² flood shaded the whole map at every settle, D453)
  const ground = useRef<{ heights: Uint8Array; shade: Float64Array } | null>(null);
  const image = useRef<{ data: ImageData; shown: Float64Array } | null>(null);
  useEffect(() => {
    let live = true;
    const draw = () => {
      if (!live) return;
      const c = canvas.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      let img = image.current;
      if (!img || img.data.width !== p.W || img.data.height !== p.H) image.current = img = { data: ctx.createImageData(p.W, p.H), shown: new Float64Array(p.W * p.H).fill(NaN) };
      const heights = p.heights();
      let g = ground.current;
      if (!g || !sameLand(g.heights, heights)) {
        ground.current = g = { heights: heights.slice(), shade: groundShade(heights, p.W, p.H) };
        // (new land: every pixel is shaded again)
        img.shown.fill(NaN);
      }
      const rows = shadeRgba(g.shade, p.W, p.H, p.depth(), img.shown, img.data.data);
      if (rows) ctx.putImageData(img.data, 0, 0, 0, rows.y0, p.W, rows.y1 - rows.y0);
    };
    const idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(draw, { timeout: 1500 }) : window.setTimeout(draw, 200);
    return () => {
      live = false;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, [p.stamp, p.W, p.H]);
  // (a canvas the browser let go of comes back blank: its next draw puts every pixel again)
  useEffect(() => {
    const c = canvas.current;
    const again = () => void image.current?.shown.fill(NaN);
    c?.addEventListener("contextrestored", again);
    return () => c?.removeEventListener("contextrestored", again);
  }, []);

  // the view reads its height from --minimap-h: the readout and the coordinates stand on it (Layout 2)
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = box.current?.parentElement;
    view?.style.setProperty("--minimap-h", `${h}px`);
    return () => view?.style.removeProperty("--minimap-h");
  }, [h]);

  /** Move the camera to the tile under a point of the minimap. */
  const moveTo = (ev: PointerEvent) => {
    const r = p.renderer;
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    if (!r) return;
    const x = Math.max(0, Math.min(p.W - 1, Math.floor(((ev.clientX - box.left) / box.width) * p.W)));
    const y = Math.max(0, Math.min(p.H - 1, Math.floor(p.H - ((ev.clientY - box.top) / box.height) * p.H)));
    r.setView({ target: [x + 0.5, r.heightAt(x, y), -(y + 0.5)] });
  };

  return (
    <div
      ref={box}
      class="minimap"
      role="img"
      aria-label="Minimap: the whole map from above; click or drag to move the camera there"
      style={{ width: `${w}px`, height: `${h}px` }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = true;
        moveTo(e);
      }}
      onPointerMove={(e) => drag.current && moveTo(e)}
      onPointerUp={() => void (drag.current = false)}
      onPointerCancel={() => void (drag.current = false)}
    >
      <canvas ref={canvas} width={p.W} height={p.H} />
    </div>
  );
}

/** Whether two maps' heights are the same, tile for tile. */
function sameLand(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
