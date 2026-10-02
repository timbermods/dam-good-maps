import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,deps,json} from './common.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),m9b=deps(resolve(LOCAL,'m9b.cjs'));
const rows=[];
for(const theme of api.AVAILABLE_THEMES)for(let rep=0;rep<3;rep++){
 const totals={},stack=[];globalThis.__ra={replace(){},enter(name){const token={name,t:performance.now(),child:0};stack.push(token);return token;},leave(token){const ms=performance.now()-token.t;stack.pop();const v=totals[token.name]??={calls:0,total:0,self:0};v.calls++;v.total+=ms;v.self+=ms-token.child;if(stack.length)stack.at(-1).child+=ms;}};
 const t=performance.now();const result=m9b.measureOne(theme,1,256,'',false);globalThis.__ra=null;
 rows.push({theme,rep,ms:performance.now()-t,passed:result.ok,totals});json('profile.json',rows);console.log(theme,rep,rows.at(-1).ms);
}
