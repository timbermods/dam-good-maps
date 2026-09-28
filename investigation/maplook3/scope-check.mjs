// Run the requested dev...HEAD check without moving dev in another checked-out worktree.
// The throwaway repository has no checkout and reads existing objects through alternates.
// Both refs are resolved from the real repository immediately before checking.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const folder = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(folder, '../..');
const git = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
if (git(['branch', '--show-current']) !== 'investigation/maplook3') throw new Error('Wrong branch');
const base = git(['rev-parse', 'origin/dev']);
const head = git(['rev-parse', 'HEAD']);
const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
const scratch = resolve(folder, 'local/scope.git');
mkdirSync(scratch, { recursive: true });
git(['init', '--bare', '--quiet', scratch]);
writeFileSync(resolve(scratch, 'objects/info/alternates'), resolve(common, 'objects').replaceAll('\\', '/') + '\n');
git(['update-ref', 'refs/heads/dev', base], scratch);
git(['update-ref', 'refs/heads/investigation/maplook3', head], scratch);
git(['symbolic-ref', 'HEAD', 'refs/heads/investigation/maplook3'], scratch);
const names = git(['diff', '--name-only', 'dev...HEAD'], scratch).split('\n').filter(Boolean);
if (!names.length || names.some(n => !n.startsWith('investigation/maplook3/'))) throw new Error('Out-of-scope diff:\n' + names.join('\n'));
// Also check the actual worktree against the fetched remote branch directly.
if (names.join('\n') !== git(['diff', '--name-only', 'origin/dev...HEAD'])) throw new Error('Scope comparisons disagree');
const report = { command: 'git diff --name-only dev...HEAD', base, head, changedFiles: names.length, files: names, passed: true };
writeFileSync(resolve(folder, 'local/scope.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
