// The page says which phone layout the room gives on its root (`<html data-phone="upright|side">`, #1074), so what
// lies outside the editor (the dialogs, the map being made, a question before replacing a map) takes the phone's
// layout too. The editor keeps its own (editor/view/usePhone.ts); both go by the room alone, read one way (`roomNow`).
//
// The room's foot keeps clear of the browser's own bar (#1074; iOS 26 Safari's floating address bar lay over the tool
// row on Kyler's iPhone, 2026-11-15). The phone's and the tablet's roots are `position: fixed`, inset 0 (phone.css,
// tablet.css): the box the browser pins fixed elements to, which iOS 26 is reported to keep above its bar. Should that
// box still reach under the bar, `--bar-b` on `<html>` says how far: the fixed box's bottom edge below the visual
// viewport's, never negative. It changes only on a reading to trust: none while a text field has the focus, nor after
// one lets it go until the visual viewport has settled, nor while the page is pinch-zoomed, nor one past the cap; then
// it keeps the value it had (so a keyboard, or iOS 26's stale `offsetTop` after one, never lifts the foot). The foot's
// room is `max(safe-area inset, --bar-b)`. `--room-h` is that fixed box's height, read where a phone's sheet or menu read
// the viewport's (`100dvh` reached under the bar). Where the browser's bar lies outside the page both are no-ops:
// `--bar-b` 0, `--room-h` the viewport's height.

import { roomNow } from "../editor/view/phoneLayout";
import { showReadout } from "./viewportReadout";

/** An element the size of what the browser pins fixed elements to, measured for `--bar-b` and `--room-h` (the roots are
 *  that box, but a tablet's ends at the bar, so a root cannot measure it). */
let probe: HTMLElement | null = null;
/** `--bar-b` as last set, px. */
let barNow = 0;

/** After a text field lets the focus go, `--bar-b` holds until the visual viewport has settled: this long at least, ms,
 *  and this long after its last resize (the keyboard going down), but no longer than `SETTLE_MAX_MS` in all. */
const SETTLE_MS = 400;
const SETTLE_QUIET_MS = 150;
const SETTLE_MAX_MS = 1000;

function roomProbe(): HTMLElement {
  if (probe?.isConnected) return probe;
  probe = document.createElement("div");
  probe.className = "room-probe";
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1;contain:strict";
  document.body.appendChild(probe);
  return probe;
}

const NOT_TYPED = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "file", "color", "image", "hidden"]);

/** A field that brings up a keyboard (or iOS's picker). */
function typing(el: EventTarget | Element | null): boolean {
  if (!(el instanceof Element)) return false;
  if ((el as HTMLElement).isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !NOT_TYPED.has((el as HTMLInputElement).type);
}

/** How far the fixed box's bottom edge (`roomBottom`) lies below the visual viewport's, whole px, never negative. */
export function barOverlap(roomBottom: number, vv: { height: number; offsetTop: number }): number {
  const o = roomBottom - (vv.offsetTop + vv.height);
  return o >= 1 ? Math.round(o) : 0;
}

/** The most a browser's own bar may take, px, in a room `roomH` tall: Safari's floating bar is about 75pt above the
 *  foot, so a reading past 140px or a quarter of the room is something else (a keyboard, a stale offset) and is ignored. */
export function barCap(roomH: number): number {
  return Math.min(140, roomH / 4);
}

/** The foot of what shows of the page: `innerHeight`, less the browser's bar where it lies over the page. A menu kept on
 *  the screen ends above it. */
export function visibleBottom(): number {
  return window.innerHeight - barNow;
}

export function watchPhoneRoot(root: HTMLElement = document.documentElement): () => void {
  const vv = window.visualViewport;
  // (`?viewport=on`: the measures behind the foot's room in a box mid-screen, for one screenshot from a phone)
  const readout = new URLSearchParams(location.search).get("viewport") === "on" ? showReadout() : null;
  /** A field has let the focus go and the visual viewport is settling: when the hold may end, and when it must. */
  let settle: { until: number; deadline: number } | null = null;
  let settleTimer = 0;
  const note = () => {
    const p = roomNow();
    if ((root.dataset.phone ?? null) !== p) {
      if (p) root.dataset.phone = p;
      else delete root.dataset.phone;
    }
    const r = roomProbe().getBoundingClientRect();
    const raw = vv ? barOverlap(r.bottom, vv) : 0;
    const trusted = !vv || (!settle && Math.abs(vv.scale - 1) <= 0.01 && !typing(document.activeElement) && raw <= barCap(r.height));
    if (trusted) barNow = raw;
    if (root.style.getPropertyValue("--bar-b") !== `${barNow}px`) root.style.setProperty("--bar-b", `${barNow}px`);
    const h = `${r.height}px`;
    if (root.style.getPropertyValue("--room-h") !== h) root.style.setProperty("--room-h", h);
    readout?.update(r, barNow, raw);
  };
  const settled = () => {
    settleTimer = 0;
    if (!settle) return;
    const end = Math.min(settle.until, settle.deadline);
    const now = performance.now();
    if (now < end) {
      settleTimer = window.setTimeout(settled, end - now);
      return;
    }
    settle = null;
    note();
  };
  const viewportMoved = () => {
    // (the keyboard still going down: the hold lasts a little past its last step)
    if (settle && !typing(document.activeElement)) settle.until = Math.max(settle.until, performance.now() + SETTLE_QUIET_MS);
    note();
  };
  const focused = (e: FocusEvent) => {
    if (typing(e.target)) {
      settle = null;
      clearTimeout(settleTimer);
    }
    note();
  };
  const blurred = (e: FocusEvent) => {
    if (typing(e.target) && !typing(e.relatedTarget)) {
      const now = performance.now();
      settle = { until: now + SETTLE_MS, deadline: now + SETTLE_MAX_MS };
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settled, SETTLE_MS);
    }
    note();
  };
  note();
  // (the readout kept up as the editor comes and goes)
  const tick = readout ? window.setInterval(note, 500) : 0;
  window.addEventListener("resize", note);
  vv?.addEventListener("resize", viewportMoved);
  vv?.addEventListener("scroll", viewportMoved);
  document.addEventListener("focusin", focused);
  document.addEventListener("focusout", blurred);
  return () => {
    clearTimeout(settleTimer);
    clearInterval(tick);
    window.removeEventListener("resize", note);
    vv?.removeEventListener("resize", viewportMoved);
    vv?.removeEventListener("scroll", viewportMoved);
    document.removeEventListener("focusin", focused);
    document.removeEventListener("focusout", blurred);
    readout?.remove();
    probe?.remove();
    probe = null;
  };
}
