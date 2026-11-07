// Whether this browser can record the time-lapse (File → Record a time-lapse…, shown only where it can): a video
// encoder (WebCodecs) and WebGL 2; and whether it can draw the map's picture (File → Save a picture): WebGL 2 on a
// GPU, as render3d/hero.ts `canDrawHero` asks (that module stays in its own chunk, loaded when a picture is drawn).
// Asked once a page: a throwaway WebGL context costs the page's thread tens of milliseconds.

import { softwareRendering } from "../../render3d/renderer";

let can: boolean | undefined;
let webgl2: boolean | undefined;

function hasWebgl2(): boolean {
  try {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2");
    g?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!g;
  } catch {
    return false;
  }
}

/** Whether File → Save a picture can draw here (render3d/hero.ts `canDrawHero`'s test). */
export function canDrawPicture(): boolean {
  if (softwareRendering() && !window.dgmLookTest?.gpu) return false;
  return (webgl2 ??= hasWebgl2());
}

export function canRecordTimelapse(): boolean {
  if (can !== undefined) return can;
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return (can = false);
  return (can = webgl2 ??= hasWebgl2());
}
