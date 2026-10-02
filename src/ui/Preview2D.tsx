// 2D top-down preview (PLAN §14.2): shaded terrain with the settled water (badwater brown), and
// layers for soil moisture, soil contamination and the land walkable from the start; entities, the start, and the outlines of the features the map was built from, with a hover
// label. North is up.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { GenerateResponse } from "../worker/api";
import { buildPreviewModel, composeLayers, describeTile, type LayerSet, type PreviewModel } from "./previewModel";

export interface Layers extends LayerSet {
  entities: boolean;
  features: boolean;
}

const TREE_COLORS: Record<string, [string, string]> = {
  Pine: ["#1f5a2c", "#6d6450"],
  Birch: ["#6fa84a", "#8b8270"],
  Oak: ["#3b7a26", "#7a705c"],
  Succulent: ["#9bb35e", "#9bb35e"],
};

function draw(canvas: HTMLCanvasElement, m: PreviewModel, r: GenerateResponse, layers: Layers, scale: number): void {
  const { W, H } = m;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // terrain (one pixel per tile, flipped so north is up), scaled without smoothing
  const img = new ImageData(W, H);
  const src = composeLayers(m, r, layers);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 3;
      const d = ((H - 1 - y) * W + x) * 4;
      img.data[d] = src[s];
      img.data[d + 1] = src[s + 1];
      img.data[d + 2] = src[s + 2];
      img.data[d + 3] = 255;
    }
  }
  const off = new OffscreenCanvas(W, H);
  off.getContext("2d")!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, W * scale, H * scale);
  const X = (x: number) => x * scale;
  const Y = (y: number) => (H - y) * scale;

  if (layers.entities) {
    const pad = Math.max(0.5, scale * 0.18);
    for (const e of r.entities) {
      const cx = X(e.x);
      const cy = Y(e.y + 1);
      if (TREE_COLORS[e.template]) {
        ctx.fillStyle = TREE_COLORS[e.template][e.dead ? 1 : 0];
        ctx.fillRect(cx + pad, cy + pad, scale - 2 * pad, scale - 2 * pad);
      } else if (e.template === "BlueberryBush") {
        ctx.fillStyle = "#8a3fb0";
        ctx.fillRect(cx + pad, cy + pad, scale - 2 * pad, scale - 2 * pad);
      } else if (e.template.startsWith("RuinColumnH")) {
        const h = Number(e.template.slice(11));
        ctx.fillStyle = `rgb(${110 + h * 14}, ${80 + h * 4}, ${70 + h * 6})`;
        ctx.fillRect(cx + pad * 0.5, cy + pad * 0.5, scale - pad, scale - pad);
      } else if (e.template === "WaterSource") {
        ctx.fillStyle = "#1c4fe0";
        ctx.beginPath();
        ctx.arc(cx + scale / 2, cy + scale / 2, Math.max(1.5, scale * 0.45), 0, Math.PI * 2);
        ctx.fill();
      } else if (e.template === "Slope") {
        // an arrow pointing uphill (the slope's high side)
        const dir = { Cw0: [0, -1], Cw90: [-1, 0], Cw180: [0, 1], Cw270: [1, 0] }[e.orientation as "Cw0"] ?? [0, 1];
        const mx = cx + scale / 2;
        const my = cy + scale / 2;
        const tipX = mx + dir[0] * scale * 0.45;
        const tipY = my - dir[1] * scale * 0.45;
        ctx.strokeStyle = "#f6e27a";
        ctx.lineWidth = Math.max(1, scale * 0.18);
        ctx.beginPath();
        ctx.moveTo(mx - dir[0] * scale * 0.35, my + dir[1] * scale * 0.35);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      }
    }
    const start = r.entities.find((e) => e.template === "StartingLocation");
    const sf = r.features.find((f) => f.kind === "start");
    if (start && sf && sf.kind === "start") {
      const [cx, cy] = sf.params.position;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(X(cx - 1), Y(cy + 2), 3 * scale, 3 * scale);
      const dir = { Cw0: [0, -1], Cw90: [-1, 0], Cw180: [0, 1], Cw270: [1, 0] }[sf.params.orientation];
      ctx.beginPath();
      ctx.moveTo(X(cx + 0.5 + dir[0] * 1.5), Y(cy + 0.5 + dir[1] * 1.5));
      ctx.lineTo(X(cx + 0.5 + dir[0] * 3), Y(cy + 0.5 + dir[1] * 3));
      ctx.stroke();
    }
  }

  if (layers.features) {
    ctx.save();
    for (const o of m.outlines) {
      ctx.strokeStyle = o.color;
      ctx.fillStyle = o.color;
      ctx.lineWidth = o.kind === "edges" ? 1.25 : 2;
      ctx.setLineDash(o.dashed ? [6, 4] : []);
      ctx.beginPath();
      if (o.kind === "edges") {
        for (let k = 0; k + 1 < o.points.length; k += 2) {
          ctx.moveTo(X(o.points[k][0]), Y(o.points[k][1]));
          ctx.lineTo(X(o.points[k + 1][0]), Y(o.points[k + 1][1]));
        }
        ctx.stroke();
      } else if (o.kind === "marker") {
        const [x, y] = o.points[0];
        ctx.arc(X(x), Y(y), Math.max(4, scale * 1.2), 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        o.points.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        if (o.kind === "polygon") ctx.closePath();
        ctx.globalAlpha = o.kind === "polyline" ? 0.55 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (o.label) {
        const [x, y] = o.kind === "polyline" ? o.points[Math.floor(o.points.length * 0.15)] : o.points[0];
        ctx.setLineDash([]);
        ctx.font = "600 12px system-ui, sans-serif";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.strokeText(o.label, X(x) + 6, Y(y) - 6);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(o.label, X(x) + 6, Y(y) - 6);
      }
    }
    ctx.restore();
  }
}

export function Preview2D({ result, layers }: { result: GenerateResponse; layers: Layers }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildPreviewModel(result), [result]);
  const [scale, setScale] = useState(3);
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const avail = Math.max(200, el.clientWidth - 2);
      setScale(Math.max(1, Math.min(8, Math.floor(avail / Math.max(result.W, result.H)))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [result]);

  useEffect(() => {
    if (canvas.current) draw(canvas.current, model, result, layers, scale);
  }, [model, result, layers, scale]);

  const onMove = (ev: MouseEvent) => {
    const rect = (ev.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left) / scale);
    const y = result.H - 1 - Math.floor((ev.clientY - rect.top) / scale);
    if (x < 0 || y < 0 || x >= result.W || y >= result.H) return setHover(null);
    setHover({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, lines: describeTile(model, result, x, y) });
  };

  return (
    <div class="preview" ref={wrap}>
      <div class="canvas-wrap">
        <canvas ref={canvas} onMouseMove={onMove} onMouseLeave={() => setHover(null)} aria-label="Map preview, north up" />
        {hover && (
          <div class="tooltip" style={{ left: `${hover.x + 14}px`, top: `${hover.y + 14}px` }}>
            {hover.lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
