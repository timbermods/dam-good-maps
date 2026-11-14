// The page says which phone layout the room gives on its root (`<html data-phone="upright|side">`, #1074), so what
// lies outside the editor (the dialogs, the map being made, a question before replacing a map) takes the phone's
// layout too. The editor keeps its own (editor/view/usePhone.ts); both go by the room alone.

import { phoneLayoutFor } from "../editor/view/phoneLayout";

export function watchPhoneRoot(root: HTMLElement = document.documentElement): () => void {
  const note = () => {
    const p = phoneLayoutFor(window.innerWidth, window.innerHeight);
    if (p) root.dataset.phone = p;
    else delete root.dataset.phone;
  };
  note();
  window.addEventListener("resize", note);
  window.visualViewport?.addEventListener("resize", note);
  return () => {
    window.removeEventListener("resize", note);
    window.visualViewport?.removeEventListener("resize", note);
  };
}
