import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
for(const script of ['capture-stage1.mjs','capture-stage2.mjs','capture-stage3.mjs','capture-stage4.mjs','verify.mjs']){
  const result=spawnSync(process.execPath,[script,...process.argv.slice(2)],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
