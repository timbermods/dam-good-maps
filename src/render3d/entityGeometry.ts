// Static object model data reused between force frames (investigation/force-playback).
// Each batch still owns its geometry and GPU attributes: disposing one cannot retire another's
// buffers. Only immutable CPU arrays are shared, and per-instance grow/matrix/colour data stays local.
import { BufferAttribute, BufferGeometry } from "three";

export class EntityGeometryCache {
  private readonly models = new Map<string, BufferGeometry>();

  geometry(key: string, build: () => BufferGeometry): BufferGeometry {
    let model = this.models.get(key);
    if (!model) this.models.set(key, (model = build()));
    const g = new BufferGeometry();
    for (const [name, value] of Object.entries(model.attributes)) {
      const a = value as BufferAttribute;
      const fresh = new BufferAttribute(a.array, a.itemSize, a.normalized);
      fresh.setUsage(a.usage);
      fresh.gpuType = a.gpuType;
      g.setAttribute(name, fresh);
    }
    if (model.index) g.setIndex(new BufferAttribute(model.index.array, 1));
    g.boundingSphere = model.boundingSphere?.clone() ?? null;
    g.boundingBox = model.boundingBox?.clone() ?? null;
    return g;
  }

  /** This renderer is gone: release the model data as well. */
  dispose(): void {
    for (const g of this.models.values()) g.dispose();
    this.models.clear();
  }
}
