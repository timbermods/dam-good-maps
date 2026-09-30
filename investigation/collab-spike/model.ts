import { MapSession } from '../../src/core/doc/session';
import type { EditOp } from '../../src/core/doc/ops';
import { makeSpec, GENERATOR_VERSION } from '../../src/core/spec/mapspec';
import { generate } from '../../src/core/gen/generate';
import { entityJson } from '../../src/core/format/entities';
import { JsonFloat } from '../../src/core/format/json';
import { CarveRun, DEFAULTS } from '../../src/core/forces/carve/run';
import { forceMapOf, carveParams } from '../../src/core/forces/carve/result';

export const SETTINGS = { seed: 349, size: { x: 48, y: 48 }, theme: 'riverValley' as const, designedFor: 'normal' as const };
export const VERSION = GENERATOR_VERSION;
export function makeSession() {
  return MapSession.fromGenerated(generate(makeSpec(SETTINGS), { maxAttempts: 1 }));
}
function sorted(value: any): any {
  if (value instanceof JsonFloat) return value.value;
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
  return value;
}
export async function mapHash(session: MapSession): Promise<string> {
  const b = session.built;
  // Full exact numeric arrays; no rounding, sampling or "terrain only" checksum.
  // Include complete entity components and all terrain columns; also hash soil fields.
  const data = JSON.stringify({
    size: [b.W, b.H], terrain: [...b.heights],
    columns: [...session.columns].sort((a, b) => a[0] - b[0]).map(([i, c]) => [i, [...c]]),
    water: [...b.water], contamination: [...b.contamination],
    moisture: [...b.moisture], soilContamination: [...b.soilContamination],
    objects: b.entities.slice().sort((a, b) => a.id.localeCompare(b.id)).map(e => sorted(entityJson(e))),
  });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function brush(x: number, y: number, tool: 'raise' | 'lower' | 'smooth' = 'raise'): EditOp {
  return { op: 'brush', params: { tool, size: 2, strength: 5,
    dabs: [4*x+2,4*y+2,4*x+3,4*y+2,4*x+4,4*y+3,4*x+6,4*y+4] } };
}
export function placement(x: number, y: number, template = 'Pine'): EditOp {
  return { op: 'placeEntity', params: { id: crypto.randomUUID(), template, x, y, orientation: 'Cw0' } };
}
export function force(session: MapSession, x: number, y: number, seed: number): EditOp {
  const before = forceMapOf(session.built);
  const settings = { ...DEFAULTS, mode: 'aim' as const, power: 25, width: 3, seed, dry: true };
  const end: [number, number] = [Math.min(47, x + 10), Math.max(0, y - 8)];
  const run = new CarveRun(before, settings, { origin: y*48+x, end: end[1]*48+end[0] }, { sourceId: crypto.randomUUID() });
  for (let i = 0; i < 32 && !run.done; i++) run.step();
  const params = carveParams(before, run, { settings, origin: [x,y], end, cut: null });
  if (!params) throw Error('Carve changed no ground here. Try another tile.');
  return { op: 'carve', params };
}
export function random(seed: number) {
  let n = seed >>> 0;
  return () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296; };
}
export function mixed(session: MapSession, rng: () => number, index: number): EditOp {
  if (index % 20 === 0) {
    // Resolve the real force once on its author's map. Replay assigns its recorded result.
    for (let i=0;i<30;i++) {
      try { return force(session, 5+Math.floor(rng()*32), 5+Math.floor(rng()*32), Math.floor(rng()*1e6)); }
      catch { /* Try a different origin when the short run had no effect. */ }
    }
  }
  if (index % 3 === 0) {
    const templates = ['Pine', 'BlueberryBush', 'WaterSource'];
    for (let i=0;i<200;i++) {
      const op = placement(Math.floor(rng()*48), Math.floor(rng()*48), templates[index % templates.length === 0 ? Math.floor(rng()*templates.length) : 0]);
      if (!session.check(op).length) return op;
    }
  }
  return brush(2+Math.floor(rng()*42), 2+Math.floor(rng()*42), ['raise','lower','smooth'][Math.floor(rng()*3)] as any);
}
