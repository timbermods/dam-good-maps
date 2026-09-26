import type { EntitySpec } from '../../../src/core/format/entities';
import { FOOTPRINTS } from '../../../src/core/format/footprints';
import { objectTile } from '../../../src/core/sim/model';
import type { Land, ForceMap, Fallen } from './map';
export const isPlant=(e:EntitySpec)=>/^(Pine|Birch|Oak|Succulent|BlueberryBush)$/.test(e.template);
export function entityTiles(m:Pick<Land,'W'|'H'>,e:EntitySpec,margin=0):number[]{
 const fp=FOOTPRINTS[e.template]?.size??[1,1,1],out:number[]=[];
 for(let y=-margin;y<fp[1]+margin;y++)for(let x=-margin;x<fp[0]+margin;x++){
  const [xx,yy]=objectTile(e,x,y);if(xx>=0&&yy>=0&&xx<m.W&&yy<m.H)out.push(yy*m.W+xx);
 }return out;
}
export function protectedGround(m:Land):Uint8Array {
 const keep=new Uint8Array(m.W*m.H);
 for(const e of m.entities)if(e.template==='StartingLocation')for(const i of entityTiles(m,e,1))keep[i]=1;
 return keep;
}
export const START_REASON='Start here';
export function strokeReason(points:{x:number;y:number}[],keep:Uint8Array,W:number,radius=0.75):string|null{
 for(let i=0;i<keep.length;i++)if(keep[i])for(let k=0;k<Math.max(1,points.length-1);k++){
  const a=points[k],b=points[k+1]??a;if(!a)continue;
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((i%W-a.x)*dx+(Math.floor(i/W)-a.y)*dy)/(dx*dx+dy*dy||1)));
  if((i%W-a.x-t*dx)**2+(Math.floor(i/W)-a.y-t*dy)**2<radius**2)return START_REASON;
 }return null;
}
export function ride(e:EntitySpec,height:number){if(e.z!==height)delete e.raw;e.z=height;}
export function topple(e:EntitySpec,fallen:Fallen[],f:Fallen){
 const at=fallen.findIndex(v=>v.id===e.id);if(at>=0)fallen.splice(at,1);fallen.push(f);
 e.components={...e.components,LivingNaturalResource:{IsDead:true}};delete e.raw;ride(e,f.z);
}
/** Zones and displacement are verb-specific; persistence and support are shared. */
export function reconcile(m:ForceMap):void {
 const ids=new Set(m.entities.map(e=>e.id));
 m.fallen=m.fallen.filter(f=>ids.has(f.id)).map(f=>({...f,z:m.heights[Math.floor(f.y)*m.W+Math.floor(f.x)]}));
 for(const e of m.entities){
  const tiles=entityTiles(m,e);if(!tiles.length)continue;
  // Keep the force's explicit destruction and footprint policies. All survivors
  // follow their supported ground (never retain stale raw Coordinates).
  if(tiles.every(i=>m.heights[i]===m.heights[tiles[0]]))ride(e,m.heights[tiles[0]]);
 }
}
export function startProblem(m:Land):string|null {
 for(const e of m.entities)if(e.template==='StartingLocation'){
  const tiles=entityTiles(m,e),fp=FOOTPRINTS[e.template]?.size??[3,3,1];
  if(tiles.length!==fp[0]*fp[1]||tiles.some(i=>m.heights[i]!==e.z))return 'Start needs flat ground';
  if(tiles.some(i=>m.water.depth[i]>.05))return 'Water would cover the start';
 }return null;
}
