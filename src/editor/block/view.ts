// What the Block tool shows on the map: the preview of a click or a drag, from `blockFalls`. The drawing is the
// renderer's (`renderer.showBlocks`, render3d/blockGhost.ts): cells to add translucent, blocks to take red, blocks
// that would fall solid red, the added and removed muted grey while any fall. This is the only place the page names it.

import type { MapRenderer } from "../../render3d";
import type { BlockFalls } from "../../core/doc/blockTool";

/** What the renderer draws: `blockFalls`'s three lists. */
export type BlockShow = Pick<BlockFalls, "added" | "removed" | "falls">;

/** Draw the preview (null clears it). */
export function showBlocks(r: MapRenderer | null | undefined, show: BlockShow | null): void {
  r?.showBlocks(show);
}
