// The minimap (PLAN §20 D205): a small top-down picture of the whole map in a corner, the Real
// places look (`core/render/shade.ts`: height and a hillshade, water blue), drawn again when the
// page is idle after an edit settles, never per frame; the outline is what the camera sees, and a
// click or a drag on it moves the camera there.

import { useEffect, useRef } from "preact/hooks";
import { shadeTiles } from "../core/render/shade";
import type { MapRenderer } from "../render3d";

export interface MinimapProps {
  W: number;
  H: number;
  renderer: MapRenderer | null;
  /** The map as it stands (read when it is drawn). */
  heights(): Uint8Array;
  depth(): ArrayLike<number> | null;
  /** Changes when the map's ground or water has settled after an edit: it is drawn again. */
  stamp: string;
  /** Changes when the camera moves: the outline follows. */
  viewTick: number;
}

/** The minimap's size on the page, in pixels (the map's longer side). */
const SIZE = 168;

export function Minimap(p: MinimapProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  const scale = SIZE / Math.max(p.W, p.H);
  const w = Math.round(p.W * scale);
  const h = Math.round(p.H * scale);

  // the picture: one pixel a tile, north up, drawn when the page is idle
  useEffect(() => {
    let live = true;
    const draw = () => {
      if (!live) return;
      const c = canvas.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const rgb = shadeTiles(p.heights(), p.W, p.H, p.depth());
      const img = ctx.createImageData(p.W, p.H);
      for (let y = 0; y < p.H; y++)
        for (let x = 0; x < p.W; x++) {
          const i = y * p.W + x;
          const o = ((p.H - 1 - y) * p.W + x) * 4;
          img.data[o] = rgb[i * 3];
          img.data[o + 1] = rgb[i * 3 + 1];
          img.data[o + 2] = rgb[i * 3 + 2];
          img.data[o + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    };
    const idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(draw, { timeout: 1500 }) : window.setTimeout(draw, 200);
    return () => {
      live = false;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, [p.stamp, p.W, p.H]);

  const outline = p.renderer ? p.renderer.groundFootprint() : [];
  void p.viewTick;
  const pts = outline.map(([x, y]) => `${(x * scale).toFixed(1)},${((p.H - y) * scale).toFixed(1)}`).join(" ");

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
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        {pts ? <polygon points={pts} /> : null}
      </svg>
    </div>
  );
}
