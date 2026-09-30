// Optional ablation: remove periodic private-index sorting from the final candidate.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {deserialize} from 'node:v8';
import {api,deps,HERE,ROOT,LOCAL,json,sameWater} from './common.mjs';
let s=readFileSync(resolve(HERE,'water.ts'),'utf8');
s=s.replace(`      if (this.ticks % 64 === 0) {
        this.active.subarray(0, this.activeCount).sort();
        for (let a = 0; a < this.activeCount; a++) this.activePos[this.active[a]] = a;
      }
`, '');
const path=resolve(LOCAL,'unsorted-water.ts');writeFileSync(path,s);
await deps('esbuild').build({absWorkingDir:HERE,entryPoints:['api.ts'],outfile:resolve(LOCAL,'unsorted.cjs'),bundle:true,platform:'node',format:'cjs',target:'es2022',minify:false,nodePaths:[resolve(dirname(deps.resolve('typescript/package.json')),'..')],plugins:[{name:'trial',setup(build){build.onResolve({filter:/water$/},args=>resolve(args.resolveDir,args.path)===resolve(ROOT,'src/core/sim/water')?{path}:undefined);}}]});
const variants=[['baseline',api()],['unsorted',api('unsorted')],['fast',api('fast')]],rows=[];
for(const size of [128,256])for(const theme of ['riverValley','lakeBasin','islands']) {
  const m=deserialize(readFileSync(resolve(LOCAL,'inputs',`${theme}-${size}.bin`)));
  const times=Object.fromEntries(variants.map(([name])=>[name,[]]));
  let ref;
  for(let k=0;k<5;k++)for(let j=0;j<variants.length;j++) {
    const [name,impl]=variants[(k+j)%variants.length],model=structuredClone(m),start=process.threadCpuUsage();
    const out=impl.canonicalSettle(model),used=process.threadCpuUsage(start);
    if(ref)sameWater(ref,out,`${theme}/${size}/${name}`);else ref=out;
    if(k)times[name].push((used.user+used.system)/1000);
  }
  const med=vs=>vs.slice().sort((x,y)=>x-y)[vs.length>>1];
  const row={theme,size,times,fastRatio:med(times.baseline)/med(times.fast),orderGain:med(times.unsorted)/med(times.fast)};
  rows.push(row);json(resolve(LOCAL,'order-trial.json'),rows);console.log(JSON.stringify(row));
}
