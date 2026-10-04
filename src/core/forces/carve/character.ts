// A carve's character (D199): its width and its depth as Power gives them, for the row's controls and
// the cursor's ring. The character itself (its swings, its pools, rapids and falls, the map's hard rock
// cores) is planned in Rust with the carve (run.ts).

import * as portable from "../../math/portable";

/** The width a river of this Power takes when Width follows Power. */
export const naturalWidth = (power: number) => 2.8 + power * 0.1;

/** How deep a carve of this Power (and Width) cuts where it starts, in levels below the land,
 *  when Depth follows Power (D226): its incision; its falls and rapids take it deeper downstream. */
export const naturalDepth = (power: number, width?: number | null) => Math.round(Math.min(12, 1 + 6 * (power / 100) * portable.sqrt(naturalWidth(power) / (width ?? naturalWidth(power)))));
