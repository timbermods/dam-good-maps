import { readFileSync } from 'node:fs';
import { gunzipSync,strFromU8 } from 'fflate';
import { storedMap } from '../../forces-core/core/map';
import { placeMap } from '../../forces-core/demo/maps';
export const fixture=(id:string)=>id.startsWith('near-')?placeMap(readFileSync('../../public/real-places/data/'+id+'.json.gz')):storedMap(JSON.parse(strFromU8(gunzipSync(readFileSync('maps/'+id+'.json.gz')))));
