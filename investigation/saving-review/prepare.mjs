import { mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
export const SOURCE = '32e07fe955ab0f759b5d9d61d9b0b37b83cb4344';
const dir = 'investigation/saving-review';
const local = `${dir}/local`;
// Run from the clone root. All generated files remain under this investigation's ignored local/.
mkdirSync(`${local}/base`, { recursive: true });
writeFileSync(`${local}/source.tar`, execFileSync('git', ['archive', SOURCE, 'src', 'tests', 'tsconfig.json'], { maxBuffer: 64 * 1024 * 1024 }));
execFileSync('tar', ['-xf', `${local}/source.tar`, '-C', `${local}/base`]);
mkdirSync(`${local}/product`, { recursive: true });
cpSync(`${local}/base/src`, `${local}/product/src`, { recursive: true });
for (const owner of ['milestone', 'page']) {
  execFileSync('git', ['apply', '--check', '--directory', `${local}/product`, `${dir}/${owner}.patch`]);
  execFileSync('git', ['apply', '--directory', `${local}/product`, `${dir}/${owner}.patch`]);
}
writeFileSync(`${local}/tsconfig.json`, JSON.stringify({ extends: './base/tsconfig.json', include: ['./product/src'] }, null, 2) + '\n');
console.log(`Prepared original and fixed source under ${resolve(local)}. Product checkout unchanged.`);
