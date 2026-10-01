// Read-only TypeScript loader, matching investigation/probe/run.cjs.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
process.env.NODE_PATH = [process.env.DGM_DEPS || path.join(__dirname, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => {
  let source = fs.readFileSync(file, 'utf8');
  if (process.argv.includes('--prototype')) source = require('./prototype.cjs').transform(file, source);
  mod._compile(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true }, fileName: file,
  }).outputText, file);
};
