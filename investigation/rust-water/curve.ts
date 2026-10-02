import {badtideContamination} from '../../src/core/sim/weather';
import {expDet} from '../../src/core/math/detmath';
const portable=(t:number,days:number)=>{const shape=(v:number)=>{const x=17*(v-.5);return 1/(expDet(x)+expDet(-x))+.5;};return t<.5?shape(t):days-t<.5?shape(days-t):1;};
onmessage=()=>{const native12=[],native1=[],portable12=[],portable1=[];for(let t=0;t<8*768;t++){native1.push(badtideContamination(t/768,8));portable1.push(portable(t/768,8));if(t%12===0){native12.push(badtideContamination(t/768,8));portable12.push(portable(t/768,8));}}postMessage({native12,native1,portable12,portable1});};
