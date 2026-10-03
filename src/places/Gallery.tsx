// The Real places gallery (ROADMAP "Real places", PLAN §20 D136): maps made from real land, as
// content to play or to refine. Each card shows our own top-down render, the place's name, its
// landform, size and scale, and how it plays. **Download** builds the place's .timber in a worker;
// **Refine** opens it in the editor (the generator page's `#place=` link, which imports it).
// Nothing here feeds the generator (D108).

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { wrap, type Remote } from "comlink";
import { CHANGES, ELEVATION_SOURCE, ELEVATION_SOURCE_URL, PROVIDER_NOTICES } from "../core/places/attribution";
import type { PlaceIndex, PlaceIndexEntry } from "../core/places/place";
import { saveFile, saveToTimberborn, type SaveToTimberbornResult } from "../platform";
import { fetchGalleryIndex, fetchPlace, PLACES_URL } from "./data";
import type { PlaceWorkerApi } from "./place.worker";

const HOME = import.meta.env.BASE_URL;

declare global {
  interface Window {
    /** Test hook (tests/e2e/places.spec.ts): build a place as Download does, without saving it. */
    dgmPlaces?: { build(id: string): Promise<{ sha256: string; bytes: number; fileName: string }> };
  }
}

let worker: Remote<PlaceWorkerApi> | null = null;
function placeWorker(): Remote<PlaceWorkerApi> {
  worker ??= wrap<PlaceWorkerApi>(new Worker(new URL("./place.worker.ts", import.meta.url), { type: "module" }));
  return worker;
}

async function buildPlace(id: string) {
  return placeWorker().build(await fetchPlace(id));
}

window.dgmPlaces = {
  async build(id: string) {
    const r = await buildPlace(id);
    return { sha256: r.sha256, bytes: r.bytes.length, fileName: r.fileName };
  },
};

/** A card's download: building, or failed. */
type Building = { busy: true } | { error: string };

/** A card's Save to Timberborn: building, failed, or where the map ended up. */
type Saving = { busy: true } | { error: string } | SaveToTimberbornResult;

/** Per-card async state, keyed by place id, with a ref so a stale closure can't clobber a newer update. */
function usePerCard<T>(): [Record<string, T>, (id: string, v: T | null) => void] {
  const [state, setState] = useState<Record<string, T>>({});
  const live = useRef(state);
  live.current = state;
  function set(id: string, v: T | null) {
    const next = { ...live.current };
    if (v) next[id] = v;
    else delete next[id];
    live.current = next;
    setState(next);
  }
  return [state, set];
}

/** The filters, kept in the page's query so Back returns to the same list. */
function initialFilters(): { family: string; size: number | null } {
  const q = new URLSearchParams(location.search);
  const size = Number(q.get("size"));
  return { family: q.get("family") ?? "", size: Number.isInteger(size) && size > 0 ? size : null };
}

export function Gallery() {
  const [index, setIndex] = useState<PlaceIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const init = useMemo(initialFilters, []);
  const [family, setFamily] = useState(init.family);
  const [size, setSize] = useState<number | null>(init.size);
  const [building, setBuilding] = usePerCard<Building>();
  const [saving, setSaving] = usePerCard<Saving>();

  useEffect(() => {
    fetchGalleryIndex().then(setIndex, (e) => setLoadError(String(e instanceof Error ? e.message : e)));
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (family) q.set("family", family);
    if (size) q.set("size", String(size));
    const s = q.toString();
    history.replaceState(null, "", s ? `?${s}` : location.pathname);
  }, [family, size]);

  const shown = useMemo(() => (index ? index.places.filter((p) => (!family || p.family === family) && (!size || p.size === size)) : []), [index, family, size]);

  async function download(p: PlaceIndexEntry) {
    if (building[p.id] && !("error" in building[p.id])) return;
    setBuilding(p.id, { busy: true });
    try {
      const r = await buildPlace(p.id);
      saveFile(r.bytes, r.fileName);
      setBuilding(p.id, null);
    } catch (e) {
      setBuilding(p.id, { error: `${p.name} could not be built: ${String(e instanceof Error ? e.message : e)}` });
    }
  }

  async function saveToPlace(p: PlaceIndexEntry) {
    if (saving[p.id] && "busy" in saving[p.id]) return;
    setSaving(p.id, { busy: true });
    try {
      const r = await buildPlace(p.id);
      setSaving(p.id, await saveToTimberborn(r.bytes, r.fileName));
    } catch (e) {
      setSaving(p.id, { error: `${p.name} could not be built: ${String(e instanceof Error ? e.message : e)}` });
    }
  }

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of index?.places ?? []) if (!size || p.size === size) m.set(p.family, (m.get(p.family) ?? 0) + 1);
    return m;
  }, [index, size]);

  return (
    <div class="app places">
      <header class="top">
        <div class="top-row">
          <h1>Real places</h1>
          <nav class="top-nav" aria-label="Pages">
            <a href={HOME}>Generator</a>
          </nav>
        </div>
        <p class="tag">
          Timberborn maps made from real land. <strong>Download</strong> one to play, or <strong>Refine</strong> it in the editor.
        </p>
        <p class="lead">
          Each map is inspired by the land near its namesake, at Timberborn's scale. It is not a replica. The heights come
          from public <a href="#credits">elevation data</a>.
        </p>
        <p class="lead">
          To play, move the file to <code>Documents\Timberborn\Maps</code> (on macOS <code>~/Documents/Timberborn/Maps</code>).
          Then start Timberborn → <strong>New game</strong> and pick the map.
        </p>
      </header>

      {loadError ? (
        <p class="error" role="alert">
          The maps did not load: {loadError}. Reload the page to try again.
        </p>
      ) : null}

      {index ? (
        <>
          <div class="filters" role="group" aria-label="Filter the maps">
            <label class="filter">
              Landform
              <select value={family} onChange={(e) => setFamily((e.target as HTMLSelectElement).value)}>
                <option value="">All landforms</option>
                {index.families.map((f) => (
                  <option key={f.id} value={f.id} disabled={!counts.get(f.id)}>
                    {f.name} ({counts.get(f.id) ?? 0})
                  </option>
                ))}
              </select>
            </label>
            <div class="segmented" role="group" aria-label="Size">
              <button type="button" aria-pressed={size === null} onClick={() => setSize(null)}>
                All sizes
              </button>
              {index.sizes.map((s) => (
                <button type="button" key={s} aria-pressed={size === s} onClick={() => setSize(s)}>
                  {s}×{s}
                </button>
              ))}
            </div>
            <p class="muted count" role="status">
              {shown.length === index.count ? `${index.count} maps` : `${shown.length} of ${index.count} maps`}
            </p>
          </div>

          {shown.length ? (
            <ul class="gallery" aria-label="Maps">
              {shown.map((p) => {
                const b = building[p.id];
                const busy = !!b && !("error" in b);
                const s = saving[p.id];
                const savingBusy = !!s && "busy" in s;
                return (
                  <li class="place" key={p.id}>
                    <img src={PLACES_URL + p.image} width={240} height={240} loading="lazy" decoding="async" alt={`${p.name} from above, north up`} />
                    <div class="place-body">
                      <h2>{p.name}</h2>
                      <p class="place-meta">
                        {p.familyName} · {p.size}×{p.size} · {p.metres} m per tile
                      </p>
                      <p class="place-plays">{p.plays}</p>
                      <div class="place-actions">
                        <button type="button" class="primary" aria-label={`Download ${p.name}`} disabled={busy} aria-busy={busy} onClick={() => void download(p)}>
                          {busy ? "Building…" : "Download"}
                        </button>
                        <button type="button" class="ghost" aria-label={`Save ${p.name} to Timberborn`} disabled={savingBusy} aria-busy={savingBusy} onClick={() => void saveToPlace(p)}>
                          {savingBusy ? "Building…" : "Save to Timberborn"}
                        </button>
                        <a class="button ghost" href={`${HOME}#place=${p.id}`} aria-label={`Refine ${p.name} in the editor`}>
                          Refine
                        </a>
                      </div>
                      {busy ? <progress aria-label={`Building ${p.name}`} /> : null}
                      {b && "error" in b ? (
                        <p class="error" role="alert">
                          {b.error}
                        </p>
                      ) : null}
                      {savingBusy ? <progress aria-label={`Saving ${p.name}`} /> : null}
                      {s && "error" in s ? (
                        <p class="error" role="alert">
                          {s.error}
                        </p>
                      ) : null}
                      {s && "via" in s ? (
                        <p class="muted" role="status">
                          {s.via === "fsa" ? (
                            <>
                              Saved to <strong>{s.folder}</strong>. It'll show up in Timberborn's custom maps.
                              {s.savedAs ? (
                                <>
                                  {" "}
                                  Saved as <strong>{s.savedAs}</strong>.
                                </>
                              ) : null}
                            </>
                          ) : (
                            <>
                              Downloaded. Move the file to <code>Documents\Timberborn\Maps</code>.
                            </>
                          )}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p class="empty">
              No map matches.{" "}
              <button
                type="button"
                class="linkish"
                onClick={() => {
                  setFamily("");
                  setSize(null);
                }}
              >
                Show all maps
              </button>
            </p>
          )}
        </>
      ) : loadError ? null : (
        <p class="placeholder">Loading the maps…</p>
      )}

      <section id="credits" class="credits" aria-labelledby="credits-title">
        <h2 id="credits-title">Elevation data</h2>
        <p>
          The maps are made from <a href={ELEVATION_SOURCE_URL}>{ELEVATION_SOURCE}</a>. {CHANGES} The data providers do not
          endorse these maps.
        </p>
        <ul>
          {PROVIDER_NOTICES.map((n) => (
            <li key={n}>{n}.</li>
          ))}
        </ul>
      </section>

      <footer class="foot">
        Dam Good Maps. Not affiliated with Mechanistry. <a href="https://github.com/timbermods/dam-good-maps" title="The source code, on GitHub">Source</a>
      </footer>
    </div>
  );
}
