import ts from 'typescript';
import { resolve } from 'node:path';
import { root, files, candidate } from './adoption.mjs';
const configPath = resolve(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const host = ts.createCompilerHost(parsed.options);
const original = host.readFile.bind(host);
host.readFile = path => {
  const file = files.find(f => path.replaceAll('\\', '/') === resolve(root, f).replaceAll('\\', '/'));
  return file ? candidate(file) : original(path);
};
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: p => p, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
console.log(`In-memory proposal typecheck: ${diagnostics.length} diagnostics`);
process.exitCode = diagnostics.length ? 1 : 0;
