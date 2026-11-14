// Which layout the editor takes, by its room alone (#1074, amends D185): a window under 600 CSS px wide is a phone
// held upright, one under 500 tall a phone on its side; anything else (a tablet, a laptop) keeps the desktop layout.
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
