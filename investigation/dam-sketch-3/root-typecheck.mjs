// Run the repository's unchanged tsconfig against dependencies kept inside local/.
import ts from './node_modules/typescript/lib/typescript.js';
import {resolve,join} from 'node:path';
const folder=import.meta.dirname,root=resolve(folder,'../..'),deps=join(folder,'local/product-deps/node_modules');
const redirect=p=>p.replaceAll('\\','/').startsWith(join(root,'node_modules').replaceAll('\\','/')+'/')?join(deps,p.slice(join(root,'node_modules').length+1)):p.replaceAll('\\','/')===join(root,'node_modules').replaceAll('\\','/')?deps:p;
const config=ts.readConfigFile(join(root,'tsconfig.json'),ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
const host=ts.createCompilerHost(parsed.options);
for(const name of ['readFile','fileExists','directoryExists','getDirectories','realpath']){const original=host[name]?.bind(host);if(original)host[name]=(p,...args)=>original(redirect(p),...args);}
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames,parsed.options,host));
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));process.exitCode=1;}else console.log('Root tsconfig.json: passed (dependencies in investigation local/).');
