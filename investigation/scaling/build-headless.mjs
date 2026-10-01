import {build} from 'esbuild';
import {adopt,dir,root} from './proposal.mjs';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const phase=process.argv[2]??'after';
await build({entryPoints:[resolve(dir,'headless.ts')],bundle:true,platform:'node',format:'esm',target:'node24',outfile:resolve(dir,'local',`headless-${phase}.mjs`),plugins:[{name:'capacity-overlay',setup(builder){builder.onLoad({filter:/\.(ts|json)$/},args=>{const file=args.path.replaceAll('\\','/').slice(root.replaceAll('\\','/').length+1),code=readFileSync(args.path,'utf8');return {contents:phase==='after'?adopt(file,code):code,loader:args.path.endsWith('.json')?'json':'ts'};});}}]});
