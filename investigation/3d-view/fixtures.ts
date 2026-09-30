import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {TERRAIN3D_MAPS, build} from './local/terrain/tools/terrain3d-maps';
import {terrainColumns} from './local/terrain/src/core/sim/columns';
import {stackModel} from './local/terrain/src/core/sim/stackModel';
import {toMapObject} from './local/terrain/src/core/features/build';
import {Terrain} from './local/dev/investigation/erode/core/terrain';
import {fromJson} from './local/dev/investigation/erode/core/map';
import {planErode,landAt} from './local/dev/investigation/erode/core/erode';
import {CASES} from './local/dev/investigation/erode/demo/cases';
import {ROOF_CASES,roofMap} from './local/dev/investigation/erode/demo/roofs';
import {BlockDocument} from './local/dev/investigation/block-tool/core/block';
import {tunnel} from './local/dev/investigation/block-tool/demo/samples';
import {plan,DEFAULTS,reveal} from './local/rift/investigation/rift/rift';
export type Pose={target:number[],yaw:number,pitch:number,distance:number,fov?:number};
export type Fixture={id:string,title:string,W:number,H:number,mask:number[],water:number[][],moist:number[],poses:Record<string,Pose>,levels:number[],frames?:number[][],source:string};
mkdirSync('local/fixtures',{recursive:true});
const index:Record<string,unknown>[]=[];
function save(f:Fixture){const bytes=JSON.stringify(f);writeFileSync(`local/fixtures/${f.id}.json`,bytes);index.push({id:f.id,title:f.title,source:f.source,W:f.W,H:f.H,levels:f.levels,sha256:createHash('sha256').update(bytes).digest('hex')});console.log(f.id);}
const overview=(W:number,H:number):Pose=>({target:[W/2,5,-H/2],yaw:.6,pitch:.7,distance:Math.max(W,H)*1.1});
for(const make of TERRAIN3D_MAPS){
 const m=await make(),s=m.scene,b=build(m),cols=stackModel(s.masks,s.entities.map(toMapObject)).cols,runs=terrainColumns(s.masks),water:number[][]=[],moist=Array(s.N*24).fill(0);
 for(const voxel of b.dropped)s.mask[voxel%s.N]&=~(1<<Math.floor(voxel/s.N));
 for(let c=0;c<b.arrays.depth.length;c++)if(b.arrays.depth[c]>.01){const i=c%s.N;water.push([i%s.W,Math.floor(i/s.W),cols.floor[c]+b.arrays.depth[c],b.arrays.depth[c],b.arrays.contamination[c]]);}
 for(let i=0;i<s.N;i++)for(let r=0;r<runs.count[i];r++){const c=r*s.N+i;for(let z=runs.floor[c];z<runs.ceil[c];z++)moist[z*s.N+i]=b.arrays.moisture[c]>0?1:0;}
 const f=m.focus[0];
 const inside:Record<string,Pose>={
 't1-support':{target:[15,6.5,-17],yaw:1.57,pitch:0,distance:2.3,fov:75},
 't2-walking':{target:[34,5,-31],yaw:-1.57,pitch:0,distance:4,fov:75},
 't3-cave-water':{target:[9,4.3,-9],yaw:1.57,pitch:.03,distance:3,fov:78},
 't4-soil':{target:[25,7,-35.5],yaw:1.57,pitch:0,distance:3,fov:75},
 't5-plants':{target:[11,8,-10],yaw:0,pitch:.05,distance:3,fov:75},
 't6-heights':{target:[142,15,-62],yaw:1.3,pitch:.12,distance:12,fov:70}
 };
 const details:Record<string,Pose>={
  't2-walking':{target:[28,5,-30.5],yaw:-1.4,pitch:.12,distance:17},
  't3-cave-water':{target:[3,4.5,-9.5],yaw:-1.5,pitch:.1,distance:17},
  't6-heights':{target:[63.5,5,-137],yaw:0,pitch:.28,distance:24}
 };
 inside['t6-heights']={target:[63.5,5.6,-139.5],yaw:Math.PI,pitch:0,distance:4,fov:75};
 const detail=details[m.id]??{target:[f.x,f.z,-f.y],yaw:1,pitch:.25,distance:22};
 const slicePose=m.id==='t3-cave-water'?{target:[9,3,-9],yaw:.6,pitch:.9,distance:26}:m.id==='t6-heights'?{target:[63.5,4,-143],yaw:.6,pitch:.9,distance:28}:{...detail,pitch:.8,distance:Math.max(24,detail.distance)};
 save({id:m.id,title:m.title,W:s.W,H:s.H,mask:Array.from(s.mask),water,moist,poses:{outside:overview(s.W,s.H),detail,inside:inside[m.id],slice:slicePose},levels:m.id==='t6-heights'?[5,6,8]:[4,7,11],source:'terrain3d-a T1–T6 scene masks after load-time support; canonical build water/soil',});
}
const load=(id:string)=>fromJson(JSON.parse(gunzipSync(readFileSync(`local/dev/investigation/erode/maps/${id}.json.gz`)).toString()));
for(const c of [...CASES.filter(c=>['crater-lip','canyon-cave','tall-arch','tall-shore'].includes(c.id)),...ROOF_CASES.filter(c=>c.id!=='roof-dome')]){
 const {map,terrain}=c.map==='roof'?roofMap():(()=>{const map=load(c.map);return{map,terrain:Terrain.fromHeights(map.W,map.H,map.heights)}})();
 const p=planErode({terrain,rock:map.rock,keep:map.keep,water:map.water},{points:c.points},{power:c.power,size:c.size,seed:c.seed});
 const water:number[][]=[];for(let i=0;i<map.water.length;i++)if(map.water[i]>.01)water.push([i%map.W,Math.floor(i/map.W),map.heights[i]+map.water[i],map.water[i],map.contamination[i]]);
 save({id:c.id,title:c.title,W:map.W,H:map.H,mask:Array.from(p.final.cols),water,moist:Array.from(map.moist),poses:{outside:c.overview,detail:c.low,inside:c.inside??{...c.low,distance:Math.min(4,c.low.distance),fov:78}},levels:[4,7,11],frames:Array.from({length:17},(_,i)=>Array.from(i===0?terrain.cols:landAt(terrain,p,Math.floor((i/16)*(p.buckets-1))).cols)),source:`Erode pinned ${c.id}, power ${c.power}, size ${c.size}, seed ${c.seed}; demo water approximation retained`});
}
{
 const map=load('canyon'),terrain=Terrain.fromHeights(map.W,map.H,map.heights),doc=new BlockDocument(map,terrain),frames=[Array.from(terrain.cols)];doc.begin('hold');for(const stamp of tunnel){doc.apply(doc.preview(stamp));frames.push(Array.from(doc.terrain.cols));}doc.end();
 save({id:'block-tunnel',title:'Block tool · nine precise tunnel stamps',W:map.W,H:map.H,mask:Array.from(doc.terrain.cols),water:[],moist:Array.from(map.moist),frames,poses:{outside:{target:[94,5,-75],yaw:.3,pitch:.35,distance:28},detail:{target:[94,4.5,-74],yaw:0,pitch:0,distance:9,fov:65},inside:{target:[94,4.5,-75],yaw:Math.PI,pitch:0,distance:2,fov:80}},levels:[4,6,9],source:'BlockDocument + demo/samples.ts tunnel, unchanged'});
}
{
 const m=JSON.parse(gunzipSync(readFileSync('local/dev/investigation/rift/maps/highlands.json.gz')).toString());m.heights=Uint8Array.from(m.heights);m.lava=Uint8Array.from(m.lava);m.water.depth=Float64Array.from(m.water.depth);m.water.contamination=Float64Array.from(m.water.contamination);
 const p=plan(m,{...DEFAULTS,power:85,size:24},{path:[{x:28,y:28},{x:64,y:57},{x:99,y:94}]});
 save({id:'rift',title:'Rift · broken walls and dropped land',W:m.W,H:m.H,mask:Array.from(Terrain.fromHeights(m.W,m.H,p.map.heights).cols),moist:[],water:[],frames:Array.from({length:17},(_,i)=>Array.from(Terrain.fromHeights(m.W,m.H,reveal(p,i/16).heights).cols)),poses:{outside:overview(m.W,m.H),detail:{target:[64,6,-57],yaw:.7,pitch:.25,distance:30},inside:{target:[64,4,-57],yaw:1.5,pitch:.08,distance:3,fov:78}},levels:[4,7,11],source:'Rift plan/reveal, original Highlands fixture; dry render, no invented cave geometry'});
}
{
 const W=256,H=256,t=new Terrain(W,H,new Uint32Array(W*H));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const h=9+Math.floor(4*(Math.sin(x*.045)+Math.cos(y*.053))*.5);t.cols[y*W+x]=2**h-1;if(x%16>=3&&x%16<=9)for(let z=2;z<5;z++)t.set(y*W+x,z,false);if(x%16>=5&&x%16<=7&&y%24<3)for(let z=5;z<h;z++)t.set(y*W+x,z,false);}
 save({id:'many-caves',title:'256² · connected galleries and skylights',W,H,mask:Array.from(t.cols),moist:Array.from({length:W*H},(_,i)=>+(Math.sin(i%W*.08)>0)),water:[],poses:{outside:overview(W,H),detail:{target:[118,4,-110],yaw:.8,pitch:.22,distance:28},inside:{target:[118,3.3,-110],yaw:0,pitch:.05,distance:3,fov:75}},levels:[3,5,8],source:'Original deterministic stress fixture: 16 galleries × 256 tiles, 176 skylights; deliberately adversarial, not a generated playable map'});
 const plain=t.clone();for(let i=0;i<t.N;i++)plain.cols[i]=2**t.surface(i)-1;
 save({id:'heightfield',title:'256² · matched heightfield baseline',W,H,mask:Array.from(plain.cols),moist:[],water:[],poses:{outside:overview(W,H)},levels:[3,5,8],source:'Many-caves upper envelope, same camera, shader and frame harness'});
}
writeFileSync('local/fixtures/index.json',JSON.stringify(index,null,2));
