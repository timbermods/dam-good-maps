// Vite's dev/build transforms cover Three's camera, ray and normalization path too.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(process.env.DGM_DEPS?resolve(process.env.DGM_DEPS,'package.json'):new URL('../../package.json',import.meta.url));
const ts=require('typescript');
const functions=new Set(['sin','cos','tan','asin','acos','atan','atan2','exp','log','log2','pow','hypot','sqrt','tanh','asinh']);
export function transformThree(source,file,module){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 function render(n){
  if(ts.isPropertyAccessExpression(n)&&n.expression.getText(ast)==='Math'&&functions.has(n.name.text))return '__portableMath.'+n.name.text;
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AsteriskAsteriskToken)return `__portableMath.pow(${render(n.left)},${render(n.right)})`;
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AsteriskAsteriskEqualsToken)throw Error('Audit Three power assignment');
  let out='',at=n.getStart(ast);for(const c of n.getChildren(ast)){if(c.getStart(ast)<at)continue;out+=source.slice(at,c.getStart(ast))+render(c);at=c.end;}return out+source.slice(at,n.end);
 }
 const after=source.slice(0,ast.getStart(ast))+render(ast);
 return after===source?source:`import * as __portableMath from ${JSON.stringify(module)};\n`+after;
}
export function portableThree(root=fileURLToPath(new URL('../..',import.meta.url))){
 const module=resolve(root,'src/core/math/portable.ts').replaceAll('\\','/');
 return {name:'portable-three-maths',enforce:'pre',config:()=>({optimizeDeps:{exclude:['three']}}),transform(source,id){
  const file=id.split('?')[0].replaceAll('\\','/');if(!file.includes('/node_modules/three/')||!file.endsWith('.js'))return;
  return {code:transformThree(source,file,module),map:null};
 }};
}
