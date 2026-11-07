// A batch whose model's attributes are shared with every other batch of the same model (the forest's, forest.ts; the
// landmarks', landmarks.ts): putting it away lets go of its own buffers only, the per-instance ones. Disposing the
// model's too deletes GPU buffers the other batches still draw from. three.js makes a new buffer for such an attribute
// at its next upload, but a batch whose vertex array was set up with the old one keeps it (three.js sets a vertex array
// up again only when its attribute objects change), and where the driver frees a deleted buffer at once (SwiftShader,
// CI's), that batch draws nothing. So the placement ghost a moment after the last one (its dispose waits for an idle
// moment) drew nothing in 7 of 10 runs: objectFade.spec, High, "the placement ghost stays drawn with the objects
// hidden" (10 of 10 with this). The models are cached for the page's life, so their buffers stay.

import type { InstancedBufferAttribute, InstancedMesh } from "three";

/** Let go of `mesh`'s own buffers (its instances' attributes and matrices), never its model's. */
export function disposeSharedBatch(mesh: InstancedMesh): void {
  const g = mesh.geometry;
  for (const [k, a] of Object.entries(g.attributes)) if (!(a as InstancedBufferAttribute).isInstancedBufferAttribute) g.deleteAttribute(k);
  g.setIndex(null);
  g.dispose();
  mesh.dispose();
}
