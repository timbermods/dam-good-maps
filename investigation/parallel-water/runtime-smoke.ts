import {installParallelWater} from './runtime';
import {WaterSim} from './water';
import {WaterSim as Reference} from '../../src/core/sim/water';
onmessage=async({data})=>{
  const pool=await installParallelWater(data.threads,new URL('./runtime-helper.js',location.href),5000,512*512,0);
  try{
    let prior:Uint8Array[]=[],priorCopy:Uint8Array[]=[];
    for(let k=0;k<3;k++){
      const [W,H]=[[8,8],[11,7],[4,9]][k],N=W*H;
      const m={W,H,floor:Float64Array.from({length:N},(_,i)=>1+(i%5)/8),dam:k===1?Float64Array.from({length:N},(_,i)=>i%7===0?2.5:-1):null,emitters:[{cells:[Math.floor(H/2)*W+Math.floor(W/2)],strength:1,contamination:k/4}]};
      const options={rules:k===1?'port' as const:'game' as const};
      const a=new Reference(structuredClone(m),undefined,options),b=new WaterSim(structuredClone(m),undefined,options);
      console.log('RUNTIME_SMOKE constructed '+k);
      a.run(10);b.run(10);
      for(const key of ['D','Dold','C','out'] as const){const x=new Uint8Array(a[key].buffer),y=new Uint8Array(b[key].buffer);for(let i=0;i<x.length;i++)if(x[i]!==y[i])throw Error('runtime smoke mismatch '+k+' '+key);}
      for(let j=0;j<prior.length;j++)for(let i=0;i<prior[j].length;i++)if(prior[j][i]!==priorCopy[j][i])throw Error('Earlier returned array was overwritten');
      const keys=['D','Dold','C','out'] as const,identities=keys.map(key=>b[key]);
      for(const key of keys)if(b[key].buffer instanceof SharedArrayBuffer)throw Error('Public water array must remain private');
      b.run(1);a.run(1);
      for(let j=0;j<keys.length;j++){
        const key=keys[j];if(identities[j]!==b[key])throw Error('Array identity changed across run');
        const x=new Uint8Array(a[key].buffer),y=new Uint8Array(b[key].buffer);for(let i=0;i<x.length;i++)if(x[i]!==y[i])throw Error('Eleventh tick differs');
      }
      prior=keys.map(key=>new Uint8Array(b[key].buffer));priorCopy=prior.map(a=>a.slice());
      console.log('RUNTIME_SMOKE passed '+k);
    }
    postMessage({id:data.id,threads:pool.threads,requested:data.threads,hash:'pass',rows:[]});
  }catch(e){postMessage({error:String(e)});}finally{pool.close();}
};
