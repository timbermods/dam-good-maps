import {readFileSync,readdirSync,writeFileSync}from'node:fs';
import {resolve}from'node:path';
const control=process.argv[2];
const base=resolve('investigation/settings/local/'+(process.argv[3]??'final')+'-'+control);
const repeat=resolve('investigation/settings/local/'+(process.argv[4]??'repeat')+'-'+control);
const checked=[],skipped=[];
for(const name of readdirSync(repeat).filter(n=>n.startsWith(control+'-')&&n.endsWith('.json')&&!n.endsWith('.map.json'))){
 const a=JSON.parse(readFileSync(resolve(base,name))),b=JSON.parse(readFileSync(resolve(repeat,name)));
 if(!a.passed||!b.passed){skipped.push(name);continue;}
 if(JSON.stringify(a.build)!==JSON.stringify(b.build))throw Error('Different generator builds: '+name);
 if(b.deterministic!==true)throw Error('Internal repeat did not match: '+name);
 if(a.hash!==b.hash)throw Error('Non-deterministic output: '+name);
 checked.push(name);
}
const result={checked,skipped};writeFileSync(resolve(repeat,'determinism.json'),JSON.stringify(result,null,2));
console.log(`${control}: ${checked.length} identical map SHA-256s; ${skipped.length} failed maps excluded (empty output is not evidence).`);
