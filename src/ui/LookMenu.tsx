// The look's menu on the 3D view (Map look 2, PLAN §20 D284): High, the default where this computer
// runs it smoothly (it falls back to Standard by itself where it doesn't), or Standard, held; and
// High's four parts, each switchable (D242, D250: every single effect is switchable too, through the
// renderer's `setHighEffect`). Hidden where the browser draws in software (the light look: there is
// no choice to make). Built from the shared styles only; the design pass styles it (D176, D296).

import { useEffect, useRef, useState } from "preact/hooks";
import type { MapRenderer } from "../render3d";
import { HIGH_EFFECTS, type HighEffect } from "../render3d/high/effects";
import type { LookChoice } from "../render3d/high/fallback";
import type { Look } from "../render3d/renderer";

const CHOICES: { key: LookChoice; label: string; note: string }[] = [
  { key: "auto", label: "Automatic", note: "High where it runs smoothly, else Standard" },
  { key: "high", label: "High", note: "Warm light, soft shadows, deeper water, new trees" },
  { key: "standard", label: "Standard", note: "The clean look, the lightest to draw" },
];

/** High's parts as the menu offers them: the four investigations it came from. */
const PARTS: { from: HighEffect["from"]; label: string }[] = [
  { from: "#38", label: "Water and soft shadows" },
  { from: "#65", label: "Light and materials" },
  { from: "#66", label: "Trees and bushes" },
  { from: "#67", label: "Finishing touches" },
];

/** What the look is doing, in a line. */
export function lookWords(choice: LookChoice, look: Look): string {
  if (look === "light") return "The light look: this browser draws without the graphics card.";
  if (choice === "auto") {
    if (look === "high") return "Drawing High: this computer runs it smoothly.";
    if (look === "lower") return "Drawing High with a few effects off, to keep it smooth here.";
    return "Drawing Standard: High was too slow on this computer.";
  }
  return look === "standard" ? "Drawing Standard." : look === "lower" ? "Drawing High with a few effects off." : "Drawing High.";
}

/** `buttonClass`: its button's class, as its neighbours' (the editor's header: "ghost"). */
export function LookMenu(props: { renderer: MapRenderer | null; buttonClass?: string }) {
  const r = props.renderer;
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => (r ? r.listenLook(() => setTick((n) => n + 1)) : undefined), [r]);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  if (!r || r.look === "light") return null;
  const choice = r.lookChoice;
  const look = r.look;
  const high = look === "high" || look === "lower";
  const effects = r.highEffects;
  return (
    <div class="menu-wrap" ref={wrap}>
      <button type="button" class={props.buttonClass} aria-label={`Look: ${high ? "High" : "Standard"}`} aria-expanded={open} aria-controls="look-menu" onClick={() => setOpen(!open)} title="Choose how the map is drawn">
        {/* (one width whatever it says, its widest's: the header's right side never changes width, Kyler 2026-10-06) */}
        <span class="look-words">
          <span>Look: {high ? "High" : "Standard"}</span>
          <span class="look-sizer" aria-hidden="true">
            Look: Standard
          </span>
        </span>
      </button>
      {open ? (
        <div class="menu look-menu" id="look-menu" role="group" aria-label="Look">
          {/* the page's own controls: a segmented choice (the chosen cell lit as the page's choices are) and checkbox
              rows as the Show column's, a wrapped word hanging under its own first letter */}
          <div class="look-choices" role="radiogroup" aria-label="Drawing">
            {CHOICES.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={choice === c.key}
                title={c.note}
                onClick={() => {
                  r.setLookChoice(c.key);
                  setTick((n) => n + 1);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p class="note" role="status">
            {lookWords(choice, look)}
          </p>
          {high
            ? PARTS.map((p) => {
                const keys = HIGH_EFFECTS.filter((e) => e.from === p.from).map((e) => e.key);
                const on = keys.every((k) => effects[k]);
                return (
                  <button
                    key={p.from}
                    type="button"
                    role="checkbox"
                    class="look-part"
                    aria-checked={on}
                    title={`Turn High's ${p.label.toLowerCase()} on or off`}
                    onClick={() => {
                      for (const k of keys) r.setHighEffect(k, !on);
                      setTick((n) => n + 1);
                    }}
                  >
                    <span class={`cb${on ? " on" : ""}`} aria-hidden="true">
                      {on ? (
                        <svg viewBox="0 0 12 12">
                          <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      ) : null}
                    </span>
                    <span class="cb-word">{p.label}</span>
                  </button>
                );
              })
            : null}
        </div>
      ) : null}
    </div>
  );
}
