import { generateProto } from '../generative/proto/generate';
import { decodePlaceFile, decodeHeights, placeEntities } from '../../src/core/places/place';
import { plainEntities, type CarveMap } from './engine';
import { tree, bush, startingLocation } from '../../src/core/format/entities';
export const MAPS = [
  ['seed:highlands:18:128', 'Highlands · seed 18 · 128²'],
  ['seed:riverValley:18:256', 'River Valley · seed 18 · 256²'],
  ['seed:canyon:10:128', 'Canyon · seed 10 · 128²'],
  ['place:near-yosemite-valley', 'Near Yosemite Valley'],
  ['place:near-geirangerfjord', 'Near Geirangerfjord'],
  ['place:near-grand-canyon-colorado', 'Near Grand Canyon'],
  ['fixture:mountain', 'Study · mountain to lake'],
  ['fixture:ridge', 'Study · ridge breakthrough'],
  ['fixture:uphill', 'Study · uphill destination'],
  ['fixture:oxbow', 'Study · meander cutoff'],
] as const;
export async function loadMap(id: string): Promise<CarveMap> {
  const [kind, name, seed, size] = id.split(':');
  if (kind === 'fixture') return fixture(name);
  if (kind === 'seed') {
    const g = generateProto(name as Parameters<typeof generateProto>[0], Number(seed), Number(size), 'normal', { maxAttempts: 2 });
    const b = g.built;
    return { name: MAPS.find(a => a[0] === id)?.[1] ?? id, W: b.W, H: b.H, heights: b.heights, entities: plainEntities(b.entities),
      water: { depth: b.water, contamination: b.contamination }, maxHeight: 16 };
  }
  const r = await fetch('/real-places/data/'+name+'.json.gz');
  if (!r.ok) throw new Error('Map could not be loaded: '+r.status);
  return placeMap(new Uint8Array(await r.arrayBuffer()));
}
export function placeMap(bytes: Uint8Array): CarveMap {
  const p = decodePlaceFile(bytes), h = decodeHeights(p.heights);
  return { name: p.name, W: p.W, H: p.H, heights: h, entities: plainEntities(placeEntities(p, h)),
    water: { depth: new Float64Array(h.length), contamination: new Float64Array(h.length) }, maxHeight: 16 };
}
/** Explicit process study, not presented as generated or real terrain. */
export function fixture(kind = 'mountain', W = 96): CarveMap {
  const H = W, h = new Uint8Array(W*H);
  const depth = new Float64Array(W*H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = y/(H-1), bend = kind === 'bends' ? 8*((u*4 % 2 < 1) ? u*4%1 : 1-u*4%1)-4 : 5*(u-.5)*(u-.5);
    const side = Math.abs(x-W*.5-bend);
    let level = Math.round(3 + 11*u + Math.max(0, side-3)*.36);
    if (u < .3) level = side < W*.23 ? 2 : Math.min(16, 5+Math.floor((side-W*.23)*.4));
    if (y < 3 && side < W*.23) level = 4;
    if(kind==='ridge')level=Math.round(5+9*Math.exp(-Math.pow((y-W*.5)/(W*.1),2))+1.3*Math.sin(x*.11));
    if(kind==='uphill')level=Math.round(4+11*(1-u)+Math.max(0,side-8)*.18);
    if(kind==='oxbow')level=14;
    h[y*W+x] = Math.min(16, level);
    if (kind!=='ridge'&&kind!=='uphill'&&kind!=='oxbow'&&u < .3 && side < W*.23) depth[y*W+x] = Math.max(0, 4-h[y*W+x]);
  }
  const sy=Math.floor(W*.35),level=h[sy*W+9];
  for(let yy=sy-2;yy<=sy+4;yy++)for(let xx=7;xx<=13;xx++)h[yy*W+xx]=level;
  const at = (x:number,y:number,id:string) => ({ x,y,z:h[y*W+x],id,owner:'study' });
  const entities = [startingLocation({ ...at(9,Math.floor(W*.35),'start'), orientation:'Cw0' })];
  for (let y = Math.floor(W*.32); y < W-4; y+=3) for (let x = Math.floor(W*.43); x < W*.65; x+=3)
    entities.push((x%2 ? tree({ ...at(x,y,'tree-'+x+'-'+y),species:'Pine' }) : bush({ ...at(x,y,'bush-'+x+'-'+y),ripe:true })));
  return { name: 'Process study: '+kind, W,H,heights:h,entities:plainEntities(entities),water:{depth,contamination:new Float64Array(h.length)},maxHeight:16 };
}
