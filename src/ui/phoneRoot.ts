// The page says which phone layout the room gives on its root (`<html data-phone="upright|side">`, #1074), so what
// lies outside the editor (the dialogs, the map being made, a question before replacing a map) takes the phone's
// layout too. The editor keeps its own (editor/view/usePhone.ts); both go by the room alone, read one way (`roomNow`).
//
// The room's foot keeps clear of the browser's own bar (#1074; iOS 26 Safari's floating address bar lay over the tool
// row on Kyler's iPhone, 2026-11-15). The phone's and the tablet's roots are `position: fixed`, inset 0 (phone.css,
// tablet.css): the box the browser pins fixed elements to, which iOS 26 is reported to keep above its bar. Should that
// box still reach under the bar, `--bar-b` on `<html>` says how far: the fixed box's bottom edge below the visual
// viewport's (never negative; 0 while a text field has the focus or the page is pinch-zoomed, so a keyboard, or iOS 26's
// stale `offsetTop` after one, never lifts the foot). The foot's room is then `max(safe-area inset, --bar-b)`.
// `--room-h` is that fixed box's height, read where a phone's sheet or menu read the viewport's (`100dvh` reached under
// the bar). Where the browser's bar lies outside the page both are no-ops: `--bar-b` 0, `--room-h` the viewport's height.

import { roomNow } from "../editor/view/phoneLayout";
import { showReadout } from "./viewportReadout";

/** An element the size of what the browser pins fixed elements to, measured for `--bar-b` and `--room-h` (the roots are
 *  that box, but a tablet's ends at the bar, so a root cannot measure it). */
let probe: HTMLElement | null = null;
/** `--bar-b` as last set, px. */
let barNow = 0;

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
function typing(el: Element | null): boolean {
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !NOT_TYPED.has((el as HTMLInputElement).type);
}

/** How far the fixed box's bottom edge (`roomBottom`) lies below the visual viewport's, whole px: never negative, 0 while
 *  a text field has the focus or the page is pinch-zoomed. */
export function barOverlap(roomBottom: number, vv: { height: number; offsetTop: number; scale: number } | null | undefined, focused: Element | null): number {
  if (!vv || Math.abs(vv.scale - 1) > 0.01 || typing(focused)) return 0;
  const o = roomBottom - (vv.offsetTop + vv.height);
  return o >= 1 ? Math.round(o) : 0;
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
  const note = () => {
    const p = roomNow();
    if (p) root.dataset.phone = p;
    else delete root.dataset.phone;
    const r = roomProbe().getBoundingClientRect();
    const bar = barOverlap(r.bottom, vv, document.activeElement);
    if (bar !== barNow || !root.style.getPropertyValue("--bar-b")) root.style.setProperty("--bar-b", `${bar}px`);
    barNow = bar;
    const h = `${r.height}px`;
    if (root.style.getPropertyValue("--room-h") !== h) root.style.setProperty("--room-h", h);
    readout?.(r, bar);
  };
  // (the focus leaving a field: measured again a frame on too, once the browser has put its keyboard away)
  let frame = 0;
  const left = () => {
    note();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(note);
  };
  note();
  // (the readout kept up as the editor comes and goes)
  const tick = readout ? window.setInterval(note, 500) : 0;
  window.addEventListener("resize", note);
  vv?.addEventListener("resize", note);
  vv?.addEventListener("scroll", note);
  document.addEventListener("focusin", note);
  document.addEventListener("focusout", left);
  return () => {
    cancelAnimationFrame(frame);
    clearInterval(tick);
    window.removeEventListener("resize", note);
    vv?.removeEventListener("resize", note);
    vv?.removeEventListener("scroll", note);
    document.removeEventListener("focusin", note);
    document.removeEventListener("focusout", left);
  };
}
