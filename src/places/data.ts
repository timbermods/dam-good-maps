// Where the Real places data lives on the site (public/real-places/, written by
// tools/real-places.ts), and how a page fetches it. The gallery loads the index and the card
// pictures. Each place's .timber is built at deploy time (tools/places-build.ts) and served as a
// static file: **Download** links to it, and **Refine** fetches it into the editor.

import type { PlaceIndex, PlaceIndexEntry } from "../core/places/place";

/** The folder of the gallery and its data, under the site's base. */
export const PLACES_URL = `${import.meta.env.BASE_URL}real-places/`;

/** A place id: a slug of its title. */
export const PLACE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function fetchIndex(): Promise<PlaceIndex> {
  const r = await fetch(`${PLACES_URL}index.json`);
  if (!r.ok) throw new Error(`the list of places did not load (${r.status})`);
  return (await r.json()) as PlaceIndex;
}

/** A place's .timber: where it is served, and the name it is saved under (the game shows the file
 *  name as the map's name). */
export function placeMap(p: Pick<PlaceIndexEntry, "file" | "name">): { url: string; fileName: string } {
  return { url: PLACES_URL + p.file, fileName: `${p.name}.timber` };
}

/** A place's .timber, by id: its entry in the index, and the file. */
export async function fetchPlaceMap(id: string): Promise<{ entry: PlaceIndexEntry; bytes: Uint8Array }> {
  if (!PLACE_ID.test(id)) throw new Error(`"${id}" is not a real place`);
  const entry = (await fetchIndex()).places.find((p) => p.id === id);
  if (!entry) throw new Error(`there is no real place called "${id}"`);
  const r = await fetch(placeMap(entry).url);
  if (!r.ok) throw new Error(`the map did not load (${r.status})`);
  return { entry, bytes: new Uint8Array(await r.arrayBuffer()) };
}

/** The place a link opens in the editor: `#place=<id>`. */
export function placeFromHash(hash: string): string | null {
  const m = /^#place=([^&]+)$/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}
