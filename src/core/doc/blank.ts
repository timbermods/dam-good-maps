// A new blank map (MAPCRAFT step 2: a map built from an idea starts on empty ground, not on a generated seed): flat, dry
// ground at one level, a start at its middle, nothing else. It is made as a file the game's own way (the canonical
// settle of a map with no source: dry; its soil; the world and the file round it, places/place.ts
// `buildFileFromHeights`) and opened as any .timber is, so it has no spec and no generator's promises: every tool
// works on it as on an opened map, and its project replays from that stored base (D455).

import { entityId } from "../features/ids";
import { startingLocation } from "../format/entities";
import { writeTimber } from "../format/timber";
import { buildFileFromHeights } from "../places/place";
import { BLANK_NAME, blankProblem } from "./blankLimits";
export * from "./blankLimits";
import { importDocument, type MapDocument } from "./document";

/** The blank map's .timber: `size` × `size` tiles of flat, dry ground at `level`, the start at its middle. Throws its
 *  one-line reason when the size or the level is refused (`blankProblem`). */
export function blankTimber(size: number, level: number): { bytes: Uint8Array; fileName: string } {
  const why = blankProblem(size, level);
  if (why) throw new Error(why);
  const heights = new Uint8Array(size * size).fill(level);
  // (the start's coordinates are its corner tile; it covers three tiles a side)
  const corner = Math.floor(size / 2) - 1;
  const owner = "blank";
  const start = startingLocation({ id: entityId(owner, "StartingLocation", corner * size + corner), owner, x: corner, y: corner, z: level, orientation: "Cw0" });
  const built = buildFileFromHeights(size, size, heights, [start], "");
  return { bytes: writeTimber(built.file), fileName: `${BLANK_NAME}.timber` };
}

/** The document of a new blank map: the file above, read as any .timber is, with no file of the player's behind it. */
export function blankDocument(size: number, level: number): MapDocument {
  const { bytes, fileName } = blankTimber(size, level);
  const doc = importDocument(bytes, fileName);
  delete doc.meta.source;
  return doc;
}
