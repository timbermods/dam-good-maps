// The brush, level lines and clear water kept in step with the renderer, and the problems' actions.

import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { whereOf, type ItemActions } from "../panels";
import type { Verb } from "../../core/forces/op";
import { sizeMax } from "../brushes";
import type { Ed } from "../ed";

export interface ViewSyncSlice {
  toolRef: { current: Verb | null };
  actions: ItemActions;
}

export function useViewSync(ed: Ed): ViewSyncSlice {
  const { info, renderer, ready, tool, clearWater, brushTool, brush, brushRef, setBrush, painter, applyFix } = ed;

  // a brush out takes the map's left button (set at once when it is picked, usePaint.ts pickBrush; here at the
  // commit, never a frame later); put away, the brush under the cursor goes
  useLayoutEffect(() => {
    const r = renderer.current;
    const p = painter.current;
    if (!r || !p) return;
    if (brushTool) {
      r.tool = p.tool;
      p.showCursor();
    } else {
      if (r.tool === p.tool) r.tool = null;
      p.hideCursor();
    }
  }, [brushTool, ready]);
  // a size saved on a larger map: at most this map's largest (D322, item 42)
  useEffect(() => {
    const max = sizeMax(info.W, info.H);
    if (brushRef.current.size > max) setBrush({ ...brushRef.current, size: max }, false);
  }, [info.W, info.H]);
  // a new size, strength or level shows on the brush under the cursor at once
  useEffect(() => painter.current?.showCursor(), [brush]);
  // level lines while the toggle is on (the brush kit)
  useEffect(() => renderer.current?.setLevelLines(brush.levelLines), [brush.levelLines, ready]);
  // clear water (D212): T or Clear water makes all of it see-through; otherwise only the water under
  // and right round the brush (or the shelf's ghost) clears, while it is over water (the view
  // decides, renderer.ts clearNear), and on dry land the water stays as it is
  useEffect(() => renderer.current?.setClearWater(clearWater), [clearWater, ready]);

  const toolRef = useRef(tool);
  toolRef.current = tool;

  /** Fly the camera to a tile (a problem's "Show"). */
  function showTile(x: number, y: number) {
    const r = renderer.current;
    if (!r) return;
    r.setView({ target: [x + 0.5, r.heightAt(x, y), -(y + 0.5)], distance: Math.min(r.getView().distance, 60) });
  }

  const entityAt = (id: string): [number, number] | null => {
    // the page's view has no entity ids: a problem's entities are found by the worker's "where"
    void id;
    return null;
  };
  const actions: ItemActions = {
    onFix: (fix) => void applyFix(fix),
    onShow: (c) => {
      const at = whereOf(c, entityAt);
      if (at) showTile(at[0], at[1]);
    },
    canShow: (c) => !!whereOf(c, entityAt),
  };

  return { toolRef, actions };
}
