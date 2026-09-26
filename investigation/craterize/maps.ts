import { generateProto } from '../generative/proto/generate';
import { decodePlaceFile, decodeHeights, placeEntities } from '../../src/core/places/place';
import { tree, startingLocation, waterSource } from '../../src/core/format/entities';
import { geology, plainEntities, type CraterMap } from './engine';
export const MAPS=[
 ['seed:highlands:18:128','Highlands · seed 18 · 128²'],
 ['seed:riverValley:18:256','River Valley · seed 18 · 256²'],
 ['seed:canyon:10:128','Canyon · seed 10 · 128²'],
 ['place:near-yosemite-valley','Near Yosemite Valley'],
 ['place:near-geirangerfjord','Near Geirangerfjord'],
 ['place:near-grand-canyon-colorado','Near Grand Canyon'],
 ['fixture:plain:128','Study · open woodland · 128²'],
 ['fixture:plain:256','Study · open woodland · 256²'],
 ['fixture:river:128','Study · river dam · 128²'],
] as const;
export async function loadMap(id:string):Promise<CraterMap>{
  const [kind,name,seed,size]=id.split(':');
  if(kind==='fixture')return fixture(name,Number(seed)||128);
  if(kind==='seed'){
    const g=generateProto(name as Parameters<typeof generateProto>[0],Number(seed),Number(size),'normal',{maxAttempts:2}),b=g.built;
    return {name:MAPS.find(a=>a[0]===id)?.[1]??id,W:b.W,H:b.H,heights:b.heights,entities:plainEntities(b.entities),
      water:{depth:b.water,contamination:b.contamination},maxHeight:22,rockLayers:geology(b.heights),fallen:[]};
  }
  if(kind!=='place'||!MAPS.some(m=>m[0]===id))throw Error('Unknown map');
  const response=await fetch('/real-places/data/'+name+'.json.gz');if(!response.ok)throw Error('Map could not be loaded');
  return placeMap(new Uint8Array(await response.arrayBuffer()));
}
export function placeMap(bytes:Uint8Array):CraterMap{
  const p=decodePlaceFile(bytes),heights=decodeHeights(p.heights);
  return {name:p.name,W:p.W,H:p.H,heights,entities:plainEntities(placeEntities(p,heights)),
    water:{depth:new Float64Array(heights.length),contamination:new Float64Array(heights.length)},maxHeight:22,rockLayers:geology(heights),fallen:[]};
}
/** Deliberately simple process studies, clearly separated from generated maps. */
export function fixture(kind='plain',W=128):CraterMap{
  const H=W,heights=new Uint8Array(W*H),depth=new Float64Array(W*H),riverX=Math.floor(W*.66);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    let h=11;
    if(kind==='river'){const d=Math.abs(x-riverX);h=d<=2?5:d<=5?9:11;
      if(y>H*.55&&y<H*.89&&d>2&&d<=13)h=6;
      if(y===H-1&&d<=2)h=6;
      if(d<=2)depth[y*W+x]=1.05;}
    heights[y*W+x]=h;
  }
  const at=(x:number,y:number,id:string)=>({x,y,z:heights[y*W+x],id,owner:'craterize-study'});
  const entities=[startingLocation({...at(7,8,'start'),orientation:'Cw0'})];
  if(kind==='river')for(let dx=-2;dx<=2;dx++)entities.push(waterSource({...at(riverX+dx,H-1,'existing-source-'+dx),strength:.6}));
  for(let y=5;y<H-5;y+=3)for(let x=5;x<W-5;x+=3){
    if(x<13&&y<15||kind==='river'&&heights[y*W+x]<9)continue;
    if((x*7+y*11)%17<11)entities.push(tree({...at(x,y,'tree-'+x+'-'+y),species:(x+y)%2?'Pine':'Birch'}));
  }
  return {name:'Study · '+kind,W,H,heights,entities:plainEntities(entities),water:{depth,contamination:new Float64Array(W*H)},maxHeight:22,rockLayers:geology(heights),fallen:[]};
}
