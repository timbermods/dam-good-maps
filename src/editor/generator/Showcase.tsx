// Showcase mode in the map generator (D488 (2)): a search the player asks for, allowed minutes, for maps with an arc,
// offering the best three. Showcase… at the foot of the panel opens its sheet over the settings (the panel's lower
// part, as a settings section once opened: nothing under it moves, Settings or Esc closes it). The sheet holds
// the time allowed, Start search (Stop while it runs), a calm progress line, and three cards in fixed places: each
// map's picture, its name, how many of the arc's six beats it has, each beat met or not, what it shows in the core's
// words, and Open once the search has ended. Opening a pick is the page's normal open path; nothing moves the camera
// (D265). The search runs in its own worker and goes on while the sheet or the panel is closed.

import { useEffect, useRef, useState } from "preact/hooks";
import { tip } from "../../ui/Tooltip";
import { ChoiceSetting } from "../settings";
import { beatSays, beatsMet, clock, SHOWCASE_CARDS, SHOWCASE_MINUTES, showcaseCards, showcaseWords, type ShowcaseModel } from "./showcaseModel";
import { BEAT_NAMES, BEATS, type ShowcasePickView, type ShowcaseView } from "../../worker/showcaseApi";

/** The clock (performance.now), once a second while a search runs: kept here, in what shows the time, so the page
 *  itself doesn't draw again each second. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    setNow(performance.now());
    const t = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
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

function Card({ m, view, pick, at }: { m: ShowcaseModel; view: ShowcaseView; pick: ShowcasePickView | null; at: number }) {
  const met = beatsMet(view);
  // (the two strongest lines, or the strongest alone where two would not fit the card's three lines)
  const two = beatSays(view);
  const says = two.join(" ").length > 200 ? two.slice(0, 1) : two;
  const src = m.pictures[view.variation];
  const name = view.name ?? `Map ${view.variation + 1}`;
  const onShow = m.shownVariation === view.variation;
  const can = !!pick && !onShow;
  return (
    <li class={`sc-card${onShow ? " on-show" : ""}`} aria-label={`${at + 1}. ${name}`}>
      {src ? <img class="sc-pic" src={src} alt="" /> : <span class="sc-pic" aria-hidden="true" />}
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
        <p class="sc-says">{says.join(" ")}</p>
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
  const now = useNow(running);
  const share = st.status === "searching" && st.budgetMs > 0 ? Math.min(1, (now - st.startedAt) / st.budgetMs) : st.status === "stopping" || st.status === "done" ? 1 : 0;
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
          cards[k] ? <Card key={cards[k].view.variation} m={m} view={cards[k].view} pick={cards[k].pick} at={k} /> : <li key={`empty-${k}`} class="sc-card empty" aria-hidden="true"><span class="sc-pic" /></li>,
        )}
      </ol>
    </section>
  );
}
