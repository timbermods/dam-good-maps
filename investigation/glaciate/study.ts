import {startingLocation} from '../../src/core/format/entities';
import {guidFrom} from '../../src/core/math/hash';
import type {ForceMap} from '../forces-core/core/map';
/** Round 1's tall heightfield is unchanged. Give that otherwise objectless study
 * one ordinary start for the Round 3 start/export contract; no playability repair. */
export function studyStart(m:ForceMap):ForceMap{
 if(m.entities.some(e=>e.template==='StartingLocation'))return m;
 for(let y=Math.floor(m.H*.5);y<m.H-3;y++)for(let x=Math.floor(m.W*.5);x<m.W-3;x++){
  const i=y*m.W+x,h=m.heights[i];if(![0,1,2,m.W,m.W+1,m.W+2,2*m.W,2*m.W+1,2*m.W+2].every(d=>m.heights[i+d]===h))continue;
  m.entities.push(startingLocation({id:guidFrom('glaciate-tall-input',7,0,0),owner:'tall-study-input',x,y,z:h,orientation:'Cw0'}));return m;
 }throw Error('Tall study has no level 3×3 start site');
}
