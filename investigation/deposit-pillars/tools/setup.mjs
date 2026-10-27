import {cpSync,existsSync,mkdirSync,copyFileSync} from 'node:fs';
const base='investigation/deposit-pillars',dst=`${base}/local/checkout`;
if(existsSync(`${dst}/src`))throw Error('Harness exists; reuse it, or explicitly choose a new local directory.');
mkdirSync(dst,{recursive:true});for(const dir of ['src','tests','tools','rust'])cpSync(dir,`${dst}/${dir}`,{recursive:true});
for(const file of ['rust-toolchain.toml','tsconfig.json','vitest.config.ts','package.json'])copyFileSync(file,`${dst}/${file}`);
mkdirSync(`${dst}/investigation/meander`,{recursive:true});cpSync('investigation/meander/maps',`${dst}/investigation/meander/maps`,{recursive:true});
console.log(`Isolated harness ready: ${dst}. Build baseline and run depositSweep before before applying the patch here.`);
