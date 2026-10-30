// Run the exact proposed Vitest tests in one process when Windows prevents test-worker IPC.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { deepStrictEqual, strictEqual } from 'node:assert';
import ts from 'typescript';
const req = createRequire(resolve('package.json'));
const candidate = !process.argv.includes('--baseline');
process.env.DGM_PAGE_SOURCE_ROOT = candidate ? resolve('investigation/page-hunt/overlay') : process.cwd();
const cases = [];
const code = ts.transpileModule(readFileSync('investigation/page-hunt/overlay/tests/unit/pageHunt.test.ts','utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
runInNewContext(code, {
  process, console, exports: {}, Uint8Array,
  require: id => id === 'vitest' ? {
    test: (name, fn) => cases.push({ name, fn }),
    expect: actual => ({
      toBe: expected => strictEqual(actual, expected),
      toEqual: expected => deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected))),
    }),
  } : req(id),
});
let failed = 0;
for (const {name, fn} of cases) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n${e.message}`); }
}
console.log(`${candidate ? 'Adoption candidate' : 'Unmodified product'}: ${cases.length-failed}/${cases.length} passed`);
process.exitCode = failed ? 1 : 0;
