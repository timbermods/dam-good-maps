const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let transform = require('./transform.cjs');
const mode = process.env.RV_MODE || 'dev';
if (mode === 'round1') {
  const source = require('node:child_process').execFileSync('git', ['show', 'f7051698:investigation/river-valley-sheets/transform.cjs'], {encoding:'utf8'});
  const legacy = {exports:{}}; new Function('module','exports',source)(legacy,legacy.exports); transform = legacy.exports;
}
require.extensions['.ts'] = (mod, file) => {
  let source = fs.readFileSync(file, 'utf8');
  if (['after','round1','round2'].includes(mode)) source = transform(file, source);
  mod._compile(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true }, fileName: file }).outputText, file);
};
require(path.resolve(__dirname, process.argv[2] || 'batch.ts'));
