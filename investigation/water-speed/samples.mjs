// Three tiny actual inputs, with complete-state digests; no bulk generated maps committed.
import {resolve} from 'node:path';
import {api,HERE,fixtures,model,sameSim,sameWater,json,hash,bytes} from './common.mjs';
const a=api(),b=api('fast');
for(const name of ['channel_gap','lake_sill','flat_plain']) {
  const fixture=fixtures().find(f=>f.name===name),m=model(fixture),results=[];
  for(const rules of ['game','port']) {
    const aa=new a.WaterSim(structuredClone(m),undefined,{rules}),bb=new b.WaterSim(structuredClone(m),undefined,{rules});
    aa.run(975);bb.run(975);sameSim(aa,bb,name+' sample');
    const ca=a.canonicalSettle(structuredClone(m),{rules}),cb=b.canonicalSettle(structuredClone(m),{rules});sameWater(ca,cb,name+' sample canonical');
    results.push({rules,fromEmptyTicks:975,fromEmptySha256:hash(Buffer.concat([aa.D,aa.C,aa.Dold,aa.out,aa.saturation()].map(bytes))),
      canonicalTicks:ca.ticks,canonicalSettled:ca.settled,canonicalSha256:hash(Buffer.concat([ca.depth,ca.contamination,ca.sat,ca.out].map(bytes)))});
  }
  json(resolve(HERE,'samples',name+'.json'),{provenance:'tests/golden/water.json.gz',name,model:{...m,floor:Array.from(m.floor),dam:m.dam?Array.from(m.dam):null},results});
  console.log('Small sample',name,m.W+'x'+m.H);
}
