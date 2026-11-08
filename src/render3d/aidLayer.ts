// The editing aids' own layer (D497: editing aids get their own channel, never a changed look). Every view's camera
// draws it; the game's bloom leaves it out of its source (bloom.ts), so an aid never glows. high/shadows.ts
// `CASTER_LAYER` is 1.

import type { Object3D } from "three";

export const AID_LAYER = 2;

/** Put an editing aid (and all it holds) on the aids' layer. */
export function onAidLayer<T extends Object3D>(o: T): T {
  o.traverse((c) => c.layers.set(AID_LAYER));
  return o;
}
