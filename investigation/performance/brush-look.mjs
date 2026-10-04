// High is an unreleased comparison fixture; released editor/workers stay at current dev.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),folder=resolve(import.meta.dirname,'local/round3/high-source'),temp=resolve(import.meta.dirname,'local/round3/merge');mkdirSync(temp,{recursive:true});
function git(args){const p=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(p.error||p.status)throw Error(p.error?.message??p.stderr);return p.stdout;}
const high='84fe4d363cabb958429c07c02fc6a25738a360f8',dev=git(['rev-parse','origin/dev']).trim(),base=git(['merge-base',high,dev]).trim();
const paths=[...new Set([...git(['ls-tree','-r','--name-only',high,'--','src/render3d']).trim().split('\n'),...git(['ls-tree','-r','--name-only',dev,'--','src/render3d']).trim().split('\n')])];
const conflicts=[];
for(const file of paths){const current=resolve(root,file),target=resolve(folder,file);mkdirSync(resolve(target,'..'),{recursive:true});
 const highExists=spawnSync('git',['cat-file','-e',high+':'+file],{cwd:root}).status===0;
 if(!highExists){writeFileSync(target,readFileSync(current));continue;}
 const h=git(['show',high+':'+file]);const old=spawnSync('git',['show',base+':'+file],{cwd:root,encoding:'utf8'});
 if(old.status||!existsSync(current)){writeFileSync(target,h);continue;}
 writeFileSync(resolve(temp,'high'),h);writeFileSync(resolve(temp,'base'),old.stdout);writeFileSync(resolve(temp,'dev'),readFileSync(current));
 const merged=spawnSync('git',['merge-file','-p',resolve(temp,'high'),resolve(temp,'base'),resolve(temp,'dev')],{encoding:'utf8'});if(merged.status>127||merged.status<0)throw Error(merged.stderr);
 let text=merged.stdout,count=0;
 text=text.replace(/^<<<<<<<[^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>>[^\n]*\n/gm,(_,h,d)=>{
  count++;if(h.includes('import { effectsFrom')||h.includes('export type Look')||h.includes('this.governor?.hold'))return h+d;
  if(h.includes('const one = oneObject'))return h.replace('g.ok ? [0.7','g.ok === "warn" ? [1.4, 1.1, 0.5] : g.ok ? [0.7');
  if(h.includes('const cost = this.beginCost()'))return h.replace('this.camera()', 'cam').replace('this.camera()', 'cam');
  if(h.includes('this.high?.dispose()'))return '    this.forceFx?.dispose();\n'+h;
  throw Error('Unrecognized High/release conflict');
 });
 if(file.endsWith('/renderer.ts')&&count!==6)throw Error('High/release conflict count changed');
 writeFileSync(target,text);
}
writeFileSync(resolve(import.meta.dirname,'local/round3/high-source.json'),JSON.stringify({high,dev,base,conflicts,entries:paths.map(file=>({file,sha256:createHash('sha256').update(readFileSync(resolve(folder,file))).digest('hex')}))},null,2));console.log({high,dev,base,conflicts});
if(conflicts.length)process.exitCode=2;
