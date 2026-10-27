// The Block tool's core API for the page (3D step 3, D335; docs/progress/3d-creating.md): the one
// operation, `blocks`, and the query that says what a click would do before it is made. Everything is
// plain data, nothing changes, and the same code the session refuses an operation with.

import type { BlockFalls, MapSession } from "./session";
import type { EditOp, OpParams } from "./ops";

export type { BlocksParams, BlockSide, BlockMode } from "../terrain/blocks";
export { BLOCK_SIDES, BLOCK_SIZE_MAX, BLOCK_SIZE_MIN, BLOCK_TOP_LAYER } from "../terrain/blocks";
export type { BlockFalls } from "./session";

/** What a block operation would do on the session's map as it stands: the blocks it adds and removes
 *  (the ghost), the blocks of ground the game's support rule would drop because of it (shown in
 *  red), and `reason`, the one line the click is refused with (a cell off the map or the layers, on an
 *  object, nothing to change, or "N blocks of ground would fall: nothing would hold them up"), null when
 *  it would be taken. Cheap: no build runs. */
export function blockFalls(session: MapSession, op: Extract<EditOp, { op: "blocks" }> | OpParams["blocks"]): BlockFalls {
  return session.blockFalls("params" in op ? op.params : op);
}
