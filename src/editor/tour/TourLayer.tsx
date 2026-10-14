// The 20-second tour on the page (D377): a quiet layer over the editor while the tour plays on its temporary copy
// of the map: the ghost cursor, the keys as they are pressed, and a shield that keeps the player's own input out
// (the tour is watched, not driven) but for Esc, which ends it at once. The editor under it is the real editor,
// opened on a copy; this layer only feeds it the gestures (conductor.ts, script.ts).

import { useEffect, useRef, useState } from "preact/hooks";
import type { Ed } from "../ed";
import { brushMarks, forceMarks, framingView } from "./camera";
import { Conductor, TourEnded, type Pt } from "./conductor";
import { playTour, type Says } from "./script";
import { brushSpots, forceSpots, type TourGround } from "./spots";

/** The tour's pace: 1 is the stored gestures' own timings; half as quick again makes the tour about 21 seconds with the
 *  forces' own time. A test may change it (`window.dgmTourPace`) to look at a moment, or to get through quicker. */
const PACE = 1.5;

/** What the player's own input would have done under the tour: stopped before the editor sees it. */
const SHIELDED = ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "mousemove", "click", "dblclick", "auxclick", "contextmenu", "wheel", "dragstart", "dragenter", "dragover", "drop", "touchstart", "touchmove", "touchend"];

export function TourLayer(p: { ed: Ed; onEnd(): void }) {
  const { ed } = p;
  const ghost = useRef<HTMLDivElement>(null);
  const [says, setSays] = useState<Says | null>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [pill, setPill] = useState<{ left: number; top: number } | null>(null);
  const ended = useRef(false);
  const abort = useRef(new AbortController());
  const end = useRef(p.onEnd);
  end.current = p.onEnd;

  /** The tour is over (it finished, or Esc): once. */
  const finish = () => {
    if (ended.current) return;
    ended.current = true;
    abort.current.abort();
    end.current();
  };

  // the player's own keys and pointer stay out, but for Esc (the tour's own are not trusted events: the browser
  // marks the ones a script makes)
  useEffect(() => {
    const stop = (ev: Event) => {
      if (!ev.isTrusted) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      if (ev.type === "keydown" && (ev as KeyboardEvent).key === "Escape") finish();
    };
    for (const t of SHIELDED) window.addEventListener(t, stop, { capture: true, passive: false });
    return () => {
      for (const t of SHIELDED) window.removeEventListener(t, stop, { capture: true });
    };
  }, []);

  // the caption sits just under the page's top rows, over the part of the view the map is never framed into
  useEffect(() => {
    const place = () => {
      const r = ed.renderer.current;
      if (!r) return;
      const c = r.canvas.getBoundingClientRect();
      const i = r.frameInsets;
      setPill({ left: c.left + i.left + (c.width - i.left - i.right) / 2, top: c.top + Math.max(i.top - 42, 8) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [ed.ready]);

  useEffect(() => {
    const r = ed.renderer.current;
    if (!ed.ready || !r) return;
    const view = r.getView();
    const saveButton = () => document.querySelector<HTMLElement>("header.editor-bar .primary");
    const hands = new Conductor({
      canvas: r.canvas,
      signal: abort.current.signal,
      ghost: {
        cursor: (at, pressed) => {
          const g = ghost.current;
          if (!g) return;
          g.style.opacity = at ? "1" : "0";
          if (at) g.style.transform = `translate(${at.x}px, ${at.y}px) scale(${pressed ? 0.86 : 1})`;
          g.classList.toggle("pressed", !!pressed);
        },
        ripple: (at: Pt) => {
          const id = Math.random();
          setRipples((l) => [...l, { id, x: at.x, y: at.y }]);
          setTimeout(() => setRipples((l) => l.filter((x) => x.id !== id)), 700);
        },
      },
    });
    const run = async () => {
      try {
        // (the map has to be drawn, its first frame settled)
        await hands.sleep(500);
        // (the land as it is drawn now, its water and its objects: the spots are chosen on it)
        const ground = (): TourGround | null => {
          const m = r.mapState();
          const e = ed.mirror.current.entities;
          return m ? { W: m.W, H: m.H, heights: m.heights, depth: m.surface.depth, objects: Array.from({ length: e.count }, (_, k) => ({ x: e.x[k], y: e.y[k] })) } : null;
        };
        const first = ground();
        if (!first) return;
        const forces = forceSpots(first);
        const glide = async (marks: ReturnType<typeof forceMarks>, tilt?: number) => {
          // (the camera frames what is worked on next, clear of the controls)
          const framed = framingView(r, marks, tilt);
          if (!framed) return;
          r.glideTo(framed, 750);
          await hands.sleep(800);
        };
        const m = first;
        const clamp = (n: number, hi: number) => Math.max(0, Math.min(hi, n));
        await playTour({
          hands,
          forces,
          pace: window.dgmTourPace ?? PACE,
          at: (x, y, level) => {
            const c = r.canvas.getBoundingClientRect();
            const q = r.project(x, level, -y);
            return { x: c.left + q.x, y: c.top + q.y };
          },
          level: (t) => r.heightAt(clamp(Math.floor(t.x), m.W - 1), clamp(Math.floor(t.y), m.H - 1)),
          say: setSays,
          frameForces: () => glide(forceMarks(forces)),
          brushSpots: async () => {
            const g = ground();
            const spots = brushSpots(g ?? first, forces);
            await glide(brushMarks(spots), 0.9);
            return spots;
          },
          power: () => ed.craterUiRef.current.power,
          forcing: () => !!ed.forcer.current?.running,
          save: () => {
            const b = saveButton();
            if (!b) return null;
            const c = b.getBoundingClientRect();
            // (the tip on the button's lower edge: the arrow hangs below it and never over its words)
            return { at: { x: c.left + c.width * 0.62, y: c.bottom - 7 }, lit: (on) => b.classList.toggle("tour-lit", on) };
          },
        });
      } catch (e) {
        if (!(e instanceof TourEnded)) console.error("the tour stopped:", e);
      } finally {
        hands.letGo();
        saveButton()?.classList.remove("tour-lit");
        r.setView(view);
        finish();
      }
    };
    void run();
    return () => abort.current.abort();
    // (the tour runs once, when the editor is ready)
  }, [ed.ready]);

  return (
    <div class="tour">
      <div class="tour-shield" aria-hidden="true" />
      {pill ? (
        <div class="tour-pill" role="status" aria-live="polite" style={{ left: `${pill.left}px`, top: `${pill.top}px` }}>
          <span class="tour-says">
            {says?.keys.map((k, i) => (
              <span key={k + i} class="tour-key">
                {i ? <span class="tour-plus">+</span> : null}
                <kbd class="cap">{k}</kbd>
              </span>
            ))}
            <span class="tour-words">{says?.words ?? "The 20-second tour"}</span>
          </span>
          <span class="tour-esc">
            <kbd class="cap">Esc</kbd> stops
          </span>
        </div>
      ) : null}
      {ripples.map((r) => (
        <span key={r.id} class="tour-ripple" style={{ left: `${r.x}px`, top: `${r.y}px` }} />
      ))}
      <div class="tour-ghost" ref={ghost} aria-hidden="true">
        <svg width="22" height="28" viewBox="0 0 22 28">
          <path d="M2 2 L2 21 L7 16.6 L10.6 25 L14 23.5 L10.4 15.2 L17 15 Z" />
        </svg>
      </div>
    </div>
  );
}
