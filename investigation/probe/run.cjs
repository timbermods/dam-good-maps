// Runs a TypeScript entry point in process: each .ts file is transpiled to CommonJS as it is required.
// It resolves this folder's own dependencies for the read-only src/ imports (fflate), so the probe needs
// only `npm --prefix investigation/probe ci` (the same approach as investigation/cycles/run.cjs).
const path = require('node:path');
const fs = require('node:fs');
process.env.NODE_PATH = [path.join(__dirname, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
require('node:module').Module._initPaths();
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true },
    fileName: file,
  });
  // (in a function's scope, so a module's own top-level `module` or `exports` (src/core/sim/rustWater.ts)
  // shadows CommonJS's instead of clashing with it, which made Node read the file as an ES module)
  mod._compile(`(() => {${out.outputText}
})();`, file);
};
const entry = path.resolve(__dirname, process.argv[2]);
process.argv.splice(1, 1);
require(entry);
