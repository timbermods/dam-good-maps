const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const transform = require('./transform.cjs');
require.extensions['.ts'] = (mod, file) => {
  let source = fs.readFileSync(file, 'utf8');
  if (process.env.RV_MODE === 'after') source = transform(file, source);
  mod._compile(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true }, fileName: file }).outputText, file);
};
require(path.resolve(__dirname, process.argv[2] || 'batch.ts'));
