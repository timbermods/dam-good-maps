// A finger's press with something in hand (#1074 slice 3; render3d/touch.ts `FingerPress`), as the page shows it: a small
// ring where it aims, a little above the finger, so the finger never hides the spot; the finger's own place kept clear of
// the words beside the pointer (`.finger-reach`, which pointerNote.tsx avoids, so a refusal's reason shows beside the
// preview and never under the finger); and Cancel at the view's top, which a second finger taps, or the finger slides
// onto and lifts on (`data-press-cancel`, the renderer's test), to let the press go with nothing applied.

import { tip } from "../../ui/Tooltip";
import type { Ed } from "../ed";

/** The finger's own place, kept clear of the notes: about a fingertip round its point, and the hand below it (CSS px). */
const REACH = { side: 40, above: 36, below: 80 };

export function fingerPress(ed: Ed) {
  const a = ed.fingerAim;
  const canvas = ed.renderer.current?.canvas;
  if (!a || !canvas) return null;
  // (the notes and these sit in the view's own pixels, as the pointer's words do: `notePointer`)
  const box = canvas.getBoundingClientRect();
  const aim = { x: a.aim.x - box.left, y: a.aim.y - box.top };
  const finger = { x: a.finger.x - box.left, y: a.finger.y - box.top };
  const cancel = (e: Event) => {
    e.preventDefault();
    ed.renderer.current?.cancelPress();
  };
  return (
    <>
      <div class="finger-aim" style={{ left: `${aim.x}px`, top: `${aim.y}px` }} aria-hidden="true" />
      <div
        class="finger-reach"
        style={{ left: `${finger.x - REACH.side}px`, top: `${finger.y - REACH.above}px`, width: `${2 * REACH.side}px`, height: `${REACH.above + REACH.below}px` }}
        aria-hidden="true"
      />
      <button type="button" class={`press-cancel${a.over ? " over" : ""}`} data-press-cancel="" {...tip("Let go without applying it")} onPointerDown={cancel} onClick={cancel}>
        Cancel
      </button>
    </>
  );
}
