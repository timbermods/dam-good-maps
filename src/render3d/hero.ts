// The map's picture (D488): the .timber's map_thumbnail.jpg drawn in 3D, as the game's own maps show
// in its map picker: turned as the new game's camera opens (the start's orientation + 35°), the land
// filling the frame under a band of sky. It looks down at 40° and frames the whole map, as the official
// thumbnails do, not at the game's opening camera's 60° and zoom: a deliberate departure (D488). One frame, drawn by a renderer of its own, off screen, so the
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
/** The longest wait for the High look's occlusion (from the page's bake worker) before the frame is drawn anyway:
 *  a save never waits long on its picture. (The water is drawn still: nothing waits on the moving water.) */
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

/** What `heroPicture` draws: the picture's size in pixels (the default is the .timber thumbnail's, 960×540,
 *  which the saved file keeps byte for byte) and the JPEG's quality. Other sizes are for the page's own
 *  pictures (a card in Showcase mode): the same framing at any size, best at the thumbnail's 16:9. */
export interface HeroOptions {
  width?: number;
  height?: number;
  /** JPEG quality, 0–1 (default 0.9). */
  quality?: number;
}

/** The smallest and largest side of a picture (pixels). */
const MIN_SIDE = 16;
const MAX_SIDE = 4096;

function side(v: number | undefined, dflt: number, what: string): number {
  if (v === undefined) return dflt;
  if (!Number.isFinite(v) || Math.round(v) < MIN_SIDE || Math.round(v) > MAX_SIDE) throw new RangeError(`the picture's ${what} must be ${MIN_SIDE}–${MAX_SIDE} pixels, not ${v}`);
  return Math.round(v);
}

/** Pictures are drawn one at a time (a page asking for three draws them in turn): each uses a WebGL context
 *  of its own for a moment, and browsers keep only a few at once. */
let queue: Promise<unknown> = Promise.resolve();

/** The map's picture as a JPEG (960×540 unless `opts` gives a size), or null where it can't be drawn (no
 *  GPU, no WebGL 2). Throws when drawing fails; the caller keeps the core's thumbnail then. */
export async function heroPicture(view: MapView, opts: HeroOptions = {}): Promise<Uint8Array | null> {
  const w = side(opts.width, HERO_W, "width");
  const h = side(opts.height, HERO_H, "height");
  const run = queue.then(() => draw(view, w, h, opts.quality ?? 0.9));
  queue = run.catch(() => undefined);
  return await run;
}

/** The same picture as an object URL for an `<img>` (or null where it can't be drawn). The caller frees it
 *  with `URL.revokeObjectURL` when the picture goes. */
export async function heroPictureUrl(view: MapView, opts: HeroOptions = {}): Promise<string | null> {
  const jpeg = await heroPicture(view, opts);
  return jpeg ? URL.createObjectURL(new Blob([jpeg as BlobPart], { type: "image/jpeg" })) : null;
}

async function draw(view: MapView, pw: number, ph: number, quality: number): Promise<Uint8Array | null> {
  if (!canDrawHero()) return null;
  const host = document.createElement("div");
  // off screen at the picture's size (CSS pixels; the renderer draws at up to twice them, scaled down below)
  host.style.cssText = `position:fixed;left:-${pw * 4}px;top:0;width:${pw}px;height:${ph}px;pointer-events:none;opacity:0`;
  host.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.append(canvas);
  document.body.append(host);
  let r: MapRenderer | null = null;
  try {
    try {
      r = new MapRenderer(canvas, { still: true });
    } catch (e) {
      // (a context the renderer made before it failed is freed at once: browsers keep only a few)
      canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      throw e;
    }
    r.holdShowcase();
    r.setClock(CLOCK);
    r.setMap(view, false, true);
    frameHero(r, view, pw, ph);
    const t0 = performance.now();
    while (!r.highSettled && performance.now() - t0 < SETTLE_MS) {
      r.renderNow();
      await new Promise((done) => setTimeout(done, 30));
    }
    r.renderNow();
    // (in the same task as the frame: the canvas keeps no copy of it after)
    const out = document.createElement("canvas");
    out.width = pw;
    out.height = ph;
    const g = out.getContext("2d");
    if (!g) throw new Error("no 2D canvas to encode the picture");
    g.imageSmoothingQuality = "high";
    g.drawImage(r.canvas, 0, 0, pw, ph);
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
function frameHero(r: MapRenderer, view: MapView, w: number, h: number): void {
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
    const s = (b.x1 - b.x0) / (FILL * w);
    const v = r.getView();
    if (Number.isFinite(s) && s > 0) r.setView({ distance: Math.min(v.distance * s, Math.max(W, H) * 6) });
    b = box();
    // the box's middle across, and its top SKY down from the frame's: the ground under where it is moved to where it goes
    const at = r.pickAtLevel(rect.left + (b.x0 + b.x1) / 2, rect.top + b.y0 + h / 2, level);
    const to = r.pickAtLevel(rect.left + w / 2, rect.top + SKY * h + h / 2, level);
    if (!at || !to) break;
    const t = r.getView().target;
    r.setView({ target: [t[0] + at.point[0] - to.point[0], t[1], t[2] + at.point[2] - to.point[2]] });
  }
}
