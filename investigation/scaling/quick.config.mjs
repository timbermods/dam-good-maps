import base from '../../vitest.config.ts';
import {adopt,dir,root} from './proposal.mjs';
import {resolve} from 'node:path';
export default {...base,root,cacheDir:resolve(dir,'local/vite-cache'),plugins:[{name:'scaling-adoption',enforce:'pre',transform(code,id){const file=id.replaceAll('\\','/').slice(root.replaceAll('\\','/').length+1);const next=adopt(file,code);return next===code?undefined:{code:next,map:null};}}],test:{...base.test,maxWorkers:2,cacheDir:resolve(dir,'local/vitest-cache')}};
