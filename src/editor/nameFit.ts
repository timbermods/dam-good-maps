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

/** Whether a name fits the two lines the header keeps for it where its room is narrowest: 13px, between the two groups
 *  at 1280 wide (DESIGN: every name Rename allows fits two lines there). True when the header is not on the page. */
export function fitsHeaderTwoLines(name: string): boolean {
  const bar = document.querySelector<HTMLElement>("header.editor-bar");
  if (!bar) return true;
  const get = (n: string) => parseFloat(bar.style.getPropertyValue(n)) || 0;
  const room = Math.max(60, Math.min(bar.clientWidth, 1280) - get("--side-l") - get("--side-r") - 24);
  const pen = document.createElement("canvas").getContext("2d");
  if (!pen) return true;
  const cs = getComputedStyle(bar.querySelector(".editor-title .title-button") ?? bar);
  pen.font = `${cs.fontStyle} ${cs.fontWeight} 13px ${cs.fontFamily}`;
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
