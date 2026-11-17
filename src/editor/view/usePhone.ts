// The phone layouts (#1074 slice 2, amends D185; EDITOR_PLAN §3, "Phones"): which one the room gives (phoneLayout.ts) and
// the one sheet open at a time. Upright: the tools in a row at the foot, a tool's settings in a sheet above it (one row,
// or half the screen pulled up), Show and the objects as sheets of their own. On its side: the tools in a rail at the
// left, the sheets in a panel at the right. A tablet is a big phone (planning, 2026-11-14, slice 6): a finger with more
// room keeps its dock and its minimap, and takes the phone's Show and objects as side sheets, Select's settings closed at
// rest and the menu's pages over the whole view. Nothing here edits the map: the same tools, the same operations (D342).

import { useEffect, useRef, useState } from "preact/hooks";
import { measureInsets, roomCentre } from "./insets";
import type { Ed } from "../ed";
import { roomNow, tabletRoomNow, type PhoneLayout } from "./phoneLayout";

/** The sheet open besides a tool's settings: Show, the objects, or none. */
export type PhoneSheet = "show" | "objects" | null;

export interface PhoneSlice {
  /** The phone layout the room gives, or null for the desktop's. */
  phone: PhoneLayout;
  /** A tablet: a finger (`(pointer: coarse)`) with more room than a phone's. Its dock and minimap are the desktop's; Show,
   *  the objects, Select's settings and the menu's pages are the phone's (`phoneSheet`, `phoneSelect`). */
  tablet: boolean;
  phoneSheet: PhoneSheet;
  setPhoneSheet: (s: PhoneSheet) => void;
  /** The settings' sheet pulled up: every setting, half the screen (else one row: Size and the main choice). */
  sheetTall: boolean;
  setSheetTall: (tall: boolean) => void;
  /** Select's settings shown on a phone (Select rests in hand; its sheet opens when its button is tapped). */
  phoneSelect: boolean;
  setPhoneSelect: (open: boolean) => void;
  /** Whether the view has been slid for the room it has now and no slide is moving (tests wait on it: a sheet that opens
   *  or closes slides the view a few frames later, once the page has drawn it). Always true off a phone. */
  roomSettled: () => boolean;
}

/** How long the view takes to slide into the room a sheet leaves, ms. */
const SLIDE_MS = 250;

/** The phone layout the room gives, kept up as the room changes (a phone turned on its side, a window resized). */
export function useRoom(): PhoneLayout {
  return useRoomRead(roomNow);
}

/** A tablet: a finger in a tablet's room (phoneLayout.ts, `tabletRoomFor`), kept up as either changes. */
export function useTablet(): boolean {
  const room = useRoomRead(tabletRoomNow);
  return useFinger() && room;
}

/** A reading of the room, kept up as the room changes. */
function useRoomRead<T>(read: () => T): T {
  const [phone, setPhone] = useState<T>(read);
  useEffect(() => {
    const note = () => setPhone(read());
    window.addEventListener("resize", note);
    window.visualViewport?.addEventListener("resize", note);
    return () => {
      window.removeEventListener("resize", note);
      window.visualViewport?.removeEventListener("resize", note);
    };
  }, []);
  return phone;
}

/** The pointer is a finger (`(pointer: coarse)`), kept up as it changes. */
export function useFinger(): boolean {
  const query = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const [finger, setFinger] = useState(query);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia("(pointer: coarse)");
    const look = () => setFinger(m.matches);
    m.addEventListener("change", look);
    return () => m.removeEventListener("change", look);
  }, []);
  return finger;
}

export function usePhone(ed: Ed): PhoneSlice {
  const { brushTool, tool, shelf, block } = ed;
  const phone = useRoom();
  const tablet = useTablet();
  /** The phone's sheets: a phone's or a tablet's. */
  const sheets = !!phone || tablet;
  const [phoneSheet, setPhoneSheet] = useState<PhoneSheet>(null);
  const [sheetTall, setSheetTall] = useState(false);
  const [phoneSelect, setPhoneSelect] = useState(false);

  // a tool taken up closes Show and the objects (its settings take the sheet's place), one row high again
  useEffect(() => {
    setSheetTall(false);
    if (brushTool || tool || block) {
      setPhoneSheet((s) => (s === "objects" || s === "show" ? null : s));
      setPhoneSelect(false);
    }
  }, [brushTool, tool, block]);
  // an object picked from its sheet: the sheet closes to one row saying what is in hand, so the map is free to tap
  useEffect(() => {
    setSheetTall(false);
    if (shelf) setPhoneSheet((s) => (s === "objects" ? null : s));
  }, [shelf]);

  // the map moves with the room (planning, #1074): a sheet or the panel opening or closing slides the view so the ground
  // that was in the middle of the room left is in the middle of the room now, the zoom and the angle as they were; the
  // next framing (Reset view) keeps clear of them too. The desktop's view never moves for a panel (D265).
  const room = useRef<{ x: number; y: number; phone: PhoneLayout | "tablet" } | null>(null);
  const aim = useRef<{ target: [number, number, number]; until: number } | null>(null);
  const selected = !!ed.selection.current.count;
  // (Show's sheet grown or shrunk by what it holds, Land's numbers or the Legend under its chips: the room changed too)
  const [showFitted, setShowFitted] = useState(0);
  const slideOn = [phone, tablet, phoneSheet, sheetTall, phoneSelect, brushTool, tool, block, shelf, selected, ed.ready, showFitted];
  // (whether a slide is still to come: the page has drawn a change the effect below has not yet measured, or its frame
  // is waiting; tests wait on it, `roomSettled`)
  const slideWanted = useRef(slideOn);
  slideWanted.current = slideOn;
  const slideMeasured = useRef<unknown[] | null>(null);
  const slideFrame = useRef(0);
  const sheetsRef = useRef(sheets);
  sheetsRef.current = sheets;
  // (Show's refits waiting for their frame: a change in what it holds is fitted a frame later, and a fit that changes its
  // height slides the view again, so the room is not settled until they have run; a test that waited on it straight after
  // a Show toggle went on a frame early, #1226's review)
  const fitFrames = useRef(new Set<number>());
  const roomSettled = useRef(() => {
    if (!sheetsRef.current) return true;
    const ran = slideMeasured.current;
    const want = slideWanted.current;
    return !slideFrame.current && !fitFrames.current.size && !!ran && ran.length === want.length && ran.every((v, k) => v === want[k]) && !ed.renderer.current?.touchGliding;
  }).current;
  useEffect(() => {
    slideMeasured.current = slideOn;
    if (!sheets) {
      room.current = null;
      return;
    }
    const id = (slideFrame.current = requestAnimationFrame(() => {
      slideFrame.current = 0;
      const r = ed.renderer.current;
      const view = r?.canvas.parentElement;
      if (!r || !view || !ed.ready) return;
      // (Show's sheet cut to its whole rows first: measured before its own fit, the room was the uncut sheet's, and a later
      // measure of the cut one moved the room's middle 8px, 3.3 tiles, off the ground kept there; WebKit ran the fit after
      // the slide, #1074 slice 6)
      const show = view.querySelector<HTMLElement>(".phone-show");
      if (show) endShowOnWhole(show);
      const was = room.current;
      const layout = phone ?? ("tablet" as const);
      // (the room the map was first framed in counts the first steps' hints, as its first view did, `firstInsets`: the
      // ground in its middle is the map's middle, kept there by the next slide)
      const ins = measureInsets(view, !was);
      r.setFrameInsets(ins);
      const now = { ...roomCentre(r.canvas.getBoundingClientRect(), ins), phone: layout };
      room.current = now;
      // (turned to its other side: a new view, nothing to keep in place)
      if (!was || was.phone !== now.phone || Math.hypot(now.x - was.x, now.y - was.y) < 1) return;
      const v = r.getView();
      const a = r.pickAtLevel(was.x, was.y, v.target[1]);
      const b = r.pickAtLevel(now.x, now.y, v.target[1]);
      if (!a || !b) return;
      // (a slide still on its way: the next one goes on from where it was going; a pan keeps the ground's offsets)
      const from = aim.current && performance.now() < aim.current.until ? aim.current.target : v.target;
      const target: [number, number, number] = [from[0] + a.point[0] - b.point[0], from[1], from[2] + a.point[2] - b.point[2]];
      aim.current = { target, until: performance.now() + SLIDE_MS };
      r.glideTo({ ...v, target }, SLIDE_MS);
    }));
    return () => {
      cancelAnimationFrame(id);
      if (slideFrame.current === id) slideFrame.current = 0;
    };
  }, slideOn);

  // Show ends after a whole row of its chips (or a whole line), never on a heading with nothing under it, as a pulled-up
  // sheet ends on a whole setting; the rest scroll up into view
  useEffect(() => {
    const sheet = document.querySelector<HTMLElement>(".editor:is([data-phone], [data-tablet]) .phone-show");
    if (!sheet) return;
    const frames = fitFrames.current;
    /** A refit in the next frame, counted until it has run (`roomSettled`). */
    const soon = (f: () => void) => {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        f();
      });
      frames.add(id);
    };
    const fit = () => endShowOnWhole(sheet);
    // (fitted again whenever the room changes, and when what it holds changes: Land's numbers, the Legend or a key coming
    // under the chips, a chip a map gains; a fit that changes its height moves the room, so the view slides with it)
    const refit = () => {
      const was = sheet.offsetHeight;
      fit();
      if (Math.abs(sheet.offsetHeight - was) >= 1) setShowFitted((n) => n + 1);
    };
    soon(fit);
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => soon(fit));
    watch?.observe(sheet.parentElement ?? sheet);
    const grown = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => soon(refit));
    grown?.observe(sheet, { childList: true, subtree: true });
    return () => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      watch?.disconnect();
      grown?.disconnect();
    };
  }, [phone, tablet, phoneSheet]);

  return { phone, tablet, phoneSheet, setPhoneSheet, sheetTall, setSheetTall, phoneSelect, setPhoneSelect, roomSettled };
}

/** The lines of a panel under Show's chips (Land's numbers, the Legend's entries, a key's parts). */
const PANEL_LINES = ".land-line, .pick-list > li, .panel-head, .overlay-legend, .layer-legend, .toggle-row";

/** The Show sheet's height stops where the room would cut a row of chips or a line: at that row's top, or at the top of
 *  the heading above it when that heading would be left with nothing under it. */
export function endShowOnWhole(sheet: HTMLElement): void {
  sheet.style.maxHeight = "";
  if (sheet.hidden) return;
  const room = sheet.clientHeight;
  if (sheet.scrollHeight <= room + 1) return;
  const pad = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
  const top = sheet.getBoundingClientRect().top - sheet.scrollTop;
  const pieces: { head: boolean; t: number; b: number }[] = [];
  for (const el of sheet.querySelectorAll<HTMLElement>(".ps-head, .ps-grid > *, .ps-line, .legend-panel, .show-key, .water-bar > *, .minimap")) {
    const r = el.getBoundingClientRect();
    if (!(r.height > 0)) continue;
    // (a panel of lines, Land's numbers, the Legend or a key, ends on a whole line of its own: its first line holds the
    // panel's top edge, its last its foot)
    const lines = el.matches(".legend-panel, .show-key") ? [...el.querySelectorAll<HTMLElement>(PANEL_LINES)].map((l) => l.getBoundingClientRect()).filter((l) => l.height > 0) : [];
    if (lines.length > 1) lines.forEach((l, i) => pieces.push({ head: false, t: (i === 0 ? r.top : l.top) - top, b: (i === lines.length - 1 ? r.bottom : l.bottom) - top }));
    else pieces.push({ head: el.classList.contains("ps-head"), t: r.top - top, b: r.bottom - top });
  }
  const limit = room - pad;
  let cut = Infinity;
  for (const p of pieces) if (p.b > limit + 0.5) cut = Math.min(cut, p.t);
  if (!Number.isFinite(cut)) return;
  // (a heading whose first row is cut goes with it)
  for (const p of pieces) if (p.head && p.b <= cut + 0.5 && !pieces.some((q) => !q.head && q.t >= p.b - 0.5 && q.b <= cut + 0.5)) cut = Math.min(cut, p.t);
  // (the scrolling box shows its content through its padding too: the box ends a gap above the row it leaves out)
  // (and below that the home bar's inset, a border under what scrolls)
  const foot = parseFloat(getComputedStyle(sheet).borderBottomWidth) || 0;
  // (lines nearer than that, a panel's: the box ends at the foot of the last whole one)
  const above = Math.max(-Infinity, ...pieces.filter((p) => p.b <= cut + 0.5).map((p) => p.b));
  const gap = Math.min(6, Math.max(0, cut - above));
  sheet.style.maxHeight = `${Math.max(88, Math.floor(Math.min(sheet.offsetHeight, cut - gap + foot)))}px`;
}
