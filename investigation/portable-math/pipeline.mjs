// Finish the dependent proofs after the complete final-candidate generation manifest exists.
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {readFileSync,existsSync} from 'node:fs';
import {HERE,LOCAL,hash} from './common.mjs';
const fingerprint=hash(readFileSync(resolve(LOCAL,'build.json')));
console.log('Waiting for complete final generation fingerprint',fingerprint);
for(;;){const file=resolve(LOCAL,'generation-summary.json');if(existsSync(file)){
  const s=JSON.parse(readFileSync(file));if(s.fingerprint===fingerprint&&s.complete===840){if(s.complete!==840||s.total!==840||s.errors.length||s.mismatches.length)throw Error('Generation proof incomplete or failed');break;}
}await new Promise(r=>setTimeout(r,1000));}
async function run(file,args=[]){console.log('STAGE',file,...args);await new Promise((done,reject)=>{const child=spawn(process.execPath,[resolve(HERE,file),...args],{cwd:HERE,env:process.env,stdio:'inherit'});child.on('error',reject);child.on('exit',c=>c===0?done():reject(Error(file+' exited '+c)));});}
await run('water.mjs',['--maps','--resume','--reuse']);
await run('water.mjs',['--weather','--resume']);
console.log('Dependent map-water and full Weather proofs complete');
