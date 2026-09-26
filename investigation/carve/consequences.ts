import { checkStartAt, entitiesByTile } from '../../src/editor/features';
import { entityView, surfaceWater, waterFromDepth } from '../../src/render3d/model';

import { walkRegions } from '../../src/core/analysis/regions';


import { CarveMap, entityTiles } from './engine';
import { slopeHighSide } from '../../src/core/format/footprints';
import { WALK_BLOCKERS } from '../../src/core/validate/playability';
export function consequences(m:CarveMap) {
  const start=m.entities.find(e=>e.template==='StartingLocation');
  if(!start)return {present:false,reach:0,tiles:new Uint8Array(m.W*m.H),water:null,trees:0,bushes:0,meets:false};
  const tiles=entityTiles(m,start),x=Math.round(tiles.reduce((s,i)=>s+i%m.W,0)/tiles.length),y=Math.round(tiles.reduce((s,i)=>s+Math.floor(i/m.W),0)/tiles.length);
  const entities=entityView(m.entities),water=surfaceWater(m.W,m.H,waterFromDepth(m.heights,m.water.depth,m.water.contamination));
  const c=checkStartAt({W:m.W,H:m.H,heights:m.heights,water,entities,entitiesAt:entitiesByTile(entities,m.W),index:null},x,y,[x,y-2],null,start.owner,
    {rules:{waterWithin:20,treesWithin20:40,bushesWithin20:30,badwaterWithin:15,ruinsWithin:15},reachMin:1000});
  const blocked=new Uint8Array(m.W*m.H),links:[number,number][]=[];
  for(const e of m.entities){
    if(e.template==='Slope'){
      const [dx,dy]=slopeHighSide(e.orientation),xx=e.x+dx,yy=e.y+dy;
      if(xx>=0&&yy>=0&&xx<m.W&&yy<m.H)links.push([e.y*m.W+e.x,yy*m.W+xx]);
    }else if(WALK_BLOCKERS.has(e.template))for(const i of entityTiles(m,e))blocked[i]=1;
  }
  const regions=walkRegions(m.heights,m.W,m.H,blocked,links),root=regions[y*m.W+x],reach=new Uint8Array(m.W*m.H);
  let count=0;for(let i=0;i<reach.length;i++)if(root>=0&&regions[i]===root&&m.water.depth[i]<=.05){reach[i]=1;count++;}
  return {present:true,reach:count,tiles:reach,water:c.water,trees:c.trees,bushes:c.bushes,meets:c.meets,warnings:c.warnings};
}
