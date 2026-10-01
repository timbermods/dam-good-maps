import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
process.chdir(here);
const refs = {
  terrain: '24b88b9b5fc31a76bac010f20a3cedec4788a461',
  dev: '8f3e7e27ea5ef1533b441cf96fc0674c8016da5c', performance: 'bb3d2183e1338a10f5b79b36c6ae5fd3b973ed99', rift:'9cc478ec22d99fd80dc93bd18747b3e10a5324aa'
};
const pinned = {};
for (const [name, ref] of Object.entries(refs)) {
  const sha = execFileSync('git', ['rev-parse', ref], {encoding:'utf8'}).trim();
  pinned[name] = sha;
  const dest = `${here}local/${name}`;
  mkdirSync(dest, {recursive:true});
  const paths = name === 'dev' ? ['src', 'investigation/erode', 'investigation/block-tool', 'investigation/rift', 'investigation/high-soul'] : name === 'performance' ? ['investigation/performance'] : [];
  execFileSync('git', ['-C', fileURLToPath(new URL('../../',import.meta.url)), 'archive', '--format=tar', `--output=${here}local/${name}.tar`, sha, ...paths]);
  execFileSync('tar', ['-xf', `${here}local/${name}.tar`, '-C', dest]);
}
writeFileSync('local/sources.json', JSON.stringify(pinned,null,2));
console.log(pinned);
