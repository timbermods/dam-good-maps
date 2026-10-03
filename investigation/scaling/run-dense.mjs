import {build} from 'esbuild';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {adopt,dir,root} from './proposal.mjs';
const out=resolve(dir,'local/dense');mkdirSync(out,{recursive:true});const stop=resolve(out,'stop-'+Date.now());
const load=spawn('powershell.exe',['-NoProfile','-File',resolve(dir,'load.ps1'),'-Output',resolve(out,'load.jsonl'),'-Stop',stop],{windowsHide:true});
try{for(const [phase,size] of [['before','256x256'],['after','256x256'],['after','512x512']]){
 const file=resolve(out,'dense-'+phase+'.mjs');
 await build({entryPoints:[resolve(dir,'dense-history.ts')],bundle:true,platform:'node',format:'esm',target:'node24',outfile:file,plugins:[{name:'overlay',setup(b){b.onLoad({filter:/\.(ts|json)$/},args=>{const name=args.path.replaceAll('\\','/').slice(root.replaceAll('\\','/').length+1),code=readFileSync(args.path,'utf8');return {contents:phase==='after'?adopt(name,code):code,loader:args.path.endsWith('.json')?'json':'ts'};});}}]});
 const child=spawn(process.execPath,['--expose-gc',file,size,phase],{cwd:root,windowsHide:true,stdio:'inherit'});const exit=await new Promise(r=>child.once('exit',r));if(exit!==0)console.log('Dense child failed:',phase,size,exit);
}}finally{writeFileSync(stop,'done');await new Promise(r=>load.exitCode!==null?r():load.once('exit',r));}
