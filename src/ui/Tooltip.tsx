// One tooltip for every control (PLAN §20 D351, D361, D368 (6)): a short phrase that says what the control is
// for, then its shortcut at the end as a small key cap ("Carve a river" then a cap showing 7), never a key in
// brackets in the middle. A control carries its phrase as its `title` and its keys in `data-keys` (`tip()`
// builds both); the one `Tooltips` layer, mounted once at the page's root, shows them when the control is
// hovered. While it shows, the control's `title` waits in `data-tip-held`, so the browser's own tooltip never
// shows beside it, and a control named only by its title keeps that name as its `aria-label`.
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

/** A control's tooltip: `text`, then each key as a small key cap at the end. A key may carry a few words after
 *  it ("V flips it": a cap V, then "flips it"); keys that are null or false are left out. Spread it on the
 *  control: `<button {...tip("Carve a river", "7")}>`. */
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
      const above = r.bottom + 44 > window.innerHeight;
      visible = true;
      setShown({ text, keys: keysOf(el), x: r.left + r.width / 2, y: above ? r.top - 6 : r.bottom + 6, above });
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
      // (off the page, or onto something that sends no events of its own, as a disabled button)
      if (held && !(e.relatedTarget instanceof Node && held.contains(e.relatedTarget))) point(e.relatedTarget);
    };
    const press = () => {
      quiet = true;
      hide();
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
    return () => {
      away();
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
    setLeft(Math.max(8, Math.min(window.innerWidth - w - 8, shown.x - w / 2)));
  }, [shown]);

  if (!shown) return null;
  return (
    <div ref={box} class={`tip${shown.above ? " above" : ""}`} role="tooltip" aria-hidden="true" style={{ left: `${left}px`, top: `${shown.y}px` }}>
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
