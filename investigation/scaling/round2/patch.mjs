import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {files as round1} from '../proposal.mjs';
import {root,dir,proposed,overlay,helpers} from './overlay.mjs';
helpers();
function walk(p){return readdirSync(p,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(resolve(p,f.name)):[resolve(p,f.name)]);}
const added=walk(proposed).map(p=>p.slice(proposed.length+1).replaceAll('\\','/'));
const files=[...new Set([...round1,'src/core/doc/session.ts','src/core/doc/document.ts','src/core/features/build.ts','src/core/features/edits.ts',...added])];
const out=[];
for(const file of files){const source=resolve(root,file),a=resolve(dir,'../local/round2/patch-original',file),b=resolve(dir,'../local/round2/patch-candidate',file);
 mkdirSync(resolve(a,'..'),{recursive:true});mkdirSync(resolve(b,'..'),{recursive:true});
 let original='';if(existsSync(source))original=readFileSync(source,'utf8').replaceAll('\r\n','\n');
 const proposal=existsSync(resolve(proposed,file))?readFileSync(resolve(proposed,file),'utf8'):original;
 const changed=overlay(file,proposal).replaceAll('\r\n','\n');if(changed===original)continue;
 writeFileSync(a,original);writeFileSync(b,changed);
 const result=spawnSync('git',['diff','--no-index','--no-prefix','--unified=2','--',existsSync(source)?a:'NUL',b],{encoding:'utf8'});if(result.status!==1)throw Error(result.stderr||result.error);
 out.push(result.stdout.split('\n').map(l=>l===' '?'':l.startsWith('diff --git ')?`diff --git a/${file} b/${file}`:l.startsWith('--- ')?existsSync(source)?'--- a/'+file:'--- /dev/null':l.startsWith('+++ ')?'+++ b/'+file:l).join('\n'));
}
writeFileSync(resolve(dir,'../adoption.patch'),out.join(''));console.log('Combined round 1 + round 2 patch generated against pinned feature/forces; product untouched.');
