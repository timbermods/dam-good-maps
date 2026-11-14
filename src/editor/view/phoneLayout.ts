// Which layout the editor takes, by its room alone (#1074, amends D185): a window under 600 CSS px wide is a phone
// held upright, one under 500 tall a phone on its side; anything else keeps the desktop layout, but for a tablet: a finger
// (`(pointer: coarse)`) in a room whose longer side is under 1400 CSS px is a big phone (slice 6, view/usePhone.ts).
// Touch itself goes by the pointer (`pointerType`, render3d/touch.ts), never by this.

export type PhoneLayout = "upright" | "side" | null;

/** Narrower than this, in CSS px: the upright phone layout. */
export const UPRIGHT_UNDER = 600;
/** Shorter than this, in CSS px: the on-its-side phone layout. */
export const SIDE_UNDER = 500;

/** The layout for a window `w` wide and `h` tall (both short: the longer side decides). */
export function phoneLayoutFor(w: number, h: number): PhoneLayout {
  const narrow = w < UPRIGHT_UNDER;
  const short = h < SIDE_UNDER;
  if (narrow && short) return w > h ? "side" : "upright";
  return narrow ? "upright" : short ? "side" : null;
}

/** The room the page lays out in: the layout viewport's own size (`<html>`'s client box), not `innerWidth`. A phone's
 *  browser widens what `innerWidth` reports to fit anything that spills past the screen (Chrome measured 1047 px on a
 *  393 px phone while the editor's frame drew the desktop's bar), and iOS shrinks it under a keyboard or a pinch; the
 *  layout read from it then flipped to the desktop's, which spilled wider still and stayed (the Help flake of #1101).
 *  The client box is the screen's CSS size whatever the page holds or the browser zooms. */
export function roomNow(): PhoneLayout {
  if (typeof document === "undefined" || !document.documentElement) return null;
  const root = document.documentElement;
  return phoneLayoutFor(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight);
}

/** A finger's room this long or longer, in CSS px, on its longer side: a desktop's with a touch screen, not a tablet's
 *  (the largest iPad is 1032 × 1376). */
export const TABLET_LONG_UNDER = 1400;

/** Whether a finger's room `w` × `h` (not a phone's) is a tablet's: the phone's sheets with the desktop's dock. */
export function tabletRoomFor(w: number, h: number): boolean {
  return !phoneLayoutFor(w, h) && Math.max(w, h) < TABLET_LONG_UNDER;
}

/** `tabletRoomFor` the room the page lays out in now (`roomNow`'s measure). */
export function tabletRoomNow(): boolean {
  if (typeof document === "undefined" || !document.documentElement) return false;
  const root = document.documentElement;
  return tabletRoomFor(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight);
}
