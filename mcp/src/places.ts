// Real places for the MCP server (D136, D141, D501): the gallery's own list and data, the files the page fetches from
// the site (public/real-places/, written by tools/real-places.ts). From the source they are read where the repository
// keeps them; the bundle carries a copy beside its server (tools/mcp-build.ts). A place opens through the core's one
// call, as the page's worker opens it (core/places/open.ts).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { galleryIndex, type PlaceIndex, type PlaceIndexEntry } from "../../src/core/places/place";
import { placeSession } from "../../src/core/places/open";
import type { MapSession } from "../../src/core/doc/session";

/** The folder that holds index.json and data/: beside the bundled server, or the repository's public/real-places/. */
function placesFolder(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const bundled = join(here, "real-places");
  return existsSync(join(bundled, "index.json")) ? bundled : join(here, "..", "..", "public", "real-places");
}

let index: PlaceIndex | null = null;

/** The places as the page's gallery lists them (`galleryIndex`). */
export function placesIndex(): PlaceIndex {
  index ??= galleryIndex(JSON.parse(readFileSync(join(placesFolder(), "index.json"), "utf8")) as PlaceIndex);
  return index;
}

/** The place a name gives: its id ("near-glencoe") or its name ("Near Glencoe"), in any case; null when none. */
export function placeOf(name: string): PlaceIndexEntry | null {
  const key = name.trim().toLowerCase();
  return placesIndex().places.find((p) => p.id === key || p.name.toLowerCase() === key) ?? null;
}

/** The editing session of a place, opened as the page opens it. */
export function openPlaceSession(p: PlaceIndexEntry): MapSession {
  return placeSession(new Uint8Array(readFileSync(join(placesFolder(), p.data))));
}
