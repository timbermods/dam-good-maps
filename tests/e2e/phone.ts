// The phone layouts' shared measures (#1074): layout.spec.ts and phonePages.spec.ts.

import type { Page } from "@playwright/test";

/** Every control a finger can press on the page: its size, and whether what of it shows is on the screen. A control
 *  scrolled out of a row that scrolls (the tool row) is reachable, so only its size counts. */
export async function phoneControls(page: Page) {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const out: { name: string; w: number; h: number; off: boolean; font: number | null }[] = [];
    const sel = "button, select, textarea, a[href], input:not([type=hidden]):not([type=file]), [role=checkbox], [role=menuitem], [role=slider]";
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.closest("[hidden], .visually-hidden, [aria-hidden=true]") || el.classList.contains("visually-hidden")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // what of it shows: cut by every ancestor that clips; one that scrolls may hide it whole
      let l = r.left, t = r.top, rr = r.right, b = r.bottom;
      /** The nearest row or panel that scrolls, which must itself be on the screen. */
      let scroller: Element | null = null;
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX === "visible" && s.overflowY === "visible") continue;
        const q = a.getBoundingClientRect();
        l = Math.max(l, q.left);
        t = Math.max(t, q.top);
        rr = Math.min(rr, q.right);
        b = Math.min(b, q.bottom);
        if (!scroller && /auto|scroll/.test(s.overflowX + s.overflowY)) scroller = a;
      }
      const shows = rr - l > 0.5 && b - t > 0.5;
      if (!shows && !scroller) continue;
      const outside = (q: { left: number; top: number; right: number; bottom: number }) => q.left < -0.5 || q.top < -0.5 || q.right > W + 0.5 || q.bottom > H + 0.5;
      const off = shows ? outside({ left: l, top: t, right: rr, bottom: b }) : outside(scroller!.getBoundingClientRect());
      const typed = el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !["range", "checkbox", "radio", "button"].includes((el as HTMLInputElement).type));
      const name = (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
      out.push({ name, w: r.width, h: r.height, off, font: typed ? parseFloat(cs.fontSize) : null });
    }
    return out;
  });
}

