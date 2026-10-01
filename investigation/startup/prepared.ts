import { MapRenderer } from "./renderer";

let prepared: { renderer:MapRenderer; host:HTMLElement } | null = null;
/** Start while the project fetch is in flight. Keep this WebGL context for the displayed map. */
export async function prepareFirstRenderer(): Promise<void> {
  if (prepared) return;
  const host=document.createElement("div"), canvas=document.createElement("canvas");
  host.style.cssText="position:fixed;left:0;top:0;width:64px;height:64px;opacity:0;pointer-events:none";
  host.append(canvas);document.body.append(host);
  try { const renderer=new MapRenderer(canvas); prepared={renderer,host}; await renderer.prepareFirstFrame(); }
  catch { prepared?.renderer.dispose(); prepared=null;host.remove(); } // View3D keeps its normal WebGL error path
}
export function takePreparedRenderer(container:HTMLElement): MapRenderer | null {
  if(!prepared)return null;
  const {renderer,host}=prepared;prepared=null;
  container.append(renderer.canvas);host.remove();renderer.fitPreparedCanvas();return renderer;
}
/** The loader calls this on cancellation, navigation or project-open failure. */
export function discardPreparedRenderer(): void { prepared?.renderer.dispose();prepared?.host.remove();prepared=null; }
