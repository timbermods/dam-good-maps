import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,symlinkSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),dst=join(root,'investigation/forces-speed/local/adopted');
mkdirSync(dst,{recursive:true});
for(const f of execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).trim().split('\n')){
 if(f.startsWith('investigation/forces-speed/')||(f.startsWith('public/')&&f!=='public/real-places/data/near-grand-canyon-colorado.json.gz')||f.startsWith('out/'))continue;
 const to=join(dst,f);mkdirSync(dirname(to),{recursive:true});writeFileSync(to,readFileSync(join(root,f)));
}
if(!existsSync(join(dst,'node_modules')))symlinkSync(join(root,'node_modules'),join(dst,'node_modules'),'junction');
mkdirSync(join(dst,'investigation/forces-speed'),{recursive:true});
for(const f of ['workload.ts','page.ts'])writeFileSync(join(dst,'investigation/forces-speed',f),readFileSync(join(root,'investigation/forces-speed',f)));
console.log(dst);