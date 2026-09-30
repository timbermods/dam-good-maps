import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from './local/runtime/node_modules/typescript/lib/typescript.js';
import { transform } from './transform.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const names = new Set(['sin','cos','tan','asin','acos','atan','atan2','exp','expm1','log','log2','log10','log1p','pow','hypot','sqrt','cbrt','sinh','cosh','tanh','random']);
async function files(dir) { const out = []; for (const d of await fs.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, d.name); if (d.isDirectory()) out.push(...await files(p)); else if (/\.[jt]s$/.test(p)) out.push(p); } return out; }
const violations = [];
for (const file of await files(path.join(root, 'src/core'))) {
  if (file.endsWith(path.join('math', 'portable.ts'))) continue;
  let source = await fs.readFile(file, 'utf8');
  if (process.argv.includes('--adoption')) source = transform(source, file, path.join(here, 'portable.ts'));
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(n) {
    const badCall = ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.expression.getText(sf) === 'Math' && names.has(n.expression.name.text);
    const badPower = ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken;
    if (badCall || badPower) violations.push(`${path.relative(root, file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${n.getText(sf).replace(/\s+/g, ' ').slice(0, 120)}`);
    ts.forEachChild(n, visit);
  }
  visit(sf);
}
for (const v of violations) console.error(v);
console.log(`${violations.length} forbidden approximate/random core operations`);
if (violations.length) process.exitCode = 1;
