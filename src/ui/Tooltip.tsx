// One tooltip for every control (PLAN §20 D351, D361, D368 (6)): a short phrase that says what the control is
// for, then its shortcut at the end as a small key cap ("Carve a river" then a cap showing 7), never a key in
// brackets in the middle. A control carries its phrase as its `title` and its keys in `data-keys` (`tip()`
// builds both); the one `Tooltips` layer, mounted once at the page's root, shows them when the control is
// hovered. While it shows, the control's `title` waits in `data-tip-held`, so the browser's own tooltip never
// shows beside it, and a control named only by its title keeps that name as its `aria-label`.
//
// A finger has no hover: a long press on a control shows its tooltip instead, and that press is not a tap (#1074); a
// control whose long press does something of its own (`OWN_LONG_PRESS`) keeps it. The press's own events' times
// decide whether it was long: a page busy past `LONG_PRESS` runs the timer before a tap's lift that came sooner, and
// that tap stays a tap (as `render3d/touch.ts`'s hold, #1074 slice 6).
//
// tests/e2e/tooltips.spec.ts checks every control on the page has one, in the form; tests/unit/tooltipForm.test.ts
// checks the tools', forces' and shelf's, where they are written.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

/** Between a control's keys in `data-keys`. */
export const KEY_SEP = "|";
/** Where a hovered control's title waits while its tooltip shows. */
export const HELD = "data-tip-held";
/** The control had no name but its title: the layer gave it one while its title waits. */
const NAMED = "data-tip-named";
/** How long the pointer rests on a control before its tooltip shows, in ms (about the browser's own). */
const DELAY = 450;
/** A finger has no hover (#1074): held this long on a control, its tooltip shows, and the press is not a tap. */
export const LONG_PRESS = 500;
/** How far a long press may wander before it is a drag, in CSS px. */
export const LONG_SLOP = 10;
/** On a control whose long press is its own (Your maps' tiles: it selects the map), a long press shows no tooltip. */
export const OWN_LONG_PRESS = "data-long-press";
/** How long a long press's tooltip stays once the finger lifts, in ms. */
const LONG_LINGER = 1500;

/** A control's tooltip: `text`, then each key as a small key cap at the end. A key may carry a few words after
 *  it ("V flips it": a cap V, then "flips it"); keys that are null or false are left out. Spread it on the
 *  control: `<button {...tip("Carve a river", "Shift+1")}>`. */
export function tip(text: string, ...keys: (string | null | undefined | false)[]): { title: string; "data-keys"?: string } {
  const k = keys.filter((x): x is string => !!x);
  return k.length ? { title: text, "data-keys": k.join(KEY_SEP) } : { title: text };
}

/** A key's cap and the words after it: "V flips it" → V and "flips it"; "Ctrl+Z" → Ctrl+Z alone. */
export function keyParts(entry: string): { cap: string; words: string } {
  const i = entry.indexOf(" ");
  return i < 0 ? { cap: entry, words: "" } : { cap: entry.slice(0, i), words: entry.slice(i + 1) };
}

/** The keys a control's tooltip ends with. */
export function keysOf(el: Element): string[] {
  const k = el.getAttribute("data-keys");
  return k ? k.split(KEY_SEP).filter(Boolean) : [];
}

/** The tooltip as it shows: its words, its keys, and where. */
interface Shown {
  text: string;
  keys: string[];
  x: number;
  y: number;
  /** Above the control (no room below). */
  above: boolean;
  /** Beside the control, to its left, level with its middle (`data-tip-side="left"`: a control with something that
   *  opens beneath it, the speaker's volume). */
  left: boolean;
}

/** The page's one tooltip layer. */
export function Tooltips() {
  const [shown, setShown] = useState<Shown | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    let held: HTMLElement | null = null;
    let timer = 0;
    /** Pressed: it stays hidden until the pointer leaves the control (as the browser's own does). */
    let quiet = false;
    /** The tooltip is showing. */
    let visible = false;

    /** The control's title waits while it is hovered (the browser's own tooltip never shows beside ours). */
    function hold(el: HTMLElement) {
      const t = el.getAttribute("title");
      if (t === null) return;
      el.setAttribute(HELD, t);
      el.removeAttribute("title");
      // (a control named only by its title keeps its name)
      const named = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") || !!(el.textContent ?? "").trim();
      if (!named || el.hasAttribute(NAMED)) {
        el.setAttribute("aria-label", t);
        el.setAttribute(NAMED, "");
      }
    }
    function release(el: HTMLElement) {
      const t = el.getAttribute(HELD);
      el.removeAttribute(HELD);
      // (the page may have given it a new title meanwhile: that one stays)
      if (t !== null && !el.hasAttribute("title")) el.setAttribute("title", t);
      if (el.hasAttribute(NAMED)) {
        el.removeAttribute("aria-label");
        el.removeAttribute(NAMED);
      }
    }
    function hide() {
      clearTimeout(timer);
      if (visible) setShown(null);
      visible = false;
    }
    function show(el: HTMLElement) {
      if (!el.isConnected || held !== el) return;
      const text = (el.getAttribute(HELD) ?? "").trim();
      if (!text) return;
      const r = el.getBoundingClientRect();
      const left = el.getAttribute("data-tip-side") === "left";
      const above = !left && r.bottom + 44 > window.innerHeight;
      visible = true;
      setShown(
        left
          ? { text, keys: keysOf(el), x: r.left - 6, y: r.top + r.height / 2, above: false, left: true }
          : { text, keys: keysOf(el), x: r.left + r.width / 2, y: above ? r.top - 6 : r.bottom + 6, above, left: false }
      );
    }
    function point(target: EventTarget | null) {
      const el = (target instanceof Element ? target.closest(`[title], [${HELD}]`) : null) as HTMLElement | null;
      if (el === held) {
        // (the page changed its title while it is hovered: the new words wait, and show)
        if (el && el.hasAttribute("title")) {
          hold(el);
          if (!quiet) {
            clearTimeout(timer);
            timer = window.setTimeout(() => show(el), visible ? 0 : DELAY);
          }
        }
        return;
      }
      if (held) release(held);
      hide();
      quiet = false;
      held = el;
      if (!el) return;
      hold(el);
      timer = window.setTimeout(() => show(el), DELAY);
    }
    const over = (e: PointerEvent) => point(e.target);
    const out = (e: PointerEvent) => {
      // (a finger lifting leaves its control: a long press's tooltip stays its moment)
      if (longShown && e.pointerType === "touch") return;
      // (off the page, or onto something that sends no events of its own, as a disabled button)
      if (held && !(e.relatedTarget instanceof Node && held.contains(e.relatedTarget))) point(e.relatedTarget);
    };
    // a long press (a finger, #1074): the control's tooltip, the press then no tap
    let long = 0;
    let longAt: { x: number; y: number; id: number } | null = null;
    /** When the finger came down, by its event's clock (the lift's is compared with it, not the timer's). */
    let downAt = 0;
    /** A long press's tooltip is up: the lift keeps it a moment, and the tap that would follow is swallowed. */
    let longShown = false;
    let linger = 0;
    const endLong = () => {
      clearTimeout(long);
      longAt = null;
    };
    const press = (e?: Event) => {
      quiet = true;
      hide();
      clearTimeout(linger);
      longShown = false;
      endLong();
      if (!(e instanceof PointerEvent) || e.pointerType !== "touch" || !held || held.closest(`[${OWN_LONG_PRESS}]`)) return;
      const el = held;
      longAt = { x: e.clientX, y: e.clientY, id: e.pointerId };
      downAt = e.timeStamp;
      long = window.setTimeout(() => {
        longAt = null;
        if (held !== el) return;
        longShown = true;
        show(el);
      }, LONG_PRESS);
    };
    const wander = (e: PointerEvent) => {
      if (longAt && e.pointerId === longAt.id && Math.hypot(e.clientX - longAt.x, e.clientY - longAt.y) > LONG_SLOP) endLong();
    };
    const lift = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      endLong();
      if (!longShown) return;
      // (lifted before a long press by its own events' times: the timer ran late behind a busy page; a tap, its tooltip
      // gone and its click let through)
      if (e.timeStamp - downAt < LONG_PRESS) {
        longShown = false;
        away();
        return;
      }
      clearTimeout(linger);
      linger = window.setTimeout(() => {
        longShown = false;
        away();
      }, LONG_LINGER);
    };
    const swallow = (e: Event) => {
      if (!longShown) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const away = () => {
      if (held) release(held);
      held = null;
      hide();
    };
    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointermove", over, true);
    document.addEventListener("pointerout", out, true);
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("keydown", press, true);
    document.addEventListener("wheel", press, { capture: true, passive: true });
    window.addEventListener("blur", away);
    window.addEventListener("scroll", press, true);
    document.addEventListener("pointermove", wander, true);
    document.addEventListener("pointerup", lift, true);
    document.addEventListener("pointercancel", lift, true);
    document.addEventListener("click", swallow, true);
    document.addEventListener("contextmenu", swallow, true);
    return () => {
      away();
      endLong();
      clearTimeout(linger);
      document.removeEventListener("pointermove", wander, true);
      document.removeEventListener("pointerup", lift, true);
      document.removeEventListener("pointercancel", lift, true);
      document.removeEventListener("click", swallow, true);
      document.removeEventListener("contextmenu", swallow, true);
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointermove", over, true);
      document.removeEventListener("pointerout", out, true);
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("keydown", press, true);
      document.removeEventListener("wheel", press, true);
      window.removeEventListener("blur", away);
      window.removeEventListener("scroll", press, true);
    };
  }, []);

  // (kept inside the window: centred under the control where it fits)
  useLayoutEffect(() => {
    if (!shown || !box.current) return;
    const w = box.current.offsetWidth;
    // (beside a control: its right edge on the control's left; else centred under or over it)
    setLeft(Math.max(8, shown.left ? shown.x - w : Math.min(window.innerWidth - w - 8, shown.x - w / 2)));
  }, [shown]);

  if (!shown) return null;
  return (
    <div ref={box} class={`tip${shown.above ? " above" : ""}${shown.left ? " beside" : ""}`} role="tooltip" aria-hidden="true" style={{ left: `${left}px`, top: `${shown.y}px` }}>
      <span class="tip-text">{shown.text}</span>
      {shown.keys.map((k) => {
        const { cap, words } = keyParts(k);
        return (
          <span class="tip-key" key={k}>
            <kbd>{cap}</kbd>
            {words ? <span class="tip-key-words">{words}</span> : null}
          </span>
        );
      })}
    </div>
  );
}
