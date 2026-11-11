// The map's card when it was made from an idea (D508, PREMISES §7 step 9): the core's words (`info.premise.card`) as
// they are, the idea and the land it took, its landmark, the problem and what to do first. It sits with the notes over
// the bar until its × or the next map; the page adds only the two words that join them.

import type { PremiseCard } from "../../core/premise/card";

export function IdeaCard(p: { card: PremiseCard; onClose(): void }) {
  const c = p.card;
  return (
    <section class="idea-card" role="status" aria-label={`${c.name}, in ${c.style} land`}>
      <h3>
        <b>{c.name}</b> <span>in {c.style} land</span>
      </h3>
      <p class="idea-landmark">{c.landmark}</p>
      <p>{c.line}</p>
      {c.first ? (
        <p>
          <b>First:</b> {c.first}
        </p>
      ) : null}
      <button type="button" class="icon-close" aria-label="Dismiss" title="Close" onClick={p.onClose}>
        ×
      </button>
    </section>
  );
}
