import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
const here=dirname(fileURLToPath(import.meta.url));
const rows=[];
function walk(dir,path='') {
  for(const name of readdirSync(join(dir,path),{withFileTypes:true})) {
    const rel=path?`${path}/${name.name}`:name.name;
    if(name.isDirectory())walk(dir,rel);
    else if(/\.(js|css|html|wasm|gz)$/.test(rel) && !rel.startsWith('real-places/')) {
      const bytes=readFileSync(join(dir,rel)); rows.push({variant:dir.split('dist-').at(-1),file:rel,raw:bytes.length,gzip:gzipSync(bytes).length,brotli:brotliCompressSync(bytes).length});
    }
  }
}
const round2=process.argv.includes('--round2');
for(const v of round2?['round2-before','round2-after']:['dev','before','after'])walk(join(here,'local',`dist-${v}`));
writeFileSync(join(here,round2?'ROUND2-FILES.csv':'FILES.csv'),'variant,file,raw_bytes,gzip_bytes,brotli_bytes\n'+rows.map(r=>Object.values(r).join(',')).join('\n')+'\n');
console.log(`Wrote ${rows.length} rows to FILES.csv`);
