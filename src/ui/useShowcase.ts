// Showcase mode's search, as the page holds it (D488 (2)): its own worker (platform/index.ts `createShowcase`), made
// on the first search and kept; the state the generator's Showcase sheet shows (editor/generator/showcaseModel.ts);
// each card's picture; the clock while it runs; and the note that says it is done when the sheet isn't in view. It
// never touches the open map: a pick opens through the page's own open path (App.tsx `openVersion`).

import { useEffect, useRef, useState } from "preact/hooks";
import { createShowcase } from "../platform";
import type { MapSpec } from "../core/spec/mapspec";
import { thumbnailPixels } from "../core/render/thumb";
import type { ShowcaseMessage, ShowcasePickView, ShowcasePreview } from "../worker/showcaseApi";
import { SHOWCASE_DEFAULT_MINUTES, SHOWCASE_IDLE, SHOWCASE_MINUTES, searchKey, showcaseStart, showcaseStep, type ShowcaseModel, type ShowcaseState } from "../editor/generator/showcaseModel";

const MINUTES_KEY = "dgm.showcaseMinutes";

function savedMinutes(): number {
  try {
    const m = Number(localStorage.getItem(MINUTES_KEY));
    return (SHOWCASE_MINUTES as readonly number[]).includes(m) ? m : SHOWCASE_DEFAULT_MINUTES;
  } catch {
    return SHOWCASE_DEFAULT_MINUTES;
  }
}

/** A card's picture: the thumbnail Your maps draws (the minimap's look), as a PNG. */
function pictureOf(p: { heights: Uint8Array; water: ArrayLike<number>; W: number; H: number }): string | null {
  try {
    const t = thumbnailPixels(p.heights, p.W, p.H, p.water, 192);
    const c = document.createElement("canvas");
    c.width = t.w;
    c.height = t.h;
    c.getContext("2d")!.putImageData(new ImageData(t.rgba, t.w, t.h), 0, 0);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

export interface ShowcaseHost {
  /** The spec of the settings now (the seed in the box, the settings, the sibling shown). */
  spec: MapSpec;
  /** The spec a search starts from: `spec`, or with a seed rolled when the open map is a file and has none. */
  takeSpec(): MapSpec;
  /** The sheet is in view (the generator's panel open, the sheet over its settings). */
  panelOpen: boolean;
  /** Open the generator's panel (the note's Show them). */
  showPanel(): void;
  /** Open a pick through the page's open path. */
  openPick(p: ShowcasePickView): void;
  /** The open map's spec, when it is a generated map. */
  shownSpec: MapSpec | null;
}

export function useShowcase(host: ShowcaseHost): { model: ShowcaseModel; notice: { text: string; show(): void; dismiss(): void } | null } {
  const [state, setState] = useState<ShowcaseState>(SHOWCASE_IDLE);
  const [minutes, setMinutes] = useState(savedMinutes);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const [pictures, setPictures] = useState<Record<number, string>>({});
  /** A search ended while its sheet was out of view: the note says so until it is seen. */
  const [unseen, setUnseen] = useState(false);
  const worker = useRef<ReturnType<typeof createShowcase> | null>(null);
  const inView = host.panelOpen && open;
  const inViewRef = useRef(inView);
  inViewRef.current = inView;

  const picture = (variation: number, p: ShowcasePreview | { heights: Uint8Array; water: Float32Array | Uint8Array; W: number; H: number }) => {
    setPictures((all) => {
      if (all[variation]) return all;
      const url = pictureOf(p);
      return url ? { ...all, [variation]: url } : all;
    });
  };

  const hear = (m: ShowcaseMessage) => {
    if (m.kind === "candidate" && m.preview) picture(m.candidate.variation, m.preview);
    if (m.kind === "done") {
      for (const p of m.best) picture(p.variation, { heights: p.response.heights, water: p.response.water, W: p.response.W, H: p.response.H });
      if (!inViewRef.current) setUnseen(true);
    }
    if (m.kind === "error" && !inViewRef.current) setUnseen(true);
    setState((st) => showcaseStep(st, m));
  };

  // the clock, once a second while the search runs (its time left)
  const running = state.status === "searching" || state.status === "stopping";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (inView) setUnseen(false);
  }, [inView]);

  useEffect(() => () => worker.current?.terminate(), []);

  const start = () => {
    if (running) return;
    const t = performance.now();
    const { state: next, from } = showcaseStart(state, host.takeSpec(), minutes * 60_000, t);
    if (next.kept.length === 0) setPictures({});
    setNow(t);
    setState(next);
    setUnseen(false);
    worker.current ??= createShowcase(hear);
    worker.current.start(from, next.budgetMs);
  };

  const stop = () => {
    if (state.status !== "searching") return;
    worker.current?.stop();
    setState((st) => (st.status === "searching" ? { ...st, status: "stopping" } : st));
  };

  const shown = host.shownSpec;
  const shownVariation = shown && state.base && searchKey(shown) === searchKey(state.base) ? (shown.variation ?? 0) : null;
  const done = state.status === "done" || state.status === "error";
  const model: ShowcaseModel = {
    state,
    now,
    minutes,
    onMinutes: (m) => {
      setMinutes(m);
      try {
        localStorage.setItem(MINUTES_KEY, String(m));
      } catch {
        // (the choice lasts the visit)
      }
    },
    open,
    onOpen: setOpen,
    onStart: start,
    onStop: stop,
    continues: done && !!state.base && state.tried > 0 && searchKey(state.base) === searchKey(host.spec),
    pictures,
    onOpenPick: host.openPick,
    shownVariation,
  };
  const n = state.picks?.length ?? 0;
  const notice =
    unseen && !inView
      ? {
          text: state.status === "error" ? `The showcase search stopped: ${state.error}` : n ? `The showcase search is done: ${n === 1 ? "one map" : n === 2 ? "two maps" : "three maps"} to look at.` : "The showcase search is done: no map passed every check.",
          show: () => {
            setOpen(true);
            host.showPanel();
            setUnseen(false);
          },
          dismiss: () => setUnseen(false),
        }
      : null;
  return { model, notice };
}
