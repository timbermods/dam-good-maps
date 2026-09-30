import { writeFileSync } from 'node:fs';
import { generate } from '../../src/core/gen/generate';
import { buildMap } from '../../src/core/features/build';
import { generatedField } from '../../src/core/doc/session';
import { canonicalSettle } from '../../src/core/sim/prefill';
import { makeSpec } from '../../src/core/spec/mapspec';
import { emptyColumns, entityView, soilView, waterFromDepth, surfaceWater } from '../../src/render3d/model';
import { settledVelocity } from './flow';
import { lifeOf, variantOf } from '../../src/worker/api';
const encode = (_: string,v:any) => ArrayBuffer.isView(v) ? Array.from(v as any) : v;
function save(name:string, value:any) { writeFileSync(`local/${name}.json`,JSON.stringify(value,encode)); }
function view(b:any) {
  if(!b.settle.out) throw Error('Missing settled outflows');
  return {W:b.W,H:b.H,heights:b.heights,columns:emptyColumns(),water:waterFromDepth(b.heights,b.water,b.contamination),
    flow:{source:'canonical-settle.out' as const,out:b.settle.out.slice(),depth:b.settle.depth.slice()},
    entities:entityView(b.entities.map((e:any)=>({...e,...lifeOf(e.components),...variantOf(e.components)}))),soil:soilView(b.moisture,b.soilContamination)};
}
for(const [theme,seed,size] of [['riverValley',4242,128],['delta',42,128],['riverValley',4242,256]] as const) {
  console.log(`Generating ${theme} ${size}, seed ${seed}`);
  const spec=makeSpec({theme,seed,size:{x:size,y:size}});
  if(theme==='delta') spec.settings.hazards.badwater='off';
  const r=generate(spec);
  if(!r.report.passed) throw Error(`${theme} ${size} generation failed`);
  const original=view(r.built),sw=surfaceWater(size,size,original.water),v=settledVelocity(size,size,original.flow)!;
  let at=-1,best=Infinity;
  for(let y=12;y<size-12;y++) for(let x=12;x<size-12;x++) {
    const i=y*size+x,d=Math.hypot(x-size/2,y-size/2);
    if(sw.depth[i]>.3&&Math.hypot(v[i*2],v[i*2+1])>.2&&d<best){at=i;best=d;}
  }
  if(at<0) throw Error('No moving edit site');
  const x=at%size,y=Math.floor(at/size);
  const edited=size===128?view(buildMap({W:size,H:size,seed,features:r.features,
    ...(r.field?{field:generatedField(r.field,size,size)}:{}),
    sculpts:[{params:{mode:'lower',amount:2,cells:Array.from({length:5},(_,k)=>[y-2+k,x-2,x+2] as [number,number,number])}}]})):original;
  save(size===128?theme:'performance-map',{theme,seed,edit:{x,y,description:'Lower riverbed two blocks'},original,edited});
  console.log(`Saved ${original.water.count} wet tiles; edit ${x},${y}`);
  if(theme==='riverValley'&&size===128) {
    // A controlled, level-bed reach cut through generated terrain. Moving the source to
    // the opposite boundary also swaps the solver's source-wall and draining outlet.
    const heights=original.heights.slice(),mid=(x:number)=>64+Math.round(9*Math.sin(x/19));
    for(let xx=0;xx<size;xx++) for(let yy=0;yy<size;yy++) {
      const distance=Math.abs(yy-mid(xx)),i=yy*size+xx;
      if(distance<=5) heights[i]=6;
      else if(distance<=11) heights[i]=Math.max(heights[i],11);
    }
    function reach(reverse:boolean,bad=false) {
      const xx=reverse?127:0,cells=Array.from({length:11},(_,k)=>(mid(xx)-5+k)*size+xx);
      const settle=canonicalSettle({W:size,H:size,floor:Float64Array.from(heights),dam:null,emitters:[{cells,strength:32,contamination:bad?1:0}]});
      const m={...original,heights,water:waterFromDepth(heights,settle.depth,settle.contamination),
        entities:entityView([]),flow:{source:'canonical-settle.out' as const,out:settle.out!.slice(),depth:settle.depth.slice()}};
      const vel=settledVelocity(size,size,m.flow)!;
      let sum=0,n=0;for(let xx=20;xx<108;xx++){const i=mid(xx)*size+xx;sum+=vel[i*2];n++;}
      if((sum/n)*(reverse?-1:1)<.1) throw Error('Source edit did not reverse real settled flow');
      console.log(`Reach ${reverse?'west':'east'} ${bad?'badwater':'clean'} mean vx=${sum/n}`);
      return m;
    }
    const before=reach(false),after=reach(true),bad=reach(false,true);
    save('wrongWay',{theme:'source edit',seed,edit:{x:64,y:mid(64),description:'Move source east; west boundary becomes the outlet'},original:before,edited:after});
    save('badwater',{theme:'badwater reach',seed,edit:{x:64,y:mid(64)},original:bad,edited:bad});
  }
}
