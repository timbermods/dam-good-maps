import { writeTimber,mapMetadata } from '../../src/core/format/timber';
import { voxelsFromHeights,settledSimulationSingletons,GAME_VERSION,LAYERS } from '../../src/core/format/world';
import { entityJson } from '../../src/core/format/entities';
import { parse,type JsonObject } from '../../src/core/format/json';
import { moisture } from '../../src/core/sim/moisture';
import { WaterSim } from '../../src/core/sim/water';
import { thumbnailJpeg } from '../../src/core/render/shade';
import { modelFor,type ForceMap } from '../forces-core/core/map';
export function timber(m:ForceMap){
 const wet=moisture(m.heights,m.water.depth,m.water.contamination,m.W,m.H),sim=new WaterSim(modelFor(m),m.water);
 return writeTimber({metadata:mapMetadata(m.W,m.H,'Glaciate investigation. '+(m.heights.some(h=>h>16)?'Tall map: the in-game map editor edits only to level 16.':'')),
  thumbnail:thumbnailJpeg(m.heights,m.W,m.H,m.water.depth),versionTxt:GAME_VERSION,extraFiles:[],world:{gameVersion:GAME_VERSION,timestamp:'2026-01-01 00:00:00',sizeX:m.W,sizeY:m.H,layers:LAYERS,
   voxels:voxelsFromHeights(m.heights,m.W,m.H),entities:m.entities.map(e=>parse(JSON.stringify(entityJson(e))) as JsonObject),singletons:settledSimulationSingletons(m.W,m.H,{floor:m.heights,depth:m.water.depth,contamination:m.water.contamination,moisture:wet,soilContamination:m.water.contamination,sat:sim.saturation()})}});
}
