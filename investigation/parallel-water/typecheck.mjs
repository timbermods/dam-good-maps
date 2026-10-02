import {resolve,dirname} from 'node:path';
import {HERE,deps} from './common.mjs';
const ts=deps('typescript');
const fflate=resolve(dirname(deps.resolve('fflate/package.json')),'lib/index.d.ts');
const program=ts.createProgram(['water.ts','runtime.ts','helper.ts','coordinator.ts','weather-coordinator.ts','generation-coordinator.ts','curve-probe.ts','runtime-smoke.ts','fallback-coordinator.ts','failure-coordinator.ts','fault-helper.ts'].map(f=>resolve(HERE,f)),{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  strict:true,noEmit:true,skipLibCheck:true,resolveJsonModule:true,esModuleInterop:true,
  lib:['lib.es2022.d.ts','lib.dom.d.ts'],baseUrl:HERE,paths:{fflate:[fflate]},
});
const errors=ts.getPreEmitDiagnostics(program);
if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>HERE,getNewLine:()=>"\n"}));process.exitCode=1;}
else console.log('TypeScript: candidate, runtime, helpers and imported core pass');
