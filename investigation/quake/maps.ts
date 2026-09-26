import { generateProto } from '../generative/proto/generate';
import { decodePlaceFile, decodeHeights, placeEntities } from '../../src/core/places/place';
import { tree,startingLocation,waterSource,bush,blockObject } from '../../src/core/format/entities';
import { geology,plainEntities,type QuakeMap } from './engine';
export const MAPS=[
 ['fixture:river:128','Study · river crossing · 128²'],['fixture:lake:128','Study · tilted lake · 128²'],['fixture:plain:128','Study · rift valley · 128²'],['fixture:river:256','Study · river crossing · 256²'],
 ['fixture:slide:128','Study · Slide · river, ridge & ruins · 128²'],['fixture:slide:256','Study · Slide · river, ridge & ruins · 256²'],
 ['seed:highlands:18:128','Highlands · seed 18 · 128²'],['seed:riverValley:18:256','River Valley · seed 18 · 256²'],['seed:canyon:10:128','Canyon · seed 10 · 128²'],
 ['place:near-yosemite-valley','Near Yosemite Valley'],['place:near-geirangerfjord','Near Geirangerfjord'],['place:near-grand-canyon-colorado','Near Grand Canyon']
] as const;
export async function loadMap(id:string):Promise<QuakeMap>{
 const [kind,name,seed,size]=id.split(':');
 if(kind==='fixture')return fixture(name,Number(seed)||128);
 if(kind==='seed'){
  const g=generateProto(name as Parameters<typeof generateProto>[0],Number(seed),Number(size),'normal',{maxAttempts:2}),b=g.built;
  return {name:MAPS.find(a=>a[0]===id)?.[1]??id,W:b.W,H:b.H,heights:b.heights,entities:plainEntities(b.entities),water:{depth:b.water,contamination:b.contamination},maxHeight:22,rockLayers:geology(b.heights),fallen:[]};
 }
 if(kind!=='place'||!MAPS.some(m=>m[0]===id))throw Error('Unknown map');
 const r=await fetch('/real-places/data/'+name+'.json.gz');if(!r.ok)throw Error('Place could not be loaded');return placeMap(new Uint8Array(await r.arrayBuffer()));
}
export function placeMap(bytes:Uint8Array):QuakeMap{
 const p=decodePlaceFile(bytes),heights=decodeHeights(p.heights);
 return {name:p.name,W:p.W,H:p.H,heights,entities:plainEntities(placeEntities(p,heights)),water:{depth:new Float64Array(heights.length),contamination:new Float64Array(heights.length)},maxHeight:22,rockLayers:geology(heights),fallen:[]};
}
/** Purpose-built process studies, distinct from actual generated maps in the picker. */
export function fixture(kind='river',W=128):QuakeMap{
 const H=W,heights=new Uint8Array(W*H),depth=new Float64Array(W*H),rx=Math.floor(W*.55),ly=Math.floor(H*.70),lr=W*.16;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,d=Math.abs(x-rx);let h=9;
  if(kind==='river'||kind==='slide'){h=d<=3?6:d<=6?8:9;if(d<=3)depth[i]=.65;}
  if(kind==='slide'&&x>W*.23&&x<W*.32&&y>H*.20&&y<H*.84)h=12+Math.floor(Math.min(x-W*.23,W*.32-x)/2);
  if(kind==='lake'){const r=Math.sqrt((x-rx)**2+(y-ly)**2);h=r<lr?6:r<lr+3?9:8;
   if(y<ly&&d<=2)h=7;if(r<lr)depth[i]=2.35;else if(y<ly&&d<=2)depth[i]=.35;}
  heights[i]=h;
 }
 const at=(x:number,y:number,id:string)=>({x,y,z:heights[y*W+x],id,owner:'quake-study'});
 const entities=[startingLocation({...at(9,10,'start'),orientation:'Cw0'})];
 if(kind==='river'||kind==='slide')for(let dx=-3;dx<=3;dx++)entities.push(waterSource({...at(rx+dx,H-1,'existing-source-'+dx),strength:.8}));
 if(kind==='lake')entities.push(waterSource({...at(rx,ly,'existing-spring'),strength:2.5}));
 for(let y=5;y<H-5;y+=3)for(let x=5;x<W-5;x+=3){
  const i=y*W+x;if(x<15&&y<17||depth[i]||Math.abs(x-rx)<7&&kind!=='plain')continue;
  if((x*7+y*11)%17<9)entities.push(tree({...at(x,y,'tree-'+x+'-'+y),species:(x+y)%2?'Pine':'Birch'}));
  else if((x+y)%7===0)entities.push(bush({...at(x,y,'bush-'+x+'-'+y),ripe:true}));
 }
 if(kind==='slide')for(const yy of [.37,.67])for(let k=0;k<5;k++){
   const x=Math.floor(W*.76)+k,y=Math.floor(H*yy);for(let j=entities.length-1;j>=0;j--)if(entities[j].x===x&&entities[j].y===y)entities.splice(j,1);
   entities.push(blockObject({...at(x,y,'ruin-'+yy+'-'+k),template:'RuinColumnH'+(2+k%3),orientation:'Cw0'}));
 }
 return {name:'Study · '+kind,W,H,heights,entities:plainEntities(entities),water:{depth,contamination:new Float64Array(W*H)},maxHeight:22,rockLayers:geology(heights),fallen:[]};
}
