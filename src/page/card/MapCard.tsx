// The map card in the side panel (docs/UI-BRIEF.md §3, PLAN §20 D330; replaces src/ui/MapCard.tsx
// when the workspace is put together). Four parts: the name, one "how it plays" line, the legend as
// one row of small icons with counts (hover names and highlights, click pins), and the numbers on
// one line. A real place's card carries its signature and credits instead of a seed. The highlight
// itself is drawn by the workspace: the card hands it over through `onHighlight`.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { highlighted, legendFocus, legendItems, legendTiles, leverMarks, originText, REACH_DETAIL, reachText, type CardInput, type LegendFocus, type LegendHighlight } from "./cardModel";
import { LegendIcon } from "./icons";
import "../page.css";

export interface MapCardProps {
  card: CardInput;
  /** The legend's highlight changed: draw it on the land (null: none). */
  onHighlight?(h: LegendHighlight | null): void;
}

export function MapCard({ card, onHighlight }: MapCardProps) {
  const items = useMemo(() => legendItems(card.entities), [card.entities]);
  const [focus, setFocus] = useState<LegendFocus>({ hover: null, pinned: null });
  const shown = highlighted(focus);
  // a new map drops the highlight
  useEffect(() => setFocus({ hover: null, pinned: null }), [card.entities]);
  // tell the workspace, once per change of what's highlighted or pinned
  const said = useRef<string>("");
  useEffect(() => {
    const key = shown ? `${shown}:${focus.pinned === shown}` : "";
    if (key === said.current) return;
    said.current = key;
    if (!shown) return onHighlight?.(null);
    const item = items.find((i) => i.key === shown);
    if (!item) return onHighlight?.(null);
    onHighlight?.({ key: shown, name: item.name, tiles: legendTiles(card.entities, shown, card.origin.W, card.origin.H), pinned: focus.pinned === shown });
  }, [shown, focus.pinned, items]);

  const o = card.origin;
  const hovered = shown ? items.find((i) => i.key === shown) : null;
  return (
    <article class="pg-card" aria-label="This map">
      <header class="pg-card-head">
        <h2 class="pg-card-name">{card.name}</h2>
        <span class="pg-muted">{originText(o)}</span>
      </header>
      {card.plays ? <p class="pg-card-plays">{card.plays}</p> : null}
      {o.kind === "place" && o.signature ? <p class="pg-card-signature">{o.signature}</p> : null}
      {items.length ? (
        <div class="pg-legend-wrap">
          <ul class="pg-legend" aria-label="On this map" onMouseLeave={() => setFocus((f) => legendFocus(f, { type: "leave" }))}>
            {items.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  class="pg-legend-item"
                  data-key={it.key}
                  aria-pressed={focus.pinned === it.key}
                  aria-label={`${it.name}: ${it.count}`}
                  title={it.name}
                  onMouseEnter={() => setFocus((f) => legendFocus(f, { type: "enter", key: it.key }))}
                  onFocus={() => setFocus((f) => legendFocus(f, { type: "enter", key: it.key }))}
                  onBlur={() => setFocus((f) => legendFocus(f, { type: "leave" }))}
                  onClick={() => setFocus((f) => legendFocus(f, { type: "click", key: it.key }))}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && focus.pinned) {
                      e.stopPropagation();
                      setFocus((f) => legendFocus(f, { type: "clear" }));
                    }
                  }}
                >
                  <LegendIcon kind={it.key} />
                  <span class="pg-count">{it.count.toLocaleString("en-US")}</span>
                </button>
              </li>
            ))}
          </ul>
          {/* hovering an icon names it */}
          <span class="pg-legend-name" aria-live="polite">
            {hovered ? hovered.name : ""}
          </span>
        </div>
      ) : null}
      {card.walkReach || card.levers ? (
        <p class="pg-numbers">
          {card.walkReach ? (
            <span class="pg-reach" title={REACH_DETAIL}>
              {reachText(card.walkReach)}
            </span>
          ) : null}
          {card.levers ? (
            <span class="pg-levers" role="list" aria-label="Difficulty levers">
              {leverMarks(card.levers).map((m) => (
                <span key={m.key} role="listitem" class={`pg-lever pg-lever-${m.grade}`} data-lever={m.key} data-grade={m.grade} title={m.detail} aria-label={m.detail} tabIndex={0}>
                  <LeverMark grade={m.grade} />
                </span>
              ))}
            </span>
          ) : null}
        </p>
      ) : null}
      {o.kind === "place" ? (
        <p class="pg-credits pg-muted">
          {o.credits.href ? (
            <a href={o.credits.href} target="_blank" rel="noopener">
              {o.credits.text}
            </a>
          ) : (
            o.credits.text
          )}
        </p>
      ) : null}
    </article>
  );
}

/** A lever's small mark: three bars, more of them filled the harder the lever makes the start. */
function LeverMark({ grade }: { grade: "easier" | "middling" | "harder" }) {
  const filled = grade === "easier" ? 1 : grade === "middling" ? 2 : 3;
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
      {[0, 1, 2].map((k) => (
        <rect key={k} x={k * 3.5} y={8 - k * 3} width="2.5" height={4 + k * 3} class={k < filled ? "pg-bar-on" : "pg-bar-off"} />
      ))}
    </svg>
  );
}
