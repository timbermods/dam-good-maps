import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,deps,arg,hash,json} from './common.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),run=await api.bridge(readFileSync(resolve(LOCAL,'forces.wasm'))),rows=[];
function diff(a,b,path=''){if(Object.is(a,b))return null;if(!a||!b||typeof a!=='object'||typeof b!=='object')return {path,a,b};if(Object.keys(a).sort().join('|')!==Object.keys(b).sort().join('|'))return {path,keysA:Object.keys(a),keysB:Object.keys(b)};for(const k of Object.keys(a)){const d=diff(a[k],b[k],path+'.'+k);if(d)return d;}return null;}
for(const verb of arg('verbs',arg('verb','craterize')).split(','))for(const size of arg('sizes','128,256,512').split(',').map(Number))for(let k=Number(arg('start','0'));k<Number(arg('start','0'))+Number(arg('count','6'));k++){
 const j=(process.argv.includes('--random')?api.randomJob:api.job)(verb,size,k),input=api.encode(j),expected=api.encode(api.referenceWithRecord(j)),actual=run(input);
 if(!Buffer.from(expected).equals(Buffer.from(actual))){writeFileSync(resolve(LOCAL,'expected.bin'),expected);writeFileSync(resolve(LOCAL,'actual.bin'),actual);writeFileSync(resolve(LOCAL,'failure-input.bin'),input);console.log({verb,size,k,diff:diff(api.decode(expected),api.decode(actual))});throw Error('Identity mismatch');}
 writeFileSync(resolve(LOCAL,'input.bin'),input);execFileSync(resolve(LOCAL,'target/release/forces-batch.exe'),[resolve(LOCAL,'input.bin'),resolve(LOCAL,'output.bin')]);if(!Buffer.from(expected).equals(readFileSync(resolve(LOCAL,'output.bin'))))throw Error('Native identity');const row={verb,size,k,random:process.argv.includes('--random'),sha256:hash(expected)};rows.push(row);appendFileSync(resolve(LOCAL,'checks-'+arg('name','smoke')+'.jsonl'),JSON.stringify(row)+'\n');if(k%10===0)console.log(verb,size,k,'PASS');
}json('checks-'+arg('name','smoke')+'.json',rows);
