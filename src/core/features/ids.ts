// Stable ids (PLAN §19.4). Generated features: "f-" + base32(hash64(seed, kind, roleKey)), where
// roleKey names the feature's role in the plan and never its position in a list. Entities:
// guid(hash128(ownerFeatureId, template, localIndex)), so an entity keeps its Id (and, in game, its
// look) through edits elsewhere. localIndex is the entity's tile index (y·W + x): one entity per
// tile per feature, stable when neighbouring tiles change. A group of sources the build places
// (D314) is the exception: its anchor's id is its tile's, the rest derive from the anchor's id and
// their place along the row (water/sourceGroups.ts `groupIds`), so a source an edit's ground moves
// along the row keeps its id.

import { guidFrom, hash64Base32 } from "../math/hash";
import type { FeatureKind } from "./schema";

export function featureId(seed: number, kind: FeatureKind, roleKey: string): string {
  return "f-" + hash64Base32(seed, kind, roleKey);
}

export function entityId(ownerFeatureId: string, template: string, localIndex: number): string {
  return guidFrom(ownerFeatureId, template, localIndex);
}

/** Owner id for derived layers (slopes are rebuilt every time, never edited as features). */
export const DERIVED_SLOPES = "derived:slopes";

/** Owner id for the slopes a ramped Flatten stroke lays on its own rim (D270): kept in the stroke,
 *  placed again by every build. */
export const RIM_SLOPES = "derived:rim-slopes";

/** Slopes the build places again from the map's own rules and strokes (a delete is a `removeSlope`). */
export const rebuiltSlope = (owner: string) => owner === DERIVED_SLOPES || owner === RIM_SLOPES;
