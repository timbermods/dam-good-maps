import {mkdirSync,writeFileSync,readFileSync,copyFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
export const dir=fileURLToPath(new URL('.',import.meta.url)),root=resolve(dir,'../..'),local=resolve(dir,'local');
mkdirSync(resolve(local,'probe'),{recursive:true});
const ref=process.env.SCALING_PROBE_REF??'a13a3573a956821f894170d0c565a89661534245';
for(const name of ['sizes','assemble']) {
  const original=execFileSync('git',['show',`${ref}:tools/probe-maps/${name}.ts`],{cwd:root,encoding:'utf8'});
  writeFileSync(resolve(local,'probe',name+'.ts'),original.replaceAll('../../src/','../../../../src/'));
}
writeFileSync(resolve(local,'provenance.json'),JSON.stringify({base:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),probe:execFileSync('git',['rev-parse',ref],{cwd:root,encoding:'utf8'}).trim(),node:process.version},null,2));
// Existing probe maps are read only; do not launch Timberborn or write its folders.
const probeFolder=process.env.SCALING_PROBE_FOLDER??'C:/dgm-probe/sizes';
for(const size of ['256x256','512x512','128x512','512x256','64x512']) {
  const name=`sizes-${size}.timber`;
  if(existsSync(resolve(probeFolder,name)))copyFileSync(resolve(probeFolder,name),resolve(local,'probe',name));
}
