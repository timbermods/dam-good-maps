// The 20-second tour on the page (D377): a quiet layer over the editor while the tour plays on its temporary copy
// of the map: the ghost cursor, the keys as they are pressed, and a shield that keeps the player's own input out
// (the tour is watched, not driven) but for Esc, which ends it at once. The editor under it is the real editor,
// opened on a copy; this layer only feeds it the gestures (conductor.ts, script.ts).

import { useEffect, useRef, useState } from "preact/hooks";
import type { Ed } from "../ed";
import { brushMarks, forceMarks, framingView } from "./camera";
import { Conductor, TourEnded, type Pt } from "./conductor";
import { playTour } from "./script";
import { brushSpots, forceSpots, type TourGround } from "./spots";
import { pillBox, type Says, TourPill, useShield } from "./TourPill";

/** The tour's pace: 1 plays the gestures at the timings written in script.ts (about 20 seconds with the forces' own
 *  time on top). A test may change it (`window.dgmTourPace`) to look at a moment, or to get through quicker. */
const PACE = 1;

export function TourLayer(p: { ed: Ed; onEnd(): void }) {
  const { ed } = p;
  const ghost = useRef<HTMLDivElement>(null);
  const [says, setSays] = useState<Says | null>(null);
  const [down, setDown] = useState<ReadonlySet<string>>(new Set());
  const [wheelTick, setWheelTick] = useState(0);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [box, setBox] = useState(pillBox());
  const ended = useRef(false);
  const abort = useRef(new AbortController());
  const end = useRef(p.onEnd);
  end.current = p.onEnd;

  /** The tour is over (it finished, or Esc, or Stop): once. */
  const finish = () => {
    if (ended.current) return;
    ended.current = true;
    abort.current.abort();
    end.current();
  };
  useShield(finish);

  // the caption lines up with the water row above it
  useEffect(() => {
    const place = () => setBox(pillBox());
    place();
    window.addEventListener("resize", place);
    const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    const row = document.querySelector(".editor-view .water-bar");
    if (row) watch?.observe(row);
    return () => {
      window.removeEventListener("resize", place);
      watch?.disconnect();
    };
  }, [ed.ready]);

  useEffect(() => {
    const r = ed.renderer.current;
    if (!ed.ready || !r) return;
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
        key: (name, isDown) =>
          setDown((d) => {
            const next = new Set(d);
            if (isDown) next.add(name);
            else next.delete(name);
            return next;
          }),
        wheel: () => setWheelTick((n) => n + 1),
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
        // Craterize starts low on the copy (its settings come back with the player's own editor), so the scroll only goes up
        ed.setCraterUi((ed.craterUiRef.current = { ...ed.craterUiRef.current, power: Math.max(5, forces.craterPower - 25), size: null }));
        const glide = async (marks: ReturnType<typeof forceMarks>, tilt?: number) => {
          // (the camera frames what is worked on next, clear of the controls)
          const framed = framingView(r, marks, tilt);
          if (!framed) return;
          // (until the camera has landed: the gestures after it are worked out on the view it ends on)
          await hands.wait(r.glideTo(framed, 750), 3000);
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
      <TourPill says={says} down={down} wheelTick={wheelTick} box={box} onStop={finish} />
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
