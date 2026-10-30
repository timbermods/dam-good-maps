// Recreate the accepted gesture-only SOURCE fixtures without replaying them on reopen.
// Historical product files are a read-only git archive under ignored local/, never a checkout.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),repository=resolve(dir,'../../..'),local=resolve(dir,'../local/round3'),historical=resolve(local,'round2-source'),pin='40e5d6ca85e9ca973ed603707e4a21d0ab458980';
const accepted=resolve(dir,'../local/round2/accepted');mkdirSync(local,{recursive:true});
if(!process.argv.includes('--setup-only')&&[256,512].every(n=>existsSync(resolve(accepted,`after-${n}-1-128.json`))&&existsSync(resolve(accepted,`after-${n}-1-128.damgoodmaps.json`)))){console.log('Existing accepted source fixtures retained.');process.exit(0);}
mkdirSync(historical,{recursive:true});const marker=resolve(historical,'.scaling-historical-pin');
if(!existsSync(marker)){const tar=resolve(local,'round2-source.tar');execFileSync('git',['archive','--format=tar','-o',tar,pin],{cwd:repository});execFileSync('tar',['-xf',tar,'-C',historical]);writeFileSync(marker,pin);}else if(readFileSync(marker,'utf8')!==pin)throw Error('historical source pin differs');
for(const [destination,source]of [[resolve(historical,'node_modules'),resolve(repository,'node_modules')],[resolve(historical,'investigation/scaling/node_modules'),resolve(dir,'../node_modules')]])if(!existsSync(destination))symlinkSync(source,destination,'junction');
const runFile=resolve(historical,'investigation/scaling/round2/run-case.mjs'),needle='let opened,newCold;';let code=readFileSync(runFile,'utf8');
if(!code.includes('SCALING_R3_FIXTURE_ONLY')){if(!code.includes(needle))throw Error('historical harness drift');code=code.replace(needle,`if(process.env.SCALING_R3_FIXTURE_ONLY==='1'){data.final={state:finalState,exportHash,parity:true,history:session.editCount};save();cold?.close();process.exit(0);}\n`+needle);writeFileSync(runFile,code);}
execFileSync(process.execPath,['--check',runFile],{cwd:historical});
if(process.argv.includes('--setup-only')){console.log('Historical source-only harness prepared and syntax checked.');process.exit(0);}
const run=(script,args=[],env={})=>execFileSync(process.execPath,[script,...args],{cwd:historical,stdio:'inherit',windowsHide:true,env:{...process.env,...env}});
run('investigation/scaling/prepare.mjs');
execFileSync(process.execPath,['--import','tsx','investigation/scaling/fixtures.ts'],{cwd:historical,stdio:'inherit',windowsHide:true});
run('investigation/scaling/round2/prepare.mjs');run('investigation/scaling/round2/build.mjs');
run('investigation/scaling/round2/batch.mjs',['after:256:128','after:512:128'],{SCALING_R2_OUT:'accepted',SCALING_R2_STEPS:'2048',SCALING_R2_SESSION_REPEATS:'1',SCALING_REPEATS:'1',SCALING_R3_FIXTURE_ONLY:'1'});
mkdirSync(accepted,{recursive:true});for(const n of [256,512])for(const suffix of ['.json','.damgoodmaps.json'])copyFileSync(resolve(historical,`investigation/scaling/local/round2/accepted/after-${n}-1-128`+suffix),resolve(accepted,`after-${n}-1-128`+suffix));
console.log('Both 2,048-edit gesture-only source fixtures regenerated; no old cold-open loop was run.');
