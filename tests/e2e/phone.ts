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


/** The words cut short on the page as a phone shows it (#1074: no ellipsis and no clipped label at a phone's size): text
 *  wider than its own box (an ellipsis, or a word spilling past it, as textClipping.spec measures), and text taller than
 *  a box that hides the rest (two lines kept for a longer name). A box that scrolls is not a cut, nor what lies off the
 *  screen. Each as `where "its words"`. */
export async function phoneClipped(page: Page) {
  return page.evaluate(() => {
    const TEXTY = "button, [role=button], [role=menuitem], [role=checkbox], label, a, summary, output, li, h1, h2, h3, h4, p, legend, dt, dd, th, td";
    const found: { el: Element; line: string }[] = [];
    const where = (e: Element) => {
      const name = (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32);
      const cls = [...e.classList].slice(0, 2).join(".");
      return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ""} "${name}"`;
    };
    for (const e of document.body.querySelectorAll("*")) {
      const el = e as HTMLElement;
      if (el.closest("[aria-hidden=true], .visually-hidden, script, style, svg, canvas, [role=tooltip]")) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
      if (!own && !el.matches(TEXTY)) continue;
      if (!el.textContent?.trim() || el.clientWidth === 0) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true } as never)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
      const cs = getComputedStyle(el);
      if (/auto|scroll/.test(cs.overflowX + cs.overflowY)) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const w = range.getBoundingClientRect();
      if (w.width === 0) continue;
      const left = r.left + el.clientLeft;
      const spill = Math.max(w.right - (left + el.clientWidth), left - w.left);
      const clamp = cs.getPropertyValue("-webkit-line-clamp");
      const hides = cs.overflowY !== "visible" || (clamp !== "" && clamp !== "none");
      const tall = hides && el.scrollHeight > el.clientHeight + 1;
      if (spill > 1) found.push({ el, line: `${where(el)} cut at its side (words ${Math.round(w.width)}px, box ${el.clientWidth}px)` });
      else if (tall) found.push({ el, line: `${where(el)} cut at its foot (words ${el.scrollHeight}px tall, box ${el.clientHeight}px)` });
    }
    // (a button and the span inside it are cut together: the innermost is named)
    return found.filter((f) => !found.some((g) => g !== f && f.el.contains(g.el))).map((f) => f.line);
  });
}

/** What a finger must hit of each control inside `scope` (a tool's settings, #1074 slice 7), the smallest side first:
 *  what is drawn of it (a finger aims at what it sees: a chip drawn small in a clear 44px box is a small chip; a slider is
 *  its whole bar, which takes a press anywhere), and of that what the page's own answer, `elementFromPoint`, sampled every
 *  2px, gives to this control and no other (a neighbour's box laid over it, or a clip, takes the rest): the longest run
 *  across and the longest run down. Each as `{ name, w, h }`. */
export async function hitTargets(page: Page, scope: string) {
  return page.evaluate((scope) => {
    const sel = "button, select, textarea, input:not([type=hidden]):not([type=file]), [role=checkbox], [role=slider], [role=menuitem]";
    const out: { name: string; w: number; h: number }[] = [];
    for (const root of document.querySelectorAll<HTMLElement>(scope))
      for (const el of root.querySelectorAll<HTMLElement>(sel)) {
        if (el.closest("[hidden], .visually-hidden, [aria-hidden=true]") || !el.checkVisibility({ checkVisibilityCSS: true } as never)) continue;
        if ((el as HTMLButtonElement).disabled) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        // what is drawn: the box, or a clear box's ::before plate (Auto's pill), inset as it is
        const cs = getComputedStyle(el);
        const clear = (s: CSSStyleDeclaration) => (s.backgroundColor === "rgba(0, 0, 0, 0)" || s.backgroundColor === "transparent") && s.backgroundImage === "none" && !(parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none");
        let r = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        const before = getComputedStyle(el, "::before");
        if (el.tagName !== "INPUT" && clear(cs) && before.content !== "none" && !clear(before) && before.position === "absolute") {
          const px = (v: string) => parseFloat(v) || 0;
          r = { left: box.left + px(before.left), top: box.top + px(before.top), right: box.right - px(before.right), bottom: box.bottom - px(before.bottom) };
        }
        const step = 2;
        const xs: number[] = [];
        const ys: number[] = [];
        for (let x = Math.ceil(r.left) + 0.5; x < r.right; x += step) xs.push(x);
        for (let y = Math.ceil(r.top) + 0.5; y < r.bottom; y += step) ys.push(y);
        // (a control inside another, a field in a button's cell: the innermost interactive one under the point)
        const hits = ys.map((y) => xs.map((x) => document.elementFromPoint(x, y)?.closest(sel) === el));
        const run = (line: boolean[]) => {
          let best = 0;
          let now = 0;
          for (const h of line) best = Math.max(best, (now = h ? now + 1 : 0));
          return best * step;
        };
        const w = Math.max(0, ...hits.map(run));
        const h = Math.max(0, ...xs.map((_, k) => run(hits.map((row) => row[k]))));
        const name = (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, " ").slice(0, 32);
        out.push({ name, w, h });
      }
    return out.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));
  }, scope);
}
