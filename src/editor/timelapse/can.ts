// Whether this browser can record the time-lapse (File → Record a time-lapse…, shown only where it can): a video
// encoder (WebCodecs) and WebGL 2. Asked once a page: a throwaway WebGL context costs the page's thread tens of
// milliseconds (render3d/hero.ts `canDrawHero` asks the same way).

let can: boolean | undefined;

export function canRecordTimelapse(): boolean {
  if (can !== undefined) return can;
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return (can = false);
  try {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2");
    g?.getExtension("WEBGL_lose_context")?.loseContext();
    can = !!g;
  } catch {
    can = false;
  }
  return can;
}
