import ts from 'typescript';
import { resolve } from 'node:path';
import { root, files, candidate, adopt } from './adoption.mjs';
import { existsSync, readFileSync } from 'node:fs';
const configPath = resolve(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const host = ts.createCompilerHost(parsed.options);
const original = host.readFile.bind(host);
const integrated = process.argv.includes('--integrated');
const overlay = path => integrated && path.replaceAll('\\', '/').startsWith(root.replaceAll('\\', '/') + '/src/render3d/') ? resolve(root, 'investigation/performance/local/high-source', path.slice(root.length + 1)) : undefined;
const oldExists = host.fileExists.bind(host), oldDir = host.directoryExists.bind(host);
host.fileExists = path => (overlay(path) && existsSync(overlay(path))) || oldExists(path);
host.directoryExists = path => (overlay(path + '/') && existsSync(overlay(path + '/'))) || oldDir(path);
host.readFile = path => {
  const file = files.find(f => path.replaceAll('\\', '/') === resolve(root, f).replaceAll('\\', '/'));
  if (overlay(path) && existsSync(overlay(path))) {
    const text = readFileSync(overlay(path), 'utf8');
    return file ? adopt(file, text) : text;
  }
  return file ? candidate(file) : original(path);
};
// The fixture uses the pinned High palette; force-base palette-specific tests target a different
// look revision. Check the integrated product source, retaining full base checks without this flag.
const program = ts.createProgram(integrated ? parsed.fileNames.filter(p => p.replaceAll('\\', '/').includes('/src/')) : parsed.fileNames, parsed.options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: p => p, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
console.log(`In-memory proposal typecheck: ${diagnostics.length} diagnostics`);
process.exitCode = diagnostics.length ? 1 : 0;
