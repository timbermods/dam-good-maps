// "The start fits here" (D204): the hint after a Flatten stroke and the search for the spot.

import { wrap, type Remote } from "comlink";
import type { JSX } from "preact";
import { useEffect, useRef, useState, type Dispatch, type StateUpdater } from "preact/hooks";
import { cornerFor } from "../../core/doc/tools";
import { startEntranceTile } from "../../core/format/footprints";
import { startProblemAt } from "../features";
import type { StartCheckApi } from "../startCheck.worker";
import { startSpots } from "../startHint";
import type { BrushParams } from "../../core/features/raster/brush";
import type { Ed } from "../ed";

export interface StartHintSlice {
  setStartHint: Dispatch<StateUpdater<{ x: number; y: number; z: number; strong: boolean } | null>>;
  hintRef: { current: boolean };
  startHintRef: { current: { x: number; y: number; z: number; strong: boolean } | null };
  hintJob: { current: number };
  startWorkerApi: () => Remote<StartCheckApi>;
  hintMs: { current: number };
  lookForStartRef: { current: (p: BrushParams, job?: number, now?: boolean) => void };
  startHintTag: () => JSX.Element | null;
}

export function useStartHint(ed: Ed): StartHintSlice {
  const { api, info, mirror, renderer, mounted, viewTick, indexed, needs, run, painter, ctx, startHere } = ed;

  // "the start fits here" (D204): after a Flatten stroke, a spot on its level ground for the district
  // center, looked for once the stroke is on the map and the page is idle; a click moves the start
  // there (one step)
  const [startHint, setStartHint] = useState<{ x: number; y: number; z: number; strong: boolean } | null>(null);
  const hintRef = useRef(false);
  hintRef.current = startHint !== null;
  const startHintRef = useRef(startHint);
  startHintRef.current = startHint;
  const hintJob = useRef(0);
  const hintTimer = useRef(0);
  function lookForStart(p: BrushParams) {
    const job = hintJob.current;
    const idle = (fn: () => void) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(fn, { timeout: 1500 }) : window.setTimeout(fn, 100));
    idle(() => {
      if (job !== hintJob.current || !mounted.current) return;
      // (never while painting: it waits for the stroke to end)
      if (painter.current?.painting) return;
      lookForStartRef.current(p, job, true);
    });
  }
  /** The start's full check, off the page (made at the first hint). */
  const startChecker = useRef<Remote<StartCheckApi> | null>(null);
  const startWorker = useRef<Worker | null>(null);
  useEffect(() => () => startWorker.current?.terminate(), []);
  function startWorkerApi(): Remote<StartCheckApi> {
    if (!startChecker.current) {
      startWorker.current = new Worker(new URL("../startCheck.worker.ts", import.meta.url), { type: "module" });
      startChecker.current = wrap<StartCheckApi>(startWorker.current);
    }
    return startChecker.current;
  }
  function findStart(p: BrushParams, job: number) {
    const s = startHere;
    const m = mirror.current;
    if (!s || !m.water) return;
    const t0 = performance.now();
    const W = info.W;
    // the quick part here: a spot on the stroke's level ground where the district center stands
    const spots = startSpots(p, m.heights, m.water.depth, W, info.H, s.orientation, s);
    const c = ctx();
    for (const sp of spots) {
      const [cx, cy] = cornerFor(sp.x, sp.y, s.orientation);
      const door = startEntranceTile(cx, cy, s.orientation);
      if (startProblemAt(c, sp.x, sp.y, door, null, s.owner)) continue;
      hintMs.current = Math.round(performance.now() - t0);
      const z = m.heights[sp.y * W + sp.x];
      setStartHint({ x: sp.x, y: sp.y, z, strong: false });
      clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setStartHint(null), 9000);
      // the start's requirements there (a walk over the whole map), in the background
      const f = s.feature ? info.features.find((g) => g.id === s.feature) : undefined;
      const bench = f && f.kind === "start" ? { level: z, radius: f.params.benchRadius } : null;
      void startWorkerApi()
        .check({ W, H: info.H, heights: m.heights, water: m.water, entities: m.entities, river: indexed?.river ?? null, x: sp.x, y: sp.y, door, bench, self: s.owner, needs })
        .then((check) => {
          if (job !== hintJob.current || !mounted.current) return;
          hintMs.current = Math.round(performance.now() - t0);
          if (check.problem) return setStartHint(null);
          if (check.meets) setStartHint((h) => (h && h.x === sp.x && h.y === sp.y ? { ...h, strong: true } : h));
        })
        .catch(() => undefined);
      return;
    }
    hintMs.current = Math.round(performance.now() - t0);
  }
  const hintMs = useRef(0);
  const lookForStartRef = useRef<(p: BrushParams, job?: number, now?: boolean) => void>(() => undefined);
  lookForStartRef.current = (p, job, now) => (now ? findStart(p, job ?? hintJob.current) : lookForStart(p));
  function startHintTag() {
    const r = renderer.current;
    const h = startHint;
    if (!r || !h) return null;
    void viewTick;
    const at = r.project(h.x + 0.5, h.z + 0.3, -(h.y + 0.5));
    if (!at.visible) return null;
    return (
      <button
        type="button"
        class={`map-note map-tag start-hint${h.strong ? " strong" : ""}`}
        style={{ left: `${at.x}px`, top: `${at.y}px` }}
        onClick={() => {
          setStartHint(null);
          void run(() => api.moveStartTo(h.x, h.y));
        }}
      >
        {h.strong ? "Move the start here: water, wood and berries in reach" : "Move the start here"}
      </button>
    );
  }

  return { setStartHint, hintRef, startHintRef, hintJob, startWorkerApi, hintMs, lookForStartRef, startHintTag };
}
