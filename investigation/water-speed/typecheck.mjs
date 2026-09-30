import {deps,HERE,ROOT,LOCAL,json} from './common.mjs';
import {resolve,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
const ts=deps('typescript');
const options={strict:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,noEmit:true,skipLibCheck:true};
const program=ts.createProgram([resolve(HERE,'water.ts')],options);
const diags=ts.getPreEmitDiagnostics(program);
json(resolve(LOCAL,'typecheck.json'),{typescript:ts.version,diagnostics:diags.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))});
if(diags.length){console.error(ts.formatDiagnosticsWithColorAndContext(diags,{getCurrentDirectory:()=>ROOT,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));process.exit(1);}
console.log('TypeScript',ts.version,'PASS');
const parsed=ts.parseJsonConfigFileContent(ts.readConfigFile(resolve(ROOT,'tsconfig.json'),ts.sys.readFile).config,ts.sys,ROOT);
const nodeModules=resolve(dirname(deps.resolve('typescript/package.json')),'..');
const fullOptions={...parsed.options,noEmit:true};
const host=ts.createCompilerHost(fullOptions),getSource=host.getSourceFile;
// Present reused dependencies as a virtual root node_modules; no symlink or product edit.
const virtual=resolve(ROOT,'node_modules');
const remap=f=>resolve(f).toLowerCase().startsWith(virtual.toLowerCase()+'\\')?nodeModules+resolve(f).slice(virtual.length):resolve(f).toLowerCase()===virtual.toLowerCase()?nodeModules:f;
for(const key of ['fileExists','readFile','directoryExists','getDirectories']) {const original=host[key];if(original)host[key]=f=>original.call(host,remap(f));}
host.realpath=f=>f;
host.getSourceFile=(fileName,languageVersion,...rest)=>resolve(fileName).toLowerCase()===resolve(ROOT,'src/core/sim/water.ts').toLowerCase()?
  ts.createSourceFile(fileName,readFileSync(resolve(HERE,'water.ts'),'utf8'),languageVersion,true):remap(fileName)!==fileName?
  ts.createSourceFile(fileName,readFileSync(remap(fileName),'utf8'),languageVersion,true):getSource.call(host,fileName,languageVersion,...rest);
const full=ts.createProgram(parsed.fileNames,fullOptions,host),fullDiags=ts.getPreEmitDiagnostics(full);
json(resolve(LOCAL,'typecheck-integration.json'),{typescript:ts.version,files:full.getSourceFiles().length,diagnostics:fullDiags.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))});
if(fullDiags.length){console.error(ts.formatDiagnosticsWithColorAndContext(fullDiags,{getCurrentDirectory:()=>ROOT,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));process.exit(1);}
console.log('Full product TypeScript with virtual substitution PASS');
