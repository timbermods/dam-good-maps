import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SketchJob,install,type MapSnapshot} from './engine';
import {SketchJob as Before} from './local/before-engine';
import {fromWorld} from './maps';
import {emptySimulationSingletons,voxelsFromHeights} from '../../src/core/format/world';
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const digest=(v:any)=>sha(JSON.stringify(v,(key,value)=>key==='runtimeMs'?0:ArrayBuffer.isView(value)?{type:value.constructor.name,bytes:sha(Buffer.from(value.buffer,value.byteOffset,value.byteLength))}:typeof value==='number'&&(Object.is(value,-0)||!Number.isFinite(value))?{number:Object.is(value,-0)?'-0':String(value)}:value));
install(readFileSync('local/water.wasm'));
function map():MapSnapshot{
 const W=12,N=W*W,floor=new Float64Array(N).fill(5);for(let y=1;y<W;y++)for(let x=4;x<8;x++)floor[y*W+x]=1;
 floor[0]=-0;
 return {name:'round2 seam contract',model:{W,H:W,floor,dam:null,emitters:[{cells:[W+5],strength:1,contamination:.1,depthLimit:{anchor:W+5,off:.8,on:.72}}]},water:{depth:new Float64Array(N).fill(-0),contamination:new Float64Array(N)},startTiles:[],objects:[]};
}
const cases:any[]=[{id:'dam-seep',map:map(),strokes:[{path:[[4,7],[7,7]],stack:[{kind:'dam'}]}]},{id:'stack-seep',map:map(),strokes:[{path:[[4,7],[7,7]],stack:[{kind:'dam'},{kind:'dam'}]}]}];
const W=5,N=W*W,voxels=voxelsFromHeights(new Uint8Array(N).fill(3),W,W);voxels[N+12]=0;
const singletons=emptySimulationSingletons(W,W,2),tokens=new Array(2*N).fill('0');tokens[12]='.5:0:0:1:.5';(singletons.WaterMapNew as any).WaterColumns.Array=tokens.join(' ');
cases.push({id:'roof-zero-forcing',map:fromWorld({gameVersion:'1.1.2.4-52e959e-sw',timestamp:'2026-10-02 00:00:00',sizeX:W,sizeY:W,layers:23,voxels,entities:[],singletons},'roof contract'),strokes:[{path:[[2,2]],stack:[{kind:'dam'}]}]});
let comparisons=0;const rows:any[]=[];
for(const c of cases)for(const budget of [1,8,129]){
 const forcing=(value:number)=>c.map.model.emitters.map(()=>value);
 const weather={provenance:'Explicit varying-frame/seep identity contract',frames:[{ticks:1,kind:'temperate',strengths:forcing(.75),contamination:forcing(.2)},{ticks:31,kind:'temperate',strengths:forcing(1),contamination:forcing(.1)},{ticks:17,kind:'drought',strengths:forcing(0),contamination:forcing(0)},{ticks:5,kind:'badtide',strengths:forcing(.5),contamination:forcing(1)},{ticks:64,kind:'temperate',strengths:forcing(.25),contamination:forcing(.3)}]} as any;
 const a=new Before(c.map,c.strokes,weather,128),b=new SketchJob(c.map,c.strokes,weather,128);let r=a.result(),s=b.result();
 const rolling=createHash('sha256');
 while(true){assert.equal(digest(r),digest(s),c.id+'/'+budget+'/'+r.ticks);rolling.update(digest(r));comparisons++;
  for(const field of ['sim','control']){const ac=(a as any)[field].columns(),bc=(b as any)[field].columns();for(const key of ['floor','depth','overflow'])if(ac[key])assert.deepEqual(Buffer.from(ac[key].buffer,ac[key].byteOffset,ac[key].byteLength),Buffer.from(bc[key].buffer,bc[key].byteOffset,bc[key].byteLength));}
  if(r.phase==='complete')break;r=a.advance(budget);s=b.advance(budget);
 }
 rows.push({id:c.id,budget,digest:rolling.digest('hex')});a.dispose();b.dispose();
}
writeFileSync('round2-contracts.json',JSON.stringify({passed:true,comparisons,rows,excluded:['runtimeMs']},null,2)+'\n');console.log('PASS round2 varying weather, seep hysteresis, signed zero, stacked and roof bytes:',comparisons);
