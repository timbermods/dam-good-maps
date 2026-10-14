// The sources' labels drawn over the map: where each stands comes from `layoutLabels` (nudged off one another and
// off the open panels, merged when there is no room), measured from the page as it is now.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { layoutLabels, type LabelIn, type LayoutEnv, type Rect } from "./labelLayout";

/** What the labels keep clear of: the panels and controls drawn over the map, by what they are called on the page. */
const OBSTACLES = [
  ".show-bar",
  ".legend-row",
  ".legend-panel",
  ".show-key",
  ".view3d-corner > *",
  ".water-bar",
  ".tool-dock > *",
  ".objects-dock > *",
  ".minimap",
  ".readout",
  ".coords",
  ".working",
  ".side-panel",
  ".gen",
  ".maps-panel",
  ".places-panel",
];

interface Measured {
  w: number;
  h: number;
  obstacles: Rect[];
  /** The label's font and its box height, read from a label's own style. */
  font: string;
  strongFont: string;
  height: number;
}

const START: Measured = { w: 0, h: 0, obstacles: [], font: "12px sans-serif", strongFont: "600 12px sans-serif", height: 24 };

let canvasContext: CanvasRenderingContext2D | null | undefined;
function textWidth(font: string, words: string): number {
  if (canvasContext === undefined) canvasContext = document.createElement("canvas").getContext("2d");
  if (!canvasContext) return words.length * 6.6;
  canvasContext.font = font;
  return canvasContext.measureText(words).width;
}

/** The page's panels over this view, and the label's own look, in the view's pixels. */
function measure(box: HTMLElement, before: Measured): Measured {
  const view = box.getBoundingClientRect();
  const obstacles: Rect[] = [];
  const root = box.parentElement ?? document.body;
  for (const sel of OBSTACLES) {
    for (const el of root.querySelectorAll(sel)) {
      if (box.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === "hidden") continue;
      // (a panel is hidden by `hidden` or `display`, which leave no box; one that covers the whole view is no panel)
      if (r.width * r.height > view.width * view.height * 0.6) continue;
      obstacles.push({ x: r.x - view.x, y: r.y - view.y, w: r.width, h: r.height });
    }
  }
  // the panels that lie over the view from outside it (the generator, Your maps, Real places)
  for (const sel of [".gen", ".maps-panel", ".places-panel"]) {
    for (const el of document.querySelectorAll(sel)) {
      if (root.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      obstacles.push({ x: r.x - view.x, y: r.y - view.y, w: r.width, h: r.height });
    }
  }
  let { font, strongFont, height } = before;
  const label = box.querySelector(".source-marker");
  if (label instanceof HTMLElement) {
    const s = getComputedStyle(label);
    font = `${s.fontStyle} 400 ${s.fontSize} ${s.fontFamily}`;
    strongFont = `${s.fontStyle} 600 ${s.fontSize} ${s.fontFamily}`;
    height = label.offsetHeight || height;
  }
  return { w: view.width, h: view.height, obstacles, font, strongFont, height };
}

const same = (a: Measured, b: Measured) =>
  a.w === b.w && a.h === b.h && a.font === b.font && a.height === b.height && a.obstacles.length === b.obstacles.length && a.obstacles.every((o, i) => o.x === b.obstacles[i].x && o.y === b.obstacles[i].y && o.w === b.obstacles[i].w && o.h === b.obstacles[i].h);

/** The labels of the sources shown, each with its place on the screen. */
export function SourceLabels(p: { items: LabelIn[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Measured>(START);
  const now = useRef(m);
  now.current = m;

  const remeasure = () => {
    if (!box.current) return;
    const next = measure(box.current, now.current);
    if (!same(next, now.current)) setM(next);
  };
  // after every draw (the panels may have moved since), and when the page's panels open, close or move
  useLayoutEffect(remeasure);
  useEffect(() => {
    const root = box.current?.parentElement;
    if (!root) return;
    let timer = 0;
    const later = (records: MutationRecord[]) => {
      if (records.every((r) => box.current?.contains(r.target))) return;
      remeasure();
      // (panels glide in and out: once more when they have settled)
      clearTimeout(timer);
      timer = window.setTimeout(remeasure, 320);
    };
    const mo = new MutationObserver(later);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-checked", "aria-pressed", "open"] });
    const onResize = () => remeasure();
    window.addEventListener("resize", onResize);
    return () => {
      mo.disconnect();
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const env: LayoutEnv = {
    bounds: { w: m.w || 100000, h: m.h || 100000 },
    obstacles: m.obstacles,
    height: m.height,
    // (a little over, so a label never crowds its neighbour by the width's rounding)
    width: (words, strong) => textWidth(strong ? m.strongFont : m.font, words) + 20 + (strong ? 6 : 2),
  };
  // (what each label did last frame comes back in, so a label stays put while the camera moves and is still clear)
  const last = useRef(new Map<number, { dx: number; dy: number; into: number | null }>());
  const laid = layoutLabels(
    p.items.map((i) => ({ ...i, prev: last.current.get(i.id) ?? null })),
    env,
  );
  last.current = new Map(laid.map((l) => [l.id, { dx: l.dx, dy: l.dy, into: l.into }]));
  const byId = new Map(p.items.map((i) => [i.id, i]));
  // a label moved more than its own height keeps a thin line to its source
  const leaders = laid.filter((l) => !l.hidden && Math.hypot(l.dx, l.dy) > m.height);
  return (
    <div ref={box} class="source-markers" aria-hidden="true" style={m.w ? undefined : { visibility: "hidden" }}>
      <svg class="source-leaders" width={m.w || 1} height={m.h || 1}>
        {leaders.map((l) => {
          const x = Math.max(l.box.x, Math.min(l.ax, l.box.x + l.box.w));
          const y = Math.max(l.box.y, Math.min(l.ay, l.box.y + l.box.h));
          return (
            <g key={l.id} class={l.bad ? "bad" : undefined}>
              <line x1={l.ax} y1={l.ay} x2={x} y2={y} />
              <circle cx={l.ax} cy={l.ay} r="2.5" />
            </g>
          );
        })}
      </svg>
      {laid.map((l) => {
        if (l.hidden) return null;
        const ids = [l.id, ...l.merged].map((k) => byId.get(k)!);
        const feeding = ids.some((s) => s.feeding);
        const target = ids.some((s) => s.target);
        return (
          <span key={l.id} class={`map-note source-marker${l.bad ? " bad" : ""}${feeding ? " feeding" : ""}${target ? " target" : ""}`} style={{ left: `${l.x}px`, top: `${l.y}px` }} data-sources={l.count}>
            {l.words}
          </span>
        );
      })}
    </div>
  );
}
