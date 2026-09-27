import { JsonFloat, type JsonObject } from '../../src/core/format/json';
import { placementOf } from '../../src/core/format/entities';
import { YOUNG, type EntityView } from '../../src/render3d/model';
export function progressOf(components: JsonObject): number {
  const grow = components.Growable as JsonObject | undefined;
  const raw = grow?.GrowthProgress;
  const n = raw instanceof JsonFloat ? raw.value : typeof raw === 'number' ? raw : 1;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}
export function growthOf(view: EntityView, entities: JsonObject[]): Float32Array {
  const stored = new Map<string, number>();
  for (const e of entities) {
    const p = placementOf(e); if (p) stored.set(`${p.template}:${p.x}:${p.y}:${p.z}`, progressOf(e.Components as JsonObject));
  }
  return Float32Array.from({ length: view.count }, (_, i) => stored.get(`${view.templates[view.template[i]]}:${view.x[i]}:${view.y[i]}:${view.z[i]}`) ?? (view.flags[i] & YOUNG ? 0.35 : 1));
}
/** Existing saved dying progress, matched by identity/position like growth. */
export function dyingOf(view:EntityView,entities:JsonObject[]):Float32Array{
 const values=new Map<string,number>();
 for(const e of entities){const p=placementOf(e);if(!p)continue;const raw=((e.Components as JsonObject)?.WateredNaturalResource as JsonObject|undefined)?.DyingProgress;
  const value=raw instanceof JsonFloat?raw.value:typeof raw==='number'?raw:0;
  values.set(`${p.template}:${p.x}:${p.y}:${p.z}`,Math.max(0,Math.min(1,value)));
 }
 return Float32Array.from({length:view.count},(_,i)=>values.get(`${view.templates[view.template[i]]}:${view.x[i]}:${view.y[i]}:${view.z[i]}`)??0);
}
