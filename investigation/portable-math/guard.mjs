import {readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deps,ROOT,HERE,files,json} from './common.mjs';
import {native,transform} from './transform.mjs';
import {threeRoot} from './three-common.mjs';
import {transformThree} from './three-plugin.mjs';
import {operationTool} from './scope.mjs';
const ts=deps('typescript');
// An allowlist closes aliases, destructuring, computed access and Math namespace escapes.
const exact=new Set(['abs','ceil','floor','round','trunc','min','max','sign','imul','clz32','fround','PI','E','LN2','LN10','LOG2E','LOG10E','SQRT1_2','SQRT2']);
const browserDependencies=new Set(['preact','preact/hooks','preact/jsx-runtime','@preact/signals','@preact/signals-core','comlink','three','fflate']);
const toolDependencies=new Set(['fflate','vite','@playwright/test','node:crypto','node:fs','node:fs/promises','node:child_process','node:path','node:url','node:os','node:zlib','node:worker_threads','node:net','node:perf_hooks','node:buffer','node:http','node:module']);
function auditedImport(file,name){return name.startsWith('.')||name.startsWith('/src/')||(file==='tools/shader-sources.ts'&&name==='three')||(file.startsWith('src/core/')?name==='fflate':file.startsWith('src/')?browserDependencies.has(name):file.startsWith('tools/')?toolDependencies.has(name):true);}
// These calls mint a new host input (recorded before replay) or affect only presentation.
// Their enclosing AST statements are explicit exceptions, not file-wide randomness exemptions.
const randomInputs={
  'src/editor/Editor.tsx':/^(paintSeed = useRef\(|paintSeed\.current = )/,
  'src/editor/brushes.ts':/^seed: \(Math\.random\(\) \* 0x7fffffff\) \| 0$/,
  'src/ui/View3D.tsx':/^legendId = useMemo\(/,
  'src/editor/juice.ts':/^src\.start\(t, Math\.random\(\) \* 0\.5\);$/,
  'src/editor/juice/engine.ts':/^(offset: Math\.random\(\) \* 0\.8|rate: \(l\.rate \?\? 1\) \* \(0\.97 \+ Math\.random\(\) \* 0\.06\))$/,
};
function inputRandom(p,file,sf){
  if(file==='src/editor/juice/palette.ts'&&ts.isBindingElement(p.parent)&&p.parent.name.getText(sf)==='random'&&p.parent.initializer===p){
    let n=p.parent;while(n.parent&&!ts.isFunctionDeclaration(n))n=n.parent;
    return ts.isFunctionDeclaration(n)&&n.name?.text==='recipe';
  }
  if(!ts.isCallExpression(p.parent)||!randomInputs[file])return false;
  let n=p.parent;while(n.parent&&!ts.isVariableDeclaration(n)&&!ts.isExpressionStatement(n)&&!ts.isPropertyAssignment(n))n=n.parent;
  return randomInputs[file].test(n.getText(sf));
}
export function violations(source,file){
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),found=[];
  const add=n=>found.push({file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,start:n.getStart(sf),text:n.getText(sf).replace(/\s+/g,' ').slice(0,160)});
  function visit(n){
    if(ts.isStringLiteral(n)&&n.text==='Math')add(n);
    if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n)){
      const raw=n.getText(sf),start=n.getStart(sf);
      const push=(m)=>{const at=start+m.index;found.push({file,line:sf.getLineAndCharacterOfPosition(at).line+1,start:at,text:raw.slice(m.index,m.index+160).replace(/\s+/g,' ')});};
      for(const m of raw.matchAll(/\bMath\s*\.\s*([A-Za-z_$][\w$]*)/g))if(!exact.has(m[1]))push(m);
      for(const m of raw.matchAll(/\bMath\s*\[/g))push(m);
      if(n.text?.includes('**')){const script=ts.createSourceFile(file+'#embedded.ts',n.text,ts.ScriptTarget.Latest,true);const visitScript=s=>{if(ts.isBinaryExpression(s)&&[ts.SyntaxKind.AsteriskAsteriskToken,ts.SyntaxKind.AsteriskAsteriskEqualsToken].includes(s.operatorToken.kind)&&s.left.getWidth(script)&&s.right.getWidth(script))add(n);ts.forEachChild(s,visitScript);};visitScript(script);}
    }
    if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&!n.isTypeOnly&&!n.importClause?.isTypeOnly&&!auditedImport(file,n.moduleSpecifier.text))add(n);
    if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword){const a=n.arguments[0],driver=file==='tools/determinism/run.ts'&&a?.getText(sf)==='pathToFileURL(join(process.env.DGM_DET_PLAYWRIGHT, "index.mjs")).href';if(!driver&&(!a||!ts.isStringLiteral(a)||!auditedImport(file,a.text)||a.text==='fflate'))add(n);}
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='require'){const a=n.arguments[0];if(!a||!ts.isStringLiteral(a)||a.text==='fflate'||!auditedImport(file,a.text))add(n);}
    if(ts.isIdentifier(n)&&n.text==='eval'&&file!=='tools/portable-page.ts')add(n.parent);
    if(ts.isIdentifier(n)&&n.text==='WebAssembly'&&file!=='src/core/math/portable.ts')add(n.parent);
    if(ts.isImportDeclaration(n)&&['mathjs','gl-matrix','numeric','decimal.js','@stdlib/math'].some(m=>n.moduleSpecifier.text===m||n.moduleSpecifier.text.startsWith(m+'/')))add(n);
    if(ts.isImportDeclaration(n)&&file.startsWith('src/core/')&&!n.importClause?.isTypeOnly&&!n.moduleSpecifier.text.startsWith('.')&&n.moduleSpecifier.text!=='fflate')add(n);
    if(ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='fflate'&&file!=='src/core/format/compression.ts'){
      const bindings=n.importClause?.namedBindings;
      if(!bindings||!ts.isNamedImports(bindings))add(n);
      else for(const e of bindings.elements)if(!e.isTypeOnly&&!['gunzipSync','unzipSync','unzlibSync','strFromU8','strToU8'].includes((e.propertyName??e.name).text))add(e);
    }
    if(ts.isIdentifier(n)&&n.text==='Math'){
      const p=n.parent;
      const direct=ts.isPropertyAccessExpression(p)&&p.expression===n;
      const random=direct&&p.name.text==='random'&&inputRandom(p,file,sf);
      if(!(direct&&exact.has(p.name.text))&&!random)add(p);
    }
    if(ts.isPropertyAccessExpression(n)&&n.name.text==='Math')add(n);
    if(ts.isElementAccessExpression(n)&&ts.isStringLiteral(n.argumentExpression)&&n.argumentExpression.text==='Math')add(n);
    if((ts.isCallExpression(n)||ts.isNewExpression(n))&&['eval','Function'].includes(n.expression.getText(sf)))add(n);
    if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.AsteriskAsteriskToken,ts.SyntaxKind.AsteriskAsteriskEqualsToken].includes(n.operatorToken.kind))add(n);
    ts.forEachChild(n,visit);
  }visit(sf);return found;
}
export function runGuard(){
  const adopted=process.argv.includes('--adoption'),bad=[],inventory=[];
  const lock=JSON.parse(readFileSync(resolve(ROOT,'package-lock.json'),'utf8'));
  const version=deps('fflate/package.json').version;
  if(lock.packages['node_modules/fflate'].version!==version)throw Error('Product fflate changed; audit and pin the actual version before continuing');
  const dependency=readFileSync(resolve(deps.resolve('fflate/package.json'),'../esm/browser.js'),'utf8');
  const dependencyBad=violations(dependency,'dependency/fflate').filter(v=>dependency.slice(v.start,v.start+'Math.log(dat.length)'.length)!=='Math.log(dat.length)');
  bad.push(...dependencyBad);
  const three=threeRoot();
  for(const f of [...files(resolve(three,'src')),...files(resolve(three,'build'))]){const text=readFileSync(f,'utf8');const candidate=transformThree(text,f,resolve(ROOT,'src/core/math/portable.ts'));bad.push(...violations(candidate,'dependency/three').filter(v=>!v.text.startsWith('Math.random')));}
  if(!adopted&&!readFileSync(resolve(ROOT,'vite.config.ts'),'utf8').includes('portableThree('))throw Error('Vite must apply portableThree to the camera/ray dependency');
  for(const f of [...files(resolve(ROOT,'src')),...files(resolve(ROOT,'tools')).filter(f=>operationTool(relative(ROOT,f).replaceAll('\\','/')))]){const name=relative(ROOT,f).replaceAll('\\','/'),s=readFileSync(f,'utf8');
    inventory.push(...violations(s,name));
    const candidate=!adopted?s:name==='src/core/math/portable.ts'?readFileSync(resolve(HERE,'portable.ts'),'utf8'):transform(s,name,'./portable');
    bad.push(...violations(adopted?candidate:s,name));
  }
  if(adopted)bad.push(...violations(readFileSync(resolve(HERE,'portable.ts'),'utf8'),'src/core/math/portable.ts'));
  json(adopted?'guard-adoption.json':'guard-baseline.json',{inventory,dependency:{fflate:version,nativeMemoryHeuristic:'Math.log(dat.length)',reachable:false,policy:'All sync compressors must use the explicit-mem adapter'},violations:bad});
  console.log(`${inventory.length} native/engine-dependent references; ${bad.length} guard violations after ${adopted?'adoption':'baseline'}`);
  if(bad.length){console.error(JSON.stringify(bad.slice(0,8),null,2));process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runGuard();
