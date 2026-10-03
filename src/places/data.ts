// Where the Real places data lives on the site (public/real-places/, written by
// tools/real-places.ts), and how a page fetches it. The gallery loads the index and the card
// pictures; a place's own data loads only when it is downloaded or opened in the editor.

import { galleryIndex, type PlaceIndex } from "../core/places/place";

/** The folder of the gallery and its data, under the site's base. */
export const PLACES_URL = `${import.meta.env.BASE_URL}real-places/`;

/** A place id: a slug of its name. */
export const PLACE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function fetchIndex(): Promise<PlaceIndex> {
  const r = await fetch(`${PLACES_URL}index.json`);
  if (!r.ok) throw new Error(`the list of places did not load (${r.status})`);
  return (await r.json()) as PlaceIndex;
}

/** The index as the gallery lists it: the places whose start reaches no fed water are left out
 *  (D421) until Real places 2 fixes them. */
export async function fetchGalleryIndex(): Promise<PlaceIndex> {
  return galleryIndex(await fetchIndex());
}

/** A place's data file (gzip JSON), by id. */
export async function fetchPlace(id: string): Promise<Uint8Array> {
  if (!PLACE_ID.test(id)) throw new Error(`"${id}" is not a real place`);
  const r = await fetch(`${PLACES_URL}data/${id}.json.gz`);
  if (!r.ok) throw new Error(r.status === 404 ? `there is no real place called "${id}"` : `the map's data did not load (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

/** The place a link opens in the editor: `#place=<id>`. */
export function placeFromHash(hash: string): string | null {
  const m = /^#place=([^&]+)$/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}
