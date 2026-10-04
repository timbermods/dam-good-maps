// Real places (Kyler, 2026-10-04): their own panel, opened by Real places in the header, in the map generator's box
// (beside the Show column, the same size; one panel at a time). The gallery's places three across and three down,
// each its top-down picture, its name and its size; more scroll inside the panel. A click opens one in the editor,
// as the gallery's Refine did (`#place=<id>`).

import { useEffect, useState } from "preact/hooks";
import type { PlaceIndexEntry } from "../../core/places/place";
import { fetchGalleryIndex, PLACES_URL } from "../../places/data";

export function RealPlaces(p: { onOpen(id: string): void }) {
  const [places, setPlaces] = useState<PlaceIndexEntry[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchGalleryIndex().then(
      (index) => live && setPlaces(index.places),
      (e: unknown) => live && setProblem(`The real places did not load: ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      live = false;
    };
  }, []);
  return (
    <aside class="gen places-panel" aria-label="Real places panel">
      <section class="real-places" aria-label="Real places">
        {problem ? (
          <p class="error" role="alert">
            {problem}
          </p>
        ) : null}
        <ul>
          {(places ?? []).map((e) => {
            return (
              <li key={e.id}>
                <button type="button" class="ym-tile" title={`Open ${e.name}`} onClick={() => p.onOpen(e.id)}>
                  <img class="ym-pic" src={PLACES_URL + e.image} alt="" width={240} height={240} loading="lazy" decoding="async" draggable={false} />
                  {/* (the whole name, on two lines kept for it, then the size) */}
                  <span class="rp-name">{e.name}</span>
                  <span class="ym-size">
                    {e.size}×{e.size}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
