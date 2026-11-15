// A real place opened to edit (D136, D245, D331): its data file built into its .timber, then imported as any .timber
// is, under the place's own name and marked as the place, so its checks follow the place's rules. The page's worker
// (src/worker/session.ts `openPlace`) and the MCP server (mcp/src/places.ts) open a place through this one call.

import { MapSession } from "../doc/session";
import { decodePlaceFile, placeTimber } from "./place";

/** The editing session of a real place, from its data file (gzip JSON, or the JSON itself). */
export function placeSession(data: Uint8Array): MapSession {
  const place = decodePlaceFile(data);
  const r = placeTimber(place);
  // (opened under the place's own name; the file it is saved as is named after it, D345 B10)
  return MapSession.importMap(r.bytes, `${place.name}.timber`, place.id);
}
