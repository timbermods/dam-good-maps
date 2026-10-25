// Showcase mode in the map generator (D488 (2)): a search the player asks for, allowed minutes, for maps with an arc,
// offering the best three. Showcase… at the foot of the panel opens its sheet over the settings (the panel's lower
// part, as a settings section once opened: nothing under it moves, Settings or Esc closes it). The sheet holds
// the time allowed, Start search (Stop while it runs), a calm progress line, and three cards in fixed places: each
// map's picture, its name, how many of the arc's six beats it has, each beat met or not, what it shows in the core's
// words, and Open once the search has ended. Once a card's map can open, its picture becomes the map's hero picture
// (render3d/hero.ts, the saved file's picture at the card's size), the top-down thumbnail standing in until it is drawn. Opening a pick is the page's normal open path; nothing moves the camera
// (D265). The search runs in its own worker and goes on while the sheet or the panel is closed.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { emptyColumns, entityView, soilView, waterFromDepth, type MapView } from "../../render3d";
import { tip } from "../../ui/Tooltip";
import { ChoiceSetting } from "../settings";
import { beatSays, beatsMet, clock, SHOWCASE_CARDS, SHOWCASE_MINUTES, showcaseCards, showcaseWords, type ShowcaseModel } from "./showcaseModel";
import { BEAT_NAMES, BEATS, type ShowcasePickView, type ShowcaseView } from "../../worker/showcaseApi";

/** The clock (performance.now), once a second while a search runs: kept here, in what shows the time, so the page
 *  itself doesn't draw again each second. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  // (before the first paint of a search, so its first frame never shows the clock of before it began)
  useLayoutEffect(() => {
    if (!running) return;
    setNow(performance.now());
    const t = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
}

/** A card's hero picture, at twice its 200×112 place (16:9, the picture's own shape). */
const HERO_SIZE = { width: 400, height: 225 };

/** A pick as the renderer draws it (its land, settled water, objects and soil). */
function viewOfPick(p: ShowcasePickView): MapView {
  const r = p.response;
  return { W: r.W, H: r.H, heights: r.heights, columns: emptyColumns(), water: waterFromDepth(r.heights, r.water, r.contamination), entities: entityView(r.entities), soil: soilView(r.moisture, r.soilContamination) };
}

/** The cards' hero pictures, by variation: drawn one at a time (hero.ts queues them on one kept renderer) for the
 *  cards that can open, each object URL freed when its card goes or the sheet closes. A picture that can't be drawn
 *  (no GPU) or fails leaves the thumbnail, quietly. */
function useHeroes(picks: ShowcasePickView[]): Record<number, string> {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const live = useRef(new Map<number, string>());
  const asked = useRef(new Set<number>());
  const mounted = useRef(true);
  const key = picks.map((p) => p.variation).join(",");
  useEffect(() => {
    const want = new Set(picks.map((p) => p.variation));
    let gone = false;
    for (const [v, url] of live.current)
      if (!want.has(v)) {
        URL.revokeObjectURL(url);
        live.current.delete(v);
        gone = true;
      }
    for (const v of asked.current) if (!want.has(v)) asked.current.delete(v);
    if (gone) setUrls(Object.fromEntries(live.current));
    for (const p of picks) {
      if (asked.current.has(p.variation)) continue;
      asked.current.add(p.variation);
      // (render3d/hero.ts stays a chunk of its own, loaded the first time a picture is asked for, as saving loads it)
      import("../../render3d/hero")
        .then(({ heroPictureUrl }) => heroPictureUrl(viewOfPick(p), HERO_SIZE))
        .then(
          (url) => {
            if (!url) return;
            if (!mounted.current || !asked.current.has(p.variation) || live.current.has(p.variation)) return URL.revokeObjectURL(url);
            live.current.set(p.variation, url);
            setUrls(Object.fromEntries(live.current));
          },
          () => undefined,
        );
    }
  }, [key]);
  useEffect(
    () => () => {
      mounted.current = false;
      for (const url of live.current.values()) URL.revokeObjectURL(url);
      live.current.clear();
    },
    [],
  );
  return urls;
}

const isRunning = (m: ShowcaseModel) => m.state.status === "searching" || m.state.status === "stopping";

/** The sheet's picture: a framed view with a spark over it, drawn as the groups' pictures are (a 1.8 stroke). */
const SHOWCASE_ICON = (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.5 17.5l4.5-6.5 3 4 2-2.5 5.5 5z" />
    <path d="M14 2.5v5M11.5 5h5" />
  </svg>
);

/** The button at the panel's foot that opens the sheet; while a search runs it says the time left. */
export function ShowcaseButton({ m, refEl }: { m: ShowcaseModel; refEl?: { current: HTMLButtonElement | null } }) {
  const st = m.state;
  const now = useNow(isRunning(m));
  const left = st.budgetMs - (now - st.startedAt);
  const words = st.status === "searching" ? (left > 0 ? `Showcase · ${clock(left)}` : "Showcase · finishing") : st.status === "stopping" ? "Showcase · stopping" : "Showcase…";
  return (
    <button ref={refEl} type="button" class="ghost sheet-act showcase-open" {...tip("Search a few minutes for a map with a story")} onClick={() => m.onOpen(true)}>
      {words}
    </button>
  );
}

/** The most a card's line of words holds: two lines beside the picture. */
const SAY_MOST = 120;

function Card({ m, view, pick, at, hero }: { m: ShowcaseModel; view: ShowcaseView; pick: ShowcasePickView | null; at: number; hero?: string }) {
  const met = beatsMet(view);
  // (the strongest beat's words, or the next strongest where they would not fit the card's two lines)
  const says = beatSays(view, 6).find((t) => t.length <= SAY_MOST) ?? "";
  const src = hero ?? m.pictures[view.variation];
  const name = view.name ?? `Map ${view.variation + 1}`;
  const onShow = m.shownVariation === view.variation;
  const can = !!pick && !onShow;
  return (
    <li class={`sc-card${onShow ? " on-show" : ""}`} aria-label={`${at + 1}. ${name}`}>
      {src ? <img class={`sc-pic${hero ? " hero" : ""}`} src={src} alt="" /> : <span class="sc-pic" aria-hidden="true" />}
      <div class="sc-body">
        <div class="sc-top">
          <b class="sc-name">{name}</b>
          <span class="sc-score">
            {met} of {BEATS.length} beats
          </span>
          <button
            type="button"
            class="ghost sc-open"
            aria-disabled={!can}
            {...tip(onShow ? "This map is open" : pick ? "Open this map in the editor" : "Opens once the search ends")}
            onClick={() => can && m.onOpenPick(pick!)}
          >
            Open
          </button>
        </div>
        <ul class="sc-beats" aria-label="The arc's beats">
          {BEATS.map((id) => {
            const b = view.arc?.[id];
            return (
              <li key={id} class={b?.met ? "met" : undefined}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  {b?.met ? <path d="M2.5 6.2l2.4 2.4 4.6-5" /> : <circle cx="6" cy="6" r="3.2" />}
                </svg>
                <span>{BEAT_NAMES[id]}</span>
                <span class="visually-hidden">{b?.met ? ": has it" : ": not this map"}</span>
              </li>
            );
          })}
        </ul>
        <p class="sc-says">{says}</p>
      </div>
    </li>
  );
}

/** The sheet over the generator's settings. */
export function ShowcaseSheet({ m }: { m: ShowcaseModel }) {
  const st = m.state;
  const running = st.status === "searching" || st.status === "stopping";
  const action = useRef<HTMLButtonElement>(null);
  // (the sheet takes the focus where its action is, so the button that opened it, now under it, never keeps it)
  useEffect(() => {
    action.current?.focus({ preventScroll: true });
  }, []);
  const cards = showcaseCards(st);
  const heroes = useHeroes(cards.flatMap((c) => (c.pick ? [c.pick] : [])));
  const now = useNow(running);
  const share = st.status === "searching" && st.budgetMs > 0 ? Math.min(1, Math.max(0, now - st.startedAt) / st.budgetMs) : st.status === "stopping" || st.status === "done" ? 1 : 0;
  const what = st.status === "searching" ? "Stop" : st.status === "stopping" ? "Stopping…" : m.continues ? "Search more" : "Start search";
  const whatTip = st.status === "searching" ? "Stop after the map being made" : st.status === "stopping" ? "Finishing the map being made" : m.continues ? "Search more maps from these settings" : "Search maps from these settings";
  return (
    <section
      class="showcase"
      aria-labelledby="showcase-head"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        m.onOpen(false);
      }}
    >
      <div class="showcase-head">
        <h3 id="showcase-head">
          {SHOWCASE_ICON}
          Showcase
        </h3>
        <button type="button" class="ghost sheet-act" {...tip("Show the settings again", "Esc")} onClick={() => m.onOpen(false)}>
          Settings
        </button>
      </div>
      <p class="showcase-lede">Searches maps from these settings for the three with the best story.</p>
      <div class="showcase-run">
        <ChoiceSetting<number>
          line
          label="Search for"
          title="How long the search may take"
          value={m.minutes}
          options={SHOWCASE_MINUTES.map((n) => [n, `${n} min`, `Search for ${n} minutes`, running ? "not while a search runs" : false] as const)}
          onChange={m.onMinutes}
        />
        <button ref={action} type="button" class="ghost sheet-act" aria-disabled={st.status === "stopping"} {...tip(whatTip)} onClick={() => (st.status === "searching" ? m.onStop() : st.status !== "stopping" && m.onStart())}>
          {what}
        </button>
      </div>
      <p class="showcase-status" role="status">
        {showcaseWords(st, now)}
      </p>
      <div class={`showcase-bar${running ? " on" : ""}`} aria-hidden="true">
        <i style={{ transform: `scaleX(${share})` }} />
      </div>
      <ol class="sc-cards">
        {Array.from({ length: SHOWCASE_CARDS }, (_, k) =>
          cards[k] ? <Card key={cards[k].view.variation} m={m} view={cards[k].view} pick={cards[k].pick} at={k} hero={heroes[cards[k].view.variation]} /> : <li key={`empty-${k}`} class="sc-card empty" aria-hidden="true"><span class="sc-pic" /></li>,
        )}
      </ol>
    </section>
  );
}
