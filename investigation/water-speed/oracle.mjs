// Reuse the repository's independent oracle; only its output/reference locations and
// its import of the simulator are redirected, in a local bundle. Product files stay untouched.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {deps,HERE,ROOT,LOCAL,arg,hash,json} from './common.mjs';
const esbuild=deps('esbuild');mkdirSync(LOCAL,{recursive:true});
let text=readFileSync(resolve(ROOT,'tools/oracle.ts'),'utf8');
text=text.replace('const OFFICIAL = "investigation/raw/builtin";', 'const OFFICIAL = process.env.DGM_OFFICIAL ?? "investigation/raw/builtin";');
const target=resolve(LOCAL,'oracle-fast.cjs');
await esbuild.build({stdin:{contents:text,resolveDir:resolve(ROOT,'tools'),sourcefile:'oracle-investigation.ts',loader:'ts'},
  outfile:target,bundle:true,platform:'node',format:'cjs',target:'es2022',minify:false,
  nodePaths:[resolve(dirname(deps.resolve('typescript/package.json')),'..')],
  plugins:[{name:'water-speed-oracle',setup(build){build.onResolve({filter:/water$/},args=>{
    if(resolve(args.resolveDir,args.path)===resolve(ROOT,'src/core/sim/water'))return{path:resolve(HERE,'water.ts')};
  });}}],
});
const args=process.argv.slice(2),prefix=arg('prefix','oracle');
json(resolve(LOCAL,prefix+'-build.json'),{buildId:hash(readFileSync(resolve(LOCAL,'baseline.cjs'))+readFileSync(resolve(LOCAL,'fast.cjs'))),oracleBundle:hash(readFileSync(target)),args});
const result=spawnSync(process.execPath,[target,'--out',resolve(LOCAL,prefix+'-generated'),'--report',resolve(LOCAL,prefix+'-report.txt'),...args],{cwd:ROOT,encoding:'utf8',maxBuffer:256<<20});
writeFileSync(resolve(LOCAL,prefix+'.log'),(result.stdout??'')+(result.stderr??''));
console.log(result.stdout);if(result.stderr)console.error(result.stderr);if(result.error)throw result.error;
process.exit(result.status??1);
