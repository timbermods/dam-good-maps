import {badtideContamination} from '../../src/core/sim/weather';
import {WaterSim} from '../../src/core/sim/water';
import {expDet} from '../../src/core/math/detmath';
const hex=(values:number[]|Float64Array)=>Array.from(new Uint8Array(Float64Array.from(values).buffer)).map(n=>n.toString(16).padStart(2,'0')).join('');
const portable=(t:number,days:number)=>{const s=(v:number)=>{const x=17*(v-.5);return 1/(expDet(x)+expDet(-x))+.5;};return t<.5?s(t):days-t<.5?s(days-t):1;};
(globalThis as any).probe=()=>{
  const output:any={native:[],portable:[],fractionalNative:[],fractionalPortable:[]};
  for(const [name,curve] of [['native',badtideContamination],['portable',portable]] as const) {
    const model={W:3,H:3,floor:Float64Array.of(4,4,4,4,0,4,4,4,4),dam:null,emitters:[{cells:[4],strength:1,contamination:0}]};
    const sim=new WaterSim(model,{depth:Float64Array.of(0,0,0,0,1,0,0,0,0),contamination:new Float64Array(9)});
    for(let tick=0;tick<8*768;) {
      const c=curve(tick/768,8);model.emitters[0].contamination=c;
      const gap=tick<768?12:96;sim.run(gap);tick+=gap;
      output[name].push({tick,forcing:hex([c]),depth:hex(sim.D),contamination:hex(sim.C),out:hex(sim.out)});
    }
  }
  for(const [name,curve] of [['fractionalNative',badtideContamination],['fractionalPortable',portable]] as const) {
    const model={W:3,H:3,floor:Float64Array.of(4,4,4,4,0,4,4,4,4),dam:null,emitters:[{cells:[4],strength:1,contamination:0}]};
    const sim=new WaterSim(model,{depth:Float64Array.of(0,0,0,0,1,0,0,0,0),contamination:new Float64Array(9)});
    for(let k=0;k<90;k++){const c=curve(k/60,1.5);model.emitters[0].contamination=c;sim.run(1);output[name].push({tick:k+1,forcing:hex([c]),contamination:hex(sim.C)});}
  }
  return output;
};
