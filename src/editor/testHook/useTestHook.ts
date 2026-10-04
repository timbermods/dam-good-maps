// The test hook on window (tests/e2e), and the refs it reads.

import { useEffect, useRef } from "preact/hooks";
import type { StartStatus } from "../features";
import type { Ed } from "../ed";

export interface TestHookSlice {
  fitRef: { current: { tiles: number[]; problem: string | null; level?: number; status?: StartStatus | "pending" } | null };
}

export function useTestHook(ed: Ed): TestHookSlice {
  const {
    api, renderer, gestureRef, startDrag, selection, juice, instant, fit, queue, infoRef, run, pendingTerrain,
    strokeMismatches, localUndo, startHintRef, hintMs, quakeUiRef, forcer, strokeRadius, glowCorners
  } = ed;

  // ------------------------------------------------------------------------------ test hook

  useEffect(() => {
    window.dgmEditor = {
      info: () => infoRef.current,
      tileToClient: (x, y) => renderer.current!.tileToClient(x, y),
      idle: () => queue.current.then(() => undefined),
      instant: () => instantRef.current,
      fit: () => fitRef.current,
      edit: (op, label) => run(() => api.apply(op, "user", label)),
      startCheck: () => startDragRef.current?.check ?? null,
      worker: api,
      strokeMismatches: () => strokeMismatches.current,
      lastStroke: () => localUndo.current.at(-1)?.params ?? null,
      pendingTerrain: () => pendingTerrain.current,
      carve: () => (forcer.current?.status?.verb === "carve" ? { ...forcer.current.status } : null),
      force: () => (forcer.current?.status ? { ...forcer.current.status } : null),
      forceTiming: () => (forcer.current?.timing ? { ...forcer.current.timing } : null),
      startHint: () => (startHintRef.current ? { x: startHintRef.current.x, y: startHintRef.current.y, strong: startHintRef.current.strong, ms: hintMs.current } : null),
      sound: () => juice.current?.status() ?? null,
      sourceGlow: () => glowCorners.current.slice(),
      selection: () => selection.current.tiles(),
      // (the water's pace, for tests that wait on it: the page has no Speed control, Kyler, 2026-10-04)
      waterSpeed: (speed) => ed.player.current?.setSpeed(speed),
      gesture: () => {
        const g = gestureRef.current;
        return { stroke: g.forceStroke ? g.forceStroke.length : null, band: g.forceStroke ? strokeRadius.current : null, cursor: g.forceCursor, side: quakeUiRef.current.side, ring: g.forceRing ? g.forceRing.r : null };
      },
    };
    return () => {
      delete window.dgmEditor;
    };
  }, []);
  const instantRef = useRef(instant);
  instantRef.current = instant;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const startDragRef = useRef(startDrag);
  startDragRef.current = startDrag;

  return { fitRef };
}
