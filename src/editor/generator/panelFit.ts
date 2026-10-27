// How the map generator's panel fits the room it has (D330: every setting shows at once, nothing scrolling). The panel has
// four shapes, the first that fits the room under the band and above the bar winning: two columns, 640px wide, as it
// has always been (the sizes the page is designed for, 1920×1080 and up); three columns wider and shorter (a laptop's
// window); and each with every row a little tighter (a short window). The band's layout
// (view/useBandLayout.ts) measures the room and chooses; the panel (GeneratorPanel.tsx) draws the shape chosen. The heights
// are what each shape needs, whole, and tests/e2e/generatorFit.spec.ts holds them true to the page.

import { useEffect, useState } from "preact/hooks";

export interface PanelShape {
  /** Columns of settings. */
  cols: 2 | 3;
  /** The panel's width, border to border. */
  width: number;
  /** The panel's height with nothing cut. */
  height: number;
  /** Every row a few pixels tighter. */
  tight: boolean;
}

/** The shapes, roomiest first. */
export const SHAPES: readonly PanelShape[] = [
  { cols: 2, width: 640, height: 692, tight: false },
  { cols: 3, width: 880, height: 509, tight: false },
  { cols: 3, width: 880, height: 449, tight: true },
  { cols: 2, width: 640, height: 594, tight: true },
];

/** The shape that fits `room` (its height, for a panel of that width) and the width left; when none fits, the shortest
 *  one that is not too wide (the panel then scrolls inside, with its fade at the foot). */
export function chooseShape(room: (width: number) => number, widest: number): PanelShape {
  const wide = SHAPES.filter((s) => s.width <= widest);
  const pool = wide.length ? wide : [SHAPES[0]];
  return pool.find((s) => s.height <= room(s.width)) ?? pool.reduce((a, s) => (s.height < a.height ? s : a));
}

let shape: PanelShape = SHAPES[0];
const listeners = new Set<() => void>();

/** The band's layout tells the panel its shape. */
export function setPanelShape(s: PanelShape): void {
  if (s === shape) return;
  shape = s;
  listeners.forEach((l) => l());
}

/** The shape the panel has now. */
export function usePanelShape(): PanelShape {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return shape;
}
