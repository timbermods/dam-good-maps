// The map's picture (D488): the .timber's map_thumbnail.jpg drawn in 3D, as the game's own maps show
// in its map picker: looking down at an angle from where the new game's camera opens, the land
// filling the frame under a band of sky. One frame, drawn by a renderer of its own, off screen, so the
// player's view (its camera, look and size) is never touched; in the High look with every effect
// (Standard where High can't be drawn). Only what the game shows: the land, the water, the objects;
// no layer, overlay, cursor, highlight or drought line. The page saves it in place of the core's
// top-down thumbnail (`src/editor/save/hero.ts`).

import { DEFAULT_YAW, drawnOutline, MapRenderer, softwareRendering } from "./renderer";
import type { EntityView, MapView } from "./model";

/** The picture's size: the game's thumbnails' (FORMAT.md §1). */
export const HERO_W = 960;
export const HERO_H = 540;
/** How far the camera looks down (the official maps' pictures: about 35–55°). */
const HERO_PITCH = (40 * Math.PI) / 180;
/** The new game's camera turns this far past the start's orientation (investigation/notes/blocks_and_placement.md §3). */
const START_TURN = 35;
/** The land's width across the frame (a little over it: the near corners run off its sides). */
const FILL = 1.15;
/** The band of sky above the map's far edge, as a share of the frame's height. */
const SKY = 0.08;
/** The moment the water and the wind are held at. */
const CLOCK = 6;
/** The longest wait for the look's fields (the occlusion and the moving water's, from the page's bake worker)
 *  before the frame is drawn anyway: a save never waits long on its picture. */
const SETTLE_MS = 3000;

/** The picture's turn (the renderer's yaw): the game's new-game camera, the start's orientation
 *  angle + 35° clockwise from north; the default view's without a start. */
export function heroYaw(e: EntityView): number {
  for (let k = 0; k < e.count; k++) {
    if (e.templates[e.template[k]] !== "StartingLocation") continue;
    // (the renderer's yaw turns the other way from the game's horizontal angle: DEFAULT_YAW is the
    // game's 30° east of north)
    return -(((e.orientation[k] & 3) * 90 + START_TURN) * Math.PI) / 180;
  }
  return DEFAULT_YAW;
}

/** Whether the picture can be drawn here: a GPU (not software rendering) with WebGL 2. */
export function canDrawHero(): boolean {
  if (softwareRendering() && !window.dgmLookTest?.gpu) return false;
  try {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2");
    g?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!g;
  } catch {
    return false;
  }
}

/** The map's picture as a 960×540 JPEG, or null where it can't be drawn (no GPU, no WebGL 2). Throws
 *  when drawing fails; the caller keeps the core's thumbnail then. */
export async function heroPicture(view: MapView, quality = 0.9): Promise<Uint8Array | null> {
  if (!canDrawHero()) return null;
  const host = document.createElement("div");
  // off screen at the picture's size (CSS pixels; the renderer draws at up to twice them, scaled down below)
  host.style.cssText = `position:fixed;left:-${HERO_W * 4}px;top:0;width:${HERO_W}px;height:${HERO_H}px;pointer-events:none;opacity:0`;
  host.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.append(canvas);
  document.body.append(host);
  let r: MapRenderer | null = null;
  try {
    r = new MapRenderer(canvas, { still: true });
    r.holdShowcase();
    r.setClock(CLOCK);
    r.setMap(view, false, true);
    frameHero(r, view);
    const t0 = performance.now();
    while (!r.highSettled && performance.now() - t0 < SETTLE_MS) {
      r.renderNow();
      await new Promise((done) => setTimeout(done, 30));
    }
    r.renderNow();
    // (in the same task as the frame: the canvas keeps no copy of it after)
    const out = document.createElement("canvas");
    out.width = HERO_W;
    out.height = HERO_H;
    const g = out.getContext("2d");
    if (!g) throw new Error("no 2D canvas to encode the picture");
    g.imageSmoothingQuality = "high";
    g.drawImage(r.canvas, 0, 0, HERO_W, HERO_H);
    const blob = await new Promise<Blob | null>((done) => out.toBlob(done, "image/jpeg", quality));
    if (!blob) throw new Error("the browser could not encode the picture");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    r?.dispose();
    host.remove();
  }
}

/** Point the camera as the game's thumbnails do: turned as the new game opens, looking down at
 *  HERO_PITCH, the map's width filling the frame and its far edge under a band of sky. */
function frameHero(r: MapRenderer, view: MapView): void {
  const { W, H, heights } = view;
  let sum = 0;
  for (let i = 0; i < heights.length; i++) sum += heights[i];
  const level = sum / heights.length;
  const outline = drawnOutline(W, H, heights);
  r.setView({ mode: "orbit", yaw: heroYaw(view.entities), pitch: HERO_PITCH, distance: Math.max(W, H) * 1.6, target: [W / 2, level, -H / 2] });
  const box = () => r.screenBox(outline);
  const rect = r.canvas.getBoundingClientRect();
  for (let pass = 0; pass < 8; pass++) {
    let b = box();
    const s = (b.x1 - b.x0) / (FILL * HERO_W);
    const v = r.getView();
    if (Number.isFinite(s) && s > 0) r.setView({ distance: Math.min(v.distance * s, Math.max(W, H) * 6) });
    b = box();
    // the box's middle across, and its top SKY down from the frame's: the ground under where it is moved to where it goes
    const at = r.pickAtLevel(rect.left + (b.x0 + b.x1) / 2, rect.top + b.y0 + HERO_H / 2, level);
    const to = r.pickAtLevel(rect.left + HERO_W / 2, rect.top + SKY * HERO_H + HERO_H / 2, level);
    if (!at || !to) break;
    const t = r.getView().target;
    r.setView({ target: [t[0] + at.point[0] - to.point[0], t[1], t[2] + at.point[2] - to.point[2]] });
  }
}
