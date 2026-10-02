import fs from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {deps,ROOT,HERE,files} from './common.mjs';
import {transform} from './transform.mjs';
const ts=deps('typescript'),portable=resolve(ROOT,'src/core/math/portable.ts'),compression=resolve(ROOT,'src/core/format/compression.ts');
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true,resolveJsonModule:true,esModuleInterop:true,types:[],lib:['lib.es2022.d.ts','lib.dom.d.ts','lib.webworker.d.ts']};
const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists;
host.fileExists=f=>resolve(f)===portable||resolve(f)===compression||exists(f);
host.readFile=f=>{
  if(resolve(f)===portable)return fs.readFileSync(resolve(HERE,'portable.ts'),'utf8').replace("'../../src/core/math/detmath'","'./detmath'");
  if(resolve(f)===compression)return fs.readFileSync(resolve(HERE,'compression.ts'),'utf8').replace("'./portable'","'../math/portable'");
  const s=read(f);if(s===undefined||!f.replaceAll('\\','/').includes('/src/core/'))return s;
  let module=relative(dirname(f),portable).replaceAll('\\','/').replace(/\.ts$/,'');if(!module.startsWith('.'))module='./'+module;return transform(s,f,module);
};
host.getSourceFile=(f,v)=>{const s=host.readFile(f);return s===undefined?undefined:ts.createSourceFile(f,s,v,true);};
host.resolveModuleNames=(names,file)=>names.map(n=>n==='fflate'?{resolvedFileName:resolve(dirname(deps.resolve('fflate/package.json')),'lib/index.d.ts'),extension:ts.Extension.Dts}:ts.resolveModuleName(n,file,options,host).resolvedModule);
const p=ts.createProgram([...files(resolve(ROOT,'src/core')).filter(f=>f.endsWith('.ts')),portable,compression],options,host),errors=ts.getPreEmitDiagnostics(p);
for(const e of errors)console.error(ts.formatDiagnostic(e,{getCurrentDirectory:()=>ROOT,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
console.log('Portable core TypeScript diagnostics:',errors.length);if(errors.length)process.exitCode=1;
