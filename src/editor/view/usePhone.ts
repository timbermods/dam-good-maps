// The phone layouts (#1074 slice 2, amends D185; EDITOR_PLAN §3, "Phones"): which one the room gives (phoneLayout.ts) and
// the one sheet open at a time. Upright: the tools in a row at the foot, a tool's settings in a sheet above it (one row,
// or half the screen pulled up), Show and the objects as sheets of their own. On its side: the tools in a rail at the
// left, the sheets in a panel at the right. Nothing here edits the map: the same tools, the same operations (D342).

import { useEffect, useState } from "preact/hooks";
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
}

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
  // an object picked from its sheet: the sheet goes, so the map is there to place it on
  useEffect(() => {
    if (shelf) setPhoneSheet((s) => (s === "objects" ? null : s));
  }, [shelf]);

  return { phone, phoneSheet, setPhoneSheet, sheetTall, setSheetTall, phoneSelect, setPhoneSelect };
}
