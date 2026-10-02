// One-shot publication of this user's already authorized branch and existing draft PR.
// Never merge, approve, mark ready, create another PR, or push any other ref.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {ROOT,HERE,LOCAL} from './common.mjs';
const branch='investigation/parallel-water';
const capture=(command,args)=>execFileSync(command,args,{cwd:ROOT,encoding:'utf8'}).trim();
const run=(command,args)=>execFileSync(command,args,{cwd:ROOT,stdio:'inherit'});
if(capture('git',['branch','--show-current'])!==branch)throw Error('Publication branch guard failed');
const changed=capture('git',['diff','--name-only','6c29b7e5','--']).split('\n').filter(Boolean);
if(changed.some(path=>!path.startsWith('investigation/parallel-water/')))throw Error('Product file changed');
run(process.execPath,[resolve(HERE,'typecheck.mjs')]);
run('git',['diff','--check']);
run('git',['add','--','investigation/parallel-water']);
const staged=capture('git',['diff','--cached','--name-only']).split('\n').filter(Boolean);
if(staged.some(path=>!path.startsWith('investigation/parallel-water/')))throw Error('Unexpected staged file');
run('git',['diff','--cached','--check']);
if(staged.length)run('git',['commit','-m','Complete parallel-water verification and adoption evidence']);
run('git',['diff','--check','HEAD^','HEAD']);
run('git',['push','--no-follow-tags','origin','HEAD:refs/heads/'+branch]);
run('gh',['pr','edit','130','--body-file',resolve(LOCAL,'pr-body-final.md')]);
console.log('Published final evidence to the authorized branch and existing draft PR #130');
