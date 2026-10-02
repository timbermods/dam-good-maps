// Strict-check the adoption in memory, including its generator call sites. No product writes.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const runtime=process.env.ISLANDS_RUNTIME||path.join(__dirname,'local/runtime/node_modules');
const ts=require(path.join(runtime,'typescript'));
const generator=path.join(root,'src/core/gen/generate.ts');
const moduleFile=path.join(root,'src/core/land/archipelago.ts');
const virtual=new Map([
  [generator,require('./overlay.cjs').overlay(fs.readFileSync(generator,'utf8'),true)],
  [moduleFile,fs.readFileSync(path.join(__dirname,'archipelago.ts'),'utf8').replaceAll('../../src/core/','../')],
]);
const options={noEmit:true,strict:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,
  module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  esModuleInterop:true,resolveJsonModule:true,lib:['lib.es2022.d.ts','lib.dom.d.ts'],
  types:['node'],typeRoots:[path.join(runtime,'@types')],
  paths:{fflate:[path.join(runtime,'fflate')]}};
const host=ts.createCompilerHost(options);
const read=host.readFile.bind(host),exists=host.fileExists.bind(host);
host.readFile=file=>virtual.get(path.normalize(file))??read(file);
host.fileExists=file=>virtual.has(path.normalize(file))||exists(file);
const program=ts.createProgram([generator,...['verify.ts','cycles.ts','fallback.ts'].map(f=>path.join(__dirname,f))],options,host);
const errors=ts.getPreEmitDiagnostics(program);
if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));process.exitCode=1;}
else console.log('Strict TypeScript: adoption generator, archipelago, verification and cycles pass');
