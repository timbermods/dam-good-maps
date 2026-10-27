// A renderer made ready while the first map loads (PLAN §20 D367, part 1; investigation/startup round
// 2): the page starts it as a map's download or opening begins, and the 3D view takes it, canvas and
// WebGL context together, instead of making its own, so the map's first frame compiles no program and
// finds the GPU warm (`MapRenderer.prepareFirstFrame`). One at a time; a page that ends up not showing
// a map drops it (`discardPreparedRenderer`). Nothing here changes what is drawn.

import { MapRenderer } from "./renderer";

interface Prepared {
  renderer: MapRenderer;
  host: HTMLElement;
  ready: Promise<void>;
}

let prepared: Prepared | null = null;

/** Start making a renderer ready, off screen (again while one is ready or on its way: that one).
 *  Resolves once it is warm; a browser without WebGL leaves none, and the view's own error shows. */
export function prepareRenderer(): Promise<void> {
  if (prepared) return prepared.ready;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:64px;height:64px;opacity:0;pointer-events:none";
  const canvas = document.createElement("canvas");
  host.append(canvas);
  document.body.append(host);
  let renderer: MapRenderer;
  try {
    renderer = new MapRenderer(canvas);
  } catch {
    host.remove();
    return Promise.resolve();
  }
  const p: Prepared = {
    renderer,
    host,
    ready: renderer.prepareFirstFrame().catch(() => {
      if (prepared === p) discardPreparedRenderer();
    }),
  };
  prepared = p;
  return p.ready;
}

/** The ready renderer, its canvas moved into `container` (the view's own place for it), or null when
 *  none was made. Taken once. */
export function takePreparedRenderer(container: HTMLElement): MapRenderer | null {
  const p = prepared;
  if (!p) return null;
  prepared = null;
  container.append(p.renderer.canvas);
  p.host.remove();
  p.renderer.adopted();
  return p.renderer;
}

/** Drop the ready renderer (the page shows no map after all, or leaves). */
export function discardPreparedRenderer(): void {
  const p = prepared;
  prepared = null;
  p?.renderer.dispose();
  p?.host.remove();
}
