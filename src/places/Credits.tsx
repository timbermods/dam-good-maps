// The real places' credits, in full (src/core/places/attribution.ts): on the gallery page and on the
// credits page (real-places/credits/), which each map's in-game description links to. The water data
// has its own section (ESA WorldCover, D271).

import { CHANGES, ELEVATION_SOURCE, ELEVATION_SOURCE_URL, NOT_ENDORSED, PROVIDERS, WATER_LICENCE, WATER_LICENCE_URL, WATER_NOTICE, WATER_SOURCE, WATER_SOURCE_URL, WATER_USE } from "../core/places/attribution";

export function Credits() {
  return (
    <>
      <section id="credits" class="credits" aria-labelledby="credits-title">
        <h2 id="credits-title">Elevation data</h2>
        <p>
          The maps are made from <a href={ELEVATION_SOURCE_URL}>{ELEVATION_SOURCE}</a>. {CHANGES} {NOT_ENDORSED}
        </p>
        <ul>
          {PROVIDERS.map((p) => (
            <li key={p.notice}>
              {p.notice}. <a href={p.licenceUrl}>{p.licence}</a>
            </li>
          ))}
        </ul>
      </section>
      <section id="water-credits" class="credits" aria-labelledby="water-credits-title">
        <h2 id="water-credits-title">Water data</h2>
        <p>
          The rivers and lakes are placed from <a href={WATER_SOURCE_URL}>{WATER_SOURCE}</a>. {WATER_USE} {WATER_NOTICE}. <a href={WATER_LICENCE_URL}>{WATER_LICENCE}</a>
        </p>
      </section>
    </>
  );
}
