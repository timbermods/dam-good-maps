import {DEAD,type MapView} from '../../src/render3d/model';
import {hash32} from '../../src/core/math/hash';
/** Repository notes/water_and_soil.md §Mechanisms and cycles/model.ts SPECIES:
 * DaysToDieDry × U(.9,1.1), starts at zero moisture, resets on rewetting.
 * Seeded draws preserve the game's range; Unity's private RNG is not in a map. */
export const DRY_DAYS:Record<string,number>={Pine:13,Birch:11,Oak:15,BlueberryBush:9};
export interface DroughtPlants {stress:Float32Array;dead:Uint8Array;dry:number;dying:number;killed:number;}
export class PlantDrought{
 private entries:{index:number;tile:number;limit:number;elapsed:number;initialDead:boolean}[]=[];
 private state:DroughtPlants;
 constructor(map:MapView,initialProgress?:Float32Array){
  const e=map.entities;this.state={stress:new Float32Array(e.count),dead:new Uint8Array(e.count),dry:0,dying:0,killed:0};
  for(let i=0;i<e.count;i++){
   const days=DRY_DAYS[e.templates[e.template[i]]];if(!days)continue;
   const limit=days*(.9+.2*(hash32('maplook-finish:drought:'+e.templates[e.template[i]]+':'+e.x[i]+':'+e.y[i])/4294967296));
   const initialDead=!!(e.flags[i]&DEAD);this.state.dead[i]=+initialDead;
   this.entries.push({index:i,tile:e.y[i]*map.W+e.x[i],limit,elapsed:(initialProgress?.[i]??0)*limit,initialDead});
  }
 }
 get hasLiving(){return this.entries.some(e=>!this.state.dead[e.index]);}
 advance(moisture:ArrayLike<number>,days:number){
  this.state.dry=this.state.dying=this.state.killed=0;
  for(const e of this.entries){
   const dry=moisture[e.tile]===0;if(dry)this.state.dry++;
   if(!this.state.dead[e.index]){
    e.elapsed=dry?e.elapsed+days:0;
    this.state.stress[e.index]=dry?Math.min(1,e.elapsed/e.limit):0;
    if(e.elapsed>=e.limit)this.state.dead[e.index]=1;
   }
   if(this.state.dead[e.index]&&!e.initialDead)this.state.killed++;
   if(!this.state.dead[e.index]&&e.elapsed>0)this.state.dying++;
  }
 }
 snapshot():DroughtPlants{return {...this.state,stress:this.state.stress.slice(),dead:this.state.dead.slice()};}
}
