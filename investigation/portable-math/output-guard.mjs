// Check the actual minified product, including worker and dependency chunks.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deps,LOCAL,json,hash} from './common.mjs';
const ts=deps('typescript');
const exact=new Set(['abs','ceil','floor','round','trunc','min','max','sign','imul','clz32','fround','PI','E','LN2','LN10','LOG2E','LOG10E','SQRT1_2','SQRT2','random']);
export function outputViolations(source,file){
 const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),bad=[],exceptions=[];
 function memoryFallback(n){
  const call=n.parent;if(!ts.isCallExpression(call)||call.arguments.length!==1||!ts.isPropertyAccessExpression(call.arguments[0])||call.arguments[0].name.text!=='length')return false;
  let p=call;
  while(p.parent&&!ts.isFunctionLike(p)){
   p=p.parent;
   if(ts.isConditionalExpression(p)&&/^[\w$]+\.mem\s*==\s*null$/.test(p.condition.getText(sf))&&p.whenTrue.getText(sf).includes('Math.ceil(Math.max(8,Math.min(13,Math.log(')&&/12\s*\+\s*[\w$]+\.mem/.test(p.whenFalse.getText(sf)))return true;
  }
  return false;
 }
 const reject=n=>bad.push({file,text:n.getText(sf).slice(0,160)});
 function visit(n){
  if(ts.isIdentifier(n)&&n.text==='Math'){
   const p=n.parent;
   if(ts.isPropertyAccessExpression(p)&&p.expression===n){
    if(!exact.has(p.name.text)){
     if(p.name.text==='log'&&memoryFallback(p))exceptions.push({kind:'unreachable pinned fflate memory fallback',text:p.getText(sf)});
     else reject(p);
    }
   }else reject(p);
  }
  if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.AsteriskAsteriskToken,ts.SyntaxKind.AsteriskAsteriskEqualsToken].includes(n.operatorToken.kind)){
   if(n.operatorToken.kind===ts.SyntaxKind.AsteriskAsteriskToken&&n.left.getText(sf)==='2'&&n.right.getText(sf)==='53')exceptions.push({kind:'exact Comlink host request-ID constant',text:n.getText(sf)});
   else reject(n);
  }
  ts.forEachChild(n,visit);
 }visit(sf);return {bad,exceptions};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const i=process.argv.indexOf('--dir'),dir=resolve(LOCAL,i<0?'dist':process.argv[i+1]);
 if(!dir.startsWith(LOCAL+'/')&&!dir.startsWith(LOCAL+'\\'))throw Error('Output must be inside ignored local/');
 const recursive=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?recursive(resolve(d,e.name)):[resolve(d,e.name)]);
 const rows=recursive(dir).filter(f=>f.endsWith('.js')).map(file=>{const source=readFileSync(file,'utf8');return {file:file.slice(dir.length+1),sha256:hash(source),...outputViolations(source,file.slice(dir.length+1))};});
 const bad=rows.flatMap(r=>r.bad);json('output-guard.json',{rows,remaining:bad});console.log(rows.length,'production chunks;',bad.length,'native maths violations');if(bad.length)throw Error(JSON.stringify(bad));
}
