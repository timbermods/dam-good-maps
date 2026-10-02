// Bind the audited product maths inside evaluated page scripts, including preview builds.
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
let compiled:Promise<string>|undefined;
export async function portablePage(source:string):Promise<string>{
  compiled??=(async()=>{
    const entry=fileURLToPath(new URL('../src/core/math/portable.ts',import.meta.url));
    const result=await build({configFile:false,publicDir:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry,name:'__portableMath',formats:['iife']}}});
    const outputs=(Array.isArray(result)?result:[result]).flatMap(r=>'output' in r?r.output:[]);
    const chunk=outputs.find(o=>o.type==='chunk');
    if(!chunk||chunk.type!=='chunk')throw Error('Portable page maths bundle missing');
    return chunk.code;
  })();
  return `(()=>{${await compiled}\n;return (${source});})()`;
}
export async function portableEvaluate<R,A=void>(page:{evaluate:(expression:any,arg?:any)=>Promise<any>},expression:string|((arg:A)=>R|Promise<R>),arg?:A):Promise<R>{
  if(typeof expression==='string')return page.evaluate(await portablePage(expression));
  const code=await portablePage(`(${expression.toString()})`);
  return page.evaluate(({code,arg}:{code:string,arg:unknown})=>(0,eval)(code)(arg),{code,arg});
}
