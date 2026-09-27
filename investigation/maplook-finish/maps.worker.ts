import { generate } from '../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../src/core/spec/mapspec';
import { buildPlace, decodePlaceFile } from '../../src/core/places/place';
import { readTimber, writeTimber } from '../../src/core/format/timber';
import { openTimber, closeSession } from '../../src/worker/session';
import { entityView, emptyColumns, soilView, waterFromDepth, surfaceWater, type MapView } from '../../src/render3d/model';
import { WaterSim } from '../../src/core/sim/water';
import { waterModelFromWorld } from '../../src/core/sim/model';
import { surfaceVelocity } from './flow';
import { growthOf } from './growth';
import { galleryMap } from '../../tools/waterfall-gallery';
import { canonicalSettle } from '../../src/core/sim/prefill';
import { moisture } from '../../src/core/sim/moisture';
import { soilContamination } from '../../src/core/sim/contamination';
import { weatherSnapshots, type WeatherBase } from './weather';

export type MapRequest = { id: number; kind: 'generated'|'place'|'falls'|'objects'|'weather'; theme?: ThemeId; size?: number; seed?: number; name?: string; dense?: boolean; hazard?: 'drought'|'badtide'|'normal' };
let current: MapView | undefined, id = 0;
let weatherBase:WeatherBase|undefined,weatherToken=0;
export const objectTypes = ['RuinColumnH4','UndergroundRuins','SmallRelic','MediumRelic','LargeRelic','StartingLocation','GeothermalField','Thorns','Slope','NaturalDam','Blockage','WaterSource','BadwaterSource'];
self.onmessage = async ({data:r}:MessageEvent<MapRequest>) => {
  try {
    if(r.kind === 'weather') {
      const token=++weatherToken;
      if(r.hazard === 'normal')self.postMessage({id,restored:true});
      else if(weatherBase){
        await weatherSnapshots(weatherBase,r.hazard!,weather=>self.postMessage({id,weather}),()=>token!==weatherToken);
        if(token===weatherToken)self.postMessage({id,weatherDone:true});
      }
      return;
    }
    closeSession(); id=r.id;weatherToken++;weatherBase=undefined;
    let bytes:Uint8Array, label:string, settled:{depth:Float64Array;out?:Float64Array}|undefined;
    if(r.kind === 'falls' || r.kind === 'objects') {
      let view:MapView, velocity:Float32Array;
      if(r.kind === 'falls') {
        const m=galleryMap();
        // Original rock islands in the outlet river. These are real obstacles in
        // the solver's floor, so the foam responds to diverted flow.
        for(const [x,y] of [[17,11],[18,11],[18,12],[25,10],[30,12]])m.heights[y*m.W+x]=4;
        const w=canonicalSettle({W:m.W,H:m.H,floor:Float64Array.from(m.heights),dam:null,emitters:m.emitters});
        view={W:m.W,H:m.H,heights:m.heights,columns:emptyColumns(),entities:entityView([]),water:waterFromDepth(m.heights,w.depth,w.contamination),soil:soilView(moisture(m.heights,w.depth,w.contamination,m.W,m.H),soilContamination(m.heights,w.depth,w.contamination,m.W,m.H))};
        velocity=surfaceVelocity(m.W,m.H,w.depth,w.out!);
        label='Waterfall study · repository gallery · simulator-settled';
      } else {
        const W=84,H=28,heights=new Uint8Array(W*H).fill(4);
        const entities=entityView(objectTypes.map((template,i)=>({template,x:4+i*6,y:12,z:4,orientation:'Cw0',owner:'study',strength:1.5})));
        view={W,H,heights,columns:emptyColumns(),entities,water:waterFromDepth(heights,new Float32Array(W*H),new Float32Array(W*H)),soil:{moisture:new Uint8Array(W*H).fill(128),contamination:new Uint8Array(W*H)}};
        // Slope climbs one genuine level; no decorative floating ramp.
        for(let x=51;x<55;x++)for(let y=9;y<12;y++)heights[y*W+x]=5;
        velocity=new Float32Array(W*H*2); label='Landmark study · original procedural models';
      }
      current=view; self.postMessage({id,view,label,velocity,growth:undefined}); return;
    }
    if(r.kind==='generated'){
      const size=r.size??128,spec=makeSpec({seed:r.seed??4242,theme:r.theme,size:{x:size,y:size}});
      if(r.dense){spec.settings.resources.forestDensity=200;spec.settings.resources.ruins=300;}
      const result=generate(spec,{onProgress:p=>self.postMessage({id,progress:`Generating · attempt ${p.attempt+1} · ${p.stage}`})});
      if(!result.report.passed)throw Error('Generator rejected this seed; choose another.');
      bytes=result.bytes;settled=result.built.settle;label=`${r.theme} · ${size}² · seed ${r.seed??4242}`;
    } else {
      const response=await fetch(`/maps/place/${r.name}.json.gz`);
      if(!response.ok)throw Error('Place unavailable: '+response.status);
      const built=buildPlace(decodePlaceFile(new Uint8Array(await response.arrayBuffer())));
      bytes=writeTimber(built.file);settled=built.settle;label=r.name!;
    }
    const {view}=openTimber(bytes,label+'.timber');current=view;
    const world=readTimber(bytes).world;
    const sw=surfaceWater(view.W,view.H,view.water);
    weatherBase={view,model:waterModelFromWorld(world,view.heights),depth:Float64Array.from(sw.depth),contamination:Float64Array.from(sw.contamination),difficulty:'normal'};
    if(!settled?.out){
      const sw=surfaceWater(view.W,view.H,view.water);
      const sim=new WaterSim(waterModelFromWorld(world,view.heights),{depth:Float64Array.from(sw.depth),contamination:Float64Array.from(sw.contamination)});
      sim.run(128);settled={depth:sim.D,out:sim.out};
    }
    self.postMessage({id,view,label,velocity:surfaceVelocity(view.W,view.H,settled.depth,settled.out!),growth:growthOf(view.entities,world.entities)});
  } catch(error){self.postMessage({id:r.id,error:String(error)});}
};
