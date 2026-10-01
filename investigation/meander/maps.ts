import { gunzipSync, strFromU8 } from 'fflate';
import { fullMap, type FullForceMap } from '../../src/core/forces/force';
import { river, type Intent } from './meander';
export const CASES = [
  { id: 'young', title: 'Young River Valley', map: 'young', power: 65, size: 64, intent: {} as Intent },
  { id: 'narrow', title: 'Between the bluffs', map: 'narrow', power: 75, size: 40, intent: {} as Intent },
  { id: 'long', title: 'Centuries of river', map: 'long', power: 100, size: 64, intent: {} as Intent }
];
export function decode(bytes: Uint8Array): FullForceMap {
  const j = JSON.parse(strFromU8(bytes[0] === 31 ? gunzipSync(bytes) : bytes));
  return fullMap({ ...j, heights: Uint8Array.from(j.heights), lava: Uint32Array.from(j.lava), water: { depth: Float64Array.from(j.water.depth), contamination: Float64Array.from(j.water.contamination) } });
}
const urls = [new URL('./maps/young.json.gz', import.meta.url), new URL('./maps/narrow.json.gz', import.meta.url), new URL('./maps/long.json.gz', import.meta.url)];
export async function loadCase(c: typeof CASES[number]): Promise<FullForceMap> {
  const response = await fetch(urls[CASES.indexOf(c)]);
  if (!response.ok)
    throw Error('Map could not load');
  const map = decode(new Uint8Array(await response.arrayBuffer()));
  c.intent = { path: river(map).path.slice(4, -4) };
  return map;
}
