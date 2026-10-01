// Type-check the investigation and its real product imports using the existing dependency tree.
const path=require('node:path');
const deps=process.env.LAKE_DEPS||path.resolve(__dirname,'../../node_modules');
process.env.NODE_PATH=deps;require('node:module').Module._initPaths();
const ts=require('typescript');
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true,esModuleInterop:true,resolveJsonModule:true,typeRoots:[path.join(deps,'@types')],types:['node'],baseUrl:__dirname,paths:{'fflate':[path.join(deps,'fflate')],'three':[path.join(deps,'@types/three')]}};
const program=ts.createProgram(['prototype.ts','capture.ts','analyze.ts','trace.ts','verify.ts'].map(f=>path.join(__dirname,f)),options);
const errors=ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));
if(errors.length)process.exitCode=1;else console.log('Lake Basin investigation typecheck passed.');
