// Run from the repository root; copies and results remain gitignored (D195).
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
mkdirSync('investigation/ts7/local',{recursive:true});
for(const [name,reads] of [['oracle',2],['batch',4]]) {
  const file=resolve(`tools/${name}.ts`);
  let source=readFileSync(file,'utf8');
  if((source.match(/performance\.now\(\)/g)??[]).length!==reads) throw Error(`Unexpected timer reads in ${name}`);
  const hash=createHash('sha256').update(source).digest('hex');
  source=source.replaceAll('performance.now()','0');
  source=source.replace(/from ("|')(\.[^"']+)\1/g,(_,q,s)=>`from ${q}${pathToFileURL(resolve(dirname(file),s)).href}${q}`);
  source=source.replace('const log = (s: string) => {', `const log = (s: string) => {\n  if (s.startsWith('- time per map:')) return;\n  s = s.replace(/; generate median .*$/, '').replace(/, 0 ms/, '').replace(/ \\(median 0 ms, max 0 ms\\)/, '');`);
  writeFileSync(`investigation/ts7/local/${name}-correctness.ts`,`// Local correctness-only copy of tools/${name}.ts (sha256 ${hash}); timer reads disabled, timing text omitted.\n`+source);
  console.log(`${name}: ${reads} reporting-only timer reads disabled; original sha256 ${hash}`);
}
