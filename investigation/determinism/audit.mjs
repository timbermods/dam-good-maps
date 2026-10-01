import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from './local/runtime/node_modules/typescript/lib/typescript.js';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
async function files(dir) { const out = []; for (const d of await fs.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, d.name); if (d.isDirectory()) out.push(...await files(p)); else if (/\.[jt]sx?$/.test(p)) out.push(p); } return out.sort(); }
const approximate = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'pow', 'hypot', 'sqrt', 'cbrt', 'sinh', 'cosh', 'tanh']);
const rows = [];
for (const file of [...await files(path.join(root, 'src/core')), ...await files(path.join(root, 'src/worker')), ...await files(path.join(root, 'src/editor'))]) {
  const source = await fs.readFile(file, 'utf8'), sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const add = (kind, n) => rows.push({ file: path.relative(root, file).replaceAll('\\', '/'), line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, kind, code: n.getText(sf).replace(/\s+/g, ' ').slice(0, 900).trimEnd() });
  function visit(n) {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      if (ts.isPropertyAccessExpression(e)) {
        const owner = e.expression.getText(sf), name = e.name.text;
        if (owner === 'Math' && approximate.has(name)) add('approximate Math.' + name, n);
        else if (owner === 'Math' && name === 'random' || owner === 'crypto' && /random/.test(name)) add('unseeded randomness', n);
        else if (['Date', 'performance'].includes(owner)) add('time', n);
        else if (['sort', 'toSorted', 'localeCompare', 'reduce', 'reduceRight'].includes(name)) add(name, n);
        else if (owner === 'Object' && ['keys', 'values', 'entries'].includes(name)) add('object iteration', n);
        else if (['toFixed', 'toPrecision', 'toExponential', 'toLocaleString'].includes(name)) add('number formatting', n);
      }
    } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken) add('approximate exponentiation', n);
    else if (ts.isNewExpression(n) && ['Date', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Intl.Collator'].includes(n.expression.getText(sf))) add('new ' + n.expression.getText(sf), n);
    else if (ts.isForInStatement(n) || ts.isForOfStatement(n)) add('iteration', n);
    ts.forEachChild(n, visit);
  }
  visit(sf);
}
await fs.mkdir(path.join(here, 'local'), { recursive: true });
await fs.writeFile(path.join(here, 'local/audit.json'), JSON.stringify(rows, null, 2));
await fs.writeFile(path.join(here, 'AUDIT.tsv'), 'file\tline\tcategory\texpression\n' + rows.map(r => `${r.file}\t${r.line}\t${r.kind}\t${r.code}`).join('\n') + '\n');
console.log(JSON.stringify({ sites: rows.length, approximate: rows.filter(r => r.kind.startsWith('approximate')).length, categories: Object.fromEntries([...new Set(rows.map(r => r.kind))].map(k => [k, rows.filter(r => r.kind === k).length])) }));
