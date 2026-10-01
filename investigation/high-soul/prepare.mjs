import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const dir=resolve('investigation/high-soul/local');
mkdirSync(dir+'/site',{recursive:true});
execFileSync('git',['archive','--output='+dir+'/base.tar','8c975822','src','public','index.html','real-places','package.json','tsconfig.json','vite.config.ts','vitest.config.ts','playwright.config.ts','tests','tools']);
execFileSync('tar',['-xf',dir+'/base.tar','-C',dir+'/site']);
// These are unmodified snapshots; Vite applies proposal.mjs in memory only.
console.log(dir+'/site');

mkdirSync(dir+'/references',{recursive:true});
for(const name of ['README.md','pair-map.timber','pair-1-game.jpg','pair-2-game.jpg',...Array.from({length:11},(_,i)=>'ref-'+(i+1)+'.jpg')])writeFileSync(dir+'/references/'+name,execFileSync('git',['show','dd7bcbece5ea6e54cf47c0da3fdf86a3a3111849:docs/look/reference/timberborn/'+name],{maxBuffer:50e6}));
for(const name of ['package.json','package-lock.json'])writeFileSync(dir+'/'+name,execFileSync('git',['show','8c975822:'+name]));
