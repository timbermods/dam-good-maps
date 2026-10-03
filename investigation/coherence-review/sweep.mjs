// Mechanical sweep: exports in src/core and src/worker that nothing else references,
// and files nothing imports. Corpus: src, tests, tools, investigation, rust, prototype, spike, configs.
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const exts = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.json', '.html', '.md', '.yml', '.py']);
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'local' || e.name === '.git' || e.name === 'decompiled' || e.name === 'raw') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(e.name))) out.push(p);
  }
  return out;
}
const corpus = [];
for (const d of ['src', 'tests', 'tools', 'investigation', 'rust', 'prototype', 'spike', 'index.html', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'playwright.live.config.ts', 'package.json', '.github']) {
  const p = path.join(root, d);
  if (!fs.existsSync(p)) continue;
  if (fs.statSync(p).isDirectory()) walk(p, corpus); else corpus.push(p);
}
const texts = new Map(corpus.map(f => [f, fs.readFileSync(f, 'utf8')]));
const isTarget = f => /[\\/]src[\\/](core|worker)[\\/]/.test(f) && /\.ts$/.test(f) && !f.endsWith('.d.ts');
const targets = corpus.filter(isTarget);
const rel = f => path.relative(root, f).split(path.sep).join('/');

// 1. exports
const exportRe = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm;
const exportListRe = /^export\s*\{([^}]*)\}\s*;?\s*$/gm;
const deadExports = [];
const internalOnly = [];
const testsOnly = [];
for (const f of targets) {
  const src = texts.get(f);
  const names = new Set();
  let m;
  while ((m = exportRe.exec(src))) names.add(m[1]);
  while ((m = exportListRe.exec(src))) {
    for (const part of m[1].split(',')) {
      const nm = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim();
      if (nm && /^[A-Za-z_$][\w$]*$/.test(nm)) names.add(nm);
    }
  }
  for (const name of names) {
    const re = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g');
    let outside = 0, nonTest = 0;
    const where = [];
    for (const [g, t] of texts) {
      if (g === f) continue;
      const c = (t.match(re) || []).length;
      if (c) {
        outside += c;
        if (!/[\\/]tests[\\/]/.test(g) && !/\.md$/.test(g)) nonTest += c;
        if (where.length < 4) where.push(rel(g));
      }
    }
    const inside = (src.match(re) || []).length;
    if (outside === 0) {
      if (inside <= 1) deadExports.push(rel(f) + ' :: ' + name + '  (no reference anywhere, not even in its own file)');
      else internalOnly.push(rel(f) + ' :: ' + name + '  (used ' + (inside - 1) + 'x only in its own file)');
    } else if (nonTest === 0) {
      testsOnly.push(rel(f) + ' :: ' + name + '  (referenced only by tests/docs: ' + where.join(', ') + ')');
    }
  }
}
// 2. files nothing imports
const deadFiles = [];
for (const f of targets) {
  const base = path.basename(f).replace(/\.ts$/, '').replace(/\./g, '\\.');
  const re = new RegExp('[\'"`][^\'"`\\n]*[\\/]' + base + '(?:\\.(?:ts|js|mjs))?[\'"`]');
  let hits = 0;
  for (const [g, t] of texts) {
    if (g === f) continue;
    if (re.test(t)) hits++;
  }
  if (hits === 0) deadFiles.push(rel(f));
}
console.log('# FILES NOTHING IMPORTS (by path string)\n' + deadFiles.join('\n'));
console.log('\n# EXPORTS WITH NO REFERENCE OUTSIDE THEIR FILE AND NONE INSIDE (' + deadExports.length + ')\n' + deadExports.sort().join('\n'));
console.log('\n# EXPORTS USED ONLY INSIDE THEIR OWN FILE (' + internalOnly.length + ')\n' + internalOnly.sort().join('\n'));
console.log('\n# EXPORTS REFERENCED ONLY BY TESTS OR DOCS (' + testsOnly.length + ')\n' + testsOnly.sort().join('\n'));
