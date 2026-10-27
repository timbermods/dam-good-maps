import ts from 'typescript';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const root = resolve(import.meta.dirname, '../..');
const config = ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const parsed = ts.parseJsonConfigFileContent(config.config,ts.sys,root);
const host = ts.createCompilerHost(parsed.options);
const read = host.readFile.bind(host);
const target = resolve(root,'src/core/gen/generate.ts').replaceAll('\\','/').toLowerCase();
host.readFile = file => file.replaceAll('\\','/').toLowerCase() === target ? readFileSync(resolve(import.meta.dirname,'candidate/src/core/gen/generate.ts'),'utf8') : read(file);
const artifacts = ['entry.ts','pins.ts','verify.config.mts'].map(f=>resolve(import.meta.dirname,f));
const program = ts.createProgram([...parsed.fileNames,...artifacts],parsed.options,host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
  process.exit(1);
}
console.log('Candidate overlay: full project typecheck passed.');
