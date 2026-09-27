// The look's menu on the 3D view (Map look 2, PLAN §20 D284): High, the default where this computer
// runs it smoothly (it falls back to Standard by itself where it doesn't), or Standard, held; and
// High's effects, each switchable (D242, D250). Hidden where the browser draws in software (the
// light look: there is no choice to make). Built from the shared panel styles (D176).

import { useEffect, useRef, useState } from "preact/hooks";
import type { MapRenderer } from "../render3d";
import { HIGH_EFFECTS } from "../render3d/high/effects";
import type { LookChoice } from "../render3d/high/fallback";
import type { Look } from "../render3d/renderer";

const CHOICES: { key: LookChoice; label: string; note: string }[] = [
  { key: "auto", label: "Automatic", note: "High where this computer draws it smoothly, Standard where it doesn't" },
  { key: "high", label: "High", note: "Warm light, soft shadows, deeper water and new trees" },
  { key: "standard", label: "Standard", note: "The clean look, lightest to draw" },
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

/** `look`: the look drawn, as the view last heard it (the menu redraws when it changes). */
export function LookMenu(props: { renderer: MapRenderer | null; look: Look }) {
  const r = props.renderer;
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
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
  const now = r.highEffectsNow;
  return (
    <div class="menu-wrap look-menu" ref={wrap}>
      <button type="button" aria-expanded={open} aria-controls="look-menu" onClick={() => setOpen(!open)} title={lookWords(choice, look)}>
        Look: {high ? "High" : "Standard"}
      </button>
      {open ? (
        <div class="checks-list look-list" id="look-menu" role="group" aria-label="Look">
          <fieldset>
            <legend class="checks-head">How the map is drawn</legend>
            {CHOICES.map((c) => (
              <label key={c.key} class="look-choice">
                <input
                  type="radio"
                  name="look"
                  checked={choice === c.key}
                  onChange={() => {
                    r.setLookChoice(c.key);
                    setTick((n) => n + 1);
                  }}
                />
                <span>
                  <b>{c.label}</b> <span class="note">{c.note}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p class="note" role="status">
            {lookWords(choice, look)}
          </p>
          {high ? (
            <details>
              <summary>High's effects</summary>
              <ul class="look-effects">
                {HIGH_EFFECTS.map((e) => (
                  <li key={e.key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={effects[e.key]}
                        onChange={(ev) => {
                          r.setHighEffect(e.key, (ev.target as HTMLInputElement).checked);
                          setTick((n) => n + 1);
                        }}
                      />{" "}
                      {e.label}
                      {effects[e.key] && now && !now[e.key] ? <span class="note"> (off to keep it smooth)</span> : null}
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
