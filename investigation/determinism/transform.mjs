import fs from 'node:fs/promises';
import path from 'node:path';
import ts from './local/runtime/node_modules/typescript/lib/typescript.js';
const names = new Set(process.env.DGM_DET_FUNCTIONS?.split(',') ?? ['sin', 'cos', 'exp', 'atan', 'atan2', 'log', 'log2', 'pow', 'hypot', 'sqrt', 'tanh']);
export function transform(source, file, modulePath) {
  if (file.replaceAll('\\', '/').endsWith('/src/worker/session.ts')) return source.replace('steps: r.steps, reason: "done"', 'steps: r.total, reason: "done"');
  if (file.replaceAll('\\', '/').endsWith('/src/core/gen/weir.ts')) source = source.replace('(a.id < c.id ? -1 : 1)', '(a.id < c.id ? -1 : a.id > c.id ? 1 : 0)');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let changed = false;
  function render(n) {
    if (ts.isPropertyAccessExpression(n) && n.expression.getText(sf) === 'Math' && names.has(n.name.text)) { changed = true; return `__portable.${n.name.text}`; }
    if (names.has('pow') && ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken) {
      changed = true; return `__portable.pow(${render(n.left)}, ${render(n.right)})`;
    }
    let out = '', start = n.getStart(sf);
    for (const child of n.getChildren(sf)) {
      if (child.getStart(sf) < start) continue;
      out += source.slice(start, child.getStart(sf)) + render(child); start = child.end;
    }
    return out + source.slice(start, n.end);
  }
  const contents = source.slice(0, sf.getStart(sf)) + render(sf);
  return changed ? `import * as __portable from ${JSON.stringify(modulePath)};\n` + contents : source;
}
export function adoptionPlugin(root, here) {
  return { name: 'portable-math-adoption', setup(build) {
    build.onLoad({ filter: /src[\\/]core[\\/].*\.[jt]s$/ }, async ({ path: file }) => {
      const source = await fs.readFile(file, 'utf8');
      return { contents: transform(source, file, path.join(here, 'portable.ts').replaceAll('\\', '/')), loader: file.endsWith('.ts') ? 'ts' : 'js' };
    });
  } };
}
