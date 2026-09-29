// The candidates strip in the side panel (docs/UI-BRIEF.md §5, PLAN §20 D329, D330): generated maps
// only, otherwise empty. The background version with its short notification, and More's siblings as
// they finish; More is the strip's last tile. A click opens a candidate (the page replaces the map
// by §6's rule); the shown map never swaps by itself.

import { useMemo } from "preact/hooks";
import { QuietNote } from "../QuietNote";
import { thumbnailDataUrl } from "../thumbnail";
import { stripShown, type StripItem, type StripState } from "../../core/library/strip";
import "../page.css";

export interface CandidatesStripProps {
  state: StripState;
  /** Open a candidate (the page shows it, then sends the strip `{ type: "open", id }`). */
  onOpen(item: StripItem): void;
  /** Make another sibling in the background (the page sends `{ type: "more" }` and starts it). */
  onMore(): void;
  /** The notification has been shown (the page sends `{ type: "noticeSeen" }`). */
  onNoticeSeen(): void;
}

function Thumb({ item }: { item: StripItem }) {
  const m = item.map;
  const url = useMemo(() => thumbnailDataUrl(m.heights, m.W, m.H, m.water), [item.id]);
  return url ? <img src={url} alt="" width={56} height={56} /> : <span class="pg-thumb-blank" aria-hidden="true" />;
}

export function CandidatesStrip(p: CandidatesStripProps) {
  const s = p.state;
  if (!stripShown(s)) return null;
  return (
    <section class="pg-strip" aria-label="Other versions">
      {s.notice ? <QuietNote text={s.notice} onDone={p.onNoticeSeen} /> : null}
      <ul class="pg-strip-row">
        {s.items.map((it) => (
          <li key={it.id}>
            <button type="button" class="pg-candidate" data-kind={it.kind} aria-current={s.current === it.id ? "true" : undefined} title={`${it.map.name}: ${it.map.premise}`} onClick={() => p.onOpen(it)}>
              <Thumb item={it} />
              <span class="pg-sr">
                Open {it.map.name}. {it.map.premise}
              </span>
            </button>
          </li>
        ))}
        {Array.from({ length: s.pending }, (_, k) => (
          <li key={`pending-${k}`}>
            <span class="pg-candidate pg-candidate-pending" role="img" aria-label="A version on its way" />
          </li>
        ))}
        <li>
          <button type="button" class="ghost pg-more" title="Make another version while you keep editing" onClick={p.onMore}>
            More
          </button>
        </li>
      </ul>
    </section>
  );
}
