// Type-check the real headless core with a read-only adoption overlay.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from './local/runtime/node_modules/typescript/lib/typescript.js';
import { transform } from './transform.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const adopted = process.argv.includes('--adoption');
function files(dir) { const out = []; for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, d.name); if (d.isDirectory()) out.push(...files(p)); else if (p.endsWith('.ts')) out.push(p); } return out; }
const portablePath = path.join(root, 'src/core/math/portable.ts');
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts', 'lib.webworker.d.ts'], strict: true, noImplicitOverride: true, noFallthroughCasesInSwitch: true, resolveJsonModule: true, isolatedModules: true, esModuleInterop: true, skipLibCheck: true, allowImportingTsExtensions: false, noEmit: true, types: [] };
const host = ts.createCompilerHost(options), originalRead = host.readFile, originalExists = host.fileExists;
host.fileExists = file => adopted && path.resolve(file) === portablePath || originalExists(file);
host.readFile = file => {
  if (adopted && path.resolve(file) === portablePath) return fs.readFileSync(path.join(here, 'portable.ts'), 'utf8').replace("'../../src/core/math/detmath'", "'./detmath'");
  const source = originalRead(file);
  if (!adopted || source === undefined || !file.replaceAll('\\', '/').includes('/src/core/') || !file.endsWith('.ts')) return source;
  let module = path.relative(path.dirname(file), portablePath).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!module.startsWith('.')) module = './' + module;
  return transform(source, file, module);
};
host.getSourceFile = (file, languageVersion) => { const source = host.readFile(file); return source === undefined ? undefined : ts.createSourceFile(file, source, languageVersion, true); };
host.resolveModuleNames = (names, containingFile) => names.map(name => name === 'fflate' ? { resolvedFileName: path.join(here, 'local/runtime/node_modules/fflate/lib/index.d.ts'), extension: ts.Extension.Dts } : ts.resolveModuleName(name, containingFile, options, host).resolvedModule);
const roots = files(path.join(root, 'src/core')); if (adopted) roots.push(portablePath);
const program = ts.createProgram(roots, options, host), diagnostics = ts.getPreEmitDiagnostics(program);
for (const d of diagnostics) console.error(ts.formatDiagnostic(d, { getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => '\n' }));
console.log(`${adopted ? 'adoption' : 'baseline'} core: ${diagnostics.length} TypeScript diagnostics`);
if (diagnostics.length) process.exitCode = 1;
