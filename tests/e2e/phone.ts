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
      // (a control whose only words are a drawing, as the compass's turning N, has no words to cut)
      if (!own && el.children.length && [...el.children].every((c) => c.getAttribute("aria-hidden") === "true")) continue;
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

/** A phone's safe-area insets in CSS px (the notch, the rounded corners and the home bar). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The safe-area insets applied to the page as the phone's browser gives them, `env(safe-area-inset-*)` (Chrome's own
 *  emulation, `Emulation.setSafeAreaInsetsOverride`; the page asks for them with `viewport-fit=cover`). */
export async function applyInsets(page: Page, insets: Insets) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets } as never);
}

/** What a phone's room shows cut, covered or out of place, as the page lays it out at rest (#1074; Kyler's phone on its
 *  side cut the Size card at the notch's inset and the rail's first and last tools at its ends). Each fault as a line:
 *  - a control (or a setting's card) not whole inside the room less its insets, or spilling past the plate it stands on;
 *  - one cut by a row or panel that scrolls, unless the cut is in the scroll's direction where more is there (a part-shown
 *    next item says the row goes on), and that edge is not a safe-area edge or the scroller fades it; a row of tools (or
 *    one that snaps) stands on a whole item at its start;
 *  - one another element covers (what the page hands a tap at its middle and its edges' middles is someone else's);
 *  - text cut short (`phoneClipped`), or one text laid over another. */
export async function phoneFaults(page: Page, insets: Insets): Promise<string[]> {
  const faults = await page.evaluate((ins) => {
    const W = document.documentElement.clientWidth;
    const H = document.documentElement.clientHeight;
    const safe = { left: ins.left, top: ins.top, right: W - ins.right, bottom: H - ins.bottom };
    const out: string[] = [];
    const sel = "button, select, textarea, a[href], input:not([type=hidden]):not([type=file]), [role=checkbox], [role=menuitem], [role=slider], .set.plate";
    const name = (el: Element) => {
      const n = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
      const cls = [...el.classList].slice(0, 2).join(".");
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} "${n}"`;
    };
    const px = (n: number) => Math.round(n);
    type Side = "left" | "top" | "right" | "bottom";
    type Box = Record<Side, number>;
    const SIDES: Side[] = ["left", "top", "right", "bottom"];
    const clear = (c: string) => c === "rgba(0, 0, 0, 0)" || c === "transparent";
    function* ancestry(e: Element | null) {
      for (; e && e !== document.body; e = e.parentElement) yield e;
    }
    const scrollsWay = (a: HTMLElement, across: boolean) => {
      const s = getComputedStyle(a);
      return across ? /auto|scroll/.test(s.overflowX) && a.scrollWidth > a.clientWidth + 1 : /auto|scroll/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 1;
    };
    /** Each drawn control, what of it shows and the layer it is laid out in (its nearest positioned panel). */
    const drawn: { el: HTMLElement; vis: Box; layer: Element }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.closest("[hidden], .visually-hidden, [aria-hidden=true], [role=tooltip]") || el.classList.contains("visually-hidden")) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true } as never)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // what of it shows: cut by every ancestor that clips (at its padding box), each cut kept with what made it
      let vis: Box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      const cuts: { side: Side; by: HTMLElement; at: number }[] = [];
      let plate: { el: HTMLElement; box: DOMRect } | null = null;
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (!plate && a !== document.body && (!clear(s.backgroundColor) || s.backgroundImage !== "none")) plate = { el: a, box: a.getBoundingClientRect() };
        if (s.overflowX === "visible" && s.overflowY === "visible") continue;
        const q = a.getBoundingClientRect();
        const pad: Box = { left: q.left + a.clientLeft, top: q.top + a.clientTop, right: q.left + a.clientLeft + a.clientWidth, bottom: q.top + a.clientTop + a.clientHeight };
        for (const k of SIDES) if (k === "left" || k === "top" ? pad[k] > vis[k] + 0.5 : pad[k] < vis[k] - 0.5) cuts.push({ side: k, by: a, at: pad[k] });
        vis = { left: Math.max(vis.left, pad.left), top: Math.max(vis.top, pad.top), right: Math.min(vis.right, pad.right), bottom: Math.min(vis.bottom, pad.bottom) };
      }
      const shows = vis.right - vis.left > 0.5 && vis.bottom - vis.top > 0.5;
      if (shows) drawn.push({ el, vis, layer: [...ancestry(el.parentElement)].find((a) => /absolute|fixed/.test(getComputedStyle(a).position)) ?? document.body });
      // (scrolled out of a row or panel that scrolls: reachable, nothing of it drawn)
      if (!shows) {
        if (!cuts.some((c) => scrollsWay(c.by, c.side === "left" || c.side === "right"))) out.push(`${name(el)} off the screen`);
        continue;
      }
      // a cut: fine only in a scroll's direction where more is there; a row that snaps stands on a whole item at its
      // start; at a safe-area edge only where the scroller fades its edge (a fade says more is there, and what lies
      // under the inset is faded away)
      const faded = new Set<Side>();
      for (const c of cuts) {
        const across = c.side === "left" || c.side === "right";
        const start = c.side === "left" || c.side === "top";
        const b = c.by;
        const s = getComputedStyle(b);
        const fades = (s.maskImage || s.webkitMaskImage || "none") !== "none";
        if (fades) faded.add(c.side);
        // (a row of tools, or one that snaps, stands on whole items)
        const snaps = (s.scrollSnapType || "none") !== "none" || b.getAttribute("role") === "toolbar";
        const more = start ? (across ? b.scrollLeft : b.scrollTop) > 1 : across ? b.scrollLeft + b.clientWidth < b.scrollWidth - 1 : b.scrollTop + b.clientHeight < b.scrollHeight - 1;
        const edge = start ? ins[c.side] > 0 && c.at <= safe[c.side] + 2 : ins[c.side] > 0 && c.at >= safe[c.side] - 2;
        const why = !scrollsWay(b, across) ? "by a box that does not scroll that way" : !more ? "where nothing more is there" : start && snaps ? "at the start of a row of tools (at rest it stands on a whole item)" : edge && !fades ? "at a safe-area edge" : "";
        if (why) out.push(`${name(el)} cut at its ${c.side} ${why} (${name(b)}, ${px(r[c.side])} past ${px(c.at)})`);
      }
      // what shows of it lies in the room less its insets (but where a scroller fades it away)
      const under = SIDES.filter((k) => !faded.has(k) && (k === "left" || k === "top" ? vis[k] < safe[k] - 0.5 : vis[k] > safe[k] + 0.5));
      if (under.length) out.push(`${name(el)} under the safe area at its ${under.join(", ")} (${px(vis.left)},${px(vis.top)} to ${px(vis.right)},${px(vis.bottom)})`);
      // inside the plate it stands on
      if (plate && !cuts.length) {
        const b = plate.box;
        const outs = SIDES.filter((k) => (k === "left" || k === "top" ? r[k] < b[k] - 0.5 : r[k] > b[k] + 0.5));
        if (outs.length) out.push(`${name(el)} spills past its plate ${name(plate.el)} at its ${outs.join(", ")}`);
      }
      // nothing laid over part of it: the page's answer to a tap at its middle and at its edges' middles is this control
      // (one wholly under a sheet is put away, not covered; a menu or a dialog opened over the page lies over it by
      // design, as a scroller's sticky foot does over what scrolls under it)
      if (getComputedStyle(el).pointerEvents !== "none" && !el.matches(".set.plate")) {
        const mx = (vis.left + vis.right) / 2;
        const my = (vis.top + vis.bottom) / 2;
        const laid = (hit: Element) => !!hit.closest("[role=tooltip], .tip, [role=menu], [role=dialog], :has(> [role=dialog])") || [...ancestry(hit)].some((a) => getComputedStyle(a).position === "sticky");
        // (partly: some of those points answer this control, another something else)
        const hits = [[mx, my], [vis.left + 3, my], [vis.right - 3, my], [mx, vis.top + 3], [mx, vis.bottom - 3]].map(([x, y]) => ({ x, y, hit: document.elementFromPoint(x, y) }));
        const own = hits.some((p) => p.hit && el.contains(p.hit));
        const others = hits.filter((p) => p.hit && !el.contains(p.hit) && !laid(p.hit));
        if (own && others.length) out.push(`${name(el)} partly covered at ${px(others[0].x)},${px(others[0].y)} by ${name(others[0].hit!)}`);
      }
    }
    // no control's box over another's in the same panel (a chip or a button laid on the tiles beside it)
    for (let i = 0; i < drawn.length; i++)
      for (let j = i + 1; j < drawn.length; j++) {
        const a = drawn[i];
        const b = drawn[j];
        if (a.layer !== b.layer || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        // (a scroller's sticky foot lies over what scrolls under it by design, as above)
        if ([a.el, b.el].some((e) => [...ancestry(e)].some((x) => getComputedStyle(x).position === "sticky"))) continue;
        const w = Math.min(a.vis.right, b.vis.right) - Math.max(a.vis.left, b.vis.left);
        const h = Math.min(a.vis.bottom, b.vis.bottom) - Math.max(a.vis.top, b.vis.top);
        if (w > 2 && h > 2) out.push(`${name(a.el)} and ${name(b.el)} lie over each other (${px(w)}×${px(h)})`);
      }
    // one text laid over another (each text's own drawn lines, not its box), where both are drawn
    const texts: { el: HTMLElement; rs: DOMRect[] }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent ?? "").trim()) continue;
      const host = n.parentElement!;
      if (host.closest("[hidden], .visually-hidden, [aria-hidden=true], script, style, svg, [role=tooltip], .tip, .note-sizer") || !host.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true } as never)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rs = [...range.getClientRects()].filter((q) => q.width > 1 && q.height > 1 && q.right > 0 && q.bottom > 0 && q.left < W && q.top < H);
      // (a text under a sheet or a dialog is put away: only texts drawn at their own middle count)
      const mid = rs[0] && document.elementFromPoint((rs[0].left + rs[0].right) / 2, (rs[0].top + rs[0].bottom) / 2);
      if (rs.length && mid && (host.contains(mid) || mid.contains(host))) texts.push({ el: host, rs });
    }
    const seen = new Set<string>();
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i];
        const b = texts[j];
        if (a.el === b.el) continue;
        for (const p of a.rs)
          for (const q of b.rs) {
            const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
            const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
            // (a line's box is its font's height: lines set tight touch without overlapping)
            if (w <= 2 || h <= Math.min(p.height, q.height) * 0.35) continue;
            // (one inside the other's box, a word in its button, lies on it rather than over it)
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            const line = `${name(a.el)} overlaps ${name(b.el)}`;
            if (!seen.has(line)) out.push(line);
            seen.add(line);
          }
      }
    return out;
  }, insets);
  return [...faults, ...(await phoneClipped(page))];
}
