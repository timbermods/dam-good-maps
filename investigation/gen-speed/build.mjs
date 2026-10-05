import { build } from 'esbuild';
import ts from 'typescript';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
const here=resolve('investigation/gen-speed'), local=resolve(here,'local');
mkdirSync(local,{recursive:true});
const entry=resolve(here,'api.ts');
writeFileSync(entry,`export {generate} from '../../src/core/gen/generate';\nexport {makeSpec, AVAILABLE_THEMES} from '../../src/core/spec/mapspec';\nexport * from '../../src/core/sim/drought';\nexport {spillLevels} from '../../src/core/sim/prefill';\nexport {waterModelFromWorld} from '../../src/core/sim/model';\nexport {readTimber} from '../../src/core/format/timber';\n`);
export async function bundle(name, overlay=false, profile=false, counts=false){
await build({entryPoints:[entry],outfile:resolve(local,name+'.cjs'),bundle:true,platform:'node',format:'cjs',target:'es2022',plugins:[{name:'investigation',setup(b){b.onLoad({filter:/[\\/]src[\\/]core[\\/].*\.ts$/},a=>{
 const file=relative(resolve('src/core'),a.path).replaceAll('\\','/');
 let source=readFileSync(a.path,'utf8');
 if(overlay){try{source=readFileSync(resolve(here,'overlay/src/core',file),'utf8');}catch{}}
 if((profile || counts) && !/^(math\/portable|math\/rng|sim\/waterWasm)/.test(file)){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),edits=[];
  for(const n of ast.statements)if(ts.isFunctionDeclaration(n)&&n.body&&n.name&&n.body.end-n.body.pos>400){
   if(counts && !["gameSoil","pumpShores","spillLevels","prepareDrought","finalCtx","placeSlopes","integrityAt","rasterizeResource"].includes(n.name.text))continue;
   const label=file+':'+n.name.text;
   if(counts){edits.push([n.body.getStart(ast)+1,`if(globalThis.__counts)globalThis.__counts[${JSON.stringify(label)}]=(globalThis.__counts[${JSON.stringify(label)}]||0)+1;`]);continue;}
   edits.push([n.body.getStart(ast)+1,`const __gs=globalThis.__genSpeed?.enter(${JSON.stringify(label)});try{`]);
   edits.push([n.body.end-1,'}finally{globalThis.__genSpeed?.leave(__gs);}']);
  }
  for(const [at,text]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,at)+text+source.slice(at);
 }
 return {contents:source,loader:'ts',resolveDir:dirname(a.path)};
});}}]});
}
if(process.argv[2])await bundle(process.argv[2],process.argv.includes('--overlay'),process.argv.includes('--profile'),process.argv.includes('--counts'));
