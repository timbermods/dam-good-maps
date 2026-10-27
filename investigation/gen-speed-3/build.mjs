import { build } from 'esbuild';
import ts from 'typescript';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const dir = resolve(root, 'investigation/gen-speed-3');
const variant = process.argv[2] ?? 'baseline';
const profile = process.argv.includes('--profile');
mkdirSync(resolve(dir, 'local'), { recursive: true });
const plugin = {
  name: 'investigation-overlay',
  setup(b) {
    b.onLoad({ filter: /src[\\/]core[\\/].*\.ts$/ }, args => {
      const path = relative(root, args.path).replaceAll('\\', '/');
      const overlay = resolve(dir, 'candidate', path);
      let text = readFileSync(variant === 'candidate' && existsSync(overlay) ? overlay : args.path, 'utf8');
      if (profile && !/Wasm\.ts$/.test(path)) {
        // Do not time tiny grid/RNG/portable helpers: their clock overhead overwhelms them.
        const selected = /\/core\/(gen|land|analysis|resources|validate)\//.test(path) || /\/features\/build\.ts$|\/sim\/(prefill|preview|drought|soil|moisture|rustWater)\.ts$/.test(path);
        if (selected) {
          const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
          const edits = [];
          function visit(n) {
            if (ts.isFunctionDeclaration(n) && n.body && n.name && n.body.end - n.body.pos > 450 && !n.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
              const name = `${path.slice(9)}:${n.name.text}`;
              edits.push([n.body.getStart(ast) + 1, `const __traceToken = globalThis.__genTrace.enter(${JSON.stringify(name)}); try {`]);
              edits.push([n.body.end - 1, `} finally { globalThis.__genTrace.leave(__traceToken); }`]);
            }
            ts.forEachChild(n, visit);
          }
          visit(ast);
          for (const [at, s] of edits.sort((a,b)=>b[0]-a[0])) text = text.slice(0,at) + s + text.slice(at);
        }
        const crates = {
          'src/core/sim/rustWater.ts': 'water',
          'src/core/analysis/rust/bridge.ts': 'analysis',
          'src/core/validate/rust.ts': 'checks',
          'src/core/forces/rust/bridge.ts': 'forces',
        };
        if (crates[path]) text = text.replace('new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as Exports', `globalThis.__genTrace.wasm(${JSON.stringify(crates[path])}, new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports) as unknown as Exports`);
        if (path === 'src/core/gen/generate.ts') text = text.replace('opts.onAttempt?.({ attempt, passed: a.passed, result: a.result });', 'globalThis.__genTrace.attempt(a, attempt); opts.onAttempt?.({ attempt, passed: a.passed, result: a.result });');
      }
      return { contents: text, loader: 'ts', resolveDir: resolve(root, path, '..') };
    });
  },
};
await build({ entryPoints: [resolve(dir, 'entry.ts')], outfile: resolve(dir, `local/${variant}${profile ? '-profile' : ''}.mjs`), bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true, plugins: [plugin] });
console.log(`Built ${variant}${profile ? '-profile' : ''}; embedded Wasm unchanged unless candidate overlay supplies it.`);
