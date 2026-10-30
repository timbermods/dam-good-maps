// The map's picture (D488): the .timber's map_thumbnail.jpg drawn in 3D, shown in the game's map picker. It is
// what the game shows from its own camera and light (`heroView.ts`): the new game's opening camera (60° down,
// turned to the start's orientation + 35°, the game camera's 35° field of view, at the default zoom's widest, the
// frame the start is turned for, D493), lit as the game lights its thumbnails (the sun turning with the camera), the
// start hidden as the game's thumbnails hide it. One frame, drawn by a renderer of its own, off screen, so the
// player's view (its camera, look and size) is never touched; in the High look with every effect (Standard where
// High can't be drawn), at twice the picture's size and scaled down. Only what the game shows: the land, the water,
// the objects; no layer, overlay, cursor, highlight or drought line. The page saves it in place of the core's
// top-down thumbnail (`src/editor/save/hero.ts`).

import { heroScene } from "./heroView";
import { MapRenderer, softwareRendering } from "./renderer";
import { OPENING } from "../core/analysis/opening";
import type { MapView } from "./model";

/** The picture's size: the game's thumbnails' (FORMAT.md §1). */
export const HERO_W = 960;
export const HERO_H = 540;
/** Device pixels to a pixel of the picture: drawn at twice its size and scaled down, so thin things (a ruin's
 *  posts, a tree's trunk, a cliff's edge) are averaged, never broken into pixels. */
const SUPERSAMPLE = 2;
/** The moment the water and the wind are held at. */
const CLOCK = 6;
/** The longest wait for the High look's occlusion (from the page's bake worker) before the frame is drawn anyway:
 *  a save never waits long on its picture. (The water is drawn still: nothing waits on the moving water.) */
const SETTLE_MS = 3000;
/** The longest the picture waits for the programs of the branches its map asks for (compiled in the background, the
 *  page's thread free meanwhile) before it is drawn anyway, with a warning. */
const PROGRAMS_MS = 20_000;

/** Whether the picture can be drawn here: a GPU (not software rendering) with WebGL 2 (asked of a throwaway
 *  context once a page: each costs the page's thread tens of milliseconds). */
export function canDrawHero(): boolean {
  if (softwareRendering() && !window.dgmLookTest?.gpu) return false;
  return (webgl2 ??= hasWebgl2());
}
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

/** What `heroPicture` draws: the picture's size in pixels (the default is the .timber thumbnail's, 960×540,
 *  which the saved file keeps byte for byte) and the JPEG's quality. Other sizes are for the page's own
 *  pictures (a card in Showcase mode): the same framing at any size, best at the thumbnail's 16:9. */
export interface HeroOptions {
  width?: number;
  height?: number;
  /** JPEG quality, 0–1 (default 0.9). */
  quality?: number;
  /** Draw on the renderer kept for sized pictures (default: when a width or height is given), else on one of its own. */
  reuse?: boolean;
}

/** The smallest and largest side of a picture (pixels). */
const MIN_SIDE = 16;
const MAX_SIDE = 4096;

function side(v: number | undefined, dflt: number, what: string): number {
  if (v === undefined) return dflt;
  if (!Number.isFinite(v) || Math.round(v) < MIN_SIDE || Math.round(v) > MAX_SIDE) throw new RangeError(`the picture's ${what} must be ${MIN_SIDE}–${MAX_SIDE} pixels, not ${v}`);
  return Math.round(v);
}

/** Pictures are drawn one at a time (a page asking for three draws them in turn). */
let queue: Promise<unknown> = Promise.resolve();

/** The map's picture as a JPEG (960×540 unless `opts` gives a size), or null where it can't be drawn (no
 *  GPU, no WebGL 2). Throws when drawing fails; the caller keeps the core's thumbnail then. */
export async function heroPicture(view: MapView, opts: HeroOptions = {}): Promise<Uint8Array | null> {
  const w = side(opts.width, HERO_W, "width");
  const h = side(opts.height, HERO_H, "height");
  // (the saved file's picture, with no size, is always drawn on a renderer of its own: its bytes stay what they were)
  const reuse = opts.reuse ?? (opts.width !== undefined || opts.height !== undefined);
  const run = queue.then(() => draw(view, w, h, opts.quality ?? 0.9, reuse));
  queue = run.catch(() => undefined);
  return await run;
}

/** The same picture as an object URL for an `<img>` (or null where it can't be drawn). The caller frees it
 *  with `URL.revokeObjectURL` when the picture goes. */
export async function heroPictureUrl(view: MapView, opts: HeroOptions = {}): Promise<string | null> {
  const jpeg = await heroPicture(view, opts);
  return jpeg ? URL.createObjectURL(new Blob([jpeg as BlobPart], { type: "image/jpeg" })) : null;
}

/** A renderer kept for the sized pictures: the first compiles the High look's programs (off the page's thread
 *  where the browser can: `prepareFirstFrame`), the ones after it, and any asked within `IDLE_MS`, compile
 *  nothing. One WebGL context, freed after the last picture's wait. */
interface Kept {
  r: MapRenderer;
  host: HTMLElement;
  ready: Promise<void>;
}
const IDLE_MS = 10_000;
let kept: Kept | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;

function release(k: { r: MapRenderer; host: HTMLElement } | null): void {
  k?.r.dispose();
  k?.host.remove();
}
function releaseKept(): void {
  clearTimeout(idle);
  const k = kept;
  kept = null;
  release(k);
}

/** A renderer on an off-screen host, in the High look with every effect. */
function make(pw: number, ph: number): { r: MapRenderer; host: HTMLElement } {
  const host = document.createElement("div");
  // off screen at the picture's size (CSS pixels; the renderer draws at twice them, SUPERSAMPLE, scaled down below)
  host.style.cssText = `position:fixed;left:-${pw * 4}px;top:0;width:${pw}px;height:${ph}px;pointer-events:none;opacity:0`;
  host.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.append(canvas);
  document.body.append(host);
  try {
    const r = new MapRenderer(canvas, { still: true, fov: OPENING.fov, pixels: SUPERSAMPLE });
    r.holdShowcase();
    return { r, host };
  } catch (e) {
    // (a context the renderer made before it failed is freed at once: browsers keep only a few)
    canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
    host.remove();
    throw e;
  }
}

async function draw(view: MapView, pw: number, ph: number, quality: number, reuse: boolean): Promise<Uint8Array | null> {
  if (!canDrawHero()) return null;
  clearTimeout(idle);
  let own: { r: MapRenderer; host: HTMLElement } | null = null;
  try {
    let r: MapRenderer;
    if (reuse) {
      if (!kept) {
        const m = make(pw, ph);
        kept = { ...m, ready: m.r.prepareFirstFrame().catch(() => undefined) };
      }
      await kept.ready;
      r = kept.r;
      kept.host.style.width = `${pw}px`;
      kept.host.style.height = `${ph}px`;
      r.adopted();
    } else {
      own = make(pw, ph);
      r = own.r;
    }
    return await paint(r, view, pw, ph, quality);
  } catch (e) {
    // (what state a renderer is left in after a failure is not known: the next picture starts a new one)
    if (reuse) releaseKept();
    throw e;
  } finally {
    release(own);
    if (kept) idle = setTimeout(releaseKept, IDLE_MS);
  }
}

async function paint(r: MapRenderer, view: MapView, pw: number, ph: number, quality: number): Promise<Uint8Array> {
  r.setClock(CLOCK);
  const scene = heroScene(view);
  r.setMap(scene.view, false, true);
  r.setView({ mode: "orbit", ...scene.camera });
  // (the game's sun for the picture's camera, baked at once: light.ts `sunOfYaw`)
  r.sunNow();
  // (its programs compiled first, off the page's thread where the browser can: a picture never freezes on them, D453;
  // and the branches its map asks for, a cave's, switched on before it is drawn: the picture waits for them, never
  // drawn in a wrong look unsaid)
  const p0 = performance.now();
  while (!r.programsSettled && performance.now() - p0 < PROGRAMS_MS) await new Promise((done) => setTimeout(done, 30));
  if (!r.programsSettled) console.warn(`The map's picture is drawn before its programs compiled (${PROGRAMS_MS / 1000} s): its caves may not show as they will.`);
  await r.compileAhead();
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
}
