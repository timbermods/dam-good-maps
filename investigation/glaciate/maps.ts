import { gunzipSync, strFromU8 } from 'fflate';
import { storedMap, type ForceMap } from '../forces-core/core/map';
import { placeMap } from '../forces-core/demo/maps';
export const MAPS=[
 ['river-128','River Valley · 18 · 128²'],['river-96','River Valley · 18 · 96²'],['highlands-128','Highlands · 7 · 128²'],
 ['highlands-256','Highlands · 7 · 256²'],['delta-128','Delta · 39 · 128²'],
 ['tall-128','Tall generator study · VT85 · 128²'],
 ['near-lauterbrunnen','Gallery · Lauterbrunnen · 256²'],['near-aoraki-hooker-valley','Gallery · Hooker Valley · 128²'],['near-glencoe','Gallery · Glencoe · 96²']
] as const;
export async function loadMap(id:string):Promise<ForceMap>{
 if(!MAPS.some(a=>a[0]===id))throw Error('Unknown map');
 const place=id.startsWith('near-'),r=await fetch(place?'/real-places/data/'+id+'.json.gz':'/maps/'+id+'.json.gz');if(!r.ok)throw Error('Map unavailable: '+id);
 const bytes=new Uint8Array(await r.arrayBuffer());return place?placeMap(bytes):storedMap(JSON.parse(strFromU8(bytes[0]===31?gunzipSync(bytes):bytes)));
}
