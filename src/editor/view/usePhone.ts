// The phone layouts (#1074 slice 2, amends D185; EDITOR_PLAN §3, "Phones"): which one the room gives (phoneLayout.ts) and
// the one sheet open at a time. Upright: the tools in a row at the foot, a tool's settings in a sheet above it (one row,
// or half the screen pulled up), Show and the objects as sheets of their own. On its side: the tools in a rail at the
// left, the sheets in a panel at the right. Nothing here edits the map: the same tools, the same operations (D342).

import { useEffect, useRef, useState } from "preact/hooks";
import { measureInsets, roomCentre } from "./insets";
import type { Ed } from "../ed";
import { phoneLayoutFor, type PhoneLayout } from "./phoneLayout";

/** The sheet open besides a tool's settings: Show, the objects, or none. */
export type PhoneSheet = "show" | "objects" | null;

export interface PhoneSlice {
  /** The phone layout the room gives, or null for the desktop's. */
  phone: PhoneLayout;
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

const roomNow = (): PhoneLayout => (typeof window === "undefined" ? null : phoneLayoutFor(window.innerWidth, window.innerHeight));

export function usePhone(ed: Ed): PhoneSlice {
  const { brushTool, tool, shelf, block } = ed;
  const [phone, setPhone] = useState<PhoneLayout>(roomNow);
  const [phoneSheet, setPhoneSheet] = useState<PhoneSheet>(null);
  const [sheetTall, setSheetTall] = useState(false);
  const [phoneSelect, setPhoneSelect] = useState(false);

  useEffect(() => {
    const note = () => setPhone(roomNow());
    window.addEventListener("resize", note);
    window.visualViewport?.addEventListener("resize", note);
    return () => {
      window.removeEventListener("resize", note);
      window.visualViewport?.removeEventListener("resize", note);
    };
  }, []);

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
  const room = useRef<{ x: number; y: number; phone: PhoneLayout } | null>(null);
  const aim = useRef<{ target: [number, number, number]; until: number } | null>(null);
  const selected = !!ed.selection.current.count;
  const slideOn = [phone, phoneSheet, sheetTall, phoneSelect, brushTool, tool, block, shelf, selected, ed.ready];
  // (whether a slide is still to come: the page has drawn a change the effect below has not yet measured, or its frame
  // is waiting; tests wait on it, `roomSettled`)
  const slideWanted = useRef(slideOn);
  slideWanted.current = slideOn;
  const slideMeasured = useRef<unknown[] | null>(null);
  const slideFrame = useRef(0);
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
  const roomSettled = useRef(() => {
    if (!phoneRef.current) return true;
    const ran = slideMeasured.current;
    const want = slideWanted.current;
    return !slideFrame.current && !!ran && ran.length === want.length && ran.every((v, k) => v === want[k]) && !ed.renderer.current?.touchGliding;
  }).current;
  useEffect(() => {
    slideMeasured.current = slideOn;
    if (!phone) {
      room.current = null;
      return;
    }
    const id = (slideFrame.current = requestAnimationFrame(() => {
      slideFrame.current = 0;
      const r = ed.renderer.current;
      const view = r?.canvas.parentElement;
      if (!r || !view || !ed.ready) return;
      const ins = measureInsets(view);
      r.setFrameInsets(ins);
      const now = { ...roomCentre(r.canvas.getBoundingClientRect(), ins), phone };
      const was = room.current;
      room.current = now;
      // (turned to its other side: a new view, nothing to keep in place)
      if (!was || was.phone !== phone || Math.hypot(now.x - was.x, now.y - was.y) < 1) return;
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
    const sheet = document.querySelector<HTMLElement>(".editor[data-phone] .phone-show");
    if (!sheet) return;
    const fit = () => endShowOnWhole(sheet);
    const id = requestAnimationFrame(fit);
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => requestAnimationFrame(fit));
    watch?.observe(sheet.parentElement ?? sheet);
    return () => {
      cancelAnimationFrame(id);
      watch?.disconnect();
    };
  }, [phone, phoneSheet]);

  return { phone, phoneSheet, setPhoneSheet, sheetTall, setSheetTall, phoneSelect, setPhoneSelect, roomSettled };
}

/** The Show sheet's height stops where the room would cut a row of chips or a line: at that row's top, or at the top of
 *  the heading above it when that heading would be left with nothing under it. */
export function endShowOnWhole(sheet: HTMLElement): void {
  sheet.style.maxHeight = "";
  if (sheet.hidden) return;
  const room = sheet.clientHeight;
  if (sheet.scrollHeight <= room + 1) return;
  const pad = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
  const top = sheet.getBoundingClientRect().top - sheet.scrollTop;
  const pieces = [...sheet.querySelectorAll<HTMLElement>(".ps-head, .ps-grid > *, .ps-line, .legend-panel, .show-key, .water-bar > *, .minimap")]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter((p) => p.r.height > 0)
    .map((p) => ({ head: p.el.classList.contains("ps-head"), t: p.r.top - top, b: p.r.bottom - top }));
  const limit = room - pad;
  let cut = Infinity;
  for (const p of pieces) if (p.b > limit + 0.5) cut = Math.min(cut, p.t);
  if (!Number.isFinite(cut)) return;
  // (a heading whose first row is cut goes with it)
  for (const p of pieces) if (p.head && p.b <= cut + 0.5 && !pieces.some((q) => !q.head && q.t >= p.b - 0.5 && q.b <= cut + 0.5)) cut = Math.min(cut, p.t);
  // (the scrolling box shows its content through its padding too: the box ends a gap above the row it leaves out)
  sheet.style.maxHeight = `${Math.max(88, Math.floor(cut - 6))}px`;
}
