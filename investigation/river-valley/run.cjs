// Read-only TypeScript loader. Product source is transformed in memory only.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
process.env.NODE_PATH = [path.join(__dirname, 'local/node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const ts = require('typescript');
const mode = process.env.RV_MODE || 'before';
const transform = require('./transform.cjs');
require.extensions['.ts'] = (mod, file) => {
  let source = fs.readFileSync(file, 'utf8');
  if (mode === 'after' || mode === 'shared') source = transform(file, source, {shaping:mode==='after',shared:true});
  const out = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true }, fileName: file });
  mod._compile(out.outputText, file);
  if (file.replaceAll('\\', '/').endsWith('/src/core/gen/generate.ts')) {
    const original = mod.exports.generate;
    mod.exports.generate = (...args) => {
      const r = original(...args);
      if (process.env.RV_CAPTURE) require('./capture.cjs')(r, mode);
      return r;
    };
  }
};
const entry = path.resolve(__dirname, process.argv[2] || '../../investigation/m9b/measures.ts');
process.argv.splice(1, 1);
require(entry);
