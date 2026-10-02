import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {deps,HERE} from './common.mjs';
const ts=deps('typescript');
export const native=new Set(['sin','cos','tan','asin','acos','atan','atan2','exp','expm1','log','log2','log10','log1p','pow','hypot','sqrt','cbrt','sinh','cosh','tanh','asinh','acosh','atanh']);
export const supported=new Set(['sin','cos','tan','asin','acos','exp','atan','atan2','log','log2','pow','hypot','sqrt','tanh','asinh']);
export function transform(source,file,modulePath){
  const pageScriptTool=/^(?:.*[\\/])?tools[\\/]/.test(file);
  const compressionPath=modulePath.includes('/math/portable')?modulePath.replace('/math/portable','/format/compression'):modulePath.replace(/portable(\.ts)?$/,'compression$1');
  if(file.replaceAll('\\','/').endsWith('/src/core/doc/document.ts')||file==='src/core/doc/document.ts'){
    if(!source.includes('gunzipSync, gzipSync, strFromU8, strToU8'))throw Error('Project compressor import changed: audit it');
    source=`import {gzipSync} from ${JSON.stringify(compressionPath)};\n`+source.replace('gunzipSync, gzipSync, strFromU8, strToU8','gunzipSync, strFromU8, strToU8');
  }
  if(file.replaceAll('\\','/').endsWith('/src/core/format/timber.ts')||file==='src/core/format/timber.ts'){
    if(!source.includes('unzipSync, zipSync, type Zippable'))throw Error('Timber compressor import changed: audit it');
    source=`import {zipSync} from ${JSON.stringify(compressionPath)};\n`+source.replace('unzipSync, zipSync, type Zippable','unzipSync, type Zippable');
  }
  if(file.replaceAll('\\','/').includes('/tools/')||file.startsWith('tools/')){
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),edits=[],compressors=[];
    for(const n of ast.statements)if(ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='fflate'&&ts.isNamedImports(n.importClause?.namedBindings)){
      const bindings=n.importClause.namedBindings.elements,keep=[];
      for(const e of bindings){const name=(e.propertyName??e.name).text;if(['gzipSync','zipSync','zlibSync'].includes(name))compressors.push(e.getText(ast));else keep.push(e.getText(ast));}
      if(keep.length!==bindings.length)edits.push({start:n.getStart(ast),end:n.end,text:keep.length?`import {${keep.join(', ')}} from 'fflate';`:''});
    }
    for(const e of edits.reverse())source=source.slice(0,e.start)+e.text+source.slice(e.end);
    if(compressors.length)source=`import {${compressors.join(', ')}} from ${JSON.stringify(compressionPath)};\n`+source;
  }
  // Carry the determinism investigation's persisted-stage and equal-key fixes on M9b too.
  if(file.replaceAll('\\','/').endsWith('/src/worker/session.ts')||file==='src/worker/session.ts')source=source.replace('steps: r.steps, reason: "done"','steps: r.total, reason: "done"');
  if(file.replaceAll('\\','/').endsWith('/src/core/gen/weir.ts')||file==='src/core/gen/weir.ts')source=source.replace('(a.id < c.id ? -1 : 1)','(a.id < c.id ? -1 : a.id > c.id ? 1 : 0)');
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const hasNative=s=>/\bMath\.(?:sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log2|log10|log1p|pow|hypot|sqrt|cbrt|sinh|cosh|tanh|asinh|acosh|atanh)\b|(?<!\/)\*\*(?!\/)/.test(s);
  const scripts=new Map(),evaluations=new Set(),ranges=[];
  if(pageScriptTool){
    const declarations=n=>{if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&(ts.isStringLiteral(n.initializer)||ts.isNoSubstitutionTemplateLiteral(n.initializer)||ts.isTemplateExpression(n.initializer))&&hasNative(n.initializer.getText(sf)))scripts.set(n.name.text,n.initializer);ts.forEachChild(n,declarations);};declarations(sf);
    const calls=n=>{if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='evaluate'&&n.arguments[0]){const a=n.arguments[0],text=a.getText(sf),names=[...scripts.keys()].filter(name=>new RegExp('\\b'+name+'\\b').test(text));if(hasNative(text)||names.length){evaluations.add(n);ranges.push([a.getStart(sf),a.end],...names.map(name=>{const s=scripts.get(name);return [s.getStart(sf),s.end];}));}}ts.forEachChild(n,calls);};calls(sf);
  }
  const embedded=n=>ranges.some(([a,b])=>n.getStart(sf)>=a&&n.end<=b);
  function scriptCode(code){const ast=ts.createSourceFile(file+'#page.js',code,ts.ScriptTarget.Latest,true);function emit(n){if(ts.isPropertyAccessExpression(n)&&n.expression.getText(ast)==='Math'&&native.has(n.name.text)){if(!supported.has(n.name.text))throw Error('Unimplemented embedded operation '+n.name.text);return '__portableMath.'+n.name.text;}if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AsteriskAsteriskToken)return `__portableMath.pow(${emit(n.left)}, ${emit(n.right)})`;let text='',at=n.getStart(ast);for(const c of n.getChildren(ast)){if(c.getStart(ast)<at)continue;text+=code.slice(at,c.getStart(ast))+emit(c);at=c.end;}return text+code.slice(at,n.end);}return code.slice(0,ast.getStart(ast))+emit(ast);}
  let changed=false,pageChanged=false;
  function render(n){
    if(evaluations.has(n)){pageChanged=true;return `portableEvaluate(${render(n.expression.expression)}, ${n.arguments.map(render).join(', ')})`;}
    if(embedded(n)&&(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&hasNative(n.text)){pageChanged=true;return JSON.stringify(scriptCode(n.text));}
    if(embedded(n)&&[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(n.kind)&&hasNative(n.getText(sf))){pageChanged=true;return n.getText(sf).replace(/\bMath\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|pow|hypot|sqrt|tanh|asinh)\b/g,'__portableMath.$1');}
    if(ts.isPropertyAccessExpression(n)&&n.expression.getText(sf)==='Math'&&native.has(n.name.text)){
      if(!supported.has(n.name.text))throw Error('Unimplemented portable operation '+n.getText(sf)+' in '+file);
      changed=true;return `__portableMath.${n.name.text}`;
    }
    if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AsteriskAsteriskToken){changed=true;return `__portableMath.pow(${render(n.left)}, ${render(n.right)})`;}
    if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AsteriskAsteriskEqualsToken){throw Error('Power assignment needs single-evaluation rewrite: '+file);}
    let out='',at=n.getStart(sf);
    for(const c of n.getChildren(sf)){if(c.getStart(sf)<at)continue;out+=source.slice(at,c.getStart(sf))+render(c);at=c.end;}
    return out+source.slice(at,n.end);
  }
  const result=source.slice(0,sf.getStart(sf))+render(sf);
  const pageImport=evaluations.size?"import {portableEvaluate} from './portable-page';\n":'';
  return changed?pageImport+`import * as __portableMath from ${JSON.stringify(modulePath)};\n`+result:pageChanged?pageImport+result:source;
}
export function adoptionPlugin(){return {name:'portable-math-overlay',setup(build){
  build.onLoad({filter:/src[\\/].*\.[jt]sx?$/},({path:file})=>{
    const source=readFileSync(file,'utf8');
    // Existing dev portable module is replaced too; its native sqrt fallback is forbidden.
    const contents=file.replaceAll('\\','/').endsWith('/src/core/math/portable.ts')?readFileSync(resolve(HERE,'portable.ts'),'utf8'):transform(source,file,resolve(HERE,'portable.ts').replaceAll('\\','/'));
    return {contents,loader:file.endsWith('.tsx')?'tsx':'ts',resolveDir:file.replaceAll('\\','/').endsWith('/src/core/math/portable.ts')?HERE:resolve(file,'..')};
  });
}};}
