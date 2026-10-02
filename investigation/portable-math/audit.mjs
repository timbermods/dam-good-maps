import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {ROOT,HERE,LOCAL,files,json} from './common.mjs';
import {violations} from './guard.mjs';
import {transform} from './transform.mjs';
import {operationTool,presentationTools} from './scope.mjs';
import {threeRoot} from './three-common.mjs';
import {transformThree} from './three-plugin.mjs';
const requireExists=(root,file)=>existsSync(resolve(root,file));
const results={},rows=['revision\tfile\tline\tnative reference\treach'];
for(const [name,root]of [['m9b',ROOT],['dev',resolve(LOCAL,'dev')]]){
  const inventory=[],remaining=[];
  for(const f of [...files(resolve(root,'src')),...files(resolve(root,'tools')).filter(f=>operationTool(relative(root,f).replaceAll('\\','/')))]){const rel=relative(root,f).replaceAll('\\','/'),s=readFileSync(f,'utf8'),hits=violations(s,rel);inventory.push(...hits);
    const candidate=rel==='src/core/math/portable.ts'?readFileSync(resolve(HERE,'portable.ts'),'utf8'):transform(s,rel,'./portable');remaining.push(...violations(candidate,rel));
    for(const hit of hits)rows.push([name,rel,hit.line,hit.text,rel.startsWith('src/core/')?'deterministic core':rel.startsWith('src/editor/')?'gesture/input or presentation':operationTool(rel)?'CLI data/batch':'presentation/worker'].join('\t'));
  }
  for(const rel of presentationTools)if(requireExists(root,rel))rows.push([name,rel,'-', 'excluded presentation probe','image capture / renderer timing; no operation output'].join('\t'));
  results[name]={inventory,remaining};console.log(name,inventory.length,'references',remaining.length,'remaining');
}
const three=threeRoot(),inventory=[],remaining=[];
for(const f of [...files(resolve(three,'src')),...files(resolve(three,'build'))]){const rel=relative(three,f).replaceAll('\\','/'),s=readFileSync(f,'utf8'),hits=violations(s,'dependency/three').filter(v=>!v.text.startsWith('Math.random'));inventory.push(...hits.map(v=>({...v,file:rel})));remaining.push(...violations(transformThree(s,f,'./portable'),'dependency/three').filter(v=>!v.text.startsWith('Math.random')));for(const hit of hits)rows.push(['three@0.186.1',rel,hit.line,hit.text,'upstream camera/ray or renderer'].join('\t'));}
results.three={inventory,remaining};
if(existsSync(resolve(LOCAL,'rust-sources.json'))){
 const studies=JSON.parse(readFileSync(resolve(LOCAL,'rust-sources.json'))).studies,inventory=[],remaining=[];
 for(const [study,s]of Object.entries(studies)){
  for(const hit of s.native){const file='investigation/'+study+'/'+hit.file;inventory.push({...hit,file});rows.push(['rust/'+study,file,hit.line,hit.text.replaceAll('\t',' '),'native/libm lowering; replaced by shared portable.rs'].join('\t'));}
  remaining.push(...s.remaining);
 }
 results.rust={inventory,remaining};
}
writeFileSync(resolve(HERE,'AUDIT.tsv'),rows.join('\n')+'\n');json('audit.json',results);if(Object.values(results).some(r=>r.remaining.length))process.exitCode=1;
