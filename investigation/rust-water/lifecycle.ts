import * as fast from './local/reference-water';
import * as rust from './water';
import {snapshot} from './protocol';
function same(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)throw Error('Lifecycle size');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('Lifecycle byte '+i);}
export function lifecycle(){
 const small={W:3,H:3,floor:new Float64Array(9),dam:null,emitters:[{cells:[0],strength:2,contamination:.3,depthLimit:{anchor:0,off:.8,on:.6}}]};
 const a=new rust.WaterSim(small),ref=new fast.WaterSim(structuredClone(small)),D=a.D,out=a.out;
 if(a.backend!=='wasm')throw Error('Lifecycle fallback '+a.fallbackReason);
 a.run(17);ref.run(17);same(snapshot(a),snapshot(ref));
 const big={W:512,H:512,floor:new Float64Array(512*512),dam:null,emitters:[{cells:[0,511],strength:5,contamination:.7}]},initial={depth:new Float64Array(512*512).fill(.2),contamination:new Float64Array(512*512).fill(.3)};
 const b=new rust.WaterSim(big,initial),bref=new fast.WaterSim(structuredClone(big),initial);
 if(b.backend!=='wasm')throw Error('Large lifecycle fallback '+b.fallbackReason);
 b.run(2);bref.run(2);same(snapshot(b),snapshot(bref));
 a.run(23);ref.run(23);same(snapshot(a),snapshot(ref));
 if(a.D!==D||a.out!==out)throw Error('Public array identity changed');
 b.dispose();b.dispose();
 // Reuse freed allocations while another map remains live; exercise old-WebKit's failure.
 for(let i=0;i<250;i++){const c=new rust.WaterSim(small),cref=new fast.WaterSim(structuredClone(small));if(c.backend!=='wasm')throw Error('Repeated arena fallback '+i+' '+c.fallbackReason);c.run(1);cref.run(1);same(snapshot(c),snapshot(cref));c.dispose();}
 a.run(31);ref.run(31);same(snapshot(a),snapshot(ref));
 const before=snapshot(a);for(const ticks of [0,-1,NaN]){a.run(ticks);same(snapshot(a),before);}a.dispose();
 return 257;
}
