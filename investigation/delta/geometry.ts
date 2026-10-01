import {deltaHydro} from './prototype';
import {drawGenome,leanGenome} from '../../src/core/land/genome';
import {orientationOf} from '../../src/core/land/orient';
import {makeSpec} from '../../src/core/spec/mapspec';
import {straightness,STRAIGHT_LIMITS} from '../../src/core/analysis/straight';
for(const size of [96,128,256]) {
 let max=0,canal=0,miss=0;
 for(let seed=1;seed<=20;seed++) {
  const s=makeSpec({theme:'delta',seed,size:{x:size,y:size}}),g=drawGenome('delta',seed,size,size,0,{vt:s.settings.terrain.verticality,variety:s.settings.terrain.variety});leanGenome(g,s.settings,size,size,seed,0,s.designedFor);g.orientation=orientationOf(seed,0,size,size);
  const hy=deltaHydro(new Uint8Array(size*size),g,seed,size,size),st=straightness(size,size,Float64Array.from(hy.water));
  const run=st.longest?.length??0,c=st.canal?.length??0;max=Math.max(max,run);canal=Math.max(canal,c);
  if(run>.8*STRAIGHT_LIMITS.run||c>.8*STRAIGHT_LIMITS.canal){miss++;console.log(size,seed,run,c);}
 }
 console.log({size,max,canal,miss});
 if(miss)throw Error(`${size}: ${miss} networks exceed M9b's land-screen straightness margin`);
}
