/**
 * Keeping a typed map name to what fits two lines (Kyler, 2026-10-05), shared by the header's Rename, the generator's
 * Name field and Your maps' Rename.
 */

/** How many lines `text` takes in a line `width` wide, its words broken where the browser breaks them; Infinity when one
 *  word is wider than the line. `measure` gives a string's width. */
export function linesIn(text: string, width: number, measure: (t: string) => number): number {
  let lines = 1;
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (measure(word) > width) return Infinity;
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= width) line = next;
    else {
      lines++;
      line = word;
    }
  }
  return lines;
}

/** The size of the title on two small lines, in px: 13, scaled down like the labels where the page's font is wider than
 *  Segoe UI (`--wide-font`, src/ui/fontFit.ts), never under the text floor; page.css sets the same size. */
export function smallTitlePx(): number {
  const root = getComputedStyle(document.documentElement);
  const wide = parseFloat(root.getPropertyValue("--wide-font")) || 1;
  const floor = parseFloat(root.getPropertyValue("--text-floor")) || 10;
  return Math.max(Math.min(13, floor), 13 / wide);
}

/** The window widths at which the header's right group grows (page.css: Look's state and Together's icon from 1,340px,
 *  Together's word from 1,400px). */
const GROWS_AT = [1340, 1400] as const;

/** What the right group gains at each of GROWS_AT, in px, in the page's font: Look's ": Standard" and Together's icon (40px and
 *  the 6px gap) at the first, Together's word at the second (its button's padding and gap over the icon's square, 10px).
 *  These parts are in the page while hidden, so their text is measured, not their boxes. */
function growth(bar: HTMLElement, pen: CanvasRenderingContext2D): [number, number] {
  const wide = (selector: string) => {
    const el = bar.querySelector<HTMLElement>(selector);
    if (!el) return 0;
    const cs = getComputedStyle(el);
    pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return Math.ceil(pen.measureText(el.textContent ?? "").width);
  };
  const together = bar.querySelector(".together-button") ? 46 : 0;
  const word = bar.querySelector(".together-label") ? wide(".together-label") + 10 : 0;
  // (Look's state grows only where its button is shown: not where the page draws without 3D)
  const look = bar.querySelector(".look-words")?.getClientRects().length ? wide(".look-state") : 0;
  return [look + together, word];
}

/** Whether a name fits the two lines the header keeps for it where its room is narrowest: the small title size, between the
 *  two groups at 1280 wide, and at each width above where the right group grows (DESIGN: every name Rename allows fits two
 *  lines at every width from 1280 up, so a name kept at one width is never cut at another, and a wider window allows as
 *  much as 1280 does). True when the header is not on the page. */
export function fitsHeaderTwoLines(name: string): boolean {
  const bar = document.querySelector<HTMLElement>("header.editor-bar");
  if (!bar) return true;
  const pen = document.createElement("canvas").getContext("2d");
  if (!pen) return true;
  const get = (n: string) => parseFloat(bar.style.getPropertyValue(n)) || 0;
  const left = get("--side-l");
  // (the right group as it is under 1,340px: what has grown at this window's width taken off)
  const added = growth(bar, pen);
  let right = get("--side-r");
  GROWS_AT.forEach((width, i) => {
    if (window.innerWidth >= width) right -= added[i];
  });
  let room = Math.min(bar.clientWidth, 1280) - left - right - 24;
  // (the room the name will have where the window is wider: the group grows by more than the window does)
  let grown = 0;
  GROWS_AT.forEach((width, i) => {
    grown += added[i];
    room = Math.min(room, width - left - (right + grown) - 24);
  });
  room = Math.max(60, room);
  const cs = getComputedStyle(bar.querySelector(".editor-title .title-button") ?? bar);
  pen.font = `${cs.fontStyle} ${cs.fontWeight} ${smallTitlePx()}px ${cs.fontFamily}`;
  return linesIn(name, room, (t) => Math.ceil(pen.measureText(t).width) + 1) <= 2;
}

/** A name may always be this many characters, whatever the room: wider fonts (Linux, macOS, larger UI fonts) leave the
 *  header less room, and the shown title clamps to two lines with an ellipsis instead. */
export const NAME_FLOOR = 30;

/** Applies a typed edit to a name field, limiting only what makes the name longer: deleting, or cutting and typing
 *  something shorter, is always kept. An edit that lengthens the name past what `fits` (the measured room, an upper
 *  guide where fonts allow) and past NAME_FLOOR characters is cut to the pasted or typed text that fits (the rest of
 *  the name stays whole); a key with no room does nothing. Returns the field's new value. */
export function limitName(field: HTMLInputElement, was: string, measured: (name: string) => boolean): string {
  const fits = (name: string) => name.length <= NAME_FLOOR || measured(name);
  const v = field.value;
  if (v.length < was.length || fits(v)) return v;
  // what was inserted: between the text both share at the start and at the end
  let p = 0;
  while (p < was.length && p < v.length && was[p] === v[p]) p++;
  let s = 0;
  while (s < was.length - p && s < v.length - p && was[was.length - 1 - s] === v[v.length - 1 - s]) s++;
  const head = v.slice(0, p);
  const tail = v.slice(v.length - s);
  const added = v.slice(p, v.length - s);
  let lo = 0;
  let hi = added.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (fits(head + added.slice(0, m) + tail)) lo = m;
    else hi = m - 1;
  }
  const kept = lo === 0 ? was : head + added.slice(0, lo) + tail;
  field.value = kept;
  const caret = lo === 0 ? Math.min(p, was.length) : p + lo;
  field.setSelectionRange(caret, caret);
  return kept;
}
