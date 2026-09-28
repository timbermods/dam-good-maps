// Test maps the runner makes itself, from our own generated maps:
// - high terrain (Kyler, 2026-09-25: an optional high-verticality mode): terrain above the editor's 16,
//   up to 21 (the file allows 22 layers of solid ground with the top one empty, FORMAT.md Â§4.3);
// - E4: a map with no StartingLocation.
// Water is re-settled with the project's own export (MapSession: the canonical settle), so a map's stored
// water is what our water model says it holds at rest on the new terrain.
import { MapSession } from '../../../src/core/doc/session';
import { entityJson, tree, bush, waterSource } from '../../../src/core/format/entities';
import { isObject, type JsonObject } from '../../../src/core/format/json';
import { readTimber, writeTimber, type TimberFile } from '../../../src/core/format/timber';
import { surfaceOf } from '../../../src/core/format/world';
import { generate } from '../../../src/core/gen/generate';
import { decodeSpecFragment, makeSpec, type ThemeId } from '../../../src/core/spec/mapspec';
import type { GenerateResult } from '../../../src/core/gen/generate';
import { guidFrom } from '../../../src/core/math/hash';

export function generated(theme: ThemeId, seed: number, size: number): Uint8Array {
  const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
  if (!r.report.passed) throw new Error(`${theme} ${seed} ${size}Â² did not pass its checks`);
  return r.bytes;
}

/** A generated map from a share link's fragment (M9a's games: Any, a difficulty, Verticality, No
 *  badwater), exactly as the page makes it. */
export function generatedFrom(fragment: string): Uint8Array {
  const d = decodeSpecFragment(fragment);
  if (!d || d.problems.length) throw new Error(`${fragment}: ${d ? d.problems.join('; ') : 'not a map link'}`);
  const r = generate(d.spec);
  if (!r.report.passed) throw new Error(`${fragment} did not pass its checks`);
  return r.bytes;
}

/** The first seed from 1 to 40 whose generated map has what `has` looks for (a weir, ruins on a
 *  rise), as the page makes it. */
export function firstGenerated(fragment: (seed: number) => string, has: (r: GenerateResult) => boolean): Uint8Array {
  for (let seed = 1; seed <= 40; seed++) {
    const d = decodeSpecFragment(fragment(seed));
    if (!d) break;
    const r = generate(d.spec);
    if (r.report.passed && has(r)) return r.bytes;
  }
  throw new Error(`no seed from 1 to 40 of ${fragment(0)} has it`);
}

function withDescription(f: TimberFile, text: string): void {
  if (f.metadata) f.metadata = { ...f.metadata, MapDescription: text };
}

/** Every column raised by `by` levels: terrain, the objects on it and the water's floors. */
export function raised(bytes: Uint8Array, by: number, description: string): Uint8Array {
  const f = readTimber(bytes);
  const w = f.world;
  const plane = w.sizeX * w.sizeY;
  const v = new Uint8Array(w.voxels.length);
  for (let z = w.layers - 1; z >= 0; z--)
    for (let i = 0; i < plane; i++) v[z * plane + i] = z < by ? 1 : w.voxels[(z - by) * plane + i];
  for (let i = 0; i < plane; i++)
    if (v[(w.layers - 1) * plane + i]) throw new Error('raising would fill the top layer');
  w.voxels = v;
  for (const e of w.entities) {
    const bo = isObject(e.Components) && isObject((e.Components as JsonObject).BlockObject) ? ((e.Components as JsonObject).BlockObject as JsonObject) : null;
    if (bo && isObject(bo.Coordinates)) (bo.Coordinates as JsonObject).Z = Number((bo.Coordinates as JsonObject).Z) + by;
  }
  const wm = w.singletons.WaterMapNew;
  if (isObject(wm) && isObject(wm.WaterColumns)) {
    const cols = wm.WaterColumns as JsonObject;
    cols.Array = String(cols.Array)
      .split(' ')
      .map((t) => {
        if (t === '0') return t;
        const p = t.split(':');
        if (p.length >= 4) p[3] = String(Number(p[3]) + by);
        return p.join(':');
      })
      .join(' ');
  }
  withDescription(f, description);
  return resettle(writeTimber(f), 'raised.timber');
}

/**
 * A stepped mesa rising to `top` (â‰¤ 21) on dry ground: rings one level apart, a flat top of radius 5,
 * a spring in a 3Ã—3 pit at its centre (floor top âˆ’ 1), and trees and a blueberry bush on the top.
 * Objects on tiles the mesa raises are removed; the new ones get fixed ids.
 */
export function mesa(bytes: Uint8Array, cx: number, cy: number, top: number, description: string): Uint8Array {
  const f = readTimber(bytes);
  const w = f.world;
  const W = w.sizeX, H = w.sizeY, plane = W * H;
  const h = surfaceOf(w);
  const target = new Uint8Array(plane);
  const flat = 5;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      const level = d <= flat ? top : top - (d - flat);
      target[y * W + x] = Math.max(h[y * W + x], Math.min(top, level));
    }
  // the pit: 3Ã—3 one level down at the centre
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) target[(cy + dy) * W + cx + dx] = top - 1;
  const changed = new Set<number>();
  for (let i = 0; i < plane; i++) if (target[i] !== h[i]) changed.add(i);
  for (let i = 0; i < plane; i++)
    for (let z = 0; z < w.layers; z++) w.voxels[z * plane + i] = z < target[i] ? 1 : 0;
  // objects on raised tiles are removed (their footprint's anchor tile decides)
  w.entities = w.entities.filter((e) => {
    const bo = isObject(e.Components) && isObject((e.Components as JsonObject).BlockObject) ? ((e.Components as JsonObject).BlockObject as JsonObject) : null;
    const c = bo && isObject(bo.Coordinates) ? (bo.Coordinates as JsonObject) : null;
    if (!c) return true;
    const t = Number(c.Y) * W + Number(c.X);
    if (e.Template === 'StartingLocation' && changed.has(t)) throw new Error('the mesa covers the start');
    return !changed.has(t);
  });
  const id = (k: string) => guidFrom('dgm-probe', 'mesa', k);
  const owner = 'probe';
  const add = (json: JsonObject) => w.entities.push(json);
  add(entityJson(waterSource({ id: id('spring'), owner, x: cx, y: cy, z: top - 1, strength: 0.5 })));
  const trees: [number, number, 'Pine' | 'Birch' | 'Oak'][] = [[cx - 4, cy - 4, 'Pine'], [cx + 4, cy - 4, 'Birch'], [cx - 4, cy + 4, 'Oak'], [cx + 4, cy + 4, 'Pine'], [cx, cy + 4, 'Birch'], [cx - 4, cy, 'Pine']];
  for (const [x, y, species] of trees) add(entityJson(tree({ id: id(`tree ${x} ${y}`), owner, x, y, z: top, species })));
  add(entityJson(bush({ id: id('bush'), owner, x: cx + 3, y: cy, z: top, ripe: true })));
  withDescription(f, description);
  return resettle(writeTimber(f), 'mesa.timber');
}

/** The map with its water settled by the project's own export (the canonical settle). */
export function resettle(bytes: Uint8Array, name: string): Uint8Array {
  const s = MapSession.importMap(bytes, name);
  return s.exportTimber().bytes;
}

/** E4: the same map with its StartingLocation removed. */
export function withoutStart(bytes: Uint8Array): Uint8Array {
  const f = readTimber(bytes);
  f.world.entities = f.world.entities.filter((e) => e.Template !== 'StartingLocation');
  withDescription(f, 'DGM Probe E4: this map has no StartingLocation.');
  return writeTimber(f);
}
