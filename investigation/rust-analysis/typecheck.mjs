import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import {HERE,LOCAL,deps} from './common.mjs';
const ts=deps('typescript');
const files=['bridge.ts','native-water.ts'].map(n=>resolve(HERE,n));
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true,noImplicitOverride:true,lib:['lib.es2022.d.ts','lib.dom.d.ts']};
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(files,options));
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>HERE,getNewLine:()=> '\n'}));process.exitCode=1;}
else{writeFileSync(resolve(LOCAL,'typecheck.json'),JSON.stringify({status:'pass',files,typescript:ts.version})+'\n');console.log('Adapter types pass',ts.version);}
